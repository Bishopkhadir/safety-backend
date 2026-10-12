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
  contacts: [
    {
      name: String,
      phone: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);