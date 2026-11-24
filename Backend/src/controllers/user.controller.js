const User = require('../models/user.model');
const { getOnlineUserIds } = require('../socket/presence');

// Everyone except me -> the "people you can chat with" list.
async function listUsers(req, res) {
  const users = await User.find({ _id: { $ne: req.user._id } }).sort({ fullName: 1 });
  const online = new Set(getOnlineUserIds());
  res.json({ users: users.map((u) => ({ ...u.toPublic(), online: online.has(u._id.toString()) })) });
}

module.exports = { listUsers };
