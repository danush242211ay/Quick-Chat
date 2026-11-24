const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, maxlength: 2000, default: '' },

    // sent      -> saved on the server, receiver was offline
    // delivered -> receiver was online (or came online) and got it
    // read      -> receiver opened the conversation
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },

    // "delete for everyone": we keep the row but blank it, so the chat shows a placeholder
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Fetching a conversation = (sender, receiver) pair sorted by time
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
// Unread counts / "mark as read" look up by receiver + status
messageSchema.index({ receiver: 1, status: 1 });

// The only shape of a message that should ever leave the server.
messageSchema.methods.toPublic = function () {
  const deleted = !!this.deletedAt;
  return {
    _id: this._id.toString(),
    sender: this.sender.toString(),
    receiver: this.receiver.toString(),
    text: deleted ? '' : this.text,
    status: this.status,
    deleted,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Message', messageSchema);
