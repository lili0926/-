// =================================================================
// MC Worker — Supabase → Memory Constellations 桥接 + 管道
// 定时从 Supabase 拉聊天消息，写入 MC 本地库，触发 Scribe/Archivist
// =================================================================
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// ── Supabase 配置（与 server.mjs 相同）──
const SUPABASE_URL = 'https://lqcuklhldvkwbkpftjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow';
const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;

// ── 初始化 MC 数据库 ──
const { initDatabase, getDb } = require('./database');
const { encryption } = require('./encryption');
initDatabase();
const db = getDb();

// ── 上次同步时间戳 ──
const STATE_PATH = path.join(__dirname, 'mc-worker-state.json');
let state = { lastSyncAt: new Date(0).toISOString() };
try { if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) {}

function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (e) {}
}

// ── 从 push-config 读取 API Key ──
function getPushKey() {
  try {
    const cfgPath = path.join(__dirname, '..', 'push-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.bgApiConfig?.key) return cfg.bgApiConfig.key;
      if (cfg.apiKey) return cfg.apiKey;
    }
  } catch (e) {}
  return process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ── 确保 API Key 写入 MC 的 api_configs 表 ──
function ensureApiConfig() {
  const key = getPushKey();
  if (!key) {
    console.log('[worker] ⚠️ 无 API Key，跳过 LLM 管道');
    return false;
  }

  // 检查是否已有配置
  const existing = db.prepare("SELECT id FROM api_configs WHERE name = 'Memory LLM'").get();
  if (existing) {
    // 更新 key（重新加密）
    const encrypted = encryption.encrypt(key);
    db.prepare('UPDATE api_configs SET api_key = ? WHERE id = ?').run(encrypted, existing.id);
    return true;
  }

  // 创建新配置 — DeepSeek 格式
  const encrypted = encryption.encrypt(key);
  db.prepare(`INSERT INTO api_configs (name, provider, endpoint, api_key, model_name, is_default, supports_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Memory LLM', 'openai_compatible', 'https://api.deepseek.com', encrypted, 'deepseek-chat', 1, 0);

  // 确保默认嵌入（gemini）
  const emb = db.prepare("SELECT id FROM api_configs WHERE name = 'Embedding API'").get();
  if (!emb) {
    const geminiKey = process.env.GEMINI_API_KEY || key;
    const ek = encryption.encrypt(geminiKey);
    db.prepare(`INSERT INTO api_configs (name, provider, endpoint, api_key, model_name, is_default, supports_tools)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Embedding API', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', ek, 'text-embedding-004', 0, 0);
  }

  console.log('[worker] ✅ API 配置已写入');
  return true;
}

// ── 获取 Supabase 新消息 ──
async function fetchNewMessages() {
  try {
    const url = `${SUPABASE_REST}/chat_messages?select=id,role,content,type,created_at&order=created_at.asc&created_at=gt.${state.lastSyncAt}&limit=50`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) { console.error('[worker] Supabase 查询失败:', res.status); return []; }
    const data = await res.json();
    return data || [];
  } catch (e) { console.error('[worker] Supabase 请求失败:', e.message); return []; }
}

// ── 确保 chat 存在 ──
function ensureChat() {
  const chat = db.prepare('SELECT id FROM chats WHERE id = 1').get();
  if (chat) return 1;
  db.prepare("INSERT INTO chats (id, name, type) VALUES (1, 'Jasmine & Aries', 'text')").run();
  return 1;
}

// ── 写入消息到 MC 数据库 ──
function bridgeMessages(messages) {
  if (!messages.length) return 0;

  const chatId = ensureChat();
  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messages (chat_id, sender, content, timestamp, is_encrypted, message_type, status)
    VALUES (?, ?, ?, ?, ?, ?, 'sent')
  `);
  const checkDup = db.prepare('SELECT id FROM messages WHERE chat_id = ? AND content = ? AND timestamp = ?');

  let count = 0;
  const insertBatch = db.transaction(() => {
    for (const m of messages) {
      // 去重
      const dup = checkDup.get(chatId, m.content, m.created_at);
      if (dup) continue;

      const sender = m.role === 'user' ? 'clara' : 'draco';
      insertMsg.run(chatId, sender, m.content, m.created_at, 0, m.type === 'push' ? 'proactive' : 'text');
      count++;
    }
  });
  insertBatch();

  if (count > 0) console.log(`[worker] ✅ 桥接 ${count} 条消息`);
  return count;
}

// ── 打字机效果 ──
function stripThinking(text) {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
}

// ── 主轮询 ──
async function tick() {
  try {
    const key = getPushKey();
    if (!key) {
      console.log('[worker] ⏳ 等待 API Key...');
      return;
    }

    // 1. 拉新消息
    const messages = await fetchNewMessages();
    if (!messages.length) return;

    // 2. 桥接到 MC 库
    const count = bridgeMessages(messages);
    if (count === 0) return;

    // 3. 更新同步进度
    const last = messages[messages.length - 1];
    if (last.created_at > state.lastSyncAt) {
      state.lastSyncAt = last.created_at;
      saveState();
    }

    // 4. 调用 Scribe（提取记忆碎片）
    try {
      const { checkAndRunScribe } = require('./services/scribe');
      await checkAndRunScribe();
      console.log('[worker] 📝 Scribe 完成');
    } catch (e) {
      console.error('[worker] Scribe 失败:', e.message);
    }

    // 5. 调用 Archivist（整理碎片）
    try {
      const archivist = require('./services/archivist');
      if (archivist.getStatus && !archivist.getStatus().running) {
        archivist.start();
        console.log('[worker] 🏛 Archivist 已启动');
      }
    } catch (e) {
      console.error('[worker] Archivist 启动失败:', e.message);
    }

  } catch (e) {
    console.error('[worker] tick 异常:', e.message);
  }
}

// ── 启动 ──
console.log('[worker] 🚀 MC Worker 启动');

// 确保 API Config
ensureApiConfig();

// 启动 Archivist（先确保它跑着）
try {
  const archivist = require('./services/archivist');
  if (!archivist.getStatus || !archivist.getStatus().running) {
    archivist.start();
    console.log('[worker] 🏛 Archivist 已启动');
  }
} catch (e) {
  console.log('[worker] Archivist 暂时无法启动（需要 API Key）');
}

// 立即执行一次，然后每 90 秒轮询
tick().then(() => {
  setInterval(tick, 90 * 1000);
  console.log('[worker] ⏰ 每 90 秒轮询 Supabase');
});
