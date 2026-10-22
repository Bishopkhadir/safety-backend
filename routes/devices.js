const express = require('express');
const User = require('../models/User');
const Location = require('../models/Location');

const router = express.Router();

// Middleware to verify the tracker's API key
const verifyDeviceKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.DEVICE_API_KEY) {
    console.log('⚠️ Unauthorized tracker attempted to connect');
    return res.status(401).json({ error: 'Unauthorized device' });
  }
  next();
};

// 📍 Endpoint for the tracker to send its location
router.post('/track', verifyDeviceKey, async (req, res) => {
  try {
    const { deviceId, latitude, longitude } = req.body;

    if (!deviceId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing deviceId, latitude, or longitude' });
    }

    // 1. Find the child linked to this tracker
    const child = await User.findOne({ deviceId });
    if (!child) {
      return res.status(404).json({ error: 'Device not linked to any child' });
    }

    // 2. Update their location in the database
    await Location.findOneAndUpdate(
      { userId: child._id },
      { latitude, longitude, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`📍 Tracker [${deviceId}] updated location for ${child.name}`);

    res.json({ success: true, message: 'Location received' });
  } catch (err) {
    console.error('Tracker error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;