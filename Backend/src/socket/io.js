// Holds the single Socket.io server instance so ANY file (controllers, services)
// can push events to users without importing the whole socket setup.
let io = null;

const room = (userId) => `user:${userId}`;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

// Send an event to every open tab/device of one user.
// `exceptSocketId` lets us skip the tab that triggered the event.
function emitToUser(userId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(room(userId));
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
}

// Send an event to everyone connected.
function emitToAll(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { setIO, getIO, room, emitToUser, emitToAll };
