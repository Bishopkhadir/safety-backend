const { Expo } = require('expo-server-sdk');
const User = require('./models/User');

const expo = new Expo();

// Send a push notification to a single user (by userId)
async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushToken) {
      console.log(`No push token for user ${userId}`);
      return;
    }

    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.log('Invalid Expo push token:', user.pushToken);
      return;
    }

    const message = {
      to: user.pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: 'alerts',
    };

    const tickets = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ Push sent to', user.name);
    return tickets;
  } catch (err) {
    console.log('Push error:', err.message);
  }
}

module.exports = { sendPushToUser };