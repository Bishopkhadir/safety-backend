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
  try {
    const { location, selectedPhones } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    console.log(`\n🚨 SOS received from: ${user.name} (${user.role})`);

    const mapsLink = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';

    const alertRecipients = [];
    let toArray = [];

    // If specific contacts were selected in the app
    if (selectedPhones && selectedPhones.length > 0) {
      toArray = selectedPhones;
    } else {
      // Otherwise, fallback to ALL contacts + Parent
      const recipients = new Set();
      if (user.parentId) {
        const parent = await User.findById(user.parentId);
        if (parent) {
          recipients.add(parent.phone);
          alertRecipients.push(parent._id);
        }
      }
      (user.contacts || []).forEach((c) => {
        if (c.phone) recipients.add(c.phone);
      });
      toArray = Array.from(recipients);
    }

    console.log(`📞 Sending SOS to ${toArray.length} contacts.`);

    if (toArray.length === 0) {
      return res.status(400).json({ error: 'No contacts selected or saved.' });
    }

    const isChild = user.role === 'child';
    const title = isChild ? `🚨 ${user.name} pressed SOS!` : `🚨 ${user.name} needs help!`;

    // In-app alerts for parents
    for (const uid of alertRecipients) {
      await Alert.create({
        userId: uid, type: 'sos', title, message: `Location: ${mapsLink}`,
        fromUserId: user._id, fromName: user.name, latitude: location?.latitude, longitude: location?.longitude,
      });
      await sendPushToUser(uid, title, 'Tap to see their location', { type: 'sos' });
    }

    // SMS to selected contacts
    const results = await Promise.all(toArray.map((phone) => 
      sendSMS(phone, `${title}\n\nLocation: ${mapsLink}`)
    ));

    res.json({ success: true, sent: results.filter((r) => r).length, total: toArray.length });
  } catch (err) {
    console.error('SOS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🚗 Share Trip (with specific contacts)
router.post('/share-trip', auth, async (req, res) => {
  try {
    const { location, destination, selectedPhones } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let toArray = [];
    if (selectedPhones && selectedPhones.length > 0) {
      toArray = selectedPhones;
    } else {
      const recipients = new Set();
      if (user.parentId) {
        const parent = await User.findById(user.parentId);
        if (parent) recipients.add(parent.phone);
      }
      (user.contacts || []).forEach((c) => {
        if (c.phone) recipients.add(c.phone);
      });
      toArray = Array.from(recipients);
    }

    if (toArray.length === 0) return res.status(400).json({ error: 'No contacts selected.' });

    const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    const destText = destination ? `\n\nGoing to: ${destination.name}` : '';
    const message = `${user.name} started a trip.${destText}\n\nTrack live: ${mapsLink}`;

    const results = await Promise.all(toArray.map((phone) => sendSMS(phone, message)));
    res.json({ success: true, sent: results.filter((r) => r).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🚸 Child Trip Started
router.post('/child-trip-started', auth, async (req, res) => {
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

// ✅ Child Trip Ended (Safe Arrival)
router.post('/child-trip-ended', auth, async (req, res) => {
  try {
    const { location, destination } = req.body;
    const user = await User.findById(req.userId);
    if (!user || !user.parentId) return res.status(400).json({ error: 'Invalid' });

    const parent = await User.findById(user.parentId);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    const title = `✅ ${user.name} arrived safely`;
    const message = `Arrived at ${destination?.name || 'destination'}.`;
    
    await Alert.create({
      userId: parent._id, type: 'trip_ended', title, message, 
      fromUserId: user._id, fromName: user.name, latitude: location?.latitude, longitude: location?.longitude,
    });
    await sendPushToUser(parent._id, title, message, { type: 'trip_ended' });
    await sendSMS(parent.phone, `✅ ${user.name} has arrived safely at ${destination?.name || 'their destination'}.`);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;