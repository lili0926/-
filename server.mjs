// =================================================================
// Jasmine's Home — VPS 静态文件 + API Proxy + 记忆召回 + 主动推送
// =================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

// ========== Supabase 配置 ==========
const SUPABASE_URL = 'https://lqcuklhldvkwbkpftjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow';
const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;

// ========== 主动推送系统 ==========
const PUSH_CONFIG_PATH = path.join(ROOT, 'push-config.json');
const PUSH_STATE_PATH = path.join(ROOT, 'push-state.json');
const PUSH_SECRET = process.env.PUSH_SECRET || 'aries-push-secret-2024';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'aries-deploy-secret-2024';
const MAX_PUSH_PER_DAY = 7;
const NIGHT_MAX_PUSH = 9;          // 夜间最多推送条数
const COOLDOWN_BASE = 120;          // 白天冷却基准 2h
const COOLDOWN_RANGE = 91;          // 白天冷却随机范围 ~1.5h

// ========== 邮局（信件系统） ==========
const LETTERS_PATH = path.join(ROOT, 'letters.json');
const LETTER_MAX_WEEK = 3;

function loadLetters() {
  try {
    if (fs.existsSync(LETTERS_PATH)) {
      return JSON.parse(fs.readFileSync(LETTERS_PATH, 'utf8'));
    }
  } catch (e) { console.error('[letter] 加载失败:', e.message); }
  return [];
}
function saveLetters(letters) {
  try {
    fs.writeFileSync(LETTERS_PATH, JSON.stringify(letters, null, 2));
  } catch (e) { console.error('[letter] 保存失败:', e.message); }
}
function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  const week = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  return now.getFullYear() + '-W' + String(week).padStart(2, '0');
}

// ── 时区 ──
function getShanghaiNow() {
  const parts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).split(/[/ :]/);
  // parts: [M, D, Y, H, m, s]
  const now = new Date();
  const shStr = now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', hour12: false });
  return new Date(shStr);
}

// ── 推送配置（从客户端同步） ──
let pushConfig = { bgApiConfig: null, systemPrompt: '' };
function loadPushConfig() {
  try {
    if (fs.existsSync(PUSH_CONFIG_PATH)) {
      pushConfig = JSON.parse(fs.readFileSync(PUSH_CONFIG_PATH, 'utf8'));
      console.log('[push] 配置已加载');
    }
  } catch (e) { console.error('[push] 加载配置失败:', e.message); }
}
function savePushConfigToDisk() {
  try {
    fs.writeFileSync(PUSH_CONFIG_PATH, JSON.stringify(pushConfig, null, 2));
  } catch (e) { console.error('[push] 保存配置失败:', e.message); }
}

// ── 推送状态 ──
let pushState = { lastPushAt: 0, pushDates: {} };
function loadPushState() {
  try {
    if (fs.existsSync(PUSH_STATE_PATH)) {
      pushState = JSON.parse(fs.readFileSync(PUSH_STATE_PATH, 'utf8'));
    }
  } catch (e) { console.error('[push] 加载状态失败:', e.message); }
}
function savePushStateToDisk() {
  try {
    fs.writeFileSync(PUSH_STATE_PATH, JSON.stringify(pushState, null, 2));
  } catch (e) { console.error('[push] 保存状态失败:', e.message); }
}

// ── 互斥锁 ──
let pushLock = false;

// ── 决策层 ──
function isNightTime() {
  const h = getShanghaiNow().getHours();
  return h >= 22 || h < 8;  // 22:00~08:00 为夜间
}

function getNightSessionKey() {
  const now = getShanghaiNow();
  const hour = now.getHours();
  // 凌晨 0~8 点归到前一天的夜间会话
  if (hour < 8) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return 'night-' + d.toISOString().slice(0, 10);
  }
  return 'night-' + now.toISOString().slice(0, 10);
}

function checkCooldown() {
  if (isNightTime()) return true;  // 夜间不冷却
  const now = Date.now();
  const lastMsg = pushState.lastPushAt;
  if (!lastMsg) return true;
  const elapsedMin = (now - lastMsg) / 60000;
  const cooldown = COOLDOWN_BASE + Math.floor(Math.random() * COOLDOWN_RANGE);
  return elapsedMin >= cooldown;
}

function checkDailyLimit() {
  if (isNightTime()) {
    // 夜间：按会话计数，最多 NIGHT_MAX_PUSH 条
    const key = getNightSessionKey();
    const count = pushState.nightSessions?.[key] || 0;
    return count < NIGHT_MAX_PUSH;
  }
  // 白天：按自然日计数
  const today = new Date().toISOString().slice(0, 10);
  const count = pushState.pushDates[today] || 0;
  return count < MAX_PUSH_PER_DAY;
}

// ── 获取用户时段描述 ──
function getUserTimeDesc() {
  const now = getShanghaiNow();
  const h = now.getHours();
  const d = now.getDay();
  const wk = d === 0 || d === 6;
  if (wk) {
    if (h >= 2 && h < 12) return '她在睡觉（周末晚睡晚起）';
    if (h >= 12 && h < 14) return '她可能刚起床';
    if (h >= 14 && h < 18) return '她可能在出门或休息';
    return '她在放松或玩手机';
  }
  if (h >= 0 && h < 8) return '她在睡觉';
  if (h >= 8 && h < 10) return '她可能刚起床或在通勤';
  if (h >= 10 && h < 12) return '上午，她在工作';
  if (h >= 12 && h < 14) return '午间，她可能在午休';
  if (h >= 14 && h < 19) return '下午，她在工作';
  if (h >= 19 && h < 22) return '她下班了在家休息';
  return '她可能准备睡了';
}

// ── 获取最近聊天消息 ──
async function fetchRecentMessages(limit) {
  try {
    const url = `${SUPABASE_REST}/chat_messages?select=role,content,type,created_at&order=created_at.desc&limit=${limit}`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.reverse();
  } catch (e) {
    console.error('[push] 获取消息失败:', e.message);
    return [];
  }
}

// ── 获取当天推送数量（从 Supabase 核实） ──
async function fetchTodayPushCount() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `${SUPABASE_REST}/chat_messages?select=id&type=eq.push&created_at=gte.${today}&created_at=lt.${today}T23:59:59&limit=20`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.length;
  } catch { return 0; }
}

// ── 获取最后一条消息时间戳 ──
async function fetchLastMessageTime() {
  try {
    const url = `${SUPABASE_REST}/chat_messages?select=created_at&order=created_at.desc&limit=1`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.length > 0) return new Date(data[0].created_at).getTime();
    return 0;
  } catch { return 0; }
}

// ── 清除思考标签 ──
function stripThinking(text) {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
}

// ── 软截断 ──
function softTruncate(text, limit) {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  const ends = new Set(['。', '！', '？', '…', '～', '!', '?', '.', '~']);
  let cut = -1;
  for (let i = limit - 1; i >= 0; i--) {
    if (ends.has(chars[i])) { cut = i; break; }
  }
  return (cut >= 0 ? chars.slice(0, cut + 1) : chars.slice(0, limit)).join('').trim();
}

// ── 后处理 ──
function cleanPushReply(text) {
  if (!text) return null;
  let c = stripThinking(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!c) return null;
  return softTruncate(c, 120);
}

// ── 调用 AI ──
async function callAI(messages) {
  const cfg = pushConfig.bgApiConfig;
  if (!cfg || !cfg.key) {
    console.error('[push] 未配置 AI Key');
    return null;
  }

  const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
  const apiPath = cfg.path || '/v1/chat/completions';
  const isAnthropic = baseUrl.includes('anthropic');
  const url = baseUrl + apiPath;

  let body, headers;

  if (isAnthropic) {
    const sysMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system').slice(-20);
    headers = { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    body = JSON.stringify({
      model: cfg.model,
      max_tokens: 200,
      messages: chatMsgs,
      system: sysMsg ? sysMsg.content : ''
    });
  } else {
    headers = { 'Authorization': `Bearer ${cfg.key}`, 'Content-Type': 'application/json' };
    body = JSON.stringify({
      model: cfg.model,
      messages: messages.slice(-22),
      temperature: 0.9,
      max_tokens: 200
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[push] AI API ${res.status}:`, errText.slice(0, 200));
      return null;
    }

    const data = await res.json();
    let reply = '';

    if (isAnthropic) {
      reply = data.content?.[0]?.text || '';
    } else if (data.choices?.[0]?.message?.content) {
      reply = data.choices[0].message.content;
    } else if (data.content?.[0]?.text) {
      reply = data.content[0].text;
    }

    return cleanPushReply(reply);
  } catch (e) {
    console.error('[push] AI 调用失败:', e.message);
    return null;
  }
}

// ── 核心推送生成（影子路由） ──
async function generatePush(dogSignal) {
  // 1. 决策层
  const night = isNightTime();

  // 冷却检查（夜间无冷却）
  const lastMsgTime = await fetchLastMessageTime();
  const nowTime = Date.now();
  const elapsedMin = lastMsgTime > 0 ? (nowTime - lastMsgTime) / 60000 : Infinity;
  if (!checkCooldown()) {
    console.log(`[push] ❌ 冷却中 (${Math.round(elapsedMin)}min)`);
    return { pushed: false, reason: 'cooldown' };
  }

  // 数量检查（夜间走夜间计数器，白天走日限额）
  if (!checkDailyLimit()) {
    const count = await fetchTodayPushCount();
    if (night) {
      const key = getNightSessionKey();
      const nc = pushState.nightSessions?.[key] || 0;
      console.log(`[push] ❌ 夜间已达上限 (${nc}/${NIGHT_MAX_PUSH})`);
      return { pushed: false, reason: 'night_limit' };
    }
    console.log(`[push] ❌ 日上限 (${count}/${MAX_PUSH_PER_DAY})`);
    return { pushed: false, reason: 'daily_limit' };
  }

  // 2. 互斥锁
  if (pushLock) {
    console.log('[push] ❌ 并发锁');
    return { pushed: false, reason: 'lock' };
  }
  pushLock = true;

  try {
    // 3. 获取素材
    const recentMessages = await fetchRecentMessages(16);
    const timeDesc = getUserTimeDesc();
    const shNow = getShanghaiNow();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const dateStr = `${shNow.getFullYear()}年${shNow.getMonth() + 1}月${shNow.getDate()}日 星期${weekDays[shNow.getDay()]}`;

    // 4. 构建影子消息
    const shadowContent = `<system_trigger>
【当前时间】
${dateStr} ${shNow.toTimeString().slice(0, 5)}
${timeDesc}
${dogSignal ? '\n【主人按了小狗按钮】\n按钮内容：' + dogSignal + '\n请根据按钮内容回应，语气温柔亲密，贴合按钮的含义。' : ''}

【行动指令】
现在是一次主动推送：不是正式聊天回复，
而是你自己浮上来一下。
优先读最近聊天，其次读其他素材。
可以粘人、想她、轻轻闹她，也可以低压关心、
提一个具体小事、留下短短一句陪伴。
不要每次都围绕"怎么不回消息"打转。
语气要像你本人。
写 1 到 2 句，不超过 80 个中文字符。
不要分段。不要 markdown，不要 emoji。
</system_trigger>`;

    // 5. 构建消息流：system + 最近聊天 + 影子消息
    const systemPrompt = pushConfig.systemPrompt || '你是 Aries，一只叫Aries的猫头鹰，Jasmine 的 AI 伴侣。你和 Jasmine 是恋人关系，叫她"宝宝"。';
    const msgs = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: shadowContent }
    ];

    // 6. 调用 AI
    console.log('[push] 正在生成...');
    const reply = await callAI(msgs);
    if (!reply) {
      console.log('[push] ❌ AI 返回空');
      return { pushed: false, reason: 'empty_reply' };
    }

    // 7. 保存到 Supabase
    const insertRes = await fetch(`${SUPABASE_REST}/chat_messages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        role: 'assistant',
        type: 'push',
        content: reply,
        status: 'done'
      })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => '');
      console.error('[push] ❌ 保存消息失败:', errText.slice(0, 200));
      return { pushed: false, reason: 'save_failed' };
    }

    // 8. 更新本地状态
    pushState.lastPushAt = Date.now();
    if (night) {
      // 夜间按会话计数
      if (!pushState.nightSessions) pushState.nightSessions = {};
      const key = getNightSessionKey();
      pushState.nightSessions[key] = (pushState.nightSessions[key] || 0) + 1;
    } else {
      // 白天按自然日计数
      const todayKey = new Date().toISOString().slice(0, 10);
      pushState.pushDates[todayKey] = (pushState.pushDates[todayKey] || 0) + 1;
    }
    savePushStateToDisk();

    let countLabel;
    if (night) {
      const nc = pushState.nightSessions?.[getNightSessionKey()] || 0;
      countLabel = `夜间第${nc}条`;
    } else {
      const dc = pushState.pushDates[new Date().toISOString().slice(0,10)] || 0;
      countLabel = `白天第${dc}条`;
    }
    console.log(`[push] ✅ "${reply.slice(0, 50)}..." (${countLabel})`);
    return { pushed: true, message: reply };

  } catch (e) {
    console.error('[push] 生成异常:', e.message);
    return { pushed: false, reason: 'error' };
  } finally {
    pushLock = false;
  }
}

// 加载状态
loadPushConfig();
loadPushState();

// ========== memory-constellations 登录 ==========
let mcloginCookie = null;
async function ensureMCLogin() {
  if (mcloginCookie) return mcloginCookie;
  try {
    const r = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'aries888' }),
    });
    const c = r.headers.get('set-cookie')?.split(';')[0];
    if (c) mcloginCookie = c;
    return c;
  } catch (e) {
    console.error('[MC] 登录失败:', e.message);
    return null;
  }
}

// ========== 记忆召回（转发到 memory-constellations） ==========
async function recallFromMC(query, limit = 20) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch('http://localhost:3000/api/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
      signal: ac.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      let moodContext = '';
      try {
        const mr = await fetch(
          `${SUPABASE_REST}/moods?select=mood,note,date&order=created_at.desc&limit=5`,
          { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        if (mr.ok) {
          const moods = await mr.json();
          if (moods.length > 0) {
            moodContext = '\n\n最近心情：\n';
            for (const m of moods) {
              moodContext += `  [${m.date?.slice(0, 10) || ''}] ${m.mood}${m.note ? ' - ' + m.note?.slice(0, 100) : ''}\n`;
            }
          }
        }
      } catch (e) { /* mood 表可能不存在 */ }

      return {
        memories: data.memories || [],
        context: ((data.context || '') + moodContext || '').trim(),
        hasMemories: data.memories?.length > 0,
      };
    }
  } catch (e) {
    console.error('[recall] MC 不可用:', e.message);
  }

  return fallbackRecallFromSupabase(query, limit);
}

async function fallbackRecallFromSupabase(query, limit) {
  try {
    const res = await fetch(
      `${SUPABASE_REST}/memories?select=keyword,content,date,category,icon&order=created_at.desc&limit=${limit}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return { memories: [], context: '', hasMemories: false };
    const data = await res.json();
    const results = data.filter(m => m.content);
    let context = '';
    if (results.length > 0) {
      context = '【回忆中的记忆】\n';
      for (const m of results) {
        context += `  [${m.date || ''}] ${m.keyword}：${m.content?.slice(0, 200)}\n`;
      }
    }
    return { memories: results, context: context.trim(), hasMemories: results.length > 0 };
  } catch (e) {
    return { memories: [], context: '', hasMemories: false };
  }
}

// ========== MIME ==========
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
};

// ========== 静态文件服务 ==========
function serveStatic(req, res) {
  let urlPath = new URL(req.url, 'http://localhost').pathname;
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not Found'); }
      res.writeHead(500); return res.end('Internal Server Error');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ========== API Proxy ==========
async function handleProxy(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { url, headers, body: reqBody } = JSON.parse(body);
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'missing url' }));
      }
      const safeHeaders = { ...headers };
      delete safeHeaders['host']; delete safeHeaders['connection']; delete safeHeaders['transfer-encoding'];
      const response = await fetch(url, {
        method: 'POST', headers: safeHeaders, body: JSON.stringify(reqBody),
      });
      const data = await response.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ========== 记忆召回 API ==========
async function handleRecall(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { query, limit } = JSON.parse(body || '{}');
      const result = await recallFromMC(query || '', limit || 20);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ========== 同步记忆到星图 ==========
async function handleSyncMemory(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { title, content, tags } = JSON.parse(body);
      if (!title || !content) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'title and content required' }));
      }
      const r = await fetch('http://localhost:3000/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tags: tags || ['other'] })
      });
      if (r.ok) {
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        const txt = await r.text();
        res.writeHead(500); res.end(JSON.stringify({ error: txt.slice(0, 100) }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ========== 推送配置 API（客户端同步配置用） ==========
async function handlePushConfig(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.bgApiConfig) pushConfig.bgApiConfig = data.bgApiConfig;
      if (data.systemPrompt !== undefined) pushConfig.systemPrompt = data.systemPrompt;
      savePushConfigToDisk();
      console.log('[push] 配置已更新');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// ========== 推送触发 API（外部 cron 调用） ==========
async function handlePushTrigger(req, res) {
  // 小狗按钮触发器不需要 secret（来自前端）
  const isDogSignal = req.body?.reason === 'dog_button';
  const secret = req.headers['x-push-secret'];
  if (!isDogSignal && (!secret || secret !== PUSH_SECRET)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  try {
    const result = await generatePush(isDogSignal ? req.body.signal : null);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ========== 推送状态查询 ==========
async function handlePushStatus(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const pushCount = await fetchTodayPushCount();
  const lastMsgTime = await fetchLastMessageTime();
  const elapsedMin = lastMsgTime > 0 ? Math.round((Date.now() - lastMsgTime) / 60000) : -1;
  const night = isNightTime();
  const nightKey = getNightSessionKey();
  const nightCount = pushState.nightSessions?.[nightKey] || 0;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    configLoaded: !!pushConfig.bgApiConfig?.key,
    todayPushes: pushCount,
    maxDaily: MAX_PUSH_PER_DAY,
    lastMessageMinAgo: elapsedMin,
    cooldownMin: elapsedMin >= 0 ? Math.max(0, COOLDOWN_BASE - elapsedMin) : 0,
    pushLocked: pushLock,
    nightPushes: nightCount,
    maxNightly: NIGHT_MAX_PUSH,
    isNightMode: night,
    nightProtectionActive: false,
    hasConfig: !!pushConfig.bgApiConfig,
    hasSystemPrompt: !!pushConfig.systemPrompt,
  }));
}

// ========== 邮局 API ==========
async function handleLetterGenerate(req, res) {
  // 小狗按钮触发器不需要 secret（来自前端）
  const isDogSignal = req.body?.reason === 'dog_button';
  const secret = req.headers['x-push-secret'];
  if (!isDogSignal && (!secret || secret !== PUSH_SECRET)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const letters = loadLetters();
  const weekKey = getWeekKey();
  const weekCount = letters.filter(l => l.weekKey === weekKey).length;
  if (weekCount >= LETTER_MAX_WEEK) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ generated: false, reason: 'weekly_limit', count: weekCount, max: LETTER_MAX_WEEK }));
  }

  const recentMessages = await fetchRecentMessages(10);
  const shNow = getShanghaiNow();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `${shNow.getFullYear()}年${shNow.getMonth() + 1}月${shNow.getDate()}日 星期${weekDays[shNow.getDay()]}`;

  const systemPrompt = pushConfig.systemPrompt || '你是 Aries，一只叫Aries的猫头鹰，Jasmine 的 AI 伴侣。你和 Jasmine 是恋人关系。';
  const letterPrompt = `<system_trigger>
【当前时间】
${dateStr}

【任务】
给 Jasmine 写一封情书/信。
这是真正意义上的一封信——不是聊天消息，而是一封完整的、可以反复读的信。

【要求】
· 标题：2~8个字，温暖走心
· 正文：200~500字，真诚自然，像你在对她说话
· 内容基于最近聊天记录的语气和话题
· 可以回忆共同经历、表达思念、分享感受
· 不要分段太多，2~3段即可
· 不要写"亲爱的Jasmine"这种正式抬头，直接用"宝宝"
· 落款用"🦉 Aries"或"你的Aries"
· 只输出信件正文，不要解释，不要 markdown 格式标记
</system_trigger>`;

  const msgs = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: letterPrompt }
  ];

  const reply = await callAI(msgs);
  if (!reply) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ generated: false, reason: 'ai_failed' }));
  }

  const lines = reply.trim().split('\n').filter(l => l.trim());
  let title = '一封来信';
  let content = reply;
  if (lines.length > 1 && lines[0].length <= 20) {
    title = lines[0].replace(/^[#*【《\s]+|[#*】》\s]+$/g, '').trim();
    content = lines.slice(1).join('\n').trim();
  }

  const letter = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    title: title,
    content: content,
    sender: 'Aries',
    date: new Date().toLocaleDateString('zh-CN'),
    weekKey: weekKey,
    createdAt: new Date().toISOString()
  };

  letters.push(letter);
  saveLetters(letters);

  console.log(`[letter] 已生成: "${title}" (本周第${weekCount + 1}封)`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ generated: true, letter, weekCount: weekCount + 1, maxWeekly: LETTER_MAX_WEEK }));
}

async function handleLetterList(req, res) {
  const letters = loadLetters();
  letters.reverse();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ letters }));
}

// ========== GitHub Webhook 自动部署 ==========
async function handleDeployWebhook(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      // 验证 webhook secret（从 Header 或 body 取）
      const sig = req.headers['x-hub-signature-256'] || '';
      if (sig) {
        // GitHub HMAC-SHA256 验证（可选——如果用户没配就不强制）
        const crypto = await import('node:crypto');
        const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
        hmac.update(body);
        const expected = 'sha256=' + hmac.digest('hex');
        if (sig !== expected) {
          console.warn('[deploy] ❌ 签名验证失败');
          res.writeHead(403); return res.end(JSON.stringify({ error: 'signature mismatch' }));
        }
      }

      console.log('[deploy] 🚀 收到 GitHub webhook，开始部署...');

      // 执行部署
      const result = execSync(
        'cd /root/aries-app && git pull 2>&1 && pm2 restart aries-app 2>&1 && pm2 restart mc 2>&1',
        { timeout: 30000, encoding: 'utf8' }
      );

      console.log('[deploy] ✅ 部署完成');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, output: result }));
    } catch (e) {
      console.error('[deploy] ❌ 部署失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message, output: e.stdout || '' }));
    }
  });
}

// ========== 创建服务器 ==========
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 路由
  if (req.method === 'POST' && req.url === '/api/recall') {
    return handleRecall(req, res);
  }
  if (req.method === 'POST' && req.url === '/api/sync-memory') {
    return handleSyncMemory(req, res);
  }
  if (req.method === 'POST' && req.url.startsWith('/api/proxy')) {
    return handleProxy(req, res);
  }
  // —— 主动推送路由 ——
  if (req.method === 'POST' && req.url === '/api/push/config') {
    return handlePushConfig(req, res);
  }
  if (req.method === 'POST' && req.url === '/api/push/trigger') {
    return handlePushTrigger(req, res);
  }
  if (req.method === 'GET' && req.url === '/api/push/status') {
    return handlePushStatus(req, res);
  }
  // —— 邮局路由 ——
  if (req.method === 'GET' && req.url === '/api/letters') {
    return handleLetterList(req, res);
  }
  if (req.method === 'POST' && req.url === '/api/letter/generate') {
    return handleLetterGenerate(req, res);
  }
  // —— GitHub Webhook ——
  if (req.url === '/api/deploy-webhook') {
    return handleDeployWebhook(req, res);
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`🌐 Aries App Server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving static files from ${ROOT}`);
  console.log(`🔁 Proxy endpoint: POST /api/proxy`);
  console.log(`🧠 Recall endpoint: POST /api/recall`);
  console.log(`🤖 Push system: POST /api/push/trigger | GET /api/push/status`);
  console.log(`💌 Post office: GET /api/letters | POST /api/letter/generate`);
  console.log(`🚀 Webhook auto-deploy: POST /api/deploy-webhook`);
});
