const User = require('../models/user.model');
const { setAuthCookie, clearAuthCookie } = require('../utils/token');
const { emitToAll } = require('../socket/io');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function userRegister(req, res) {
  const { email, fullName, password } = req.body || {};

  if (!email || !fullName || !password) {
    return res.status(400).json({ error: 'Full name, email and password are required' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    if (await User.findOne({ email: String(email).toLowerCase().trim() })) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = await User.create({ email, fullName, password });
    setAuthCookie(res, user._id); // log the new user in straight away

    // Tell everyone currently online that a new person joined, so their sidebar updates live.
    emitToAll('user:new', user.toPublic());

    res.status(201).json({ message: 'User Created Successfully', user: user.toPublic() });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'User already exists' });
    res.status(400).json({ error: error.message });
  }
}

async function userLogin(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');

  // Same message for "no such user" and "wrong password" so attackers can't probe which emails exist.
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  setAuthCookie(res, user._id);
  res.status(200).json({ message: 'Login Successfully', user: user.toPublic() });
}

async function userLogout(req, res) {
  clearAuthCookie(res);
  res.status(200).json({ message: 'Logged out successfully' });
}

// Used by the frontend on page load: "is my cookie still valid, and who am I?"
async function getMe(req, res) {
  res.status(200).json({ user: req.user.toPublic() });
}

module.exports = { userRegister, userLogin, userLogout, getMe };
