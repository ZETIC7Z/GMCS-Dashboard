export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const creds = Buffer.from(authHeader.substring(6), 'base64').toString('ascii');
    const [user, pass] = creds.split(':');

    const expectedUser = process.env.ADMIN_USER || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || '#Luna1996!';

    if (user === expectedUser && pass === expectedPass) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
