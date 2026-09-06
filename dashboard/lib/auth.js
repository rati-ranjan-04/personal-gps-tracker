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

function configuredToken() {
  return process.env.API_TOKEN || '';
}

function isAuthenticated(req, token = configuredToken()) {
  return Boolean(token) && safeEqual(cookieValue(req.headers.cookie), sessionValue(token));
}

module.exports = { COOKIE_NAME, SESSION_MESSAGE, sessionValue, safeEqual, cookieValue, configuredToken, isAuthenticated };
