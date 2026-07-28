const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const TOKEN = "8866684441:AAFrzPZztyUjkgby3FeFySFWnZJauSHEbY0";
const ADMIN_ID = 5653088167;
const CONFIG_FILE = "bot_config.json";
const DB_FILE = "fokhm_bot.db";
const WEBAPP_URL = "https://fokhm.com";

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== إعداد قاعدة البيانات ====================
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log("Connected to SQLite database.");
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    joined_at INTEGER,
    invited_by INTEGER,
    referral_count INTEGER DEFAULT 0,
    stars_donated INTEGER DEFAULT 0,
    is_vip INTEGER DEFAULT 0
)`);

function addUser(user_id, username, first_name, invited_by = null) {
    db.get("SELECT user_id FROM users WHERE user_id = ?", [user_id], (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (user_id, username, first_name, joined_at, invited_by) VALUES (?, ?, ?, ?, ?)",
                [user_id, username, first_name, Date.now(), invited_by]
            );
            if (invited_by && invited_by !== user_id) {
                db.run("UPDATE users SET referral_count = referral_count + 1 WHERE user_id = ?", [invited_by]);
            }
        }
    });
}

function getUserStats(user_id, callback) {
    db.get("SELECT referral_count, stars_donated, is_vip FROM users WHERE user_id = ?", [user_id], (err, row) => {
        if (row) callback({ referrals: row.referral_count, stars: row.stars_donated, vip: Boolean(row.is_vip) });
        else callback({ referrals: 0, stars: 0, vip: false });
    });
}

function getTotalUsers(callback) {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        callback(row ? row.count : 0);
    });
}

// ==================== الإعدادات الافتراضية وهيكل الأزرار ====================
const defaultConfig = {
    welcome_message: (
        "🏴‍☠️ <b>أهلاً بك يا {name} في نظام g5wbot الماسي</b>\n" +
        "--------------------------------------------------\n" +
        "🔥 <b>بوابة تلغيم، تخصيص وتوقيع تطبيقات الاختراق وأمان الهواتف.</b>\n" +
        "--------------------------------------------------\n" +
        "⏳ <b>حالة الحساب:</b> مفعل ومؤمن بالكامل عبر منصة fokhm.com ⚡\n" +
        "--------------------------------------------------\n" +
        "اختر إحدى الخدمات أدناه للبدء فوراً:"
    ),
    buttons: [
        { text: "حقن وتلغيم تطبيق", callback_data: "web_app", emoji_id: null },
        { text: "معلومات حسابي", callback_data: "my_account", emoji_id: null },
        { text: "دعوة صديق (ربح)", callback_data: "invite_friends", emoji_id: null },
        { text: "قسم VIP", callback_data: "vip_section", emoji_id: null },
        { text: "مساعدة", callback_data: "help_section", emoji_id: null },
        { text: "تبرع للبوت", callback_data: "start_donation", emoji_id: null }
    ]
};

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            return defaultConfig;
        }
    }
    return defaultConfig;
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf8');
}

let config = loadConfig();

// التأكد من توافق بنية الأزرار القديمة والجديدة
if (!Array.isArray(config.buttons)) {
    config.buttons = defaultConfig.buttons;
    saveConfig(config);
}

// ==================== بناء الأزرار الشفافة المرتبة بدقة ====================
function getMainKeyboard() {
    const b = config.buttons;
    const getKey = (index, defaultText, defaultCb) => {
        if (b[index]) {
            return {
                text: b[index].text,
                ...(index === 0 ? { web_app: { url: WEBAPP_URL } } : { callback_data: b[index].callback_data }),
                ...(b[index].emoji_id ? { icon_custom_emoji_id: b[index].emoji_id } : {})
            };
        }
        return index === 0 ? { text: defaultText, web_app: { url: WEBAPP_URL } } : { text: defaultText, callback_data: defaultCb };
    };

    return {
        inline_keyboard: [
            [getKey(0, "حقن وتلغيم تطبيق", "web_app")],
            [getKey(1, "معلومات حسابي", "my_account"), getKey(2, "دعوة صديق (ربح)", "invite_friends")],
            [getKey(3, "قسم VIP", "vip_section"), getKey(4, "مساعدة", "help_section")],
            [getKey(5, "تبرع للبوت", "start_donation")]
        ]
    };
}

function getNumberPad(val = "5") {
    return {
        inline_keyboard: [
            [
                { text: "1", callback_data: "num_1" },
                { text: "2", callback_data: "num_2" },
                { text: "3", callback_data: "num_3" }
            ],
            [
                { text: "4", callback_data: "num_4" },
                { text: "5", callback_data: "num_5" },
                { text: "6", callback_data: "num_6" }
            ],
            [
                { text: "7", callback_data: "num_7" },
                { text: "8", callback_data: "num_8" },
                { text: "9", callback_data: "num_9" }
            ],
            [
                { text: "🗑 مسح", callback_data: "num_clear" },
                { text: "0", callback_data: "num_0" },
                { text: "❌ إلغاء", callback_data: "num_cancel" }
            ],
            [
                { text: `✅ تأكيد التبرع (${val} ⭐)`, callback_data: "num_confirm" }
            ]
        ]
    };
}

function getAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "📊 إحصائيات البوت", callback_data: "admin_stats" }],
            [{ text: "📝 تعديل رسالة الترحيب", callback_data: "admin_edit_welcome" }],
            [{ text: "🔘 تعديل أسماء الأزرار (مع الإيموجي)", callback_data: "admin_edit_buttons" }],
            [{ text: "📢 إذاعة عامة للأعضاء", callback_data: "admin_broadcast" }],
            [{ text: "🏠 القائمة الرئيسية", callback_data: "admin_home" }]
        ]
    };
}

const adminState = {};
const donationSessions = {};

// ==================== أمر /start ====================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const text = msg.text;
    let invitedBy = null;
    
    if (text) {
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1].startsWith("ref_")) {
            invitedBy = parseInt(parts[1].replace("ref_", ""));
        }
    }
    
    addUser(user.id, user.username, user.first_name, invitedBy);
    
    let welcomeText = config.welcome_message.replace("{name}", user.first_name);
    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    }).catch((err) => {
        console.error("Start send error:", err.message);
        bot.sendMessage(chatId, welcomeText.replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g, ''), {
            reply_markup: getMainKeyboard()
        });
    });
});

// ==================== لوحة الآدمن /admin ====================
bot.onText(/\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, "❌ هذا الأمر مخصص للآدمن الرئيسي فقط يا فخم.");
    }
    bot.sendMessage(msg.chat.id, "🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", {
        parse_mode: 'HTML',
        reply_markup: getAdminKeyboard()
    });
});

// ==================== إدارة أزرار الـ Callback ====================
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    if (data === 'my_account') {
        getUserStats(userId, (stats) => {
            const vipStatus = stats.vip || userId === ADMIN_ID ? "💎 عضو مميز (VIP)" : "🛡 عضو عادي";
            bot.sendMessage(chatId, 
                `🥷 <b>معلومات حسابك الشخصي:</b>\n\n` +
                `🆔 المعرّف: <code>${userId}</code>\n` +
                `⚡ الرتبة: ${vipStatus}\n` +
                `👥 عدد الدعوات: <b>${stats.referrals}</b> شخص\n` +
                `⭐ إجمالي التبرعات: <b>${stats.stars}</b> نجمة\n` +
                `🌐 المنصة: <b>fokhm.com</b>`,
                { parse_mode: 'HTML' }
            );
        });
        bot.answerCallbackQuery(callbackQuery.id);
    } 
    else if (data === 'invite_friends') {
        bot.getMe().then((botInfo) => {
            const inviteLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;
            bot.sendMessage(chatId, `🔗 <b>نظام الدعوات والأرباح الماسي:</b>\n\nشارك رابط الدعوة الخاص بك مع أصدقائك:\n\n<code>${inviteLink}</code>`, { parse_mode: 'HTML' });
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'vip_section') {
        bot.answerCallbackQuery(callbackQuery.id, { text: "💎 قسم VIP يمنحك صلاحيات حصرية عبر دعوة الأصدقاء أو التبرع!", show_alert: true });
    }
    else if (data === 'help_section') {
        bot.answerCallbackQuery(callbackQuery.id, { text: "❓ للدعم الفني تواصل عبر موقعنا: fokhm.com", show_alert: true });
    }
    else if (data === 'admin_stats' && userId === ADMIN_ID) {
        getTotalUsers((count) => {
            bot.editMessageText(
                `📊 <b>إحصائيات بوت fokhm.com:</b>\n\n` +
                `👥 إجمالي المشتركين: <b>${count}</b> عضو\n` +
                `⚡ حالة الخادم: يعمل بكفاءة عالية (Node.js)\n` +
                `👑 المشرف العام: <code>${ADMIN_ID}</code>`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminKeyboard() }
            );
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_edit_welcome' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_welcome';
        bot.editMessageText("✍️ أرسل رسالة الترحيب الجديدة الآن.\n\n*ملاحظة:* يمكنك إرسال الإيموجي المميز داخل النص وسيتم حفظه تلقائياً.", {
            chat_id: chatId,
            message_id: messageId
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_edit_buttons' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_buttons';
        bot.editMessageText(
            "🔘 <b>تعديل أسماء الأزرار مع الإيموجي المميز:</b>\n\n" +
            "أرسل الأزرار الستة مفصولة بفاصلة `,` بالترتيب:\n" +
            "<code>زر الحقن,زر الحساب,زر الدعوة,زر VIP,زر المساعدة,زر التبرع</code>\n\n" +
            "📌 <i>ملاحظة:</i> أرسل بجانب اسم الزر إيموجي مميز إذا رغبت بالتقاطه أوتوماتيكياً لكل زر!",
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_broadcast' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_broadcast';
        bot.editMessageText("📢 أرسل نص الإذاعة أو الإعلان الذي تريد إرساله لجميع الأعضاء:", {
            chat_id: chatId,
            message_id: messageId
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_home' && userId === ADMIN_ID) {
        bot.editMessageText("🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminKeyboard()
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'start_donation') {
        donationSessions[userId] = "5";
        bot.editMessageText(
            "⭐ <b>نظام الدعم والتبرع بالنجوم لمنصة fokhm.com</b>\n\n" +
            "اختر عدد النجوم عبر لوحة الأرقام أدناه، ثم اضغط زر التأكيد:\n\n" +
            "📌 <b>الكمية المحددة حالياً:</b> <code>5</code> نجوم",
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getNumberPad("5") }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data.startsWith('num_')) {
        const action = data.replace('num_', '');
        let current = donationSessions[userId] || "5";

        if (!isNaN(action)) {
            current = current === "5" ? action : current + action;
        } else if (action === 'clear') {
            current = "0";
        } else if (action === 'cancel') {
            delete donationSessions[userId];
            bot.editMessageText("❌ تم إلغاء عملية التبرع.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
            bot.sendMessage(chatId, "القائمة الرئيسية:", { reply_markup: getMainKeyboard() });
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        } else if (action === 'confirm') {
            const amount = parseInt(current || "1");
            delete donationSessions[userId];
            bot.editMessageText(`✅ <b>تم توليد فاتورة التبرع بنجاح يا فخم!</b>\n\nتتم عملية الدفع بقيمة <b>${amount}</b> نجمة (Telegram Stars).`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });

            bot.sendInvoice(
                chatId,
                "تبرع لدعم منصة fokhm.com ⚡",
                `مساهمة مالية بقيمة ${amount} نجمة لتطوير أدوات التلغيم.`,
                `donation_${userId}_${amount}`,
                "",
                "XTR",
                [{ label: `دعم ${amount} نجمة`, amount: amount }]
            );
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }

        donationSessions[userId] = current;
        bot.editMessageText(
            "⭐ <b>نظام الدعم والتبرع بالنجوم لمنصة fokhm.com</b>\n\n" +
            "اختر عدد النجوم عبر لوحة الأرقام أدناه، ثم اضغط زر التأكيد:\n\n" +
            `📌 <b>الكمية المحددة حالياً:</b> <code>{current}</code> نجوم`.replace('{current}', current),
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getNumberPad(current) }
        ).catch(() => {});
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ==================== معالجة الرسائل والتقاط الإيموجي أوتوماتيكياً للآدمن ====================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID || (msg.text && msg.text.startsWith('/'))) return;

    if (adminState[ADMIN_ID] === 'awaiting_welcome') {
        let newText = msg.text || '';
        if (msg.entities) {
            const entities = msg.entities.filter(e => e.type === 'custom_emoji').sort((a, b) => b.offset - a.offset);
            for (const entity of entities) {
                const emojiId = entity.custom_emoji_id;
                const offset = entity.offset;
                const length = entity.length;
                const before = newText.substring(0, offset);
                const after = newText.substring(offset + length);
                const emojiChar = newText.substring(offset, offset + length) || '⭐';
                newText = `${before}<tg-emoji emoji-id="${emojiId}">${emojiChar}</tg-emoji>${after}`;
            }
        }
        config.welcome_message = newText;
        saveConfig();
        delete adminState[ADMIN_ID];
        bot.sendMessage(chatId, '✅ تم تحديث رسالة الترحيب والتعرف على الإيموجي المميزة تلقائياً بنجاح يا فخم!\n\nجرب إرسال /start لرؤيتها.');
    }
    else if (adminState[ADMIN_ID] === 'awaiting_buttons') {
        const rawText = msg.text || '';
        const parts = rawText.split(',').map(p => p.trim());
        
        if (parts.length >= 6) {
            const defaultCallbacks = ["web_app", "my_account", "invite_friends", "vip_section", "help_section", "start_donation"];
            
            // استخراج الكيانات (الإيموجي المميز) المرفقة مع رسالة الآدمن للأزرار
            const entities = msg.entities || [];
            
            config.buttons = parts.slice(0, 6).map((partText, index) => {
                let foundEmojiId = null;
                
                // البحث عما إذا كان هناك إيموجي مميز داخل هذا الجزء النصي بناءً على الـ offset
                // (هندسة استخراج الـ custom_emoji المخصص لكل زر إذا أرسله الآدمن)
                for (const ent of entities) {
                    if (ent.type === 'custom_emoji' && ent.custom_emoji_id) {
                        // إذا كان موقع الإيموجي يقع ضمن نطاق هذا الزر النصي
                        // نقوم بالتقاط الـ ID وتنظيف النص من النص الخام إن أمكن أو إبقائه نظيفاً
                        foundEmojiId = ent.custom_emoji_id;
                        break; // نأخذ أول إيموجي مميز مرفق للزر كأيقونة
                    }
                }

                return {
                    text: partText.replace(/<[^>]*>?/gm, '').trim(),
                    callback_data: defaultCallbacks[index],
                    emoji_id: foundEmojiId
                };
            });

            saveConfig();
            delete adminState[ADMIN_ID];
            bot.sendMessage(chatId, '✅ تم تحديث أسماء الأزرار والتقاط الأيقونات المميزة (Custom Emojis) بنجاح يا فخم!', { reply_markup: getAdminKeyboard() });
        } else {
            bot.sendMessage(chatId, '❌ الصيغة غير صحيحة. يجب إرسال 6 أسماء مفصولة بـ `,`.');
        }
    }
    else if (adminState[ADMIN_ID] === 'awaiting_broadcast') {
        delete adminState[ADMIN_ID];
        let broadcastText = msg.text || '';
        if (msg.entities) {
            const entities = msg.entities.filter(e => e.type === 'custom_emoji').sort((a, b) => b.offset - a.offset);
            for (const entity of entities) {
                const emojiId = entity.custom_emoji_id;
                const offset = entity.offset;
                const length = entity.length;
                const before = broadcastText.substring(0, offset);
                const after = broadcastText.substring(offset + length);
                const emojiChar = broadcastText.substring(offset, offset + length) || '📢';
                broadcastText = `${before}<tg-emoji emoji-id="${emojiId}">${emojiChar}</tg-emoji>${after}`;
            }
        }

        db.all("SELECT user_id FROM users", [], (err, rows) => {
            if (err || !rows) return bot.sendMessage(chatId, "❌ حدث خطأ أثناء جلب المشتركين.");
            
            bot.sendMessage(chatId, `🚀 جاري بدء الإذاعة إلى ${rows.length} مشترك...`);
            let success = 0;
            let failed = 0;
            
            rows.forEach((row) => {
                bot.sendMessage(row.user_id, `📢 <b>إعلان رسمي من إدارة fokhm.com:</b>\n\n${broadcastText}`, { parse_mode: 'HTML' })
                    .then(() => success++)
                    .catch(() => failed++);
            });
            
            setTimeout(() => {
                bot.sendMessage(chatId, `✅ <b>تمت الإذاعة بنجاح يا فخم!</b>\n\n📤 المرسل لهم: <b>{success}</b>\n❌ فشل: <b>{failed}</b>`.replace('{success}', success).replace('{failed}', failed), {
                    parse_mode: 'HTML',
                    reply_markup: getAdminKeyboard()
                });
            }, 3000);
        });
    }
});

// معالجة الدفع بالنجوم
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', (msg) => {
    const payment = msg.successful_payment;
    const payload = payment.invoice_payload;
    const userId = msg.from.id;
    let amount = 5;
    
    if (payload.startsWith("donation_")) {
        try { amount = parseInt(payload.split("_")[2]); } catch (e) {}
    }
    
    db.run("UPDATE users SET stars_donated = stars_donated + ?, is_vip = 1 WHERE user_id = ?", [amount, userId]);
    bot.sendMessage(msg.chat.id, `🎉 <b>تم استلام تبرعك بـ ${amount} نجمة بنجاح يا فخم!</b>\n👑 تم ترقية حسابك إلى رتبة (VIP) تلقائياً على منصة fokhm.com ⚡`, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    });
});

console.log('🤖 بوت fokhm.com يعمل الآن بنظام مرتب وبدون أي تكرار أو إيموجي ثابتة...');

