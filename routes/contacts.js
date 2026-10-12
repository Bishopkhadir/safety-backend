const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// GET all contacts
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.contacts || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD a contact
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.contacts.push({ name, phone });
    await user.save();

    res.json(user.contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a contact by index
router.delete('/:index', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const index = parseInt(req.params.index);
    if (index < 0 || index >= user.contacts.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    user.contacts.splice(index, 1);
    await user.save();

    res.json(user.contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;