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
    const { location } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    console.log('\n🚨 SOS received from:', user.name, '- role:', user.role);
    console.log('   User contacts:', user.contacts?.length || 0);
    console.log('   ParentId:', user.parentId);

    const mapsLink = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';

    const recipients = new Set();
    const alertRecipients = [];

    // 1. Notify parent if user is a child
    if (user.parentId) {
      const parent = await User.findById(user.parentId);
      if (parent) {
        recipients.add(parent.phone);
        alertRecipients.push(parent._id);
        console.log('   → Parent added:', parent.name, parent.phone);
      }
    }

    // 2. Notify all personal contacts
    (user.contacts || []).forEach((c) => {
      if (c.phone) {
        recipients.add(c.phone);
        console.log('   → Contact added:', c.name, c.phone);
      }
    });

    console.log('   Total recipients:', recipients.size);

    // If literally no one — return clear error
    if (recipients.size === 0) {
      return res.status(400).json({
        error: 'No contacts found. Go to "Manage Contacts" and add at least one.',
      });
    }

    const isChild = user.role === 'child';
    const title = isChild ? `🚨 ${user.name} pressed SOS!` : `🚨 ${user.name} needs help!`;

    // In-app alerts + push
    for (const uid of alertRecipients) {
      await Alert.create({
        userId: uid,
        type: 'sos',
        title,
        message: `Location: ${mapsLink}`,
        fromUserId: user._id,
        fromName: user.name,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      await sendPushToUser(uid, title, 'Tap to see their location', {
        type: 'sos',
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    }

    // SMS (best-effort)
    const toArray = Array.from(recipients);
    const results = await Promise.all(
      toArray.map((phone) =>
        sendSMS(
          phone,
          isChild
            ? `🚨 EMERGENCY: Your child ${user.name} pressed SOS!\n\nLocation: ${mapsLink}`
            : `🚨 EMERGENCY: ${user.name} needs help!\n\nLocation: ${mapsLink}`
        )
      )
    );

    res.json({
      success: true,
      sent: results.filter((r) => r).length,
      inApp: alertRecipients.length,
      totalRecipients: recipients.size,
    });
  } catch (err) {
    console.error('SOS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🚗 Share Trip
router.post('/share-trip', auth, async (req, res) => {
  try {
    const { location, destination } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const recipients = new Set();
    if (user.parentId) {
      const parent = await User.findById(user.parentId);
      if (parent) recipients.add(parent.phone);
    }
    (user.contacts || []).forEach((c) => {
      if (c.phone) recipients.add(c.phone);
    });

    if (recipients.size === 0) {
      return res.status(400).json({ error: 'No contacts found. Add one in Manage Contacts.' });
    }

    const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    const destText = destination ? `\n\nGoing to: ${destination.name}` : '';
    const message = `${user.name} started a trip.${destText}\n\nTrack live: ${mapsLink}`;

    const toArray = Array.from(recipients);
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
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role !== 'child' || !user.parentId) {
      return res.status(400).json({ error: 'Only children with a parent can use this' });
    }

    const parent = await User.findById(user.parentId);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    const mapsLink = location
      ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
      : 'Location unavailable';
    const destText = destination ? `Going to: ${destination.name}` : 'Tap to see live location';

    await Alert.create({
      userId: parent._id,
      type: 'trip_started',
      title: `🚗 ${user.name} started a trip`,
      message: destText,
      fromUserId: user._id,
      fromName: user.name,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });

    await sendPushToUser(parent._id, `🚗 ${user.name} started a trip`, destText, {
      type: 'trip_started',
      latitude: location?.latitude,
      longitude: location?.longitude,
    });

    await sendSMS(
      parent.phone,
      `🚸 ${user.name} just started a trip.${destination ? `\n\nGoing to: ${destination.name}` : ''}\n\nTrack live: ${mapsLink}`
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;