const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

const db = admin.firestore();
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

const ADMIN_CHAT_ID = '5449533654'; 

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const update = req.body;

      if (update.action === 'send_notification') {
        const docId = update.docId; // Yeh ab seedha prepaidId hai (jaise IDPFEXGCL)
        
        if (!docId) {
          return res.status(400).json({ success: false, message: 'Doc ID missing' });
        }

        // Seedha Firebase se data fetch karo
        const docRef = db.collection('recharges').doc(docId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          return res.status(404).json({ success: false, message: 'Document not found in Firebase' });
        }

        const data = docSnap.data();
        
        const prepaidId = data.prepaidId || docId;
        const phone = data.phone || 'N/A';
        const operator = data.operator ? data.operator.toUpperCase() : 'N/A';
        const planAmount = data.amount || 'N/A';       
        const finalPaid = data.finalPayable || data.amount || 'N/A'; 
        const utr = data.utr || 'N/A';

        const messageText = `🔔 *New Prepaid Payment Received!*\n\n` +
                          `🆔 *ID:* \`${prepaidId}\`\n` +
                          `📱 *Phone:* \`${phone}\`\n` +
                          `🌐 *Operator:* \`${operator}\`\n` +
                          `📋 *Plan Amount:* ₹\`${planAmount}\`\n` +
                          `💰 *Final Paid:* ₹\`${finalPaid}\`\n` +
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

        return res.status(200).json({ success: true, message: 'Notification sent successfully!' });
      }

      // Telegram button clicks (Verify / Recharge Done)
      if (update.callback_query) {
        const query = update.callback_query;
        const data = query.data; 
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        const parts = data.split('_');
        const action = parts[0]; 
        const docId = parts.slice(1).join('_');

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

        return res.status(200).json({ status: 'success' });
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Error:', error);
      return res.status(200).json({ error: error.message });
    }
  } else {
    return res.status(200).json({ message: 'Telegram Bot Webhook is active!' });
  }
};
