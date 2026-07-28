const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const TOKEN = "8866684441:AAFrzPZztyUjkgby3FeFySFWnZJauSHEbY0";
const ADMIN_ID = 5653088167;
const CONFIG_FILE = "bot_config.json";
const DB_FILE = "fokhm_bot.db";
const WEBAPP_URL = "https://pywahm.onrender.com";

const bot = new Telegraf(TOKEN);

// ==================== إعداد قاعدة البيانات SQLite ====================
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

// ==================== إدارة الإعدادات ====================
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
        inject: "⚡ حقن وتلغيم تطبيق",
        account: "🥷 معلومات حسابي",
        invite: "🔗 دعوة صديق (ربح)",
        vip: "💎 قسم VIP",
        help: "❓ مساعدة",
        donate: "⭐ تبرع للبوت"
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

// ==================== تصميم لوحات المفاتيح (Keyboards) ====================
function getMainKeyboard() {
    const b = config.buttons;
    return Markup.inlineKeyboard([
        [Markup.button.webApp(b.inject || "⚡ حقن وتلغيم تطبيق", WEBAPP_URL)],
        [Markup.button.callback(b.account || "🥷 معلومات حسابي", "my_account"), Markup.button.callback(b.invite || "🔗 دعوة صديق (ربح)", "invite_friends")],
        [Markup.button.callback(b.vip || "💎 قسم VIP", "vip_section"), Markup.button.callback(b.help || "❓ مساعدة", "help_section")],
        [Markup.button.callback(b.donate || "⭐ تبرع للبوت", "start_donation")]
    ]);
}

function getNumberPad(val = "5") {
    return Markup.inlineKeyboard([
        [Markup.button.callback("1", "num_1"), Markup.button.callback("2", "num_2"), Markup.button.callback("3", "num_3")],
        [Markup.button.callback("4", "num_4"), Markup.button.callback("5", "num_5"), Markup.button.callback("6", "num_6")],
        [Markup.button.callback("7", "num_7"), Markup.button.callback("8", "num_8"), Markup.button.callback("9", "num_9")],
        [Markup.button.callback("🗑 مسح", "num_clear"), Markup.button.callback("0", "num_0"), Markup.button.callback("❌ إلغاء", "num_cancel")],
        [Markup.button.callback(`✅ تأكيد التبرع (${val} ⭐)`, "num_confirm")]
    ]);
}

function getAdminKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback("📊 إحصائيات البوت", "admin_stats")],
        [Markup.button.callback("📝 تعديل رسالة الترحيب", "admin_edit_welcome")],
        [Markup.button.callback("🔘 تعديل أسماء الأزرار", "admin_edit_buttons")],
        [Markup.button.callback("📢 إذاعة عامة للأعضاء", "admin_broadcast")],
        [Markup.button.callback("🏠 القائمة الرئيسية", "admin_home")]
    ]);
}

const userSessions = {};

// ==================== الأوامر والتعامل مع المستخدمين ====================
bot.start((ctx) => {
    const user = ctx.from;
    const text = ctx.message.text;
    let invitedBy = null;
    
    if (text) {
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1].startsWith("ref_")) {
            invitedBy = parseInt(parts[1].replace("ref_", ""));
        }
    }
    
    addUser(user.id, user.username, user.first_name, invitedBy);
    
    let welcomeText = config.welcome_message.replace("{name}", user.first_name);
    ctx.reply(welcomeText, { parse_mode: 'HTML', ...getMainKeyboard() }).catch(() => {
        ctx.reply(welcomeText.replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g, ''), getMainKeyboard());
    });
});

// لوحة تحكم الآدمن
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("❌ هذا الأمر مخصص للآدمن الرئيسي فقط يا فخم.");
    }
    ctx.reply("🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", { parse_mode: 'HTML', ...getAdminKeyboard() });
});

bot.action('admin_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    getTotalUsers((count) => {
        ctx.editMessageText(
            `📊 <b>إحصائيات بوت fokhm.com:</b>\n\n` +
            `👥 إجمالي المشتركين: <b>${count}</b> عضو\n` +
            `⚡ حالة الخادم: يعمل بكفاءة عالية (Node.js / Telegraf)\n` +
            `👑 المشرف العام: <code>${ADMIN_ID}</code>`,
            { parse_mode: 'HTML', ...getAdminKeyboard() }
        );
    });
});

bot.action('admin_edit_welcome', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.editMessageText("✍️ أرسل رسالة الترحيب الجديدة الآن مع إيموجياتك المميزة:\nملاحظة: يمكنك استخدام `{name}` لاسم المستخدم:");
    userSessions[ctx.from.id] = { step: 'waiting_welcome' };
});

bot.action('admin_edit_buttons', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.editMessageText("🔘 أرسل أسماء الأزرار الستة الجديدة مفصولة بفاصلة `,` بالترتيب:\n\n<code>حقن وتلغيم,معلومات حسابي,دعوة صديق,قسم VIP,مساعدة,تبرع للبوت</code>", { parse_mode: 'HTML' });
    userSessions[ctx.from.id] = { step: 'waiting_buttons' };
});

bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.editMessageText("📢 أرسل نص الإذاعة أو الإعلان لجميع الأعضاء:");
    userSessions[ctx.from.id] = { step: 'waiting_broadcast' };
});

bot.action('admin_home', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.editMessageText("🛠 <b>لوحة تحكم الآدمن الماسية (fokhm.com):</b>\nاختر القسم المطلوب:", { parse_mode: 'HTML', ...getAdminKeyboard() });
});

// نظام التبرع السريع بالنجوم
bot.action('start_donation', (ctx) => {
    userSessions[ctx.from.id] = { step: 'donation_amount', amount: '5' };
    ctx.editMessageText(
        "⭐ <b>نظام الدعم والتبرع بالنجوم لمنصة fokhm.com</b>\n\n" +
        "اختر عدد النجوم عبر لوحة الأرقام أدناه، ثم اضغط زر التأكيد:\n\n" +
        "📌 <b>الكمية المحددة حالياً:</b> <code>5</code> نجوم",
        { parse_mode: 'HTML', ...getNumberPad('5') }
    );
});

bot.action(/^num_(.+)$/, (ctx) => {
    const action = ctx.match[1];
    const userId = ctx.from.id;
    if (!userSessions[userId] || userSessions[userId].step !== 'donation_amount') {
        return ctx.answerCbQuery("انتهت الجلسة، أعد المحاولة.");
    }
    
    let current = userSessions[userId].amount;
    
    if (!isNaN(action)) {
        current = current === "5" ? action : current + action;
    } else if (action === "clear") {
        current = "0";
    } else if (action === "cancel") {
        delete userSessions[userId];
        return ctx.editMessageText("❌ تم إلغاء عملية التبرع.", getMainKeyboard());
    } else if (action === "confirm") {
        const amount = parseInt(current || "1");
        delete userSessions[userId];
        ctx.editMessageText(
            `✅ <b>تم توليد فاتورة التبرع بنجاح يا فخم!</b>\n\nتتم عملية الدفع الآمن بقيمة <b>${amount}</b> نجمة (Telegram Stars).`,
            { parse_mode: 'HTML', ...getMainKeyboard() }
        );
        
        return ctx.replyWithInvoice({
            title: "تبرع لدعم منصة fokhm.com ⚡",
            description: `مساهمة مالية بقيمة ${amount} نجمة لدعم وتطوير خدمات التلغيم.`,
            payload: `donation_${userId}_${amount}`,
            provider_token: "", // فارغة للنجوم الرقمية XTR
            currency: "XTR",
            prices: [{ label: `دعم ${amount} نجمة`, amount: amount }]
        });
    }
    
    userSessions[userId].amount = current;
    ctx.editMessageText(
        "⭐ <b>نظام الدعم والتبرع بالنجوم لمنصة fokhm.com</b>\n\n" +
        "اختر عدد النجوم عبر لوحة الأرقام أدناه، ثم اضغط زر التأكيد:\n\n" +
        `📌 <b>الكمية المحددة حالياً:</b> <code>${current}</code> نجوم`,
        { parse_mode: 'HTML', ...getNumberPad(current) }
    ).catch(() => {});
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', (ctx) => {
    const payment = ctx.message.successful_payment;
    const payload = payment.invoice_payload;
    const userId = ctx.from.id;
    let amount = 5;
    
    if (payload.startsWith("donation_")) {
        try { amount = parseInt(payload.split("_")[2]); } catch (e) {}
    }
    
    db.run("UPDATE users SET stars_donated = stars_donated + ?, is_vip = 1 WHERE user_id = ?", [amount, userId]);
    ctx.reply(`🎉 <b>تم استلام تبرعك بـ ${amount} نجمة بنجاح يا فخم!</b>\n👑 تم ترقية حسابك إلى رتبة (VIP) تلقائياً على منصة fokhm.com ⚡`, { parse_mode: 'HTML', ...getMainKeyboard() });
});

// أزرار الحساب والدعوات
bot.action('my_account', (ctx) => {
    const userId = ctx.from.id;
    getUserStats(userId, (stats) => {
        const vipStatus = stats.vip || userId === ADMIN_ID ? "💎 عضو مميز (VIP)" : "🛡 عضو عادي";
        ctx.reply(
            `🥷 <b>معلومات حسابك الشخصي:</b>\n\n` +
            `🆔 المعرّف: <code>${userId}</code>\n` +
            `⚡ الرتبة: ${vipStatus}\n` +
            `👥 عدد الدعوات: <b>${stats.referrals}</b> شخص\n` +
            `⭐ إجمالي التبرعات: <b>${stats.stars}</b> نجمة\n` +
            `🌐 المنصة: <b>fokhm.com</b>`,
            { parse_mode: 'HTML' }
        );
        ctx.answerCbQuery();
    });
});

bot.action('invite_friends', (ctx) => {
    const userId = ctx.from.id;
    const botUsername = ctx.botInfo.username;
    const inviteLink = `https://t.me/${botUsername}?start=ref_${userId}`;
    ctx.reply(
        `🔗 <b>نظام الدعوات والأرباح الماسي:</b>\n\nشارك رابط الدعوة الخاص بك مع أصدقائك:\n\n<code>${inviteLink}</code>`,
        { parse_mode: 'HTML' }
    );
    ctx.answerCbQuery();
});

bot.action('vip_section', (ctx) => ctx.answerCbQuery("💎 قسم VIP يمنحك صلاحيات حصرية. قم بدعوة 5 أشخاص أو تبرع بالنجوم لفتحه فوراً!", { show_alert: true }));
bot.action('help_section', (ctx) => ctx.answerCbQuery("❓ للدعم الفني والتواصل المباشر تفضل بزيارة موقعنا: fokhm.com", { show_alert: true }));

// استقبال النصوص الموجهة من الآدمن (رسالة الترحيب والأزرار والإذاعة)
bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID || !userSessions[userId]) return;
    
    const session = userSessions[userId];
    const text = ctx.message.text;
    
    if (session.step === 'waiting_welcome') {
        config.welcome_message = text;
        saveConfig(config);
        delete userSessions[userId];
        ctx.reply("✅ تم تحديث رسالة الترحيب بنجاح يا فخم!", getAdminKeyboard());
    } else if (session.step === 'waiting_buttons') {
        const parts = text.split(',').map(p => p.trim());
        if (parts.length >= 6) {
            config.buttons = {
                inject: parts[0],
                account: parts[1],
                invite: parts[2],
                vip: parts[3],
                help: parts[4],
                donate: parts[5]
            };
            saveConfig(config);
            delete userSessions[userId];
            ctx.reply("✅ تم تحديث الأزرار بنجاح يا فخم!", getAdminKeyboard());
        } else {
            ctx.reply("❌ الصيغة غير صحيحة. يجب إرسال 6 أسماء مفصولة بـ `,`.");
        }
    } else if (session.step === 'waiting_broadcast') {
        delete userSessions[userId];
        db.all("SELECT user_id FROM users", [], (err, rows) => {
            if (err || !rows) return ctx.reply("❌ حدث خطأ أثناء جلب المشتركين.");
            
            ctx.reply(`🚀 جاري بدء الإذاعة إلى ${rows.length} مشترك...`);
            let success = 0;
            let failed = 0;
            
            rows.forEach((row) => {
                bot.telegram.sendMessage(row.user_id, `📢 <b>إعلان رسمي من إدارة fokhm.com:</b>\n\n${text}`, { parse_mode: 'HTML' })
                    .then(() => success++)
                    .catch(() => failed++);
            });
            
            setTimeout(() => {
                ctx.reply(`✅ <b>تمت الإذاعة بنجاح يا فخم!</b>\n\n📤 المرسل لهم: <b>${success}</b>\n❌ فشل: <b>${failed}</b>`, { parse_mode: 'HTML', ...getAdminKeyboard() });
            }, 3000);
        });
    }
});

// تشغيل البوت
bot.launch().then(() => {
    console.log("🚀 Telegraf Bot for fokhm.com is running successfully!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

