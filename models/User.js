const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String },
  role: {
    type: String,
    enum: ['individual', 'parent', 'child', 'driver'],
    default: 'individual',
  },
  status: {
    type: String,
    enum: ['active', 'pending'],
    default: 'active',
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  pushToken: { type: String, default: null },
  contacts: [
    {
      name: String,
      phone: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);