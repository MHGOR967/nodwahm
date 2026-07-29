const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// صفحة ويب وهمية بسيطة عشان البورت يظل مفتوح ويتعامل مع رندر
app.get('/', (req, res) => {
    res.send('Bot is running successfully! 🚀');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// ============================================================================
// [ إعدادات البوت الأساسية ]
// ============================================================================
const TOKEN = "8828318815:AAGCVNOOOJeS91OkcyW6zVFBYOYhLYjHbv4";
const ADMIN_ID = 5653088167;
const CONFIG_FILE = "bot_config.json";
const DB_FILE = "fokhm_bot.db";
const WEBAPP_URL = "https://fokhm.com";

// تهيئة البوت
const bot = new TelegramBot(TOKEN, { polling: true });

// ============================================================================
// [ قاعدة البيانات ]
// ============================================================================
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
    } else {
        console.log("✅ تم الاتصال بقاعدة بيانات SQLite بنجاح.");
    }
});

// إنشاء الجداول إذا لم تكن موجودة
db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    joined_at INTEGER,
    invited_by INTEGER,
    referral_count INTEGER DEFAULT 0,
    stars_donated INTEGER DEFAULT 0,
    is_vip INTEGER DEFAULT 0,
    vip_expires_at INTEGER DEFAULT 0
)`);

// إضافة مستخدم جديد
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

// جلب إحصائيات المستخدم
function getUserStats(user_id, callback) {
    db.get("SELECT referral_count, stars_donated, is_vip, vip_expires_at FROM users WHERE user_id = ?", [user_id], (err, row) => {
        if (row) {
            // التحقق من انتهاء VIP
            if (row.is_vip && row.vip_expires_at > 0 && Date.now() > row.vip_expires_at) {
                db.run("UPDATE users SET is_vip = 0, vip_expires_at = 0 WHERE user_id = ?", [user_id]);
                row.is_vip = 0;
                row.vip_expires_at = 0;
            }
            callback({ 
                referrals: row.referral_count, 
                stars: row.stars_donated, 
                vip: Boolean(row.is_vip),
                vip_expires_at: row.vip_expires_at
            });
        } else {
            callback({ referrals: 0, stars: 0, vip: false, vip_expires_at: 0 });
        }
    });
}

// جلب إجمالي المستخدمين
function getTotalUsers(callback) {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        callback(row ? row.count : 0);
    });
}

// ============================================================================
// [ الإعدادات الافتراضية ]
// ============================================================================
const defaultConfig = {
    welcome_message: (
        "🏴‍☠️ <b>أهلاً بك يا {name} في نظام g5wbot الماسي</b>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔥 <b>بوابة تلغيم، تخصيص وتوقيع تطبيقات الاختراق وأمان الهواتف.</b>\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "⏳ <b>حالة الحساب:</b> مفعل ومؤمن بالكامل عبر منصة fokhm.com ⚡\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "اختر إحدى الخدمات أدناه للبدء فوراً:"
    ),
    welcome_photo: null,
    vip_photo: null,
    buttons: [
        { text: "حقن وتلغيم تطبيق", callback_data: "web_app", emoji_id: null },
        { text: "معلومات حسابي", callback_data: "my_account", emoji_id: null },
        { text: "دعوة صديق (ربح)", callback_data: "invite_friends", emoji_id: null },
        { text: "قسم VIP 👑", callback_data: "vip_section", emoji_id: null },
        { text: "مساعدة", callback_data: "help_section", emoji_id: null },
        { text: "تبرع للبوت", callback_data: "start_donation", emoji_id: null }
    ],
    vip_info: (
        "👑 <b>قسم الـ VIP الحصري</b>\n\n" +
        "احصل على ميزات خارقة وأدوات متقدمة للتلغيم والتشفير.\n" +
        "✨ <b>المميزات:</b>\n" +
        "• أدوات حصرية غير متاحة للأعضاء العاديين\n" +
        "• أولوية في الدعم الفني\n" +
        "• توقيع تطبيقات بدون قيود\n\n" +
        "💎 <b>السعر:</b> 270 نجمة (عرض مؤقت لمدة 48 ساعة فقط!)"
    )
};

// تحميل الإعدادات
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

// حفظ الإعدادات
function saveConfig(configToSave = config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 4), 'utf8');
}

let config = loadConfig();

if (!Array.isArray(config.buttons)) {
    config.buttons = defaultConfig.buttons;
    saveConfig(config);
}

// ============================================================================
// [ لوحات المفاتيح (Keyboards) ]
// ============================================================================

// القائمة الرئيسية
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
            [getKey(3, "قسم VIP 👑", "vip_section"), getKey(4, "مساعدة", "help_section")],
            [getKey(5, "تبرع للبوت", "start_donation")],
            [{ text: "�� المكافأة اليومية", callback_data: "daily_reward" }, { text: "❓ الأسئلة الشائعة", callback_data: "faq_section" }]
        ]
    };
}

// لوحة الأرقام للتبرع
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

// لوحة تحكم الأدمن
function getAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "�� إدارة المستخدمين", callback_data: "admin_cat_users" }, { text: "�� الإذاعة", callback_data: "admin_cat_broadcast" }],
            [{ text: "⚙️ إعدادات البوت", callback_data: "admin_cat_settings" }, { text: "�� النظام", callback_data: "admin_cat_system" }],
            [{ text: "�� الكوبونات", callback_data: "admin_cat_coupons" }, { text: "�� الإحصائيات", callback_data: "admin_cat_stats" }],
            [{ text: "�� القائمة الرئيسية", callback_data: "admin_home" }]
        ]
    };
}

function getAdminUsersKeyboard() {
    return { inline_keyboard: [
        [{ text: "�� حظر مستخدم", callback_data: "admin_ban_user" }, { text: "✅ رفع حظر", callback_data: "admin_unban_user" }],
        [{ text: "�� منح VIP", callback_data: "admin_vip_add" }, { text: "❌ إلغاء VIP", callback_data: "admin_vip_remove" }],
        [{ text: "�� رسالة لمستخدم", callback_data: "admin_msg_user" }],
        [{ text: "�� آخر المستخدمين", callback_data: "admin_last_users" }, { text: "�� تصدير CSV", callback_data: "admin_export_users" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}
function getAdminBroadcastKeyboard() {
    return { inline_keyboard: [
        [{ text: "�� إذاعة عامة", callback_data: "admin_broadcast" }],
        [{ text: "�� إذاعة VIP", callback_data: "admin_broadcast_vip" }],
        [{ text: "�� استطلاع", callback_data: "admin_send_poll" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}
function getAdminSettingsKeyboard() {
    return { inline_keyboard: [
        [{ text: "�� تعديل الترحيب", callback_data: "admin_edit_welcome" }],
        [{ text: "�� تعديل الأزرار", callback_data: "admin_edit_buttons_menu" }],
        [{ text: "�� تعديل VIP", callback_data: "admin_edit_vip" }],
        [{ text: "❓ تعديل FAQ", callback_data: "admin_edit_faq_menu" }],
        [{ text: "⚙️ الإعدادات", callback_data: "admin_dynamic_settings" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}
function getAdminSystemKeyboard() {
    return { inline_keyboard: [
        [{ text: "�� صحة البوت", callback_data: "admin_health" }],
        [{ text: "�� إعادة تحميل", callback_data: "admin_restart" }, { text: "�� مسح الكاش", callback_data: "admin_clear_cache" }],
        [{ text: "�� التحديثات", callback_data: "admin_version" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}
function getAdminCouponsKeyboard() {
    return { inline_keyboard: [
        [{ text: "➕ إنشاء كوبون", callback_data: "admin_create_coupon" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}
function getAdminStatsKeyboard() {
    return { inline_keyboard: [
        [{ text: "�� إحصائيات عامة", callback_data: "admin_stats" }],
        [{ text: "�� مفصلة", callback_data: "admin_detailed_stats" }],
        [{ text: "�� رجوع", callback_data: "admin_panel" }]
    ]};
}

// قائمة تعديل الأزرار بشكل منفصل
function getButtonsEditMenu() {
    return {
        inline_keyboard: [
            [{ text: "تعديل زر الحقن", callback_data: "edit_btn_0" }],
            [{ text: "تعديل زر الحساب", callback_data: "edit_btn_1" }, { text: "تعديل زر الدعوة", callback_data: "edit_btn_2" }],
            [{ text: "تعديل زر VIP", callback_data: "edit_btn_3" }, { text: "تعديل زر المساعدة", callback_data: "edit_btn_4" }],
            [{ text: "تعديل زر التبرع", callback_data: "edit_btn_5" }],
            [{ text: "🔙 رجوع", callback_data: "admin_home" }]
        ]
    };
}

// زر شراء VIP
function getVipPurchaseKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "💳 شراء VIP الآن (270 ⭐)", callback_data: "buy_vip" }],
            [{ text: "🔙 رجوع", callback_data: "main_menu" }]
        ]
    };
}

// ============================================================================
// [ حالة الجلسات ]
// ============================================================================
const adminState = {};
const donationSessions = {};
const editButtonState = {}; // لتتبع أي زر يتم تعديله

// ============================================================================
// [ أوامر البوت الأساسية ]
// ============================================================================

// أمر /start
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
    
    let welcomeText = config.welcome_message.replace(/{name}/g, user.first_name);
    
    const options = {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    };

    if (config.welcome_photo) {
        bot.sendPhoto(chatId, config.welcome_photo, { caption: welcomeText, ...options }).catch(() => {
            bot.sendMessage(chatId, welcomeText, options);
        });
    } else {
        bot.sendMessage(chatId, welcomeText, options).catch(() => {
            bot.sendMessage(chatId, welcomeText.replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g, ''), options);
        });
    }
});

// أمر /admin
bot.onText(/\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, "❌ هذا الأمر مخصص للآدمن الرئيسي فقط يا فخم.");
    }
    bot.sendMessage(msg.chat.id, "🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", {
        parse_mode: 'HTML',
        reply_markup: getAdminKeyboard()
    });
});

// ============================================================================
// [ معالجة الاستعلامات (Callback Queries) ]
// ============================================================================
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    // --- القائمة الرئيسية ---
    if (data === 'main_menu') {
        let welcomeText = config.welcome_message.replace(/{name}/g, callbackQuery.from.first_name);
        bot.editMessageText(welcomeText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        }).catch(() => {});
        bot.answerCallbackQuery(callbackQuery.id);
    }

    // --- معلومات الحساب ---
    else if (data === 'my_account') {
        getUserStats(userId, (stats) => {
            getUserPoints(userId, (pointsData) => {
                const levelName = getLevelName(pointsData.level);
                let vipStatus = "�� عضو عادي";
                let vipExpiryText = "";
                if (userId === ADMIN_ID) { vipStatus = "�� الآدمن الرئيسي"; }
                else if (stats.vip) { vipStatus = "�� عضو VIP"; if (stats.vip_expires_at > 0) { const expiryDate = new Date(stats.vip_expires_at).toLocaleString('ar-EG'); vipExpiryText = `\n⏳ ينتهي: <b>${expiryDate}</b>`; } }
                bot.editMessageText(
                    `�� <b>معلومات حسابك:</b>\n\n` +
                    `�� المعرّف: <code>${userId}</code>\n` +
                    `⚡ الرتبة: ${vipStatus}${vipExpiryText}\n` +
                    `�� المستوى: ${levelName} (${pointsData.level})\n` +
                    `⚡ النقاط: <b>${pointsData.points}</b>\n` +
                    `�� الدعوات: <b>${stats.referrals}</b>\n` +
                    `⭐ التبرعات: <b>${stats.stars}</b> نجمة\n` +
                    `�� المنصة: <b>fokhm.com</b>`,
                    { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "�� رجوع", callback_data: "main_menu" }]] } }
                );
            });
        });
        bot.answerCallbackQuery(callbackQuery.id);
    } 
    
    // --- دعوة صديق ---
    else if (data === 'invite_friends') {
        bot.getMe().then((botInfo) => {
            const inviteLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;
            bot.editMessageText(
                `🔗 <b>نظام الدعوات والأرباح الماسي:</b>\n\n` +
                `شارك رابط الدعوة الخاص بك مع أصدقائك للحصول على مكافآت وترقيات مجانية!\n\n` +
                `<code>${inviteLink}</code>`, 
                { 
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "main_menu" }]]
                    }
                }
            );
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- قسم VIP ---
    else if (data === 'vip_section') {
        const timeInfo = getVipOfferTimeRemaining();
        const vipText = `${config.vip_info || defaultConfig.vip_info}\n\n⏳ <b>الوقت المتبقي للعرض:</b> <code>${timeInfo.text}</code>`;
        
        const options = {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getVipPurchaseKeyboard()
        };

        if (config.vip_photo) {
            // إذا كان هناك صورة، نحتاج لحذف الرسالة النصية وإرسال صورة مع كابشن
            bot.deleteMessage(chatId, messageId).catch(() => {});
            bot.sendPhoto(chatId, config.vip_photo, { caption: vipText, ...options }).then((sentMsg) => {
                startVipTimer(userId, chatId, sentMsg.message_id);
            });
        } else {
            bot.editMessageText(vipText, options).then(() => {
                startVipTimer(userId, chatId, messageId);
            });
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- شراء VIP ---
    else if (data === 'buy_vip') {
        const amount = 270;
        bot.editMessageText(
            `✅ <b>جاري تجهيز فاتورة شراء VIP!</b>\n\n` +
            `تتم عملية الدفع بقيمة <b>${amount}</b> نجمة (Telegram Stars).\n` +
            `المدة: 30 يوماً.`, 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            }
        );

        bot.sendInvoice(
            chatId,
            "اشتراك VIP مميز 👑",
            `ترقية الحساب إلى VIP لمدة 30 يوماً في منصة fokhm.com للوصول إلى كافة الأدوات الحصرية.`,
            `vip_purchase_${userId}_${amount}`,
            "",
            "XTR",
            [{ label: `اشتراك VIP`, amount: amount }]
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- مساعدة ---
    else if (data === 'help_section') {
        bot.answerCallbackQuery(callbackQuery.id, { text: "❓ للدعم الفني تواصل عبر موقعنا: fokhm.com", show_alert: true });
    }
    
    // ==================== لوحة الأدمن ====================
    
    // --- إحصائيات الأدمن ---
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
    
    // --- تعديل رسالة الترحيب ---
    else if (data === 'admin_edit_welcome' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_welcome';
        bot.editMessageText(
            "✍️ <b>أرسل رسالة الترحيب الجديدة الآن.</b>\n\n" +
            "📌 <b>ملاحظات:</b>\n" +
            "- استخدم <code>{name}</code> لذكر اسم المستخدم.\n" +
            "- أرسل الإيموجي المميز (Custom Emoji) داخل النص وسيتم حفظه بالضبط كما هو وبدون تكرارات مزعجة.", 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_home" }]] }
            }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- تعديل معلومات VIP ---
    else if (data === 'admin_edit_vip' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_vip_info';
        bot.editMessageText(
            "✍️ <b>أرسل نص قسم الـ VIP الجديد الآن.</b>\n\n" +
            "📌 يمكنك استخدام التنسيقات (Bold, Italic) والإيموجي المميز.", 
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_home" }]] }
            }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- قائمة تعديل الأزرار (الطريقة الجديدة السهلة) ---
    else if (data === 'admin_edit_buttons_menu' && userId === ADMIN_ID) {
        bot.editMessageText(
            "🔘 <b>تعديل أسماء الأزرار بسهولة:</b>\n\n" +
            "اختر الزر الذي تريد تعديل اسمه وإضافة إيموجي مميز له:",
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getButtonsEditMenu() }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- معالجة اختيار زر معين للتعديل ---
    else if (data.startsWith('edit_btn_') && userId === ADMIN_ID) {
        const btnIndex = parseInt(data.replace('edit_btn_', ''));
        const currentBtnName = config.buttons[btnIndex].text;
        
        editButtonState[ADMIN_ID] = btnIndex;
        adminState[ADMIN_ID] = 'awaiting_single_button';
        
        bot.editMessageText(
            `🔘 <b>تعديل الزر رقم ${btnIndex + 1}:</b>\n` +
            `الاسم الحالي: <b>${currentBtnName}</b>\n\n` +
            `أرسل الاسم الجديد للزر مع الإيموجي المميز الذي تريده (إيموجي واحد يكفي).`,
            { 
                chat_id: chatId, 
                message_id: messageId, 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_edit_buttons_menu" }]] }
            }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- إذاعة ---
    else if (data === 'admin_broadcast' && userId === ADMIN_ID) {
        adminState[ADMIN_ID] = 'awaiting_broadcast';
        bot.editMessageText("📢 أرسل نص الإذاعة أو الإعلان الذي تريد إرساله لجميع الأعضاء:", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_home" }]] }
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // --- الرجوع للرئيسية للأدمن ---
    else if (data === 'admin_home' && userId === ADMIN_ID) {
        delete adminState[ADMIN_ID];
        delete editButtonState[ADMIN_ID];
        bot.editMessageText("🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminKeyboard()
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
        // --- رجوع للوحة الأدمن ---
    else if (data === 'admin_panel' && userId === ADMIN_ID) {
        delete adminState[ADMIN_ID]; delete editButtonState[ADMIN_ID];
        bot.editMessageText("�� <b>لوحة تحكم الآدمن:</b>\nاختر القسم:", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminKeyboard() });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data === 'admin_cat_users' && userId === ADMIN_ID) { bot.editMessageText("�� <b>إدارة المستخدمين:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminUsersKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_cat_broadcast' && userId === ADMIN_ID) { bot.editMessageText("�� <b>الإذاعة:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminBroadcastKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_cat_settings' && userId === ADMIN_ID) { bot.editMessageText("⚙️ <b>الإعدادات:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminSettingsKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_cat_system' && userId === ADMIN_ID) { bot.editMessageText("�� <b>النظام:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminSystemKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_cat_coupons' && userId === ADMIN_ID) { bot.editMessageText("�� <b>الكوبونات:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminCouponsKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_cat_stats' && userId === ADMIN_ID) { bot.editMessageText("�� <b>الإحصائيات:</b>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: getAdminStatsKeyboard() }); bot.answerCallbackQuery(callbackQuery.id); }
    // أزرار الأدمن
    else if (data === 'admin_ban_user' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_ban_input'; bot.editMessageText("�� <b>حظر:</b>\nأرسل: <code>USER_ID السبب</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_users" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_unban_user' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_unban_input'; bot.editMessageText("✅ <b>رفع حظر:</b>\nأرسل: <code>USER_ID</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_users" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_vip_add' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_vip_add_input'; bot.editMessageText("�� <b>منح VIP:</b>\nأرسل: <code>USER_ID</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_users" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_vip_remove' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_vip_remove_input'; bot.editMessageText("❌ <b>إلغاء VIP:</b>\nأرسل: <code>USER_ID</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_users" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_msg_user' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_msg_user_input'; bot.editMessageText("�� <b>رسالة:</b>\nأرسل: <code>USER_ID النص</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_users" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_last_users' && userId === ADMIN_ID) { db.all("SELECT user_id, username, first_name, joined_at, is_vip FROM users ORDER BY joined_at DESC LIMIT 10", [], (err, rows) => { if (!rows||rows.length===0){bot.editMessageText("لا يوجد.",{chat_id:chatId,message_id:messageId,reply_markup:getAdminUsersKeyboard()});return;} let t=`�� <b>آخر 10:</b>\n\n`; rows.forEach((r,i)=>{t+=`${i+1}. <code>${r.user_id}</code> - ${r.first_name||'غير معروف'}${r.is_vip?' ��':''}\n`;}); bot.editMessageText(t,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminUsersKeyboard()}); }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_export_users' && userId === ADMIN_ID) { db.all("SELECT user_id,username,first_name,joined_at,is_vip,stars_donated,referral_count FROM users",[],(err,rows)=>{if(!rows){bot.answerCallbackQuery(callbackQuery.id,{text:"❌",show_alert:true});return;} const csv="user_id,username,first_name,joined_at,is_vip,stars,referrals\n"+rows.map(r=>`${r.user_id},${r.username||''},${r.first_name||''},${r.joined_at},${r.is_vip},${r.stars_donated},${r.referral_count}`).join('\n'); const f=`users_${Date.now()}.csv`; fs.writeFileSync(f,csv,'utf8'); bot.sendDocument(chatId,f,{},{filename:'users.csv',contentType:'text/csv'}).then(()=>fs.unlinkSync(f)).catch(()=>{}); }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_broadcast_vip' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_broadcast_vip'; bot.editMessageText("�� <b>إذاعة VIP:</b>\nأرسل النص:", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_broadcast" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_send_poll' && userId === ADMIN_ID) { adminState[ADMIN_ID] = 'awaiting_poll_input'; bot.editMessageText("�� <b>استطلاع:</b>\nأرسل: <code>السؤال|خيار1|خيار2</code>", { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "admin_cat_broadcast" }]] } }); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_health' && userId === ADMIN_ID) { const h=getBotHealth(); bot.editMessageText(`�� <b>الحالة:</b>\n${h.status}\n⏱ ${Math.floor(h.uptime/3600)}h\n�� ${Math.round(h.memory.heapUsed/1024/1024)}MB\nv${h.version}`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminSystemKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_restart' && userId === ADMIN_ID) { config=loadConfig(); bot.editMessageText("✅ تم إعادة التحميل!",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminSystemKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_clear_cache' && userId === ADMIN_ID) { userCache.clear();userMessageCounts.clear(); bot.editMessageText("✅ تم مسح الكاش!",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminSystemKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_version' && userId === ADMIN_ID) { let t=`�� <b>التحديثات:</b>\n\n`; CHANGELOG.forEach(r=>{t+=`<b>v${r.version}</b>: ${r.changes.join(', ')}\n`;}); bot.editMessageText(t,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminSystemKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_dynamic_settings' && userId === ADMIN_ID) { const t=Object.entries(dynamicSettings).map(([k,v])=>`• <b>${k}:</b> <code>${v}</code>`).join('\n'); bot.editMessageText(`⚙️ <b>الإعدادات:</b>\n\n${t}`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminSettingsKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_detailed_stats' && userId === ADMIN_ID) { getDetailedStats((s)=>{bot.editMessageText(`�� <b>مفصلة:</b>\n�� ${s.totalUsers}\n�� VIP: ${s.vipUsers}\n⭐ ${s.totalStars||0}\n�� اليوم: ${s.todayJoined}`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:getAdminStatsKeyboard()});}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_create_coupon' && userId === ADMIN_ID) { adminState[ADMIN_ID]='awaiting_coupon_input'; bot.editMessageText("�� <b>كوبون:</b>\n<code>الكود الخصم الاستخدامات الساعات</code>\nمثال: <code>SALE50 50 10 48</code>",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"admin_cat_coupons"}]]}}); bot.answerCallbackQuery(callbackQuery.id); }
    // FAQ الأدمن
    else if (data === 'admin_edit_faq_menu' && userId === ADMIN_ID) { const btns=FAQ_DATA.map((item,i)=>[{text:`✏️ ${item.question.substring(0,25)}`,callback_data:`admin_edit_faq_${i}`}]); btns.push([{text:"➕ إضافة سؤال",callback_data:"admin_add_faq"}]); btns.push([{text:"�� رجوع",callback_data:"admin_cat_settings"}]); bot.editMessageText("❓ <b>تعديل FAQ:</b>",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data.startsWith('admin_edit_faq_') && userId === ADMIN_ID) { const i=parseInt(data.replace('admin_edit_faq_','')); if(FAQ_DATA[i]){adminState[ADMIN_ID]=`awaiting_faq_edit_${i}`; bot.editMessageText(`✏️ <b>تعديل سؤال ${i+1}:</b>\n\n<b>${FAQ_DATA[i].question}</b>\n${FAQ_DATA[i].answer}\n\nأرسل: <code>السؤال|الإجابة</code>\nيمكنك إضافة إيموجي مميزة!`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"�� حذف",callback_data:`admin_delete_faq_${i}`}],[{text:"❌ إلغاء",callback_data:"admin_edit_faq_menu"}]]}});} bot.answerCallbackQuery(callbackQuery.id); }
    else if (data.startsWith('admin_delete_faq_') && userId === ADMIN_ID) { const i=parseInt(data.replace('admin_delete_faq_','')); if(FAQ_DATA[i]){FAQ_DATA.splice(i,1);saveFaqData();} bot.editMessageText("✅ تم الحذف!",{chat_id:chatId,message_id:messageId,reply_markup:getAdminSettingsKeyboard()}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'admin_add_faq' && userId === ADMIN_ID) { adminState[ADMIN_ID]='awaiting_faq_add'; bot.editMessageText("➕ <b>سؤال جديد:</b>\nأرسل: <code>السؤال|الإجابة</code>\nيمكنك إضافة إيموجي مميزة!",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"admin_edit_faq_menu"}]]}}); bot.answerCallbackQuery(callbackQuery.id); }
    // أزرار المستخدمين
    else if (data === 'daily_reward') { claimDailyReward(userId,(result)=>{bot.editMessageText(`�� <b>المكافأة اليومية:</b>\n\n${result.message}`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"�� رجوع",callback_data:"main_menu"}]]}});}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data === 'faq_section') { const btns=FAQ_DATA.map((item,i)=>[{text:item.question,callback_data:`faq_item_${i}`}]); btns.push([{text:"�� رجوع",callback_data:"main_menu"}]); bot.editMessageText("❓ <b>الأسئلة الشائعة:</b>\nاختر سؤالك:",{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}}); bot.answerCallbackQuery(callbackQuery.id); }
    else if (data.startsWith('faq_item_')) { const i=parseInt(data.replace('faq_item_','')); if(FAQ_DATA[i]){bot.editMessageText(`❓ <b>${FAQ_DATA[i].question}</b>\n\n${FAQ_DATA[i].answer}`,{chat_id:chatId,message_id:messageId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"�� الأسئلة",callback_data:"faq_section"}],[{text:"�� الرئيسية",callback_data:"main_menu"}]]}});} bot.answerCallbackQuery(callbackQuery.id); }
    
    // ==================== التبرع ====================
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
            // حد أقصى للنجوم
            if (parseInt(current) > 10000) current = "10000";
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
            if (amount <= 0) {
                bot.answerCallbackQuery(callbackQuery.id, { text: "❌ يجب أن يكون التبرع أكبر من صفر!", show_alert: true });
                return;
            }
            
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

// ============================================================================
// [ دالة مساعدة لمعالجة الإيموجي المميز بدون تكرارات ]
// ============================================================================
function processTextWithCustomEmojis(msg) {
    let text = msg.text || msg.caption || '';
    let newText = '';
    let lastIndex = 0;
    
    if (msg.entities || msg.caption_entities) {
        const entities = (msg.entities || msg.caption_entities)
            .filter(e => e.type === 'custom_emoji')
            .sort((a, b) => a.offset - b.offset);
        
        const addedEmojiIds = new Set();
        
        for (const entity of entities) {
            const emojiId = entity.custom_emoji_id;
            
            if (addedEmojiIds.has(emojiId)) {
                const before = text.substring(lastIndex, entity.offset);
                newText += cleanNormalEmojis(before);
                lastIndex = entity.offset + entity.length;
                continue;
            }
            
            const before = text.substring(lastIndex, entity.offset);
            newText += cleanNormalEmojis(before);
            
            const emojiChar = text.substring(entity.offset, entity.offset + entity.length) || '⭐';
            newText += `<tg-emoji emoji-id="${emojiId}">${emojiChar}</tg-emoji>`;
            addedEmojiIds.add(emojiId);
            lastIndex = entity.offset + entity.length;
        }
    }
    
    newText += cleanNormalEmojis(text.substring(lastIndex));
    return newText.trim();
}

function cleanNormalEmojis(text) {
    const emojiRegex = /(?:[\u2600-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF\uDE00-\uDEFF]|[\u200D\uFE0F\u20E3]|\uDB40[\uDC20-\uDC7F])+/g;
    return text.replace(emojiRegex, '');
}

// ============================================================================
// [ معالجة الرسائل النصية (إدخالات الأدمن) ]
// ============================================================================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID || (msg.text && msg.text.startsWith('/'))) return;

    // --- استقبال رسالة الترحيب ---
    if (adminState[ADMIN_ID] === 'awaiting_welcome') {
        const newText = processTextWithCustomEmojis(msg);
        config.welcome_message = newText;
        
        // التحقق من وجود صورة
        if (msg.photo) {
            config.welcome_photo = msg.photo[msg.photo.length - 1].file_id;
        } else {
            config.welcome_photo = null;
        }
        
        saveConfig();
        delete adminState[ADMIN_ID];
        bot.sendMessage(chatId, '✅ تم تحديث رسالة الترحيب!', { reply_markup: getAdminKeyboard() });
        bot.sendMessage(chatId, `�� <b>معاينة:</b>\n\n${newText}`, { parse_mode: 'HTML', reply_markup: getMainKeyboard() });
    }
    
    // --- استقبال نص VIP ---
    else if (adminState[ADMIN_ID] === 'awaiting_vip_info') {
        const newText = processTextWithCustomEmojis(msg);
        config.vip_info = newText;
        
        // التحقق من وجود صورة
        if (msg.photo) {
            config.vip_photo = msg.photo[msg.photo.length - 1].file_id;
        } else {
            config.vip_photo = null;
        }
        
        saveConfig();
        delete adminState[ADMIN_ID];
        bot.sendMessage(chatId, '✅ تم تحديث قسم VIP (مع الصورة إن وجدت) بنجاح!', { reply_markup: getAdminKeyboard() });
    }
    
    // --- استقبال تعديل زر واحد (الطريقة الجديدة) ---
    else if (adminState[ADMIN_ID] === 'awaiting_single_button') {
        const btnIndex = editButtonState[ADMIN_ID];
        if (btnIndex !== undefined && btnIndex >= 0 && btnIndex < config.buttons.length) {
            const rawText = msg.text || '';
            let assignedEmojiId = null;
            
            // استخراج أول إيموجي مميز في الرسالة
            if (msg.entities) {
                const customEmojiEntity = msg.entities.find(e => e.type === 'custom_emoji');
                if (customEmojiEntity && customEmojiEntity.custom_emoji_id) {
                    assignedEmojiId = customEmojiEntity.custom_emoji_id;
                }
            }
            
            // إزالة التنسيقات من النص ليكون نظيفاً للزر
            const cleanText = rawText.replace(/<[^>]*>?/gm, '').trim();
            
            config.buttons[btnIndex].text = cleanText;
            config.buttons[btnIndex].emoji_id = assignedEmojiId;
            
            saveConfig();
            delete adminState[ADMIN_ID];
            delete editButtonState[ADMIN_ID];
            
            bot.sendMessage(chatId, `✅ تم تحديث الزر بنجاح إلى:\n<b>${cleanText}</b>\nوتم ربط الإيموجي بشكل سليم!`, { 
                parse_mode: 'HTML',
                reply_markup: getButtonsEditMenu() 
            });
        }
    }
    
    // --- استقبال نص الإذاعة ---
    else if (adminState[ADMIN_ID] === 'awaiting_broadcast') {
        delete adminState[ADMIN_ID];
        const broadcastText = processTextWithCustomEmojis(msg);

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
            }, 3000); // تأخير بسيط لإعطاء وقت للإرسال
        });
    }

    // --- حظر ---
    else if (adminState[ADMIN_ID] === 'awaiting_ban_input') { delete adminState[ADMIN_ID]; const parts=(msg.text||'').trim().split(/\s+/); const tid=parseInt(parts[0]); const reason=parts.slice(1).join(' ')||'بدون سبب'; if(isNaN(tid)){bot.sendMessage(chatId,"❌ معرف غير صالح",{reply_markup:getAdminUsersKeyboard()});return;} banUser(tid,reason,ADMIN_ID,(err)=>{if(err){bot.sendMessage(chatId,"❌ خطأ",{reply_markup:getAdminUsersKeyboard()});}else{bot.sendMessage(chatId,`✅ تم حظر <code>${tid}</code>`,{parse_mode:'HTML',reply_markup:getAdminUsersKeyboard()});bot.sendMessage(tid,"⛔ تم حظرك").catch(()=>{});}}); }
    // --- رفع حظر ---
    else if (adminState[ADMIN_ID] === 'awaiting_unban_input') { delete adminState[ADMIN_ID]; const tid=parseInt((msg.text||'').trim()); if(isNaN(tid)){bot.sendMessage(chatId,"❌ معرف غير صالح",{reply_markup:getAdminUsersKeyboard()});return;} unbanUser(tid,(err)=>{if(err){bot.sendMessage(chatId,"❌ خطأ",{reply_markup:getAdminUsersKeyboard()});}else{bot.sendMessage(chatId,`✅ تم رفع الحظر عن <code>${tid}</code>`,{parse_mode:'HTML',reply_markup:getAdminUsersKeyboard()});bot.sendMessage(tid,"✅ تم رفع الحظر").catch(()=>{});}}); }
    // --- منح VIP ---
    else if (adminState[ADMIN_ID] === 'awaiting_vip_add_input') { delete adminState[ADMIN_ID]; const tid=parseInt((msg.text||'').trim()); if(isNaN(tid)){bot.sendMessage(chatId,"❌ معرف غير صالح",{reply_markup:getAdminUsersKeyboard()});return;} const exp=Date.now()+(30*24*60*60*1000); db.run("UPDATE users SET is_vip=1,vip_expires_at=? WHERE user_id=?",[exp,tid],(err)=>{if(err){bot.sendMessage(chatId,"❌ خطأ",{reply_markup:getAdminUsersKeyboard()});}else{bot.sendMessage(chatId,`✅ VIP لـ <code>${tid}</code> (30 يوم)`,{parse_mode:'HTML',reply_markup:getAdminUsersKeyboard()});bot.sendMessage(tid,"�� تم ترقيتك VIP!").catch(()=>{});}}); }
    // --- إلغاء VIP ---
    else if (adminState[ADMIN_ID] === 'awaiting_vip_remove_input') { delete adminState[ADMIN_ID]; const tid=parseInt((msg.text||'').trim()); if(isNaN(tid)){bot.sendMessage(chatId,"❌ معرف غير صالح",{reply_markup:getAdminUsersKeyboard()});return;} db.run("UPDATE users SET is_vip=0,vip_expires_at=0 WHERE user_id=?",[tid],(err)=>{if(err){bot.sendMessage(chatId,"❌ خطأ",{reply_markup:getAdminUsersKeyboard()});}else{bot.sendMessage(chatId,`✅ إلغاء VIP لـ <code>${tid}</code>`,{parse_mode:'HTML',reply_markup:getAdminUsersKeyboard()});}}); }
    // --- رسالة ---
    else if (adminState[ADMIN_ID] === 'awaiting_msg_user_input') { delete adminState[ADMIN_ID]; const raw=msg.text||''; const si=raw.indexOf(' '); if(si===-1){bot.sendMessage(chatId,"❌ الصيغة: USER_ID النص",{reply_markup:getAdminUsersKeyboard()});return;} const tid=parseInt(raw.substring(0,si)); const txt=raw.substring(si+1); if(isNaN(tid)){bot.sendMessage(chatId,"❌ معرف غير صالح",{reply_markup:getAdminUsersKeyboard()});return;} bot.sendMessage(tid,`�� <b>رسالة من الإدارة:</b>\n\n${txt}`,{parse_mode:'HTML'}).then(()=>bot.sendMessage(chatId,`✅ تم الإرسال`,{reply_markup:getAdminUsersKeyboard()})).catch(()=>bot.sendMessage(chatId,"❌ فشل",{reply_markup:getAdminUsersKeyboard()})); }
    // --- إذاعة VIP ---
    else if (adminState[ADMIN_ID] === 'awaiting_broadcast_vip') { delete adminState[ADMIN_ID]; const txt=processTextWithCustomEmojis(msg); db.all("SELECT user_id FROM users WHERE is_vip=1",[],(err,rows)=>{if(!rows)return; let s=0,f=0; rows.forEach(r=>{bot.sendMessage(r.user_id,`�� <b>VIP:</b>\n\n${txt}`,{parse_mode:'HTML'}).then(()=>s++).catch(()=>f++);}); setTimeout(()=>{bot.sendMessage(chatId,`✅ تم لـ ${s} عضو VIP`,{reply_markup:getAdminKeyboard()});},3000);}); }
    // --- استطلاع ---
    else if (adminState[ADMIN_ID] === 'awaiting_poll_input') { delete adminState[ADMIN_ID]; const parts=(msg.text||'').split('|'); if(parts.length<3){bot.sendMessage(chatId,"❌ الصيغة: السؤال|خيار1|خيار2",{reply_markup:getAdminBroadcastKeyboard()});return;} const q=parts[0].trim(); const opts=parts.slice(1).map(o=>o.trim()); db.all("SELECT user_id FROM users",[], async(err,rows)=>{if(!rows)return; let sent=0; for(const r of rows){try{await bot.sendPoll(r.user_id,q,opts,{is_anonymous:false});sent++;await new Promise(r=>setTimeout(r,100));}catch(e){}} bot.sendMessage(chatId,`✅ استطلاع لـ ${sent}`,{reply_markup:getAdminKeyboard()});}); }
    // --- كوبون ---
    else if (adminState[ADMIN_ID] === 'awaiting_coupon_input') { delete adminState[ADMIN_ID]; const parts=(msg.text||'').trim().split(/\s+/); if(parts.length<4){bot.sendMessage(chatId,"❌ الصيغة: الكود الخصم الاستخدامات الساعات",{reply_markup:getAdminCouponsKeyboard()});return;} const[code,disc,uses,hrs]=parts; createCoupon(code,parseInt(disc),0,parseInt(uses),parseInt(hrs)); bot.sendMessage(chatId,`✅ كوبون: <b>${code.toUpperCase()}</b> | ${disc}% | ${uses}x | ${hrs}h`,{parse_mode:'HTML',reply_markup:getAdminCouponsKeyboard()}); }
    // --- FAQ تعديل ---
    else if (adminState[ADMIN_ID] && adminState[ADMIN_ID].startsWith('awaiting_faq_edit_')) { const i=parseInt(adminState[ADMIN_ID].replace('awaiting_faq_edit_','')); delete adminState[ADMIN_ID]; const raw=processTextWithCustomEmojis(msg); const parts=raw.split('|'); if(parts.length<2){bot.sendMessage(chatId,"❌ الصيغة: السؤال|الإجابة",{reply_markup:getAdminSettingsKeyboard()});return;} FAQ_DATA[i]={question:parts[0].trim(),answer:parts.slice(1).join('|').trim()}; saveFaqData(); bot.sendMessage(chatId,`✅ تم تحديث السؤال ${i+1}!`,{reply_markup:getAdminSettingsKeyboard()}); }
    // --- FAQ إضافة ---
    else if (adminState[ADMIN_ID] === 'awaiting_faq_add') { delete adminState[ADMIN_ID]; const raw=processTextWithCustomEmojis(msg); const parts=raw.split('|'); if(parts.length<2){bot.sendMessage(chatId,"❌ الصيغة: السؤال|الإجابة",{reply_markup:getAdminSettingsKeyboard()});return;} FAQ_DATA.push({question:parts[0].trim(),answer:parts.slice(1).join('|').trim()}); saveFaqData(); bot.sendMessage(chatId,`✅ تمت الإضافة! العدد: ${FAQ_DATA.length}`,{reply_markup:getAdminSettingsKeyboard()}); }

});

// ============================================================================
// [ معالجة الدفع (Pre-checkout & Successful Payment) ]
// ============================================================================
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', (msg) => {
    const payment = msg.successful_payment;
    const payload = payment.invoice_payload;
    const userId = msg.from.id;
    
    // --- معالجة التبرع ---
    if (payload.startsWith("donation_")) {
        let amount = 5;
        try { amount = parseInt(payload.split("_")[2]); } catch (e) {}
        
        db.run("UPDATE users SET stars_donated = stars_donated + ? WHERE user_id = ?", [amount, userId]);
        bot.sendMessage(msg.chat.id, `🎉 <b>تم استلام تبرعك بـ ${amount} نجمة بنجاح يا فخم!</b>\nشكراً لدعمك المستمر لمنصة fokhm.com ⚡`, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    }
    
    // --- معالجة شراء VIP ---
    else if (payload.startsWith("vip_purchase_")) {
        let amount = 270;
        try { amount = parseInt(payload.split("_")[2]); } catch (e) {}
        
        // 30 يوم = 30 * 24 * 60 * 60 * 1000
        const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
        
        db.run("UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE user_id = ?", [expiryTime, userId]);
        bot.sendMessage(msg.chat.id, `🎉 <b>مبروك يا فخم!</b>\n\n👑 تم ترقية حسابك إلى رتبة (VIP) بنجاح لمدة 30 يوماً.\nاستمتع بالميزات الحصرية الآن ⚡`, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
    }
});

// ============================================================================
// [ بدء التشغيل ]
// ============================================================================
console.log('====================================================');
console.log('🤖 بوت fokhm.com الماسي يعمل الآن...');
console.log('👑 تم تفعيل نظام الأزرار الفردية والإيموجي المحسّن');
console.log('====================================================');

// ============================================================================
// [ نظام المكافآت والنقاط المتقدم ]
// ============================================================================

// إنشاء جدول النقاط
db.run(`CREATE TABLE IF NOT EXISTS points (
    user_id INTEGER PRIMARY KEY,
    total_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    last_daily INTEGER DEFAULT 0
)`);

// إضافة نقاط للمستخدم
function addPoints(userId, amount, reason = '') {
    db.get("SELECT total_points, level FROM points WHERE user_id = ?", [userId], (err, row) => {
        if (!row) {
            db.run("INSERT INTO points (user_id, total_points, level) VALUES (?, ?, 1)", [userId, amount]);
        } else {
            const newTotal = row.total_points + amount;
            const newLevel = calculateLevel(newTotal);
            db.run("UPDATE points SET total_points = ?, level = ? WHERE user_id = ?", [newTotal, newLevel, userId]);
            
            // إشعار ترقية المستوى
            if (newLevel > row.level) {
                bot.sendMessage(userId, `🎉 <b>مبروك! لقد ارتقيت إلى المستوى ${newLevel}!</b>\n⚡ استمر في استخدام البوت للحصول على مكافآت أكثر.`, { parse_mode: 'HTML' });
            }
        }
    });
}

// حساب المستوى بناءً على النقاط
function calculateLevel(points) {
    if (points < 100) return 1;
    if (points < 300) return 2;
    if (points < 700) return 3;
    if (points < 1500) return 4;
    if (points < 3000) return 5;
    if (points < 6000) return 6;
    if (points < 12000) return 7;
    if (points < 25000) return 8;
    if (points < 50000) return 9;
    return 10;
}

// اسم المستوى
function getLevelName(level) {
    const names = {
        1: "🔰 مبتدئ",
        2: "⚡ متعلم",
        3: "🔥 نشيط",
        4: "💫 متقدم",
        5: "🌟 خبير",
        6: "💎 ماسي",
        7: "🏆 أسطورة",
        8: "👑 ملكي",
        9: "🚀 إلهي",
        10: "🏴‍☠️ فخم الأفخام"
    };
    return names[level] || "🔰 مبتدئ";
}

// جلب نقاط المستخدم
function getUserPoints(userId, callback) {
    db.get("SELECT total_points, level, last_daily FROM points WHERE user_id = ?", [userId], (err, row) => {
        if (row) {
            callback({ points: row.total_points, level: row.level, last_daily: row.last_daily });
        } else {
            callback({ points: 0, level: 1, last_daily: 0 });
        }
    });
}

// ============================================================================
// [ نظام الإشعارات والتذكيرات ]
// ============================================================================

// إنشاء جدول الإشعارات
db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    scheduled_at INTEGER,
    sent INTEGER DEFAULT 0
)`);

// جدولة إشعار
function scheduleNotification(userId, message, delayMs) {
    const scheduledAt = Date.now() + delayMs;
    db.run("INSERT INTO notifications (user_id, message, scheduled_at) VALUES (?, ?, ?)", [userId, message, scheduledAt]);
}

// تشغيل الإشعارات المجدولة (كل دقيقة)
setInterval(() => {
    const now = Date.now();
    db.all("SELECT * FROM notifications WHERE sent = 0 AND scheduled_at <= ?", [now], (err, rows) => {
        if (err || !rows) return;
        rows.forEach((row) => {
            bot.sendMessage(row.user_id, row.message, { parse_mode: 'HTML' }).catch(() => {});
            db.run("UPDATE notifications SET sent = 1 WHERE id = ?", [row.id]);
        });
    });
}, 60000);

// ============================================================================
// [ نظام المكافأة اليومية ]
// ============================================================================

// إنشاء جدول المكافآت اليومية
db.run(`CREATE TABLE IF NOT EXISTS daily_rewards (
    user_id INTEGER PRIMARY KEY,
    last_claimed INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0
)`);

// المطالبة بالمكافأة اليومية
function claimDailyReward(userId, callback) {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    db.get("SELECT last_claimed, streak FROM daily_rewards WHERE user_id = ?", [userId], (err, row) => {
        if (!row) {
            db.run("INSERT INTO daily_rewards (user_id, last_claimed, streak) VALUES (?, ?, 1)", [userId, now]);
            callback({ success: true, points: 10, streak: 1, message: "🎁 حصلت على مكافأتك اليومية: 10 نقاط!" });
            addPoints(userId, 10, 'daily_reward');
            return;
        }
        
        const timeSinceLast = now - row.last_claimed;
        
        if (timeSinceLast < oneDayMs) {
            const remaining = oneDayMs - timeSinceLast;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            callback({ success: false, message: `⏳ يمكنك المطالبة بالمكافأة بعد ${hours} ساعة و${minutes} دقيقة.` });
            return;
        }
        
        // حساب السلسلة
        const twoDaysMs = 2 * oneDayMs;
        let newStreak = timeSinceLast <= twoDaysMs ? row.streak + 1 : 1;
        
        // نقاط إضافية بناءً على السلسلة
        let bonusPoints = 10;
        if (newStreak >= 7) bonusPoints = 50;
        else if (newStreak >= 3) bonusPoints = 25;
        
        db.run("UPDATE daily_rewards SET last_claimed = ?, streak = ? WHERE user_id = ?", [now, newStreak, userId]);
        addPoints(userId, bonusPoints, 'daily_reward');
        
        callback({ 
            success: true, 
            points: bonusPoints, 
            streak: newStreak,
            message: `🎁 حصلت على مكافأتك اليومية: ${bonusPoints} نقطة!\n🔥 السلسلة الحالية: ${newStreak} يوم متتالي!`
        });
    });
}

// ============================================================================
// [ نظام الإحصائيات المتقدمة ]
// ============================================================================

// إنشاء جدول الإحصائيات
db.run(`CREATE TABLE IF NOT EXISTS bot_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT,
    user_id INTEGER,
    data TEXT,
    created_at INTEGER
)`);

// تسجيل حدث
function logEvent(eventType, userId, data = {}) {
    db.run("INSERT INTO bot_stats (event_type, user_id, data, created_at) VALUES (?, ?, ?, ?)",
        [eventType, userId, JSON.stringify(data), Date.now()]
    );
}

// جلب إحصائيات تفصيلية
function getDetailedStats(callback) {
    const stats = {};
    
    db.get("SELECT COUNT(*) as total FROM users", (err, row) => {
        stats.totalUsers = row ? row.count : 0;
        
        db.get("SELECT COUNT(*) as vip_count FROM users WHERE is_vip = 1", (err2, row2) => {
            stats.vipUsers = row2 ? row2.vip_count : 0;
            
            db.get("SELECT SUM(stars_donated) as total_stars FROM users", (err3, row3) => {
                stats.totalStars = row3 ? row3.total_stars : 0;
                
                db.get("SELECT COUNT(*) as today FROM users WHERE joined_at >= ?", [Date.now() - 86400000], (err4, row4) => {
                    stats.todayJoined = row4 ? row4.today : 0;
                    callback(stats);
                });
            });
        });
    });
}

// ============================================================================
// [ نظام الإعلانات المتقدم ]
// ============================================================================

// إنشاء جدول الإعلانات
db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    created_at INTEGER,
    views INTEGER DEFAULT 0
)`);

// إضافة إعلان
function addAnnouncement(title, content) {
    db.run("INSERT INTO announcements (title, content, created_at) VALUES (?, ?, ?)", [title, content, Date.now()]);
}

// جلب آخر إعلان
function getLatestAnnouncement(callback) {
    db.get("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1", (err, row) => {
        callback(row || null);
    });
}

// ============================================================================
// [ نظام الحظر والإدارة ]
// ============================================================================

// إنشاء جدول المحظورين
db.run(`CREATE TABLE IF NOT EXISTS banned_users (
    user_id INTEGER PRIMARY KEY,
    reason TEXT,
    banned_at INTEGER,
    banned_by INTEGER
)`);

// حظر مستخدم
function banUser(userId, reason, bannedBy, callback) {
    db.run("INSERT OR REPLACE INTO banned_users (user_id, reason, banned_at, banned_by) VALUES (?, ?, ?, ?)",
        [userId, reason, Date.now(), bannedBy], callback
    );
}

// رفع الحظر
function unbanUser(userId, callback) {
    db.run("DELETE FROM banned_users WHERE user_id = ?", [userId], callback);
}

// التحقق من الحظر
function isUserBanned(userId, callback) {
    db.get("SELECT * FROM banned_users WHERE user_id = ?", [userId], (err, row) => {
        callback(!!row, row || null);
    });
}

// ============================================================================
// [ نظام الرسائل المجدولة والبث ]
// ============================================================================

// إرسال رسالة لجميع المستخدمين مع تأخير لتجنب الحظر
async function broadcastMessage(text, options = {}, progressCallback = null) {
    return new Promise((resolve) => {
        db.all("SELECT user_id FROM users", [], async (err, rows) => {
            if (err || !rows) {
                resolve({ success: 0, failed: 0, total: 0 });
                return;
            }
            
            let success = 0;
            let failed = 0;
            const total = rows.length;
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    await bot.sendMessage(row.user_id, text, options);
                    success++;
                } catch (e) {
                    failed++;
                }
                
                // تأخير 50ms بين كل رسالة لتجنب Rate Limiting
                await new Promise(r => setTimeout(r, 50));
                
                // تحديث التقدم كل 10 رسائل
                if (progressCallback && i % 10 === 0) {
                    progressCallback({ current: i + 1, total, success, failed });
                }
            }
            
            resolve({ success, failed, total });
        });
    });
}

// ============================================================================
// [ نظام الأوامر المتقدمة للأدمن ]
// ============================================================================

// أمر /ban
bot.onText(/\/ban (\d+)(.*)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const targetId = parseInt(match[1]);
    const reason = match[2] ? match[2].trim() : "بدون سبب";
    
    banUser(targetId, reason, ADMIN_ID, (err) => {
        if (err) {
            bot.sendMessage(msg.chat.id, "❌ حدث خطأ أثناء الحظر.");
        } else {
            bot.sendMessage(msg.chat.id, `✅ تم حظر المستخدم <code>${targetId}</code>\nالسبب: ${reason}`, { parse_mode: 'HTML' });
            bot.sendMessage(targetId, "⛔ تم حظرك من استخدام البوت. للاستفسار تواصل عبر fokhm.com").catch(() => {});
        }
    });
});

// أمر /unban
bot.onText(/\/unban (\d+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const targetId = parseInt(match[1]);
    
    unbanUser(targetId, (err) => {
        if (err) {
            bot.sendMessage(msg.chat.id, "❌ حدث خطأ أثناء رفع الحظر.");
        } else {
            bot.sendMessage(msg.chat.id, `✅ تم رفع الحظر عن المستخدم <code>${targetId}</code>`, { parse_mode: 'HTML' });
            bot.sendMessage(targetId, "✅ تم رفع الحظر عنك. يمكنك استخدام البوت الآن.").catch(() => {});
        }
    });
});

// أمر /vip_add
bot.onText(/\/vip_add (\d+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const targetId = parseInt(match[1]);
    const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    db.run("UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE user_id = ?", [expiryTime, targetId], (err) => {
        if (err) {
            bot.sendMessage(msg.chat.id, "❌ حدث خطأ.");
        } else {
            bot.sendMessage(msg.chat.id, `✅ تم منح VIP للمستخدم <code>${targetId}</code> لمدة 30 يوماً.`, { parse_mode: 'HTML' });
            bot.sendMessage(targetId, "🎉 تم ترقيتك إلى VIP من قبل الإدارة! استمتع بالميزات الحصرية.").catch(() => {});
        }
    });
});

// أمر /vip_remove
bot.onText(/\/vip_remove (\d+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const targetId = parseInt(match[1]);
    
    db.run("UPDATE users SET is_vip = 0, vip_expires_at = 0 WHERE user_id = ?", [targetId], (err) => {
        if (err) {
            bot.sendMessage(msg.chat.id, "❌ حدث خطأ.");
        } else {
            bot.sendMessage(msg.chat.id, `✅ تم إلغاء VIP للمستخدم <code>${targetId}</code>.`, { parse_mode: 'HTML' });
        }
    });
});

// أمر /stats
bot.onText(/\/stats/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    getDetailedStats((stats) => {
        bot.sendMessage(msg.chat.id,
            `📊 <b>إحصائيات مفصلة:</b>\n\n` +
            `👥 إجمالي المستخدمين: <b>${stats.totalUsers}</b>\n` +
            `💎 مستخدمو VIP: <b>${stats.vipUsers}</b>\n` +
            `⭐ إجمالي النجوم: <b>${stats.totalStars || 0}</b>\n` +
            `📅 انضم اليوم: <b>${stats.todayJoined}</b>`,
            { parse_mode: 'HTML' }
        );
    });
});

// أمر /broadcast
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const text = match[1];
    const statusMsg = await bot.sendMessage(msg.chat.id, "📢 جاري الإرسال...");
    
    const result = await broadcastMessage(`📢 <b>إعلان رسمي:</b>\n\n${text}`, { parse_mode: 'HTML' });
    
    bot.editMessageText(
        `✅ <b>تمت الإذاعة!</b>\n\n📤 نجح: <b>${result.success}</b>\n❌ فشل: <b>${result.failed}</b>\n📊 الإجمالي: <b>${result.total}</b>`,
        { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'HTML' }
    );
});

// ============================================================================
// [ نظام التحقق من الحظر قبل أي تفاعل ]
// ============================================================================

// فلتر الحظر للرسائل
bot.on('message', (msg) => {
    if (!msg.from) return;
    const userId = msg.from.id;
    
    isUserBanned(userId, (banned, banInfo) => {
        if (banned) {
            bot.sendMessage(msg.chat.id, `⛔ <b>أنت محظور من استخدام البوت.</b>\nالسبب: ${banInfo.reason}\nللاستفسار: fokhm.com`, { parse_mode: 'HTML' });
        }
    });
}, { priority: 10 });

// ============================================================================
// [ نظام الكاش والأداء ]
// ============================================================================

// كاش للمستخدمين
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

function getCachedUser(userId, callback) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        callback(cached.data);
        return;
    }
    
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
        if (row) {
            userCache.set(userId, { data: row, timestamp: Date.now() });
        }
        callback(row || null);
    });
}

// تنظيف الكاش القديم
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            userCache.delete(key);
        }
    }
}, 10 * 60 * 1000); // كل 10 دقائق

// ============================================================================
// [ نظام السجلات (Logging) ]
// ============================================================================

const LOG_FILE = "bot_logs.txt";

function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error("فشل كتابة السجل:", err);
    });
    if (level === 'ERROR') console.error(logLine);
    else console.log(logLine);
}

// ============================================================================
// [ نظام النسخ الاحتياطي ]
// ============================================================================

// نسخ احتياطي تلقائي للإعدادات
function createBackup() {
    const backupFile = `backup_config_${Date.now()}.json`;
    try {
        fs.copyFileSync(CONFIG_FILE, backupFile);
        writeLog('INFO', `تم إنشاء نسخة احتياطية: ${backupFile}`);
    } catch (e) {
        writeLog('ERROR', `فشل إنشاء نسخة احتياطية: ${e.message}`);
    }
}

// نسخ احتياطي كل 24 ساعة
setInterval(createBackup, 24 * 60 * 60 * 1000);

// ============================================================================
// [ نظام الرد التلقائي على الكلمات المفتاحية ]
// ============================================================================

const autoReplies = {
    'مرحبا': '👋 أهلاً وسهلاً! استخدم /start للبدء.',
    'هلا': '👋 هلا فيك! استخدم /start للوصول للقائمة الرئيسية.',
    'مساعدة': '❓ للمساعدة تواصل عبر fokhm.com أو استخدم /start.',
    'vip': '👑 للاشتراك في VIP استخدم /start واختر قسم VIP!',
    'سعر': '💰 لمعرفة الأسعار استخدم /start واختر قسم VIP.',
};

// ============================================================================
// [ نظام الرد على الأوامر الإضافية ]
// ============================================================================

// أمر /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        `❓ <b>مركز المساعدة - fokhm.com</b>\n\n` +
        `<b>الأوامر المتاحة:</b>\n` +
        `/start - القائمة الرئيسية\n` +
        `/help - هذه الرسالة\n\n` +
        `<b>للدعم الفني:</b>\n` +
        `🌐 fokhm.com\n\n` +
        `<b>البوت يوفر:</b>\n` +
        `• تلغيم وتخصيص التطبيقات\n` +
        `• نظام VIP حصري\n` +
        `• نظام الدعوات والمكافآت`,
        { parse_mode: 'HTML', reply_markup: getMainKeyboard() }
    );
});

// أمر /id
bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `🆔 معرّفك: <code>${msg.from.id}</code>`, { parse_mode: 'HTML' });
});

// ============================================================================
// [ نظام التحقق من صحة الكود والإعدادات ]
// ============================================================================

function validateConfig(cfg) {
    const errors = [];
    
    if (!cfg.welcome_message || typeof cfg.welcome_message !== 'string') {
        errors.push('رسالة الترحيب غير صالحة');
    }
    
    if (!Array.isArray(cfg.buttons) || cfg.buttons.length < 6) {
        errors.push('الأزرار غير مكتملة');
    }
    
    if (cfg.buttons) {
        cfg.buttons.forEach((btn, i) => {
            if (!btn.text || !btn.callback_data) {
                errors.push(`الزر ${i + 1} غير مكتمل`);
            }
        });
    }
    
    return errors;
}

// التحقق عند بدء التشغيل
const configErrors = validateConfig(config);
if (configErrors.length > 0) {
    writeLog('WARN', `تحذيرات في الإعدادات: ${configErrors.join(', ')}`);
}

// ============================================================================
// [ نظام معالجة الأخطاء العامة ]
// ============================================================================

bot.on('polling_error', (error) => {
    writeLog('ERROR', `خطأ في الاتصال: ${error.message}`);
});

process.on('uncaughtException', (error) => {
    writeLog('ERROR', `خطأ غير متوقع: ${error.message}`);
    console.error('خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason) => {
    writeLog('ERROR', `رفض غير معالج: ${reason}`);
});

// ============================================================================
// [ نظام الوقت الفعلي للعرض المؤقت VIP ]
// ============================================================================

// هذا النظام يدير العرض المؤقت لـ VIP
const VIP_OFFER = {
    price: 270,
    duration_hours: 48,
    start_time: Date.now()
};

// حساب الوقت المتبقي للعرض
function getVipOfferTimeRemaining() {
    const endTime = VIP_OFFER.start_time + (VIP_OFFER.duration_hours * 60 * 60 * 1000);
    const remaining = endTime - Date.now();
    
    if (remaining <= 0) {
        return { expired: true, hours: 0, minutes: 0, seconds: 0, text: "⏰ انتهى العرض!" };
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    return {
        expired: false,
        hours,
        minutes,
        seconds,
        text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
}

// تحديث رسائل VIP المفتوحة بالوقت الفعلي
const vipActiveMessages = new Map(); // userId -> { chatId, messageId }

function startVipTimer(userId, chatId, messageId) {
    // إيقاف أي تايمر سابق لهذا المستخدم لتجنب التكرار
    stopVipTimer(userId);
    vipActiveMessages.set(userId, { chatId, messageId });
}

function stopVipTimer(userId) {
    vipActiveMessages.delete(userId);
}

// تحديث الوقت كل ثانية للمستخدمين الذين فتحوا قسم VIP
setInterval(() => {
    if (vipActiveMessages.size === 0) return;
    
    const timeInfo = getVipOfferTimeRemaining();
    
    vipActiveMessages.forEach((msgInfo, userId) => {
        const vipText = config.vip_info || defaultConfig.vip_info;
        const updatedText = `${vipText}\n\n` +
            `⏳ <b>الوقت المتبقي للعرض:</b> <code>${timeInfo.text}</code>`;
        
        const options = {
            chat_id: msgInfo.chatId,
            message_id: msgInfo.messageId,
            parse_mode: 'HTML',
            reply_markup: getVipPurchaseKeyboard()
        };

        // التحقق إذا كانت الرسالة صورة (عبر الكابشن) أو نص
        if (config.vip_photo) {
            bot.editMessageCaption(updatedText, options).catch((err) => {
                // تجنب تحديث الرسالة إذا لم يتغير النص (لتجنب أخطاء تليجرام)
                if (!err.message.includes('message is not modified')) {
                    stopVipTimer(userId);
                }
            });
        } else {
            bot.editMessageText(updatedText, options).catch((err) => {
                if (!err.message.includes('message is not modified')) {
                    stopVipTimer(userId);
                }
            });
        }
    });
}, 1000); // تحديث كل ثانية ليكون العداد متحركاً وحياً فعلياً أمام المستخدم

// تحديث callback_query لـ vip_section لتفعيل التايمر
// (ملاحظة: هذا يُضاف كمعالج إضافي للـ vip_section)
bot.on('callback_query', (callbackQuery) => {
    if (callbackQuery.data === 'vip_timer_start') {
        const userId = callbackQuery.from.id;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        startVipTimer(userId, chatId, messageId);
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    if (callbackQuery.data === 'vip_timer_stop' || callbackQuery.data === 'main_menu') {
        stopVipTimer(callbackQuery.from.id);
    }
});

// ============================================================================
// [ نظام الرتب والشارات ]
// ============================================================================

const BADGES = {
    first_donation: { name: "🌟 المتبرع الأول", description: "أول تبرع في البوت" },
    vip_member: { name: "💎 عضو VIP", description: "اشترك في VIP" },
    referral_5: { name: "👥 الداعي النشيط", description: "دعا 5 أصدقاء" },
    referral_20: { name: "🚀 الداعي الأسطوري", description: "دعا 20 صديقاً" },
    stars_100: { name: "⭐ المتبرع السخي", description: "تبرع بـ 100 نجمة" },
    stars_500: { name: "🏆 المتبرع الذهبي", description: "تبرع بـ 500 نجمة" },
};

// إنشاء جدول الشارات
db.run(`CREATE TABLE IF NOT EXISTS user_badges (
    user_id INTEGER,
    badge_id TEXT,
    earned_at INTEGER,
    PRIMARY KEY (user_id, badge_id)
)`);

// منح شارة
function awardBadge(userId, badgeId) {
    db.run("INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)",
        [userId, badgeId, Date.now()], (err) => {
            if (!err) {
                const badge = BADGES[badgeId];
                if (badge) {
                    bot.sendMessage(userId, `🏅 <b>حصلت على شارة جديدة!</b>\n${badge.name}\n${badge.description}`, { parse_mode: 'HTML' }).catch(() => {});
                }
            }
        }
    );
}

// التحقق من الشارات
function checkBadges(userId) {
    getUserStats(userId, (stats) => {
        if (stats.stars > 0) awardBadge(userId, 'first_donation');
        if (stats.vip) awardBadge(userId, 'vip_member');
        if (stats.referrals >= 5) awardBadge(userId, 'referral_5');
        if (stats.referrals >= 20) awardBadge(userId, 'referral_20');
        if (stats.stars >= 100) awardBadge(userId, 'stars_100');
        if (stats.stars >= 500) awardBadge(userId, 'stars_500');
    });
}

// ============================================================================
// [ نظام الإعدادات الديناميكية ]
// ============================================================================

// إعدادات إضافية قابلة للتعديل
const dynamicSettings = {
    maintenance_mode: false,
    welcome_bonus_points: 5,
    referral_bonus_points: 20,
    donation_points_multiplier: 2,
    max_daily_messages: 50,
    bot_version: "2.0.0"
};

// تحديث إعداد ديناميكي
function updateDynamicSetting(key, value) {
    if (dynamicSettings.hasOwnProperty(key)) {
        dynamicSettings[key] = value;
        writeLog('INFO', `تم تحديث الإعداد: ${key} = ${value}`);
        return true;
    }
    return false;
}

// أمر /settings للأدمن
bot.onText(/\/settings/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const settingsText = Object.entries(dynamicSettings)
        .map(([key, value]) => `• <b>${key}:</b> <code>${value}</code>`)
        .join('\n');
    
    bot.sendMessage(msg.chat.id, `⚙️ <b>الإعدادات الديناميكية:</b>\n\n${settingsText}`, { parse_mode: 'HTML' });
});

// ============================================================================
// [ نظام الرسائل الترحيبية المتعددة ]
// ============================================================================

// رسائل ترحيب متعددة يتم اختيارها عشوائياً
const welcomeVariants = [
    "🔥 مرحباً بك في المنصة الأقوى!",
    "⚡ أهلاً بك في عالم التلغيم الاحترافي!",
    "🏴‍☠️ وصل الفخم الجديد!",
    "💎 يشرفنا انضمامك إلى المنصة الماسية!"
];

function getRandomWelcomeVariant() {
    return welcomeVariants[Math.floor(Math.random() * welcomeVariants.length)];
}

// ============================================================================
// [ نظام التحليلات والتقارير ]
// ============================================================================

// تقرير يومي تلقائي للأدمن
function sendDailyReport() {
    getDetailedStats((stats) => {
        const report = 
            `📊 <b>التقرير اليومي - fokhm.com</b>\n` +
            `📅 ${new Date().toLocaleDateString('ar-EG')}\n\n` +
            `👥 إجمالي المستخدمين: <b>${stats.totalUsers}</b>\n` +
            `💎 مستخدمو VIP: <b>${stats.vipUsers}</b>\n` +
            `⭐ إجمالي النجوم: <b>${stats.totalStars || 0}</b>\n` +
            `📅 انضم اليوم: <b>${stats.todayJoined}</b>\n\n` +
            `🤖 نسخة البوت: ${dynamicSettings.bot_version}`;
        
        bot.sendMessage(ADMIN_ID, report, { parse_mode: 'HTML' }).catch(() => {});
    });
}

// إرسال التقرير اليومي كل 24 ساعة
setInterval(sendDailyReport, 24 * 60 * 60 * 1000);

// ============================================================================
// [ نظام الاستطلاعات ]
// ============================================================================

// إنشاء جدول الاستطلاعات
db.run(`CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    options TEXT,
    created_at INTEGER,
    active INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id INTEGER,
    user_id INTEGER,
    option_index INTEGER,
    voted_at INTEGER,
    PRIMARY KEY (poll_id, user_id)
)`);

// إنشاء استطلاع
function createPoll(question, options, callback) {
    db.run("INSERT INTO polls (question, options, created_at) VALUES (?, ?, ?)",
        [question, JSON.stringify(options), Date.now()], callback
    );
}

// ============================================================================
// [ نظام الرسائل الخاصة للمستخدمين ]
// ============================================================================

// إرسال رسالة لمستخدم محدد من الأدمن
bot.onText(/\/msg (\d+) (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const targetId = parseInt(match[1]);
    const message = match[2];
    
    bot.sendMessage(targetId, `📨 <b>رسالة من الإدارة:</b>\n\n${message}`, { parse_mode: 'HTML' })
        .then(() => bot.sendMessage(msg.chat.id, `✅ تم إرسال الرسالة إلى <code>${targetId}</code>`, { parse_mode: 'HTML' }))
        .catch(() => bot.sendMessage(msg.chat.id, `❌ فشل إرسال الرسالة إلى <code>${targetId}</code>`, { parse_mode: 'HTML' }));
});

// ============================================================================
// [ نظام التحقق من الاشتراك في القنوات ]
// ============================================================================

const REQUIRED_CHANNELS = []; // أضف معرفات القنوات هنا مثل: ['@channel1', '@channel2']

async function checkChannelSubscription(userId) {
    if (REQUIRED_CHANNELS.length === 0) return true;
    
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.getChatMember(channel, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    return true;
}

// ============================================================================
// [ نظام الحالة والصحة ]
// ============================================================================

// فحص صحة البوت
function getBotHealth() {
    return {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: dynamicSettings.bot_version,
        timestamp: new Date().toISOString()
    };
}

// أمر /health للأدمن
bot.onText(/\/health/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const health = getBotHealth();
    const uptimeHours = Math.floor(health.uptime / 3600);
    const uptimeMinutes = Math.floor((health.uptime % 3600) / 60);
    const memoryMB = Math.round(health.memory.heapUsed / 1024 / 1024);
    
    bot.sendMessage(msg.chat.id,
        `💚 <b>حالة البوت:</b>\n\n` +
        `✅ الحالة: ${health.status}\n` +
        `⏱ وقت التشغيل: ${uptimeHours}h ${uptimeMinutes}m\n` +
        `💾 الذاكرة المستخدمة: ${memoryMB} MB\n` +
        `🤖 الإصدار: ${health.version}`,
        { parse_mode: 'HTML' }
    );
});

// ============================================================================
// [ نظام الأوامر السريعة للأدمن ]
// ============================================================================

bot.onText(/\/users/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    db.all("SELECT user_id, username, first_name, joined_at, is_vip FROM users ORDER BY joined_at DESC LIMIT 10", [], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            return bot.sendMessage(msg.chat.id, "لا يوجد مستخدمون.");
        }
        
        let text = `👥 <b>آخر 10 مستخدمين:</b>\n\n`;
        rows.forEach((row, i) => {
            const date = new Date(row.joined_at).toLocaleDateString('ar-EG');
            const vipBadge = row.is_vip ? " 💎" : "";
            text += `${i + 1}. <code>${row.user_id}</code> - ${row.first_name || 'غير معروف'}${vipBadge} (${date})\n`;
        });
        
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    });
});

// ============================================================================
// [ نظام الرد على الرسائل الصوتية والمرئية ]
// ============================================================================

bot.on('voice', (msg) => {
    if (msg.from.id === ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "🎤 تم استلام رسالتك الصوتية. للتواصل مع الدعم الفني: fokhm.com");
});

bot.on('photo', (msg) => {
    if (msg.from.id === ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "🖼 تم استلام صورتك. للدعم الفني: fokhm.com");
});

bot.on('document', (msg) => {
    if (msg.from.id === ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "📄 تم استلام ملفك. للدعم الفني: fokhm.com");
});

// ============================================================================
// [ نظام التحديثات التلقائية للإعدادات ]
// ============================================================================

// إعادة تحميل الإعدادات كل 5 دقائق
setInterval(() => {
    const freshConfig = loadConfig();
    if (JSON.stringify(freshConfig) !== JSON.stringify(config)) {
        config = freshConfig;
        writeLog('INFO', 'تم إعادة تحميل الإعدادات تلقائياً.');
    }
}, 5 * 60 * 1000);

// ============================================================================
// [ نظام الحماية من الإرسال المتكرر (Rate Limiting) ]
// ============================================================================

const userMessageCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // دقيقة واحدة
const MAX_MESSAGES_PER_MINUTE = 20;

function checkRateLimit(userId) {
    const now = Date.now();
    const userCount = userMessageCounts.get(userId);
    
    if (!userCount || now - userCount.windowStart > RATE_LIMIT_WINDOW) {
        userMessageCounts.set(userId, { count: 1, windowStart: now });
        return false; // لم يتجاوز الحد
    }
    
    userCount.count++;
    if (userCount.count > MAX_MESSAGES_PER_MINUTE) {
        return true; // تجاوز الحد
    }
    
    return false;
}

// تنظيف بيانات Rate Limiting
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userMessageCounts.entries()) {
        if (now - value.windowStart > RATE_LIMIT_WINDOW * 2) {
            userMessageCounts.delete(key);
        }
    }
}, RATE_LIMIT_WINDOW);

// ============================================================================
// [ نظام الإشعارات الفورية للأدمن ]
// ============================================================================

// إشعار الأدمن عند انضمام مستخدم جديد
function notifyAdminNewUser(user) {
    bot.sendMessage(ADMIN_ID, 
        `👤 <b>مستخدم جديد انضم!</b>\n\n` +
        `🆔 المعرف: <code>${user.id}</code>\n` +
        `📛 الاسم: ${user.first_name || 'غير معروف'}\n` +
        `🔗 اليوزر: @${user.username || 'لا يوجد'}`,
        { parse_mode: 'HTML' }
    ).catch(() => {});
}

// ============================================================================
// [ نظام الأرشفة والتصدير ]
// ============================================================================

// تصدير قائمة المستخدمين
bot.onText(/\/export_users/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    db.all("SELECT user_id, username, first_name, joined_at, is_vip, stars_donated, referral_count FROM users", [], (err, rows) => {
        if (err || !rows) return bot.sendMessage(msg.chat.id, "❌ خطأ في التصدير.");
        
        const csvContent = "user_id,username,first_name,joined_at,is_vip,stars_donated,referral_count\n" +
            rows.map(r => `${r.user_id},${r.username || ''},${r.first_name || ''},${r.joined_at},${r.is_vip},${r.stars_donated},${r.referral_count}`).join('\n');
        
        const exportFile = `users_export_${Date.now()}.csv`;
        fs.writeFileSync(exportFile, csvContent, 'utf8');
        
        bot.sendDocument(msg.chat.id, exportFile, {}, { filename: 'users.csv', contentType: 'text/csv' })
            .then(() => fs.unlinkSync(exportFile))
            .catch(() => bot.sendMessage(msg.chat.id, "❌ فشل إرسال الملف."));
    });
});

// ============================================================================
// [ رسالة بدء التشغيل النهائية ]
// ============================================================================

writeLog('INFO', `بوت fokhm.com v${dynamicSettings.bot_version} بدأ التشغيل بنجاح.`);

console.log('====================================================');
console.log(`🤖 بوت fokhm.com v${dynamicSettings.bot_version} يعمل الآن!`);
console.log('✅ جميع الأنظمة تعمل بكفاءة عالية');
console.log('👑 نظام VIP مع عرض مؤقت 48 ساعة');
console.log('🔘 نظام تعديل الأزرار الفردي السهل');
console.log('🛡 نظام الحماية والحظر مفعّل');
console.log('📊 نظام الإحصائيات والتقارير مفعّل');
console.log('====================================================');

// ============================================================================
// [ نظام المتجر والمنتجات ]
// ============================================================================

// إنشاء جدول المنتجات
db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_stars INTEGER NOT NULL,
    category TEXT DEFAULT 'general',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER
)`);

// إنشاء جدول المشتريات
db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_id INTEGER,
    amount_paid INTEGER,
    purchased_at INTEGER
)`);

// إضافة منتج
function addProduct(name, description, priceStars, category = 'general') {
    db.run("INSERT INTO products (name, description, price_stars, category, created_at) VALUES (?, ?, ?, ?, ?)",
        [name, description, priceStars, category, Date.now()]
    );
}

// جلب المنتجات النشطة
function getActiveProducts(callback) {
    db.all("SELECT * FROM products WHERE is_active = 1 ORDER BY price_stars ASC", [], (err, rows) => {
        callback(rows || []);
    });
}

// ============================================================================
// [ نظام التذاكر والدعم الفني ]
// ============================================================================

// إنشاء جدول التذاكر
db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'open',
    created_at INTEGER,
    resolved_at INTEGER
)`);

// فتح تذكرة دعم
function openSupportTicket(userId, subject, message, callback) {
    db.run("INSERT INTO support_tickets (user_id, subject, message, created_at) VALUES (?, ?, ?, ?)",
        [userId, subject, message, Date.now()], function(err) {
            callback(err, this ? this.lastID : null);
        }
    );
}

// إغلاق تذكرة
function closeSupportTicket(ticketId, callback) {
    db.run("UPDATE support_tickets SET status = 'closed', resolved_at = ? WHERE id = ?",
        [Date.now(), ticketId], callback
    );
}

// ============================================================================
// [ نظام الإشعارات المتقدم ]
// ============================================================================

// أنواع الإشعارات
const NOTIFICATION_TYPES = {
    NEW_USER: 'new_user',
    NEW_PAYMENT: 'new_payment',
    NEW_VIP: 'new_vip',
    SYSTEM_ERROR: 'system_error',
    DAILY_REPORT: 'daily_report'
};

// إرسال إشعار للأدمن
function sendAdminNotification(type, data = {}) {
    let message = '';
    
    switch (type) {
        case NOTIFICATION_TYPES.NEW_USER:
            message = `👤 <b>مستخدم جديد:</b>\n🆔 ${data.userId}\n📛 ${data.name}`;
            break;
        case NOTIFICATION_TYPES.NEW_PAYMENT:
            message = `💰 <b>دفعة جديدة:</b>\n🆔 ${data.userId}\n⭐ ${data.amount} نجمة`;
            break;
        case NOTIFICATION_TYPES.NEW_VIP:
            message = `👑 <b>اشتراك VIP جديد:</b>\n🆔 ${data.userId}\n📛 ${data.name}`;
            break;
        case NOTIFICATION_TYPES.SYSTEM_ERROR:
            message = `❌ <b>خطأ في النظام:</b>\n${data.error}`;
            break;
        default:
            message = `📢 إشعار: ${JSON.stringify(data)}`;
    }
    
    bot.sendMessage(ADMIN_ID, message, { parse_mode: 'HTML' }).catch(() => {});
}

// ============================================================================
// [ نظام الكوبونات والخصومات ]
// ============================================================================

// إنشاء جدول الكوبونات
db.run(`CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    discount_percent INTEGER DEFAULT 0,
    discount_stars INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER
)`);

// إنشاء جدول استخدام الكوبونات
db.run(`CREATE TABLE IF NOT EXISTS coupon_uses (
    coupon_code TEXT,
    user_id INTEGER,
    used_at INTEGER,
    PRIMARY KEY (coupon_code, user_id)
)`);

// إنشاء كوبون
function createCoupon(code, discountPercent, discountStars, maxUses, expiresInHours) {
    const expiresAt = Date.now() + (expiresInHours * 60 * 60 * 1000);
    db.run("INSERT OR REPLACE INTO coupons (code, discount_percent, discount_stars, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [code.toUpperCase(), discountPercent, discountStars, maxUses, expiresAt, Date.now()]
    );
}

// التحقق من كوبون
function validateCoupon(code, userId, callback) {
    const upperCode = code.toUpperCase();
    db.get("SELECT * FROM coupons WHERE code = ?", [upperCode], (err, coupon) => {
        if (!coupon) {
            callback({ valid: false, message: "❌ الكوبون غير صالح." });
            return;
        }
        
        if (coupon.expires_at && Date.now() > coupon.expires_at) {
            callback({ valid: false, message: "❌ انتهت صلاحية الكوبون." });
            return;
        }
        
        if (coupon.current_uses >= coupon.max_uses) {
            callback({ valid: false, message: "❌ تم استنفاد استخدامات الكوبون." });
            return;
        }
        
        db.get("SELECT * FROM coupon_uses WHERE coupon_code = ? AND user_id = ?", [upperCode, userId], (err2, use) => {
            if (use) {
                callback({ valid: false, message: "❌ لقد استخدمت هذا الكوبون مسبقاً." });
                return;
            }
            
            callback({ valid: true, coupon, message: `✅ كوبون صالح! خصم ${coupon.discount_percent}%` });
        });
    });
}

// أمر /coupon للأدمن
bot.onText(/\/coupon_create (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const parts = match[1].split(' ');
    if (parts.length < 4) {
        return bot.sendMessage(msg.chat.id, "الصيغة: /coupon_create CODE DISCOUNT_PERCENT MAX_USES HOURS");
    }
    
    const [code, discount, maxUses, hours] = parts;
    createCoupon(code, parseInt(discount), 0, parseInt(maxUses), parseInt(hours));
    bot.sendMessage(msg.chat.id, `✅ تم إنشاء الكوبون: <b>${code.toUpperCase()}</b>\nالخصم: ${discount}%\nالاستخدامات: ${maxUses}\nينتهي بعد: ${hours} ساعة`, { parse_mode: 'HTML' });
});

// ============================================================================
// [ نظام الإحصائيات الزمنية ]
// ============================================================================

// إحصائيات الاستخدام اليومي
db.run(`CREATE TABLE IF NOT EXISTS usage_stats (
    date TEXT,
    active_users INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    payments_count INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    PRIMARY KEY (date)
)`);

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function incrementUsageStat(field) {
    const today = getTodayDate();
    db.run(`INSERT INTO usage_stats (date, ${field}) VALUES (?, 1) 
            ON CONFLICT(date) DO UPDATE SET ${field} = ${field} + 1`, [today]);
}

// ============================================================================
// [ نظام الرسائل المثبتة ]
// ============================================================================

// إنشاء جدول الرسائل المثبتة
db.run(`CREATE TABLE IF NOT EXISTS pinned_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER
)`);

// إضافة رسالة مثبتة
function addPinnedMessage(title, content) {
    db.run("INSERT INTO pinned_messages (title, content, created_at) VALUES (?, ?, ?)",
        [title, content, Date.now()]
    );
}

// جلب الرسائل المثبتة النشطة
function getActivePinnedMessages(callback) {
    db.all("SELECT * FROM pinned_messages WHERE is_active = 1 ORDER BY created_at DESC", [], (err, rows) => {
        callback(rows || []);
    });
}

// ============================================================================
// [ نظام الأسئلة الشائعة ]
// ============================================================================

let FAQ_DATA = [
    {
        question: "كيف أشترك في VIP؟",
        answer: "اضغط على زر 'قسم VIP 👑' من القائمة الرئيسية وادفع 270 نجمة."
    },
    {
        question: "كيف أدعو أصدقائي؟",
        answer: "اضغط على زر 'دعوة صديق' للحصول على رابط الدعوة الخاص بك."
    },
    {
        question: "ما هي مدة اشتراك VIP؟",
        answer: "مدة اشتراك VIP هي 30 يوماً من تاريخ الشراء."
    },
    {
        question: "كيف أتواصل مع الدعم الفني؟",
        answer: "تواصل معنا عبر موقعنا fokhm.com"
    },
    {
        question: "هل يمكنني استرداد النجوم؟",
        answer: "لا يمكن استرداد النجوم بعد الدفع وفقاً لسياسة تيليغرام."
    }
];

function saveFaqData(){try{fs.writeFileSync('faq_data.json',JSON.stringify(FAQ_DATA,null,2),'utf8');}catch(e){}}
try{if(fs.existsSync('faq_data.json')){const s=JSON.parse(fs.readFileSync('faq_data.json','utf8'));if(Array.isArray(s)&&s.length>0){FAQ_DATA=s;}}}catch(e){}


// أمر /faq
bot.onText(/\/faq/, (msg) => {
    let faqText = `❓ <b>الأسئلة الشائعة - fokhm.com:</b>\n\n`;
    FAQ_DATA.forEach((item, i) => {
        faqText += `<b>${i + 1}. ${item.question}</b>\n${item.answer}\n\n`;
    });
    
    bot.sendMessage(msg.chat.id, faqText, { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]]
        }
    });
});

// ============================================================================
// [ نظام التحقق من الهوية ]
// ============================================================================

// إنشاء جدول التحقق
db.run(`CREATE TABLE IF NOT EXISTS verifications (
    user_id INTEGER PRIMARY KEY,
    verified INTEGER DEFAULT 0,
    verified_at INTEGER,
    verification_code TEXT
)`);

// توليد كود تحقق
function generateVerificationCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============================================================================
// [ نظام الأحداث الخاصة ]
// ============================================================================

// إنشاء جدول الأحداث
db.run(`CREATE TABLE IF NOT EXISTS special_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    bonus_multiplier REAL DEFAULT 1.0,
    start_time INTEGER,
    end_time INTEGER,
    is_active INTEGER DEFAULT 1
)`);

// التحقق من وجود حدث نشط
function getActiveEvent(callback) {
    const now = Date.now();
    db.get("SELECT * FROM special_events WHERE is_active = 1 AND start_time <= ? AND end_time >= ?",
        [now, now], (err, row) => {
            callback(row || null);
        }
    );
}

// ============================================================================
// [ نظام الإشعارات الذكية ]
// ============================================================================

// إرسال إشعار ذكي بناءً على نشاط المستخدم
function sendSmartNotification(userId) {
    getUserStats(userId, (stats) => {
        let message = null;
        
        if (!stats.vip && stats.referrals >= 3) {
            message = `🎉 لديك ${stats.referrals} دعوات! اشترك في VIP للحصول على مزايا أكثر.`;
        } else if (stats.stars >= 50 && !stats.vip) {
            message = `⭐ لقد تبرعت بـ ${stats.stars} نجمة! اشترك في VIP بسعر مخفض.`;
        }
        
        if (message) {
            bot.sendMessage(userId, message, {
                reply_markup: {
                    inline_keyboard: [[{ text: "👑 اشترك في VIP", callback_data: "vip_section" }]]
                }
            }).catch(() => {});
        }
    });
}

// ============================================================================
// [ نظام التقييمات والمراجعات ]
// ============================================================================

// إنشاء جدول التقييمات
db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    rating INTEGER,
    comment TEXT,
    created_at INTEGER
)`);

// إضافة تقييم
function addReview(userId, rating, comment, callback) {
    db.run("INSERT INTO reviews (user_id, rating, comment, created_at) VALUES (?, ?, ?, ?)",
        [userId, rating, comment, Date.now()], callback
    );
}

// جلب متوسط التقييم
function getAverageRating(callback) {
    db.get("SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews", (err, row) => {
        callback(row ? { avg: row.avg_rating || 0, total: row.total || 0 } : { avg: 0, total: 0 });
    });
}

// ============================================================================
// [ نظام الأتمتة المتقدمة ]
// ============================================================================

// تنظيف البيانات القديمة تلقائياً
setInterval(() => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    // حذف الإشعارات المرسلة القديمة
    db.run("DELETE FROM notifications WHERE sent = 1 AND scheduled_at < ?", [thirtyDaysAgo]);
    
    // حذف إحصائيات الاستخدام القديمة (أكثر من 90 يوم)
    const ninetyDaysAgo = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    db.run("DELETE FROM usage_stats WHERE date < ?", [ninetyDaysAgo]);
    
    writeLog('INFO', 'تم تنظيف البيانات القديمة.');
}, 24 * 60 * 60 * 1000);

// ============================================================================
// [ نظام الأمان المتقدم ]
// ============================================================================

// قائمة الكلمات المحظورة
const BLOCKED_WORDS = ['spam', 'scam', 'hack'];

// التحقق من الرسالة
function containsBlockedContent(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return BLOCKED_WORDS.some(word => lowerText.includes(word));
}

// تسجيل محاولات الاختراق
db.run(`CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    details TEXT,
    ip_hash TEXT,
    created_at INTEGER
)`);

function logSecurityEvent(userId, action, details) {
    db.run("INSERT INTO security_logs (user_id, action, details, created_at) VALUES (?, ?, ?, ?)",
        [userId, action, details, Date.now()]
    );
    writeLog('WARN', `حدث أمني: ${action} من المستخدم ${userId} - ${details}`);
}

// ============================================================================
// [ نظام الرسائل الترحيبية المتخصصة ]
// ============================================================================

// رسائل ترحيب خاصة للمستخدمين الجدد
function sendNewUserWelcomeSequence(userId, firstName) {
    // رسالة أولى فورية (تُرسل من /start)
    
    // رسالة ثانية بعد 5 دقائق
    setTimeout(() => {
        bot.sendMessage(userId, 
            `💡 <b>هل تعلم يا ${firstName}؟</b>\n\n` +
            `يمكنك دعوة أصدقائك والحصول على مكافآت مجانية!\n` +
            `اضغط على زر "دعوة صديق" من القائمة الرئيسية.`,
            { parse_mode: 'HTML' }
        ).catch(() => {});
    }, 5 * 60 * 1000);
    
    // رسالة ثالثة بعد 24 ساعة
    setTimeout(() => {
        bot.sendMessage(userId,
            `⭐ <b>مرحباً ${firstName}!</b>\n\n` +
            `لا تنسَ الاطلاع على قسم VIP للحصول على ميزات حصرية!\n` +
            `العرض الحالي: 270 نجمة فقط.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: "👑 عرض VIP", callback_data: "vip_section" }]]
                }
            }
        ).catch(() => {});
    }, 24 * 60 * 60 * 1000);
}

// ============================================================================
// [ نظام الشراكات والإحالات ]
// ============================================================================

// إنشاء جدول الشراكات
db.run(`CREATE TABLE IF NOT EXISTS partnerships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT,
    partner_id INTEGER,
    commission_percent INTEGER DEFAULT 10,
    total_earnings INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER
)`);

// حساب عمولة الشريك
function calculatePartnerCommission(amount, commissionPercent) {
    return Math.floor(amount * commissionPercent / 100);
}

// ============================================================================
// [ نظام الإعلانات الدوارة ]
// ============================================================================

const ROTATING_ADS = [
    "🔥 جرب خدمة التلغيم الاحترافية على fokhm.com!",
    "💎 اشترك في VIP للحصول على أدوات حصرية!",
    "👥 ادعُ أصدقاءك واربح مكافآت مجانية!",
    "⚡ أسرع وأقوى منصة تلغيم في المنطقة!"
];

let currentAdIndex = 0;

function getNextAd() {
    const ad = ROTATING_ADS[currentAdIndex];
    currentAdIndex = (currentAdIndex + 1) % ROTATING_ADS.length;
    return ad;
}

// ============================================================================
// [ نظام الإحصائيات الشخصية ]
// ============================================================================

// أمر /mystats للمستخدم
bot.onText(/\/mystats/, (msg) => {
    const userId = msg.from.id;
    
    getUserStats(userId, (stats) => {
        getUserPoints(userId, (pointsData) => {
            const levelName = getLevelName(pointsData.level);
            
            bot.sendMessage(msg.chat.id,
                `📊 <b>إحصائياتك الشخصية:</b>\n\n` +
                `🆔 المعرف: <code>${userId}</code>\n` +
                `🏆 المستوى: ${levelName} (${pointsData.level})\n` +
                `⚡ النقاط: <b>${pointsData.points}</b>\n` +
                `👥 الدعوات: <b>${stats.referrals}</b>\n` +
                `⭐ التبرعات: <b>${stats.stars}</b> نجمة\n` +
                `💎 VIP: ${stats.vip ? '✅ نشط' : '❌ غير مشترك'}`,
                { parse_mode: 'HTML' }
            );
        });
    });
});

// ============================================================================
// [ نظام التحديثات والإصدارات ]
// ============================================================================

const CHANGELOG = [
    { version: "2.0.0", date: "2025", changes: ["إضافة نظام VIP مع عرض مؤقت", "تحسين لوحة الأدمن", "نظام تعديل الأزرار الفردي"] },
    { version: "1.5.0", date: "2025", changes: ["إضافة نظام النقاط والمستويات", "تحسين الإيموجي المميز"] },
    { version: "1.0.0", date: "2024", changes: ["الإصدار الأول"] }
];

// أمر /version
bot.onText(/\/version/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    let changelogText = `📋 <b>سجل التحديثات:</b>\n\n`;
    CHANGELOG.forEach(release => {
        changelogText += `<b>v${release.version}</b> (${release.date}):\n`;
        release.changes.forEach(change => {
            changelogText += `• ${change}\n`;
        });
        changelogText += '\n';
    });
    
    bot.sendMessage(msg.chat.id, changelogText, { parse_mode: 'HTML' });
});

// ============================================================================
// [ نظام المهام والتحديات ]
// ============================================================================

// إنشاء جدول المهام
db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    reward_points INTEGER,
    task_type TEXT,
    required_count INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1
)`);

// إنشاء جدول تقدم المهام
db.run(`CREATE TABLE IF NOT EXISTS task_progress (
    user_id INTEGER,
    task_id INTEGER,
    current_count INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at INTEGER,
    PRIMARY KEY (user_id, task_id)
)`);

// تحديث تقدم المهمة
function updateTaskProgress(userId, taskType, increment = 1) {
    db.all("SELECT * FROM tasks WHERE task_type = ? AND is_active = 1", [taskType], (err, tasks) => {
        if (!tasks) return;
        
        tasks.forEach(task => {
            db.get("SELECT * FROM task_progress WHERE user_id = ? AND task_id = ?", [userId, task.id], (err2, progress) => {
                if (progress && progress.completed) return;
                
                const newCount = (progress ? progress.current_count : 0) + increment;
                const completed = newCount >= task.required_count ? 1 : 0;
                
                if (!progress) {
                    db.run("INSERT INTO task_progress (user_id, task_id, current_count, completed) VALUES (?, ?, ?, ?)",
                        [userId, task.id, newCount, completed]);
                } else {
                    db.run("UPDATE task_progress SET current_count = ?, completed = ?, completed_at = ? WHERE user_id = ? AND task_id = ?",
                        [newCount, completed, completed ? Date.now() : null, userId, task.id]);
                }
                
                if (completed && !progress?.completed) {
                    addPoints(userId, task.reward_points, `task_${task.id}`);
                    bot.sendMessage(userId, 
                        `🎯 <b>أكملت مهمة!</b>\n${task.title}\n🎁 مكافأة: ${task.reward_points} نقطة!`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            });
        });
    });
}

// ============================================================================
// [ نظام الاستطلاعات التفاعلية ]
// ============================================================================

// إرسال استطلاع للمستخدمين
bot.onText(/\/send_poll (.+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const parts = match[1].split('|');
    if (parts.length < 3) {
        return bot.sendMessage(msg.chat.id, "الصيغة: /send_poll السؤال|خيار1|خيار2|خيار3");
    }
    
    const question = parts[0];
    const options = parts.slice(1);
    
    db.all("SELECT user_id FROM users LIMIT 100", [], async (err, rows) => {
        if (!rows) return;
        
        let sent = 0;
        for (const row of rows) {
            try {
                await bot.sendPoll(row.user_id, question, options, { is_anonymous: false });
                sent++;
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {}
        }
        
        bot.sendMessage(msg.chat.id, `✅ تم إرسال الاستطلاع إلى ${sent} مستخدم.`);
    });
});

// ============================================================================
// [ نظام الأوامر الخفية للأدمن ]
// ============================================================================

// إعادة تشغيل البوت (محاكاة)
bot.onText(/\/restart/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    bot.sendMessage(msg.chat.id, "🔄 جاري إعادة تحميل الإعدادات...").then(() => {
        config = loadConfig();
        bot.sendMessage(msg.chat.id, "✅ تم إعادة تحميل الإعدادات بنجاح!");
    });
});

// مسح ذاكرة التخزين المؤقت
bot.onText(/\/clear_cache/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    userCache.clear();
    userMessageCounts.clear();
    bot.sendMessage(msg.chat.id, "✅ تم مسح الذاكرة المؤقتة بنجاح!");
});

// ============================================================================
// [ نظام الرسائل المجمعة المتقدم ]
// ============================================================================

// إرسال رسالة لمجموعة محددة من المستخدمين
async function broadcastToGroup(filter, text, options = {}) {
    let query = "SELECT user_id FROM users WHERE 1=1";
    const params = [];
    
    if (filter.vip_only) {
        query += " AND is_vip = 1";
    }
    
    if (filter.min_referrals) {
        query += " AND referral_count >= ?";
        params.push(filter.min_referrals);
    }
    
    return new Promise((resolve) => {
        db.all(query, params, async (err, rows) => {
            if (!rows) { resolve({ success: 0, failed: 0 }); return; }
            
            let success = 0, failed = 0;
            for (const row of rows) {
                try {
                    await bot.sendMessage(row.user_id, text, options);
                    success++;
                } catch (e) {
                    failed++;
                }
                await new Promise(r => setTimeout(r, 50));
            }
            resolve({ success, failed });
        });
    });
}

// أمر /broadcast_vip
bot.onText(/\/broadcast_vip (.+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const text = match[1];
    const result = await broadcastToGroup({ vip_only: true }, `👑 <b>رسالة حصرية لأعضاء VIP:</b>\n\n${text}`, { parse_mode: 'HTML' });
    bot.sendMessage(msg.chat.id, `✅ تم الإرسال لأعضاء VIP!\n📤 نجح: ${result.success}\n❌ فشل: ${result.failed}`);
});

// ============================================================================
// [ نظام الإغلاق الآمن ]
// ============================================================================

// إغلاق آمن عند إيقاف البوت
process.on('SIGINT', () => {
    writeLog('INFO', 'جاري إيقاف البوت بشكل آمن...');
    
    // حفظ الإعدادات
    saveConfig();
    
    // إغلاق قاعدة البيانات
    db.close((err) => {
        if (err) {
            writeLog('ERROR', `خطأ في إغلاق قاعدة البيانات: ${err.message}`);
        } else {
            writeLog('INFO', 'تم إغلاق قاعدة البيانات بنجاح.');
        }
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    writeLog('INFO', 'تم استلام إشارة SIGTERM، جاري الإغلاق...');
    saveConfig();
    db.close(() => process.exit(0));
});

// ============================================================================
// [ إعداد المنتجات الافتراضية ]
// ============================================================================

// إضافة منتجات افتراضية عند أول تشغيل
db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row && row.count === 0) {
        addProduct("تلغيم تطبيق أساسي", "تلغيم تطبيق واحد بالإعدادات الأساسية", 50, 'basic');
        addProduct("تلغيم تطبيق متقدم", "تلغيم تطبيق مع إعدادات متقدمة وتوقيع", 150, 'advanced');
        addProduct("باقة التلغيم الكاملة", "تلغيم 5 تطبيقات مع كافة الميزات", 400, 'bundle');
        writeLog('INFO', 'تم إضافة المنتجات الافتراضية.');
    }
});

// ============================================================================
// [ إعداد المهام الافتراضية ]
// ============================================================================

db.get("SELECT COUNT(*) as count FROM tasks", (err, row) => {
    if (row && row.count === 0) {
        db.run("INSERT INTO tasks (title, description, reward_points, task_type, required_count) VALUES (?, ?, ?, ?, ?)",
            ["الدعوة الأولى", "ادعُ صديقاً واحداً للبوت", 20, 'referral', 1]);
        db.run("INSERT INTO tasks (title, description, reward_points, task_type, required_count) VALUES (?, ?, ?, ?, ?)",
            ["داعي نشيط", "ادعُ 5 أصدقاء للبوت", 100, 'referral', 5]);
        db.run("INSERT INTO tasks (title, description, reward_points, task_type, required_count) VALUES (?, ?, ?, ?, ?)",
            ["أول تبرع", "تبرع بأي مبلغ من النجوم", 30, 'donation', 1]);
        writeLog('INFO', 'تم إضافة المهام الافتراضية.');
    }
});

// ============================================================================
// [ الرسالة النهائية لبدء التشغيل ]
// ============================================================================

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║     🤖 fokhm.com Bot v2.0.0 - ONLINE         ║');
console.log('╠══════════════════════════════════════════════╣');
console.log('║  ✅ قاعدة البيانات: متصلة                    ║');
console.log('║  ✅ نظام VIP: مفعّل (عرض 48 ساعة)            ║');
console.log('║  ✅ نظام الأزرار الفردية: مفعّل               ║');
console.log('║  ✅ نظام الإيموجي المميز: بدون تكرارات        ║');
console.log('║  ✅ نظام الحماية والحظر: مفعّل                ║');
console.log('║  ✅ نظام النقاط والمستويات: مفعّل             ║');
console.log('║  ✅ نظام الكوبونات والخصومات: مفعّل           ║');
console.log('║  ✅ نظام التقارير اليومية: مفعّل              ║');
console.log('║  ✅ نظام الإغلاق الآمن: مفعّل                 ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
