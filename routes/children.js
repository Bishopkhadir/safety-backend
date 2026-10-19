const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const OTP = require('../models/OTP');

const router = express.Router();

const TERMII_URL = 'https://api.ng.termii.com/api/sms/send';

async function sendSMS(to, message) {
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
}

// GET all children of logged-in parent
router.get('/', auth, async (req, res) => {
  try {
    const parent = await User.findById(req.userId);
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can manage children' });
    }

    const children = await User.find({
      parentId: req.userId,
      role: 'child',
    }).select('-password');

    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a child account (status = pending)
router.post('/', auth, async (req, res) => {
  try {
    const parent = await User.findById(req.userId);
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can add children' });
    }

    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ error: 'Phone number already in use' });
    }

    // Create child as PENDING
    const child = await User.create({
      name,
      phone,
      role: 'child',
      status: 'pending',
      parentId: req.userId,
      contacts: [{ name: parent.name, phone: parent.phone }],
    });

    // Generate invite OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.deleteMany({ phone });
    await OTP.create({
      phone,
      code,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    console.log(`\n📱 Child invite OTP for ${phone} (${name}): ${code}\n`);

     // Send SMS with OTP
    const message = `Hi ${name}, ${parent.name} has added you to SafeTrip for your safety.\n\nDownload the app and login with your phone number using this code: ${code}\n\nSafeTrip`;
    try {
      await sendSMS(phone, message);
      console.log('✅ Invite SMS sent to', phone);
    } catch (err) {
      console.log('Child invite SMS failed:', err.response?.data || err.message);
    }

    // Notify child via in-app alert if they already have an account
    try {
      const Alert = require('../models/Alert');
      await Alert.create({
        userId: child._id,
        type: 'child_joined',
        title: `👨‍👩‍👧 ${parent.name} added you to SafeTrip`,
        message: 'Login with the code sent to your phone to activate.',
        fromUserId: parent._id,
        fromName: parent.name,
      });
    } catch (err) {
      console.log('Child alert create failed:', err.message);
    }

    res.status(201).json({
      _id: child._id,
      name: child.name,
      phone: child.phone,
      role: child.role,
      status: child.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESEND invite to a pending child
router.post('/:id/resend', auth, async (req, res) => {
  try {
    const child = await User.findOne({
      _id: req.params.id,
      parentId: req.userId,
      role: 'child',
    });
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const parent = await User.findById(req.userId);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.deleteMany({ phone: child.phone });
    await OTP.create({
      phone: child.phone,
      code,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    console.log(`\n📱 Resent OTP for ${child.phone}: ${code}\n`);

    const message = `Hi ${child.name}, ${parent.name} is waiting for you to join SafeTrip.\n\nLogin with this code: ${code}\n\nSafeTrip`;
    try {
      await sendSMS(child.phone, message);
      console.log('✅ Resent SMS to', child.phone);
    } catch (err) {
      console.log('Resend SMS failed:', err.response?.data || err.message);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a child
router.delete('/:id', auth, async (req, res) => {
  try {
    await User.findOneAndDelete({
      _id: req.params.id,
      parentId: req.userId,
      role: 'child',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;