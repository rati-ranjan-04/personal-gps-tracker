const {
  COOKIE_NAME,
  sessionValue,
  safeEqual,
  cookieValue,
  configuredToken,
} = require('../lib/auth');

module.exports = async function handler(req, res) {
  const expectedToken = configuredToken();
  if (!expectedToken) return res.status(500).json({ detail: 'Missing server-side Vercel environment variable: API_TOKEN' });

  if (req.method === 'POST') {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload || '{}'); } catch { payload = {}; }
    }
    const suppliedToken = payload?.token;
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
