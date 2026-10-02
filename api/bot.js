const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Firebase Admin SDK को Vercel Environment Variables से इनिशियलाइज करना
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel में प्राइवेट की न्यूलाइन की वजह से दिक्कत न दे, इसलिए इसे रिप्लेस किया जाता है
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
      })
    });
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

const db = admin.firestore();
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const update = req.body;

      // 1. अगर टेलीग्राम से कोई बटन क्लिक (Callback Query) आया है
      if (update.callback_query) {
        const query = update.callback_query;
        const data = query.data; // जैसे "verify_PAYID123" या "recharge_PAYID123"
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        const [action, docId] = data.split('_');

        if (docId) {
          const docRef = db.collection('recharges').doc(docId); // अपनी कलेक्शन का नाम यहाँ चेक कर लेना (जैसे 'recharges' या जो भी तूने रखा है)
          
          if (action === 'verify') {
            await docRef.update({ status: 'Verification successful' });
            await bot.answerCallbackQuery(query.id, { text: 'Payment Verified Successfully!' });
            await bot.editMessageText(`✅ *Payment Verified* for ID: \`${docId}\``, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown'
            });
          } else if (action === 'recharge') {
            await docRef.update({ status: 'Recharge Successful' });
            await bot.answerCallbackQuery(query.id, { text: 'Recharge marked as Done!' });
            await bot.editMessageText(`🚀 *Recharge Done* for ID: \`${docId}\``, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown'
            });
          }
        }
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Error handling update:', error);
      return res.status(500).json({ error: error.message });
    }
  } else {
    return res.status(200).json({ message: 'Telegram Bot Webhook is running active!' });
  }
};
