require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const alertsRoutes = require('./routes/alerts');
const alertsFeedRoutes = require('./routes/alerts-feed');
const routinesRoutes = require('./routes/routines');
const childrenRoutes = require('./routes/children');
const locationRoutes = require('./routes/location');
const pushRoutes = require('./routes/push');
const { startScheduler } = require('./scheduler');

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    startScheduler();
  })
  .catch((err) => console.error('❌ MongoDB error:', err.message));

app.use('/auth', authRoutes);
app.use('/contacts', contactsRoutes);
app.use('/alerts', alertsRoutes);
app.use('/alerts-feed', alertsFeedRoutes);
app.use('/routines', routinesRoutes);
app.use('/children', childrenRoutes);
app.use('/location', locationRoutes);
app.use('/push', pushRoutes);

app.get('/', (req, res) => {
  res.json({ message: '🛡️ SafeTrip API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));