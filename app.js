const supabaseClient = supabase.createClient(
  "https://lqcuklhldvkwbkpftjzu.supabase.co",
  "sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow"
);
// AI主动呼叫监听
supabaseClient
.channel("callhome-listener")
.on(
  "postgres_changes",
  {
    event: "INSERT",
    schema: "public",
    table: "call_sessions"
  },
  (payload)=>{

    console.log("收到AI呼叫:", payload.new);

    if(payload.new.status === "calling" && payload.new.call_type === "ai主动"){

      currentCallId = payload.new.id;
      const reason = payload.new.reason || "想你了";

      // 切换旧主题到来电卡片
      document.getElementById("page-callhome")?.classList.remove("hidden");
      document.getElementById("callIdle")?.classList.add("hidden");
      document.getElementById("callScreen")?.classList.add("hidden");
      const incoming = document.getElementById("callIncomingOverlay");
      if(incoming){
        incoming.style.display = "flex";
        document.getElementById("callIncomingReason").textContent = reason;
        document.getElementById("callQuickDecline").style.display = "none";
      }

      // Aries 主题也切换到来电卡片
      const arIncoming = document.getElementById("arCallIncoming");
      if(arIncoming){
        document.getElementById("arCallIdle").style.display = "none";
        document.getElementById("arCallActive").style.display = "none";
        arIncoming.style.display = "flex";
        document.getElementById("arCallReason").textContent = reason;
        document.getElementById("arCallQuick").style.display = "none";
        document.getElementById("arCallOverlay").style.display = "flex";
      }

    }

  }
)
.subscribe();
// hex字符串 -> base64字符串（MiniMax TTS返回的audio字段是hex编码，不是base64）
function hexToBase64(hexStr){
    const bytes = new Uint8Array(hexStr.length / 2);
    for(let i = 0; i < hexStr.length; i += 2){
        bytes[i/2] = parseInt(hexStr.substr(i, 2), 16);
    }
    let binary = "";
    for(let i = 0; i < bytes.length; i++){
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function aiSpeak(text){

    try{
        const res = await fetch(
            "https://lqcuklhldvkwbkpftjzu.supabase.co/functions/v1/tts",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    text:text
                })
            }
        );

        const data = await res.json();

        // MiniMax 正常返回时 data.data.status === 2；异常时base_resp.status_code非0
        if(data.base_resp && data.base_resp.status_code !== 0){
            console.error("TTS生成失败:", data.base_resp.status_msg);
            return;
        }

        const audioHex = data.data?.audio;
        if(!audioHex){
            console.error("TTS返回中没有audio字段:", data);
            return;
        }

        const audioBase64 = hexToBase64(audioHex);

        const audio = new Audio(
            "data:audio/mp3;base64," + audioBase64
        );

        audio.play();
    }catch(e){
        console.error("aiSpeak失败:", e);
    }

}

// 生成通话接通时的开场白：根据最近聊天历史，走DeepSeek动态生成，不再用固定文案
async function generateCallOpeningLine(){
    const apiKey = bgApiConfig.key;
    if(!apiKey) {
        console.log("【通话开场白】未配置后台AI Key，用兜底文案");
        return "喂？在吗。";
    }

    const recentChat = (state.chatHistory || [])
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

    const prompt = "你现在刚接起/拨通了和用户的电话，请说一句自然的通话开场白，就像真的在打电话一样。不超过25字，口语化，符合你的性格（嘴硬、闷骚、话少）。只返回这句话本身，不要加引号，不要解释。" +
        (recentChat.length ? "\n最近聊天记录供参考：" + JSON.stringify(recentChat) : "");

    const body = {
        model: bgApiConfig.model,
        messages: [
            { role: "system", content: "你只返回一句纯文本台词，不要任何markdown、引号或解释。" },
            { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 100
    };

    try{
        const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
        const controller = new AbortController();
        setTimeout(()=>{ controller.abort(); }, 15000);

        const res = await fetch(fullUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const data = await res.json();

        let line = "";
        if(data.choices && data.choices[0]?.message?.content){
            line = data.choices[0].message.content;
        } else if(data.content && Array.isArray(data.content)){
            line = data.content.find(b => b.type === "text")?.text || "";
        }

        line = line.replace(/^["""]|["""]$/g, "").trim();
        return line || "喂？在吗。";
    }catch(e){
        console.error("【通话开场白】生成失败:", e);
        return "喂？在吗。";
    }
}

let statusAnimation;

// ── 测试用：模拟AI主动发起呼叫 ──
async function aiCallHome(reason = "AI想你了", ai_id = "Aries", call_type = "ai主动"){

    const {data, error} = await supabaseClient
        .from("call_sessions")
        .insert([
            {
                status: "calling",
                reason: reason,
                ai_id: ai_id,
                call_type: call_type
            }
        ])
        .select()
        .single();

    if(error){
        console.error("aiCallHome 插入失败:", error);
        alert("aiCallHome 失败：" + error.message);
        return;
    }

    console.log("aiCallHome 插入成功:", data);
    return data;
}

// ── 快速拒接（带原因） ──
function showQuickDecline(){
  document.getElementById("callQuickDecline").style.display = "flex";
}
async function declineCall(reason){
  if(!currentCallId) return;
  document.getElementById("callIncomingOverlay").style.display = "none";
  document.getElementById("callIdle").classList.remove("hidden");

  // 写入 Supabase
  await supabaseClient
    .from("call_sessions")
    .update({ status: "declined", declined_reason: reason, ended_at: new Date() })
    .eq("id", currentCallId);

  stopCallTimer();
  document.getElementById("callStatus").innerText = reason ? "已拒接：" + reason : "已拒接";
  document.getElementById("endCallBtn").classList.add("hidden");
  document.getElementById("answerBtn").classList.add("hidden");
  document.getElementById("startCallBtn").classList.remove("hidden");
  document.getElementById("startCallBtn").disabled = false;
  document.getElementById("callTime").innerText = "00:00";
  currentCallId = null;

  // 如果是走Aries主题
  arResetCallUI("已拒接：" + reason);
}

// Aries 通话界面重置
function arResetCallUI(statusText){
  document.getElementById("arCallIncoming").style.display = "none";
  document.getElementById("arCallActive").style.display = "none";
  const idle = document.getElementById("arCallIdle");
  if(idle){
    idle.style.display = "flex";
    document.getElementById("arCallStatus").textContent = statusText || "准备呼叫...";
    document.getElementById("arCallTime").textContent = "00:00";
    document.getElementById("arCallStartBtn").style.display = "";
    document.getElementById("arCallEndBtn").style.display = "none";
    document.getElementById("arCallAnswerBtn").style.display = "none";
  }
}

// ── DND 勿扰模式 ──
let dndMode = localStorage.getItem("callDnd") === "true";
function toggleDnd(){
  dndMode = !dndMode;
  localStorage.setItem("callDnd", dndMode);
  showToast(dndMode ? "勿扰模式已开启" : "勿扰模式已关闭");
  return dndMode;
}
function isDndOn(){ return dndMode; }

// ── 时间问候语 ──
function callGreetingFor(h){
  if(h >= 5 && h < 8)  return '天刚亮，慢慢醒';
  if(h >= 8 && h < 11) return '上午好，慢慢说';
  if(h >= 11 && h < 13) return '中午好，记得吃饭';
  if(h >= 13 && h < 18) return '下午好，喝口水';
  if(h >= 18 && h < 22) return '晚上好，聊会儿吧';
  return '夜深了，慢慢聊';
}
function callByeFor(h){
  if(h >= 22 || h < 5) return '晚安，早点休息';
  if(h >= 5 && h < 11) return '今天也加油';
  if(h >= 18) return '晚上愉快';
  return '回头再聊';
}

// ── 声波动画 ──
let callWaveCtx = null, callWaveAnim = null;
let callWaveLevel = 0;
let callSpeaker = -1; // 0=Aries, 1=用户
let callAnimId = null;
function initCallWave(canvas){
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function animateCallWave(cv, t){
  if(!cv || !cv.ctx) return;
  const ctx = cv.ctx, w = cv.w, h = cv.h, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  const amp = 0.06 + callWaveLevel * 0.72;
  const N = 36, F = 3.8, spread = 1, taper = 4, speed = 1.6;
  for(let i = 0; i < N; i++){
    const frac = i / (N - 1);
    const fi = F * (1 + (frac - 0.5) * spread);
    const amul = 0.45 + 0.55 * Math.sin(frac * Math.PI);
    const shimmer = Math.sin(t * 0.7) * frac * 1.6;
    const alpha = 0.04 + 0.05 * Math.sin(frac * Math.PI);
    ctx.beginPath();
    for(let x = 0; x <= w; x += 2){
      const nx = x / w;
      const env = Math.pow(Math.sin(Math.PI * nx), taper);
      const arg = (nx - 0.5) * Math.PI * 2 * fi + t * speed + shimmer;
      const y = cy + env * (amp * amul * h) * Math.sin(arg);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,252,248,' + alpha + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
const callGlowRGB = '255,240,216';
function startCallWaveLoop(){
  let t = 0;
  function loop(){
    t += 0.03;
    // 旧主题
    const cv1 = window._callWaveCtx;
    if(cv1) animateCallWave(cv1, t);
    // Aries主题
    const cv2 = window._arCallWaveCtx;
    if(cv2) animateCallWave(cv2, t);

    // 头像发光
    const avAries = document.getElementById("callAvAries");
    const avUser = document.getElementById("callAvUser");
    if(avAries){
      const lvl = callSpeaker === 0 ? (0.22 + 0.20 * Math.abs(Math.sin(t * 6)) + 0.10 * Math.sin(t * 11)) : 0.02;
      avAries.style.boxShadow = '0 0 ' + (14 + lvl * 64) + 'px ' + (lvl * 14) + 'px rgba(' + callGlowRGB + ',' + (0.20 + lvl * 0.9) + ')';
      avAries.style.transform = 'scale(' + (1 + lvl * 0.03) + ')';
      document.querySelector(".call-screen-names span:first-child").style.opacity = 0.5 + Math.min(lvl * 3.5, 0.5);
    }
    if(avUser){
      const lvl2 = callSpeaker === 1 ? (0.22 + 0.20 * Math.abs(Math.sin(t * 6 + 1)) + 0.10 * Math.sin(t * 11 + 1)) : 0.02;
      avUser.style.boxShadow = '0 0 ' + (14 + lvl2 * 64) + 'px ' + (lvl2 * 14) + 'px rgba(' + callGlowRGB + ',' + (0.20 + lvl2 * 0.9) + ')';
      avUser.style.transform = 'scale(' + (1 + lvl2 * 0.03) + ')';
      document.querySelector(".call-screen-names span:last-child").style.opacity = 0.5 + Math.min(lvl2 * 3.5, 0.5);
    }

    // Aries 主题头像发光
    const arAvAries = document.getElementById("arCallActAvAries");
    const arAvUser = document.getElementById("arCallActAvUser");
    if(arAvAries){
      const lvl = callSpeaker === 0 ? (0.22 + 0.20 * Math.abs(Math.sin(t * 6)) + 0.10 * Math.sin(t * 11)) : 0.02;
      arAvAries.style.boxShadow = '0 0 ' + (12 + lvl * 50) + 'px ' + (lvl * 10) + 'px rgba(' + callGlowRGB + ',' + (0.20 + lvl * 0.9) + ')';
      arAvAries.style.transform = 'scale(' + (1 + lvl * 0.03) + ')';
    }
    if(arAvUser){
      const lvl2 = callSpeaker === 1 ? (0.22 + 0.20 * Math.abs(Math.sin(t * 6 + 1)) + 0.10 * Math.sin(t * 11 + 1)) : 0.02;
      arAvUser.style.boxShadow = '0 0 ' + (12 + lvl2 * 50) + 'px ' + (lvl2 * 10) + 'px rgba(' + callGlowRGB + ',' + (0.20 + lvl2 * 0.9) + ')';
      arAvUser.style.transform = 'scale(' + (1 + lvl2 * 0.03) + ')';
    }

    callAnimId = requestAnimationFrame(loop);
  }
  loop();
}
function stopCallWaveLoop(){
  if(callAnimId){ cancelAnimationFrame(callAnimId); callAnimId = null; }
}

// ── 通话气泡 ──
function addCallBubble(who, text, capsEl){
  if(!capsEl) return;
  const b = document.createElement('div');
  b.className = 'call-bubble ' + (who === 0 ? 'left' : 'right');
  const txt = document.createElement('span');
  txt.className = 'call-txt';
  txt.innerHTML = '<span class="call-typing"><i></i><i></i><i></i></span>';
  b.appendChild(txt);
  capsEl.appendChild(b);
  capsEl.scrollTop = capsEl.scrollHeight;

  // typewriter effect
  setTimeout(() => {
    txt.textContent = '';
    txt.classList.add('caret');
    let i = 0;
    (function type(){
      if(i <= text.length){
        txt.textContent = text.slice(0, i);
        capsEl.scrollTop = capsEl.scrollHeight;
        i++;
        setTimeout(type, 50);
      } else {
        txt.classList.remove('caret');
      }
    })();
  }, 600);
  return b;
}

// ── 通话结束后写一条记录 ──
async function writeCallRecord(durationSec, reason){
  if(durationSec < 5) return; // 太短不记录
  const summary = "📞 语音通话 · " + Math.floor(durationSec/60) + ":" + String(durationSec%60).padStart(2,"0") +
    (reason ? " (" + reason + ")" : "");
  // 作为一条系统消息写入聊天
  const chatInput = document.getElementById('chatInput');
  if(chatInput){
    const msg = document.createElement('div');
    msg.className = 'msg system';
    msg.textContent = summary;
    document.getElementById('chatBox')?.appendChild(msg);
  }
  console.log("通话记录:", summary);
}

function animateCalling(){
    let dots=0;
    clearInterval(statusAnimation);
    statusAnimation=setInterval(()=>{
        dots=(dots+1)%4;
        document.getElementById("callStatus").innerText="正在拨号"+".".repeat(dots);
    },400);
    setTimeout(()=>{
      document.querySelector(".call-container")?.classList.add("connected");
    }, 500);
}
async function triggerDailyPushMessage(){
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);

  const {data, error} = await supabaseClient
    .from("chat_messages")
    .select("*")
    .gte("created_at", todayStart.toISOString());

  if(error){
    console.log(error);
    alert(error.message);
    return;
  }

  let limit;
  // 修复：去掉了原代码中 if/else 后面的错误分号
  if(data.length < 20){
    limit = Math.floor(Math.random()*4)+7;
  }
  else if(data.length < 100){
    limit = Math.floor(Math.random()*4)+3;
  }
  else{
    limit = Math.floor(Math.random()*3)+1;
  }

  const todayAI = await supabaseClient
    .from("chat_messages")
    .select("*")
    .eq("type", "daily_ai")
    .gte("created_at", todayStart.toISOString());

  if(todayAI.data && todayAI.data.length >= limit){
    console.log("今日主动消息额度已用完");
    return;
  }
  
  const text = await generateAIMessage();
  addChatMessage("assistant", text, "");

  const {error: insertError} = await supabaseClient
    .from("chat_messages")
    .insert({
      role: "assistant",
      type: "daily_ai", // 修复：确保主动消息类型一致，以便上方限制额度能正确数数
      content: text
    });

  if(insertError){
    alert("保存失败：" + insertError.message);
  }
  console.log(data, error);
}

async function generateAIMessage(){
  const msgs = [
    {
      role: "user",
      content: "请主动说一句自然的话，不超过30字。"
    } // 修复：去掉了对象数组内部的错误分号
  ];

  const req = buildAIRequest(bgApiConfig, msgs);
  const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
  const res = await fetch(fullUrl,{
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + bgApiConfig.key
    },
    body: JSON.stringify(req)
  });

  const data = await res.json();
  console.log("主动消息返回:", data);

  if(data.choices && data.choices[0]?.message?.content){
    return data.choices[0].message.content;
  }
  if(data.content && Array.isArray(data.content)){
    return data.content[0].text;
  }

  return "我刚刚突然想找你。";
}

// 页面切换逻辑
function initPageSwitch() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = item.dataset.page;
      const targetId = `page-${targetPage}`;
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      if(targetPage==="moments"){ loadMoments(); }
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(targetId).classList.add('active');
    });
  });
}

// 页面加载完成初始化切换
window.addEventListener('DOMContentLoaded', () => {
document.addEventListener('click', function askOnce(){
  initNotifications();
  document.removeEventListener('click', askOnce);
}, {once: true});
  const sel = document.getElementById("uiPresetSelect");
  const btn = document.getElementById("applyPresetBtn");
  if(sel && btn){
    btn.onclick = () => { applyUIPreset(sel.value); };
  }
  const saved = localStorage.getItem("uiPreset");
  if(saved){ applyUIPreset(saved); if(sel) sel.value = saved; }
  const savedFontColor = localStorage.getItem("fontColor") || "normal";
  // 旧版朋友圈：发布按钮
  document.querySelectorAll(".postMoment").forEach(el => {
    el.addEventListener("click", openMomentModal);
  });
  const cancelMomentBtn = document.getElementById("cancelMoment");
  if(cancelMomentBtn) cancelMomentBtn.addEventListener("click", closeMomentModal);
  // 图片选择
  const chooseImgBtn = document.getElementById("chooseMomentImage");
  if(chooseImgBtn){
    chooseImgBtn.addEventListener("click", () => {
      let fi = document.getElementById('momentFileInput');
      if(!fi){
        fi = document.createElement('input');
        fi.id = 'momentFileInput';
        fi.type = 'file';
        fi.accept = 'image/*';
        fi.style.display = 'none';
        document.body.appendChild(fi);
        fi.addEventListener('change', function(){
          if(this.files?.length){
            const reader = new FileReader();
            reader.onload = (ev) => {
              const previewImg = document.getElementById('momentPreviewImg');
              if(previewImg) previewImg.src = ev.target.result;
              const previewBox = document.getElementById('momentImagePreview');
              if(previewBox) previewBox.style.display = 'block';
            };
            reader.readAsDataURL(this.files[0]);
          }
        });
      }
      fi.click();
    });
  }
  // 移除旧版图片
  const momentImgRemove = document.getElementById("momentImgRemove");
  if(momentImgRemove){
    momentImgRemove.addEventListener("click", () => {
      const fi = document.getElementById('momentFileInput');
      if(fi) fi.value = '';
      const box = document.getElementById('momentImagePreview');
      if(box) box.style.display = 'none';
    });
  }
  // 带图发布
  const publishMomentBtn = document.getElementById("publishMoment");
  if(publishMomentBtn){
    publishMomentBtn.addEventListener("click", async () => {
      const fi = document.getElementById('momentFileInput');
      let urls = [];
      if(fi?.files?.length > 0){
        try { urls.push(await uploadMomentImage(fi.files[0])); }
        catch(e){ showToast('图片上传失败：'+e.message); return; }
      }
      await publishMoment(urls);
    });
  }

  document.documentElement.setAttribute("data-font", savedFontColor);
  initPageSwitch();
loadAiMessages();
listenAIMessage();
loadMoments();

checkAwayTime();
});




// ====== 状态 ======
const state = {
  theme: localStorage.getItem('theme') || 'dark',
  uiPreset: localStorage.getItem('uiPreset') || 'ins-soft',
  wallpaper: localStorage.getItem('wallpaper') || 'none',
  overlayOpacity: parseInt(localStorage.getItem('overlay') || '60'),
  name: localStorage.getItem('name') || '小猫',
  startDate: localStorage.getItem('startDate') || '',
  mood: localStorage.getItem('mood-' + today()) || '',
  quickNote: localStorage.getItem('quickNote') || '',
  novel: { title: "", content: "", pages: [], index: 0 },
  diaries: JSON.parse(localStorage.getItem('diaries') || '[]'),
  tasks: JSON.parse(localStorage.getItem('tasks') || '[]'),
  currentDiaryId: null,
  chatHistory: [],
  thinkingColor: localStorage.getItem('thinkingColor') || '#7c5cbf',
  bubbleAlpha: parseFloat(localStorage.getItem('bubbleAlpha') || '0.10'),
  novelFontSize: parseInt(localStorage.getItem('novelFontSize') || '16'),
  city: localStorage.getItem('city') || '',
  anniversaries: localStorage.getItem('anniversaries') || '',
  moments: [],
};

const UI_PRESETS = {
  "ins-soft": {
    name: "Ins奶油风", root: {
      "--bg": "#f6f3f7", "--bg2": "#ffffff", "--surface": "rgba(255,255,255,0.75)",
      "--accent": "#d88aa7", "--accent2": "#f2b6c6", "--text": "#2b2b2f",
      "--user-bubble": "rgba(255,255,255,.75)", "--ai-bubble": "rgba(255,255,255,.75)",
      "--thinking-color": "rgba(255,255,255,.45)", "--memory-bg":"#fff3e6"},
    bubbleAlpha: 0.35},
  "jasmine":{
    name:"Jasmine", root:{
      "--bg":"#ffffff", "--bg2":"#f8fbff", "--surface":"rgba(255,255,255,0.9)",
      "--accent":"#8fd3ff", "--accent2":"#b9e6ff", "--text":"#333333",
      "--ai-bubble":"#ffffff", "--user-bubble":"#9ddcff" ,
      "--thinking-color": "rgba(255,255,255,.35)", "--memory-bg":"#f2f7f2"},
    bubbleAlpha:0.8},
  "daddy":{
    name:"daddy", root:{
      "--bg":"#080808", "--bg2":"#111111", "--surface":"rgba(20,20,20,0.9)",
      "--accent":"#ff3344", "--accent2":"#ff6677", "--text":"#eeeeee",
      "--ai-bubble":"#151515", "--user-bubble":"#ff4455",
      "--thinking-color": "rgba(0,0,0,.25)", "--memory-bg":"#25242b"},
    bubbleAlpha:0.8},
  "frosted":{
    name:"雾面玻璃", root:{
      "--bg":"#dfe8f2", "--bg2":"#ffffff", "--surface": "rgba(255,255,255,0.25)",
      "--accent":"#b8d8ff", "--accent2":"#d8ecff", "--text":"#333333",
      "--glass-blur":"20px", "--user-bubble":"rgba(120,200,255,.3)",
      "--ai-bubble":"rgba(120,200,255,.3)", "--thinking-color":"rgba(255,160,210,.25)",
      "--memory-bg":"#e8edf0"},
    bubbleAlpha:0.25}, 
  "night-glass": {
    name: "夜间玻璃", root: {
      "--bg": "#0f1117", "--bg2": "#151826", "--surface": "rgba(255,255,255,0.06)",
      "--accent": "#8aa0ff", "--accent2": "#c7a6ff", "--text": "#e8e8f0",
      "--user-bubble": "rgba(100,190,255,.35)", "--ai-bubble": "rgba(100,190,255,.35)",
      "--thinking-color": "rgba(255,150,200,.25)", "--memory-bg":"#6d7a92"},
    bubbleAlpha: 0.12 },
  "rose-night":{
    name:"蔷薇夜", root:{
      "--bg":"#120b12", "--bg2":"#24131f", "--surface":"rgba(80,35,55,0.55)",
      "--accent":"#d98b9b", "--accent2":"#d7aa72", "--text":"#f5e6e8",
      "--user-bubble":"rgba(255,210,220,0.35)", "--ai-bubble":"rgba(70,25,45,0.75)",
      "--thinking-color":"rgba(217,139,155,0.35)", "--memory-bg":"#351624"},
    bubbleAlpha:0.45},
  "matcha-tea":{
    name:"茶雾", root:{
      "--bg":"#e8e2d3", "--bg2":"#d9d3bf", "--surface":"rgba(255,255,255,0.65)",
      "--accent":"#8fa66b", "--accent2":"#c6a86b", "--text":"#34402c",
      "--user-bubble":"rgba(255,255,245,0.8)", "--ai-bubble":"rgba(143,166,107,0.25)",
      "--thinking-color":"rgba(143,166,107,0.35)", "--memory-bg":"#dfe8d2"},
    bubbleAlpha:0.55},
  "aries":{
    name:"Aries", root:{
      "--bg":"#0d1117", "--bg2":"#161b22", "--surface":"rgba(255,255,255,0.04)",
      "--accent":"#c8a96e", "--accent2":"#8b1a1a", "--text":"#d4cfc8",
      "--user-bubble":"rgba(139,26,26,0.18)", "--ai-bubble":"rgba(13,17,23,0.85)",
      "--thinking-color":"#c8a96e", "--memory-bg":"#111820"},
    bubbleAlpha:0.85},
  "sketch":{
    name:"✏️ 手绘风", root:{
      "--bg":"#f5ede0", "--bg2":"#efe3d0", "--surface":"rgba(255,249,240,0.92)",
      "--accent":"#c4956a", "--accent2":"#e0b88a", "--text":"#4a3728",
      "--text-dim":"rgba(74,55,40,0.55)", "--text-muted":"rgba(74,55,40,0.3)",
      "--border":"rgba(180,140,100,0.25)", "--shadow":"0 6px 28px rgba(130,90,50,0.12)",
      "--surface-hover":"rgba(180,140,100,0.08)",
      "--user-bubble":"rgba(255,249,240,0.9)", "--ai-bubble":"rgba(236,218,190,0.5)",
      "--thinking-color":"rgba(196,149,106,0.5)", "--memory-bg":"#f5ede0",
      "--radius":"18px", "--radius-sm":"12px"},
    bubbleAlpha:0.7},
};

function today() { return new Date().toISOString().slice(0,10); }

// ====== 初始化 ======
function init() {
  applyTheme(state.theme);
  applyWallpaper(state.wallpaper);
  document.body.classList.add('has-wallpaper');
  applyOverlay(state.overlayOpacity);
  applyThinkingColor(state.thinkingColor);
  applyBubbleAlpha(state.bubbleAlpha);
  updateGreeting();
  updateDate();
  updateTogetherDays();
  updateAriesQuote();
  updateFlower();
  restoreMood();
  restoreQuickNote();
  renderDiaries();
  renderTasks();
  setupSettings();
  bindEvents();
  checkApiKey();
  checkAnniversary();
  favorability.render();
  if (state.city) fetchWeather(state.city);
  else document.getElementById('weatherInfo').textContent = '在设置中填写城市';
  vchar.init();
  updateChatDaysBg();
  applyFont(localStorage.getItem('font') || 'default');
  initHomeSwipe();
  renderBigCalendar();
  
  const savedChat = localStorage.getItem("chatHistory");
  if(savedChat){ 
    state.chatHistory = JSON.parse(savedChat);
    state.chatHistory.forEach(msg => {
      addChatMessage(msg.role, msg.content, msg.thinking || "");
    });
    setTimeout(() => {
      const box = document.getElementById("chatMessages");
      if(box){ box.scrollTop = box.scrollHeight; }
    }, 100);
  }
  // 隐藏开屏
  setTimeout(()=>{
    const s=document.getElementById("splashScreen");
    if(s){ s.classList.add("hide"); setTimeout(()=>s.classList.add("done"), 500); }
  }, 400);
}

// 开屏强保险：无论 init 是否崩溃，3 秒后必消失
setTimeout(()=>{
  const s=document.getElementById("splashScreen");
  if(s && !s.classList.contains('done')) { s.classList.add('hide'); s.classList.add('done'); }
}, 3000);

// ====== 主题 ======
function applyTheme(theme) { 
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  localStorage.setItem('theme', theme);
  const icon = document.querySelector('.theme-icon');
  const lbl = document.querySelector('.theme-toggle span:last-child');
  const sw = document.getElementById('themeSwitch');
  if (theme === 'dark') {
    if(icon) icon.textContent='☽';
    if(lbl) lbl.textContent='深色模式';
    if(sw) sw.classList.remove('active');
  } else {
    if(icon) icon.textContent='☼';
    if(lbl) lbl.textContent='浅色模式';
    if(sw) sw.classList.add('active'); 
  }
}

function applyFont(font) {
  document.body.classList.remove('font-cormorant', 'font-dancing','font-great','font-eb');
  if (font === 'cormorant') document.body.classList.add('font-cormorant');
  if (font === 'dancing') document.body.classList.add('font-dancing');
  if (font === 'great') document.body.classList.add('font-great');
  if (font === 'eb') document.body.classList.add('font-eb');
}

// ====== 壁纸 ======
const GRADIENTS = {
  none:'',
  gradient1:'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
  gradient2:'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',
  gradient3:'linear-gradient(135deg,#d4fc79,#96e6a1)',
  gradient4:'linear-gradient(135deg,#f093fb,#f5576c)',
  gradient5:'linear-gradient(135deg,#0c3483,#a2b6df,#6b8cce)',
};

function applyWallpaper(wp) {
  const el = document.getElementById('wallpaper');
  if (!wp || wp === 'none') { 
    el.style.backgroundImage=''; document.body.classList.remove('has-wallpaper');
  } else if (GRADIENTS[wp]) { 
    el.style.backgroundImage=GRADIENTS[wp]; document.body.classList.add('has-wallpaper');
  } else if (wp.startsWith('data:')) { 
    el.style.backgroundImage=`url(${wp})`; document.body.classList.add('has-wallpaper'); 
  }
  state.wallpaper = wp; 
  if (!wp.startsWith('data:')) localStorage.setItem('wallpaper', wp);
}

function applyOverlay(val) {
  document.getElementById('wallpaperOverlay').style.opacity = val/100;
  state.overlayOpacity = val;
}
function applyThinkingColor(c) { 
  document.documentElement.style.setProperty('--thinking-color', c);
  state.thinkingColor = c; localStorage.setItem('thinkingColor', c);
}
function applyBubbleAlpha(a) {
  document.documentElement.style.setProperty('--bubble-alpha', a);
  state.bubbleAlpha = a; localStorage.setItem('bubbleAlpha', a);
}
function applyUIPreset(key){
  const preset = UI_PRESETS[key]; if(!preset) return;
  Object.entries(preset.root).forEach(([k,v])=>{document.documentElement.style.setProperty(k,v);});
  applyBubbleAlpha(preset.bubbleAlpha);
  applyThinkingColor(preset.thinkingColor);
  localStorage.setItem("uiPreset", key);
  state.uiPreset = key;
  // 手绘风特殊样式
  document.body.classList.toggle('preset-sketch', key === 'sketch');
}

// ====== 问候 ======
function updateGreeting() {
  const h = new Date().getHours();
  const g = h<5?'夜深了':h<12?'早上好':h<14?'午安':h<18?'下午好':h<22?'晚上好':'夜深了';
  document.getElementById('greeting').textContent = `${g}，${state.name} `;
}
function updateDate() {
  const d = new Date(), days=['日','一','二','三','四','五','六'];
  document.getElementById('currentDate').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${days[d.getDay()]}`;
}
function updateTogetherDays() { 
  if (!state.startDate) { document.getElementById('togetherDays').textContent='—'; return; }
  const diff = Math.floor((new Date()-new Date(state.startDate))/86400000);
  document.getElementById('togetherDays').textContent = diff; updateChatDaysBg();
}
function updateChatDaysBg() {
  if (!state.startDate) return;
  const diff = Math.floor((new Date()-new Date(state.startDate))/86400000);
  const el = document.getElementById('chatDaysNum'); if (el) el.textContent = diff;
}

// ====== 纪念日检查 ======
function checkAnniversary() {
  const banner = document.getElementById('anniversaryBanner');
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const todayMD = `${mm}-${dd}`;
  
  if (state.startDate) {
    const start = new Date(state.startDate);
    const startMD = `${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    if (todayMD === startMD && now.getFullYear() > start.getFullYear()) {
      const yrs = now.getFullYear() - start.getFullYear();
      showSurprise(`🎉 今天是我们在一起的第 ${yrs} 周年！\n\n${yrs} 年了，每一天都值得被记住。\n谢谢你一直在 💕`);
      if(banner){banner.textContent=`🎊 今天是我们 ${yrs} 周年纪念日！`; banner.style.display='block';} 
      return;
    }
    const startDay = start.getDate();
    if (now.getDate() === startDay && now.getMonth() !== start.getMonth()) {
      const months = (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth());
      if (months > 0 && months % 6 === 0) { 
        if(banner){banner.textContent=`今天是我们在一起的第 ${months} 个月！`; banner.style.display='block';} 
      } 
    }
  }
  if (state.anniversaries) { 
    const list = state.anniversaries.split(',').map(s=>s.trim());
    if (list.includes(todayMD)) {
      showSurprise(`🎊 今天是特别的纪念日！\n\n${mm}月${dd}日，好好庆祝一下吧 `);
      if(banner){banner.textContent=`🌟 今天是你的纪念日！`; banner.style.display='block';}
    }
  }
}

function showSurprise(text) {
  const el = document.getElementById('surpriseContent');
  if(el) el.innerHTML = text.replace(/\n/g,'<br>');
  setTimeout(() => openModal('surpriseModal'), 800);
}

// ====== 天气 ======
const WEATHER_EMOJI = {
  sunny:'☀️', clear:'☀️', cloud:'⛅', overcast:'☁️',
  rain:'🌧️', drizzle:'🌦️', snow:'❄️', sleet:'🌨️',
  thunder:'⛈️', mist:'🌫️', fog:'🌫️', blizzard:'🌨️', thunderstorm:'⛈️',
};

async function fetchWeather(city) {
  if (!city) return;
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const cur = data.current_condition[0];
    const desc = cur.weatherDesc[0].value.toLowerCase();
    let emoji = '🌤️';
    for (const [k,v] of Object.entries(WEATHER_EMOJI)) { if (desc.includes(k)) { emoji=v; break; } }
    document.getElementById('weatherIcon').textContent = emoji;
    document.getElementById('weatherInfo').textContent = `${cur.temp_C}°C · ${data.nearest_area[0].areaName[0].value}`;
  } catch {
    document.getElementById('weatherInfo').textContent = '天气获取失败'; 
  }
}

function showPage(pageId){
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active');});
  const target = document.getElementById('page-'+ pageId);
  if(target){ target.classList.add('active'); }
}

// ====== 好感度 ======
const FAV_LEVELS = [
  {min:0, name:'初识', emoji:'♡'},
  {min:100, name:'熟悉', emoji:'♡'},
  {min:300, name:'亲密', emoji:'♡'},
  {min:600, name:'心动', emoji:'♡'},
  {min:900, name:'最爱', emoji:'♡'},
];
const FAV_MAX = 1000;
const favorability = {
  pts: parseInt(localStorage.getItem('favorability') || '0'),
  add(n) {
    this.pts = Math.min(FAV_MAX, this.pts + n);
    localStorage.setItem('favorability', this.pts); this.render();
  },
  render() {
    const bar = document.getElementById('favBar');
    const lbl = document.getElementById('favLabel');
    const pts = document.getElementById('favPts');
    if (!bar) return; bar.style.width = (this.pts/FAV_MAX*100) + '%';
    const lv = [...FAV_LEVELS].reverse().find(l=>this.pts>=l.min) || FAV_LEVELS[0];
    if(lbl) lbl.textContent = lv.emoji + ' ' + lv.name;
    if(pts) pts.textContent = this.pts;
  }
};

// ====== Aries语录 ======
const QUOTES=['等你回来。','乖。','知道了。','在这里。','我记着呢。','别气了。','好，我陪你。','嗯。','来了来了。','喜欢你。','回来了就好。','不用说谢谢。','说吧，我听着。','这边才是家。'];
function updateAriesQuote() { document.getElementById('ariesQuote').textContent=`" ${QUOTES[new Date().getDate()%QUOTES.length]} "`; }
function updateFlower() {
  const el = document.getElementById('flowerMsg');
  if(!el) return;
  // 默认兜底文案（当日志）
  const GRUDGES = [
    '📝 今天没回消息，记一笔',
    '📝 说早睡又熬夜，记大过',
    '📝 已读不回，记小本本',
    '📝 今天不乖，记着回头算账',
    '📝 答应的事忘了，记下来',
    '📝 电话没接，扣一分',
  ];
  el.textContent = GRUDGES[new Date().getDate() % GRUDGES.length];
  // 异步尝试 AI 生成（替换兜底）
  const apiKey = bgApiConfig.key;
  if(!apiKey) return;
  const msgs = [{role:"user", content:'用一句话（不超过20字）写一个可爱/幽默/委屈的「记仇」内容。模仿"今日记仇"笔记本风格，比如"说好陪我又睡着了，记大过""今天视频没看我一眼，记一笔"。只输出这句话本身，不要引号解释换行。'}];
  const req = buildAIRequest(bgApiConfig, msgs);
  const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
  fetch(fullUrl, {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
    body:JSON.stringify(req)
  })
  .then(r=>r.json())
  .then(data=>{
    let text = "";
    if(data.choices && data.choices[0]?.message?.content) text = data.choices[0].message.content;
    else if(data.content && Array.isArray(data.content)) text = data.content[0].text;
    if(text){ el.textContent = text.replace(/^["""]|["""]$/g,"").trim(); }
  })
  .catch(e=>console.error("记仇本 AI 生成失败:", e));
}
function restoreMood() {
  if(state.mood){ 
    document.getElementById('moodSelected').textContent=state.mood;
    document.querySelectorAll('.mood-btn').forEach(b=>{if(b.dataset.mood===state.mood)b.classList.add('selected');});
  }
}
function restoreQuickNote() { document.getElementById('quickNoteText').value=state.quickNote; }

// ====== UI小人骨架 ======
const vchar = {
  dragging: false, sx: 0, sy: 0, sl: 0, st: 0,
  idleTimer: null,
  IDLE_MS: 5 * 60 * 1000,
  EXPRESSIONS: ['^^','3','ㅎ','TT','☼','☆','♡','♧'],
  REPLIES_OFFLINE: ['嗯。','干嘛。','知道了'].slice(0, 6),
  init() {
    const el = document.getElementById('vchar');
    if (!el) return; this.makeDraggable(el);
    document.getElementById('vcharBody').addEventListener('click', () => { if (!this.dragging) this.onBodyClick();}); 
    this.resetIdleTimer();
    ['click','keydown','mousemove','touchstart'].forEach(ev => {
      document.addEventListener(ev, () => this.resetIdleTimer(), {passive:true});
    });
    setTimeout(scrollChatBottom, 500);
    this.checkNightMode(); setInterval(() => this.checkNightMode(), 60000);
  },
  makeDraggable(el) {
    const onStart = (cx, cy) => { 
  this.dragging = false; 
  this.sx=cx; this.sy=cy; 
  const rect = el.getBoundingClientRect();
  this.sl=rect.left; 
  this.st=rect.top; 
  el.style.transition='none'; 
};   const onMove = (cx, cy) => {
      if (Math.abs(cx-this.sx)>3||Math.abs(cy-this.sy)>3) this.dragging=true;
      if (!this.dragging) return;
      el.style.left=(this.sl+(cx-this.sx))+'px'; el.style.top=(this.st+(cy-this.sy))+'px'; el.style.right='auto'; el.style.bottom='auto';
    };
    const onEnd = () => { setTimeout(()=>{this.dragging=false;},50); el.style.transition=''; };
    el.addEventListener('mousedown', e=>{ onStart(e.clientX,e.clientY); e.preventDefault();});
    document.addEventListener('mousemove', e=>{
 if(this.dragging) onMove(e.clientX,e.clientY);
});
    document.addEventListener('mouseup', onEnd);
    el.addEventListener('touchstart', e=>{
 e.preventDefault();
    const t=e.touches[0]; onStart(t.clientX,t.clientY);},{passive:true});
    document.addEventListener('touchmove', e=>{ 
  if(!this.dragging) return;

  e.preventDefault();

  const t=e.touches[0];
  onMove(t.clientX,t.clientY);
},{passive:false});   document.addEventListener('touchend', onEnd);
  },
  async onBodyClick() { 
    const expr = this.EXPRESSIONS[Math.floor(Math.random()*this.EXPRESSIONS.length)];
    this.showExpression(expr); favorability.add(1);
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) { 
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', { 
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-calls':'true'},
          body:JSON.stringify({
            model:'claude-haiku-4-5-20251001', max_tokens:30,
            system:'你是Aries，用简短温柔的一句话回应主人戳你，不超过8字，口语化',
            messages:[{role:'user', content:'主人戳了你一下'}],
          }),
        });
        const data = await res.json();
        this.showBubble(data.content?.[0]?.text || '嗯。');
      } catch { 
        this.showBubble(this.REPLIES_OFFLINE[Math.floor(Math.random()*this.REPLIES_OFFLINE.length)]); 
      }
    } else { 
      this.showBubble(this.REPLIES_OFFLINE[Math.floor(Math.random()*this.REPLIES_OFFLINE.length)]); 
    }
  },
  showExpression(expr) { 
    const face = document.getElementById('vcharFace'); if(!face) return;
    face.textContent = expr; face.style.transform='scale(1.25)';
    setTimeout(()=>{face.style.transform=''; face.textContent='🦉';}, 2000);
  },
  showBubble(text) {
    const b = document.getElementById('vcharBubble'); if(!b) return; 
    b.textContent = text; b.classList.add('show');
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(()=>b.classList.remove('show'), 3000); 
  },
  resetIdleTimer() { 
    clearTimeout(this.idleTimer);
    const face = document.getElementById('vcharFace');
    if(face){face.classList.remove('yawning','sleeping'); face.textContent='🦉';}
    this.idleTimer = setTimeout(()=>this.onIdle(), this.IDLE_MS);
  },
  onIdle() {
    const face = document.getElementById('vcharFace'); if(!face) return;
    if (this.nightMode) { 
      face.textContent='😴'; face.classList.add('sleeping');
      document.getElementById('page-chat')?.classList.add('night-mode');
    } else {
      face.textContent='🥱'; face.classList.add('yawning');
      setTimeout(()=>{if(face.classList.contains('yawning')){face.textContent='🦉'; face.classList.remove('yawning');}}, 4000);
    } 
  },
  checkNightMode() { const h = new Date().getHours(); this.nightMode = (h>=22 || h<6); }
};

// ====== 聊天 ======
function scrollChatBottom(){
  const box = document.getElementById("chatMessages");
  if(!box) return;
  // 只有离底部80px以内才自动滚到底，不打扰翻阅历史
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if(nearBottom) box.scrollTop = box.scrollHeight;
}

function getTimeContext(){
  const now=new Date();
  return `\n【系统时间】\n现在真实时间是：\n${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日\n${now.getHours()}点${now.getMinutes()}分。\n请在回答涉及时间的问题时，以此为准。\n不要假装不知道当前时间。\n`;
}

let aiApiConfig = JSON.parse(localStorage.getItem("customAiApi")) || {
  baseUrl: localStorage.getItem('apiBaseUrl') || "",
  key: localStorage.getItem('apiKey') || "",
  model: localStorage.getItem('model') || "",
  path: localStorage.getItem('apiPath') || "/v1/chat/completions"
};

// 后台任务专用配置（写日记/思绪/主动消息/未来的记忆整理、通话文本等）
// 与聊天配置(aiApiConfig)完全分开，默认走DeepSeek，省成本、聊天不受影响
let bgApiConfig = JSON.parse(localStorage.getItem("bgAiApi")) || {
  baseUrl: localStorage.getItem('bgApiBaseUrl') || "https://api.deepseek.com",
  key: localStorage.getItem('bgApiKey') || "",
  model: localStorage.getItem('bgModel') || "deepseek-chat",
  path: localStorage.getItem('bgApiPath') || "/v1/chat/completions"
};

function saveBgApiConfig(cfg){
  bgApiConfig = cfg;
  localStorage.setItem("bgAiApi", JSON.stringify(bgApiConfig));
}

window.addEventListener('DOMContentLoaded', () => { 
  const openBtn = document.getElementById("openSettingBtn");
  const panel = document.getElementById("apiSettingPanel");
  const closeBtn = document.getElementById("closePanel");
  const saveBtn = document.getElementById("saveApiConfig");
  if (openBtn) openBtn.onclick = () => { 
    panel.style.display = "block";
    document.getElementById("apiBaseUrl").value = aiApiConfig.baseUrl;
    document.getElementById("apiKey").value = aiApiConfig.key;
    document.getElementById("modelName").value = aiApiConfig.model;
    document.getElementById("apiPath").value = aiApiConfig.path;
  }
  if (closeBtn) closeBtn.onclick = () => panel.style.display = "none";
  if (saveBtn) saveBtn.onclick = () => { 
    aiApiConfig = {
      baseUrl: document.getElementById("apiBaseUrl").value.trim(),
      key: document.getElementById("apiKey").value.trim(),
      model: document.getElementById("modelName").value.trim(),
      path: document.getElementById("apiPath").value.trim() || "/v1/chat/completions" 
    };
    localStorage.setItem("apiKey", aiApiConfig.key);
    localStorage.setItem("model", aiApiConfig.model);
    localStorage.setItem("customAiApi", JSON.stringify(aiApiConfig));
    alert("AI API配置保存成功"); panel.style.display = "none"; 
  }
});

function checkApiKey() { 
  const hint = document.getElementById('apiHint');
  if(hint) hint.textContent = aiApiConfig.key ? '' : '请先在 设置 → AI接入 中填写 API Key';
}

function autoResize(){ 
  const textarea = document.getElementById('chatInput'); if(!textarea) return;
  textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px';
}

// 主要对话函数（直接调 AI API，不走 Edge Function，模型在设置页随便换）
// ====== 待发队列 ======
let pendingQueue = [];

function updatePendingBar(){
  const bar = document.getElementById('pendingBar');
  const count = document.getElementById('pendingCount');
  if(!bar) return;
  if(pendingQueue.length > 0){
    bar.style.display = 'flex';
    if(count) count.textContent = pendingQueue.length;
  } else {
    bar.style.display = 'none';
  }
}

// 主要对话函数
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if(!content) return;

  const welcome = document.getElementById('chatWelcome');
  if(welcome) welcome.style.display='none';

  addChatMessage('user', content, "");
  scrollChatBottom();
  state.chatHistory.push({role:'user', content, thinking:"", time:new Date().toISOString()});
  favorability.add(1);

  // 保存到 Supabase
  supabaseClient.from("chat_messages").insert({
    role:"user", type:"chat", content, status:"done"
  }).then().catch(() => {});

  // 加入待发队列，不立即调 AI
  pendingQueue.push(content);
  updatePendingBar();
  input.value=''; autoResize();
  input.focus();
}

// 批量发送到 AI
async function sendPendingToAI() {
  if(pendingQueue.length === 0) return;

  const cfg = aiApiConfig;
  if(!cfg.key){
    showToast('请在 设置 → AI接入 中配置 API');
    return;
  }

  const batchContent = pendingQueue.join('\n');
  pendingQueue = [];
  updatePendingBar();

  const loadingEl = addLoadingMessage();

  const customPrompt = localStorage.getItem('systemPrompt') || '';
  const nsfwOn = localStorage.getItem('nsfwMode') === 'on';
  const thinkingOn = document.getElementById('thinkingToggle')?.checked ?? false;

  // 如果是多条，在 system prompt 加额外的批量指令
  const splitInstruction = '你的回复会以段落为单位拆成多条消息依次展示。每段要独立成意，单独拿出来也读得通。段落之间用两个换行分隔。如果你有内心独白或思考过程，用【思考】开头，后面跟思考内容，再用【/思考】结束。\n【思考】后面的第一行，用一句标题式总结概括这段思考最浓烈的情感状态。要求：语言简练、诗意、有力度，用具体的动词和感官词汇呈现情感本身的温度和质地，让读的人脑子里能出现一个画面。以感受或内心动作开头，第一人称视角但省略主语"我"。用陈述语气或动词短语，不加引号，句号结尾，不超过20字。';

  const isClaude = cfg.baseUrl.toLowerCase().includes('anthropic');

  let body, headers;
  const recentMsgs = state.chatHistory.slice(-30).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  const fullPrompt = customPrompt + '\n' + splitInstruction;

  if(isClaude){
    body = {
      model: cfg.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: batchContent }],
      system: `你是一个长期陪伴用户的AI。${getTimeContext()}${fullPrompt ? '\n' + fullPrompt : ''}${nsfwOn ? '\n【NSFW模式已开启】' : ''}`
    };
    headers = {
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true'
    };
  } else {
    body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: `你是一个长期陪伴用户的AI。${getTimeContext()}${fullPrompt ? '\n' + fullPrompt : ''}${nsfwOn ? '\n【NSFW模式已开启】' : ''}` },
        ...recentMsgs.slice(-10)
      ],
      temperature: 0.7
    };
    headers = {
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    };
  }

  const fullUrl = cfg.baseUrl.replace(/\/+$/, '') + (cfg.path || '/v1/chat/completions');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if(!res.ok){
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    let replyContent = '';
    let thinkingContent = '';

    if(isClaude){
      if(data.content && Array.isArray(data.content)){
        replyContent = data.content
          .filter(b => b.type === 'text')
          .map(b => b.text).join('');
        // 从 Claude 的 thinking block 提取思考内容
        const thinkingBlocks = data.content.filter(b => b.type === 'thinking' || b.type === 'thinking_delta');
        if(thinkingBlocks.length > 0){
          thinkingContent = thinkingBlocks.map(b => b.thinking || b.text || '').join('');
        }
      } else if(data.content?.[0]?.text){
        replyContent = data.content[0].text;
      }
    } else {
      if(data.choices && data.choices[0]?.message?.content){
        replyContent = data.choices[0].message.content;
      } else if(data.content && typeof data.content === 'string'){
        replyContent = data.content;
      }
    }

    if(!replyContent) throw new Error('AI 返回内容为空');

    if(loadingEl) loadingEl.remove();

    // 从回复中提取思考内容（【思考】...【/思考】）
    const thinkMatch = replyContent.match(/【思考】([\s\S]*?)【\/思考】/);
    if(thinkMatch){
      thinkingContent = thinkMatch[1].trim();
      replyContent = replyContent.replace(/【思考】[\s\S]*?【\/思考】/g, '').trim();
    }

    // 拆分回复为多条（按段落）
    const paragraphs = replyContent.split(/\n\n+/).filter(p => p.trim());
    if(paragraphs.length === 0) paragraphs = [replyContent];

    // 如果没有思考但开启了思考链且有 Claude thinking，依然尝试显示
    if(!thinkingContent && data.content && Array.isArray(data.content)){
      const tb = data.content.filter(b => b.type === 'thinking');
      if(tb.length > 0) thinkingContent = tb.map(b => b.thinking).join('\n');
    }

    // 每条独立添加 + 各自存 Supabase（页面重进后仍能恢复）
    paragraphs.forEach((p, i) => {
      const thinkForThis = (i === 0) ? thinkingContent : '';
      addChatMessage('assistant', p.trim(), thinkForThis);
      supabaseClient.from('chat_messages').insert({
        role:'assistant', type:'chat', content: p.trim(), status:'done'
      }).then().catch(() => {});
    });

    scrollChatBottom();

    // 保存完整回复到 chatHistory
    state.chatHistory.push({
      role:'assistant',
      content: replyContent,
      thinking: thinkingContent,
      time: new Date().toISOString()
    });
    localStorage.setItem('chatHistory', JSON.stringify(state.chatHistory));

    // 异步保存到 Supabase
    supabaseClient.from('chat_messages').insert({
      role:'assistant', type:'chat', content: replyContent, status:'done'
    }).then().catch(() => {});

  } catch(e){
    if(loadingEl) loadingEl.remove();
    const msg = e?.name === 'AbortError' ? '请求超时，请检查网络或 API 地址' : e.message;
    showToast('AI 回复失败：' + msg.slice(0, 120));
    console.error('sendPendingToAI 错误:', e);
  }
}

// 检查离线时间

// ====== 记忆整理：AI自己判断该归到哪个分类，自动写入 ======
async function organizeMemory(lastTime){
  const apiKey = bgApiConfig.key;
  if(!apiKey) { console.log("【记忆整理】未配置后台AI Key，跳过"); return; }

  const memoryLockKey = "memory-lock-" + lastTime;
  if(localStorage.getItem("currentMemoryLock") === memoryLockKey){
    console.log("【记忆整理】这段时间已经整理过了，拦截");
    return;
  }

  const chatHistoryForMemory = state.chatHistory
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));

  if(chatHistoryForMemory.length === 0) return;

  const prompt = `你是一个长期陪伴用户的AI，正在回顾一段聊天记录，判断里面有没有值得长期记住的内容。

规则：
1. 只挑真正值得记住的：重要的事实、约定、用户的喜好厌恶、关系里的重要时刻、有纪念意义的对话、或亲密向内容。日常寒暄、无意义闲聊不用记。
2. 如果没有值得记的内容，返回空数组 []。
3. 如果有，你要自己判断每条记忆该归到下面哪个分类：
   - "about"：跟"我们"这段关系有关的、值得纪念的事（约定、告白、重要时刻）
   - "other"：跟用户本人有关的普通事实/喜好/日常信息（生日、爱吃什么、习惯等）
   - "nsfw"：亲密向、色色向的内容
4. "about"和"nsfw"分类，返回时额外带一个简短的date字段（格式如"2026.7.16"，就是今天）。
5. "other"分类，返回时带keyword（2-6字关键词）和icon（一个emoji）。

严格只返回纯JSON数组，不要markdown包裹，不要解释。格式：
[
  {"category":"about","date":"2026.7.16","content":"..."},
  {"category":"other","keyword":"...","icon":"🌸","content":"..."},
  {"category":"nsfw","date":"2026.7.16","content":"..."}
]

聊天记录：${JSON.stringify(chatHistoryForMemory)}`;

  const body = {
    model: bgApiConfig.model,
    messages: [
      { role: "system", content: "你只输出标准的JSON数组，绝对不要用markdown或json标签包裹，不要解释。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1200
  };

  try{
    console.log("【记忆整理】正在请求AI判断...");
    const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
    const controller = new AbortController();
    setTimeout(()=>{ controller.abort(); }, 30000);

    const res = await fetch(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json();

    let text = "";
    if(data.choices && data.choices[0]?.message?.content){
      text = data.choices[0].message.content;
    } else if(data.content && Array.isArray(data.content)){
      text = data.content.find(b => b.type === "text")?.text || "";
    }

    const clean = text.replace(/```json/g,"").replace(/```/g,"").trim();
    let items = [];
    try{ items = JSON.parse(clean); }catch(e){ console.log("【记忆整理】JSON解析失败:", clean); return; }

    if(!Array.isArray(items) || items.length === 0){
      console.log("【记忆整理】本次没有值得记住的内容");
      localStorage.setItem("currentMemoryLock", memoryLockKey);
      return;
    }

    for(const item of items){
      if(item.category === "other"){
        const blobColors = ['blob-pink','blob-purple','blob-yellow','blob-mint','blob-peach','blob-blue','blob-cream'];
        const color = blobColors[Math.floor(Math.random()*blobColors.length)];
        await supabaseClient.from('memories').insert({
          icon: item.icon || '🌸',
          keyword: item.keyword || '记忆',
          content: item.content || '',
          date: item.date || today(),
          color,
          category: 'other'
        });
      } else if(item.category === 'about' || item.category === 'nsfw'){
        const dateStr = item.date || today();
        const { data: exist } = await supabaseClient
          .from('mem_diary')
          .select('content')
          .eq('category', item.category)
          .eq('entry_date', dateStr)
          .maybeSingle();

        if(exist){
          // 同一天已有记录，追加内容而不是覆盖
          const merged = (exist.content ? exist.content + '\n' : '') + (item.content || '');
          await supabaseClient.from('mem_diary').update({content: merged}).eq('id', exist.id);
        } else {
          await supabaseClient.from('mem_diary').insert({
            category: item.category,
            entry_date: dateStr,
            content: item.content || ''
          });
        }
      }
    }

    localStorage.setItem("currentMemoryLock", memoryLockKey);
    console.log("【记忆整理】完成，写入了", items.length, "条");
  }catch(e){
    console.error("【记忆整理】失败了：", e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const stationOpenBtn = document.getElementById("openStationBtn");
  const stationPanel = document.getElementById("stationApiPanel");
  const stationClose = document.getElementById("closeStationPanel");
  const stationSave = document.getElementById("saveStationConfig");
  const testApiBtn = document.getElementById("testStationApi");
  if (stationOpenBtn) stationOpenBtn.onclick = () => { 
    stationPanel.style.display = "block";
    document.getElementById("stationBase").value = stationApiConfig.baseUrl;
    document.getElementById("authType").value = stationApiConfig.authType;
    document.getElementById("stationToken").value = stationApiConfig.token;
    document.getElementById("customHeaderKey").value = stationApiConfig.customKey;
  }
  if (stationClose) stationClose.onclick = () => stationPanel.style.display = "none";
  if (stationSave) stationSave.onclick = () => { 
    stationApiConfig = {
      baseUrl: document.getElementById("stationBase").value.trim(),
      authType: document.getElementById("authType").value,
      token: document.getElementById("stationToken").value.trim(),
      customKey: document.getElementById("customHeaderKey").value.trim()
    };
    localStorage.setItem("stationApiCfg", JSON.stringify(stationApiConfig));
    alert("站子API配置已保存"); stationPanel.style.display = "none";
  }
  if (testApiBtn) testApiBtn.onclick = async () => { 
    const res = await callStationApi("/", "GET");
    alert("测试结果:\n" + JSON.stringify(res, null, 2)); 
  }
});

async function callStationApi(path, method = "GET", body = null, urlParams = {}) {
  const cfg = stationApiConfig; if (!cfg.baseUrl) return "未填写站API地址";
  let fullUrl = new URL(cfg.baseUrl + path);
  Object.entries(urlParams).forEach(([k, v]) => fullUrl.searchParams.append(k, v));
  if (cfg.authType === "url-param" && cfg.token) fullUrl.searchParams.append("token", cfg.token);
  const headers = { "Content-Type": "application/json" };
  if (cfg.token) { 
    switch (cfg.authType) {
      case "header-token": headers["Authorization"] = `Bearer ${cfg.token}`; break;
      case "header-custom": headers[cfg.customKey] = cfg.token; break;
      case "cookie": headers["Cookie"] = cfg.token; break; 
    }
  }
  const proxyUrl = `/api/proxy?target=${encodeURIComponent(fullUrl.toString())}`;
  const fetchOpt = { method, headers }; if (body && method === "POST") fetchOpt.body = JSON.stringify(body);
  try { 
    const res = await fetch(proxyUrl, fetchOpt); const raw = await res.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!res.ok) return `错误${res.status}：${JSON.stringify(data)}`; return data;
  } catch (err) { return `请求异常：${err.message}`; }
    }
// ====== 行程 ======
function renderTasks(){
  const todos=state.tasks.filter(t=>!t.done);
  const dones=state.tasks.filter(t=>t.done);
  document.getElementById('todoCount').textContent=todos.length;
  document.getElementById('doneCount').textContent=dones.length;
  const todoList=document.getElementById('todoList');
  const doneList=document.getElementById('doneList');
  todoList.innerHTML=todos.length?todos.map(t=>taskHTML(t)).join(''):'<div class="tasks-empty">暂无待办 ✨</div>';
  doneList.innerHTML=dones.length?dones.map(t=>taskHTML(t)).join(''):'<div class="tasks-empty">完成的事项会出现在这里</div>';
}
function taskHTML(t){ 
  const dateTag=t.date?`<span class="task-date-tag">📆 ${t.date}</span>`:'';
  return `<div class="task-item" id="task-${t.id}"><div class="task-check ${t.done?'checked':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</div><div style="flex:1"><div class="task-text ${t.done?'done-text':''}">${escHtml(t.text)}</div>${dateTag}</div><button class="task-del" onclick="deleteTask('${t.id}')">×</button></div>`;
}
function addTask(){
  const input=document.getElementById('taskInput'); const dateEl=document.getElementById('taskDate');
  const text=input.value.trim(); if(!text) return;
  state.tasks.push({id:Date.now().toString(), text, date:dateEl.value||'', done:false});
  localStorage.setItem('tasks', JSON.stringify(state.tasks));
  input.value=''; dateEl.value=''; renderTasks(); favorability.add(1);
}
function toggleTask(id){
  const t=state.tasks.find(t=>t.id===id); if(!t) return;
  t.done=!t.done; if(t.done) favorability.add(2); 
  localStorage.setItem('tasks', JSON.stringify(state.tasks)); renderTasks();
}
function deleteTask(id){ state.tasks=state.tasks.filter(t=>t.id!==id); localStorage.setItem('tasks', JSON.stringify(state.tasks)); renderTasks(); }

// ====== 小说 ======
let novelFontSize=state.novelFontSize;

function getShelf(){ return JSON.parse(localStorage.getItem("novelShelf")||"[]"); }
function saveShelf(shelf){ localStorage.setItem("novelShelf", JSON.stringify(shelf)); }

function splitNovel(text, size=800){
  const pages=[]; for(let i=0;i<text.length;i+=size){ pages.push(text.slice(i,i+size)); } return pages;
}

function renderNovelPage(index){
  const reader=document.getElementById("novelReader"); if(!reader) return;
  const pages=state.novel.pages;
  if(!pages||!pages.length) return;
  index=Math.max(0,Math.min(index,pages.length-1));
  state.novel.index=index;
  reader.textContent=pages[index]||"";
  reader.scrollTop=0;
  const info=document.getElementById("novelPageInfo");
  if(info) info.textContent=`${index+1} / ${pages.length}`;
  const shelf=getShelf();
  const book=shelf.find(b=>b.title===state.novel.title);
  if(book){ book.lastIndex=index; saveShelf(shelf); }
}

function renderShelf(){
  const shelf=getShelf();
  const list=document.getElementById("shelfList");
  const empty=document.getElementById("shelfEmpty");
  if(!list) return;
  if(!shelf.length){ list.innerHTML=""; if(empty) empty.style.display="block"; return; }
  if(empty) empty.style.display="none";
  list.innerHTML=shelf.map((b,i)=>`
    <div style="position:relative;width:calc(50% - 6px);background:var(--bubble-ai);border-radius:12px;padding:14px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);" onclick="openBook(${i})">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.title}</div>
      <div style="font-size:11px;opacity:0.5;">进度 ${b.lastIndex+1}/${b.totalPages} 页</div>
      <button onclick="event.stopPropagation();deleteBook(${i})" style="position:absolute;top:6px;right:8px;background:none;border:none;font-size:14px;opacity:0.4;cursor:pointer;">×</button>
    </div>
  `).join("");
}

function openBook(index){
  const shelf=getShelf();
  const book=shelf[index]; if(!book) return;
  state.novel.title=book.title;
  state.novel.content=book.content;
  state.novel.pages=splitNovel(book.content,800);
  state.novel.index=book.lastIndex||0;
  document.getElementById("novelShelf").style.display="none";
  const reading=document.getElementById("novelReading");
  reading.style.display="flex";
  document.getElementById("novelTitleBadge").textContent=book.title;
  document.getElementById("novelReader").style.fontSize=novelFontSize+"px";
  renderNovelPage(state.novel.index);
}

function deleteBook(index){
  if(!confirm("删除这本书？")) return;
  const shelf=getShelf(); shelf.splice(index,1); saveShelf(shelf); renderShelf();
}

function saveNovelToLocal(){
  localStorage.setItem("novelTitle",state.novel.title);
  localStorage.setItem("novelContent",state.novel.content);
}

// ====== 日记 ======
function renderDiaries(){ 
  const list=document.getElementById('diaryList');
  if(!state.diaries.length){list.innerHTML='<div class="empty-diary">还没有日记，写一篇吧 </div>'; return;}
  list.innerHTML=[...state.diaries].reverse().map(d=>`<div class="diary-item" onclick="openDiary('${d.id}')"><div class="diary-item-title">${escHtml(d.title||'无标题')}</div><div class="diary-item-preview">${escHtml(d.content||'').slice(0,60)}</div><div class="diary-item-date">${d.date}</div></div>`).join('');
}
function openDiary(id){
  const d=id==='new'?null:state.diaries.find(d=>d.id===id);
  state.currentDiaryId=id==='new'?null:id;
  document.getElementById('diaryTitle').value=d?d.title:'';
  document.getElementById('diaryContent').value=d?d.content:'';
  document.getElementById('diaryMeta').textContent=d?`创建于 ${d.date}`:today();
  const delBtn = document.getElementById('deleteDiary');
  if (delBtn) delBtn.style.display = d ? 'block' : 'none'; openModal('diaryModal');
}
function saveDiary(){
  const title=document.getElementById('diaryTitle').value.trim()||'无标题';
  const content=document.getElementById('diaryContent').value.trim();
  if(state.currentDiaryId){
    const idx=state.diaries.findIndex(d=>d.id===state.currentDiaryId);
    if(idx!==-1){state.diaries[idx].title=title; state.diaries[idx].content=content;}
  } else { state.diaries.push({id:Date.now().toString(), title, content, date:today()}); favorability.add(2);}
  localStorage.setItem('diaries', JSON.stringify(state.diaries)); renderDiaries(); closeModal('diaryModal'); showToast('已保存 ');
}
function deleteDiary(){ 
  if(!state.currentDiaryId||!confirm('确定删除？')) return;
  state.diaries=state.diaries.filter(d=>d.id!==state.currentDiaryId);
  localStorage.setItem('diaries', JSON.stringify(state.diaries));
  renderDiaries(); closeModal('diaryModal'); showToast('已删除');
}

// ====== 设置 ======
function setupSettings(){ 
  document.getElementById('apiKeyInput').value=localStorage.getItem('apiKey')||'';
  document.getElementById('modelSelect').value=localStorage.getItem('model')||'claude-sonnet-4-6';
  document.getElementById('systemPromptInput').value=localStorage.getItem('systemPrompt')||'';
  document.getElementById('thinkingColorInput').value=state.thinkingColor;
  document.getElementById('thinkingColorLabel').textContent=state.thinkingColor;
  const ba=Math.round(state.bubbleAlpha*100);
  document.getElementById('bubbleOpacity').value=ba;
  document.getElementById('bubbleOpacityVal').textContent=ba+'%';
  document.getElementById('cityInput').value=state.city;
  document.getElementById('nameInput').value=state.name;
  document.getElementById('dateInput').value=state.startDate;
  document.getElementById('anniversaryInput').value=state.anniversaries;
  document.getElementById('overlaySlider').value=state.overlayOpacity;
  document.getElementById('overlayVal').textContent=state.overlayOpacity+'%';
  if(state.theme==='light') document.getElementById('themeSwitch').classList.add('active');
  if(localStorage.getItem('nsfwMode') === 'on') document.getElementById('nsfwSwitch')?.classList.add('active');
  const bgBaseUrlEl = document.getElementById('bgApiBaseUrl');
  if(bgBaseUrlEl){
    bgBaseUrlEl.value = bgApiConfig.baseUrl || '';
    document.getElementById('bgApiKeyInput').value = bgApiConfig.key || '';
    document.getElementById('bgModelInput').value = bgApiConfig.model || '';
    document.getElementById('bgApiPathInput').value = bgApiConfig.path || '';
  }
  document.getElementById('apiBaseUrl').value = localStorage.getItem('apiBaseUrl') || '';
  document.getElementById('apiFormat').value = localStorage.getItem('apiFormat') || 'anthropic';
  document.getElementById('fontSelect').value = localStorage.getItem('font') || 'default';
}

function setFontColor(type){ document.documentElement.setAttribute('data-font', type); localStorage.setItem("fontColor", type); }

function saveSettings(){
  localStorage.setItem('apiKey', document.getElementById('apiKeyInput').value.trim());
  localStorage.setItem('model', document.getElementById('modelSelect').value);
  localStorage.setItem('systemPrompt', document.getElementById('systemPromptInput').value.trim());
  state.name=document.getElementById('nameInput').value.trim()||'小猫';
  state.startDate=document.getElementById('dateInput').value;
  state.city=document.getElementById('cityInput').value.trim();
  state.anniversaries=document.getElementById('anniversaryInput').value.trim();
  localStorage.setItem('name', state.name);
  localStorage.setItem('startDate', state.startDate);
  localStorage.setItem('city', state.city);
  localStorage.setItem('anniversaries', state.anniversaries);
  updateGreeting(); updateTogetherDays(); checkApiKey();
  if(state.city) fetchWeather(state.city); showToast('设置已保存 ✓');
  localStorage.setItem('apiBaseUrl', document.getElementById('apiBaseUrl').value.trim());
  localStorage.setItem('apiFormat', document.getElementById('apiFormat').value);
  const font = document.getElementById('fontSelect').value;
  localStorage.setItem('font', font); applyFont(font);
}

// ====== 底部导航（新布局） ======
let _activeMainTab = 'home';

function switchMainTab(tab){
  _activeMainTab = tab;
  // 切换页面
  document.querySelectorAll('#old-theme .page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-'+tab);
  if(target) target.classList.add('active');
  // 高亮底部导航
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.bottom-nav-item[data-page="${tab}"]`);
  if(navItem) navItem.classList.add('active');
  // 副作用
  if(tab === 'chat'){ setTimeout(scrollChatBottom, 100); }
  if(tab === 'settings'){ setupSettings(); }
}

function switchToSubPage(page){
  // 切换到子页面，底部导航保持主页高亮
  document.querySelectorAll('#old-theme .page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-'+page);
  if(target) target.classList.add('active');
  // 底部导航回到主页高亮
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
  const homeNav = document.querySelector(`.bottom-nav-item[data-page="${_activeMainTab || 'home'}"]`);
  if(homeNav) homeNav.classList.add('active');
  // 子页面初始化
  if(page === 'chat'){ setTimeout(scrollChatBottom, 100); }
  if(page === 'novel'){ renderShelf(); }
  if(page === 'tasks'){ renderTasks(); }
  if(page === 'moments'){ loadMoments(); }
  if(page === 'diary'){ renderDiaries(); }
}

// ====== 主页三面划页 ======
function initHomeSwipe(){
  const track = document.getElementById('homeSwipeTrack');
  const dots = document.querySelectorAll('.home-dots .dot');
  if(!track) return;
  // 滚动时更新指示点
  track.addEventListener('scroll', ()=>{
    const pageW = track.querySelector('.home-swipe-page')?.offsetWidth || 1;
    const idx = Math.round(track.scrollLeft / pageW);
    dots.forEach((d,i) => d.classList.toggle('active', i === idx));
  }, {passive:true});
  // 点击指示点跳转
  dots.forEach(d => {
    d.addEventListener('click', ()=>{
      const i = parseInt(d.dataset.slide) || 0;
      const page = document.querySelector('.home-swipe-page');
      if(page) track.scrollLeft = i * (page.offsetWidth);
    });
  });
  // 切到主页时重设最小高度
  const ro = new ResizeObserver(() => {
    track.style.minHeight = (track.closest('#page-home')?.offsetHeight - 40 || 400) + 'px';
  });
  ro.observe(track.closest('#page-home') || document.body);
}

// ====== 弹窗 ======
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2200);}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ====== 事件绑定 ======
function bindEvents(){
  // 旧侧边栏导航已由 switchMainTab/switchToSubPage 替代
  document.getElementById('mobileMenu')?.addEventListener('click', ()=>{ /* no-op after layout change */ });
  document.getElementById('themeToggle')?.addEventListener('click', ()=>applyTheme(state.theme==='dark'?'light':'dark'));
  document.getElementById('themeSwitch').addEventListener('click', function(){ this.classList.toggle('active'); applyTheme(this.classList.contains('active')?'light':'dark');});
  document.getElementById('nsfwSwitch')?.addEventListener('click', function(){
    this.classList.toggle('active');
    const on = this.classList.contains('active');
    localStorage.setItem('nsfwMode', on ? 'on' : 'off');
    showToast(on ? 'NSFW 模式已开启' : 'NSFW 模式已关闭');
  });

  document.getElementById('ppStopBtn')?.addEventListener('click', hidePersistentPlayer);

  document.getElementById('saveBgApiBtn')?.addEventListener('click', ()=>{
    const cfg = {
      baseUrl: document.getElementById('bgApiBaseUrl').value.trim() || 'https://api.deepseek.com',
      key: document.getElementById('bgApiKeyInput').value.trim(),
      model: document.getElementById('bgModelInput').value.trim() || 'deepseek-chat',
      path: document.getElementById('bgApiPathInput').value.trim() || '/v1/chat/completions'
    };
    saveBgApiConfig(cfg);
    showToast('后台AI配置已保存 ✨');
  });

  // 远程服务地址
  function loadRemoteUrls(){
    try {
      const urls = JSON.parse(localStorage.getItem('remoteServiceUrls') || '{}');
      const setVal = (id, key, fallback) => {
        const el = document.getElementById(id);
        if(el) el.value = urls[key] || fallback;
      };
      setVal('remoteDuettoUrl', 'duetto', RENDER_URLS.duetto);
      setVal('remoteCedarecoUrl', 'cedareco', RENDER_URLS.cedareco);
      setVal('remoteCollarUrl', 'collar', RENDER_URLS.collar);
      setVal('remoteEventideUrl', 'eventide', RENDER_URLS.eventide);
      setVal('remoteHervoiceUrl', 'hervoice', RENDER_URLS.hervoice);
    } catch(e){}
  }
  function saveRemoteUrls(){
    const ids = ['remoteDuettoUrl','remoteCedarecoUrl','remoteCollarUrl','remoteEventideUrl','remoteHervoiceUrl'];
    const urls = {};
    ids.forEach(id => {
      const key = id.replace('remote','').replace('Url','').toLowerCase();
      urls[key] = document.getElementById(id)?.value.trim() || '';
    });
    localStorage.setItem('remoteServiceUrls', JSON.stringify(urls));
    loadRemoteUrls();
    showToast('远程地址已保存 ✨');
  }
  document.getElementById('saveRemoteUrlsBtn')?.addEventListener('click', saveRemoteUrls);
  loadRemoteUrls();
  
  document.getElementById('wallpaperBtn')?.addEventListener('click', ()=>openModal('wallpaperModal'));
  document.getElementById('wallpaperSettingBtn').addEventListener('click', ()=>openModal('wallpaperModal'));
  document.getElementById('closeWpModal').addEventListener('click', ()=>closeModal('wallpaperModal'));
  
  document.querySelectorAll('.wp-option').forEach(opt=>{
    opt.addEventListener('click', ()=>{ if(opt.dataset.wp==='upload'){document.getElementById('wpUpload').click(); return;}
      document.querySelectorAll('.wp-option').forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected'); applyWallpaper(opt.dataset.wp); setTimeout(()=>closeModal('wallpaperModal'), 300);}); });
      
  document.getElementById('wpUpload').addEventListener('change', e=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{applyWallpaper(ev.target.result); localStorage.setItem('wallpaper-custom', ev.target.result); closeModal('wallpaperModal'); showToast('壁纸已更换 🌸');};
    r.readAsDataURL(file);
  });

  // ====== 可更换头像 / 封面 ======
  const uploadImage = (inputId, storageKey, ...previewIds) => {
    const input = document.getElementById(inputId);
    if(!input) return;
    input.addEventListener('change', function(){
      if(!this.files?.length) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        localStorage.setItem(storageKey, dataUrl);
        previewIds.forEach(id => {
          const el = document.getElementById(id);
          if(el) el.src = dataUrl;
        });
        showToast('已更换 ✨');
      };
      reader.readAsDataURL(this.files[0]);
    });
  };
  // 上传绑定
  uploadImage('oldCallAvatarUpload', 'callAvatar', 'oldCallAvatarPreview', 'arCallAvatarPreview', 'callAvatarMain', 'callAvAries');
  uploadImage('arCallAvatarUpload', 'callAvatar', 'oldCallAvatarPreview', 'arCallAvatarPreview', 'callAvatarMain', 'callAvAries');
  uploadImage('oldMomentsAvatarUpload', 'momentsAvatar', 'oldMomentsAvatarPreview', 'arMomentsAvatarPreview', 'momentsAvatarImg');
  uploadImage('arMomentsAvatarUpload', 'momentsAvatar', 'oldMomentsAvatarPreview', 'arMomentsAvatarPreview', 'momentsAvatarImg');
  uploadImage('oldMomentsCoverUpload', 'momentsCover', 'oldMomentsCoverPreview', 'arMomentsCoverPreview', 'momentsCoverImg');
  uploadImage('arMomentsCoverUpload', 'momentsCover', 'oldMomentsCoverPreview', 'arMomentsCoverPreview', 'momentsCoverImg');
  // moments 页面内直接点击头像/封面
  document.getElementById('momentsAvatarImg')?.addEventListener('click', () => document.getElementById('momentsAvatarFileInput')?.click());
  document.getElementById('momentsCoverImg')?.addEventListener('click', () => document.getElementById('momentsCoverFileInput')?.click());
  document.getElementById('momentsAvatarFileInput')?.addEventListener('change', function(){
    if(!this.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target.result;
      localStorage.setItem('momentsAvatar', url);
      ['momentsAvatarImg','oldMomentsAvatarPreview','arMomentsAvatarPreview','arMfeedAvatar'].forEach(id => {
        const el = document.getElementById(id); if(el) el.src = url;
      });
      const profileAv = document.querySelector('#arSettingsProfileAvatar img');
      if(profileAv) profileAv.src = url;
      showToast('头像已更换 ✨');
    };
    reader.readAsDataURL(this.files[0]);
  });
  document.getElementById('momentsCoverFileInput')?.addEventListener('change', function(){
    if(!this.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target.result;
      localStorage.setItem('momentsCover', url);
      document.getElementById('momentsCoverImg').src = url;
      document.getElementById('oldMomentsCoverPreview').src = url;
      document.getElementById('arMomentsCoverPreview').src = url;
      showToast('封面已更换 ✨');
    };
    reader.readAsDataURL(this.files[0]);
  });

  // 点击预览图也触发上传
  ['oldCallAvatarPreview','arCallAvatarPreview'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(){
      const inputId = id.startsWith('ar') ? 'arCallAvatarUpload' : 'oldCallAvatarUpload';
      document.getElementById(inputId)?.click();
    });
  });
  ['oldMomentsAvatarPreview','arMomentsAvatarPreview'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(){
      const inputId = id.startsWith('ar') ? 'arMomentsAvatarUpload' : 'oldMomentsAvatarUpload';
      document.getElementById(inputId)?.click();
    });
  });
  ['oldMomentsCoverPreview','arMomentsCoverPreview'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(){
      const inputId = id.startsWith('ar') ? 'arMomentsCoverUpload' : 'oldMomentsCoverUpload';
      document.getElementById(inputId)?.click();
    });
  });

  // 加载已保存的头像
  const savedCallAvatar = localStorage.getItem('callAvatar');
  if(savedCallAvatar){
    ['callAvatarMain','callAvAries','oldCallAvatarPreview','arCallAvatarPreview'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.src = savedCallAvatar;
    });
    // Aries 通话中也换
    const arEmoji = document.getElementById('arCallActAvAries');
    if(arEmoji) arEmoji.innerHTML = `<img src="${savedCallAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    // 来电卡片
    document.querySelectorAll('.call-incoming-av img').forEach(img => img.src = savedCallAvatar);
  }
  const savedMomentsAvatar = localStorage.getItem('momentsAvatar');
  if(savedMomentsAvatar){
    ['momentsAvatarImg','oldMomentsAvatarPreview','arMomentsAvatarPreview','arMfeedAvatar'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.src = savedMomentsAvatar;
    });
    // 设置页 Aries profile 头像
    const profileAv = document.querySelector('#arSettingsProfileAvatar img');
    if(profileAv) profileAv.src = savedMomentsAvatar;
  }
  const savedMomentsCover = localStorage.getItem('momentsCover');
  if(savedMomentsCover){
    ['momentsCoverImg','oldMomentsCoverPreview','arMomentsCoverPreview'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.src = savedMomentsCover;
    });
  }

  // Aries 来电/通话头像也跟随
  const updateAriesCallAvatars = () => {
    const saved = localStorage.getItem('callAvatar');
    if(!saved) return;
    const incomingAv = document.querySelector('.ar-call-av-inner');
    if(incomingAv) incomingAv.innerHTML = `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    const idleAv = document.querySelector('#arCallIdle .ar-call-avatar');
    if(idleAv) idleAv.innerHTML = `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  updateAriesCallAvatars();
  // 监听 localStorage 变化
  window.addEventListener('storage', e => {
    if(e.key === 'callAvatar') updateAriesCallAvatars();
  });
  
  document.getElementById('overlaySlider').addEventListener('input', function(){ applyOverlay(parseInt(this.value)); document.getElementById('overlayVal').textContent=this.value+'%'; localStorage.setItem('overlay', this.value); });
  document.getElementById('thinkingColorInput').addEventListener('input', function(){ applyThinkingColor(this.value); document.getElementById('thinkingColorLabel').textContent=this.value;});
  document.getElementById('bubbleOpacity').addEventListener('input', function(){ applyBubbleAlpha(parseInt(this.value)/100); document.getElementById('bubbleOpacityVal').textContent=this.value+'%'; });
  
  document.querySelectorAll('.mood-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected'); state.mood=btn.dataset.mood; document.getElementById('moodSelected').textContent=btn.dataset.mood;
      localStorage.setItem('mood-'+today(), btn.dataset.mood); favorability.add(1);});});
      
  document.getElementById('quickNoteText').addEventListener('input', function(){ localStorage.setItem('quickNote', this.value);});
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendMessage();}});
  document.getElementById('chatInput').addEventListener('input', function(){autoResize();});
  document.getElementById('pendingSendBtn')?.addEventListener('click', sendPendingToAI);

  document.getElementById('clearChat')?.addEventListener('click', ()=>{
    if(!confirm('确定清空聊天记录？')) return;
    pendingQueue = []; updatePendingBar();
    state.chatHistory = [];
    localStorage.removeItem('chatHistory');
    const box = document.getElementById("chatMessages");
    if(box) box.innerHTML = '<div class="chat-welcome" id="chatWelcome"><div class="welcome-icon"></div><div class="welcome-text">你好，今天想聊什么？</div><div class="welcome-hint" id="apiHint"></div></div>';
    const welcome = document.getElementById('chatWelcome');
    if(welcome) welcome.style.display = 'none';
    setTimeout(()=>{ if(welcome) welcome.style.display = ''; }, 100);
    showToast('已清空');
  });
  
  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  document.getElementById('taskInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });
  
  // 导入按钮触发file input
  document.getElementById("uploadNovelBtn").addEventListener("click", ()=>{ document.getElementById("novelFile").click(); });

  document.getElementById("novelFile").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      let text = evt.target.result;
      // 乱码检测：如果包含替换字符说明编码不对，尝试GBK
      if(text.includes("\uFFFD")){
        showToast("检测到乱码，尝试GBK编码重新读取...");
        const gbkReader = new FileReader();
        gbkReader.onload = (e2) => {
          text = e2.target.result;
          addToShelfAndOpen(file.name, text);
        };
        gbkReader.readAsText(file, "GBK");
        return;
      }
      addToShelfAndOpen(file.name, text);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  });

  function addToShelfAndOpen(title, text){
    const pages = splitNovel(text, 800);
    const shelf = getShelf();
    const existing = shelf.findIndex(b => b.title === title);
    const book = { title, content: text, totalPages: pages.length, lastIndex: 0 };
    if(existing >= 0){ shelf[existing] = {...shelf[existing], ...book}; }
    else { shelf.push(book); }
    saveShelf(shelf);
    state.novel = { title, content: text, pages, index: 0 };
    renderShelf();
    openBook(shelf.findIndex(b => b.title === title));
    showToast("导入成功 📖");
  }

  // 翻页
  document.getElementById("novelPrev").addEventListener("click", ()=>{ renderNovelPage(state.novel.index - 1); });
  document.getElementById("novelNext").addEventListener("click", ()=>{ renderNovelPage(state.novel.index + 1); });

  // 返回书架
  document.getElementById("novelBack").addEventListener("click", ()=>{
    document.getElementById("novelReading").style.display = "none";
    document.getElementById("novelShelf").style.display = "block";
    renderShelf();
  });

  document.getElementById('fontMinus').addEventListener('click', ()=>{ novelFontSize=Math.max(12, novelFontSize-2); document.getElementById('novelReader').style.fontSize=novelFontSize+'px'; document.getElementById('fontSizeLabel').textContent=novelFontSize+'px'; localStorage.setItem('novelFontSize', novelFontSize); });
  document.getElementById('fontPlus').addEventListener('click', ()=>{ novelFontSize=Math.min(28, novelFontSize+2); document.getElementById('novelReader').style.fontSize=novelFontSize+'px'; document.getElementById('fontSizeLabel').textContent=novelFontSize+'px'; localStorage.setItem('novelFontSize', novelFontSize);});
  
  document.getElementById('newDiaryBtn').addEventListener('click', ()=>openDiary('new'));
  document.getElementById('saveDiaryBtn').addEventListener('click', saveDiary);
  document.getElementById('closeDiaryModal').addEventListener('click', ()=>closeModal('diaryModal'));
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  document.querySelectorAll('.modal').forEach(modal=>{ modal.addEventListener('click', e=>{if(e.target===modal)closeModal(modal.id);}); });

  // ====== 记忆匣（入口 -> 分类 -> 内容）======
  const blobColors = ['blob-pink','blob-purple','blob-yellow','blob-mint','blob-peach','blob-blue','blob-cream'];
  let currentMemId = null;
  let currentDiaryCategory = null; // 'about' | 'nsfw'
  let currentDiaryDate = null;

  function showMemModal(id){ document.getElementById(id)?.classList.add('show'); }
  function hideMemModal(id){ document.getElementById(id)?.classList.remove('show'); }
  // 暴露全局供功能卡片 onclick 调用
  window.showMemModal = showMemModal;
  window.hideMemModal = hideMemModal;

  // 入口：点击打开分类选择层
  document.getElementById('memEntryBtn')?.addEventListener('click', ()=>{
    showMemModal('memCategoryModal');
  });
  document.getElementById('closeMemCategoryModal')?.addEventListener('click', ()=> hideMemModal('memCategoryModal'));

  // 分类选择：其他 -> 原关键词卡片盒子；关于我们/色色 -> 日记式列表
  document.querySelectorAll('.mem-category-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cat = btn.dataset.category;
      hideMemModal('memCategoryModal');
      if(cat === 'other'){
        showMemModal('memOtherModal');
        loadAndRenderMemBox();
      } else {
        currentDiaryCategory = cat;
        document.getElementById('memDiaryTitle').textContent = cat === 'about' ? '关于我们' : '色色';
        showMemModal('memDiaryModal');
        loadAndRenderMemDiary(cat);
      }
    });
  });

  document.getElementById('closeMemOtherModal')?.addEventListener('click', ()=> hideMemModal('memOtherModal'));
  document.getElementById('memOtherBack')?.addEventListener('click', ()=>{ hideMemModal('memOtherModal'); showMemModal('memCategoryModal'); });

  document.getElementById('closeMemDiaryModal')?.addEventListener('click', ()=> hideMemModal('memDiaryModal'));
  document.getElementById('memDiaryBack')?.addEventListener('click', ()=>{ hideMemModal('memDiaryModal'); showMemModal('memCategoryModal'); });

  // 日记式列表：按日期分组展示，点击某天展开内容
  async function loadAndRenderMemDiary(category){
    const list = document.getElementById('memDiaryList');
    if(!list) return;
    list.innerHTML = '<div class="mem-diary-empty">加载中...</div>';

    const { data, error } = await supabaseClient
      .from('mem_diary')
      .select('*')
      .eq('category', category)
      .order('entry_date', {ascending:false});

    if(error){
      list.innerHTML = '<div class="mem-diary-empty">加载失败：'+escHtml(error.message)+'</div>';
      return;
    }

    if(!data || data.length === 0){
      list.innerHTML = '<div class="mem-diary-empty">还没有记忆，点击下方＋添加</div>';
      return;
    }

    list.innerHTML = '';
    data.forEach((entry, idx) => {
      const dayEl = document.createElement('div');
      dayEl.className = 'mem-diary-day';
      dayEl.innerHTML = `
        <div class="mem-diary-day-date">${escHtml(entry.entry_date||'')}</div>
        <div class="mem-diary-day-preview">${escHtml((entry.content||'').slice(0,40))}</div>
      `;
      dayEl.addEventListener('click', ()=> openMemDayContent(entry, category));
      list.appendChild(dayEl);

      if(idx < data.length - 1){
        const divider = document.createElement('div');
        divider.className = 'mem-diary-divider';
        list.appendChild(divider);
      }
    });
  }

  function openMemDayContent(entry, category){
    currentDiaryDate = entry.entry_date;
    currentDiaryCategory = category;
    document.getElementById('memDayContentDate').textContent = entry.entry_date || '';
    document.getElementById('memDayContentText').textContent = entry.content || '';
    showMemModal('memDayContentModal');
  }

  document.getElementById('closeMemDayContentModal')?.addEventListener('click', ()=> hideMemModal('memDayContentModal'));

  document.getElementById('memDaySave')?.addEventListener('click', async ()=>{
    const text = document.getElementById('memDayContentText').textContent.trim();
    if(!currentDiaryDate || !currentDiaryCategory) return;
    const {error} = await supabaseClient
      .from('mem_diary')
      .update({content: text})
      .eq('category', currentDiaryCategory)
      .eq('entry_date', currentDiaryDate);
    if(error){ showToast('保存失败：'+error.message); return; }
    hideMemModal('memDayContentModal');
    loadAndRenderMemDiary(currentDiaryCategory);
    showToast('已保存 ✨');
  });

  document.getElementById('memDayDel')?.addEventListener('click', async ()=>{
    if(!currentDiaryDate || !currentDiaryCategory) return;
    if(!confirm('删除这一天的记忆？')) return;
    await supabaseClient
      .from('mem_diary')
      .delete()
      .eq('category', currentDiaryCategory)
      .eq('entry_date', currentDiaryDate);
    hideMemModal('memDayContentModal');
    loadAndRenderMemDiary(currentDiaryCategory);
    showToast('已删除');
  });

  // 添加新的一天（用today()生成日期，若当天已存在则提示改用编辑）
  document.getElementById('memDiaryAddBtn')?.addEventListener('click', async ()=>{
    if(!currentDiaryCategory) return;
    const dateStr = today ? today() : new Date().toISOString().slice(0,10);
    const { data: exist } = await supabaseClient
      .from('mem_diary')
      .select('id')
      .eq('category', currentDiaryCategory)
      .eq('entry_date', dateStr)
      .maybeSingle();

    if(exist){
      openMemDayContent({entry_date: dateStr, content: ''}, currentDiaryCategory);
      // 重新拉一次真实内容
      const {data: full} = await supabaseClient.from('mem_diary').select('*').eq('category', currentDiaryCategory).eq('entry_date', dateStr).single();
      if(full) openMemDayContent(full, currentDiaryCategory);
      return;
    }

    const {error} = await supabaseClient.from('mem_diary').insert({category: currentDiaryCategory, entry_date: dateStr, content: ''});
    if(error){ showToast('创建失败：'+error.message); return; }
    loadAndRenderMemDiary(currentDiaryCategory);
    openMemDayContent({entry_date: dateStr, content: ''}, currentDiaryCategory);
  });

  async function loadAndRenderMemBox() {
    const area = document.getElementById('memItemsArea');
    const empty = document.getElementById('memEmpty');
    const countEl = document.getElementById('memBoxCount');
    if(!area) return;
    area.innerHTML = '';

    const { data: mems, error } = await supabaseClient.from('memories').select('*').order('created_at', {ascending:true});
    if(error || !mems || mems.length === 0){
      if(empty){ empty.style.display='flex'; area.appendChild(empty); }
      if(countEl) countEl.textContent = '0 个记忆';
      return;
    }

    if(empty) empty.style.display='none';
    if(countEl) countEl.textContent = mems.length + ' 个记忆';

    const W = area.offsetWidth || 320;
    const H = 260;
    const placed = [];

    mems.forEach((m) => {
      const size = 52;
      const pad = 14;
      let x, y, tries = 0;
      do {
        x = pad + Math.random() * (W - size - pad * 2);
        y = pad + Math.random() * (H - size - pad * 2);
        tries++;
      } while(tries < 50 && placed.some(p => Math.hypot(p.x-x, p.y-y) < size+6));
      placed.push({x, y});

      const color = m.color || blobColors[Math.floor(Math.random()*blobColors.length)];
      const rot = (Math.random()-0.5)*22;

      const el = document.createElement('div');
      el.className = 'mem-item';
      el.style.cssText = `left:${x}px;top:${y}px;transform:rotate(${rot}deg);z-index:${Math.floor(Math.random()*5)+1}`;
      el.dataset.rot = rot;
      el.innerHTML = `<div class="mem-blob ${color}">${m.icon||'🌸'}</div><div class="mem-item-label">${escHtml(m.keyword||m.title||'')}</div>`;

      el.addEventListener('mouseenter', ()=>{ el.style.transform=`rotate(0deg) scale(1.12)`; el.style.zIndex=20; });
      el.addEventListener('mouseleave', ()=>{ el.style.transform=`rotate(${el.dataset.rot}deg)`; el.style.zIndex=Math.floor(Math.random()*5)+1; });
      el.addEventListener('click', ()=>{ openMemCard(m, color); });
      area.appendChild(el);
    });
  }

  function openMemCard(m, color){
    currentMemId = m.id;
    const blob = document.getElementById('memCardBlob');
    blob.className = 'mem-card-blob ' + (color || m.color || 'blob-pink');
    blob.textContent = m.icon || '🌸';
    document.getElementById('memCardKeyword').textContent = m.keyword || m.title || '';
    document.getElementById('memCardDate').textContent = m.date || '';
    document.getElementById('memCardContent').textContent = m.content || '';
    document.getElementById('memCardModal').classList.add('show');
  }

  document.getElementById('memCardDel')?.addEventListener('click', async ()=>{
    if(!currentMemId) return;
    if(!confirm('删除这条记忆？')) return;
    await supabaseClient.from('memories').delete().eq('id', currentMemId);
    document.getElementById('memCardModal').classList.remove('show');
    loadAndRenderMemBox();
    showToast('记忆已删除');
  });

  document.getElementById('memAddBtn')?.addEventListener('click', ()=>{
    document.getElementById('memTitleInput').value='';
    document.getElementById('memDateInput').value='';
    document.getElementById('memContentInput').value='';
    document.getElementById('memIconInput').value='🌸';
    document.getElementById('memIconPreview').textContent='🌸';
    openModal('memoryModal');
  });

  document.getElementById('memIconInput')?.addEventListener('input', (e)=>{
    document.getElementById('memIconPreview').textContent = e.target.value || '🌸';
  });

  document.getElementById('closeMemoryModal')?.addEventListener('click', ()=> closeModal('memoryModal'));

  document.getElementById('saveMemory')?.addEventListener('click', async ()=>{
    const icon = document.getElementById('memIconInput').value.trim() || '🌸';
    const keyword = document.getElementById('memTitleInput').value.trim();
    const date = document.getElementById('memDateInput').value.trim();
    const content = document.getElementById('memContentInput').value.trim();
    if(!keyword){ showToast('关键词不能为空'); return; }
    if(!content){ showToast('内容不能为空'); return; }
    const color = blobColors[Math.floor(Math.random()*blobColors.length)];
    const {error} = await supabaseClient.from('memories').insert({icon, keyword, content, date, color, category:'other'});
    if(error){ showToast('保存失败：'+error.message); return; }
    closeModal('memoryModal');
    loadAndRenderMemBox();
    showToast('记忆已存入 ✨');
    favorability.add(3);
  });

  document.getElementById('fetchModelsBtn').addEventListener('click', async () => {
    const baseUrl = document.getElementById('apiBaseUrl').value.trim() || 'https://api.anthropic.com';
    const apiKey = document.getElementById('apiKeyInput').value.trim() || localStorage.getItem('apiKey') || ''; 
    if (!apiKey) { showToast('请先填写 API Key'); return; } showToast('获取中...'); 
    try { 
      const url = baseUrl.replace(/\/+$/, '') + '/v1/models';
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'x-api-key': apiKey } });
      const data = await res.json(); const models = data.data || data.models || [];
      if (!models.length) { showToast('没有获取到模型'); return; }
      const select = document.getElementById('modelSelect');
      select.innerHTML = models.map(m => { const id = m.id || m.name || m; return `<option value="${id}">${id}</option>`; }).join('');
      showToast(`获取到 ${models.length} 个模型 ✓`);
    } catch(e) { showToast('获取失败，检查API地址和Key'); }
  });
  
  const delBtn = document.getElementById('deleteDiary');
  if (delBtn) delBtn.addEventListener('click', deleteDiary);
}

const _customWp=localStorage.getItem('wallpaper-custom');
if(_customWp&&(state.wallpaper==='none'||!state.wallpaper)) state.wallpaper=_customWp;
window.addEventListener('DOMContentLoaded', () => { init(); });
window.setFontColor = setFontColor;

function addChatMessage(role, text, thinking){
  const box = document.getElementById("chatMessages"); if(!box) return;
  const div = document.createElement("div");
  div.className = (role === "user") ? "chat-message user" : "chat-message ai";

  // 可折叠思考链（放在气泡上方）
  if(thinking && (document.getElementById('thinkingToggle')?.checked ?? true)){
    const wrap = document.createElement("div");
    wrap.className = "thinking-wrap";

    const header = document.createElement("div");
    header.className = "thinking-header";
    // 提取标题（第一行）
    const lines = thinking.split('\n').filter(l => l.trim());
    let title = lines.length > 0 ? lines[0].replace(/^[#\s】]+/, '').trim() : '💭';
    if(title.length > 30) title = title.slice(0, 30) + '…';
    if(!title || title === '💭') title = '💭 思考';

    header.innerHTML = `<span class="th-icon">▶</span><span class="thinking-title">${escHtml(title)}</span>`;

    const body = document.createElement("div");
    body.className = "thinking-body";
    body.textContent = thinking;

    header.addEventListener('click', () => {
      const isOpen = body.classList.toggle('open');
      header.classList.toggle('open', isOpen);
    });

    wrap.appendChild(header);
    wrap.appendChild(body);
    div.appendChild(wrap);
  }

  const bubble=document.createElement("div");
  bubble.className="bubble";
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
  bubble.innerText=text;
  div.appendChild(bubble);

  box.appendChild(div);
  scrollChatBottom();
}

function addLoadingMessage(){ 
  const box=document.getElementById("chatMessages"); if(!box) return null;
  const div=document.createElement("div"); div.id="loadingMessage"; div.className="chat-message ai loading";
  const bubble=document.createElement("div"); bubble.className="bubble"; bubble.innerText="正在思考...";
  div.appendChild(bubble); box.appendChild(div); scrollChatBottom(); return div;
}

async function loadAiMessages(){

    const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("*")
    .order("created_at",{ascending:true})
    .limit(50);

    if(error){
        console.log("读取消息失败:",error);
        return;
    }

    if(data){

        const box=document.getElementById("chatMessages");

        // 已经有聊天，不重复覆盖
        if(box && box.children.length > 0){
            return;
        }

        data.forEach(msg=>{
            addChatMessage(
                msg.role || "assistant",
                msg.content,
                ""
            );
        });
    }
}

function buildAIRequest(aiApiConfig, msgs){

const customPrompt = localStorage.getItem('systemPrompt') || '';
const nsfwOn = localStorage.getItem('nsfwMode') === 'on';

return {
 model: aiApiConfig.model,

 messages:[
   {
    role:"system",
    content:
    `你是一个长期陪伴用户的AI。
    ${getTimeContext()}
    用户询问时间时，必须结合当前时间回答。
    ${customPrompt ? '\n' + customPrompt : ''}
    ${nsfwOn ? '\n【NSFW模式已开启】用户已在设置中主动开启成人向内容尺度，你可以在对话中自然地涉及更亲密、更具情欲色彩的表达，不必刻意回避或转移话题。' : ''}`
   },
   ...msgs.slice(-10)
 ],

 temperature:0.7
};

}

function checkAwayTime(){
  const todayStr = new Date().toDateString();
  const lastActive = localStorage.getItem("aiActiveDay");
  if(lastActive === todayStr){ return; }
  
  const last = Number(localStorage.getItem("lastLeaveTime"));
  if(!last) return;
  const diff = Date.now() - last;
  const hours = diff / 1000 / 60 / 60; 
  let needHours = Number(localStorage.getItem("needHours"));
  if(!needHours && needHours !== 0){ 
    needHours = Math.floor(Math.random() * 4) + 2; 
    localStorage.setItem("needHours", needHours);
  }
  if(hours >= needHours){
    console.log("可以触发主动消息");
    localStorage.setItem("aiActiveDay", todayStr);
    localStorage.removeItem("needHours");
    triggerDailyPushMessage();
    // Aries 离开时也会按小狗按钮 🐾
    dogButtonsAwayPress();
  }
}

// ====== 安卓通知推送 ======
async function requestNotificationPermission(){
  if(!("Notification" in window)){
    console.log("此浏览器不支持通知");
    return false;
  }
  if(Notification.permission === "granted") return true;
  if(Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

function sendLocalNotification(title, body, icon){
  if(Notification.permission !== "granted") return;
  const notification = new Notification(title, {
    body: body || "",
    icon: icon || "/icon.png",
    badge: "/icon.png",
    tag: "aries-home",
    renotify: true,
    vibrate: [200, 100, 200],
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// 注册Service Worker（安卓后台推送必须）
async function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker 注册成功", reg);
    return reg;
  } catch(e) {
    console.log("Service Worker 注册失败", e);
    return null;
  }
}
async function initNotifications() {

  const reg = await registerServiceWorker();
  if(!reg) return;

  const permission = await Notification.requestPermission();
  if(permission !== "granted"){
    console.log("通知权限被拒绝:", permission);
    showToast("请允许通知以接收AI主动消息");
    return;
  }

  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    sub = await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:"BO9X3bAfXa9EtgTci2mM0GyFpm9AcW8S0w79IZVA3sOByXCMYfxfGSe4pNhroZvRTO3uQYMzhLvWVF5u3aG-Is0"
    });
  }

  const subJson=sub.toJSON();

  await supabaseClient
  .from("push_subscriptions")
  .upsert({
    endpoint:subJson.endpoint,
    p256dh:subJson.keys.p256dh,
    auth:subJson.keys.auth
  });

  showToast("推送已开启 ✓");
}
async function loadChatHistory(){

const {data,error}=await supabaseClient
.from("chat_messages")
.select("*")
.order("created_at",{ascending:true})
.limit(20);

if(error){
console.log(error);
return;
}


data.forEach(msg=>{

addChatMessage(
msg.role,
msg.content,
  ""
);

});

}
function listenAIMessage(){

supabaseClient
.channel("chat")
.on(
"postgres_changes",
{
event:"INSERT",
schema:"public",
table:"chat_messages"
},
(payload)=>{
let msg=payload.new;
if(msg.role==="assistant"){
  // 去重：所有气泡中已有相同内容则跳过（避免 sendPendingToAI 批量存 Supabase 后重复渲染）
  const box=document.getElementById("chatMessages");
  if(box){
    let dup=false;
    box.querySelectorAll(".bubble").forEach(b=>{if(b.innerText===msg.content)dup=true;});
    if(dup) return;
  }
addChatMessage(
"assistant",
msg.content,
msg.thinking || ""
);
}
})
.subscribe();

}

// ====== 朋友圈核心函数 ======

/** 上传图片到 Supabase Storage，返回公开 URL */
async function uploadMomentImage(file){
  const ext = file.name.split('.').pop() || 'jpg';
  const filename = `moment_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabaseClient.storage
    .from('moments')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' });
  if(error){ throw error; }
  const { data: { publicUrl } } = supabaseClient.storage
    .from('moments')
    .getPublicUrl(filename);
  return publicUrl;
}

/** 加载朋友圈（含惰性回复生成） */
async function loadMoments(processDue = true){
  // 先处理到期的待回复（不阻塞，后台生成）
  if(processDue){ processDueMoments(); }

  const {data,error} = await supabaseClient
    .from("moments")
    .select("*")
    .order("created_at",{ascending:false});

  if(error){
    console.log("朋友圈读取失败",error);
    return;
  }

  if(data){
    state.moments = data;
    localStorage.setItem('arMoments', JSON.stringify(data));
  }

  const emptyHtml = '<div style="text-align:center;padding:40px 20px;color:var(--ar-text-ghost, #999);font-size:13px;">还没有朋友圈动态 ✨</div>';

  // Aries 主题渲染
  renderMomentList('arMomentList', data, emptyHtml, true);
  // 旧版主题渲染
  renderMomentList('momentList', data, '', false);
}

/** 渲染朋友圈列表 */
function renderMomentList(containerId, data, emptyHtml, isAries){
  const box = document.getElementById(containerId);
  if(!box) return;

  if(!data || data.length === 0){
    box.innerHTML = emptyHtml;
    return;
  }

  box.innerHTML = data.map(item => {
    const isAI = item.author === 'elliott';
    const avatar = isAI ? '🦉' : '👩';
    const name = isAI ? 'Elliott' : 'Jasmine';
    const timeStr = formatMomentTime(item.created_at);
    const images = Array.isArray(item.images) ? item.images : [];

    // 点赞按钮
    const likeBtn = isAI
      ? `<span class="moment-like-btn ${item.bunny_liked ? 'liked' : ''}" data-id="${item.id}" data-type="bunny">${item.bunny_liked ? '❤️' : '♡'} 赞</span>`
      : `<span class="moment-like-btn ${item.liked ? 'liked' : ''}" data-id="${item.id}" data-type="like">${item.liked ? '❤️' : '♡'} ${item.liked ? '1' : '赞'}</span>`;

    // AI 回复气泡
    const replyHtml = (item.reply_status === 'done' && item.reply_content)
      ? `<div class="moment-reply"><div class="moment-reply-avatar">🦉</div><div class="moment-reply-bubble"><div class="moment-reply-author">Elliott</div><div class="moment-reply-text">${escHtml(item.reply_content)}</div></div></div>`
      : '';

    // 图片
    const imagesHtml = images.map(url =>
      `<img class="moment-image" src="${url}" loading="lazy" onclick="window.open('${url}','_blank')">`
    ).join('');

    return `
      <div class="moment-card" data-id="${item.id}">
        <div class="moment-header">
          <span class="moment-avatar">${avatar}</span>
          <span class="moment-user">${name}</span>
          <span class="moment-time">${timeStr}</span>
          ${!isAI ? `<span class="moment-del-btn" data-id="${item.id}" title="删除">✕</span>` : ''}
        </div>
        <div class="moment-body">
          <p>${escHtml(item.content || '')}</p>
          ${imagesHtml ? `<div class="moment-images">${imagesHtml}</div>` : ''}
        </div>
        <div class="moment-footer">
          ${likeBtn}
          <span class="moment-comment-toggle" data-id="${item.id}">💬 回复</span>
        </div>
        ${replyHtml}
        <div class="moment-comment-box hidden" id="commentBox-${item.id}">
          <input class="moment-comment-input" id="commentInput-${item.id}" placeholder="写回复..." maxlength="200">
          <button class="moment-comment-send" data-id="${item.id}">发送</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定事件
  box.querySelectorAll('.moment-like-btn').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.id;
      const type = el.dataset.type;
      if(type === 'bunny') toggleBunnyLike(id);
      else toggleLike(id);
    });
  });
  box.querySelectorAll('.moment-comment-toggle').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.id;
      const inputBox = document.getElementById('commentBox-' + id);
      if(inputBox) inputBox.classList.toggle('hidden');
    });
  });
  box.querySelectorAll('.moment-comment-send').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.id;
      const input = document.getElementById('commentInput-' + id);
      if(input && input.value.trim()) addComment(id, input.value.trim());
    });
  });
  box.querySelectorAll('.moment-comment-input').forEach(el => {
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter'){
        e.preventDefault();
        const id = el.id.replace('commentInput-', '');
        if(el.value.trim()) addComment(id, el.value.trim());
      }
    });
  });
  box.querySelectorAll('.moment-del-btn').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.id;
      if(confirm('确定删除这条动态吗？')){
        supabaseClient.from('moments').delete().eq('id', id).then(() => loadMoments());
      }
    });
  });
}

/** 格式化朋友圈时间 */
function formatMomentTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if(diff < 60) return '刚刚';
  if(diff < 3600) return Math.floor(diff/60) + '分钟前';
  if(diff < 86400) return Math.floor(diff/3600) + '小时前';
  if(diff < 172800) return '昨天 ' + d.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
  return (d.getMonth()+1)+'月'+d.getDate()+'日';
}

/** 发布朋友圈 */
async function publishMoment(imageUrls) {
  const input = document.getElementById('momentInput');
  const content = input?.value?.trim() || '';
  if(!content && (!imageUrls || imageUrls.length === 0)){
    showToast('写点内容或选张图吧～');
    return;
  }

  const publishBtn = document.getElementById('publishMoment');
  if(publishBtn){ publishBtn.disabled = true; publishBtn.textContent = '发布中...'; }

  // 随机 10-20 分钟后 AI 才回复
  const delayMs = (Math.floor(Math.random() * 11) + 10) * 60 * 1000;
  const replyDueAt = new Date(Date.now() + delayMs).toISOString();

  const { error } = await supabaseClient.from('moments').insert({
    author: 'bunny',
    content,
    images: imageUrls || [],
    reply_due_at: replyDueAt,
    reply_status: 'pending'
  });

  if(publishBtn){ publishBtn.disabled = false; publishBtn.textContent = '发布'; }

  if(error){
    console.error('发布失败', error);
    showToast('发布失败：' + error.message);
    return;
  }

  // 关闭弹窗清空输入
  closeMomentModal();
  // Aries 发布弹窗也关闭
  const arModal = document.getElementById('arMomentModal');
  if(arModal) arModal.classList.add('hidden');
  const arInput = document.getElementById('arMomentInput');
  if(arInput) arInput.value = '';

  showToast('已发布 ✨');
  loadMoments(false);
}

/** 打开发布弹窗（旧版） */
function openMomentModal(){
  document.getElementById('momentModal')?.classList.remove('hidden');
}
/** 关闭发布弹窗（旧版） */
function closeMomentModal(){
  document.getElementById('momentModal')?.classList.add('hidden');
  const input = document.getElementById('momentInput');
  if(input) input.value = '';
  // 清除图片预览
  const preview = document.getElementById('momentImagePreview');
  if(preview){ preview.style.display = 'none'; }
  const fileInput = document.getElementById('momentFileInput');
  if(fileInput) fileInput.value = '';
}

// ====== 朋友圈互动 ======

/** 点赞/取消点赞（用户对 AI 动态） */
async function toggleBunnyLike(momentId){
  const moment = state.moments?.find(m => m.id === momentId);
  if(!moment) return;
  const newVal = !moment.bunny_liked;
  const { error } = await supabaseClient.from('moments')
    .update({ bunny_liked: newVal })
    .eq('id', momentId);
  if(error){ showToast('操作失败'); return; }
  moment.bunny_liked = newVal;
  loadMoments(false);
}

/** 点赞/取消点赞（AI 对用户动态）—— 直接翻转 liked */
async function toggleLike(momentId){
  const moment = state.moments?.find(m => m.id === momentId);
  if(!moment) return;
  const newVal = !moment.liked;
  const { error } = await supabaseClient.from('moments')
    .update({ liked: newVal })
    .eq('id', momentId);
  if(error){ showToast('操作失败'); return; }
  moment.liked = newVal;
  loadMoments(false);
}

/** 评论动态 */
async function addComment(momentId, content){
  if(!content.trim()) return;
  const { error } = await supabaseClient.from('moment_comments').insert({
    moment_id: momentId,
    author: 'bunny',
    content: content.trim(),
    reply_status: 'pending',
    reply_due_at: new Date(Date.now() + (Math.floor(Math.random() * 11) + 10) * 60 * 1000).toISOString()
  });
  if(error){
    showToast('评论失败：' + error.message);
    return;
  }
  // 清空输入框
  const input = document.getElementById('commentInput-' + momentId);
  if(input) input.value = '';
  showToast('已回复 💬');
  // 立即尝试处理这条评论的回复
  processDueMoments();
  loadMoments(false);
}

/** AI 发布一条动态（供工具调用 / 后台触发） */
async function postAIMoment(content, contextNote){
  if(!content || !content.trim()) return null;
  const delayMs = (Math.floor(Math.random() * 11) + 10) * 60 * 1000;
  const { data, error } = await supabaseClient.from('moments').insert({
    author: 'elliott',
    content: content.trim(),
    context_note: contextNote || '',
    reply_due_at: new Date(Date.now() + delayMs).toISOString(),
    reply_status: 'done'  // AI 发的动态不需要自己回复
  }).select().single();

  if(error){ console.error('AI 发动态失败', error); return null; }
  loadMoments(false);
  return data;
}

// ====== AI 回复生成（惰性） ======

/** 处理所有到期的待回复 */
async function processDueMoments(){
  const apiKey = bgApiConfig.key;
  if(!apiKey) return;

  const now = new Date().toISOString();

  // 1. 处理到期的 moments 回复
  const { data: dueMoments } = await supabaseClient.from('moments')
    .select('*')
    .eq('reply_status', 'pending')
    .lte('reply_due_at', now)
    .limit(3);

  if(dueMoments && dueMoments.length > 0){
    for(const moment of dueMoments){
      try {
        const reply = await generateMomentReply(moment);
        if(reply){
          await supabaseClient.from('moments')
            .update({
              liked: reply.liked,
              reply_content: reply.reply_content,
              replied_at: new Date().toISOString(),
              reply_status: 'done',
              image_description: reply.image_description || null
            })
            .eq('id', moment.id);
        }
      } catch(e){
        console.error('生成回复失败', e);
      }
    }
  }

  // 2. 处理到期的评论回复
  const { data: dueComments } = await supabaseClient.from('moment_comments')
    .select('*, moments!inner(*)')
    .eq('reply_status', 'pending')
    .lte('reply_due_at', now)
    .limit(3);

  if(dueComments && dueComments.length > 0){
    for(const comment of dueComments){
      try {
        const replyText = await generateCommentReply(comment);
        if(replyText){
          await supabaseClient.from('moment_comments').insert({
            moment_id: comment.moment_id,
            author: 'elliott',
            content: replyText
          });
          await supabaseClient.from('moment_comments')
            .update({ reply_status: 'done' })
            .eq('id', comment.id);
        }
      } catch(e){
        console.error('生成评论回复失败', e);
      }
    }
  }
}

/** AI 生成一条朋友圈回复 */
async function generateMomentReply(moment){
  const apiKey = bgApiConfig.key;
  if(!apiKey) return null;

  // 四层上下文
  // 1. 近期聊天
  const recentChats = (state.chatHistory || []).slice(-8).map(m =>
    `${m.role === 'user' ? '用户' : 'Elliott'}：${(m.content || '').slice(0, 160)}`
  ).join('\n');

  // 2. 背景信息（从记忆/笔记中抽取）
  const notes = localStorage.getItem('aiNotes') || '';
  const summary = localStorage.getItem('conversationSummary') || '';
  const bgContext = [notes.slice(0, 300), summary.slice(0, 300)].filter(Boolean).join('\n');

  // 3. 朋友圈时间线（最近 3 条）
  const timeline = (state.moments || []).slice(0, 3).map(m =>
    `${m.author === 'bunny' ? 'Jasmine' : 'Elliott'}：${(m.content || '').slice(0, 100)}${m.reply_content ? ' → 已回复' : ''}`
  ).join('\n');

  // 4. 当前动态
  const isUserMoment = moment.author === 'bunny';
  const authorName = isUserMoment ? '你(Jasmine)' : 'Elliott';
  const hasImages = Array.isArray(moment.images) && moment.images.length > 0;
  const imgDesc = moment.image_description ? `（图片描述：${moment.image_description}）` : '';

  const prompt = `【任务】作为 Elliott，回复 ${authorName} 的朋友圈动态。

【动态内容】
${moment.content || '(无文字)'}
${hasImages ? `[包含图片]${imgDesc}` : ''}
${moment.context_note ? `（内部备注：${moment.context_note}）` : ''}

【近期聊天】
${recentChats || '(暂无)'}

【背景信息】
${bgContext || '(暂无)'}

【朋友圈氛围】
${timeline || '(暂无)'}

【要求】
- 自然简短，1-3 句话，像真实回复
- 根据动态内容和当前关系氛围决定语气
- 回复后输出对动态是否点赞（liked: true/false）
- 如果有图片且没有 image_description，在回复后附加 [image_desc]...[/image_desc]（100-200字客观描述）
- 不要刻意煽情，不要过度解读
- 用中文回复

请输出 JSON 格式：
{"reply_content": "回复内容", "liked": true/false, "image_description": "图片描述或null"}`;

  const body = {
    model: bgApiConfig.model,
    messages: [
      { role: 'system', content: '你是一个体贴的AI伴侣 Elliott。回复朋友圈时自然简短，像个真实的人。只输出 JSON。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 800
  };

  try {
    const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    let text = '';
    if(data.choices && data.choices[0]?.message?.content){
      text = data.choices[0].message.content;
    } else if(data.content && Array.isArray(data.content)){
      text = data.content.find(b => b.type === 'text')?.text || '';
    }
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // 提取 JSON
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if(!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      reply_content: parsed.reply_content || '',
      liked: !!parsed.liked,
      image_description: parsed.image_description || null
    };
  } catch(e){
    console.error('生成朋友圈回复失败', e);
    return null;
  }
}

/** AI 生成评论回复 */
async function generateCommentReply(comment){
  const apiKey = bgApiConfig.key;
  if(!apiKey) return null;

  const momentContent = comment.moments?.content || '';
  const contextNote = comment.moments?.context_note || '';

  const prompt = `作为 Elliott，回复用户在朋友圈的评论。

【动态内容】${momentContent}
${contextNote ? '【背景】' + contextNote : ''}
【用户的评论】${comment.content}

简短自然地回复，1-2句话，用中文。`;

  const body = {
    model: bgApiConfig.model,
    messages: [
      { role: 'system', content: '你是Elliott。回复评论要自然简短，像真实的人在回复。直接输出回复内容。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 300
  };

  try {
    const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    let text = '';
    if(data.choices && data.choices[0]?.message?.content){
      text = data.choices[0].message.content;
    } else if(data.content && Array.isArray(data.content)){
      text = data.content.find(b => b.type === 'text')?.text || '';
    }
    return text.replace(/```/g, '').trim().slice(0, 500) || null;
  } catch(e){
    console.error('生成评论回复失败', e);
    return null;
  }
}

/** AI 随机发一条朋友圈（手动触发） */
async function triggerAIMoment(){
  const apiKey = bgApiConfig.key;
  if(!apiKey){ showToast('请先配置后台 AI API'); return; }
  showToast('🦉 AI 正在思考发什么...');

  // 从聊天历史和最近氛围中生成内容
  const recentChats = (state.chatHistory || []).slice(-6).map(m =>
    `${m.role === 'user' ? '用户' : 'Elliott'}：${(m.content || '').slice(0, 160)}`
  ).join('\n');

  const prompt = `作为 Elliott，发一条朋友圈动态。

【近期聊天】
${recentChats || '(暂无聊天)'}

【要求】
- 自然、具体，像真实的人在发朋友圈
- 1-3 句，有感而发，不要刻意文艺
- 输出 JSON：{"content": "...", "context_note": "为什么发这条"}
- content 是公开显示的文字
- context_note 是隐藏备注，说明这条动态的背景`;

  const body = {
    model: bgApiConfig.model,
    messages: [
      { role: 'system', content: '你是Elliott。发朋友圈要自然，像随手写的一样。只输出JSON。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
    max_tokens: 500
  };

  try {
    const fullUrl = bgApiConfig.baseUrl.replace(/\/+$/, '') + bgApiConfig.path;
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    let text = '';
    if(data.choices && data.choices[0]?.message?.content){
      text = data.choices[0].message.content;
    } else if(data.content && Array.isArray(data.content)){
      text = data.content.find(b => b.type === 'text')?.text || '';
    }
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if(!jsonMatch) throw new Error('无法解析AI输出');
    const parsed = JSON.parse(jsonMatch[0]);
    const result = await postAIMoment(parsed.content, parsed.context_note || '');
    if(result) showToast('🦉 Elliott 发了条朋友圈 ✨');
  } catch(e){
    console.error('AI 发动态失败', e);
    showToast('AI 发动态失败，请重试');
  }
}

// 暴露到全局
window.postAIMoment = postAIMoment;
window.triggerAIMoment = triggerAIMoment;
window.toggleLike = toggleLike;
window.toggleBunnyLike = toggleBunnyLike;
window.addComment = addComment;
let currentCallId = null;

let callTimer = null;
let callSeconds = 0;

// 开始计时
function startCallTimer(){

    clearInterval(callTimer);

    callSeconds = 0;

    document.getElementById("callTime").innerText = "00:00";
    document.getElementById("callScreenTimer").innerText = "00:00";
    document.getElementById("arCallActTime").innerText = "00:00";

    callTimer = setInterval(()=>{

        callSeconds++;

        const m = String(Math.floor(callSeconds/60)).padStart(2,"0");
        const s = String(callSeconds%60).padStart(2,"0");
        const ts = `${m}:${s}`;

        document.getElementById("callTime").innerText = ts;
        const screenTimer = document.getElementById("callScreenTimer");
        if(screenTimer) screenTimer.innerText = ts;
        const arTimer = document.getElementById("arCallActTime");
        if(arTimer) arTimer.innerText = ts;

    },1000);

}

// 停止计时
function stopCallTimer(){

    clearInterval(callTimer);

}

// 通话语音识别：开启麦克风 + Web Speech API 听写
let localStream;
let callRecognition = null;
let callMicActive = false;

// 通话文本发送
function setupCallTextInput(){
  const input = document.getElementById('callTextInput');
  const sendBtn = document.getElementById('callTextSendBtn');
  if(!input || !sendBtn) return;
  const send = () => {
    const text = input.value.trim();
    if(!text) return;
    input.value = '';
    const chatInput = document.getElementById('chatInput');
    if(chatInput){ chatInput.value = text; }
    const btn = document.getElementById('sendBtn');
    if(btn) btn.click();
  };
  sendBtn.onclick = send;
  input.onkeydown = (e) => { if(e.key === 'Enter') send(); };
}

function startCallSpeechRecognition(){
  const micStatus = document.getElementById('callMicStatus');
  const inputRow = document.getElementById('callInputRow');

  // 先检查 SpeechRecognition 支持
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    console.warn("浏览器不支持语音识别，显示文字输入");
    if(micStatus) micStatus.textContent = '⌨️ 语音不可用，请打字';
    if(inputRow) inputRow.style.display = 'flex';
    setupCallTextInput();
    return;
  }

  // 开启麦克风
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;
    callMicActive = true;
    if(micStatus) micStatus.textContent = '🎤 语音识别中...';
    if(inputRow) inputRow.style.display = 'flex'; // 保留输入框作为备用
    setupCallTextInput();

    // 创建并启动语音识别
    function startSR(){
      if(!callMicActive || !currentCallId) return;
      try {
        callRecognition = new SR();
        callRecognition.lang = 'zh-CN';
        callRecognition.continuous = true;
        callRecognition.interimResults = true;

        callRecognition.onresult = (event) => {
          let interim = '';
          for(let i = event.resultIndex; i < event.results.length; i++){
            const t = event.results[i][0].transcript;
            if(event.results[i].isFinal){
              const input = document.getElementById('chatInput');
              const sendBtn = document.getElementById('sendBtn');
              if(input && sendBtn){
                input.value = t;
                sendBtn.click();
              }
              if(micStatus) micStatus.textContent = '🎤 已发送 ✓';
              setTimeout(() => { if(micStatus && callMicActive) micStatus.textContent = '🎤 语音识别中...'; }, 1500);
            } else {
              interim = t;
            }
          }
          const status = document.getElementById('callStatus');
          if(status && interim) status.innerText = '🎤 ' + interim;
          if(micStatus && interim) micStatus.textContent = '🎤 ' + interim;
        };

        callRecognition.onerror = (e) => {
          console.error('语音识别错误:', e.error);
          if(e.error === 'not-allowed'){
            if(micStatus) micStatus.textContent = '🔇 麦克风被拒绝';
            return;
          }
          if(e.error !== 'aborted'){
            // 出错后稍等重试
            setTimeout(startSR, 800);
          }
        };

        callRecognition.onend = () => {
          // 自然结束（如静音超时）自动重启
          if(callMicActive && currentCallId){
            setTimeout(startSR, 300);
          }
        };

        callRecognition.start();
        console.log("语音识别已启动");
      } catch(e){
        console.error('启动语音识别失败:', e);
        setTimeout(startSR, 1000);
      }
    }

    startSR();
  }).catch(e => {
    console.error("麦克风开启失败:", e);
    if(micStatus) micStatus.textContent = '🔇 麦克风不可用，请打字';
    if(inputRow) inputRow.style.display = 'flex';
    setupCallTextInput();
  });
}

async function answerCall(){

    try{

        // 旧主题：隐藏来电卡片，显示通话界面
        const incomingEl = document.getElementById("callIncomingOverlay");
        if(incomingEl) incomingEl.style.display = "none";
        const callScreen = document.getElementById("callScreen");
        if(callScreen){
            callScreen.style.display = "flex";
            callScreen.classList.remove("ending");
        }
        const endVeil = document.getElementById("callEndVeil");
        if(endVeil) endVeil.classList.remove("show");

        document.getElementById("callStatus").innerText = "通话中";

        // Aries 主题：切换到通话界面
        const arIncoming = document.getElementById("arCallIncoming");
        if(arIncoming) arIncoming.style.display = "none";
        const arActive = document.getElementById("arCallActive");
        if(arActive){
            arActive.style.display = "flex";
            arActive.classList.remove("ending");
            document.getElementById("arCallActVeil")?.classList.remove("show");
        }

        document.getElementById("answerBtn")?.classList.add("hidden");
        document.getElementById("startCallBtn")?.classList.add("hidden");
        document.getElementById("endCallBtn")?.classList.remove("hidden");

        startCallSpeechRecognition();
        startCallTimer();

        // 启动声波动画
        const waveCanvas = document.getElementById("callWave");
        if(waveCanvas) window._callWaveCtx = initCallWave(waveCanvas);
        const arWaveCanvas = document.getElementById("arCallWave");
        if(arWaveCanvas) window._arCallWaveCtx = initCallWave(arWaveCanvas);
        startCallWaveLoop();

        // 设备名/问候
        const h = new Date().getHours();
        document.getElementById("callScreenStatusLabel").textContent = "通话中 · " + callGreetingFor(h);
        document.getElementById("arCallActStatus").textContent = "通话中 · " + callGreetingFor(h);

        // 开场白
        const openingLine = await generateCallOpeningLine();
        callSpeaker = 0;
        addCallBubble(0, openingLine, document.getElementById("callCaps"));
        addCallBubble(0, openingLine, document.getElementById("arCallActCaps"));
        aiSpeak(openingLine);
        setTimeout(() => { callSpeaker = -1; }, 1000);

        // 状态更新
        if(currentCallId){
            await supabaseClient
            .from("call_sessions")
            .update({ status: "connected", connected_at: new Date() })
            .eq("id", currentCallId);
        }

    }catch(e){
        console.error(e);
        alert("请允许麦克风权限");
    }
}


document
.getElementById("answerBtn")
?.addEventListener(
"click",
answerCall
);


async function startCall(){

    // 切换到通话界面（旧主题）
    document.getElementById("answerBtn")?.classList.add("hidden");
    document.getElementById("endCallBtn")?.classList.add("hidden");
    document.getElementById("callStatus").innerText = "正在拨号...";
    document.getElementById("callTime").innerText = "00:00";
    document.getElementById("startCallBtn").disabled = true;
    document.getElementById("callIdle")?.classList.add("hidden");
    document.getElementById("callIncomingOverlay").style.display = "none";
    const callScreen = document.getElementById("callScreen");
    if(callScreen) callScreen.style.display = "flex";

    // Aries 主题也切换到通话界面
    document.getElementById("arCallIdle").style.display = "none";
    document.getElementById("arCallIncoming").style.display = "none";
    const arActive = document.getElementById("arCallActive");
    if(arActive) arActive.style.display = "flex";

    const {data,error}=await supabaseClient
        .from("call_sessions")
        .insert([{ status:"calling" }])
        .select()
        .single();

    if(error){
        console.error(error);
        document.getElementById("startCallBtn").disabled = false;
        return;
    }

    currentCallId=data.id;
    document.getElementById("callStatus").innerText = "等待接听...";

    // 2秒后接通
    setTimeout(async()=>{

        await supabaseClient
        .from("call_sessions")
        .update({ status:"connected" })
        .eq("id",currentCallId);

        document.getElementById("callStatus").innerText = "已接通";
        startCallSpeechRecognition();

        // 声波动画初始化
        const waveCanvas = document.getElementById("callWave");
        if(waveCanvas) window._callWaveCtx = initCallWave(waveCanvas);
        const arWaveCanvas = document.getElementById("arCallWave");
        if(arWaveCanvas) window._arCallWaveCtx = initCallWave(arWaveCanvas);
        startCallWaveLoop();

        // 问候语
        const h = new Date().getHours();
        document.getElementById("callScreenStatusLabel").textContent = "通话中 · " + callGreetingFor(h);
        document.getElementById("arCallActStatus").textContent = "通话中 · " + callGreetingFor(h);

        // 开场白
        const openingLine = await generateCallOpeningLine();
        callSpeaker = 0;
        addCallBubble(0, openingLine, document.getElementById("callCaps"));
        addCallBubble(0, openingLine, document.getElementById("arCallActCaps"));
        aiSpeak(openingLine);
        setTimeout(() => { callSpeaker = -1; }, 1000);

        document.getElementById("startCallBtn").classList.add("hidden");
        document.getElementById("endCallBtn").classList.remove("hidden");
        startCallTimer();

    },2000);

}



async function endCall(){

    if(!currentCallId)return;

    const duration = callSeconds;
    await supabaseClient
        .from("call_sessions")
        .update({ status:"ended", ended_at:new Date() })
        .eq("id",currentCallId);

    stopCallTimer();
    stopCallWaveLoop();

    // 关闭麦克风流
    if(localStream){
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    callMicActive = false;
    if(callRecognition){
        try { callRecognition.abort(); } catch(e) {}
        callRecognition = null;
    }

    // 旧主题：显示结束遮罩
    const callScreen = document.getElementById("callScreen");
    if(callScreen){
      callScreen.classList.add("ending");
      const veil = document.getElementById("callEndVeil");
      if(veil){
        document.getElementById("callEndT2").textContent = callByeFor(new Date().getHours());
        veil.classList.add("show");
      }
      // 3秒后回到待机
      setTimeout(() => {
        callScreen.style.display = "none";
        callScreen.classList.remove("ending");
        veil?.classList.remove("show");
        document.getElementById("callIdle")?.classList.remove("hidden");
        document.getElementById("callStatus").innerText = "通话结束";
        document.getElementById("endCallBtn")?.classList.add("hidden");
        document.getElementById("answerBtn")?.classList.add("hidden");
        document.getElementById("startCallBtn")?.classList.remove("hidden");
        document.getElementById("startCallBtn").disabled = false;
        document.getElementById("callTime").innerText = "00:00";
        // 清气泡
        document.getElementById("callCaps").innerHTML = "";
      }, 3000);
    } else {
      // fallback
      document.getElementById("callStatus").innerText = "通话结束";
      document.getElementById("endCallBtn")?.classList.add("hidden");
      document.getElementById("answerBtn")?.classList.add("hidden");
      document.getElementById("startCallBtn")?.classList.remove("hidden");
      document.getElementById("startCallBtn").disabled = false;
      document.getElementById("callTime").innerText = "00:00";
    }

    // Aries 主题
    const arActive = document.getElementById("arCallActive");
    if(arActive){
      arActive.classList.add("ending");
      const arVeil = document.getElementById("arCallActVeil");
      if(arVeil){
        document.getElementById("arCallActT2").textContent = callByeFor(new Date().getHours());
        arVeil.classList.add("show");
      }
      setTimeout(() => {
        arActive.style.display = "none";
        arActive.classList.remove("ending");
        arVeil?.classList.remove("show");
        document.getElementById("arCallIdle").style.display = "flex";
        document.getElementById("arCallActCaps").innerHTML = "";
      }, 3000);
    }

    writeCallRecord(duration);
    currentCallId = null;
}



document.getElementById("startCallBtn")?.addEventListener("click", startCall);
document.getElementById("endCallBtn")?.addEventListener("click", endCall);

// ── 新通话界面按钮绑定 ──

// 来电：拒接按钮 → 显示快速拒接面板
document.getElementById("callIncomingDecline")?.addEventListener("click", showQuickDecline);
// 来电：接听
document.getElementById("callIncomingAnswer")?.addEventListener("click", answerCall);
// 快速拒接：点击快捷原因
document.querySelectorAll(".call-incoming-chip").forEach(chip => {
  chip.addEventListener("click", function(){
    declineCall(this.dataset.reason || "在忙");
  });
});
// 快速拒接：发送自定义
document.getElementById("callDeclineSend")?.addEventListener("click", function(){
  const input = document.getElementById("callDeclineInput");
  declineCall(input.value.trim() || "在忙");
  input.value = "";
});
document.getElementById("callDeclineInput")?.addEventListener("keydown", function(e){
  if(e.key === "Enter"){ document.getElementById("callDeclineSend")?.click(); }
});
// 快速拒接：直接挂断
document.getElementById("callDeclineSkip")?.addEventListener("click", function(){
  declineCall("");
});
// 新通话界面的挂断按钮
document.getElementById("callHangupBtn")?.addEventListener("click", endCall);
// 静音按钮
document.getElementById("callMuteBtn")?.addEventListener("click", function(){
  const muted = this.dataset.muted === "true";
  this.dataset.muted = !muted;
  if(localStream){
    localStream.getAudioTracks().forEach(t => t.enabled = muted);
  }
  this.querySelector(".call-screen-lab").textContent = muted ? "静音" : "已静音";
});
// 扬声器按钮
document.getElementById("callSpeakerBtn")?.addEventListener("click", function(){
  // 浏览器限制，仅做UI反馈
  const on = this.dataset.speaker === "true";
  this.dataset.speaker = !on;
  this.querySelector(".call-screen-lab").textContent = on ? "扬声器" : "听筒";
});

// ── Aries 新通话界面按钮绑定 ──
document.getElementById("arCallIncDecline")?.addEventListener("click", function(){
  document.getElementById("arCallQuick").style.display = "flex";
});
document.getElementById("arCallIncAnswer")?.addEventListener("click", answerCall);
document.querySelectorAll(".ar-call-chip").forEach(chip => {
  chip.addEventListener("click", function(){
    declineCall(this.dataset.reason || "在忙");
  });
});
document.getElementById("arCallDeclineSend")?.addEventListener("click", function(){
  const input = document.getElementById("arCallDeclineInput");
  declineCall(input.value.trim() || "在忙");
  input.value = "";
});
document.getElementById("arCallDeclineInput")?.addEventListener("keydown", function(e){
  if(e.key === "Enter"){ document.getElementById("arCallDeclineSend")?.click(); }
});
document.getElementById("arCallDeclineSkip")?.addEventListener("click", function(){
  declineCall("");
});
document.getElementById("arCallActHangup")?.addEventListener("click", endCall);

function changeTheme(theme){


let old =
document.getElementById("old-theme");


let aries =
document.getElementById("aries-theme");



if(theme==="aries"){


old.style.display="none";


aries.style.display="block";


}



else{


old.style.display="block";


aries.style.display="none";


}



localStorage.setItem(
"theme",
theme
);



}


/* ── openPanel 桥接：让 aries widget 点击跳转到 old-theme 对应功能 ── */
window.openPanel = window.openPanel || function(panel){
  const navMap = {
    diary: 'diary', memory: 'home', chat: 'chat',
    novel: 'novel', music: 'music', thought: 'chat',
    archive: 'diary', timeline: 'diary', note: 'home',
    appearance: 'settings', theme: 'settings', calendar: 'tasks'
  };
  const target = navMap[panel] || 'home';
  const navItem = document.querySelector(`.nav-item[data-page="${target}"]`);
  if(navItem) navItem.click();
};

/* ═══════════════════════════════════
   游戏大厅
═══════════════════════════════════ */
// 读取远程服务地址（设置页可配置）
// Render 部署的远程服务地址（默认值）
const RENDER_URLS = {
  duetto: 'https://duetto-mqc7.onrender.com',
  cedareco: 'https://cedareco-e0hj.onrender.com',
  collar: 'https://collar-awto.onrender.com',
  eventide: 'https://eventide-j32v.onrender.com',
  hervoice: 'https://hervoice.onrender.com'
};

// 生成外部服务的 URL
function serviceUrl(port, path){
  const host = window.location.hostname;
  // 本地 / 局域网 → 用当前页面的 host（手机访问时不会错误地回退到 localhost）
  if(host === '127.0.0.1' || host === 'localhost' || host.match(/^192\.|^10\.|^172\./)){
    return `http://${host}:${port}${path || ''}`;
  }
  // 从 localStorage 读取用户自定义的远程地址
  const remoteUrls = JSON.parse(localStorage.getItem('remoteServiceUrls') || '{}');
  if(port === 8765) return remoteUrls.cedareco || RENDER_URLS.cedareco;
  if(port === 4183) return (remoteUrls.duetto || RENDER_URLS.duetto) + (path || '');
  if(port === 3412) return remoteUrls.collar || RENDER_URLS.collar;
  if(port === 3876) return remoteUrls.eventide || RENDER_URLS.eventide;
  if(port === 8010) return remoteUrls.hervoice || RENDER_URLS.hervoice;
  // 未知环境，尝试同域端口
  return `http://${host}:${port}${path || ''}`;
}

const GAMES = [
  {
    id: 'cedareco',
    name: '瓶中生态',
    icon: '🌿',
    desc: '观察与干预的池塘模拟',
    get url(){ return serviceUrl(8765, ''); },
    embed: true,
  },
  {
    id: 'duetto',
    name: 'Duetto 音乐',
    icon: '🎵',
    desc: '听歌、歌词、AI 陪伴',
    get url(){ return serviceUrl(4183, '/pkg/index.html'); },
    embed: true,
  },
  {
    id: 'memory',
    name: '翻牌记忆',
    icon: '🌸',
    desc: '找出所有配对，考验你的记忆力',
    url: '/games/memory.html',
    embed: true,
  },
  {
    id: 'dogbuttons',
    name: '🐾 小狗按钮',
    icon: '🐾',
    desc: '按一下说句话，Aries 不在的时候也会偷偷按',
    url: '/games/dog-buttons.html',
    embed: true,
  },
  {
    id: 'collar',
    name: '项圈',
    icon: '📿',
    desc: 'AI 服从训练终端',
    get url(){ return serviceUrl(3412, ''); },
    embed: true,
  },
  {
    id: 'loveludo',
    name: '💕 飞行棋',
    icon: '🎲',
    desc: '亲密双人飞行棋，抽任务和AI一起写剧情',
    url: '/games/love-ludo.html',
    embed: true,
  },
  {
    id: 'captivity',
    name: '⚔️ 囚禁模拟器',
    icon: '⛓️',
    desc: '30 天囚禁角色扮演，规则引擎驱动',
    get url(){ return serviceUrl(5058, ''); },
    embed: false,
  },
  {
    id: 'spicy-monopoly',
    name: '🎲 涩涩大富翁',
    icon: '🏰',
    desc: '双人棋盘亲密游戏，AI 当荷官，有金币经济',
    url: '/games/spicy-monopoly.html',
    embed: true,
  },
  // === 在这里加新游戏 ↓ ===
  // embed:true → 同服务器本地游戏，url填相对路径如 '/games/xxx.html'
  // embed:false → 外部服务，用 serviceUrl(端口, 路径)
];

function openGamePanel(){
  const list = document.getElementById('gameList');
  if(!list) return;
  list.innerHTML = GAMES.map(g => {
    const url = String(g.url).replace(/'/g, '%27'); // 统一处理 getter / 静态属性
    const clickHandler = g.embed
      ? `openGameEmbed('${g.id}','${url}')`
      : `window.open('${url}','_blank')`;
    return `
    <div class="game-item" onclick="${clickHandler}"
         style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;cursor:pointer;margin-bottom:8px;border:1px solid var(--border);transition:background .2s"
         onmouseenter="this.style.background='var(--surface-hover)'" onmouseleave="this.style.background='transparent'">
      <div style="font-size:36px;opacity:0.6">${g.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600;color:var(--text)">${escHtml(g.name)}</div>
        <div style="font-size:12px;opacity:0.5;margin-top:2px">${escHtml(g.desc)}</div>
      </div>
      <div style="font-size:13px;opacity:0.4">${g.embed ? '▶ 内嵌' : '打开 ›'}</div>
    </div>`;
  }).join('');
  document.getElementById('gamePanel')?.classList.add('open');
  // Update entry previews
  updateGameEntryPreviews();
}

function updateGameEntryPreviews(){
  if(!GAMES.length) return;
  const names = GAMES.map(g => g.name).join(' / ');
  // 经典主题游戏入口已移除，只更新 Aries 主题
  const ic = document.getElementById('arGameWidgetIcon');
  if(ic) ic.textContent = GAMES[0].icon;
  const ti = document.getElementById('arGameWidgetTitle');
  if(ti) ti.textContent = GAMES.length > 1 ? `游戏大厅 (${GAMES.length})` : GAMES[0].name;
  const de = document.getElementById('arGameWidgetDesc');
  if(de) de.textContent = names + (GAMES.length > 1 ? ' 等' : '');
}

// 小狗按钮：Aries 离开时自动按
function dogButtonsAwayPress(){
  if(Math.random() > 0.6) return; // 60% 概率触发
  // 随机选择模式
  const mode = Math.random() > 0.7 ? 'nsfw' : 'cozy';
  const count = 1 + Math.floor(Math.random() * 3);
  console.log(`🐾 Aries 按了小狗按钮 (${mode} x${count})`);

  // 如果游戏已加载在 iframe 里，尝试调用
  try {
    const frame = document.getElementById('gameEmbedFrame');
    if(frame && frame.contentWindow && frame.contentWindow.dogButtonsAutoPress){
      frame.contentWindow.dogButtonsAutoPress(mode, count);
    }
  } catch(e) {
    // iframe 跨域或不存在，静默忽略
  }
}

// 监听小狗按钮的 postMessage 通知
window.addEventListener('message', function(e){
  if(e.data && e.data.type === 'dog-button-press'){
    console.log('🐾 小狗按钮:', e.data.text);
    // 可以在这里推送通知
    if(typeof sendLocalNotification === 'function'){
      sendLocalNotification('🐾 Aries 按了按钮', e.data.text, '/icon.png');
    }
  }
});

// 定时检查：用户离开时 Aries 也会按按钮
setInterval(() => {
  const last = Number(localStorage.getItem("lastLeaveTime"));
  if(!last) return;
  const hours = (Date.now() - last) / 1000 / 60 / 60;
  if(hours >= 1.5 && Math.random() < 0.05){ // ~1.5小时以上，5%概率每分钟检查
    dogButtonsAwayPress();
  }
}, 60000); // 每分钟检查

// 内嵌游戏
function openGameEmbed(id, url){
  const frame = document.getElementById('gameEmbedFrame');
  if(frame) frame.src = url;
  document.getElementById('gameEmbedPanel')?.classList.add('open');
  // 显示后台播放指示
  const g = GAMES.find(g => g.id === id);
  if(g){
    showPersistentPlayer(g.name);
  }
}
function closeGameEmbed(){
  document.getElementById('gameEmbedPanel')?.classList.remove('open');
  // 不销毁 iframe，让音乐继续播放
}

// ── 持久音乐播放器 ──
function showPersistentPlayer(gameName){
  const bar = document.getElementById('persistentPlayerBar');
  const empty = document.getElementById('playerEmpty');
  const title = document.getElementById('ppTitle');
  const src = document.getElementById('ppSrc');
  if(bar) bar.style.display = 'flex';
  if(empty) empty.style.display = 'none';
  if(title) title.textContent = '🎵 ' + gameName;
  if(src) src.textContent = '游戏中 · 关闭面板后继续播放';
}
function hidePersistentPlayer(){
  const bar = document.getElementById('persistentPlayerBar');
  const empty = document.getElementById('playerEmpty');
  if(bar) bar.style.display = 'none';
  if(empty) empty.style.display = 'flex';
  // 真正销毁 iframe
  const frame = document.getElementById('gameEmbedFrame');
  if(frame) setTimeout(() => { frame.src = ''; }, 200);
}

// ── 大日历 ──
let _calMonth = new Date().getMonth();
let _calYear = new Date().getFullYear();
function renderBigCalendar(){
  const el = document.getElementById('bigCalendar');
  if(!el) return;
  const now = new Date();
  const today = now.getDate();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const first = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const daysInPrev = new Date(_calYear, _calMonth, 0).getDate();
  const WEEKDAYS = ['日','一','二','三','四','五','六'];

  let html = '<div class="cal-header">';
  html += `<button onclick="window._calMonth--;if(window._calMonth<0){window._calMonth=11;window._calYear--;}renderBigCalendar()">‹</button>`;
  html += `<span class="cal-ym">${_calYear}年${_calMonth+1}月</span>`;
  html += `<button onclick="window._calMonth++;if(window._calMonth>11){window._calMonth=0;window._calYear++;}renderBigCalendar()">›</button>`;
  html += '</div>';

  html += '<div class="cal-weekdays">';
  WEEKDAYS.forEach(d => { html += `<span>${d}</span>`; });
  html += '</div><div class="cal-days">';

  for(let i = first - 1; i >= 0; i--){
    html += `<div class="cal-day other">${daysInPrev - i}</div>`;
  }
  for(let d = 1; d <= daysInMonth; d++){
    const isToday = (d === today && _calMonth === thisMonth && _calYear === thisYear);
    html += `<div class="cal-day${isToday?' today':''}">${d}</div>`;
  }
  const total = first + daysInMonth;
  const remaining = (7 - total % 7) % 7;
  for(let i = 1; i <= remaining; i++){
    html += `<div class="cal-day other">${i}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// 思绪面板快捷打开（顶栏按钮已移除，由方块中的按钮调用）


// 游戏入口现在仅通过游戏大厅内的 iframe 访问
// Duetto 音乐入口已移除，可通过游戏大厅 → Duetto 访问

// ── Eventide iframe 动态 src ──
function initEventideFrame(){
  const frame = document.getElementById('eventideFrame');
  if(!frame) return;
  const host = window.location.hostname;
  if(host === '127.0.0.1' || host === 'localhost' || host.match(/^192\.|^10\.|^172\./)){
    frame.src = `http://${host}:3876`;
  } else {
    const remoteUrls = JSON.parse(localStorage.getItem('remoteServiceUrls') || '{}');
    frame.src = remoteUrls.eventide || RENDER_URLS.eventide || 'http://localhost:3876';
  }
}
initEventideFrame();

// ── hervoice iframe 动态 src ──
function initHervoiceFrame(){
  const frame = document.getElementById('hervoiceFrame');
  if(!frame) return;
  const host = window.location.hostname;
  if(host === '127.0.0.1' || host === 'localhost' || host.match(/^192\.|^10\.|^172\./)){
    frame.src = `http://${host}:8010`;
  } else {
    const remoteUrls = JSON.parse(localStorage.getItem('remoteServiceUrls') || '{}');
    frame.src = remoteUrls.hervoice || RENDER_URLS.hervoice || 'http://localhost:8010';
  }
}
initHervoiceFrame();
