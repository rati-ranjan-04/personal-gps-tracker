const { configuredToken, isAuthenticated } = require('../lib/auth');
const { routePath, forward } = require('../lib/backend-proxy');

module.exports = async function handler(req, res) {
  const token = configuredToken();
  if (!token) return res.status(500).json({ detail: 'Missing server-side Vercel environment variable: API_TOKEN' });
  const parts = routePath(req);
  const isHealth = parts.length === 1 && parts[0] === 'health';
  if (!isHealth && !isAuthenticated(req, token)) return res.status(401).json({ detail: 'Dashboard authentication required' });
  return forward(req, res, parts, token);
};
