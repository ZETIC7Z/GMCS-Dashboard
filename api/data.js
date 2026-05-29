import { list, put } from '@vercel/blob';

async function logVercelVisit(req) {
  try {
    let ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');

    let country = req.headers['x-vercel-ip-country'] || 'PH';
    let city = req.headers['x-vercel-ip-city'] || 'Manila';

    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
      country = 'PH';
      city = 'Local Dev';
    }

    let visits = [];
    const { blobs } = await list({ prefix: 'visits.json' });
    if (blobs && blobs.length > 0) {
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      const res = await fetch(latest.url);
      if (res.ok) {
        visits = await res.json();
      }
    }

    visits.unshift({
      ip,
      country,
      city,
      timestamp: new Date().toISOString()
    });

    if (visits.length > 1000) visits = visits.slice(0, 1000);

    await put('visits.json', JSON.stringify(visits), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error('Error logging vercel visit:', err);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    // List blobs to find dashboard-data.json
    const { blobs } = await list({ prefix: 'dashboard-data' });
    if (!blobs || blobs.length === 0) {
      return res.status(404).json({ error: 'no_data', message: 'No dashboard data uploaded yet. Please visit /admin to upload files.' });
    }

    // Get the most recent blob
    const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];

    // Fetch and return the JSON (log visit concurrently)
    const [response] = await Promise.all([
      fetch(latest.url),
      logVercelVisit(req).catch(e => console.error('Vercel visit log error:', e))
    ]);

    if (!response.ok) throw new Error('Failed to fetch blob: ' + response.status);
    const data = await response.json();

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Data fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}
