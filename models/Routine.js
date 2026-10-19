const mongoose = require('mongoose');

const routineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childName: { type: String, required: true },
  childPhone: { type: String, required: true },
  fromLocation: { type: String, required: true },
  fromLatitude: { type: Number },
  fromLongitude: { type: Number },
  toLocation: { type: String, required: true },
  toLatitude: { type: Number },
  toLongitude: { type: Number },
  expectedArrival: { type: String, required: true },
  days: [{ type: String }],
  graceMinutes: { type: Number, default: 15 },
  enabled: { type: Boolean, default: true },
  lastChecked: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Routine', routineSchema);