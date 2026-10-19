const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OTP = require('../models/OTP');

const router = express.Router();

// ===== Request OTP =====
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    // Check if this is a pending child with an existing invite OTP
    const existingUser = await User.findOne({ phone });

    if (
      existingUser &&
      existingUser.role === 'child' &&
      existingUser.status === 'pending'
    ) {
      // Reuse the parent's invite OTP — do NOT create a new one
      const existingOtp = await OTP.findOne({ phone });

      if (existingOtp && existingOtp.expiresAt > new Date()) {
        console.log(`\n📱 Reusing invite OTP for pending child ${phone}: ${existingOtp.code}\n`);
        return res.json({
          success: true,
          message: 'Use the invite code sent by your parent',
          reuseInvite: true,
        });
      }

      // Invite expired — generate a new one (rare case)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await OTP.deleteMany({ phone });
      await OTP.create({
        phone,
        code,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      console.log(`\n📱 New OTP (invite expired) for ${phone}: ${code}\n`);
      return res.json({ success: true, message: 'OTP sent' });
    }

    // Normal flow for everyone else
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

// ===== Verify OTP =====
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
      // New user signup
      if (!name || !password) {
        return res.status(400).json({ error: 'Name and password required' });
      }
      const hashed = await bcrypt.hash(password, 10);
      user = await User.create({
        name,
        phone,
        password: hashed,
        role: role || 'individual',
        status: 'active',
      });
      console.log('✅ New user created:', user.name, '-', user.role);
    } else {
      // Existing user — set password if provided
      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }
      if (name && !user.name) user.name = name;

         // APPROVE PENDING CHILD
      if (user.role === 'child' && user.status === 'pending') {
        user.status = 'active';
        console.log('👶 Child APPROVED:', user.name, '-', user.phone);

        // Notify parent
        try {
          const Alert = require('../models/Alert');
          if (user.parentId) {
            await Alert.create({
              userId: user.parentId,
              type: 'child_joined',
              title: `✅ ${user.name} accepted your invite`,
              message: `${user.name} is now active on SafeTrip.`,
              fromUserId: user._id,
              fromName: user.name,
            });
          }
        } catch (err) {
          console.log('Parent alert failed:', err.message);
        }
      }

      await user.save();
      console.log('✅ Existing user logged in:', user.name, '-', user.role, '-', user.status);
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
        status: user.status,
        contacts: user.contacts,
      },
    });
  } catch (err) {
    console.error('❌ Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Login with Password =====
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'Account not found' });
    if (!user.password) return res.status(400).json({ error: 'No password set. Use OTP login.' });

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
        status: user.status,
        contacts: user.contacts,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Update Role =====
const auth = require('../middleware/auth');

router.put('/role', auth, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['individual', 'parent', 'child', 'driver'];
    if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = await User.findById(req.userId);
    if (existing && existing.role === 'child') {
      return res.status(403).json({ error: 'Children cannot change their role' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { role },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        contacts: user.contacts,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;