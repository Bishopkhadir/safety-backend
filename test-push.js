require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { sendPushToUser } = require('./pushHelper');

const targetPhone = process.argv[2]; // Get phone number from command line

async function testPush() {
  if (!targetPhone) {
    console.log('❌ Please provide a phone number. Example: node test-push.js +2349157456651');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne({ phone: targetPhone });
    if (!user) {
      console.log('❌ User not found with that phone number');
      process.exit(1);
    }

    if (!user.pushToken) {
      console.log('❌ User has no push token. Did you log in on the app?');
      process.exit(1);
    }

    console.log(`🚀 Sending test push to ${user.name}...`);
    await sendPushToUser(
      user._id,
      '🚨 Test Notification',
      'If you see this, push notifications are working perfectly!',
      { type: 'test' }
    );

    console.log('✅ Push sent! Check your phone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testPush();