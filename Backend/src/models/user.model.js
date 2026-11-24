const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // "A@x.com" and "a@x.com" are the same account
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // never returned by queries unless asked with .select('+password')
    },
    profilePic: {
      type: String,
      default: '',
    },
    // updated when a user's last socket disconnects -> powers "last seen"
    lastSeen: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true } // createdAt & updatedAt
);

// Hash the password before saving, but only if it was actually changed.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

// The only shape of a user that should ever leave the server.
userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    profilePic: this.profilePic,
    lastSeen: this.lastSeen,
  };
};

module.exports = mongoose.model('User', userSchema);
