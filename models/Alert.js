const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['sos', 'trip_started', 'trip_ended', 'child_late', 'child_off_route', 'child_joined'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fromName: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Alert', alertSchema);