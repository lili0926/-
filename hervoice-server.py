#!/usr/bin/env python3
"""hervoice-lite · 纯 Python stdlib 实现的语气分析服务

录音 → whisper 转写 + 基本声学特征 → LLM 判情感 → 你的回调

依赖: 仅 Python 3 标准库 + curl（系统自带）
配置: 见下 ENV 变量（也可用 .env）
"""

import base64
import html
import io
import json
import math
import os
import re
import struct
import subprocess
import tempfile
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

# ── 配置 ──
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")
WEBHOOK_URL = os.environ.get("HERVOICE_WEBHOOK", "")
DATA_DIR = Path(os.environ.get("HERVOICE_DATA", os.path.join(os.path.dirname(__file__), "hervoice_data")))
EMOTIONS = ["happy", "sad", "angry", "tired", "tender", "excited", "anxious", "neutral"]

# ── HTML 前端 ──
PAGE = """<!doctype html>
<html lang=zh>
<head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1,user-scalable=no">
<title>her voice</title>
<style>
:root{--bg:#faf7f2;--fg:#3a3532;--accent:#c96f5e;--soft:#e8ded2}
@media(prefers-color-scheme:dark){:root{--bg:#1c1a18;--fg:#e8e2da;--accent:#d98873;--soft:#3a342e}}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font-family:Georgia,'Songti SC',serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px}
h1{font-size:1.3rem;font-weight:400;letter-spacing:.15em}
#btn{width:120px;height:120px;border-radius:50%;border:2px solid var(--accent);background:transparent;color:var(--accent);font-size:1rem;font-family:inherit;transition:all .2s;touch-action:none;-webkit-user-select:none;user-select:none}
#btn.rec{background:var(--accent);color:var(--bg);transform:scale(1.08);box-shadow:0 0 0 12px color-mix(in srgb,var(--accent) 18%,transparent)}
#out{max-width:420px;width:100%;display:flex;flex-direction:column;gap:10px}
.card{background:var(--soft);border-radius:14px;padding:14px 16px;font-size:.92rem;line-height:1.55}
.emo{color:var(--accent);font-size:.8rem;letter-spacing:.08em}
#tip{font-size:.78rem;opacity:.55;letter-spacing:.05em}
</style></head><body>
<h1>her voice 🎙</h1>
<button id=btn>按住说话</button>
<div id=tip>说出来，让它听见你的语气</div>
<div id=out></div>
<script>
const btn=document.getElementById('btn'),out=document.getElementById('out'),tip=document.getElementById('tip');
let mr,chunks=[];
async function start(){
 try{const s=await navigator.mediaDevices.getUserMedia({audio:true});
 chunks=[];mr=new MediaRecorder(s);mr.ondataavailable=e=>chunks.push(e.data);
 mr.onstop=send;mr.start();btn.classList.add('rec');btn.textContent='松开发送';}
 catch(e){tip.textContent='需要麦克风权限';}
}
function stop(){if(mr&&mr.state!=='inactive'){mr.stop();mr.stream.getTracks().forEach(t=>t.stop());}
 btn.classList.remove('rec');btn.textContent='按住说话';}
async function send(){
 const blob=new Blob(chunks,{type:mr.mimeType||'audio/webm'});
 if(blob.size<1000){tip.textContent='太短了，再说一次';return;}
 tip.textContent='分析中…';
 const fd=new FormData();fd.append('file',blob,'voice.webm');
 try{const r=await fetch('/api/voice/upload',{method:'POST',body:fd});
 const d=await r.json();
 if(d.error){tip.textContent='出错了: '+d.error;return;}
 const c=document.createElement('div');c.className='card';
 c.innerHTML='<div class=emo>'+d.emotion+' · '+(d.hint||'')+'</div><div>'+d.text+'</div>';
 out.prepend(c);tip.textContent='听到了 ♡';}
 catch(e){tip.textContent='网络出错，再试一次';}
}
btn.addEventListener('pointerdown',e=>{e.preventDefault();start();});
btn.addEventListener('pointerup',stop);btn.addEventListener('pointercancel',stop);
btn.addEventListener('pointerleave',()=>{if(mr&&mr.state==='recording')stop();});
</script></body></html>"""

def pcm_from_wav(data):
    """从 WAV 文件提取 PCM 数据"""
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        return None, "not a WAV file"
    fmt_found = False
    channels = 1
    sample_rate = 16000
    sample_width = 2
    pos = 12
    while pos < len(data) - 8:
        chunk_id = data[pos:pos+4]
        chunk_size = struct.unpack('<I', data[pos+4:pos+8])[0]
        if chunk_id == b'fmt ':
            fmt = data[pos+8:pos+8+16]
            channels = struct.unpack('<H', fmt[2:4])[0]
            sample_rate = struct.unpack('<I', fmt[4:8])[0]
            sample_width = struct.unpack('<H', fmt[14:16])[0] // 8
            fmt_found = True
        elif chunk_id == b'data':
            if not fmt_found:
                return None, "fmt chunk not found before data"
            raw = data[pos+8:pos+8+chunk_size]
            if sample_width == 2 and channels == 1:
                return (struct.unpack('<' + 'h' * (len(raw)//2), raw), sample_rate), None
            elif sample_width == 2 and channels > 1:
                samples = struct.unpack('<' + 'h' * (len(raw)//2), raw)
                return (samples[0::channels], sample_rate), None
            elif sample_width == 1:
                samples = struct.unpack('<' + 'B' * len(raw), raw)
                return (tuple(s - 128 for s in samples), sample_rate), None
            else:
                return None, f"unsupport sample_width={sample_width}"
        pos += 8 + chunk_size
    return None, "no data chunk"

def acoustic_features(pcm, sr):
    """纯 Python 声学特征提取（替代 librosa）"""
    if isinstance(pcm, tuple):
        pcm, sr = pcm
    n = len(pcm)
    if n == 0:
        return {"duration_s": 0}
    dur = n / sr if sr else 0
    # RMS 能量
    sq = sum(x*x for x in pcm) / n
    rms = math.sqrt(sq) if sq > 0 else 0
    max_amp = max(abs(x) for x in pcm) if pcm else 1
    # 归一化能量 (0-1)
    energy_norm = rms / 32768.0 if max_amp > 0 else 0
    # 静音比例（振幅 < 最大值的 15%）
    threshold = max_amp * 0.15 if max_amp > 0 else 1
    silent_count = sum(1 for x in pcm if abs(x) < threshold)
    pause_ratio = silent_count / n if n > 0 else 0
    # 过零率（粗略的"语速"感）
    zcr = sum(1 for i in range(1, n) if (pcm[i] >= 0) != (pcm[i-1] >= 0)) / n if n > 0 else 0
    # 简单音高估计（自相关）
    pitch_mean = 0
    pitch_var = 0
    # 只对有声段做自相关
    voiced = [abs(x) for x in pcm if abs(x) > threshold]
    if len(voiced) > sr // 10:  # 至少 100ms 有声
        best_periods = []
        for start in range(0, min(n, sr * 3) - sr // 10, sr // 10):
            segment = pcm[start:start + sr // 10]
            if max(abs(x) for x in segment) < threshold:
                continue
            best_corr = 0
            best_period = 0
            for lag in range(int(sr/500), int(sr/60)):  # 60-500 Hz
                if start + lag + len(segment) > n:
                    break
                corr = sum(segment[j] * pcm[start+lag+j] for j in range(len(segment)))
                if corr > best_corr:
                    best_corr = corr
                    best_period = lag
            if best_period > 0:
                best_periods.append(best_period)
        if best_periods:
            periods = best_periods
            pitch_mean = sr / (sum(periods)/len(periods)) if periods else 0
            if len(periods) > 1:
                pitch_var = math.sqrt(sum((p - (sum(periods)/len(periods)))**2 for p in periods) / len(periods))
    return {
        "duration_s": round(dur, 1),
        "energy_mean": round(energy_norm, 4),
        "energy_var": round(energy_norm * 0.3, 4),
        "pause_ratio": round(pause_ratio, 2),
        "pitch_mean_hz": round(pitch_mean, 1),
        "pitch_var": round(pitch_var, 1),
        "zcr": round(zcr, 4),
    }

def whisper_transcribe(audio_data):
    """调用 Groq Whisper API"""
    if not GROQ_API_KEY:
        return None, "GROQ_API_KEY 未设置"
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_data)
        tmppath = f.name
    try:
        r = subprocess.run([
            "curl", "-s", "-m", "60",
            "https://api.groq.com/openai/v1/audio/transcriptions",
            "-H", f"Authorization: Bearer {GROQ_API_KEY}",
            "-F", f"file=@{tmppath}",
            "-F", "model=whisper-large-v3",
            "-F", "language=zh"
        ], capture_output=True, text=True, timeout=70)
        try:
            d = json.loads(r.stdout)
            return d.get("text", "").strip(), None
        except (json.JSONDecodeError, KeyError):
            return None, r.stdout[:200]
    finally:
        os.unlink(tmppath)

def judge_emotion(text, feats):
    """LLM 综合判情感"""
    if not LLM_API_KEY:
        return {"emotion": "neutral", "confidence": 0.5, "hint": "LLM 未配置"}
    prompt = (
        f"分析一段语音的情感。\n说话内容:「{text}」\n"
        f"声学特征: {json.dumps(feats, ensure_ascii=False)}"
        f"(pitch高+波动大=激动; energy低+pause多=低落/疲惫; pitch上扬短句=撒娇可能)\n"
        f"综合'说了什么'和'怎么说的'，从{EMOTIONS}中选1个最贴切的，"
        f"只输出JSON: {{\"emotion\":\"...\",\"confidence\":0.0到1.0,\"hint\":\"一句话描述此刻状态\"}}"
    )
    body = json.dumps({
        "model": LLM_MODEL, "max_tokens": 200,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions", data=body,
        headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = json.loads(r.read())["choices"][0]["message"]["content"].strip()
        s, e = raw.find("{"), raw.rfind("}")
        return json.loads(raw[s:e+1])
    except Exception:
        return {"emotion": "neutral", "confidence": 0.0, "hint": "LLM 分析失败"}

# ── HTTP 处理器 ──
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            self._html(200, PAGE)
        elif parsed.path == "/api/voice/recent":
            self._json(self._recent())
        else:
            self._html(404, "<h1>404</h1>")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/voice/upload":
            self._handle_upload()
        else:
            self._json({"error": "not found"}, 404)

    def _recent(self):
        logfile = DATA_DIR / "voice_logs.jsonl"
        if not logfile.exists():
            return []
        lines = logfile.read_text().splitlines()
        return [json.loads(l) for l in lines[-10:]]

    def _handle_upload(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        # parse multipart
        ct = self.headers.get("Content-Type", "")
        m = re.search(r'boundary=(.+)', ct)
        if not m:
            return self._json({"error": "no boundary"}, 400)
        boundary = m.group(1).strip().strip('"')
        parts = body.split(b'--' + boundary.encode())
        audio_data = None
        for part in parts:
            if b'filename="voice.webm"' in part or b'filename=' in part:
                hdr_end = part.find(b'\r\n\r\n')
                if hdr_end > 0:
                    audio_data = part[hdr_end+4:].rstrip(b'\r\n--')
                    break
        if not audio_data or len(audio_data) < 100:
            return self._json({"error": "no valid audio data"}, 400)

        # whisper
        text, err = whisper_transcribe(audio_data)
        if text is None:
            return self._json({"error": f"whisper: {err}"}, 502)

        # acoustic features
        feats = {"duration_s": round(len(audio_data) / 16000 / 2, 1) if audio_data else 0}
        # try WAV parsing
        pcm, perr = pcm_from_wav(audio_data)
        if pcm:
            feats = acoustic_features(pcm, pcm[1] if isinstance(pcm, tuple) else 16000)

        # emotion
        emo = judge_emotion(text, feats)

        entry = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "text": text,
            "emotion": emo.get("emotion", "neutral"),
            "confidence": emo.get("confidence", 0),
            "hint": emo.get("hint", ""),
            "features": feats
        }
        with (DATA_DIR / "voice_logs.jsonl").open("a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # async webhook
        if WEBHOOK_URL:
            threading.Thread(target=self._fire_webhook, args=(entry,), daemon=True).start()

        self._json({"text": text, "emotion": emo.get("emotion", "neutral"),
                     "confidence": emo.get("confidence", 0), "hint": emo.get("hint", "")})

    def _fire_webhook(self, entry):
        try:
            body = json.dumps(entry, ensure_ascii=False).encode()
            urllib.request.urlopen(WEBHOOK_URL, data=body,
                                   headers={"Content-Type": "application/json"}, timeout=15)
        except Exception:
            pass

    def _json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _html(self, code, text):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"🎙 hervoice-lite → http://0.0.0.0:{port}")
    print(f"   GROQ_API_KEY: {'已设置' if GROQ_API_KEY else '⚠️ 未设置'}")
    print(f"   LLM_API_KEY:  {'已设置' if LLM_API_KEY else '⚠️ 未设置'}")
    print(f"   数据目录: {DATA_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n⏹  hervoice 已停止")
        server.server_close()

if __name__ == "__main__":
    import sys
    main()
