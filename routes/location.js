const express = require('express');
const auth = require('../middleware/auth');
const Location = require('../models/Location');
const User = require('../models/User');

const router = express.Router();

// Child pushes location
router.post('/', auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const loc = await Location.findOneAndUpdate(
      { userId: req.userId },
      { latitude, longitude, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, location: loc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parent fetches ACTIVE children's locations
router.get('/children', auth, async (req, res) => {
  try {
    const parent = await User.findById(req.userId);
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can view this' });
    }

    // Only active children
    const children = await User.find({
      parentId: req.userId,
      role: 'child',
      status: 'active',
    });

    const results = await Promise.all(
      children.map(async (child) => {
        const loc = await Location.findOne({ userId: child._id });
        return {
          childId: child._id,
          name: child.name,
          phone: child.phone,
          latitude: loc?.latitude ?? null,
          longitude: loc?.longitude ?? null,
          updatedAt: loc?.updatedAt ?? null,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;