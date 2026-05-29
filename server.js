/**
 * GMCS Compliance Dashboard — Local Development Server
 *
 * Mirrors Vercel's routing:
 *   GET  /          → index.html  (main dashboard)
 *   GET  /admin     → admin.html  (upload page)
 *   POST /api/upload → processes Excel files, saves JSON to ./data/dashboard-data.json
 *   GET  /api/data   → returns ./data/dashboard-data.json
 *   GET  /*         → static files
 *
 * Run:  node server.js
 * Then: open http://localhost:3000
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file manually
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    if (key && val) {
      process.env[key] = val;
    }
  });
}

const PORT = process.env.PORT || 3000;
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'dashboard-data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── MIME TYPES ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

// ─── MULTIPART PARSER ──────────────────────────────────────────────────────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const ct   = req.headers['content-type'] || '';
        const bm   = ct.match(/boundary=([^\s;]+)/);
        if (!bm) return reject(new Error('No multipart boundary'));
        const boundary = '--' + bm[1];
        const files = {};
        const bodyStr = body.toString('binary');
        const parts   = bodyStr.split(boundary);
        for (const part of parts) {
          if (!part.includes('Content-Disposition')) continue;
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const header    = part.substring(0, headerEnd);
          const nameMatch = header.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          const raw     = part.substring(headerEnd + 4);
          const content = raw.endsWith('\r\n') ? raw.slice(0, -2) : raw;
          files[nameMatch[1]] = Buffer.from(content, 'binary');
        }
        resolve(files);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─── DATA PROCESSING (mirrors api/upload.js logic) ────────────────────────────
function getCategory(subCat, category) {
  const s = String(subCat || '').toUpperCase();
  const c = String(category || '').toUpperCase();
  if (s.includes('GEN AI'))       return 'Gen AI';
  if (s.includes('IS ADVOCATE'))  return 'IS Advocate';
  if (s.includes('ETHICS'))       return 'Ethics & Compliance';
  if (s.includes('WORKDAY'))      return 'Workday';
  if (c === 'SURVEY')             return 'Survey';
  return null;
}

function getTrainingTitle(row) {
  const cols = ['Ethics & Compliance Trainings', 'IS Advocate Training', 'Survey', 'Workday', 'GEN AI '];
  for (const col of cols) {
    const v = String(row[col] || '').trim();
    if (v) return v;
  }
  return String(row['Title'] || '').trim();
}

function buildDashboardData(rosterRows, trackerRows, mandatoryRows) {
  const CATS = ['Ethics & Compliance', 'IS Advocate', 'Gen AI', 'Survey', 'Workday'];

  // Roster — active employees only
  const rosterLookup = {};
  for (const r of rosterRows) {
    const eid = String(r['Enterprise ID'] || '').trim().toLowerCase();
    if (!eid || eid === 'nan') continue;
    if (String(r['Resource Status'] || '').trim() !== 'Active') continue;
    rosterLookup[eid] = {
      project:  String(r['GMCS Project']       || '').trim(),
      level:    String(r['Management Level']   || '').trim(),
      location: String(r['PH Location '] || r['PH Location'] || '').trim(),
      manager:  String(r['Manager/POC']        || '').trim(),
    };
  }
  const allEids = Object.keys(rosterLookup).sort();

  // Mandatory training list
  const titleToCat  = {};
  const catTrainings = {};
  const allTitles   = [];
  CATS.forEach(c => { catTrainings[c] = []; });
  for (const r of mandatoryRows) {
    const title = String(r['Title'] || '').trim();
    if (!title) continue;
    const cat = getCategory(r['Trainings Sub Category'], r['Category']);
    if (!cat) continue;
    titleToCat[title] = cat;
    if (!catTrainings[cat].includes(title)) {
      catTrainings[cat].push(title);
      allTitles.push(title);
    }
  }

  // Tracker — completed entries only
  const eidCompleted = {};
  for (const r of trackerRows) {
    const eid    = String(r['Enterprise ID'] || '').trim().toLowerCase();
    const status = String(r['Status']        || '').trim();
    if (status !== 'Completed') continue;
    const title = getTrainingTitle(r);
    if (!title) continue;
    if (!eidCompleted[eid]) eidCompleted[eid] = new Set();
    eidCompleted[eid].add(title);
  }

  // Per-EID compliance status
  const eidStatus = {};
  for (const eid of allEids) {
    const info       = rosterLookup[eid];
    const compliance = {};
    for (const cat of CATS) {
      compliance[cat] = (catTrainings[cat] || []).some(t => eidCompleted[eid]?.has(t));
    }
    const done = Object.values(compliance).filter(Boolean).length;
    eidStatus[eid] = { ...info, compliance, done, total: 5, pct: Math.round(done / 5 * 100) };
  }

  // Per-title completed EID arrays (arrays for JSON serialisation)
  const titleDone = {};
  for (const title of allTitles) {
    titleDone[title] = allEids.filter(e => eidCompleted[e]?.has(title));
  }

  // Summary stats
  const perCat = {};
  for (const cat of CATS) {
    perCat[cat] = {
      compliant:     allEids.filter(e =>  eidStatus[e].compliance[cat]).length,
      non_compliant: allEids.filter(e => !eidStatus[e].compliance[cat]).length,
    };
  }

  const managers = [...new Set(allEids.map(e => eidStatus[e].manager).filter(Boolean))].sort();
  const projects  = [...new Set(allEids.map(e => eidStatus[e].project).filter(Boolean))].sort();

  function buildGroupSummary(getGroup, groups) {
    const result = {};
    for (const grp of groups) {
      const gEids = allEids.filter(e => getGroup(e) === grp);
      if (!gEids.length) continue;
      const s = {
        total: gEids.length,
        full:  gEids.filter(e => eidStatus[e].done === 5).length,
        zero:  gEids.filter(e => eidStatus[e].done === 0).length,
      };
      for (const cat of CATS) {
        const c = gEids.filter(e => eidStatus[e].compliance[cat]).length;
        s[cat]  = { c, nc: gEids.length - c };
      }
      for (const title of allTitles) {
        const ncEids = gEids.filter(e => !titleDone[title].includes(e));
        s['tr_' + title] = { c: gEids.length - ncEids.length, nc: ncEids.length, eids_nc: ncEids };
      }
      result[grp] = s;
    }
    return result;
  }

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_active:       allEids.length,
      full_compliant:     allEids.filter(e => eidStatus[e].done === 5).length,
      partial_compliant:  allEids.filter(e => eidStatus[e].done > 0 && eidStatus[e].done < 5).length,
      zero_compliant:     allEids.filter(e => eidStatus[e].done === 0).length,
      per_cat:            perCat,
    },
    categories:      CATS,
    cat_trainings:   catTrainings,
    all_titles:      allTitles,
    title_to_cat:    titleToCat,
    title_done:      titleDone,
    eid_status:      eidStatus,
    managers,
    projects,
    manager_summary: buildGroupSummary(e => eidStatus[e].manager, managers),
    project_summary: buildGroupSummary(e => eidStatus[e].project, projects),
  };
}

// ─── ROUTE HANDLERS ────────────────────────────────────────────────────────────
async function handleUpload(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  try {
    console.log('[upload] Parsing multipart form data…');
    const files = await parseMultipart(req);

    if (!files.tracker || !files.roster || !files.mandatory) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing files. Need: tracker, roster, mandatory' }));
      return;
    }

    console.log('[upload] Reading Excel files…');
    const rosterRows    = XLSX.utils.sheet_to_json(XLSX.read(files.roster,    { type: 'buffer' }).Sheets[XLSX.read(files.roster,    { type: 'buffer' }).SheetNames[0]], { defval: '' });
    const trackerRows   = XLSX.utils.sheet_to_json(XLSX.read(files.tracker,   { type: 'buffer' }).Sheets[XLSX.read(files.tracker,   { type: 'buffer' }).SheetNames[0]], { defval: '' });
    const mandatoryRows = XLSX.utils.sheet_to_json(XLSX.read(files.mandatory, { type: 'buffer' }).Sheets[XLSX.read(files.mandatory, { type: 'buffer' }).SheetNames[0]], { defval: '' });

    console.log(`[upload] Roster: ${rosterRows.length} rows | Tracker: ${trackerRows.length} rows | Mandatory: ${mandatoryRows.length} rows`);
    console.log('[upload] Building dashboard data…');

    const data    = buildDashboardData(rosterRows, trackerRows, mandatoryRows);
    const jsonStr = JSON.stringify(data);

    fs.writeFileSync(DATA_FILE, jsonStr);
    console.log(`[upload] ✓ Saved to ${DATA_FILE} (${(jsonStr.length / 1024).toFixed(0)} KB)`);
    console.log(`[upload] ✓ ${data.summary.total_active} active employees processed`);

    logLocalActivity('Uploaded new compliance data', {
      total_employees: data.summary.total_active,
      generated_at: data.generated_at
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success:          true,
      total_employees:  data.summary.total_active,
      generated_at:     data.generated_at,
      message:          'Dashboard data updated successfully',
    }));
  } catch (err) {
    console.error('[upload] Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleData(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!fs.existsSync(DATA_FILE)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no_data', message: 'No data yet. Go to /admin to upload files.' }));
    return;
  }
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function serveStatic(urlPath, res) {
  // Route mapping (mirrors vercel.json)
  let filePath;
  if (urlPath === '/' || urlPath === '') {
    filePath = path.join(__dirname, 'index.html');
  } else if (urlPath === '/admin') {
    filePath = path.join(__dirname, 'admin.html');
  } else {
    filePath = path.join(__dirname, urlPath.replace(/^\//, ''));
  }

  if (!fs.existsSync(filePath)) {
    // Fallback to index.html for SPA-style routing
    filePath = path.join(__dirname, 'index.html');
  }

  const ext      = path.extname(filePath);
  const mimeType = MIME[ext] || 'text/plain';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error', err => reject(err));
  });
}

function logLocalActivity(action, details = {}) {
  try {
    const activityFile = path.join(DATA_DIR, 'activities.json');
    let list = [];
    if (fs.existsSync(activityFile)) {
      try { list = JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch (e) {}
    }
    const log = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      action,
      ...details
    };
    list.unshift(log);
    if (list.length > 500) list = list.slice(0, 500);
    fs.writeFileSync(activityFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Local activity log error:', err);
  }
}

async function logLocalVisit(req) {
  try {
    let ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');

    let country = 'PH';
    let city = 'Local Dev';

    if (ip !== '::1' && ip !== '127.0.0.1' && !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.16.') && typeof fetch !== 'undefined') {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,city`);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            country = geo.countryCode;
            city = geo.city;
          }
        }
      } catch (e) {
        console.error('Geo lookup error:', e);
      }
    }

    const visitsFile = path.join(DATA_DIR, 'visits.json');
    let visits = [];
    if (fs.existsSync(visitsFile)) {
      try { visits = JSON.parse(fs.readFileSync(visitsFile, 'utf8')); } catch (e) {}
    }

    visits.unshift({
      ip,
      country,
      city,
      timestamp: new Date().toISOString()
    });

    if (visits.length > 1000) visits = visits.slice(0, 1000);
    fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2), 'utf8');
  } catch (err) {
    console.error('Local visit log error:', err);
  }
}

function checkAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Basic ')) return false;
  const creds = Buffer.from(authHeader.substring(6), 'base64').toString('ascii');
  const [user, pass] = creds.split(':');
  
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || '#Luna1996!';
  
  return user === expectedUser && pass === expectedPass;
}

// ─── MAIN SERVER ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0]; // strip query string
  const method = req.method;

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  console.log(`[${method}] ${url}`);

  if (url === '/api/login') {
    if (method !== 'POST') {
      res.writeHead(405); res.end('Method not allowed'); return;
    }
    if (checkAuth(req)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
  } else if (url === '/api/upload') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    await handleUpload(req, res);
  } else if (url === '/api/data') {
    logLocalVisit(req).catch(err => console.error('Visit log error:', err));
    handleData(req, res);
  } else if (url === '/api/activities') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    if (method === 'GET') {
      const activityFile = path.join(DATA_DIR, 'activities.json');
      let activities = [];
      if (fs.existsSync(activityFile)) {
        try { activities = JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch (e) {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, activities }));
    } else if (method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const { ids, all } = body;
        const activityFile = path.join(DATA_DIR, 'activities.json');
        let activities = [];
        if (fs.existsSync(activityFile)) {
          try { activities = JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch (e) {}
        }
        if (all) {
          activities = [];
        } else if (Array.isArray(ids)) {
          activities = activities.filter(act => !ids.includes(act.id));
        }
        fs.writeFileSync(activityFile, JSON.stringify(activities, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, activities }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    } else {
      res.writeHead(405); res.end('Method not allowed');
    }
  } else if (url === '/api/visits') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    if (method === 'GET') {
      const visitsFile = path.join(DATA_DIR, 'visits.json');
      let visits = [];
      if (fs.existsSync(visitsFile)) {
        try { visits = JSON.parse(fs.readFileSync(visitsFile, 'utf8')); } catch (e) {}
      }
      const totalViews = visits.length;
      const uniqueIps = new Set(visits.map(v => v.ip)).size;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, total_views: totalViews, unique_visitors: uniqueIps, visits }));
    } else {
      res.writeHead(405); res.end('Method not allowed');
    }
  } else {
    serveStatic(url, res);
  }
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   GMCS FY26 Compliance Dashboard — Local Dev Server     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║   Dashboard:  http://localhost:${PORT}                      ║`);
  console.log(`║   Admin:      http://localhost:${PORT}/admin                ║`);
  console.log(`║   Data API:   http://localhost:${PORT}/api/data             ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   1. Open /admin and upload your 3 Excel files          ║');
  console.log('║   2. Open / to see the live dashboard                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
});
