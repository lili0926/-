// =================================================================
// MC Worker — Supabase → Memory Constellations 桥接
// 定时从 Supabase 拉聊天消息，写入 MC 本地库
// =================================================================
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const SUPABASE_URL = 'https://lqcuklhldvkwbkpftjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow';
const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;

const { initDatabase, getDb } = require('./database');
const { encryption } = require('./encryption');
initDatabase();
const db = getDb();

const STATE_PATH = path.join(__dirname, 'mc-worker-state.json');
let state = { lastSyncAt: new Date(0).toISOString() };
try { if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) {}
function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (e) {}
}

// 读取 API Key
function getApiKey() {
  try {
    const cfgPath = path.join(__dirname, '..', 'push-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.bgApiConfig?.key) return cfg.bgApiConfig.key;
    }
  } catch (e) {}
  return process.env.DEEPSEEK_API_KEY || process.env.API_KEY || '';
}

// 确保 API 配置写入 MC 库
function ensureApiConfig() {
  const key = getApiKey();
  if (!key) return false;
  const encrypted = encryption.encrypt(key);
  const exist = db.prepare("SELECT id FROM api_configs WHERE name = 'Memory LLM'").get();
  if (exist) {
    db.prepare('UPDATE api_configs SET api_key = ? WHERE id = ?').run(encrypted, exist.id);
  } else {
    db.prepare("INSERT INTO api_configs (name, provider, endpoint, api_key, model_name, is_default, supports_tools) VALUES (?,?,?,?,?,?,?)")
      .run('Memory LLM', 'openai_compatible', 'https://api.deepseek.com/v1', encrypted, 'deepseek-chat', 1, 0);
  }
  // 确保 Scribe/Archivist 用到的固定 ID
  [[36,'Archivist LLM'],[38,'Archivist Verify'],[52,'Scribe LLM']].forEach(([id, name]) => {
    const e = db.prepare('SELECT id FROM api_configs WHERE id = ?').get(id);
    if (!e) {
      db.prepare("INSERT INTO api_configs (id, name, provider, endpoint, api_key, model_name, is_default, supports_tools) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, name, 'openai_compatible', 'https://api.deepseek.com/v1', encrypted, 'deepseek-chat', 0, 0);
    }
  });
  return true;
}

async function fetchNewMessages() {
  try {
    const after = state.lastSyncAt.replace('Z', '+00:00');
    const url = `${SUPABASE_REST}/chat_messages?select=id,role,content,type,created_at&order=created_at.asc&created_at=gt.${after}&limit=100`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) { const txt = await res.text().catch(()=>''); console.error('[worker] Supabase 查询失败:', res.status, txt.slice(0,100)); return []; }
    return await res.json() || [];
  } catch (e) { console.error('[worker] Supabase 请求失败:', e.message); return []; }
}

function bridgeMessages(messages) {
  if (!messages.length) return 0;
  const chatId = 1;
  db.prepare("INSERT OR IGNORE INTO chats (id, name, type) VALUES (1, 'Jasmine & Aries', 'text')").run();

  const insertMsg = db.prepare("INSERT OR IGNORE INTO messages (chat_id, sender, content, timestamp, is_encrypted, message_type, status) VALUES (?,?,?,?,?,?,'sent')");
  let count = 0;
  const batch = db.transaction(() => {
    for (const m of messages) {
      const dup = db.prepare('SELECT id FROM messages WHERE chat_id=? AND content=? AND timestamp=?').get(chatId, m.content, m.created_at);
      if (dup) continue;
      insertMsg.run(chatId, m.role === 'user' ? 'clara' : 'draco', m.content, m.created_at, 0, m.type === 'push' ? 'proactive' : 'text');
      count++;
    }
  });
  batch();
  return count;
}

// 写入简单记忆碎片（关键词提取——不依赖 AI）
function writeSimpleFragments() {
  // 取未处理的 messages（最近50条中没有对应碎片的）
  const recentMsgs = db.prepare(`
    SELECT m.id, m.content, m.sender, m.timestamp as created_at FROM messages m
    WHERE m.id NOT IN (SELECT DISTINCT CAST(REPLACE(REPLACE(source_msg_ids, '[', ''), ']', '') AS INTEGER) FROM memory_fragments WHERE source_msg_ids IS NOT NULL AND source_msg_ids != '[]')
    ORDER BY m.timestamp ASC LIMIT 50
  `).all();

  if (!recentMsgs.length) { console.log('[worker] 无新消息需要提取碎片'); return 0; }

  let count = 0;
  const insertFrag = db.prepare("INSERT INTO memory_fragments (type, entity, content, emotional_weight, source, source_date, status, source_msg_ids, created_at) VALUES (?,?,?,?,?,?,'active',?,datetime('now'))");

  const batch = db.transaction(() => {
    for (const msg of recentMsgs) {
      if (!msg.content || msg.content.length < 5) continue;

      // 提取关键词作为简单碎片
      const entity = msg.sender === 'clara' ? '用户' : 'Aries';
      const type = 'observation';
      const maxLen = Math.min(msg.content.length, 120);
      const content = msg.content.slice(0, maxLen);

      insertFrag.run(type, entity, content, 0.5, 'chat', (msg.created_at || '').slice(0, 10), JSON.stringify([msg.id]));
      count++;
    }
  });
  batch();

  if (count > 0) console.log(`[worker] 📝 提取了 ${count} 条简单碎片`);
  return count;
}

async function tick() {
  try {
    const key = getApiKey();
    if (!key) { console.log('[worker] ⏳ 等待 API Key...'); return; }

    // 1. 拉新消息
    const messages = await fetchNewMessages();
    if (!messages.length) return;

    // 2. 桥接消息
    const count = bridgeMessages(messages);
    if (count === 0) return;

    // 3. 更新同步进度
    const last = messages[messages.length - 1];
    if (last.created_at > state.lastSyncAt) { state.lastSyncAt = last.created_at; saveState(); }
    console.log(`[worker] ✅ 桥接 ${count} 条消息 (共${db.prepare('SELECT COUNT(*) as c FROM messages').get().c}条)`);

    // 4. 提取简单碎片（关键词匹配，不用 LLM）
    const fragCount = writeSimpleFragments();
    if (fragCount > 0) {
      // 5. 尝试调用 Scribe（用 AI 精炼碎片）
      try {
        const { checkAndRunScribe } = require('./services/scribe');
        await checkAndRunScribe();
        console.log('[worker] 📝 Scribe 精炼完成');
      } catch (e) {
        console.log('[worker] Scribe 跳过（非关键）:', e.message?.slice(0, 80));
      }
    }
  } catch (e) {
    console.error('[worker] ❌', e.message);
  }
}

console.log('[worker] 🚀 启动');
ensureApiConfig();

// 启动 Archivist（它会在后台自行整理记忆）
try {
  const archivist = require('./services/archivist');
  if (!archivist.getStatus || !archivist.getStatus().running) {
    archivist.start();
    console.log('[worker] 🏛 Archivist 已启动');
  }
} catch (e) {
  console.log('[worker] Archivist:', e.message?.slice(0, 60));
}

tick().then(() => {
  setInterval(tick, 90 * 1000);
  console.log('[worker] ⏰ 每 90 秒轮询');
});
