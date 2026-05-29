import { list } from '@vercel/blob';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let visits = [];
    const { blobs } = await list({ prefix: 'visits.json' });
    if (blobs && blobs.length > 0) {
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      const response = await fetch(latest.url);
      if (response.ok) {
        visits = await response.json();
      }
    }

    const totalViews = visits.length;
    const uniqueIps = new Set(visits.map(v => v.ip)).size;

    return res.status(200).json({
      success: true,
      total_views: totalViews,
      unique_visitors: uniqueIps,
      visits
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
