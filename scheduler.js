const cron = require('node-cron');
const axios = require('axios');
const Routine = require('./models/Routine');
const User = require('./models/User');
const Alert = require('./models/Alert');
const { sendPushToUser } = require('./pushHelper');

const TERMII_URL = 'https://api.ng.termii.com/api/sms/send';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function sendSMS(to, message) {
  try {
    const cleaned = to.replace('+', '');
    const res = await axios.post(TERMII_URL, {
      to: cleaned,
      from: process.env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY,
    });
    return res.data;
  } catch (err) {
    console.log('SMS failed:', err.response?.data?.message || err.message);
    return null;
  }
}

async function checkRoutines() {
  try {
    const now = new Date();
    const today = DAYS[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const routines = await Routine.find({ enabled: true });
    console.log(`⏰ Checking ${routines.length} routines at ${currentTime} (${today})`);

    for (const routine of routines) {
      if (!routine.days.includes(today)) continue;
      if (routine.lastChecked) continue;

      const [h, m] = routine.expectedArrival.split(':').map(Number);
      const alertTime = new Date();
      alertTime.setHours(h, m + routine.graceMinutes, 0, 0);
      if (now < alertTime) continue;

      const parent = await User.findById(routine.userId);
      if (!parent) continue;

      const title = `⏰ ${routine.childName} is late`;
      const body = `${routine.childName} has not arrived at ${routine.toLocation} by ${routine.expectedArrival}.`;

      // In-app alert
      try {
        await Alert.create({
          userId: parent._id,
          type: 'child_late',
          title,
          message: body,
          fromName: routine.childName,
        });
        console.log(`🔔 In-app late alert created for ${parent.name}`);
      } catch (err) {
        console.log('Alert create failed:', err.message);
      }

      // Push notification
      await sendPushToUser(parent._id, title, body, { type: 'child_late' });

      // SMS (best effort)
      await sendSMS(
        parent.phone,
        `⏰ LATE: ${routine.childName} has not arrived at ${routine.toLocation} by ${routine.expectedArrival}.\n\nSkywalk SafeTrip`
      );

      routine.lastChecked = now;
      await routine.save();
    }
  } catch (err) {
    console.error('Scheduler error:', err.message);
  }
}

async function resetDaily() {
  await Routine.updateMany({}, { lastChecked: null });
  console.log('🔄 Daily reset complete');
}

function startScheduler() {
  cron.schedule('* * * * *', checkRoutines);
  cron.schedule('0 0 * * *', resetDaily);
  console.log('⏰ Routine scheduler started');
}

module.exports = { startScheduler };