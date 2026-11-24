const Message = require('../models/message.model');
const messageService = require('../services/message.service');

// REST fallback for sending (the app normally sends over the socket).
async function sendMessage(req, res) {
  const message = await messageService.createMessage({
    senderId: req.user._id.toString(),
    receiverId: req.body?.to,
    text: req.body?.text,
  });
  res.status(201).json({ message });
}

// Everything people sent TO me (newest first).
async function getInbox(req, res) {
  const docs = await Message.find({ receiver: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ messages: docs.map((d) => d.toPublic()) });
}

// Everything I sent (newest first).
async function getSentMessages(req, res) {
  const docs = await Message.find({ sender: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ messages: docs.map((d) => d.toPublic()) });
}

async function deleteMessage(req, res) {
  const result = await messageService.deleteMessage(req.user._id.toString(), req.params.messageId);
  res.json(result);
}

async function getConversation(req, res) {
  const data = await messageService.getConversation({
    me: req.user._id.toString(),
    other: req.params.userId,
    limit: req.query.limit,
    before: req.query.before,
  });
  res.json(data);
}

async function getConversations(req, res) {
  const conversations = await messageService.getConversationSummaries(req.user._id.toString());
  res.json({ conversations });
}

async function markRead(req, res) {
  const updated = await messageService.markConversationRead(req.user._id.toString(), req.params.userId);
  res.json({ updated });
}

module.exports = {
  sendMessage,
  getInbox,
  getSentMessages,
  deleteMessage,
  getConversation,
  getConversations,
  markRead,
};
