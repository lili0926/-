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

// Sessions
const sessions = new Map();
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
function generateSessionId() { return crypto.randomBytes(32).toString('hex'); }
function isAuthenticated(sid) {
  if (!sid) return false;
  var s = sessions.get(sid);
  if (!s) return false;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(sid); return false; }
  return true;
}

// MIME
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function serveStatic(urlPath, res) {
  if (urlPath === '/') urlPath = '/memory.html';
  if (urlPath === '/login') urlPath = '/login.html';
  var filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  var ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, function(err, data) {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not Found'); }
      return res.writeHead(500) && res.end('Error');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'octet/stream' });
    res.end(data);
  });
}

function parseBody(req, cb) {
  var body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    try { cb(JSON.parse(body)); }
    catch(e) { cb({}); }
  });
}

function getCookies(req) {
  var c = {};
  (req.headers.cookie || '').split(';').forEach(function(p) {
    var parts = p.trim().split('=');
    if (parts[0]) c[parts[0].trim()] = parts.slice(1).join('=');
  });
  return c;
}

// ========== 服务器 ==========
var server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  var url = req.url.split('?')[0];

  // API 路由
  if (req.method === 'POST' && url === '/api/login') {
    return parseBody(req, function(body) {
      if (body.password === process.env.LOGIN_PASSWORD) {
        var sid = generateSessionId();
        sessions.set(sid, { authenticated: true, created: Date.now() });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'mc_session=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_TTL/1000),
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'wrong password' }));
      }
    });
  }

  if (req.method === 'POST' && url === '/api/recall') {
    return parseBody(req, function(body) {
      var query = body.query;
      var limit = body.limit || 10;
      if (!query) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ memories: [], context: '', hasMemories: false }));
      }
      require('./services/librarian').searchHybrid(query, Math.min(limit, 30)).then(function(results) {
        var memories = (results || []).map(function(r) {
          return {
            id: r.id,
            content: (r.content || '').slice(0, 200),
            date: r.date_label || r._created_at || '',
            weight: r._rrf || 0,
            emotional_weight: r.emotional_weight || 0.5,
            source: r.source_table || 'fragment',
            confidence: r._confidence || 'low',
            daysAgo: r._daysAgo || 0,
          };
        });
        var context = require('./services/librarian').formatHybridContext(results) || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ memories: memories, context: context, hasMemories: memories.length > 0 }));
      }).catch(function(e) {
        console.error('[recall] error:', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ memories: [], context: '', hasMemories: false, error: e.message }));
      });
    });
  }

  // POST /api/memory — 写入记忆（供 server.mjs sync-memory 调用）
  if (req.method === 'POST' && url === '/api/memory') {
    return parseBody(req, function(body) {
      var title = body.title;
      var content = body.content;
      var tags = body.tags || ['other'];
      if (!title || !content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'title and content required' }));
      }
      try {
        var db = getDb();
        var encrypted = require('./encryption').encryption.encrypt(content);
        var tagsJSON = JSON.stringify(Array.isArray(tags) ? tags : [tags]);
        db.prepare("INSERT INTO memories (title, content, tags, status, created_at, updated_at) VALUES (?, ?, ?, 'permanent', datetime('now'), datetime('now'))").run(title, encrypted, tagsJSON);
        console.log('[MC] sync-memory saved:', title);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch(e) {
        console.error('[MC] sync-memory error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  // Auth check for pages
  var cookies = getCookies(req);
  if (url !== '/login.html' && url !== '/login' && !url.startsWith('/api/')) {
    if (!isAuthenticated(cookies.mc_session)) {
      res.writeHead(302, { 'Location': '/login' }); return res.end();
    }
  }

  // memory.html 注入
  if (url === '/memory.html') {
    try {
      var memoryConfig = require('./memory_config.json');
      var html = fs.readFileSync(path.join(ROOT, 'memory.html'), 'utf8');
      var configScript = '<script>window.MEMORY_UI_CONFIG=' + JSON.stringify({
        user: { name: memoryConfig.user.name, color: memoryConfig.ui.user_color },
        ai: { name: memoryConfig.ai.name, color: memoryConfig.ui.ai_color },
      }) + ';</script>';
      var namePatch = '<script>document.addEventListener("DOMContentLoaded",function(){' +
        'var n=window.MEMORY_UI_CONFIG;if(!n)return;' +
        'function fix(t){return t.replace(/Draco/g,n.ai.name).replace(/Clara/g,n.user.name);}' +
        'var e=document.querySelector(".arch-sub");if(e)e.textContent=fix(e.textContent);' +
        'e=document.querySelector(".mq-title");if(e)e.textContent=fix(e.textContent);' +
      '});</script>';
      var injected = html.replace('</head>', configScript + '\n</head>').replace('</body>', namePatch + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(injected);
    } catch (e) { console.error('[inject]', e.message); }
  }

  serveStatic(url, res);
});

server.listen(PORT, function() {
  console.log('MC server: http://localhost:' + PORT + '/memory.html');
});
