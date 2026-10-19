const express = require('express');
const auth = require('../middleware/auth');
const Routine = require('../models/Routine');

const router = express.Router();

// Get MY routines (works for both parent and child)
router.get('/', auth, async (req, res) => {
  try {
    const routines = await Routine.find({ userId: req.userId });
    res.json(routines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get routines assigned TO ME (for children)
// A child's phone is used as childPhone in routines created by their parent
router.get('/my', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: 'User not found' });

    // Find routines where this user is the child
    const routines = await Routine.find({ childPhone: me.phone });
    res.json(routines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const {
      childName,
      childPhone,
      fromLocation,
      fromLatitude,
      fromLongitude,
      toLocation,
      toLatitude,
      toLongitude,
      expectedArrival,
      days,
      graceMinutes,
    } = req.body;

    if (!childName || !childPhone || !expectedArrival) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const routine = await Routine.create({
      userId: req.userId,
      childName,
      childPhone,
      fromLocation: fromLocation || 'Home',
      fromLatitude,
      fromLongitude,
      toLocation: toLocation || 'School',
      toLatitude,
      toLongitude,
      expectedArrival,
      days: days || ['mon', 'tue', 'wed', 'thu', 'fri'],
      graceMinutes: graceMinutes || 15,
    });

    res.status(201).json(routine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Routine.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/toggle', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({ _id: req.params.id, userId: req.userId });
    if (!routine) return res.status(404).json({ error: 'Routine not found' });

    routine.enabled = !routine.enabled;
    await routine.save();
    res.json(routine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;