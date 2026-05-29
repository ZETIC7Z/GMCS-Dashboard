import { put, list } from '@vercel/blob';
import XLSX from 'xlsx';

export const config = { api: { bodyParser: false } };

// Parse multipart form data manually
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
      if (!boundaryMatch) return reject(new Error('No boundary in content-type'));
      const boundary = '--' + boundaryMatch[1];
      const files = {};
      const parts = body.toString('binary').split(boundary);
      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const header = part.substring(0, headerEnd);
        const nameMatch = header.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        const rawContent = part.substring(headerEnd + 4);
        const content = rawContent.endsWith('\r\n') ? rawContent.slice(0, -2) : rawContent;
        const buf = Buffer.from(content, 'binary');
        files[name] = buf;
      }
      resolve(files);
    });
    req.on('error', reject);
  });
}

function readSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function getCategory(subCat, category) {
  const s = String(subCat || '').toUpperCase();
  const c = String(category || '').toUpperCase();
  if (s.includes('GEN AI')) return 'Gen AI';
  if (s.includes('IS ADVOCATE')) return 'IS Advocate';
  if (s.includes('ETHICS')) return 'Ethics & Compliance';
  if (s.includes('WORKDAY')) return 'Workday';
  if (c === 'SURVEY') return 'Survey';
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

  // Roster
  const rosterLookup = {};
  for (const r of rosterRows) {
    const eid = String(r['Enterprise ID'] || '').trim().toLowerCase();
    if (!eid || eid === 'nan') continue;
    if (String(r['Resource Status'] || '').trim() !== 'Active') continue;
    rosterLookup[eid] = {
      project: String(r['GMCS Project'] || '').trim(),
      level: String(r['Management Level'] || '').trim(),
      location: String(r['PH Location '] || r['PH Location'] || '').trim(),
      manager: String(r['Manager/POC'] || '').trim(),
    };
  }
  const allEids = Object.keys(rosterLookup).sort();

  // Mandatory list
  const titleToCat = {};
  const catTrainings = {};
  const allTitles = [];
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

  // Tracker — completed only
  const eidCompleted = {};
  for (const r of trackerRows) {
    const eid = String(r['Enterprise ID'] || '').trim().toLowerCase();
    if (String(r['Status'] || '').trim() !== 'Completed') continue;
    const title = getTrainingTitle(r);
    if (!title) continue;
    if (!eidCompleted[eid]) eidCompleted[eid] = new Set();
    eidCompleted[eid].add(title);
  }

  // Per-EID status
  const eidStatus = {};
  for (const eid of allEids) {
    const info = rosterLookup[eid];
    const compliance = {};
    for (const cat of CATS) {
      compliance[cat] = (catTrainings[cat] || []).some(t => eidCompleted[eid]?.has(t));
    }
    const done = Object.values(compliance).filter(Boolean).length;
    eidStatus[eid] = { ...info, compliance, done, total: 5, pct: Math.round(done / 5 * 100) };
  }

  // Per-title done EIDs (stored as arrays for JSON serialization)
  const titleDone = {};
  for (const title of allTitles) {
    titleDone[title] = allEids.filter(e => eidCompleted[e]?.has(title));
  }

  // Summary
  const perCat = {};
  for (const cat of CATS) {
    perCat[cat] = {
      compliant: allEids.filter(e => eidStatus[e].compliance[cat]).length,
      non_compliant: allEids.filter(e => !eidStatus[e].compliance[cat]).length,
    };
  }

  const managers = [...new Set(allEids.map(e => eidStatus[e].manager).filter(Boolean))].sort();
  const projects = [...new Set(allEids.map(e => eidStatus[e].project).filter(Boolean))].sort();

  function buildGroupSummary(getGroup, groups) {
    const result = {};
    for (const grp of groups) {
      const gEids = allEids.filter(e => getGroup(e) === grp);
      if (!gEids.length) continue;
      const s = {
        total: gEids.length,
        full: gEids.filter(e => eidStatus[e].done === 5).length,
        zero: gEids.filter(e => eidStatus[e].done === 0).length,
      };
      for (const cat of CATS) {
        const c = gEids.filter(e => eidStatus[e].compliance[cat]).length;
        s[cat] = { c, nc: gEids.length - c };
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
      total_active: allEids.length,
      full_compliant: allEids.filter(e => eidStatus[e].done === 5).length,
      partial_compliant: allEids.filter(e => eidStatus[e].done > 0 && eidStatus[e].done < 5).length,
      zero_compliant: allEids.filter(e => eidStatus[e].done === 0).length,
      per_cat: perCat,
    },
    categories: CATS,
    cat_trainings: catTrainings,
    all_titles: allTitles,
    title_to_cat: titleToCat,
    title_done: titleDone,
    eid_status: eidStatus,
    managers,
    projects,
    manager_summary: buildGroupSummary(e => eidStatus[e].manager, managers),
    project_summary: buildGroupSummary(e => eidStatus[e].project, projects),
  };
}

async function logVercelActivity(action, details = {}) {
  try {
    let listData = [];
    const { blobs } = await list({ prefix: 'activities.json' });
    if (blobs && blobs.length > 0) {
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      const res = await fetch(latest.url);
      if (res.ok) {
        listData = await res.json();
      }
    }
    const log = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      action,
      ...details
    };
    listData.unshift(log);
    if (listData.length > 500) listData = listData.slice(0, 500);
    await put('activities.json', JSON.stringify(listData), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error('Error logging vercel activity:', err);
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const files = await parseFormData(req);
    if (!files.tracker || !files.roster || !files.mandatory) {
      return res.status(400).json({ error: 'Missing files. Need: tracker, roster, mandatory' });
    }

    const rosterRows    = readSheet(files.roster);
    const trackerRows   = readSheet(files.tracker);
    const mandatoryRows = readSheet(files.mandatory);

    const dashboardData = buildDashboardData(rosterRows, trackerRows, mandatoryRows);
    const jsonStr = JSON.stringify(dashboardData);

    const blob = await put('dashboard-data.json', jsonStr, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    await logVercelActivity('Uploaded new compliance data', {
      total_employees: dashboardData.summary.total_active,
      generated_at: dashboardData.generated_at
    });

    return res.status(200).json({
      success: true,
      total_employees: dashboardData.summary.total_active,
      generated_at: dashboardData.generated_at,
      blob_url: blob.url,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
