const crypto = require('crypto');

const COOKIE_NAME = 'gps_tracker_session';
const SESSION_MESSAGE = 'personal-gps-tracker-dashboard-session';
const DEFAULT_BACKEND_URL = 'https://personal-gps-tracker.onrender.com';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE']);

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

function requestedPath(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw : String(raw || '').split('/');
  return parts.filter(Boolean).map((part) => decodeURIComponent(part));
}

module.exports = async function handler(req, res) {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ detail: 'Method not allowed' });
  }
  const token = process.env.API_TOKEN;
  if (!token) return res.status(500).json({ detail: 'Dashboard authentication is not configured' });

  const parts = requestedPath(req);
  if (!parts.length || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return res.status(404).json({ detail: 'Unknown API route' });
  }
  const path = `/api/${parts.join('/')}`;
  const isHealth = path === '/api/health';
  const authenticated = safeEqual(cookieValue(req.headers.cookie), sessionValue(token));
  if (!isHealth && !authenticated) return res.status(401).json({ detail: 'Dashboard authentication required' });

  const backendUrl = (process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');
  const upstream = new URL(`${backendUrl}${path}`);
  const incoming = new URL(req.url, 'https://vercel.internal');
  incoming.searchParams.forEach((value, key) => {
    if (key !== 'path') upstream.searchParams.append(key, value);
  });

  let body;
  if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const response = await fetch(upstream, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': req.headers['content-type'] || 'application/json' },
      body,
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (error) {
    console.error('backend proxy error', error);
    return res.status(502).json({ detail: 'Backend is unavailable' });
  }
};
