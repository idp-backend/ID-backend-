const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Firebase Admin SDK को Vercel Environment Variables से इनिशियलाइज करना
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
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

// तेरी पर्सनल टेलीग्राम चैट आईडी (यहाँ अपनी चैट आईडी डाल देना ताकि बॉट तुझे ही मैसेज भेजे)
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || 'तेरी_चैट_आईडी'; 

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const update = req.body;

      // 1. अगर वेबसाइट से नया पेमेंट डेटा भेजा गया है (टेलीग्राम पर नोटिफिकेशन भेजने के लिए)
      if (update.action === 'send_notification') {
        const { docId, amount, utr, phone } = update;
        
        const messageText = `🔔 *New Prepaid Payment Received!*\n\n` +
                          `🆔 *ID:* \`${docId}\`\n` +
                          `📱 *Phone:* \`${phone}\`\n` +
                          `💰 *Amount:* ₹\`{amount}\`\n` +
                          `📝 *UTR:* \`${utr}\``;

        const inlineKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Verify Payment', callback_data: `verify_${docId}` },
                { text: '🚀 Recharge Done', callback_data: `recharge_${docId}` }
              ]
            ]
          }
        };

        await bot.sendMessage(ADMIN_CHAT_ID, messageText, {
          parse_mode: 'Markdown',
          ...inlineKeyboard
        });

        return res.status(200).json({ success: true, message: 'Notification sent to Telegram!' });
      }

      // 2. अगर टेलीग्राम से कोई बटन क्लिक (Callback Query) आया है
      if (update.callback_query) {
        const query = update.callback_query;
        const data = query.data; 
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        const [action, docId] = data.split('_');

        if (docId) {
          const docRef = db.collection('recharges').doc(docId); 
          
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
