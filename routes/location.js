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

// ==========================================
// ✅ NEW ROUTES FOR PUBLIC LIVE TRACKING
// ==========================================

// 1. Generate a public shareable link
router.post('/share-link', auth, async (req, res) => {
  try {
    // Generate a random 8-character unique ID
    const shareId = Math.random().toString(36).substring(2, 10);
    
    // Save this ID to the user's document so we know who it belongs to
    await User.findByIdAndUpdate(req.userId, { activeShareId: shareId });
    
    // Return the public link (Points to the live.html page on your website)
    res.json({ 
      success: true, 
      shareLink: `https://skywalk.com.ng/live.html?id=${shareId}` 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Public route to fetch location (No login required)
router.get('/public/:shareId', async (req, res) => {
  try {
    // Find the user who owns this share link
    const user = await User.findOne({ activeShareId: req.params.shareId });
    if (!user) {
      return res.status(404).json({ error: 'Link expired or invalid' });
    }
    
    // Get their latest location
    const loc = await Location.findOne({ userId: user._id });
    if (!loc) {
      return res.status(404).json({ error: 'Location not available yet' });
    }

    // Send only the name and coordinates (for privacy, don't send phone number)
    res.json({ 
      name: user.name, 
      latitude: loc.latitude, 
      longitude: loc.longitude,
      updatedAt: loc.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;