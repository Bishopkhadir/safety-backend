require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const alertsRoutes = require('./routes/alerts');

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err.message));

app.use('/auth', authRoutes);
app.use('/contacts', contactsRoutes);
app.use('/alerts', alertsRoutes);

app.get('/', (req, res) => {
  res.json({ message: '🛡️ SafeTrip API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));