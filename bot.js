const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const TOKEN = "8866684441:AAFrzPZztyUjkgby3FeFySFWnZJauSHEbY0";
const ADMIN_ID = 5653088167;
const CONFIG_FILE = "bot_config.json";
const DB_FILE = "fokhm_bot.db";
const WEBAPP_URL = "https://fokhm.com";

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== قاعدة البيانات ====================
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

// ==================== الإعدادات الافتراضية ====================
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
    buttons: {
        inject: "حقن وتلغيم تطبيق",
        account: "معلومات حسابي",
        invite: "دعوة صديق (ربح)",
        vip: "قسم VIP",
        help: "مساعدة",
        donate: "تبرع للبوت"
    }
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

// ==================== لوحات المفاتيح المرتبة بالكامل ====================
function getMainKeyboard() {
    const b = config.buttons;
    return {
        inline_keyboard: [
            [
                { 
                    text: b.inject || "حقن وتلغيم تطبيق", 
                    web_app: { url: WEBAPP_URL },
                    icon_custom_emoji_id: "5368324170671202286" // الأيقونة المميزة للحقن
                }
            ],
            [
                { text: b.account || "معلومات حسابي", callback_data: "my_account", icon_custom_emoji_id: "5368324170671202287" },
                { text: b.invite || "دعوة صديق (ربح)", callback_data: "invite_friends", icon_custom_emoji_id: "5368324170671202288" }
            ],
            [
                { text: b.vip || "قسم VIP", callback_data: "vip_section", icon_custom_emoji_id: "5368324170671202289" },
                { text: b.help || "مساعدة", callback_data: "help_section", icon_custom_emoji_id: "5368324170671202290" }
            ],
            [
                { text: b.donate || "تبرع للبوت", callback_data: "start_donation", icon_custom_emoji_id: "5368324170671202291" }
            ]
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
            [{ text: "🔘 تعديل أسماء الأزرار", callback_data: "admin_edit_buttons" }],
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
    }).catch(() => {
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

// ==================== إدارة الاستعلامات والأزرار ====================
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
        bot.editMessageText("✍️ أرسل رسالة الترحيب الجديدة الآن.\n\n*ملاحظة:* قم بإرسال الإيموجي المميز داخل النص وسأقوم بحفظه تلقائياً بصيغة HTML.", {
            chat_id: chatId,
            message_id: messageId
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_edit_buttons' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_buttons';
        bot.editMessageText("🔘 أرسل أسماء الأزرار الستة الجديدة مفصولة بفاصلة `,` بالترتيب:\n\n<code>حقن وتلغيم,معلومات حسابي,دعوة صديق,قسم VIP,مساعدة,تبرع للبوت</code>", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML'
        });
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
            `📌 <b>الكمية المحددة حالياً:</b> <code>${current}</code> نجوم`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getNumberPad(current) }
        ).catch(() => {});
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ==================== معالجة الرسائل والتعرف على الإيموجي ====================
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
        bot.sendMessage(chatId, '✅ تم تحديث رسالة الترحيب بنجاح يا فخم!\n\nجرب إرسال /start لرؤيتها.');
    }
    else if (adminState[ADMIN_ID] === 'awaiting_buttons') {
        const parts = (msg.text || '').split(',').map(p => p.trim());
        if (parts.length >= 6) {
            config.buttons = {
                inject: parts[0],
                account: parts[1],
                invite: parts[2],
                vip: parts[3],
                help: parts[4],
                donate: parts[5]
            };
            saveConfig();
            delete adminState[ADMIN_ID];
            bot.sendMessage(chatId, '✅ تم تحديث أسماء الأزرار بنجاح يا فخم!', { reply_markup: getAdminKeyboard() });
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
                bot.sendMessage(chatId, `✅ <b>تمت الإذاعة بنجاح يا فخم!</b>\n\n📤 المرسل لهم: <b>${success}</b>\n❌ فشل: <b>${failed}</b>`, {
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

console.log('🤖 بوت fokhm.com يعمل الآن بنظام مرتب وبدون أي تكرار...');

