const DEFAULT_BACKEND_URL = 'https://personal-gps-tracker.onrender.com';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE']);

function backendUrl() {
  return (process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');
}

function routePath(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw : String(raw || '').split('/');
  return parts.filter(Boolean).map((part) => decodeURIComponent(part));
}

function validParts(parts) {
  return parts.length > 0 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

async function forward(req, res, parts, token) {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ detail: 'Method not allowed' });
  }
  if (!validParts(parts)) return res.status(404).json({ detail: 'Unknown API route' });

  const path = `/api/${parts.join('/')}`;
  const upstream = new URL(`${backendUrl()}${path}`);
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
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
}

module.exports = { ALLOWED_METHODS, backendUrl, routePath, validParts, forward };
