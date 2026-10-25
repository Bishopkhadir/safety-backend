const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios'); // ADDED: Needed to call Termii
const User = require('../models/User');
const OTP = require('../models/OTP');
const Alert = require('../models/Alert'); // ADDED: Moved to top for safety
const auth = require('../middleware/auth'); // FIXED: Moved to top

const router = express.Router();

// Helper function to send SMS via Termii
async function sendTermiiSms(phone, code) {
  try {
    console.log(`📡 Attempting to send Termii SMS to ${phone}...`);
    const response = await axios.post('https://api.ng.termii.com/api/sms/send', {
      to: phone,
      from: process.env.TERMII_SENDER_ID, // Must be set in Render Environment
      sms: `Your SafeTrip verification code is: ${code}`,
      type: 'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY, // Must be set in Render Environment
    });
    console.log('✅ Termii SMS Sent Successfully:', response.data);
    return true;
  } catch (error) {
    console.error('❌ TERMII ERROR:', error.response ? error.response.data : error.message);
    return false;
  }
}

// ===== Request OTP =====
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    console.log(`\n🚀 OTP REQUEST RECEIVED for phone: ${phone}`);

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
        // Send the reused invite code via Termii
        await sendTermiiSms(phone, existingOtp.code);
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
      
      // Actually send the SMS
      await sendTermiiSms(phone, code);
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

    console.log(`\n🔥🔥 GENERATED OTP FOR ${phone}: ${code}\n`);

    // Actually send the SMS
    const smsSent = await sendTermiiSms(phone, code);

    if (!smsSent) {
       // If Termii fails, we still return success so the app doesn't crash, 
       // but you can read the OTP in the Render logs for now.
       console.log("⚠️ Note: Termii failed, but OTP is in the logs above.");
    }

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('❌ Request OTP Error:', err);
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

// ===== Change Password (Logged In) =====
router.put('/change-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;