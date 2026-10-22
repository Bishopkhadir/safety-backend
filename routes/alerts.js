const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Alert = require('../models/Alert');
const { sendPushToUser } = require('../pushHelper');

const router = express.Router();

const TERMII_URL = 'https://api.ng.termii.com/api/sms/send';

async function sendSMS(to, message) {
  try {
    const cleaned = to.replace('+', '');
    const res = await axios.post(TERMII_URL, {
      to: cleaned,
      from: process.env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY,
    });
    return res.data;
  } catch (err) {
    console.log('SMS failed:', err.response?.data?.message || err.message);
    return null;
  }
}

// 🚨 SOS
router.post('/sos', auth, async (req, res) => {
  // ... [Keep your existing SOS code] ...
  try {
    const { location } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const mapsLink = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';

    const recipients = new Set();
    const alertRecipients = [];

    if (user.parentId) {
      const parent = await User.findById(user.parentId);
      if (parent) {
        recipients.add(parent.phone);
        alertRecipients.push(parent._id);
      }
    }
    (user.contacts || []).forEach((c) => recipients.add(c.phone));

    const isChild = user.role === 'child';
    const title = isChild ? `🚨 ${user.name} pressed SOS!` : `🚨 ${user.name} needs help!`;

    for (const uid of alertRecipients) {
      await Alert.create({
        userId: uid, type: 'sos', title, message: `Location: ${mapsLink}`,
        fromUserId: user._id, fromName: user.name, latitude: location?.latitude, longitude: location?.longitude,
      });
      await sendPushToUser(uid, title, 'Tap to see their location', { type: 'sos' });
    }

    const toArray = Array.from(recipients);
    const results = await Promise.all(toArray.map((phone) => sendSMS(phone, title + `\n\n` + mapsLink)));

    res.json({ success: true, sent: results.filter((r) => r).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🚗 Share Trip
router.post('/share-trip', auth, async (req, res) => {
  // ... [Keep your existing Share Trip code] ...
  try {
    const { location, destination } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const recipients = new Set();
    if (user.parentId) {
      const parent = await User.findById(user.parentId);
      if (parent) recipients.add(parent.phone);
    }
    (user.contacts || []).forEach((c) => recipients.add(c.phone));

    const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    const destText = destination ? `\n\nGoing to: ${destination.name}` : '';
    const message = `${user.name} started a trip.${destText}\n\nTrack live: ${mapsLink}`;

    const toArray = Array.from(recipients);
    const results = await Promise.all(toArray.map((phone) => sendSMS(phone, message)));

    res.json({ success: true, sent: results.filter((r) => r).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🚸 Child Trip Started
router.post('/child-trip-started', auth, async (req, res) => {
  // ... [Keep your existing Trip Started code] ...
  try {
    const { location, destination } = req.body;
    const user = await User.findById(req.userId);
    if (!user || !user.parentId) return res.status(400).json({ error: 'Invalid' });

    const parent = await User.findById(user.parentId);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    const destText = destination ? `Going to: ${destination.name}` : 'Tap to see live location';
    
    await Alert.create({
      userId: parent._id, type: 'trip_started', title: `🚗 ${user.name} started a trip`,
      message: destText, fromUserId: user._id, fromName: user.name, latitude: location?.latitude, longitude: location?.longitude,
    });
    await sendPushToUser(parent._id, `🚗 ${user.name} started a trip`, destText, { type: 'trip_started' });
    await sendSMS(parent.phone, `🚸 ${user.name} just started a trip.${destination ? `\n\nGoing to: ${destination.name}` : ''}`);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ NEW: Child Trip Ended (Safe Arrival)
router.post('/child-trip-ended', auth, async (req, res) => {
  try {
    const { location, destination } = req.body;
    const user = await User.findById(req.userId);
    if (!user || !user.parentId) return res.status(400).json({ error: 'Invalid' });

    const parent = await User.findById(user.parentId);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    const title = `✅ ${user.name} arrived safely`;
    const message = `Arrived at ${destination?.name || 'destination'}.`;
    
    // 1. In-App Alert
    await Alert.create({
      userId: parent._id, 
      type: 'trip_ended', 
      title: title,
      message: message, 
      fromUserId: user._id, 
      fromName: user.name, 
      latitude: location?.latitude, 
      longitude: location?.longitude,
    });

    // 2. Push Notification
    await sendPushToUser(parent._id, title, message, { type: 'trip_ended' });

    // 3. SMS (Best effort)
    await sendSMS(parent.phone, `✅ ${user.name} has arrived safely at ${destination?.name || 'their destination'}.`);

    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

module.exports = router;