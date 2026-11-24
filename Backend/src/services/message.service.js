// All message business logic lives here. Both the REST controllers and the
// Socket.io handlers call these functions, so there is ONE place that decides
// how a message is validated, saved, and delivered.
const mongoose = require('mongoose');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { isId } = require('../utils/ids');
const { emitToUser } = require('../socket/io');
const { isUserOnline } = require('../socket/presence');

const MAX_LENGTH = 2000;

/* ------------------------------ send ------------------------------ */
async function createMessage({ senderId, receiverId, text, exceptSocketId }) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new AppError('Message cannot be empty');
  if (clean.length > MAX_LENGTH) throw new AppError(`Message is too long (max ${MAX_LENGTH} characters)`);
  if (!isId(receiverId)) throw new AppError('Invalid receiver');
  if (String(receiverId) === String(senderId)) throw new AppError('You cannot message yourself');
  if (!(await User.exists({ _id: receiverId }))) throw new AppError('Receiver not found', 404);

  // If the receiver has a live socket right now, the message counts as "delivered".
  const status = isUserOnline(receiverId) ? 'delivered' : 'sent';
  const doc = await Message.create({ sender: senderId, receiver: receiverId, text: clean, status });
  const message = doc.toPublic();

  emitToUser(receiverId, 'message:new', message); // push to the receiver (all their tabs)
  emitToUser(senderId, 'message:new', message, exceptSocketId); // sync the sender's OTHER tabs
  return message;
}

/* ------------------------------ read / delivered ------------------------------ */
// The reader opened a chat -> everything the other person sent them becomes "read".
async function markConversationRead(readerId, otherId) {
  const result = await Message.updateMany(
    { sender: otherId, receiver: readerId, status: { $ne: 'read' } },
    { $set: { status: 'read' } }
  );
  if (result.modifiedCount > 0) {
    emitToUser(otherId, 'messages:read', { by: String(readerId) }); // blue ticks for the sender
  }
  emitToUser(readerId, 'conversation:read', { with: String(otherId) }); // clear badge in reader's other tabs
  return result.modifiedCount;
}

// A user just connected -> everything waiting for them is now "delivered".
async function markDeliveredOnConnect(userId) {
  const senders = await Message.distinct('sender', { receiver: userId, status: 'sent' });
  if (senders.length === 0) return;

  await Message.updateMany({ receiver: userId, status: 'sent' }, { $set: { status: 'delivered' } });
  senders.forEach((senderId) => emitToUser(senderId, 'messages:delivered', { by: String(userId) }));
}

/* ------------------------------ delete ------------------------------ */
// "Delete for everyone": only the sender can do it. The row stays (so chat order is
// preserved) but the text is wiped and clients show "This message was deleted".
async function deleteMessage(userId, messageId) {
  if (!isId(messageId)) throw new AppError('Invalid message id');
  const msg = await Message.findById(messageId);
  if (!msg) throw new AppError('Message not found', 404);
  if (msg.sender.toString() !== String(userId)) throw new AppError('You can only delete your own messages', 403);

  if (!msg.deletedAt) {
    msg.deletedAt = new Date();
    msg.text = '';
    await msg.save();
  }
  // `with` = "the other person in this conversation", from each recipient's point of view
  emitToUser(msg.receiver, 'message:deleted', { messageId, with: msg.sender.toString() });
  emitToUser(msg.sender, 'message:deleted', { messageId, with: msg.receiver.toString() });
  return { messageId };
}

/* ------------------------------ history ------------------------------ */
// A page of messages between two users, oldest -> newest.
// `before` (ISO date) lets the client ask for "older than what I already have".
async function getConversation({ me, other, limit = 40, before }) {
  if (!isId(other)) throw new AppError('Invalid user id');
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 100);

  const filter = {
    $or: [
      { sender: me, receiver: other },
      { sender: other, receiver: me },
    ],
  };
  if (before) {
    const date = new Date(before);
    if (isNaN(date)) throw new AppError('Invalid "before" date');
    filter.createdAt = { $lt: date };
  }

  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(safeLimit + 1);
  const hasMore = docs.length > safeLimit;
  const messages = docs.slice(0, safeLimit).reverse().map((d) => d.toPublic());
  return { messages, hasMore };
}

// Sidebar data: for each person I've talked to -> last message + unread count.
async function getConversationSummaries(me) {
  const meId = new mongoose.Types.ObjectId(String(me));

  // 1) Who have I exchanged messages with?
  const [sentTo, receivedFrom] = await Promise.all([
    Message.distinct('receiver', { sender: meId }),
    Message.distinct('sender', { receiver: meId }),
  ]);
  const partnerIds = [...new Set([...sentTo, ...receivedFrom].map(String))];
  if (partnerIds.length === 0) return [];

  // 2) Newest message with each of them (one indexed lookup per partner) + 3) unread counts.
  const [lastMessages, unreadRows] = await Promise.all([
    Promise.all(
      partnerIds.map((partnerId) =>
        Message.findOne({
          $or: [
            { sender: meId, receiver: partnerId },
            { sender: partnerId, receiver: meId },
          ],
        }).sort({ createdAt: -1 })
      )
    ),
    Message.aggregate([
      { $match: { receiver: meId, status: { $ne: 'read' }, deletedAt: null } },
      { $group: { _id: '$sender', count: { $sum: 1 } } },
    ]),
  ]);

  const unreadBy = new Map(unreadRows.map((row) => [row._id.toString(), row.count]));

  return partnerIds.map((partnerId, i) => {
    const last = lastMessages[i];
    return {
      userId: partnerId,
      unread: unreadBy.get(partnerId) || 0,
      lastMessage: {
        _id: last._id.toString(),
        text: last.deletedAt ? '' : last.text,
        deleted: !!last.deletedAt,
        status: last.status,
        fromMe: last.sender.toString() === String(me),
        createdAt: last.createdAt,
      },
    };
  });
}

module.exports = {
  createMessage,
  markConversationRead,
  markDeliveredOnConnect,
  deleteMessage,
  getConversation,
  getConversationSummaries,
};
