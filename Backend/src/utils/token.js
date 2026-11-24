const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'token';
const ONE_DAY = 24 * 60 * 60 * 1000;

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // throws if invalid / expired
}

// Cookie flags.
//  - Dev: Vite proxies /api and /socket.io, so everything is same-origin -> lax, not secure.
//  - Prod: the Express server also serves the frontend (same origin) -> lax + secure (HTTPS).
//  - Frontend hosted on a different domain? set COOKIE_SAME_SITE=none (requires HTTPS).
function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  return {
    httpOnly: true, // JavaScript in the browser can't read it -> protects against XSS token theft
    secure: isProd || sameSite === 'none',
    sameSite,
    maxAge: ONE_DAY,
  };
}

function setAuthCookie(res, userId) {
  const token = signToken(userId);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
}

module.exports = { COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
