// Who is online right now?  userId -> Set of socket ids (one user can have many tabs/devices)
//
// This lives in server memory. That is fast and simple, but it means ONE server process.
// To scale to several servers you'd move this to Redis (see docs/ARCHITECTURE.md).
const sockets = new Map();
const offlineTimers = new Map();

function addSocket(userId, socketId) {
  // If the user was in a "just disconnected" grace window, cancel the pending offline.
  clearTimeout(offlineTimers.get(userId));
  offlineTimers.delete(userId);

  const wasOnline = sockets.has(userId);
  if (!wasOnline) sockets.set(userId, new Set());
  sockets.get(userId).add(socketId);
  return { cameOnline: !wasOnline };
}

// Remove one socket. Returns true if the user now has NO sockets left.
function removeSocket(userId, socketId) {
  const set = sockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  return set.size === 0;
}

// Wait a moment before declaring a user offline, so a page refresh
// (disconnect -> reconnect within ~1s) doesn't flicker the green dot.
function scheduleOffline(userId, graceMs, onOffline) {
  clearTimeout(offlineTimers.get(userId));
  const timer = setTimeout(() => {
    offlineTimers.delete(userId);
    const set = sockets.get(userId);
    if (!set || set.size === 0) {
      sockets.delete(userId);
      onOffline();
    }
  }, graceMs);
  offlineTimers.set(userId, timer);
}

// "Online" for delivery purposes = at least one live socket right now.
function isUserOnline(userId) {
  const set = sockets.get(String(userId));
  return !!set && set.size > 0;
}

function getOnlineUserIds() {
  return [...sockets.keys()].filter((id) => sockets.get(id).size > 0);
}

module.exports = { addSocket, removeSocket, scheduleOffline, isUserOnline, getOnlineUserIds };
