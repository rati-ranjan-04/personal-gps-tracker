const assert = require('node:assert/strict');
const session = require('../dashboard/api/session.js');
const proxy = require('../dashboard/api/[...path].js');

process.env.API_TOKEN = 'test-only-secret-token';

function invoke(handler, request) {
  return new Promise((resolve) => {
    const response = {
      statusCode: 200,
      headers: {},
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[name] = value; },
      json(value) { this.body = value; resolve(this); },
      send(value) { this.body = value; resolve(this); },
    };
    Promise.resolve(handler(request, response)).then((value) => { if (value && value !== response) resolve(value); });
  });
}

(async () => {
  const login = await invoke(session, { method: 'POST', body: { token: process.env.API_TOKEN }, headers: {} });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['Set-Cookie'].split(';')[0];

  const originalFetch = global.fetch;
  let upstreamAuthorization = '';
  global.fetch = async (_url, options) => {
    upstreamAuthorization = options.headers.Authorization;
    return new Response(JSON.stringify({ tracking_enabled: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const proxied = await invoke(proxy, { method: 'GET', url: '/api/tracking/status', query: { path: ['tracking', 'status'] }, headers: { cookie } });
  assert.equal(proxied.statusCode, 200);
  assert.equal(upstreamAuthorization, `Bearer ${process.env.API_TOKEN}`);

  const unauthorized = await invoke(proxy, { method: 'GET', url: '/api/tracking/status', query: { path: ['tracking', 'status'] }, headers: {} });
  assert.equal(unauthorized.statusCode, 401);
  global.fetch = originalFetch;
  console.log('vercel proxy smoke test passed');
})().catch((error) => { console.error(error); process.exit(1); });
