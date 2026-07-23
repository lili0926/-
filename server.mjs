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

// ========== memory-constellations 登录 ==========
let mcloginCookie = null;
async function ensureMCLogin() {
  if (mcloginCookie) return mcloginCookie;
  const r = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'aries888' }),
    redirect: 'manual'
  });
  const c = r.headers.get('set-cookie')?.split(';')[0];
  if (c) mcloginCookie = c;
  return c;
}

// ========== 记忆召回（转发到 memory-constellations） ==========
async function recallFromMC(query, limit = 20) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(`http://localhost:3000/api/recall?q=${encodeURIComponent(query)}&limit=${limit}`, {
      signal: ac.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      // 合并 Supabase 的心情数据（星图没有这部分）
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

  // 降级：直接查 Supabase
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

// ========== 同步记忆到星图（给 app.js organizeMemory 用） ==========
async function handleSyncMemory(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { title, content, tags } = JSON.parse(body);
      if (!title || !content) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'title and content required' }));
      }
      const cookie = await ensureMCLogin();
      // 检查是否已存在（按标题去重）
      const check = await fetch('http://localhost:3000/api/memory/api/memories?limit=100', {
        headers: { 'Cookie': cookie || '' }
      });
      const existing = (check.ok ? await check.json() : {}).memories || [];
      if (existing.some(e => e.title === title)) {
        return res.end(JSON.stringify({ status: 'skipped', reason: 'exists' }));
      }
      const r = await fetch('http://localhost:3000/api/memory/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' },
        body: JSON.stringify({ title, content, tags: tags || ['other'], status: 'permanent' })
      });
      if (r.ok) {
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        const txt = await r.text();
        res.writeHead(500); res.end(JSON.stringify({ error: txt.slice(0, 100) }));
      }
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
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

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`🌐 Aries App Server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving static files from ${ROOT}`);
  console.log(`🔁 Proxy endpoint: POST /api/proxy`);
  console.log(`🧠 Recall endpoint: POST /api/recall`);
});
