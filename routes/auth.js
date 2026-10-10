const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');

const router = express.Router();

// ===== STEP 1: Request OTP =====
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone is required' });
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTP for this phone
    await OTP.deleteMany({ phone });

    // Create new OTP (expires in 5 minutes)
    await OTP.create({
      phone,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // 🚧 TODO: Send via Termii. For now, log to terminal.
    console.log(`\n📱 OTP for ${phone}: ${code}\n`);

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== STEP 2: Verify OTP + Login/Signup =====
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name, role } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code required' });
    }

    // Find the OTP
    const otp = await OTP.findOne({ phone, code });

    if (!otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (otp.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Find or create user
    let user = await User.findOne({ phone });

    if (!user) {
      if (!name) {
        return res.status(400).json({ error: 'Name required for signup' });
      }

      user = await User.create({
        name,
        phone,
        role: role || 'individual',
      });
    }

    // Delete used OTP
    await OTP.deleteMany({ phone });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        contacts: user.contacts,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;