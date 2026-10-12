const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

const TERMII_URL = 'https://api.ng.termii.com/api/sms/send';

async function sendSMS(to, message) {
  const cleaned = to.replace('+', '');

  const res = await axios.post(TERMII_URL, {
    to: cleaned,
    from: process.env.TERMII_SENDER_ID || 'Termii',
    sms: message,
    type: 'plain',
    channel: 'generic',
    api_key: process.env.TERMII_API_KEY,
  });

  return res.data;
}

router.post('/sos', auth, async (req, res) => {
  try {
    const { location } = req.body;
    const user = await User.findById(req.userId);

    if (!user || !user.contacts || user.contacts.length === 0) {
      return res.status(400).json({ error: 'No emergency contacts saved' });
    }

    const mapsLink = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';

    const message = `EMERGENCY: ${user.name} needs help!\n\nLocation: ${mapsLink}\n\nAutomated SOS from SafeTrip.`;

    const results = await Promise.all(
      user.contacts.map((contact) => sendSMS(contact.phone, message))
    );

    res.json({ success: true, sent: results.length });
  } catch (err) {
    console.error('SOS error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

router.post('/share-trip', auth, async (req, res) => {
  try {
    const { location } = req.body;
    const user = await User.findById(req.userId);

    if (!user || !user.contacts || user.contacts.length === 0) {
      return res.status(400).json({ error: 'No emergency contacts saved' });
    }

    const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    const message = `${user.name} started a trip.\n\nTrack live: ${mapsLink}\n\nSent from SafeTrip.`;

    const results = await Promise.all(
      user.contacts.map((contact) => sendSMS(contact.phone, message))
    );

    res.json({ success: true, sent: results.length });
  } catch (err) {
    console.error('Share trip error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

module.exports = router;