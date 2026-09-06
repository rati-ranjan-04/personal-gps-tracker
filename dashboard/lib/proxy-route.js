const { configuredToken, isAuthenticated } = require('./auth');
const { forward } = require('./backend-proxy');

function createProxyRoute(parts, options = {}) {
  return async function handler(req, res) {
    const token = configuredToken();
    if (!token) return res.status(500).json({ detail: 'Missing server-side Vercel environment variable: API_TOKEN' });
    if (!options.public && !isAuthenticated(req, token)) return res.status(401).json({ detail: 'Dashboard authentication required' });
    return forward(req, res, parts, token);
  };
}

module.exports = { createProxyRoute };
