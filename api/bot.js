const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

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
        let docId = update.docId || update.id;
        let phone = update.phone;
        let utr = update.utr;
        let operator = update.operator || update.operatorName;
        let planAmount = update.amount || update.planAmount;
        let finalPaid = update.finalPayable || update.finalAmount || update.amount;

        // अगर वेबसाइट से सीधा डेटा नहीं आया है और सिर्फ docId है, तो फायरबेस से डेटा लाओ
        if (docId && (!phone || !operator || !planAmount)) {
          try {
            const docRef = db.collection('recharges').doc(docId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
              const fbData = docSnap.data();
              phone = phone || fbData.phone;
              utr = utr || fbData.utr;
              operator = operator || fbData.operator;
              planAmount = planAmount || fbData.amount;
              finalPaid = finalPaid || fbData.finalPayable || fbData.amount;
              docId = fbData.prepaidId || docId;
            }
          } catch (err) {
            console.error('Error fetching from firebase:', err);
          }
        }

        const opName = operator ? String(operator).toUpperCase() : 'N/A';
        const pAmount = planAmount !== undefined && planAmount !== null ? planAmount : 'N/A';
        const fPaid = finalPaid !== undefined && finalPaid !== null ? finalPaid : pAmount;
        const finalDocId = docId || 'N/A';
        const finalPhone = phone || 'N/A';
        const finalUtr = utr || 'N/A';

        const messageText = `🔔 *New Prepaid Payment Received!*\n\n` +
                          `🆔 *ID:* \`${finalDocId}\`\n` +
                          `📱 *Phone:* \`${finalPhone}\`\n` +
                          `🌐 *Operator:* \`${opName}\`\n` +
                          `📋 *Plan Amount:* ₹\`${pAmount}\`\n` +
                          `💰 *Final Paid:* ₹\`${fPaid}\`\n` +
                          `📝 *UTR:* \`${finalUtr}\``;

        const inlineKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Verify Payment', callback_data: `verify_${finalDocId}` },
                { text: '🚀 Recharge Done', callback_data: `recharge_${finalDocId}` }
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

      // टेलीग्राम बटन क्लिक (Callback Query) हैंडल करने के लिए
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
      console.error('Error handling update:', error);
      return res.status(200).json({ error: error.message });
    }
  } else {
    return res.status(200).json({ message: 'Telegram Bot Webhook is active!' });
  }
};
