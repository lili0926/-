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
var mcdb2 = getDb();
var encLib = encryption;

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

// ── 星图 Universe API ──
function serveUniverse(req, res) {
  try {
    var mcdb = getDb();

    // 实体查询（entity_profiles → 星座）
    var entities = mcdb.prepare(`
      SELECT ep.id, ep.name, ep.category, ep.overview, ep.fragment_count,
             ep.related_entities, ep.status as lifecycle_status,
             ep.updated_at, ep.created_at, ep.relationship_to_clara, ep.aliases, ep.tags,
             ep.entity_type, ep.subcategory
      FROM entity_profiles ep
      WHERE ep.status = 'active' AND ep.fragment_count > 0
      ORDER BY
        CASE ep.category WHEN 'person' THEN 0 WHEN 'pet' THEN 1 WHEN 'place' THEN 2
          WHEN 'event' THEN 3 WHEN 'project' THEN 4 ELSE 5 END,
        ep.fragment_count DESC
    `).all();

    var cfg = { user: { name: 'Jasmine' }, ai: { name: 'Aries' }, ui: { user_color: '#e8b96d', ai_color: '#6d9e8b' } };
    try { cfg = require('./memory_config.json'); } catch(_) {}
    var USER = cfg.user, AI = cfg.ai, UI = cfg.ui;

    var CORE_NAMES = [USER.name, AI.name];
    var coreEntities = entities.filter(function(e) { return CORE_NAMES.indexOf(e.name) >= 0; });
    // 核心实体的碎片也作为星座显示（让记忆星不是空的）
    var normalEntities = entities.filter(function(e) { return true; });
    // 但核心实体用特殊星系标记，星系标签用"社交"
    function galaxyFor(ent) {
      if (CORE_NAMES.indexOf(ent.name) >= 0) return '社交';
      var cat = ent.category || 'person';
      return GALAXY_LABELS[cat] || cat;
    }

    var GALAXY_COLORS = {
      person: '#ff9966', pet: '#ff9966', organization: '#ff9966',
      place: '#6699ff', event: '#66cc99',
      project: '#cc99ff', work: '#cc99ff', term: '#cc99ff',
      hobby: '#ffcc66', consumed: '#ffcc66',
    };
    var GALAXY_LABELS = {
      person:'社交', pet:'社交', organization:'社交',
      place:'地点', event:'事件',
      project: USER.name + '的', work: USER.name + '的', term: USER.name + '的',
      hobby:'爱好', consumed:'爱好',
    };

    var core = coreEntities.map(function(ent) {
      return {
        id: 'e' + ent.id, name: ent.name, overview: ent.overview || '',
        fragment_count: ent.fragment_count, relationship: ent.relationship_to_clara || '',
        updatedAt: ent.updated_at,
        color: ent.name === USER.name ? UI.user_color : UI.ai_color,
        role: ent.name === USER.name ? 'user' : 'ai',
      };
    });

    var maxFrags = Math.max(1, normalEntities.reduce(function(m, e) { return Math.max(m, e.fragment_count || 0); }, 1));

    var constellations = normalEntities.map(function(ent) {
      var frags = mcdb.prepare(`
        SELECT mf.id, COALESCE(mf.content, '') AS title, mf.content,
               mf.emotional_weight, mf.created_at AS date, mf.status AS lifecycle,
               mf.read_count, mf.entity_id, fe.confidence AS link_confidence, fe.relation
        FROM memory_fragments mf
        JOIN fragment_entities fe ON fe.fragment_id = mf.id
        WHERE fe.entity_id = ? AND mf.status IN ('active', 'consolidated', 'cooling', 'frozen')
        ORDER BY
          CASE mf.status WHEN 'active' THEN 0 WHEN 'consolidated' THEN 1 WHEN 'cooling' THEN 2 ELSE 3 END,
          fe.confidence DESC, mf.emotional_weight DESC
        LIMIT 40
      `).all(ent.id);

      var stars = frags.map(function(f) {
        return {
          id: 'f' + f.id, title: (f.title || '').slice(0, 40) || '…',
          content: (f.content || '').slice(0, 200),
          conf: 0.5, mag: 3.5, lifecycle: f.lifecycle || 'active',
          date: (f.date || '').slice(0, 10) || '', entity_id: f.entity_id,
        };
      });

      var episodes = mcdb.prepare(`
        SELECT id, title, content, weight, valid_from AS date
        FROM memories WHERE layer = 'episode' AND status = 'permanent' AND entity_id = ?
        ORDER BY weight DESC, valid_from DESC LIMIT 8
      `).all(ent.id).map(function(ep) {
        var c = ep.content || ''; try { c = encryption.decrypt(c); } catch(_) {}
        var t = ep.title || ''; try { t = encryption.decrypt(t); } catch(_) {}
        return { id: ep.id, title: t.slice(0, 60), content: c.slice(0, 250), weight: ep.weight, date: (ep.date || '').slice(0, 10) };
      });

      var cat = ent.category || 'person';
      return {
        id: 'e' + ent.id, label: ent.name, description: ent.overview || '',
        color: GALAXY_COLORS[cat] || '#8899aa',
        depth: 0.4 + (ent.fragment_count / maxFrags) * 1.2,
        fragment_count: ent.fragment_count, stars: stars, episodes: episodes,
        category: cat, galaxyLabel: galaxyFor(ent),
        aliases: [], tags: [], lifecycleStatus: ent.lifecycle_status || 'active',
        relatedEntities: [], relationship: ent.relationship_to_clara || '',
        updatedAt: ent.updated_at, createdAt: ent.created_at,
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      constellations: constellations,
      core: core,
      entities: constellations.map(function(c) { return { id: c.id, name: c.label, category: c.category, fragmentIds: c.stars.map(function(s) { return s.id; }) }; }),
      total_fragments: constellations.reduce(function(s, c) { return s + c.stars.length; }, 0),
      total_categories: constellations.length,
    }));
  } catch(e) {
    console.error('[universe] failed:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  var url = req.url.split('?')[0];
  var ck = cookies(req);

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

  // ══════ 多端口 API 配置管理 ══════
  if (req.method === 'GET' && url === '/api/api-configs') {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    try {
      var configs = mcdb2.prepare('SELECT id, nickname, relationship, provider, model, base_url, system_prompt, auto_mem, auto_mem_mode, auto_mem_budget, archived, sort_order, created_at, updated_at FROM mc_api_configs ORDER BY sort_order ASC, created_at ASC').all();
      var safe = configs.map(function(c) { return {...c, has_key: !!(c.api_key_enc), api_key_enc: undefined}; });
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({configs:safe}));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:e.message}));
    }
  }
  if (req.method === 'POST' && url === '/api/api-configs') {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    return parseBody(req, function(b) {
      try {
        if (!b.id) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'id required'})); }
        var count = mcdb2.prepare('SELECT COUNT(*) as c FROM mc_api_configs WHERE archived = 0').get();
        if (count.c >= 10) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'max 10'})); }
        var enc = b.api_key ? encLib.encrypt(b.api_key) : '';
        var maxOrder = mcdb2.prepare('SELECT MAX(sort_order) as m FROM mc_api_configs').get();
        mcdb2.prepare('INSERT INTO mc_api_configs (id, nickname, relationship, provider, model, base_url, api_key_enc, system_prompt, auto_mem, auto_mem_mode, auto_mem_budget, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          b.id, b.nickname||'', b.relationship||'', b.provider||'custom', b.model||'deepseek-chat', b.base_url||'', enc, b.system_prompt||'',
          b.auto_mem?1:0, b.auto_mem_mode||'hybrid', b.auto_mem_budget||1200, (maxOrder.m||0)+1);
        res.writeHead(200, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({success:true}));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:e.message}));
      }
    });
  }
  if (req.method === 'PUT' && url.startsWith('/api/api-configs/')) {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    var cfgId = url.split('/api/api-configs/')[1];
    return parseBody(req, function(b) {
      try {
        var ex = mcdb2.prepare('SELECT * FROM mc_api_configs WHERE id = ?').get(cfgId);
        if (!ex) { res.writeHead(404); return res.end(JSON.stringify({error:'not found'})); }
        var sets = [], vals = [];
        var fields = ['nickname','relationship','provider','model','base_url','system_prompt','auto_mem_mode'];
        fields.forEach(function(f) { if (b[f] !== undefined) { sets.push(f+' = ?'); vals.push(b[f]); } });
        if (b.auto_mem !== undefined) { sets.push('auto_mem = ?'); vals.push(b.auto_mem?1:0); }
        if (b.auto_mem_budget !== undefined) { sets.push('auto_mem_budget = ?'); vals.push(b.auto_mem_budget); }
        if (b.archived !== undefined) { sets.push('archived = ?'); vals.push(b.archived?1:0); }
        if (b.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(b.sort_order); }
        if (b.api_key) { sets.push('api_key_enc = ?'); vals.push(encLib.encrypt(b.api_key)); }
        if (!sets.length) { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({success:true})); }
        sets.push("updated_at = datetime('now')");
        vals.push(cfgId);
        mcdb2.prepare('UPDATE mc_api_configs SET '+sets.join(', ')+' WHERE id = ?').run(...vals);
        res.writeHead(200, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({success:true}));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:e.message}));
      }
    });
  }
  if (req.method === 'DELETE' && url.startsWith('/api/api-configs/')) {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    var cfgId2 = url.split('/api/api-configs/')[1];
    try {
      mcdb2.prepare('DELETE FROM mc_api_configs WHERE id = ?').run(cfgId2);
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({success:true}));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:e.message}));
    }
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

  // ══════ Memory CRUD（记忆星图页面用）══════

  // GET /api/memories — 列出所有记忆
  if (req.method === 'GET' && url === '/api/memories') {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    try {
      var allMems = mcdb2.prepare('SELECT * FROM memories ORDER BY pinned DESC, created_at DESC').all();
      var decrypted = allMems.map(function(m) {
        try {
          var content = encLib.decrypt(m.content || '');
          return { ...m, content: content };
        } catch(e) { return { ...m, content: m.content || '' }; }
      });
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({memories:decrypted}));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:e.message}));
    }
  }

  // GET /api/memory/:id — 获取单条记忆
  if (req.method === 'GET' && url.startsWith('/api/memory/') && url.split('/').length === 4) {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    try {
      var memId = parseInt(url.split('/api/memory/')[1]);
      var mem = mcdb2.prepare('SELECT * FROM memories WHERE id = ?').get(memId);
      if (!mem) { res.writeHead(404); return res.end(JSON.stringify({error:'not found'})); }
      try { mem.content = encLib.decrypt(mem.content || ''); } catch(e) {}
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({memory:mem}));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:e.message}));
    }
  }

  // POST /api/memory — 创建记忆
  if (req.method === 'POST' && url === '/api/memory') {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    return parseBody(req, function(b) {
      try {
        var title = b.title || '无标题';
        var content = b.content || '';
        var tags = JSON.stringify(b.tags || []);
        var encContent = encLib.encrypt(content);
        var now = new Date().toISOString();
        var result = mcdb2.prepare(
          'INSERT INTO memories (title, content, tags, status, valence, arousal, importance, pinned, domain, visibility, summary, one_line, source, resolved, visible_to, exclude_from, activation_count, last_activated, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(
          title, encContent, tags, 'permanent',
          b.valence != null ? b.valence : 0.5,
          b.arousal != null ? b.arousal : 0.3,
          b.importance || 5,
          b.pinned ? 1 : 0,
          b.domain || '日常',
          b.visibility || 'public',
          b.summary || '',
          b.one_line || '',
          b.source || 'manual',
          b.resolved ? 1 : 0,
          JSON.stringify(b.visible_to || []),
          JSON.stringify(b.exclude_from || []),
          1, now, now, now
        );
        res.writeHead(200, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({success:true, id: result.lastInsertRowid}));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:e.message}));
      }
    });
  }

  // PUT /api/memory/:id — 更新记忆
  if (req.method === 'PUT' && url.startsWith('/api/memory/') && url.split('/').length === 4) {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    var memId2 = parseInt(url.split('/api/memory/')[1]);
    return parseBody(req, function(b) {
      try {
        var oldMem = mcdb2.prepare('SELECT * FROM memories WHERE id = ?').get(memId2);
        if (!oldMem) { res.writeHead(404); return res.end(JSON.stringify({error:'not found'})); }
        var sets = [], vals = [];
        if (b.title !== undefined) { sets.push('title = ?'); vals.push(b.title); }
        if (b.content !== undefined) { sets.push('content = ?'); vals.push(encLib.encrypt(b.content)); }
        if (b.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(b.tags)); }
        if (b.status !== undefined) { sets.push('status = ?'); vals.push(b.status); }
        if (b.valence !== undefined) { sets.push('valence = ?'); vals.push(b.valence); }
        if (b.arousal !== undefined) { sets.push('arousal = ?'); vals.push(b.arousal); }
        if (b.importance !== undefined) { sets.push('importance = ?'); vals.push(b.importance); }
        if (b.pinned !== undefined) { sets.push('pinned = ?'); vals.push(b.pinned ? 1 : 0); }
        if (b.domain !== undefined) { sets.push('domain = ?'); vals.push(b.domain); }
        if (b.visibility !== undefined) { sets.push('visibility = ?'); vals.push(b.visibility); }
        if (b.summary !== undefined) { sets.push('summary = ?'); vals.push(b.summary); }
        if (b.one_line !== undefined) { sets.push('one_line = ?'); vals.push(b.one_line); }
        if (b.source !== undefined) { sets.push('source = ?'); vals.push(b.source); }
        if (b.resolved !== undefined) { sets.push('resolved = ?'); vals.push(b.resolved ? 1 : 0); }
        if (b.visible_to !== undefined) { sets.push('visible_to = ?'); vals.push(JSON.stringify(b.visible_to)); }
        if (b.exclude_from !== undefined) { sets.push('exclude_from = ?'); vals.push(JSON.stringify(b.exclude_from)); }
        if (!sets.length) { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({success:true})); }
        sets.push("updated_at = datetime('now')");
        vals.push(memId2);
        mcdb2.prepare('UPDATE memories SET '+sets.join(', ')+' WHERE id = ?').run(...vals);
        res.writeHead(200, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({success:true}));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:e.message}));
      }
    });
  }

  // DELETE /api/memory/:id — 删除记忆
  if (req.method === 'DELETE' && url.startsWith('/api/memory/') && url.split('/').length === 4) {
    if (!authed(ck.mc_session)) { res.writeHead(401); return res.end(JSON.stringify({error:'unauthorized'})); }
    var memId3 = parseInt(url.split('/api/memory/')[1]);
    try {
      mcdb2.prepare('DELETE FROM memories WHERE id = ?').run(memId3);
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({success:true}));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:e.message}));
    }
  }

  // GET /api/memory/universe — 星图数据
  if (req.method === 'GET' && url === '/api/memory/universe') {
    return serveUniverse(req, res);
  }

  // Auth check
  if (url !== '/login.html' && url !== '/login' && url !== '/memory-stars.html' && !url.startsWith('/api/')) {
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
