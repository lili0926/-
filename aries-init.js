/* ══════════════════════════════════════════════════════
   ARIES 主题完整 JS — 追加到 app.js 末尾
   独立运行，数据通过 localStorage / 现有函数 共用
══════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── 工具 ─── */
function $(id){ return document.getElementById(id); }
function arToast(msg){
  const t = $('arToast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ═══════════════════════════════════
   主题切换 & 锁定
═══════════════════════════════════ */
const _origChangeTheme = window.changeTheme;
window.changeTheme = function(theme){
  if(_origChangeTheme) _origChangeTheme(theme);
  localStorage.setItem('theme', theme);
  if(theme === 'aries') arInit();
};

window.addEventListener('load', function(){
  const saved = localStorage.getItem('theme');
  // 手机首次打开 → 默认 Aries（它是手机UI）
  const defaultTheme = saved || (window.innerWidth <= 768 ? 'aries' : 'old');
  if(_origChangeTheme) _origChangeTheme(defaultTheme);
  localStorage.setItem('theme', defaultTheme);
  if(defaultTheme === 'aries') arInit();
});

/* ═══════════════════════════════════
   Tab 切换
═══════════════════════════════════ */
const TAB_MAP = { home:'arHomeTab', chat:'arChatTab', moments:'arMomentsTab', settings:'arSettingsTab' };
const TITLE_MAP = { home:'主页', chat:'聊天', moments:'朋友圈', settings:'设置' };
let currentTab = 'home';

function switchTab(tab){
  currentTab = tab;
  Object.keys(TAB_MAP).forEach(k=>{
    const panel = $(TAB_MAP[k]);
    if(panel) panel.classList.toggle('active', k===tab);
    const btn = document.querySelector(`.ar-nav-btn[data-tab="${k}"]`);
    if(btn) btn.classList.toggle('active', k===tab);
  });
  const title = $('arTitle');
  if(title) title.textContent = TITLE_MAP[tab] || '';
  if(tab === 'chat') setTimeout(arScrollChatBottom, 100);
  if(tab === 'home'){
    arGoPage(arPageIdx);
    arSyncDiaryPreview();
    arSyncTodos();
    arSyncMemCount();
  }
  if(tab === 'moments'){
    arSyncMoments();
  }
  if(tab === 'settings') arLoadSettings();
}

document.querySelectorAll('.ar-nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
});

/* ═══════════════════════════════════
   仪表盘三页横滑
═══════════════════════════════════ */
let arPageIdx = 0;
const arPageTitles = ['主页','功能','日历'];

function arGoPage(idx){
  const pages = $('arPages');
  if(!pages) return;
  arPageIdx = Math.max(0, Math.min(2, idx));
  pages.style.transform = `translateX(-${arPageIdx * 33.333}%)`;
  document.querySelectorAll('#arDots .ar-dot').forEach((d,i)=>{
    d.classList.toggle('active', i===arPageIdx);
  });
  const title = $('arTitle');
  if(title) title.textContent = arPageTitles[arPageIdx];
  if(arPageIdx === 2) arRenderCalendar();
}

// 触摸横滑
(function(){
  const panel = document.querySelector('#arMomentsWidgets');
  if(!panel) return;
  let sx=0, sy=0, dragging=false;
  panel.addEventListener('touchstart', e=>{
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    dragging = true;
  }, {passive:true});
  panel.addEventListener('touchend', e=>{
    if(!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if(Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40){
      arGoPage(dx < 0 ? arPageIdx+1 : arPageIdx-1);
    }
  }, {passive:true});
})();

/* ═══════════════════════════════════
   月度日历（替代旧的小 calendar）
═══════════════════════════════════ */
function arRenderCalendar(){
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const weeks = ['日','一','二','三','四','五','六'];

  const labelEl = $('arCalMonthLabel');
  if(labelEl) labelEl.textContent = `${year}年${month+1}月`;

  const grid = $('arCalGrid');
  if(!grid) return;

  // 当月第一天是周几
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  let html = '';
  // 星期头
  weeks.forEach(w => {
    html += `<div class="ar-cal-header">${w}</div>`;
  });
  // 上月填充
  for(let i = 0; i < firstDay; i++){
    html += `<div class="ar-cal-day other-month"></div>`;
  }
  // 当月
  for(let d = 1; d <= daysInMonth; d++){
    const isToday = d === today ? ' today' : '';
    html += `<div class="ar-cal-day${isToday}">${d}</div>`;
  }
  grid.innerHTML = html;
}

/* ═══════════════════════════════════
   天气同步
═══════════════════════════════════ */
function arSyncWeather(){
  const srcIcon = $('weatherIcon');
  const srcInfo = $('weatherInfo');
  const tgtIcon = $('arWeatherIcon');
  const tgtTemp = $('arTemp');
  const tgtDesc = $('arWeatherDesc');
  if(!srcIcon || !tgtIcon) return;
  tgtIcon.textContent = srcIcon.textContent || '⛅';
  if(srcInfo && srcInfo.textContent){
    const txt = srcInfo.textContent;
    const m = txt.match(/(-?\d+)\s*°/);
    if(m && tgtTemp) tgtTemp.textContent = m[1]+'°';
    if(tgtDesc) tgtDesc.textContent = txt.replace(/(-?\d+)\s*°C?\s*/,'').trim() || '晴好';
  }
}

/* ═══════════════════════════════════
   在一起天数同步（含大头贴）
═══════════════════════════════════ */
function arSyncDays(){
  const src = $('togetherDays');
  const v = src ? src.textContent : '—';
  const tgt1 = $('arHeroDays');
  const tgt2 = $('arChatDaysNum');
  const tgt3 = $('arTogetherDaysBig');
  if(tgt1) tgt1.textContent = v;
  if(tgt2) tgt2.textContent = v;
  if(tgt3) tgt3.textContent = v;
}

/* ═══════════════════════════════════
   名字同步
═══════════════════════════════════ */
function arSyncName(){
  const name = localStorage.getItem('name') || 'Aries';
  const el1 = $('arHeroName'); if(el1) el1.textContent = name+' 🌿';
  const el2 = $('arProfileName'); if(el2) el2.textContent = name+' 🌿';
}

/* ═══════════════════════════════════
   日记预览同步
═══════════════════════════════════ */
function arSyncDiaryPreview(){
  try{
    const diaries = JSON.parse(localStorage.getItem('diaries')||'[]');
    const el = $('arDiaryPreview');
    if(!el) return;
    if(!diaries.length){ el.textContent='还没有日记呢，去写一篇吧 ♡'; return; }
    const latest = [...diaries].reverse()[0];
    el.textContent = (latest.content||'').slice(0,80)+(latest.content&&latest.content.length>80?'…':'');
  }catch(e){}
}

/* ═══════════════════════════════════
   日记列表（第三页）
═══════════════════════════════════ */
function arRenderDiaryList(){
  const list = $('arDiaryList');
  if(!list) return;
  const diaries = JSON.parse(localStorage.getItem('diaries')||'[]');
  if(!diaries.length){
    list.innerHTML = '<div class="ar-diary-empty">还没有日记，写一篇吧 ✨</div>';
    return;
  }
  list.innerHTML = [...diaries].reverse().map(d=>`
    <div class="ar-diary-item" onclick="arOpenDiary('${d.id}')">
      <div class="ar-diary-item-title">${escHtml(d.title||'无标题')}</div>
      <div class="ar-diary-item-preview">${escHtml((d.content||'').slice(0,60))}</div>
      <div class="ar-diary-item-date">${d.date||''}</div>
    </div>
  `).join('');
}

window.arOpenDiary = function(id){
  if(typeof openDiary === 'function') openDiary(id);
};

$('arNewDiaryBtn')?.addEventListener('click', ()=>{
  if(typeof openDiary === 'function') openDiary('new');
});

const _origSaveDiary = window.saveDiary;
window.saveDiary = function(){
  if(_origSaveDiary) _origSaveDiary();
  setTimeout(()=>{ arSyncDiaryPreview(); arRenderDiaryList(); }, 300);
};

/* ═══════════════════════════════════
   待办同步
═══════════════════════════════════ */
function arSyncTodos(){
  const preview = $('arTodoPreview');
  if(!preview) return;
  const tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
  const undone = tasks.filter(t => !t.done);
  if(!undone.length){
    preview.textContent = '暂无待办 ✨';
    return;
  }
  preview.textContent = undone.slice(0,3).map(t => '· ' + t.text).join('\n');
}

/* ═══════════════════════════════════
   记忆数量同步
═══════════════════════════════════ */
async function arSyncMemCount(){
  const tag = $('arMemCountTag');
  if(!tag) return;
  try {
    if(window.supabaseClient){
      const {count} = await supabaseClient.from('memories').select('*', {count:'exact', head:true});
      tag.textContent = (count || 0) + ' 条';
    }
  } catch(e){
    tag.textContent = '0 条';
  }
}

/* ═══════════════════════════════════
   朋友圈同步（加载并渲染朋友圈列表）
═══════════════════════════════════ */
function arSyncMoments(){
  // 复用 app.js 的 loadMoments()，它会渲染到 #arMomentList
  if(typeof loadMoments === 'function') loadMoments();
}

/* ═══════════════════════════════════
   聊天功能（复用 sendMessage 等）
═══════════════════════════════════ */
let arThinkingOn = false;

$('arSendBtn')?.addEventListener('click', arSend);
$('arChatInput')?.addEventListener('keydown', e=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); arSend(); }
});
$('arChatInput')?.addEventListener('input', function(){
  this.style.height='auto';
  this.style.height = Math.min(this.scrollHeight, 100)+'px';
});

$('arThinkingChip')?.addEventListener('click', function(){
  arThinkingOn = !arThinkingOn;
  this.classList.toggle('on', arThinkingOn);
  const cb = $('thinkingToggle');
  if(cb){ cb.checked = arThinkingOn; cb.dispatchEvent(new Event('change')); }
});

$('arClearChat')?.addEventListener('click', ()=>{
  const box = $('arChatMessages');
  if(!box) return;
  box.innerHTML = '<div class="ar-chat-welcome">你好，今天想聊什么？</div>';
  const oldBox = $('chatMessages');
  if(oldBox) oldBox.innerHTML = '';
  arToast('聊天已清空');
});

function arSend(){
  const input = $('arChatInput');
  if(!input) return;
  const content = input.value.trim();
  if(!content) return;
  input.value=''; input.style.height='auto';

  const welcome = $('arChatMessages')?.querySelector('.ar-chat-welcome');
  if(welcome) welcome.remove();

  arAddMsg('user', content, '');

  const oldInput = $('chatInput');
  const oldSendBtn = $('sendBtn');
  if(oldInput && oldSendBtn){
    oldInput.value = content;
    oldSendBtn.click();
  }
  arWatchReply();
}

let arWatchTimer = null;

function arWatchReply(){
  const oldBox = $('chatMessages');
  if(!oldBox) return;
  clearInterval(arWatchTimer);
  const loadId = 'ar-loading-'+Date.now();
  arAddLoadingMsg(loadId);

  arWatchTimer = setInterval(()=>{
    const msgs = oldBox.querySelectorAll('.chat-message.ai:not(.loading)');
    if(msgs.length > 0){
      const last = msgs[msgs.length-1];
      const bubble = last.querySelector('.bubble');
      if(bubble && bubble.textContent){
        clearInterval(arWatchTimer);
        $(loadId)?.remove();
        arAddMsg('ai', bubble.textContent, '');
        arScrollChatBottom();
      }
    }
  }, 800);

  setTimeout(()=>{ clearInterval(arWatchTimer); $(loadId)?.remove(); }, 125000);
}

function arAddMsg(role, text, thinking){
  const box = $('arChatMessages');
  if(!box) return;
  const div = document.createElement('div');
  div.className = 'ar-msg ' + role;
  if(thinking){
    const t = document.createElement('div');
    t.className = 'ar-thinking';
    t.textContent = '💭 '+thinking;
    div.appendChild(t);
  }
  const bubble = document.createElement('div');
  bubble.className = 'ar-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  box.appendChild(div);
  arScrollChatBottom();
}

function arAddLoadingMsg(id){
  const box = $('arChatMessages');
  if(!box) return;
  const div = document.createElement('div');
  div.className = 'ar-msg ai loading';
  div.id = id;
  const bubble = document.createElement('div');
  bubble.className = 'ar-bubble';
  bubble.textContent = '正在思考...';
  div.appendChild(bubble);
  box.appendChild(div);
  arScrollChatBottom();
}

function arScrollChatBottom(){
  const box = $('arChatMessages');
  if(!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if(nearBottom) box.scrollTop = box.scrollHeight;
}

function arLoadChatHistory(){
  const box = $('arChatMessages');
  if(!box) return;
  try{
    const history = (window.state && state.chatHistory) ? state.chatHistory : JSON.parse(localStorage.getItem('chatHistory')||'[]');
    if(!history.length) return;
    box.innerHTML='';
    history.slice(-30).forEach(m=>{
      arAddMsg(m.role==='user'?'user':'ai', m.content, m.thinking||'');
    });
  }catch(e){}
}

/* ═══════════════════════════════════
   设置 TAB
═══════════════════════════════════ */
function arLoadSettings(){
  const setVal = (id, val) => { const el=$(id); if(el) el.value=val||''; };
  setVal('arApiBaseUrl', localStorage.getItem('apiBaseUrl')||'');
  setVal('arApiPath', localStorage.getItem('apiPath')||'');
  setVal('arApiKey', localStorage.getItem('apiKey')||'');
  setVal('arModelSelect', localStorage.getItem('model')||'claude-sonnet-4-6');
  setVal('arApiFormat', localStorage.getItem('apiFormat')||'anthropic');
  setVal('arSystemPrompt', localStorage.getItem('systemPrompt')||'');
  setVal('arNameInput', localStorage.getItem('name')||'');
  setVal('arDateInput', localStorage.getItem('startDate')||'');
  setVal('arCityInput', localStorage.getItem('city')||'');
  setVal('arAnniversaryInput', localStorage.getItem('anniversaries')||'');
  setVal('arUiPresetSelect', localStorage.getItem('uiPreset')||'ins-soft');
  setVal('arFontSelect', localStorage.getItem('font')||'default');

  // 后台任务 AI config
  const bg = JSON.parse(localStorage.getItem('bgAiApi')||'{}');
  setVal('arBgBaseUrl', bg.baseUrl||localStorage.getItem('bgApiBaseUrl')||'');
  setVal('arBgPath', bg.path||localStorage.getItem('bgApiPath')||'');
  setVal('arBgKey', bg.key||localStorage.getItem('bgApiKey')||'');
  setVal('arBgModel', bg.model||localStorage.getItem('bgModel')||'');

  const tc = $('arThinkingColor');
  if(tc) tc.value = localStorage.getItem('thinkingColor')||'#7c5cbf';

  const ba = parseFloat(localStorage.getItem('bubbleAlpha')||'0.10');
  const bap = $('arBubbleOpacity');
  const bav = $('arBubbleOpacityVal');
  if(bap){ bap.value = Math.round(ba*100); }
  if(bav) bav.textContent = Math.round(ba*100)+'%';

  const nsfw = $('arNsfwToggle');
  if(nsfw) nsfw.classList.toggle('on', localStorage.getItem('nsfwMode')==='on');

  const dark = $('arDarkToggle');
  if(dark) dark.classList.toggle('on', document.documentElement.getAttribute('data-theme')==='dark');
}

$('arSaveBtn')?.addEventListener('click', ()=>{
  const get = id => { const el=$(id); return el?el.value.trim():''; };
  localStorage.setItem('apiBaseUrl', get('arApiBaseUrl'));
  localStorage.setItem('apiPath', get('arApiPath'));
  localStorage.setItem('apiKey', get('arApiKey'));
  localStorage.setItem('model', get('arModelSelect'));
  localStorage.setItem('apiFormat', get('arApiFormat'));
  localStorage.setItem('systemPrompt', get('arSystemPrompt'));
  const name = get('arNameInput') || '小猫';
  const date = get('arDateInput');
  const city = get('arCityInput');
  localStorage.setItem('name', name);
  localStorage.setItem('startDate', date);
  localStorage.setItem('city', city);
  localStorage.setItem('anniversaries', get('arAnniversaryInput'));

  // 后台任务 AI
  const bgApi = {
    baseUrl: get('arBgBaseUrl') || 'https://api.deepseek.com',
    path: get('arBgPath') || '/v1/chat/completions',
    key: get('arBgKey') || '',
    model: get('arBgModel') || 'deepseek-chat'
  };
  localStorage.setItem('bgAiApi', JSON.stringify(bgApi));
  // 同步到全局变量
  if(typeof bgApiConfig !== 'undefined') bgApiConfig = JSON.parse(JSON.stringify(bgApi));

  // UI 预设
  const uiPresetVal = get('arUiPresetSelect');
  if(uiPresetVal && typeof applyUIPreset === 'function') applyUIPreset(uiPresetVal);

  // 思考链颜色
  const tc = $('arThinkingColor');
  if(tc && typeof applyThinkingColor === 'function') applyThinkingColor(tc.value);

  // 气泡透明度
  const bap = $('arBubbleOpacity');
  if(bap && typeof applyBubbleAlpha === 'function') applyBubbleAlpha(parseInt(bap.value)/100);

  // 字体
  const fontVal = get('arFontSelect');
  if(fontVal && typeof applyFont === 'function') applyFont(fontVal);

  try{
    if(window.state){
      state.name=name; state.startDate=date; state.city=city;
      if(typeof updateGreeting==='function') updateGreeting();
      if(typeof updateTogetherDays==='function') updateTogetherDays();
      if(city && typeof fetchWeather==='function') fetchWeather(city);
    }
  }catch(e){}

  arSyncName(); arSyncDays();
  arToast('设置已保存 ✓');
});

$('arNsfwToggle')?.addEventListener('click', function(){
  this.classList.toggle('on');
  const on = this.classList.contains('on');
  localStorage.setItem('nsfwMode', on?'on':'off');
  arToast(on?'NSFW 模式已开启':'NSFW 模式已关闭');
  const oldToggle = $('nsfwSwitch');
  if(oldToggle){ oldToggle.classList.toggle('active',on); }
});

$('arDarkToggle')?.addEventListener('click', function(){
  this.classList.toggle('on');
  const dark = this.classList.contains('on');
  if(typeof applyTheme==='function') applyTheme(dark?'dark':'light');
  else document.documentElement.setAttribute('data-theme', dark?'dark':'light');
});

$('arSwitchThemeBtn')?.addEventListener('click', ()=>{ changeTheme('old'); });
$('arClassicBtn')?.addEventListener('click', ()=>{ changeTheme('old'); });

/* ═══════════════════════════════════
   壁纸选择器
═══════════════════════════════════ */
function arOpenWpModal(){
  const m = $('arWpModal');
  if(m) m.classList.add('show');
}
$('arWpBtn')?.addEventListener('click', arOpenWpModal);
$('arWpBtn2')?.addEventListener('click', arOpenWpModal);
$('arWpClose')?.addEventListener('click', ()=>{ $('arWpModal')?.classList.remove('show'); });

document.querySelectorAll('.ar-wp-swatch').forEach(sw=>{
  sw.addEventListener('click', ()=>{
    const wp = sw.dataset.wp;
    if(wp==='upload'){ $('arWpUpload')?.click(); return; }
    document.querySelectorAll('.ar-wp-swatch').forEach(s=>s.classList.remove('selected'));
    sw.classList.add('selected');
    if(typeof applyWallpaper==='function') applyWallpaper(wp);
    arApplyBg(wp);
    localStorage.setItem('wallpaper', wp);
    setTimeout(()=>$('arWpModal')?.classList.remove('show'), 300);
  });
});

$('arWpUpload')?.addEventListener('change', e=>{
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=ev=>{
    if(typeof applyWallpaper==='function') applyWallpaper(ev.target.result);
    arApplyBg(ev.target.result);
    localStorage.setItem('wallpaper-custom', ev.target.result);
    $('arWpModal')?.classList.remove('show');
    arToast('壁纸已更换 🌸');
  };
  r.readAsDataURL(file);
  e.target.value='';
});

const GRADIENTS = {
  gradient1:'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
  gradient2:'linear-gradient(135deg,#1a1a2e,#0f3460)',
  gradient3:'linear-gradient(135deg,#d4fc79,#96e6a1)',
  gradient4:'linear-gradient(135deg,#f093fb,#f5576c)',
  gradient5:'linear-gradient(135deg,#0c3483,#6b8cce)',
  warm:'linear-gradient(135deg,#fdf0e8,#e8c9b8)',
  none:''
};

function arApplyBg(wp){
  const theme = $('aries-theme');
  if(!theme) return;
  theme.style.background = '';
  theme.style.backgroundImage = '';
  if(wp && wp.startsWith('data:')){
    theme.style.backgroundImage=`url(${wp})`;
    theme.style.backgroundSize='cover';
    theme.style.backgroundPosition='center';
  } else if(GRADIENTS[wp]!==undefined){
    if(GRADIENTS[wp]){
      theme.style.backgroundImage = GRADIENTS[wp];
    } else {
      theme.style.background = 'var(--ar-bg)';
    }
  }
}

/* ═══════════════════════════════════
   HTML 顶栏：思绪按钮
═══════════════════════════════════ */
$('arThoughtBtn')?.addEventListener('click', ()=>{
  const panel = $('thoughtPanel');
  if(panel){
    panel.style.display='block';
    if(typeof renderThoughts==='function') renderThoughts();
  }
});

/* ═══════════════════════════════════
   仪表盘：所有 widget → app 桥接
═══════════════════════════════════ */

// 日记 widget → 打开最新/新建
$('arDiaryWidget')?.addEventListener('click', ()=>{
  const overlay = $('arDiaryOverlay');
  if(overlay){
    overlay.style.display = 'flex';
    arRenderDiaryOverlay();
  }
});

// 记忆 widget → 打开记忆匣分类
$('arMemWidget')?.addEventListener('click', ()=>{
  const modal = $('memCategoryModal');
  if(modal) modal.classList.add('show');
});

// 待办 widget → 打开 Aries 行程弹层
$('arTodoWidget')?.addEventListener('click', ()=>{
  const overlay = $('arTasksOverlay');
  if(overlay) overlay.style.display = 'flex';
  arRenderAriesTasks();
});

// 小说 → Aries 弹层显示书架（不再跳转到老UI）
$('arNovelWidget')?.addEventListener('click', ()=>{
  const overlay = $('arNovelOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  $('arNovelReader').style.display = 'none';
  $('arNovelShelf').style.display = 'flex';
  arRenderNovelShelf();
});

// 外观 widget → 打开壁纸
$('arAppearWidget')?.addEventListener('click', arOpenWpModal);

// 播客 widget → 占位
$('arPodcastWidget')?.addEventListener('click', ()=>{
  arToast('小播客功能开发中 🎙');
});

// 通话 widget → 打开 Aries 通话弹层（委托给新代码, 见下方通话弹层区域）

// 思绪 widget → 打开思绪面板
$('arThoughtWidget')?.addEventListener('click', ()=>{
  const panel = $('thoughtPanel');
  if(panel){
    panel.style.display='block';
    if(typeof renderThoughts==='function') renderThoughts();
  }
});

// 存档 widget → 直接打开"其他"记忆分类
$('arArchiveWidget')?.addEventListener('click', ()=>{
  // 触发记忆匣的"其他"分类按钮
  const otherBtn = document.querySelector('.mem-category-item[data-category="other"]');
  if(otherBtn) otherBtn.click();
});

// 时光 widget → Aries 弹层显示日记列表（不再跳转到老UI）
$('arTimelineWidget')?.addEventListener('click', ()=>{
  const overlay = $('arDiaryOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  arRenderDiaryOverlay();
});

// 音乐播放器
let arPlaying=false;
$('arMusicPlay')?.addEventListener('click', function(){
  arPlaying=!arPlaying;
  this.textContent=arPlaying?'⏸':'▶';
  $('arMusicCover')?.classList.toggle('playing',arPlaying);
});

/* ═══════════════════════════════════
   头像1（用户）更换
═══════════════════════════════════ */
function arLoadAvatar1(){
  const saved = localStorage.getItem('arAvatar1');
  if(!saved) return;
  const inner = $('arAvatar1Inner');
  if(!inner) return;
  inner.innerHTML = `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;">`;
}
$('arAvatar1')?.addEventListener('click', function(e){
  if(e.target.closest('.ar-couple-avatar-overlay')){
    $('arAvatar1Upload')?.click();
  }
});
$('arAvatar1Upload')?.addEventListener('change', function(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    localStorage.setItem('arAvatar1', dataUrl);
    arLoadAvatar1();
    arToast('头像已更换 💕');
  };
  reader.readAsDataURL(file);
  this.value = '';
});

/* ═══════════════════════════════════
   Aries 行程弹层
═══════════════════════════════════ */
function arRenderAriesTasks(){
  const tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
  const todo = tasks.filter(t=>!t.done);
  const done = tasks.filter(t=>t.done);
  $('arTodoCount').textContent = todo.length;
  $('arDoneCount').textContent = done.length;
  const todoList = $('arTodoList');
  const doneList = $('arDoneList');
  todoList.innerHTML = todo.length ? todo.map(t => arTaskHTML(t)).join('') : '<div style="color:var(--ar-text-ghost);font-size:12px;padding:8px;text-align:center">暂无待办 ✨</div>';
  doneList.innerHTML = done.length ? done.map(t => arTaskHTML(t)).join('') : '<div style="color:var(--ar-text-ghost);font-size:12px;padding:8px;text-align:center">完成的事项会出现在这里</div>';
  arSyncTodos();
}
function arTaskHTML(t){
  const dateTag = t.date ? ` <span style="font-size:10px;color:var(--ar-text-ghost)">📆${t.date}</span>` : '';
  return `<div class="ar-task-item">
    <div class="ar-task-check ${t.done?'done':''}" onclick="arToggleAriesTask('${t.id}')">${t.done?'✓':''}</div>
    <span style="flex:1;${t.done?'text-decoration:line-through;opacity:0.5':''}">${escHtml(t.text)}${dateTag}</span>
    <button class="ar-task-del" onclick="arDelAriesTask('${t.id}')">×</button>
  </div>`;
}
window.arToggleAriesTask = function(id){
  const tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
  const t = tasks.find(t=>t.id===id);
  if(t){ t.done=!t.done; localStorage.setItem('tasks', JSON.stringify(tasks)); arRenderAriesTasks(); }
};
window.arDelAriesTask = function(id){
  let tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
  tasks = tasks.filter(t=>t.id!==id);
  localStorage.setItem('tasks', JSON.stringify(tasks));
  arRenderAriesTasks();
};
$('arTaskAddBtn')?.addEventListener('click', ()=>{
  const input = $('arTaskInput'); const text = input.value.trim();
  if(!text) return;
  const tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
  tasks.push({id:Date.now().toString(), text, date:$('arTaskDate').value||'', done:false});
  localStorage.setItem('tasks', JSON.stringify(tasks));
  input.value=''; $('arTaskDate').value='';
  arRenderAriesTasks();
  if(typeof favorability !== 'undefined' && favorability.add) favorability.add(1);
});
$('arTaskInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') $('arTaskAddBtn')?.click(); });
$('arTasksClose')?.addEventListener('click', ()=>{ $('arTasksOverlay').style.display='none'; });
$('arTasksOverlay')?.addEventListener('click', function(e){ if(e.target===this) this.style.display='none'; });

/* ═══════════════════════════════════
   Aries 通话弹层
═══════════════════════════════════ */
// 通话 widget → 打开 Aries 通话弹层（待机状态）
$('arCallWidget')?.addEventListener('click', ()=>{
  const overlay = $('arCallOverlay');
  if(overlay) overlay.style.display = 'flex';
  $('arCallIdle').style.display = 'flex';
  $('arCallIncoming').style.display = 'none';
  $('arCallActive').style.display = 'none';
  $('arCallStatus').textContent = '准备呼叫...';
  $('arCallTime').textContent = '00:00';
  $('arCallStartBtn').style.display = '';
  $('arCallEndBtn').style.display = 'none';
  $('arCallAnswerBtn').style.display = 'none';
});
// 呼叫按钮 → 委托给全局 startCall
$('arCallStartBtn')?.addEventListener('click', function(){
  if(typeof startCall === 'function') startCall();
});
// 挂断按钮 → 委托给全局 endCall
$('arCallEndBtn')?.addEventListener('click', function(){
  if(typeof endCall === 'function') endCall();
});
// 接听按钮 → 委托给全局 answerCall
$('arCallAnswerBtn')?.addEventListener('click', function(){
  if(typeof answerCall === 'function') answerCall();
});
$('arCallClose')?.addEventListener('click', ()=>{
  $('arCallOverlay').style.display='none';
  // 如果通话中挂断
  if(currentCallId && typeof endCall === 'function') endCall();
});
$('arCallOverlay')?.addEventListener('click', function(e){
  if(e.target===this) this.style.display='none';
});

/* ═══════════════════════════════════
   Aries 朋友圈发布
═══════════════════════════════════ */
$('arPostMomentBtn')?.addEventListener('click', ()=>{
  const modal = $('arMomentModal');
  if(modal) modal.classList.remove('hidden');
});
$('arCancelMoment')?.addEventListener('click', ()=>{
  $('arMomentModal')?.classList.add('hidden');
  if($('arMomentInput')) $('arMomentInput').value='';
});
$('arPublishMoment')?.addEventListener('click', async ()=>{
  const input = $('arMomentInput');
  const content = input.value.trim();
  if(!content) return;
  $('momentInput').value = content;
  $('arCancelMoment')?.click();
  if(typeof publishMoment === 'function') publishMoment();
});

/* ═══════════════════════════════════
   UI 预设选择联动
═══════════════════════════════════ */
$('arUiPresetSelect')?.addEventListener('change', function(){
  if(typeof applyUIPreset === 'function') applyUIPreset(this.value);
});

$('arThinkingColor')?.addEventListener('input', function(){
  if(typeof applyThinkingColor === 'function') applyThinkingColor(this.value);
});

$('arBubbleOpacity')?.addEventListener('input', function(){
  const val = parseInt(this.value);
  const label = $('arBubbleOpacityVal');
  if(label) label.textContent = val + '%';
  if(typeof applyBubbleAlpha === 'function') applyBubbleAlpha(val/100);
});

/* ═══════════════════════════════════
   初始化函数（切换到 Aries 时调用）
═══════════════════════════════════ */
function arInit(){
  // 确保主页 tab 激活状态正确
  switchTab('home');
  arRenderCalendar();
  arSyncWeather();
  arSyncDays();
  arSyncName();
  arSyncDiaryPreview();
  arSyncTodos();
  arSyncMemCount();
  arLoadAvatar1();
  arLoadChatHistory();
  // 恢复壁纸
  const savedWp = localStorage.getItem('wallpaper-custom') || localStorage.getItem('wallpaper');
  if(savedWp) arApplyBg(savedWp);
  // 更新主题badge
  const badge = $('arThemeBadge');
  if(badge) {
    const theme = document.documentElement.getAttribute('data-theme');
    badge.textContent = theme === 'dark' ? '深色' : '浅色';
  }
}

// 定时同步
setInterval(arRenderCalendar, 60000);
setInterval(arSyncWeather, 30000);
setInterval(arSyncDays, 10000);
setInterval(arSyncTodos, 15000);

/* ═══════════════════════════════════
   页面指示点（点击跳页）
═══════════════════════════════════ */
document.querySelectorAll('#arDots .ar-dot').forEach((dot,i)=>{
  dot.addEventListener('click', ()=>arGoPage(i));
});

/* ═══════════════════════════════════
   Aries 小说弹层
═══════════════════════════════════ */
function arRenderNovelShelf(){
  const shelf = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
  const box = $('arNovelShelf');
  if(!box) return;
  if(!shelf.length){
    box.innerHTML = '<div class="ar-novel-empty">📖 书架空空的，去经典主题导入一本吧</div>';
    return;
  }
  box.innerHTML = shelf.map((book, i) => `
    <div class="ar-book-item" data-idx="${i}">
      <div class="ar-book-title">${escHtml(book.title || '无标题')}</div>
      <div class="ar-book-meta">${(book.content||'').length} 字 · ${book.lastIndex || 0}/${Math.ceil((book.content||'').length / 800)} 页</div>
    </div>
  `).join('');
  // 点进阅读
  box.querySelectorAll('.ar-book-item').forEach(el => {
    el.addEventListener('click', ()=>{
      const idx = parseInt(el.dataset.idx);
      arOpenNovelBook(idx);
    });
  });
}

function arOpenNovelBook(index){
  const shelf = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
  const book = shelf[index];
  if(!book) return;
  state.novel.index = index;
  state.novel.title = book.title;
  state.novel.content = book.content;
  if(window.saveNovelToLocal) saveNovelToLocal();
  localStorage.setItem('novelShelf', JSON.stringify(shelf));
  $('arNovelShelf').style.display = 'none';
  $('arNovelReader').style.display = 'flex';
  arRenderNovelPage(index);
}

function arRenderNovelPage(index){
  const shelf = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
  const book = shelf[index];
  if(!book) return;
  const content = book.content || '';
  const pages = Math.ceil(content.length / 800);
  const idx = Math.max(0, Math.min(index, pages - 1));
  const start = idx * 800;
  const text = content.slice(start, start + 800);
  $('arNovelText').textContent = text;
  $('arNovelPageInfo').textContent = `${idx + 1}/${pages}`;
  // 存进度
  const item = shelf[index];
  if(item){ item.lastIndex = idx; saveShelf(shelf); }
}

// 小说弹层事件
$('arNovelClose')?.addEventListener('click', ()=>{ $('arNovelOverlay').style.display = 'none'; });
$('arNovelOverlay')?.addEventListener('click', function(e){ if(e.target===this) this.style.display='none'; });
$('arNovelBack')?.addEventListener('click', ()=>{
  $('arNovelReader').style.display = 'none';
  $('arNovelShelf').style.display = 'flex';
  arRenderNovelShelf();
});
$('arNovelPrev')?.addEventListener('click', ()=>{
  const shelf = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
  const book = shelf[state.novel.index];
  if(!book) return;
  const pages = Math.ceil((book.content||'').length / 800);
  const curPage = book.lastIndex || 0;
  if(curPage > 0){
    const shelfArr = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
    if(shelfArr[state.novel.index]) shelfArr[state.novel.index].lastIndex = curPage - 1;
    localStorage.setItem('novelShelf', JSON.stringify(shelfArr));
    arRenderNovelPage(state.novel.index);
  }
});
$('arNovelNext')?.addEventListener('click', ()=>{
  const shelf = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
  const book = shelf[state.novel.index];
  if(!book) return;
  const pages = Math.ceil((book.content||'').length / 800);
  const curPage = book.lastIndex || 0;
  if(curPage < pages - 1){
    const shelfArr = window.getShelf ? getShelf() : JSON.parse(localStorage.getItem('novelShelf')||'[]');
    if(shelfArr[state.novel.index]) shelfArr[state.novel.index].lastIndex = curPage + 1;
    localStorage.setItem('novelShelf', JSON.stringify(shelfArr));
    arRenderNovelPage(state.novel.index);
  }
});

/* ═══════════════════════════════════
   Aries 时光/日记弹层
═══════════════════════════════════ */
function arRenderDiaryOverlay(){
  const box = $('arDiaryOverlayList');
  if(!box) return;
  const diaries = JSON.parse(localStorage.getItem('diaries')||'[]');
  if(!diaries.length){
    box.innerHTML = '<div class="ar-diary-empty">还没有日记，写一篇吧 ✨</div>';
    return;
  }
  box.innerHTML = [...diaries].reverse().map(d => `
    <div class="ar-diary-item" data-id="${d.id}">
      <div class="ar-diary-item-title">${escHtml(d.title||'无标题')}</div>
      <div class="ar-diary-item-preview">${escHtml((d.content||'').slice(0,80))}</div>
      <div class="ar-diary-item-date">${d.date||''}</div>
    </div>
  `).join('');
  box.querySelectorAll('.ar-diary-item').forEach(el => {
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      // 切到老UI打开日记编辑
      changeTheme('old');
      if(typeof openDiary === 'function') openDiary(id);
    });
  });
}

$('arDiaryClose')?.addEventListener('click', ()=>{ $('arDiaryOverlay').style.display = 'none'; });
$('arDiaryOverlay')?.addEventListener('click', function(e){ if(e.target===this) this.style.display='none'; });
$('arDiaryNewBtn')?.addEventListener('click', ()=>{
  // 新日记 → 切老UI打开写日记
  changeTheme('old');
  if(typeof openDiary === 'function') openDiary('new');
});

})();
