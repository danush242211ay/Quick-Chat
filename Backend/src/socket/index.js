const { Server } = require('socket.io');
const cookie = require('cookie');
const User = require('../models/user.model');
const messageService = require('../services/message.service');
const { COOKIE_NAME, verifyToken } = require('../utils/token');
const { isId } = require('../utils/ids');
const { setIO, room, emitToUser, emitToAll } = require('./io');
const presence = require('./presence');

const OFFLINE_GRACE_MS = 1500;

// Tiny per-socket limiter: max 20 messages per 10 seconds (stops spam / runaway loops).
function createLimiter(max = 20, windowMs = 10_000) {
  let stamps = [];
  return () => {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= max) return false;
    stamps.push(now);
    return true;
  };
}

function initSocket(httpServer) {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',');

  const io = new Server(httpServer, {
    // Only needed when the frontend is served from a DIFFERENT origin than this server.
    cors: { origin: allowedOrigins, credentials: true },
  });
  setIO(io);

  /* ---------- 1. AUTHENTICATION: runs once per connection, before "connection" ---------- */
  // Browsers send cookies on the WebSocket handshake, so we reuse the same httpOnly JWT cookie.
  io.use(async (socket, next) => {
    try {
      const token = cookie.parse(socket.handshake.headers.cookie || '')[COOKIE_NAME];
      if (!token) return next(new Error('Unauthorized'));

      const { id } = verifyToken(token);
      const user = await User.findById(id);
      if (!user) return next(new Error('Unauthorized'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  /* ---------- 2. CONNECTION ---------- */
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const canSend = createLimiter();

    // Every socket of this user joins a private room. "Send to user X" = "send to room X",
    // which automatically reaches all of X's tabs and devices.
    socket.join(room(userId));

    const { cameOnline } = presence.addSocket(userId, socket.id);
    socket.emit('presence:list', presence.getOnlineUserIds()); // tell the newcomer who's online
    if (cameOnline) {
      socket.broadcast.emit('presence:update', { userId, online: true, lastSeen: null });
    }

    // Anything that was waiting for this user is now delivered.
    messageService.markDeliveredOnConnect(userId).catch((e) => console.error('deliver-on-connect:', e.message));

    /* ---------- 3. EVENTS FROM THE CLIENT ---------- */

    // Send a message. `ack` is the callback the client passes in: the server calls it with
    // the result, so the sender knows instantly whether it worked.
    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!canSend()) return reply({ ok: false, error: 'You are sending messages too fast' });
      try {
        const message = await messageService.createMessage({
          senderId: userId,
          receiverId: payload?.to,
          text: payload?.text,
          exceptSocketId: socket.id, // this tab gets the ack; the others get "message:new"
        });
        reply({ ok: true, message, tempId: payload?.tempId });
      } catch (err) {
        reply({ ok: false, error: err.expose ? err.message : 'Could not send message', tempId: payload?.tempId });
        if (!err.expose) console.error('message:send failed:', err);
      }
    });

    // Typing indicator: not saved anywhere, just relayed to the other person.
    socket.on('typing', (payload) => {
      const to = payload?.to;
      if (!isId(to) || to === userId) return;
      emitToUser(to, 'typing', { from: userId, isTyping: !!payload.isTyping });
    });

    // "I opened this chat" -> mark their messages as read.
    socket.on('messages:read', async (payload) => {
      const from = payload?.from;
      if (!isId(from) || from === userId) return;
      try {
        await messageService.markConversationRead(userId, from);
      } catch (err) {
        console.error('messages:read failed:', err.message);
      }
    });

    /* ---------- 4. DISCONNECT ---------- */
    socket.on('disconnect', () => {
      const nowEmpty = presence.removeSocket(userId, socket.id);
      if (!nowEmpty) return; // still has another tab open -> still online

      const lastSeen = new Date();
      presence.scheduleOffline(userId, OFFLINE_GRACE_MS, async () => {
        try {
          await User.updateOne({ _id: userId }, { $set: { lastSeen } }); // no need to load the document back
        } catch (err) {
          console.error('lastSeen update failed:', err.message);
        }
        emitToAll('presence:update', { userId, online: false, lastSeen });
      });
    });
  });

  return io;
}

module.exports = { initSocket };
