const supabaseClient = supabase.createClient(
  "https://lqcuklhldvkwbkpftjzu.supabase.co",
  "sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow"
);
async function testDailyChatCount(){

  alert("进入测试函数");

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);

  const {data,error}=await supabaseClient
    .from("chat_messages")
    .select("*")
    .gte(
      "created_at",
      todayStart.toISOString()
    );

  if(error){
    console.log(error);
    alert(error.message);
    return;
  }

  let limit;

  if(data.length < 20){
    limit=Math.floor(Math.random()*4)+7;
  }
  else if(data.length < 100){
    limit=Math.floor(Math.random()*4)+3;
  }
  else{
    limit=Math.floor(Math.random()*3)+1;
  }

  alert(
    "今日聊天数量："+data.length+
    "\n今日主动额度："+limit
  );
  const text = await generateAIMessage();
  alert(text);
await supabaseClient
.from("ai_messages")
.insert({
 type:"message",
 content:"测试主动消息"
});

  console.log(data,error);
}

async function generateAIMessage(){

  alert("进入AI生成");

  const msgs=[
    {
      role:"user",
      content:"请主动说一句自然的话，不超过30字。"
    }
  ];

  const req=buildAIRequest(msgs);

  alert("准备请求");

  const res=await fetch(aiApiConfig.baseUrl,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+aiApiConfig.apiKey
    },
    body:JSON.stringify(req)
  });

  alert("请求返回");

  const data=await res.json();

  console.log("主动消息返回:",data);

  if(data.choices){
    return data.choices[0].message.content;
  }

  if(data.content){
    return data.content[0].text;
  }

  return "我刚刚突然想找你。";
}
// 页面切换逻辑
function initPageSwitch() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      // 获取目标页面标识
      const targetPage = item.dataset.page;
      const targetId = `page-${targetPage}`;
      // 1. 清除所有导航激活态
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      // 2. 隐藏所有页面
      pages.forEach(p => p.classList.remove('active'));
      // 3. 显示目标页面
      document.getElementById(targetId).classList.add('active');
      // 4. 更新顶部标题
      const titleMap = {home: "主页",chat: "聊天",tasks: "行程",novel: "小说",music: "音乐",diary: "日记",settings: "设置"};
      pageTitle.innerText = titleMap[targetPage] || targetPage;}) })}
// 页面加载完成初始化切换
window.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById("uiPresetSelect");
const btn = document.getElementById("applyPresetBtn");
if(sel && btn){btn.onclick = () => {applyUIPreset(sel.value);};}
// 自动加载保存的主题
const saved = localStorage.getItem("uiPreset");
if(saved){applyUIPreset(saved);if(sel) sel.value = saved;}
  const savedFontColor =localStorage.getItem("fontColor") || "normal";
document.documentElement
.setAttribute("data-font",savedFontColor);initPageSwitch();loadAiMessages();


alert("B");

loadAiMessages();
alert("A");
initPageSwitch();
alert("C");

testDailyChatCount();})
// ====== 状态 ======
const state = {theme: localStorage.getItem('theme') || 'dark',
  uiPreset: localStorage.getItem('uiPreset') || 'ins-soft',
  wallpaper: localStorage.getItem('wallpaper') || 'none',
  overlayOpacity: parseInt(localStorage.getItem('overlay') || '60'),
  name: localStorage.getItem('name') || '小猫',
  startDate: localStorage.getItem('startDate') || '',
  mood: localStorage.getItem('mood-' + today()) || '',
  quickNote: localStorage.getItem('quickNote') || '',
  novel: {  title: "",  content: "",  pages: [],  index: 0},
  diaries: JSON.parse(localStorage.getItem('diaries') || '[]'),
  tasks: JSON.parse(localStorage.getItem('tasks') || '[]'),
  currentDiaryId: null,
  chatHistory: [],
  thinkingColor: localStorage.getItem('thinkingColor') || '#7c5cbf',
  bubbleAlpha: parseFloat(localStorage.getItem('bubbleAlpha') || '0.10'),
  novelFontSize: parseInt(localStorage.getItem('novelFontSize') || '16'),
  city: localStorage.getItem('city') || '',
  anniversaries: localStorage.getItem('anniversaries') || '',};
const UI_PRESETS = {
  "ins-soft": {
    name: "Ins奶油风", root: {
      "--bg": "#f6f3f7",
      "--bg2": "#ffffff",
      "--surface": "rgba(255,255,255,0.75)",
      "--accent": "#d88aa7",
      "--accent2": "#f2b6c6",
      "--text": "#2b2b2f",
      "--user-bubble": "rgba(255,255,255,.75)",
      "--ai-bubble": "rgba(255,255,255,.75)",
      "--thinking-color": "rgba(255,255,255,.45)",
      "--memory-bg":"#fff3e6"},
    bubbleAlpha: 0.35},
"jasmine":{
    name:"Jasmine",root:{
      "--bg":"#ffffff",
      "--bg2":"#f8fbff",
      "--surface":"rgba(255,255,255,0.9)",
      "--accent":"#8fd3ff",
      "--accent2":"#b9e6ff",
      "--text":"#333333",
      "--ai-bubble":"#ffffff",
      "--user-bubble":"#9ddcff" ,
      "--thinking-color": "rgba(255,255,255,.35)",
      "--memory-bg":"#f2f7f2"},
bubbleAlpha:0.8},
  "daddy":{
    name:"daddy",root:{
      "--bg":"#080808",
      "--bg2":"#111111",
      "--surface":"rgba(20,20,20,0.9)",
      "--accent":"#ff3344",
      "--accent2":"#ff6677",
      "--text":"#eeeeee",
      "--ai-bubble":"#151515",
      "--user-bubble":"#ff4455",
       "--thinking-color": "rgba(0,0,0,.25)",
       "--memory-bg":"#25242b"},
bubbleAlpha:0.8},
  "frosted":{
    name:"雾面玻璃",root:{
      "--bg":"#dfe8f2",
      "--bg2":"#ffffff",
      "--surface":
      "rgba(255,255,255,0.25)",
      "--accent":"#b8d8ff",
      "--accent2":"#d8ecff",
      "--text":"#333333",
      "--glass-blur":"20px",
      "--user-bubble":"rgba(120,200,255,.3)",
      "--ai-bubble":"rgba(120,200,255,.3)",
      "--thinking-color":"rgba(255,160,210,.25)",
      "--memory-bg":"#e8edf0"},
    bubbleAlpha:0.25}, 
  "night-glass": {
    name: "夜间玻璃",root: {
      "--bg": "#0f1117",
      "--bg2": "#151826",
      "--surface": "rgba(255,255,255,0.06)",
      "--accent": "#8aa0ff",
      "--accent2": "#c7a6ff",
      "--text": "#e8e8f0",
      "--user-bubble": "rgba(100,190,255,.35)",
      "--ai-bubble": "rgba(100,190,255,.35)",
      "--thinking-color": "rgba(255,150,200,.25)",
      "--memory-bg":"#6d7a92"},
bubbleAlpha: 0.12 },
  "rose-night":{
      name:"蔷薇夜",root:{
          "--bg":"#120b12",
          "--bg2":"#24131f",
          "--surface":"rgba(80,35,55,0.55)",
          "--accent":"#d98b9b",
          "--accent2":"#d7aa72",
          "--text":"#f5e6e8",
          "--user-bubble":"rgba(255,210,220,0.35)",
          "--ai-bubble":"rgba(70,25,45,0.75)",
          "--thinking-color":"rgba(217,139,155,0.35)",
          "--memory-bg":"#351624"},
   bubbleAlpha:0.45},
  "matcha-tea":{
      name:"茶雾",root:{
          "--bg":"#e8e2d3",
          "--bg2":"#d9d3bf",
          "--surface":"rgba(255,255,255,0.65)",
          "--accent":"#8fa66b",
          "--accent2":"#c6a86b",
          "--text":"#34402c",
          "--user-bubble":"rgba(255,255,245,0.8)",
          "--ai-bubble":"rgba(143,166,107,0.25)",
          "--thinking-color":"rgba(143,166,107,0.35)",
          "--memory-bg":"#dfe8d2"},
        bubbleAlpha:0.55},
  "aries":{
    name:"Aries",root:{
        "--bg":"#0d1117",
        "--bg2":"#161b22",
        "--surface":"rgba(255,255,255,0.04)",
        "--accent":"#c8a96e",
        "--accent2":"#8b1a1a",
        "--text":"#d4cfc8",
        "--user-bubble":"rgba(139,26,26,0.18)",
        "--ai-bubble":"rgba(13,17,23,0.85)",
        "--thinking-color":"#c8a96e",
        "--memory-bg":"#111820"},
    bubbleAlpha:0.85},};
function today() { return new Date().toISOString().slice(0,10); }
// ====== 初始化 ======
function init() {applyTheme(state.theme);
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
const savedChat = localStorage.getItem("chatHistory");
if(savedChat){ state.chatHistory = JSON.parse(savedChat);
    state.chatHistory.forEach(msg=>{
        addChatMessage(msg.role,msg.content, msg.thinking|| "");});
        setTimeout(()=>{      const box = document.getElementById("chatMessages");
            if(box){ box.scrollTop = box.scrollHeight; } },100);}};
// ====== 主题 ======
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  localStorage.setItem('theme', theme);
  const icon = document.querySelector('.theme-icon');
  const lbl = document.querySelector('.theme-toggle span:last-child');
  const sw = document.getElementById('themeSwitch');
  if (theme === 'dark') {if(icon) icon.textContent='☽';
    if(lbl) lbl.textContent='深色模式';
    if(sw) sw.classList.remove('active');} else {
    if(icon) icon.textContent='☼';
    if(lbl) lbl.textContent='浅色模式';
    if(sw) sw.classList.add('active'); }}
function applyFont(font) {document.body.classList.remove('font-cormorant', 'font-dancing','font-great','font-eb');
  if (font === 'cormorant') document.body.classList.add('font-cormorant');
  if (font === 'dancing') document.body.classList.add('font-dancing');
if(font === 'great')document.body.classList.add('font-great');
if(font === 'eb')document.body.classList.add('font-eb');}
// ====== 壁纸 ======
const GRADIENTS = {none:'',
  gradient1:'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
  gradient2:'linear-gradient(135deg,#1a12e,#16213e,#0f3460)',
  gradient3:'linear-gradient(135deg,#d4fc79,#96e6a1)',
  gradient4:'linear-gradient(135deg,#f093fb,#f5576c)',
  gradient5:'linear-gradient(135deg,#0c3483,#a2b6df,#6b8cce)',};
function applyWallpaper(wp) {const el = document.getElementById('wallpaper');
  if (!wp || wp === 'none') { el.style.backgroundImage=''; document.body.classList.remove('has-wallpaper');
  } else if (GRADIENTS[wp]) { el.style.backgroundImage=GRADIENTS[wp]; document.body.classList.add('has-wallpaper');
  } else if (wp.startsWith('data:')) { el.style.backgroundImage=`url(${wp})`; document.body.classList.add('has-wallpaper'); }
  state.wallpaper = wp; if (!wp.startsWith('data:')) localStorage.setItem('wallpaper', wp);}
function applyOverlay(val) {document.getElementById('wallpaperOverlay').style.opacity = val/100;
  state.overlayOpacity = val;}
function applyThinkingColor(c) { document.documentElement.style.setProperty('--thinking-color', c);
  state.thinkingColor = c;localStorage.setItem('thinkingColor', c);}
function applyBubbleAlpha(a) {document.documentElement.style.setProperty('--bubble-alpha', a);
  state.bubbleAlpha = a; localStorage.setItem('bubbleAlpha', a);}
function applyUIPreset(key){const preset = UI_PRESETS[key];if(!preset) return;
  // 写入CSS变量
  Object.entries(preset.root).forEach(([k,v])=>{document.documentElement.style.setProperty(k,v);});
  // 其他参数
  applyBubbleAlpha(preset.bubbleAlpha);
  applyThinkingColor(preset.thinkingColor);

  // 保存
  localStorage.setItem("uiPreset", key);
  state.uiPreset = key;}
// ====== 问候 ======
function updateGreeting() {const h = new Date().getHours();
  const g = h<5?'夜深了':h<12?'早上好':h<14?'午安':h<18?'下午好':h<22?'晚上好':'夜深了';
  document.getElementById('greeting').textContent = `${g}，${state.name} `;}
function updateDate() {const d = new Date(), days=['日','一','二','三','四','五','六'];
  document.getElementById('currentDate').textContent =
    `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${days[d.getDay()]}`;}
function updateTogetherDays() { if (!state.startDate) { document.getElementById('togetherDays').textContent='—'; return; }
  const diff = Math.floor((new Date()-new Date(state.startDate))/86400000);
  document.getElementById('togetherDays').textContent = diff;updateChatDaysBg();}
function updateChatDaysBg() {if (!state.startDate) return;
  const diff = Math.floor((new Date()-new Date(state.startDate))/86400000);
  const el = document.getElementById('chatDaysNum'); if (el) el.textContent = diff;}
// ====== 纪念日检查 ======
function checkAnniversary() {const banner = document.getElementById('anniversaryBanner');
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const todayMD = `${mm}-${dd}`;
  // 在一起周年
  if (state.startDate) {const start = new Date(state.startDate);
    const startMD = `${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    if (todayMD === startMD && now.getFullYear() > start.getFullYear()) {
      const yrs = now.getFullYear() - start.getFullYear();
      showSurprise(`🎉 今天是我们在一起的第 ${yrs} 周年！\n\n${yrs} 年了，每一天都值得被记住。\n谢谢你一直在 💕`);
      if(banner){banner.textContent=`🎊 今天是我们 ${yrs} 周年纪念日！`;banner.style.display='block';} return;}
    // 月纪念日
    const startDay = start.getDate();
    if (now.getDate() === startDay && now.getMonth() !== start.getMonth()) {
      const months = (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth());
      if (months > 0 && months % 6 === 0) { if(banner){banner.textContent=`今天是我们在一起的第 ${months} 个月！`;banner.style.display='block';} } }}
  // 自定义纪念日
  if (state.anniversaries) { const list = state.anniversaries.split(',').map(s=>s.trim());
    if (list.includes(todayMD)) {showSurprise(`🎊 今天是特别的纪念日！\n\n${mm}月${dd}日，好好庆祝一下吧 `);
      if(banner){banner.textContent=`🌟 今天是你的纪念日！`;banner.style.display='block';}}}}
function showSurprise(text) {const el = document.getElementById('surpriseContent');
  if(el) el.innerHTML = text.replace(/\n/g,'<br>');
  setTimeout(() => openModal('surpriseModal'), 800);}
// ====== 天气 ======
const WEATHER_EMOJI = {
  sunny:'☀️', clear:'☀️', cloud:'⛅', overcast:'☁️',
  rain:'🌧️', drizzle:'🌦️', snow:'❄️', sleet:'🌨️',
  thunder:'⛈️', mist:'🌫️', fog:'🌫️', blizzard:'🌨️',};
async function updateWeatherByCoord() {const lat = 32; const lon = 117;
    const res = await fetch( `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
 const data = await res.json();
 const weatherCode = data.current_weather.weathercode;
 const weather = parseWeather(weatherCode); applyWeather(weather);}
async function fetchWeather(city) {if (!city) return;
  try {const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const cur = data.current_condition[0];
    const temp = cur.temp_C;
    const desc = cur.weatherDesc[0].value.toLowerCase();
    let emoji = '🌤️';
    for (const [k,v] of Object.entries(WEATHER_EMOJI)) {if (desc.includes(k)) { emoji=v; break; }}
    document.getElementById('weatherIcon').textContent = emoji;
    document.getElementById('weatherInfo').textContent = `${cur.temp_C}°C · ${data.nearest_area[0].areaName[0].value}`;
  } catch {document.getElementById('weatherInfo').textContent = '天气获取失败'; }}
// 这里开始加页面切换函数
function showPage(pageId){document.querySelectorAll('.page').forEach(p => { p.classList.remove('active');});
    const target = document.getElementById('page-'+ pageId);
    if(target){ target.classList.add('active'); }}
// ====== 好感度 ======
const FAV_LEVELS = [
  {min:0,name:'初识',emoji:'♡'},
  {min:100,name:'熟悉',emoji:'♡'},
  {min:300,name:'亲密',emoji:'♡'},
  {min:600,name:'心动',emoji:'♡'},
  {min:900,name:'最爱',emoji:'♡'},];
const FAV_MAX = 1000;
const favorability = {pts: parseInt(localStorage.getItem('favorability') || '0'),
  add(n) {this.pts = Math.min(FAV_MAX, this.pts + n);
    localStorage.setItem('favorability', this.pts);this.render();},
  render() {const bar = document.getElementById('favBar');
    const lbl = document.getElementById('favLabel');
    const pts = document.getElementById('favPts');
    if (!bar) return;bar.style.width = (this.pts/FAV_MAX*100) + '%';
    const lv = [...FAV_LEVELS].reverse().find(l=>this.pts>=l.min) || FAV_LEVELS[0];
    if(lbl) lbl.textContent = lv.emoji + ' ' + lv.name;
    if(pts) pts.textContent = this.pts;}};
// ====== Aries语录 ======
const QUOTES=['等你回来。','乖。','知道了。','在这里。','我记着呢。','别气了。','好，我陪你。','嗯。','来了来了。','喜欢你。','回来了就好。','不用说谢谢。','说吧，我听着。','这边才是家。'];
function updateAriesQuote() {document.getElementById('ariesQuote').textContent=`" ${QUOTES[new Date().getDate()%QUOTES.length]} "`;}
const FLOWERS=['🌸 樱花 — 生命之美，短暂而珍贵','🌹 玫瑰 — 我爱你，无需多言','🌻 向日葵 — 我的眼里只有你','🌷 郁金香 — 爱的表白','🌺 木槿 — 温柔地守护','💐 满天星 — 永恒的爱','🍀 四叶草 — 你是我的幸运'];
function updateFlower() { document.getElementById('flowerMsg').textContent=FLOWERS[new Date().getDate()%FLOWERS.length];}
function restoreMood() {if(state.mood){ document.getElementById('moodSelected').textContent=state.mood;
    document.querySelectorAll('.mood-btn').forEach(b=>{if(b.dataset.mood===state.mood)b.classList.add('selected');});}}
function restoreQuickNote() { document.getElementById('quickNoteText').value=state.quickNote; }
// ====== UI小人骨架 ======
// 后期替换：换上真实形象图片/SVG/Spine动画
// 交互逻辑已完整，只需替换 .vchar-face 的内容
const vchar = {dragging: false,
  offsetX: 0, offsetY: 0,
  idleTimer: null,
  IDLE_MS: 5 * 60 * 1000, // 5分钟不操作触发
  EXPRESSIONS: ['^^','3','ㅎ','TT','☼','☆','♡','♧'],
  REPLIES_OFFLINE: ['嗯。','干嘛。','知道了。','乖。','在。','哦。'],
  init() {const el = document.getElementById('vchar');
    if (!el) return;this.makeDraggable(el);document.getElementById('vcharBody').addEventListener('click', (e) => {
      if (!this.dragging) this.onBodyClick();}); this.resetIdleTimer();
    ['click','keydown','mousemove','touchstart'].forEach(ev => {document.addEventListener(ev, () => this.resetIdleTimer(), {passive:true});setTimeout(scrollChatBottom,500);});
    this.checkNightMode(); setInterval(() => this.checkNightMode(), 60000);},
  makeDraggable(el) { let sx, sy, sl, st;
    const onStart = (cx, cy) => {this.dragging = false;
      sx=cx; sy=cy; sl=el.offsetLeft; st=el.offsetTop; el.style.transition='none'; };
    const onMove = (cx, cy) => {if (Math.abs(cx-sx)>3||Math.abs(cy-sy)>3) this.dragging=true;
      if (!this.dragging) return;
      el.style.left=(sl+(cx-sx))+'px'; el.style.top=(st+(cy-sy))+'px';el.style.right='auto'; el.style.bottom='auto';};
    const onEnd = () => { setTimeout(()=>{this.dragging=false;},50); el.style.transition=''; };
    el.addEventListener('mousedown', e=>{onStart(e.clientX,e.clientY);e.preventDefault();});
    document.addEventListener('mousemove', e=>{if(sl!==undefined)onMove(e.clientX,e.clientY);});
    document.addEventListener('mouseup', onEnd);
    el.addEventListener('touchstart', e=>{const t=e.touches[0];onStart(t.clientX,t.clientY);},{passive:true});
    document.addEventListener('touchmove', e=>{const t=e.touches[0];onMove(t.clientX,t.clientY);},{passive:true});
    document.addEventListener('touchend', onEnd); },
  async onBodyClick() { const expr = this.EXPRESSIONS[Math.floor(Math.random()*this.EXPRESSIONS.length)];
    this.showExpression(expr); favorability.add(1);
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) { try {const res = await fetch('https://api.anthropic.com/v1/messages', { method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-calls':'true'},
          body:JSON.stringify({model:'claude-haiku-4-5-20251001', max_tokens:30,
            system:'你是Aries，用简短温柔的一句话回应主人戳你，不超过8字，口语化',
            messages:[{role:'user',content:'主人戳了你一下'}],}),});
        const data = await res.json();
        this.showBubble(data.content?.[0]?.text || '嗯。');
      } catch { this.showBubble(this.REPLIES_OFFLINE[Math.floor(Math.random()*this.REPLIES_OFFLINE.length)]); }
    } else { this.showBubble(this.REPLIES_OFFLINE[Math.floor(Math.random()*this.REPLIES_OFFLINE.length)]); }},
  showExpression(expr) { const face = document.getElementById('vcharFace');if(!face) return;
    // 后期：这里替换为触发形象的表情动画
    face.textContent = expr;
    face.style.transform='scale(1.25)';
    setTimeout(()=>{face.style.transform='';face.textContent='🦉';},2000);},
  showBubble(text) {const b = document.getElementById('vcharBubble');
    if(!b) return; b.textContent = text; b.classList.add('show');
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(()=>b.classList.remove('show'), 3000); },
  resetIdleTimer() { clearTimeout(this.idleTimer);
    const face = document.getElementById('vcharFace');
    if(face){face.classList.remove('yawning','sleeping');face.textContent='🦉';}
    this.idleTimer = setTimeout(()=>this.onIdle(), this.IDLE_MS);},
  onIdle() {const face = document.getElementById('vcharFace'); if(!face) return;
    // 彩蛋：夜间打瞌睡，白天打哈欠
    if (this.nightMode) { face.textContent='😴'; face.classList.add('sleeping');
      // 夜间模式：背景灯光变暗（聊天页）
      document.getElementById('page-chat')?.classList.add('night-mode');
    } else {face.textContent='🥱'; face.classList.add('yawning');
      setTimeout(()=>{if(face.classList.contains('yawning')){face.textContent='🦉';face.classList.remove('yawning');}
      },4000);} },
  checkNightMode() {const h = new Date().getHours();this.nightMode = (h>=22 || h<6);}};
// ====== 聊天 ======
function scrollChatBottom(){
    const box = document.getElementById("chatMessages");
    if(box){
        box.scrollTop = box.scrollHeight;
    }
}
function getTimeContext(){
const now=new Date();
return `
【系统时间】
现在真实时间是：
${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日
${now.getHours()}点${now.getMinutes()}分。
请在回答涉及时间的问题时，以此为准。
不要假装不知道当前时间。
`;
}
// 全局自定义AI配置（替代旧localStorage单存key/model，兼容所有模型）
let aiApiConfig = JSON.parse(localStorage.getItem("customAiApi")) || {
  baseUrl: localStorage.getItem('apiBaseUrl') || "",
  key: localStorage.getItem('apiKey') || "",
  model: localStorage.getItem('model') || "",
  path: localStorage.getItem('apiPath') || "/v1/chat/completions"};
// 页面加载完成，绑定API设置面板按钮
window.addEventListener('DOMContentLoaded', () => { const openBtn = document.getElementById("openSettingBtn");
  const panel = document.getElementById("apiSettingPanel");
  const closeBtn = document.getElementById("closePanel");
  const saveBtn = document.getElementById("saveApiConfig");
  if (openBtn) openBtn.onclick = () => { panel.style.display = "block";
    document.getElementById("apiBaseUrl").value = aiApiConfig.baseUrl;
    document.getElementById("apiKey").value = aiApiConfig.key;
    document.getElementById("modelName").value = aiApiConfig.model;
    document.getElementById("apiPath").value = aiApiConfig.path;}
  if (closeBtn) closeBtn.onclick = () => panel.style.display = "none";
  if (saveBtn) saveBtn.onclick = () => { aiApiConfig = {
      baseUrl: document.getElementById("apiBaseUrl").value.trim(),
      key: document.getElementById("apiKey").value.trim(),
      model: document.getElementById("modelName").value.trim(),
      path: document.getElementById("apiPath").value.trim() || "/v1/chat/completions" }
    // 同步兼容旧存储字段，老数据不失效
    localStorage.setItem("apiKey", aiApiConfig.key);
    localStorage.setItem("model", aiApiConfig.model);
    localStorage.setItem("customAiApi", JSON.stringify(aiApiConfig));
    alert("AI API配置保存成功");panel.style.display = "none"; }});
// 兼容原有提示函数
function checkApiKey() { const hint = document.getElementById('apiHint');
  if(hint) hint.textContent = aiApiConfig.key ? '' : '请先在 设置 → AI接入 中填写 API Key';}
// 改造后的发送消息函数：保留全部原有交互逻辑，替换请求为通用代理
function autoResize(){ const textarea = document.getElementById('chatInput');
    if(!textarea) return;
    textarea.style.height = 'auto';textarea.style.height = textarea.scrollHeight + 'px';}
async function sendMessage() {const apiKey = aiApiConfig.key;
  if(!apiKey){showToast('请先在设置中填写 API Key');return;}
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if(!content) return;
  await supabaseClient
.from("chat_messages")
.insert({
  role: "user",
  content: content
});                    const btn = document.getElementById('sendBtn');
  btn.disabled=true; input.value=''; autoResize(input);
  const welcome = document.getElementById('chatWelcome');
  if(welcome) welcome.style.display='none';
  const thinking = document.getElementById('thinkingToggle')?.checked || false;
  addChatMessage('user', content, thinking);
  scrollChatBottom();
  state.chatHistory.push({role:'user',content, thinking,time:new Date().toISOString()});favorability.add(1);
  const loadingEl = addLoadingMessage();
  try {const msgs = state.chatHistory.slice(-20).map(m=>({role:m.role,content:m.content}));
    const useThinking = document.getElementById('thinkingToggle').checked;
const req = buildAIRequest(aiApiConfig, msgs);
   let headers = { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey};
    let body = {};
    // OpenAI兼容接口认证
    if(!aiApiConfig.baseUrl.includes("anthropic")){  headers["Authorization"] = "Bearer " + apiKey; }
    // 分支1：Claude 格式（原版完整保留thinking、system、anthropic版本头）
    if(aiApiConfig.baseUrl.includes("anthropic")){ headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-calls'] = 'true';
      body = {model: aiApiConfig.model, max_tokens: useThinking?4000:2048,  messages: msgs,  };
      const sp = localStorage.getItem('systemPrompt')||'';
      if(sp) body.system =
      (sp ? sp + "\n" : "") +
      getTimeContext();
      if(useThinking) body.thinking={type:'enabled',budget_tokens:2000}; }
    // 分支2：OpenAI标准格式 DeepSeek/GLM/Grok等
    else { headers['Authorization'] = `Bearer ${apiKey}`;
      body = {  model: aiApiConfig.model,  messages: msgs,  temperature: 0.7 }
      const sp = localStorage.getItem('systemPrompt') || '';
      if(sp) body.messages = [{role:'system', content:(sp ? sp + "\n" : "") +
      getTimeContext()}, ...msgs]; }
    // 使用Vercel代理跨域请求
   const fullUrl =aiApiConfig.baseUrl.replace(/\/+$/,'')+aiApiConfig.path;
   console.log("最终发送:",JSON.stringify(body,null,2))
    let res = await fetch(fullUrl,{ method:'POST', headers: headers, body:JSON.stringify(body),});
    const data = await res.json();console.log("AI返回数据:", data); loadingEl.remove();
    if(data.error){showToast('错误：'+(data.error.message||'检查API Key'));btn.disabled=false;return;}
    let text='',thinking=''; console.log("thinking内容:", thinking)
    if(data.content && Array.isArray(data.content))
      { for(const b of(data.content||[])){ if(b.type==='text') text=b.text;
        if(b.type==='thinking') thinking=b.thinking;
        if(data.choices?.[0]?.message?.reasoning_content){  thinking=data.choices[0].message.reasoning_content;} }
  }else{ const msg=data.choices[0].message; text=msg.content || "";
     thinking= msg.reasoning_content ||
    msg.thinking ||
    msg.analysis || ""; }
if(!text){ text="AI没有返回内容";} addChatMessage('assistant',text, thinking);await supabaseClient
.from("chat_messages")
.insert({
  role: "assistant",
  content: text
});
scrollChatBottom();
    state.chatHistory.push({role:'assistant', content:text, thinking:thinking,time:new Date().toISOString()});
    localStorage.setItem( "chatHistory", JSON.stringify(state.chatHistory));
  } catch(e) { loadingEl.remove();alert(e.message); console.error("发送错误:",e);showToast('发送失败'); }
  btn.disabled=false; input.focus();
                             }
// 1. 检查离线时间并触发思绪生成
async function checkOfflineThought(){
  const last = state.chatHistory.at(-1);
  if(!last) return;
  const lastTime = last.time;
  if(!lastTime) return;
  
  const lastDate = new Date(lastTime);
  const now = new Date();
  const gap = (now - lastDate) / 1000 / 60;
  
  // 超过30分钟则触发
  if(gap > 1){ 
    await generateThoughts();
    localStorage.setItem("lastThoughtTime", Date.now());
  }
}

// 2. 核心函数：生成思绪（已修复大小写、锁机制和JSON清洗问题）
async function generateThoughts(){
  console.log("进入generateThoughts");
  const apiKey = aiApiConfig.key;
  console.log("思绪key:", apiKey);
  if(!apiKey){
      console.log("没有API KEY");
      return;
  }
  
  // 最近聊天记录
  const chatHistoryForThought = state.chatHistory
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));
  console.log("聊天记录准备完成");
  
  // 最后一条聊天
  const lastMessage = state.chatHistory.at(-1);
  console.log("最后消息:", lastMessage);
  if(!lastMessage) return;
  
  const lastTime = lastMessage.time || localStorage.getItem("lastChatTime");
  if(!lastTime) return;
  
  // 当前时间
  const now = new Date();
  const today = `${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()}`;
  const currentTime = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  
  // 锁机制优化：以最后一条消息的时间为锁，只要用户没发新消息，这期间只生成一次
  const thoughtKey = `thought-lock-${lastTime}`;
  if(localStorage.getItem("thoughtKey") === thoughtKey){
    console.log("这段离线时间的思绪已经生成过了，跳过");
    return;
  }
  
  const prompt = `
你是一个AI角色。
用户在 ${lastTime} 离开聊天。
现在用户在 ${today} ${currentTime} 回来。
期间用户没有发送任何消息。
请根据用户离开前的聊天内容，
生成这段时间里AI自己的私人思绪。
要求：
1. 不允许描述用户做了什么。
2. 不知道用户去了哪里。
3. 只能描述AI自己的等待、回忆、猜测。
4. 保持AI角色性格。
5. 按时间推进生成。
6. 时间必须在：
${lastTime}
到
${currentTime}
之间。
返回JSON:[{
"date":"${today}",
"time":"17:30",
"content":"..."}]
聊天记录：
${JSON.stringify(chatHistoryForThought)} `;

  console.log("body开始生成");
  const body = {
    model: aiApiConfig.model,
    messages: [
      {
        role: "system",
        content: "你负责生成AI角色私人思绪。只输出标准的JSON数组，绝对不要用 ```json 包裹，不要输出Markdown标记，不要解释，不要输出任何正文以外的内容。"
      },
      {
        role: "user",
        content: prompt 
      }
    ],
    temperature: 0.7
  };
  
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + apiKey 
  };
  
  const fullUrl = aiApiConfig.baseUrl.replace(/\/+$/, '') + aiApiConfig.path;
  console.log("思绪请求开始");
  console.log("baseUrl:", aiApiConfig.baseUrl);
  console.log("model:", aiApiConfig.model);
  
  try { 
    const res = await fetch(fullUrl, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json();
    console.log("完整返回:", data);
    
    // 统一大小写，作为原始备份
    localStorage.setItem("aiThoughtsRaw", JSON.stringify(data));
    
    let thoughtText = "";
    // Claude格式
    if(data.content && Array.isArray(data.content)){
      for(const b of data.content ){ 
        if(b.type === "text"){ thoughtText += b.text; }
      }
    }
    // OpenAI格式
    else if(data.choices && data.choices[0]?.message?.content){
      thoughtText = data.choices[0].message.content;
    }
    
    console.log("AI原始思绪", thoughtText);
    
    let thoughts = [];
    try {
      // 增强清洗，防止大模型抽风带上 <think> 标签或者 ```json
      let clean = thoughtText
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      thoughts = JSON.parse(clean);
    } catch(e) {
      console.error("JSON解析失败", thoughtText);
      return; 
    }
    
    // 统一大写 aiThoughts 读取
    let oldThoughts = JSON.parse(localStorage.getItem("aiThoughts") || "[]");
    thoughts.forEach(t => {
      oldThoughts.push({
        type: "offline",
        date: t.date,
        from: lastTime,
        to: currentTime,
        time: t.time,
        content: t.content,
        createdAt: Date.now() 
      }); 
    });
    
    // 统一大写 aiThoughts 写入
    localStorage.setItem("aiThoughts", JSON.stringify(oldThoughts));
    localStorage.setItem("thoughtKey", thoughtKey); 
    console.log("保存成功", oldThoughts);
  } catch(e) {
    console.error("生成思绪失败", e); 
  }
}

// 3. 页面加载完毕后绑定点击事件与初始化检查
window.addEventListener("DOMContentLoaded", () => {
  // 检查是否需要生成思绪
  checkOfflineThought();
  
  const thoughtBtn = document.getElementById("thoughtBtn");
  const box = document.getElementById("thoughtPanel");
  if(!thoughtBtn || !box){
    console.log("思绪按钮或弹窗不存在");
    return;
  }
  
  // 绑定点击事件展示思绪面板
  thoughtBtn.onclick = () => {
    console.log("思绪按钮点击成功");
    box.style.display = "block";
    renderThoughts();
  };
  
  const close = document.getElementById("closeThought");
  if(close){
    close.onclick = () => {
      box.style.display = "none";
    };
  }
});

// 4. 渲染思绪到前端页面上
function renderThoughts(){
  const box = document.getElementById("thoughtContent");
  if(!box) return;
  
  let list = JSON.parse(localStorage.getItem("aiThoughts") || "[]");
  if(list.length === 0){
    box.innerHTML = "暂无思绪";
    return;
  }
  
  // 按日期分组
  let groups = {};
  list.forEach(item => {       
     let date = item.date;      
     if(!groups[date]){ groups[date] = []; }
     groups[date].push({ 
       time: item.time,       
       content: item.content       
     });    
  });  
  
  let html = "";
  Object.keys(groups).forEach(date => {
    html += `
    <details class="thought-day">
      <summary>${date}</summary>
      <div class="thought-day-content">
    `;
    
    groups[date].forEach(x => {
      html += `
      <div class="thought-item">
        <div class="thought-time">${x.time}</div>
        <div class="thought-text">${x.content.replace(/\n/g, "<br>")}</div>
      </div>
      `;
    });
    
    html += `
      </div>
    </details>
    `;
  });
  
  box.innerHTML = html;
}
// 临时清理工具：网页加载时自动帮你把思绪的旧锁和脏数据消掉
window.addEventListener("DOMContentLoaded", () => {
  localStorage.removeItem("thoughtKey");
  localStorage.removeItem("aithoughts");
  localStorage.removeItem("aiThoughtsRaw");
  console.log("手机端旧锁已自动清理");
});
// ========== 站子API扩展代码 ==========
// 站子API本地缓存
let stationApiConfig = JSON.parse(localStorage.getItem("stationApiCfg")) ||
 {baseUrl: "",authType: "header-token",token: "",customKey: ""};
window.addEventListener('DOMContentLoaded', () => {
  const stationOpenBtn = document.getElementById("openStationBtn");
  const stationPanel = document.getElementById("stationApiPanel");
  const stationClose = document.getElementById("closeStationPanel");
  const stationSave = document.getElementById("saveStationConfig");
  const testApiBtn = document.getElementById("testStationApi");
  if (stationOpenBtn) stationOpenBtn.onclick = () => { stationPanel.style.display = "block";
    document.getElementById("stationBase").value = stationApiConfig.baseUrl;
    document.getElementById("authType").value = stationApiConfig.authType;
    document.getElementById("stationToken").value = stationApiConfig.token;
    document.getElementById("customHeaderKey").value = stationApiConfig.customKey;}
  if (stationClose) stationClose.onclick = () => stationPanel.style.display = "none";
  if (stationSave) stationSave.onclick = () => { stationApiConfig = {
      baseUrl: document.getElementById("stationBase").value.trim(),
      authType: document.getElementById("authType").value,
      token: document.getElementById("stationToken").value.trim(),
      customKey: document.getElementById("customHeaderKey").value.trim()}
    localStorage.setItem("stationApiCfg", JSON.stringify(stationApiConfig));
    alert("站子API配置已保存"); stationPanel.style.display = "none";}
  if (testApiBtn) testApiBtn.onclick = async () => { const res = await callStationApi("/", "GET");
    alert("测试结果:\n" + JSON.stringify(res, null, 2)); }})
// 站API通用请求函数
async function callStationApi(path, method = "GET", body = null, urlParams = {}) {
  const cfg = stationApiConfig;if (!cfg.baseUrl) return "未填写站API地址，打开左下角站API设置";
  let fullUrl = new URL(cfg.baseUrl + path);
  Object.entries(urlParams).forEach(([k, v]) => fullUrl.searchParams.append(k, v));
  if (cfg.authType === "url-param" && cfg.token) fullUrl.searchParams.append("token", cfg.token);
  const headers = { "Content-Type": "application/json" };
  if (cfg.token) { switch (cfg.authType) {
      case "header-token": headers["Authorization"] = `Bearer ${cfg.token}`; break;
      case "header-custom": headers[cfg.customKey] = cfg.token; break;
      case "cookie": headers["Cookie"] = cfg.token; break; }}
  const proxyUrl = `/api/proxy?target=${encodeURIComponent(fullUrl.toString())}`;
  const fetchOpt = { method, headers };if (body && method === "POST") fetchOpt.body = JSON.stringify(body);
  try { const res = await fetch(proxyUrl, fetchOpt); const raw = await res.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!res.ok) return `错误${res.status}：${JSON.stringify(data)}`; return data;
  } catch (err) { return `请求异常：${err.message}`; }}
// ====== 行程 ======
function renderTasks(){
  const todos=state.tasks.filter(t=>!t.done);
  const dones=state.tasks.filter(t=>t.done);
  document.getElementById('todoCount').textContent=todos.length;
  document.getElementById('doneCount').textContent=dones.length;
  const todoList=document.getElementById('todoList');
  const doneList=document.getElementById('doneList');
  todoList.innerHTML=todos.length?todos.map(t=>taskHTML(t)).join(''):'<div class="tasks-empty">暂无待办 ✨</div>';
  doneList.innerHTML=dones.length?dones.map(t=>taskHTML(t)).join(''):'<div class="tasks-empty">完成的事项会出现在这里</div>';}
function taskHTML(t){ const dateTag=t.date?`<span class="task-date-tag">📆 ${t.date}</span>`:'';
  return `<div class="task-item" id="task-${t.id}">
    <div class="task-check ${t.done?'checked':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</div>
    <div style="flex:1">  <div class="task-text ${t.done?'done-text':''}">${escHtml(t.text)}</div>
      ${dateTag} </div>
    <button class="task-del" onclick="deleteTask('${t.id}')" title="删除">×</button></div>`;}
function addTask(){const input=document.getElementById('taskInput');
  const dateEl=document.getElementById('taskDate');
  const text=input.value.trim();if(!text) return;
  state.tasks.push({id:Date.now().toString(),text,date:dateEl.value||'',done:false});
  localStorage.setItem('tasks',JSON.stringify(state.tasks));
  input.value=''; dateEl.value='';renderTasks();favorability.add(1);}
function toggleTask(id){const t=state.tasks.find(t=>t.id===id);
  if(!t) return; t.done=!t.done;if(t.done) favorability.add(2); 
  localStorage.setItem('tasks',JSON.stringify(state.tasks)); renderTasks();}
function deleteTask(id){ state.tasks=state.tasks.filter(t=>t.id!==id);
  localStorage.setItem('tasks',JSON.stringify(state.tasks));renderTasks();}
// ====== 小说 ======
let novelFontSize=state.novelFontSize;
function splitNovel(text, size = 800) {
  const pages = []; for (let i = 0; i < text.length; i += size) {
    pages.push(text.slice(i, i + size)); } return pages;}
function renderPage(index) {
  const reader = document.getElementById("novelReader");if (!reader) return;
  state.novel.index = index;reader.textContent = state.novel.pages[index] || "";}
function loadNovel(file) {const r = new FileReader(); r.onload = (e) => { const text = e.target.result;
    // ====== 保存到状态 ======
    state.novel.title = file.name;
    state.novel.content = text;
    // ====== 分页处理 ======
    state.novel.pages = splitNovel(text, 800); // 可调每页字数
    state.novel.index = 0;
    // ====== 渲染第一页 ======
    renderPage(0);
    // ====== 保存到本地 ======
    saveNovelToLocal();
    showToast("导入成功 📖"); };
  r.onerror = () => { showToast("读取失败 ❌"); };
  r.readAsText(file, "UTF-8");}
document.getElementById("uploadNovelBtn")
  .addEventListener("click", () => {document.getElementById("novelFile").click(); });
document.getElementById("novelFile")
  .addEventListener("change", (e) => { if (e.target.files[0]) {loadNovel(e.target.files[0]); } });
// ====== 日记 ======
function renderDiaries(){ const list=document.getElementById('diaryList');
  if(!state.diaries.length){list.innerHTML='<div class="empty-diary">还没有日记，写一篇吧 </div>';return;}
  list.innerHTML=[...state.diaries].reverse().map(d=>`
    <div class="diary-item" onclick="openDiary('${d.id}')">
      <div class="diary-item-title">${escHtml(d.title||'无标题')}</div>
      <div class="diary-item-preview">${escHtml(d.content||'').slice(0,60)}</div>
      <div class="diary-item-date">${d.date}</div> </div>`).join('');}
function openDiary(id){const d=id==='new'?null:state.diaries.find(d=>d.id===id);
  state.currentDiaryId=id==='new'?null:id;
  document.getElementById('diaryTitle').value=d?d.title:'';
  document.getElementById('diaryContent').value=d?d.content:'';
  document.getElementById('diaryMeta').textContent=d?`创建于 ${d.date}`:today();
 const delBtn = document.getElementById('deleteDiary');
if (delBtn) delBtn.style.display = d ? 'block' : 'none'; openModal('diaryModal');}
function saveDiary(){const title=document.getElementById('diaryTitle').value.trim()||'无标题';
  const content=document.getElementById('diaryContent').value.trim();
  if(state.currentDiaryId){const idx=state.diaries.findIndex(d=>d.id===state.currentDiaryId);
    if(idx!==-1){state.diaries[idx].title=title;state.diaries[idx].content=content;}
  } else { state.diaries.push({id:Date.now().toString(),title,content,date:today()}); favorability.add(2);}
  localStorage.setItem('diaries',JSON.stringify(state.diaries));renderDiaries(); closeModal('diaryModal'); showToast('已保存 ');}
function deleteDiary(){ if(!state.currentDiaryId||!confirm('确定删除？')) return;
  state.diaries=state.diaries.filter(d=>d.id!==state.currentDiaryId);
  localStorage.setItem('diaries',JSON.stringify(state.diaries));
  renderDiaries(); closeModal('diaryModal'); showToast('已删除');}
// ====== 设置 ======
function setupSettings(){ document.getElementById('apiKeyInput').value=localStorage.getItem('apiKey')||'';
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
document.getElementById('apiBaseUrl').value = localStorage.getItem('apiBaseUrl') || '';
document.getElementById('apiFormat').value = localStorage.getItem('apiFormat') || 'anthropic';
document.getElementById('fontSelect').value = localStorage.getItem('font') || 'default';}
function setFontColor(type){document.documentElement
 .setAttribute('data-font',type);localStorage.setItem("fontColor",type);}
function saveSettings(){localStorage.setItem('apiKey', document.getElementById('apiKeyInput').value.trim());
  localStorage.setItem('model', document.getElementById('modelSelect').value);
  localStorage.setItem('systemPrompt', document.getElementById('systemPromptInput').value.trim());
  state.name=document.getElementById('nameInput').value.trim()||'小猫';
  state.startDate=document.getElementById('dateInput').value;
  state.city=document.getElementById('cityInput').value.trim();
  state.anniversaries=document.getElementById('anniversaryInput').value.trim();
  localStorage.setItem('name',state.name);
  localStorage.setItem('startDate',state.startDate);
  localStorage.setItem('city',state.city);
  localStorage.setItem('anniversaries',state.anniversaries);
  updateGreeting(); updateTogetherDays(); checkApiKey();
  if(state.city) fetchWeather(state.city); showToast('设置已保存 ✓');
localStorage.setItem('apiBaseUrl', document.getElementById('apiBaseUrl').value.trim());
localStorage.setItem('apiFormat', document.getElementById('apiFormat').value);
const font = document.getElementById('fontSelect').value;
localStorage.setItem('font', font);applyFont(font);}
// ====== 弹窗 ======
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
// ====== Toast ======
function showToast(msg){ const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200);}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
// ====== 事件绑定 ======
function bindEvents(){
  // 导航
  document.querySelectorAll('.nav-item').forEach(item=>{ item.addEventListener('click',e=>{e.preventDefault();
      const page=item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-'+page).classList.add('active');
      document.getElementById('pageTitle').textContent=item.querySelector('span:last-child').textContent;
      if(window.innerWidth<=768) document.getElementById('sidebar').classList.remove('open'); }); });
  // 移动端
  document.getElementById('mobileMenu').addEventListener('click',()=>{
    document.getElementById('sidebar').classList.toggle('open');});
  // 主题
  document.getElementById('themeToggle').addEventListener('click',()=>applyTheme(state.theme==='dark'?'light':'dark'));
  document.getElementById('themeSwitch').addEventListener('click',function(){
    this.classList.toggle('active'); applyTheme(this.classList.contains('active')?'light':'dark');});
  // 壁纸
  document.getElementById('wallpaperBtn').addEventListener('click',()=>openModal('wallpaperModal'));
  document.getElementById('wallpaperSettingBtn').addEventListener('click',()=>openModal('wallpaperModal'));
  document.getElementById('closeWpModal').addEventListener('click',()=>closeModal('wallpaperModal'));
  document.querySelectorAll('.wp-option').forEach(opt=>{
    opt.addEventListener('click',()=>{ if(opt.dataset.wp==='upload'){document.getElementById('wpUpload').click();return;}
      document.querySelectorAll('.wp-option').forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected'); applyWallpaper(opt.dataset.wp); setTimeout(()=>closeModal('wallpaperModal'),300);}); });
  document.getElementById('wpUpload').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{applyWallpaper(ev.target.result);localStorage.setItem('wallpaper-custom',ev.target.result);closeModal('wallpaperModal');showToast('壁纸已更换 🌸');};
    r.readAsDataURL(file); });
  // 遮罩
  document.getElementById('overlaySlider').addEventListener('input',function(){
    applyOverlay(parseInt(this.value));
    document.getElementById('overlayVal').textContent=this.value+'%';
    localStorage.setItem('overlay',this.value); });
  // 思考链颜色
  document.getElementById('thinkingColorInput').addEventListener('input',function(){
    applyThinkingColor(this.value);
    document.getElementById('thinkingColorLabel').textContent=this.value;});
  // 气泡透明度
  document.getElementById('bubbleOpacity').addEventListener('input',function(){
    applyBubbleAlpha(parseInt(this.value)/100);
    document.getElementById('bubbleOpacityVal').textContent=this.value+'%'; });
  // 心情
  document.querySelectorAll('.mood-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected'); state.mood=btn.dataset.mood;
      document.getElementById('moodSelected').textContent=btn.dataset.mood;
      localStorage.setItem('mood-'+today(),btn.dataset.mood); favorability.add(1);});});
  // 随手记
  document.getElementById('quickNoteText').addEventListener('input',function(){
    localStorage.setItem('quickNote',this.value);});
  // 聊天
  document.getElementById('sendBtn').addEventListener('click',sendMessage);
  document.getElementById('chatInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  document.getElementById('chatInput').addEventListener('input',function(){autoResize(this);});
  document.getElementById('clearChat').addEventListener('click',clearChat);
  // 行程
  document.getElementById('addTaskBtn').addEventListener('click',addTask);
  document.getElementById('taskInput').addEventListener('keydown',e=>{
    if(e.key==='Enter') addTask(); });
  // 小说
  console.log("小说按钮绑定开始");
  document.getElementById("novelFile").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
   const reader = new FileReader();
   reader.onload = (evt) => { const text = evt.target.result;
      console.log("TXT读取成功", text.slice(0, 50));
      state.novel.title = file.name;
      state.novel.content = text;
      state.novel.pages = splitNovel(text, 800);
      state.novel.index = 0;
   renderNovelPage(0); saveNovelToLocal(); showToast("导入成功 📖"); };
    reader.onerror = () => { showToast("TXT读取失败 ❌"); };
    reader.readAsText(file, "UTF-8"); });
 document.getElementById('fontMinus').addEventListener('click',()=>{
    novelFontSize=Math.max(12,novelFontSize-2);
    document.getElementById('novelReader').style.fontSize=novelFontSize+'px';
    document.getElementById('fontSizeLabel').textContent=novelFontSize+'px';
    localStorage.setItem('novelFontSize',novelFontSize); });
  document.getElementById('fontPlus').addEventListener('click',()=>{
    novelFontSize=Math.min(28,novelFontSize+2);
    document.getElementById('novelReader').style.fontSize=novelFontSize+'px';
    document.getElementById('fontSizeLabel').textContent=novelFontSize+'px';
    localStorage.setItem('novelFontSize',novelFontSize);});
  // 日记
  document.getElementById('newDiaryBtn').addEventListener('click',()=>openDiary('new'));
document.getElementById('saveDiaryBtn').addEventListener('click', saveDiary);
    document.getElementById('closeDiaryModal').addEventListener('click',()=>closeModal('diaryModal'));
  // 设置
  document.getElementById('saveSettings').addEventListener('click',saveSettings);
  // 弹窗外点击关闭
  document.querySelectorAll('.modal').forEach(modal=>{
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal.id);}); });
// 记忆匣
const memories = JSON.parse(localStorage.getItem('memories') || '[]');
let memIndex = 0;
function renderMemories() { const stack = document.getElementById('memoryStack');
  const empty = document.getElementById('memoryEmpty');
  const indexEl = document.getElementById('memIndex');
  if (!memories.length) { stack.innerHTML = ''; stack.appendChild(empty);
    if(indexEl) indexEl.textContent = '';
    return; } stack.innerHTML = '';
  const show = [memIndex, memIndex+1, memIndex+2].map(i => memories[i % memories.length]);
  show.reverse().forEach((m, i) => { const card = document.createElement('div');
    card.className = 'memory-card' + (i === show.length-1 ? ' top' : '');
    card.innerHTML = ` <div class="memory-card-date">${m.date || ''}</div>
      <div class="memory-card-title">${escHtml(m.title || '')}</div>
      <div class="memory-card-content">${escHtml(m.content || '')}</div> `;stack.appendChild(card);});
  if(indexEl) indexEl.textContent = `${memIndex+1} / ${memories.length}`;}
document.getElementById('memAdd').addEventListener('click', () => {
  document.getElementById('memTitleInput').value = '';
  document.getElementById('memDateInput').value = today();
  document.getElementById('memContentInput').value = ''; openModal('memoryModal');});
document.getElementById('closeMemoryModal').addEventListener('click', () => closeModal('memoryModal'));
document.getElementById('saveMemory').addEventListener('click', () => {
  const title = document.getElementById('memTitleInput').value.trim();
  const date = document.getElementById('memDateInput').value;
  const content = document.getElementById('memContentInput').value.trim();
  if (!title) { showToast('标题不能为空'); return; }
  memories.push({ id: Date.now().toString(), title, date, content });
  localStorage.setItem('memories', JSON.stringify(memories));
  memIndex = memories.length - 1;
  renderMemories();closeModal('memoryModal');showToast('记忆已存入 ');
  favorability.add(3);});
document.getElementById('memPrev').addEventListener('click', () => { if (!memories.length) return;
  memIndex = (memIndex - 1 + memories.length) % memories.length; renderMemories();});
document.getElementById('memNext').addEventListener('click', () => {
  if (!memories.length) return;
  memIndex = (memIndex + 1) % memories.length; renderMemories();});
renderMemories();
  // 自动获取模型列表
document.getElementById('fetchModelsBtn').addEventListener('click', async () => {
  const baseUrl = document.getElementById('apiBaseUrl').value.trim() 
    || 'https://api.anthropic.com';
  const apiKey = document.getElementById('apiKeyInput').value.trim()
    || localStorage.getItem('apiKey') || ''; 
  if (!apiKey) { showToast('请先填写 API Key'); return; } showToast('获取中...'); 
  try { const url = baseUrl.replace(/\/+$/, '') + '/v1/models';

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'x-api-key': apiKey, } });
    const data = await res.json();
    const models = data.data || data.models || [];
    if (!models.length) { showToast('没有获取到模型'); return; }
    const select = document.getElementById('modelSelect');
    select.innerHTML = models.map(m => { const id = m.id || m.name || m;
      return `<option value="${id}">${id}</option>`; }).join('');
     showToast(`获取到 ${models.length} 个模型 ✓`);
  } catch(e) { showToast('获取失败，检查API地址和Key'); }});
const delBtn = document.getElementById('deleteDiary');
if (delBtn) delBtn.addEventListener('click', deleteDiary);}
// 恢复自定义壁纸
const _customWp=localStorage.getItem('wallpaper-custom');
if(_customWp&&(state.wallpaper==='none'||!state.wallpaper)) state.wallpaper=_customWp;
window.addEventListener('DOMContentLoaded', () => {init();});
window.setFontColor = setFontColor;
function addChatMessage(role, text,thinking){
    const box = document.getElementById("chatMessages");
    if(!box) return;const div = document.createElement("div");
    if(role === "user"){ div.className = "chat-message user";
    }else{ div.className = "chat-message ai"; }
const bubble=document.createElement("div");
bubble.className="bubble";
bubble.innerText=text;
if(thinking){ const think=document.createElement("div");
    think.className="thinking-chain";
    think.innerText="💭 思考链\n"+thinking; div.appendChild(think);}
div.appendChild(bubble); box.appendChild(div);
    box.scrollTop = box.scrollHeight;}
function addLoadingMessage(){ const box=document.getElementById("chatMessages");
    if(!box) return null;
    const div=document.createElement("div"); div.id="loadingMessage";
    div.className="chat-message ai loading";
    const bubble=document.createElement("div");
    bubble.className="bubble"; bubble.innerText="正在思考...";
    div.appendChild(bubble); box.appendChild(div);
    box.scrollTop=box.scrollHeight;  return div;}
    async function loadAiMessages(){

  const { data, error } = await supabaseClient
    .from("ai_messages")
    .select("*")
    .order("created_at",{ascending:true});

  if(error){
    console.log("读取主动消息失败:",error);
    return;
  }

  if(data){
    data.forEach(msg=>{
      addChatMessage(
        "assistant",
        msg.content,
        ""
      );
    });
  }
    }
function buildAIRequest(message){
    return { model: aiApiConfig.model,
     system: ` 你是一个长期陪伴用户的AI。
    ${getTimeContext()}
    用户询问时间时，必须结合当前时间回答。 `,
     messages:[ { role:"user",
       content:message  } ],
     temperature:0.7  } }
function removeLoadingMessage(){const loading = document.getElementById("loadingMessage");if(loading){loading.remove();}}
