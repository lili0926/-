#!/usr/bin/env python3
"""Eventide 生理状态服务 — 为 AI 伴侣接入身体周期"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ── 把 Eventide 源码加入路径 ──
EVENTIDE_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eventide-tmp", "src")
sys.path.insert(0, EVENTIDE_SRC)
from eventide import EventideRuntime

# ── 状态文件 ──
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eventide_state.json")
runtime = EventideRuntime()

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return runtime.load_state(json.load(f))
    return None

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(runtime.dump_state(state), f, ensure_ascii=False, indent=2)

# ── 阶段元信息 ──
PHASE_EMOJI = {
    "stable": "🌊", "accumulation": "🌊", "preheat": "🔥",
    "heat": "💥", "ebb": "🌙", "recovery": "🌿"
}
PHASE_COLOR = {
    "stable": "#6b9b8c", "accumulation": "#7ba9c4", "preheat": "#d4946b",
    "heat": "#c45b5b", "ebb": "#8b6fa8", "recovery": "#6ba87a"
}
PHASE_LABEL = {
    "stable": "平稳期", "accumulation": "蓄积期", "preheat": "预兆期",
    "heat": "易感期", "ebb": "退潮期", "recovery": "恢复期"
}
PHASE_LIST = json.dumps(list(PHASE_LABEL.keys()), ensure_ascii=False)

# ── HTML 读取 ──
HTML_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eventide.html")

def read_html():
    if os.path.exists(HTML_FILE):
        with open(HTML_FILE, encoding="utf-8") as f:
            return f.read()
    return build_html()

def build_html():
    """如果 eventide.html 不存在就生成一个"""
    colors = json.dumps(PHASE_COLOR, ensure_ascii=False)
    labels = json.dumps(PHASE_LABEL, ensure_ascii=False)
    emoji = json.dumps(PHASE_EMOJI, ensure_ascii=False)
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eventide · 生理状态</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0e0c13;color:#d9d0d0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px;min-height:100vh}}
.container{{max-width:720px;margin:0 auto}}
h1{{font-size:18px;font-weight:500;margin-bottom:20px;opacity:.7;letter-spacing:1px}}
h1 span{{opacity:.4;font-size:13px;margin-left:8px}}
.card{{background:rgba(255,255,255,.04);border-radius:14px;padding:20px;margin-bottom:16px;border:1px solid rgba(255,255,255,.06)}}
.row{{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:14px}}
.row:last-child{{border:none}}
.label{{opacity:.5}}
.val{{font-weight:500;font-variant-numeric:tabular-nums}}
.phase-badge{{display:inline-block;padding:4px 14px;border-radius:20px;font-size:14px;font-weight:600}}
.progress{{height:6px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:8px;overflow:hidden}}
.progress-fill{{height:100%;border-radius:3px;transition:width .5s}}
.state-box{{background:rgba(0,0,0,.3);border-radius:10px;padding:16px;font-size:13px;line-height:1.8;white-space:pre-wrap;color:#b8b0c8;max-height:300px;overflow-y:auto;font-family:'Courier New',monospace}}
.actions{{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}}
.btn{{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:#d9d0d0;padding:10px 20px;border-radius:10px;cursor:pointer;font-size:13px;transition:all .2s}}
.btn:hover{{background:rgba(255,255,255,.14)}}
.btn.primary{{background:#7c5cbf;border-color:#7c5cbf}}
.btn.primary:hover{{background:#9069d4}}
.btn.warn{{background:#c45b5b;border-color:#c45b5b}}
.btn.warn:hover{{background:#d96b6b}}
.btn:disabled{{opacity:.3;cursor:not-allowed}}
.tag{{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;margin:2px}}
.settle-section{{margin-top:12px}}
.settle-section textarea{{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;color:#d9d0d0;font-size:13px;min-height:80px;resize:vertical;font-family:inherit}}
.settle-section .hint{{font-size:11px;opacity:.4;margin:6px 0}}
.runtime-info{{font-size:11px;opacity:.3;text-align:center;margin-top:30px;padding:10px}}
</style></head>
<body>
<div class="container">
<h1>🌙 Eventide <span>生理状态面板</span></h1>
<div id="app"></div>
</div>
<script>
const PHASE_LABEL = {labels};
const PHASE_EMOJI = {emoji};
const PHASE_COLORS = {colors};
let _state = null;
async function load(){{
  try{{
    const r = await fetch('/api/state');
    _state = await r.json();
    render();
  }}catch(e){{document.getElementById('app').innerHTML='<p style=opacity:.5>无法连接 Eventide 服务</p>'}}
}}
function pct(v){{ return Math.round(v / _state.maxVal * 100) }}
function render(){{
  const s = _state;
  const c = PHASE_COLORS[s.phase]||'#666';
  document.getElementById('app').innerHTML=`
    <div class="card" style="text-align:center">
      <div style="font-size:36px;margin-bottom:6px">${{PHASE_EMOJI[s.phase]||'🌊'}}</div>
      <div class="phase-badge" style="background:${{c}}22;color:${{c}}">${{PHASE_LABEL[s.phase]||s.phase}}</div>
      <div style="font-size:12px;opacity:.4;margin-top:10px">周期第 ${{Math.round((s.cycle_day||0) % 28 + 1)}}/28 天</div>
    </div>
    <div class="card">
      <div style="font-size:12px;opacity:.5;margin-bottom:12px">身体数值</div>
      ${{[
        ['heat','热度','🌡️'],['pressure','压抑感','💨'],['control','控制力','🎯'],
        ['sensitivity','敏感度','🫀'],['reserve','蓄积感','📦'],['possessiveness','占有欲','🔒'],['fatigue','疲惫感','💤']
      ].map(v=>s[v[0]]!=null?`
        <div class="row"><span><span class="label">${{v[2]}} ${{v[1]}}</span></span><span class="val">${{s[v[0]]}} <span style="opacity:.3;font-size:11px">/ ${{s.maxVal}}</span></span></div>
        <div class="progress"><div class="progress-fill" style="width:${{pct(v[0])}}%;background:${{c}}"></div></div>
      `:'').join('')}}
    </div>
    <div class="card">
      <div style="font-size:12px;opacity:.5;margin-bottom:8px">当前事件</div>
      ${{(s.active_events||[]).length?s.active_events.map((e,i)=>`<span class="tag" style="background:${{c}}22;color:${{c}}">${{e}}</span>`).join(''):'<span style="opacity:.3;font-size:13px">无活跃事件</span>'}}
    </div>
    <div class="card">
      <div style="font-size:12px;opacity:.5;margin-bottom:8px">状态提示词</div>
      <div class="state-box">${{s.state_card||'(无)'}}</div>
    </div>
    <div class="card">
      <div class="actions">
        <button class="btn primary" onclick="tick()">⏱ 推进时间 (+2h)</button>
        <button class="btn" onclick="tick(12)">⏱ 推进 (+12h)</button>
      </div>
      <div class="settle-section">
        <div class="hint">结算 — 描述最近一次亲密互动的结果</div>
        <textarea id="settleDesc" placeholder='{{"settlement_reason":"窗口里亲密互动继续推进","settlement_result":"continued","heat_delta":2,"pressure_delta":1}}'></textarea>
        <div class="actions" style="margin-top:8px">
          <button class="btn primary" onclick="settle('continued')">🔄 继续推进</button>
          <button class="btn warn" onclick="settle('released')">💦 已释放</button>
          <button class="btn" onclick="settle('interrupted')">⏹ 中断</button>
          <button class="btn" onclick="settle('cooled')">❄️ 冷却</button>
        </div>
      </div>
    </div>
    <div class="runtime-info">Eventide v0.1.0 · 状态自动保存</div>
  `;
}}
async function tick(hours){{
  hours = hours||2;
  const r=await fetch('/api/tick',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{hours}})}});
  _state=await r.json(); render();
}}
async function settle(result){{
  const desc = document.getElementById('settleDesc').value.trim();
  let extra = {{}};
  try{{ if(desc) extra = JSON.parse(desc); }}catch(e){{}}
  const r=await fetch('/api/settle',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{result,...extra}})}});
  _state=await r.json(); render();
}}
load();
</script>
</body>
</html>"""
    # 把构建好的 HTML 写一份到文件，方便调试
    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    return html

# ── 状态数据提取 ──
def extract_state(state):
    card = ""
    try:
        now = datetime.now(timezone.utc)
        card = runtime.tick_and_render(state, now, last_counterpart_message_at=now - timedelta(minutes=30))
    except Exception as e:
        card = f"(render error: {e})"

    phase = getattr(state, 'phase', 'stable')
    if hasattr(phase, 'value'):
        phase = phase.value

    cycle_day = getattr(state, 'cycle_day', 0)

    active_events = getattr(state, 'active_events', [])
    if hasattr(active_events, '__iter__'):
        active_events = [str(e) for e in (active_events or [])]
    else:
        active_events = []

    max_val = 12
    return {
        "phase": phase,
        "cycle_day": cycle_day,
        "maxVal": max_val,
        "heat": getattr(state, 'heat', 0),
        "pressure": getattr(state, 'pressure', 0),
        "control": getattr(state, 'control', 0),
        "sensitivity": getattr(state, 'sensitivity', 0),
        "reserve": getattr(state, 'reserve', 0),
        "possessiveness": getattr(state, 'possessiveness', 0),
        "fatigue": getattr(state, 'fatigue', 0),
        "active_events": active_events,
        "state_card": card,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/state":
            state = load_state()
            if state is None:
                now = datetime.now(timezone.utc)
                state = runtime.create_state(now)
                save_state(state)
            data = extract_state(state)
            self._json(data)
        else:
            self._html()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        state = load_state()
        if state is None:
            now = datetime.now(timezone.utc)
            state = runtime.create_state(now)

        if path == "/api/tick":
            hours = float(body.get("hours", 2))
            now = datetime.now(timezone.utc)
            runtime.tick(state, now + timedelta(hours=hours))
            save_state(state)
            self._json(extract_state(state))

        elif path == "/api/settle":
            try:
                runtime.settle(state, body)
            except Exception as e:
                pass
            save_state(state)
            self._json(extract_state(state))

        else:
            self._json({"error": "unknown"}, 404)

    def _json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _html(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(build_html().encode())


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3876
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"🌙 Eventide 服务 → http://0.0.0.0:{port}")
    print(f"   状态文件: {STATE_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n⏹  Eventide 服务已停止")
        server.server_close()

if __name__ == "__main__":
    main()
