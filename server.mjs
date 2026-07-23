// =================================================================
// Jasmine's Home — VPS 静态文件 + API Proxy + 记忆召回
// =================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 80;
const ROOT = path.resolve(import.meta.dirname, '.');

// ========== Supabase 配置 ==========
const SUPABASE_URL = 'https://lqcuklhldvkwbkpftjzu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_w13U8_JcT0amx_LVBm9dnA_CoA5xiow';
const SUPABASE_REST = `${SUPABASE_URL}/rest/v1`;

// ========== memory-constellations 会话缓存 ==========
let mcCookie = null;
let mcCookieTime = 0;
const MC_BASE = 'http://localhost:3000';
const MC_PASSWORD = 'aries888';

async function loginMemoryConstellations() {
  try {
    const res = await fetch(`${MC_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: MC_PASSWORD }),
      redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      mcCookie = setCookie.split(';')[0];
      mcCookieTime = Date.now();
      console.log('[MC] 登录成功');
    }
  } catch (e) {
    console.log('[MC] 登录失败:', e.message);
  }
}

async function queryMemoryConstellations(endpoint) {
  if (!mcCookie || Date.now() - mcCookieTime > 3600000) {
    await loginMemoryConstellations();
  }
  try {
    const res = await fetch(`${MC_BASE}${endpoint}`, {
      headers: { 'Cookie': mcCookie || '' }
    });
    if (res.status === 401) {
      await loginMemoryConstellations();
      const retry = await fetch(`${MC_BASE}${endpoint}`, {
        headers: { 'Cookie': mcCookie || '' }
      });
      return retry.ok ? retry.json() : [];
    }
    return res.ok ? res.json() : [];
  } catch (e) {
    return [];
  }
}

// ========== 记忆召回 ==========
async function recallMemories(query, limit = 15) {
  const results = [];

  // 1. 查 Supabase memories（organizeMemory 写入的）
  try {
    const res = await fetch(
      `${SUPABASE_REST}/memories?select=keyword,content,date,category,icon&order=created_at.desc&limit=${limit}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const m of data) {
        if (m.content) results.push({ source: 'supabase', ...m });
      }
    }
  } catch (e) { /* supabase 不可用 */ }

  // 2. 查 mood 记录（如果有）
  try {
    const res = await fetch(
      `${SUPABASE_REST}/moods?select=mood,note,date&order=created_at.desc&limit=10`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const m of data) {
        if (m.mood) results.push({ source: 'mood', ...m });
      }
    }
  } catch (e) { /* no mood table */ }

  // 3. 查 memory-constellations（如果有数据）
  const mcData = await queryMemoryConstellations('/api/memories?status=permanent&limit=10');
  if (Array.isArray(mcData) && mcData.length > 0) {
    for (const m of mcData) {
      if (m.content) results.push({ source: 'mc', keyword: m.title, content: m.content, date: m.created_at });
    }
  }

  // 4. 去重 + 排序
  const seen = new Set();
  const unique = results.filter(m => {
    const key = m.content?.slice(0, 50);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
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
      const memories = await recallMemories(query || '', limit || 20);

      // 格式化为可读的记忆上下文
      let context = '';
      const cats = {};
      for (const m of memories) {
        const cat = m.category || 'other';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(m);
      }
      const catLabels = { 'happy': '😊 开心', 'angry': '😤 生气', 'nsfw': '🔞 亲密', 'sad': '😢 难过', 'other': '📝 其他' };
      for (const [cat, items] of Object.entries(cats)) {
        context += `\n${catLabels[cat] || cat}：\n`;
        for (const m of items.slice(0, 8)) {
          const date = m.date ? m.date.slice(0, 10) : '';
          context += `  [${date}] ${m.keyword || ''}：${m.content?.slice(0, 200)}\n`;
        }
      }

      // 也返回心情记录
      const moods = memories.filter(m => m.source === 'mood');
      let moodContext = '';
      if (moods.length > 0) {
        moodContext = '\n最近心情：\n';
        for (const m of moods.slice(0, 5)) {
          moodContext += `  [${m.date?.slice(0, 10) || ''}] ${m.mood}${m.note ? ' - ' + m.note?.slice(0, 100) : ''}\n`;
        }
      }

      const fullContext = context + moodContext;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        memories: memories.filter(m => m.source !== 'mood').slice(0, limit || 20),
        context: fullContext.trim(),
        hasMemories: memories.length > 0
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
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
  if (req.method === 'POST' && req.url.startsWith('/api/proxy')) {
    return handleProxy(req, res);
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`🌐 Aries App Server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving static files from ${ROOT}`);
  console.log(`🔁 Proxy endpoint: POST /api/proxy`);
  console.log(`🧠 Recall endpoint: POST /api/recall`);
});
