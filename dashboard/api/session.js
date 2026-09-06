const crypto = require('crypto');

const COOKIE_NAME = 'gps_tracker_session';
const SESSION_MESSAGE = 'personal-gps-tracker-dashboard-session';

function sessionValue(token) {
  return crypto.createHmac('sha256', token).update(SESSION_MESSAGE).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookieValue(header = '') {
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : '';
}

module.exports = async function handler(req, res) {
  const expectedToken = process.env.API_TOKEN;
  if (!expectedToken) return res.status(500).json({ detail: 'Dashboard authentication is not configured' });

  if (req.method === 'POST') {
    const suppliedToken = typeof req.body === 'string' ? JSON.parse(req.body || '{}').token : req.body?.token;
    if (!suppliedToken || !safeEqual(String(suppliedToken), String(expectedToken))) {
      return res.status(401).json({ detail: 'Invalid dashboard token' });
    }
    const value = sessionValue(expectedToken);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return res.status(200).json({ authenticated: true });
  }

  if (req.method === 'GET') {
    const authenticated = safeEqual(cookieValue(req.headers.cookie), sessionValue(expectedToken));
    return res.status(authenticated ? 200 : 401).json({ authenticated });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return res.status(200).json({ authenticated: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ detail: 'Method not allowed' });
};
