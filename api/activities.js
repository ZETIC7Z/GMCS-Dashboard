import { list, put } from '@vercel/blob';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      let activities = [];
      const { blobs } = await list({ prefix: 'activities.json' });
      if (blobs && blobs.length > 0) {
        const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
        const response = await fetch(latest.url);
        if (response.ok) {
          activities = await response.json();
        }
      }
      return res.status(200).json({ success: true, activities });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      const { ids, all } = body || {};
      let activities = [];
      const { blobs } = await list({ prefix: 'activities.json' });
      if (blobs && blobs.length > 0) {
        const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
        const response = await fetch(latest.url);
        if (response.ok) {
          activities = await response.json();
        }
      }

      if (all) {
        activities = [];
      } else if (Array.isArray(ids)) {
        activities = activities.filter(act => !ids.includes(act.id));
      }

      await put('activities.json', JSON.stringify(activities), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ success: true, activities });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
