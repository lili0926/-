// =================================================================
// Memory Constellations — 轻量 HTTP 服务
// =================================================================
require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDatabase, getDb } = require('./database');
const { encryption } = require('./encryption');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

initDatabase();

const sessions = new Map();
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
function genSid() { return crypto.randomBytes(32).toString('hex'); }
function authed(sid) {
  if (!sid) return false;
  var s = sessions.get(sid);
  if (!s) return false;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(sid); return false; }
  return true;
}

var MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

function serveStatic(urlPath, res) {
  if (urlPath === '/') urlPath = '/memory.html';
  if (urlPath === '/login') urlPath = '/login.html';
  var fp = path.join(ROOT, urlPath);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(fp, function(err, data) {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'octet/stream' });
    res.end(data);
  });
}

function parseBody(req, cb) {
  var body = '';
  req.on('data', function(c) { body += c; });
  req.on('end', function() { try { cb(JSON.parse(body)); } catch(e) { cb({}); } });
}

function cookies(req) {
  var c = {};
  (req.headers.cookie || '').split(';').forEach(function(p) {
    var parts = p.trim().split('=');
    if (parts[0]) c[parts[0].trim()] = parts.slice(1).join('=');
  });
  return c;
}

http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  var url = req.url.split('?')[0];

  // API
  if (req.method === 'POST' && url === '/api/login') {
    return parseBody(req, function(b) {
      if (b.password === process.env.LOGIN_PASSWORD) {
        var sid = genSid();
        sessions.set(sid, { authenticated: true, created: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json',
          'Set-Cookie': 'mc_session=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_TTL/1000) });
        res.end(JSON.stringify({ ok: true }));
      } else { res.writeHead(401); res.end(JSON.stringify({ error: 'wrong password' })); }
    });
  }

  if (req.method === 'POST' && url === '/api/recall') {
    return parseBody(req, function(b) {
      var q = b.query, lim = b.limit || 10;
      if (!q) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ memories: [], context: '', hasMemories: false })); }
      require('./services/librarian').searchHybrid(q, Math.min(lim, 30)).then(function(r) {
        var mems = (r || []).map(function(x) { return { id: x.id, content: (x.content || '').slice(0, 200), date: x.date_label || x._created_at || '', weight: x._rrf || 0, emotional_weight: x.emotional_weight || 0.5, source: x.source_table || 'fragment', confidence: x._confidence || 'low', daysAgo: x._daysAgo || 0 }; });
        var ctx = require('./services/librarian').formatHybridContext(r) || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ memories: mems, context: ctx, hasMemories: mems.length > 0 }));
      }).catch(function(e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ memories: [], context: '', hasMemories: false })); });
    });
  }

  // Auth check
  var ck = cookies(req);
  if (url !== '/login.html' && url !== '/login' && !url.startsWith('/api/')) {
    if (!authed(ck.mc_session)) { res.writeHead(302, { 'Location': '/login' }); return res.end(); }
  }

  // memory.html 注入
  if (url === '/memory.html') {
    try {
      var cfg = require('./memory_config.json');
      var html = fs.readFileSync(path.join(ROOT, 'memory.html'), 'utf8');
      var configScript = '<script>window.MEMORY_UI_CONFIG=' + JSON.stringify({ user: { name: cfg.user.name, color: cfg.ui.user_color }, ai: { name: cfg.ai.name, color: cfg.ui.ai_color } }) + ';</script>';
      var injected = html.replace('</head>', configScript + '\n</head>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(injected);
    } catch(e) {}
  }

  serveStatic(url, res);
}).listen(PORT, function() {
  console.log('MC server: http://localhost:' + PORT);

  // ── 确保 API 配置（从 push-config.json 或 .env 读取）─
  setTimeout(function() {
    try {
      var key = '';
      try {
        var pc = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'push-config.json'), 'utf8'));
        key = pc.bgApiConfig && pc.bgApiConfig.key;
      } catch(_) {}
      if (!key) key = process.env.DEEPSEEK_API_KEY || process.env.API_KEY || '';
      if (!key) { console.log('[MC] ⚠️ 无 API Key'); return; }

      var mcdb = getDb();
      var existing = mcdb.prepare("SELECT id FROM api_configs WHERE name = 'Memory LLM'").get();
      var encrypted = encryption.encrypt(key);
      if (existing) {
        mcdb.prepare('UPDATE api_configs SET api_key = ? WHERE id = ?').run(encrypted, existing.id);
      } else {
        mcdb.prepare("INSERT INTO api_configs (name, provider, endpoint, api_key, model_name, is_default, supports_tools) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run('Memory LLM', 'openai_compatible', 'https://api.deepseek.com', encrypted, 'deepseek-chat', 1, 0);
      }
      console.log('[MC] ✅ API Key 已配置');
    } catch(e) {
      console.log('[MC] API 配置失败:', e.message.slice(0, 60));
    }

    // ── 启动 Archivist ──
    try {
      var archivist = require('./services/archivist');
      if (!archivist.getStatus || !archivist.getStatus().running) {
        archivist.start();
        console.log('[MC] 🏛 Archivist 已启动（2分钟 tick）');
      }
    } catch(e) {
      console.log('[MC] Archivist 暂时无法启动:', e.message.slice(0, 60));
    }
  }, 3000);
});
