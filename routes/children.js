const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const OTP = require('../models/OTP');

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

// GET all children
router.get('/', auth, async (req, res) => {
  try {
    const parent = await User.findById(req.userId);
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can manage children' });
    }
    const children = await User.find({ parentId: req.userId, role: 'child' }).select('-password');
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a child
router.post('/', auth, async (req, res) => {
  try {
    const parent = await User.findById(req.userId);
    if (!parent || parent.role !== 'parent') return res.status(403).json({ error: 'Only parents can add children' });

    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'Phone number already in use' });

    const child = await User.create({
      name, phone, role: 'child', status: 'pending', parentId: req.userId,
      contacts: [{ name: parent.name, phone: parent.phone }],
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.deleteMany({ phone });
    await OTP.create({ phone, code, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

    console.log(`\n📱 Child invite OTP for ${phone}: ${code}\n`);
    await sendSMS(phone, `Hi ${name}, ${parent.name} added you to SafeTrip. Code: ${code}`);

    res.status(201).json({ _id: child._id, name: child.name, phone: child.phone, role: child.role, status: child.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔗 NEW: Link a Tracker to a Child
router.put('/:id/tracker', auth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) return res.status(400).json({ error: 'Tracker ID required' });

    // Check if tracker is already linked to someone else
    const existingTracker = await User.findOne({ deviceId });
    if (existingTracker) {
      return res.status(400).json({ error: 'This Tracker ID is already linked to another user' });
    }

    const child = await User.findOneAndUpdate(
      { _id: req.params.id, parentId: req.userId, role: 'child' },
      { deviceId },
      { returnDocument: 'after' }
    );

    if (!child) return res.status(404).json({ error: 'Child not found' });

    console.log(`🔗 Tracker [${deviceId}] linked to ${child.name}`);
    res.json({ success: true, child });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a child
router.delete('/:id', auth, async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.params.id, parentId: req.userId, role: 'child' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;