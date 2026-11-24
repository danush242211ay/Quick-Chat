const User = require('../models/user.model');
const { COOKIE_NAME, verifyToken } = require('../utils/token');

// Protects HTTP routes: reads the JWT from the cookie, loads the user, sets req.user.
async function protect(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = verifyToken(token);
    const user = await User.findById(id);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { protect };
