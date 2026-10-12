const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OTP = require('../models/OTP');

const router = express.Router();

// ===== STEP 1: Request OTP (for signup OR password reset) =====
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await OTP.deleteMany({ phone });
    await OTP.create({
      phone,
      code,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    console.log(`\n📱 OTP for ${phone}: ${code}\n`);

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== STEP 2: Verify OTP =====
// Two use cases:
//   - New user (no password in DB): create account with password + role
//   - Existing user: reset password or just log in
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name, password, role } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code required' });
    }

    const otp = await OTP.findOne({ phone, code });

    if (!otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (otp.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      // New signup — password is required
      if (!name || !password) {
        return res.status(400).json({ error: 'Name and password required' });
      }

      const hashed = await bcrypt.hash(password, 10);
      user = await User.create({
        name,
        phone,
        password: hashed,
        role: role || 'individual',
      });
    } else if (password) {
      // Existing user providing a new password (reset)
      user.password = await bcrypt.hash(password, 10);
      if (name) user.name = name;
      if (role) user.role = role;
      await user.save();
    }

    await OTP.deleteMany({ phone });

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
    console.error('❌ Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== STEP 3: Login with Password =====
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    const user = await User.findOne({ phone });
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Account not found. Use OTP to sign up.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Incorrect password' });

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
    console.error('❌ Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== STEP 4: Update Role (protected) =====
const auth = require('../middleware/auth');

router.put('/role', auth, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['individual', 'parent', 'child', 'driver'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { role },
      { new: true }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        contacts: user.contacts,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;