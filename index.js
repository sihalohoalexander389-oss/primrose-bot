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
const BOT_TOKEN = config.BOT_TOKEN;
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const thumbnailUrl = "https://files.catbox.moe/6ogo26.jpg";

// Konfigurasi GitHub Auto Update
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/sihalohoalexander389-oss/primrose-bot/main/index.js";
const CURRENT_VERSION = "3.0.9";
const AUTO_UPDATE_FILE = "./database/auto_update.json";

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

// Inisialisasi auto update setting
const autoUpdateSetting = loadAutoUpdateSetting();
autoUpdateEnabled = autoUpdateSetting.enabled;

// File untuk menyimpan data
const GROUP_PREMIUM_FILE = "./database/group_premium.json";
const BLOCKED_COMMANDS_FILE = "./database/blocked_commands.json";
const COLOR_SETTING_FILE = "./database/color_setting.json";

// Load data grup premium
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

// Load blocked commands
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

// Load color setting
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

// Inisialisasi data
groupPremiumData = loadGroupPremiumData();
blockedCommands = loadBlockedCommands();
const colorSetting = loadColorSetting();
currentColor = colorSetting.color;

// Fungsi untuk mengecek update dari GitHub
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

// Fungsi untuk melakukan update
async function performUpdate(chatId) {
    try {
        const update = await checkForUpdates();
        
        if (!update.hasUpdate) {
            if (chatId) {
                await bot.sendMessage(chatId, `✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`);
            }
            return false;
        }
        
        fs.writeFileSync(__filename, update.content);
        console.log(chalk.green("✅ File index.js berhasil diupdate!"));
        
        if (chatId) {
            await bot.sendMessage(chatId, `✅ Update berhasil! Versi ${CURRENT_VERSION} → ${update.newVersion}\n🔄 Bot akan restart dalam 3 detik...`);
        }
        
        setTimeout(() => {
            process.exit(0);
        }, 3000);
        
        return true;
    } catch (error) {
        console.error(chalk.red("❌ Gagal update:", error.message));
        if (chatId) {
            await bot.sendMessage(chatId, `❌ Gagal update: ${error.message}`);
        }
        return false;
    }
}

// Auto update checker
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
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function ensureFileExists(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

let sock;

function saveActiveSessions(botNumber) {
  try {
    const sessionsList = [];
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
          keepAliveIntervalMs: 30000,
          connectTimeoutMs: 60000,
        });

        await new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(`Bot ${botNumber} terhubung!`);
              sessions.set(botNumber, sock);
              resolve();
            } else if (connection === "close") {
              const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
              if (shouldReconnect) {
                console.log(`Mencoba menghubungkan ulang bot ${botNumber}...`);
                setTimeout(() => initializeWhatsAppConnections(), 5000);
              } else {
                reject(new Error("Koneksi ditutup"));
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
  let statusMessage = await bot
    .sendMessage(
      chatId,
      `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Process
`,
      { parse_mode: "HTML" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Not Connected
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
        setTimeout(() => ConnectToWhatsApp(botNumber, chatId), 5000);
      } else {
        await bot.editMessageText(
          `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Gagal ❌
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(
        `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Connected
`,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "HTML",
        }
      );
    } else if (connection === "connecting") {
      await sleep(1000);
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          let customcode = "PRIMROSE123"
          const code = await sock.requestPairingCode(botNumber, customcode);
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;

          await bot.editMessageText(
            `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Code Pairing : ${formattedCode}
`,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "HTML",
          });
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `
<blockquote>Primrose Linux Bot [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Error ❌ ${error.message}
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
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
  return config.OWNER_ID.includes(userId.toString());
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
      {
        text: "XBUGS",
        callback_data: "trashmenu",
        style: buttonStyle
      },
      {
        text: "XTOOLSBUG",
        callback_data: "toolsbug_menu",
        style: buttonStyle
      }
    ],
    [
      {
        text: "XSETTINGS",
        callback_data: "owner_menu",
        style: buttonStyle
      },
      {
        text: "XGROUPSECURITY",
        callback_data: "group_security_menu",
        style: buttonStyle
      }
    ],
    [
      {
        text: "XCHANGECOLOR",
        callback_data: "change_color_menu",
        style: buttonStyle
      },
      {
        text: "DEVELOPERS",
        url: "https://t.me/ItsMeXanderRzMd",
        style: buttonStyle
      }
    ]
  ]

  if (isWhite) {
    keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null').replace(/"style":null/g, ''))
  }

  const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : 3.0 
🗡 Platform : Telegram
<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>
⛧ Status : ${status}
⛧ Number : ${botNumber}
⛧ Runtime : ${runtimeStatus}
⛧ Memory : ${memoryStatus}`

  let sent;
  
  if (editMessageId) {
    try {
      await bot.editMessageMedia(
        {
          type: 'photo',
          media: randomImage,
          caption: caption,
          parse_mode: "HTML"
        },
        {
          chat_id: chatId,
          message_id: editMessageId,
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
      sent = { message_id: editMessageId };
    } catch (error) {
      sent = await bot.sendPhoto(chatId, randomImage, {
        caption: caption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    }
  } else {
    sent = await bot.sendPhoto(chatId, randomImage, {
      caption: caption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }

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
          {
            text: "XBUGS",
            callback_data: "trashmenu",
            style: newStyle
          },
          {
            text: "XTOOLSBUG",
            callback_data: "toolsbug_menu",
            style: newStyle
          }
        ],
        [
          {
            text: "XSETTINGS",
            callback_data: "owner_menu",
            style: newStyle
          },
          {
            text: "XGROUPSECURITY",
            callback_data: "group_security_menu",
            style: newStyle
          }
        ],
        [
          {
            text: "XCHANGECOLOR",
            callback_data: "change_color_menu",
            style: newStyle
          },
          {
            text: "DEVELOPERS",
            url: "https://t.me/ItsMeXanderRzMd",
            style: newStyle
          }
        ]
      ]

      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: newKeyboard },
          {
            chat_id: chatId,
            message_id: messageId
          }
        )
      } catch (e) {}
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

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const from = msg.from
  const userId = from.id
  const chatType = msg.chat.type
  const isGroup = chatType === "group" || chatType === "supergroup"
  const isOwnerUser = config.OWNER_ID.includes(String(userId))

  if (!isGroup && !isPremium(userId) && !isOwnerUser) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.")
  }

  await sendStartMenu(chatId, from)
})

bot.on("callback_query", async (query) => {
  if (!query.message) return

  const chatId = query.message.chat.id
  const userId = query.from.id
  const currentMessageId = query.message.message_id
  const data = query.data

  let caption = ""
  let replyMarkup = {}
  let selectedImage = getRandomImage()

  if (data === "trashmenu") {
    caption = `<blockquote>─━━─━━⧼ BUG MENU ⧽─━━─━━</blockquote>
<b>─━━─━━⧼ INFORMASI USER ⧽─━━─━━:</b>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : 3.0
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
<pre>──────────────────────────
   MENU: Pilih Fitur Bug Menu di Atas 
──────────────────────────</pre>`
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: selectedImage,
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: currentMessageId,
        reply_markup: replyMarkup
      }
    )
    
  } else if (data === "owner_menu") {
    caption = `<blockquote><b>☠ PRIMROSE LINUX BOT ACCESS ☠</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : 3.0
🗡 Platform : Telegram     
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /addprem id ☇ days
┃      ╰➤ Menambahkan akses pada user
┃      ▢ /delprem id
┃      ╰➤ Menghapus akses pada user
┃      ▢ /addadmin id
┃      ╰➤ Menambahkan akses admin pada user
┃      ▢ /deladmin id
┃      ╰➤ Menghapus akses admin pada user
┃      ▢ /listprem
┃      ╰➤ Melihat list premium user yang ada
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
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: selectedImage,
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: currentMessageId,
        reply_markup: replyMarkup
      }
    )
    
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
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: selectedImage,
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: currentMessageId,
        reply_markup: replyMarkup
      }
    )
    
  } else if (data === "toolsbug_menu") {
    caption = `<blockquote><b>🛠️ XTOOLSBUG MENU 🛠️</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /testfunction &lt;number&gt; &lt;jumlah&gt;
┃      ╰➤ Reply dengan function bug
┃      ▢ /celahfunc &lt;reply func atau file&gt;
┃      ╰➤ Extract celah dari function
┃      ▢ /check &lt;reply code atau file&gt;
┃      ╰➤ Cek error JavaScript
┃      ▢ /fix &lt;reply code&gt;
┃      ╰➤ Perbaiki code JavaScript otomatis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<blockquote><b>NOTE:</b>
Gunakan tools ini untuk testing dan debugging</blockquote>`
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: selectedImage,
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: currentMessageId,
        reply_markup: replyMarkup
      }
    )
    
  } else if (data === "change_color_menu") {
    const options = ["🔴 XRED", "🔵 XBLUE", "🟢 XGREEN", "⚪ XWHITE", "🌈 XDISCO"]
    
    const poll = await bot.sendPoll(chatId, "🎨 PILIH WARNA BUTTON", options, { 
      is_anonymous: false,
      allows_multiple_answers: false
    })
    
    pendingColorPoll[poll.poll.id] = {
      chatId: chatId,
      userId: userId,
      from: query.from,
      currentMessageId: currentMessageId
    }
    
    return await bot.answerCallbackQuery(query.id)
    
  } else if (data === "back_to_main") {
    const runtimeStatus = formatRuntime()
    const memoryStatus = formatMemory()
    const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE"
    const botNumber = sessions.size
    
    const isWhite = (currentColor === "secondary")
    const buttonStyle = isWhite ? undefined : (currentColor === "disco" ? buttonStyles[0] : currentColor)
    
    let keyboard = [
      [
        {
          text: "XBUGS",
          callback_data: "trashmenu",
          style: buttonStyle
        },
        {
          text: "XTOOLSBUG",
          callback_data: "toolsbug_menu",
          style: buttonStyle
        }
      ],
      [
        {
          text: "XSETTINGS",
          callback_data: "owner_menu",
          style: buttonStyle
        },
        {
          text: "XGROUPSECURITY",
          callback_data: "group_security_menu",
          style: buttonStyle
        }
      ],
      [
        {
          text: "XCHANGECOLOR",
          callback_data: "change_color_menu",
          style: buttonStyle
        },
        {
          text: "DEVELOPERS",
          url: "https://t.me/ItsMeXanderRzMd",
          style: buttonStyle
        }
      ]
    ]
    
    if (isWhite) {
      keyboard = JSON.parse(JSON.stringify(keyboard).replace(/"style":undefined/g, '"style":null').replace(/"style":null/g, ''))
    }
    
    const caption = `<blockquote><strong>☠ # Primrose Linux Bot 𖣂 ☠</strong></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : 3.0 
🗡 Platform : Telegram
<blockquote><b>――⧼ STATUS BOT ⧽――</b></blockquote>
⛧ Status : ${status}
⛧ Number : ${botNumber}
⛧ Runtime : ${runtimeStatus}
⛧ Memory : ${memoryStatus}`
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: getRandomImage(),
        caption: caption,
        parse_mode: "HTML"
      },
      {
        chat_id: chatId,
        message_id: currentMessageId,
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    )
    
    if (currentColor === "disco") {
      if (buttonIntervals.has(currentMessageId)) {
        clearInterval(buttonIntervals.get(currentMessageId))
        buttonIntervals.delete(currentMessageId)
      }
      if (globalIntervalId) {
        clearInterval(globalIntervalId)
        globalIntervalId = null
      }
      
      discoActive = true
      let index = 0
      globalIntervalId = setInterval(async () => {
        if (!discoActive) return
        
        index = (index + 1) % buttonStyles.length
        const newStyle = buttonStyles[index]

        let newKeyboard = [
          [
            {
              text: "XBUGS",
              callback_data: "trashmenu",
              style: newStyle
            },
            {
              text: "XTOOLSBUG",
              callback_data: "toolsbug_menu",
              style: newStyle
            }
          ],
          [
            {
              text: "XSETTINGS",
              callback_data: "owner_menu",
              style: newStyle
            },
            {
              text: "XGROUPSECURITY",
              callback_data: "group_security_menu",
              style: newStyle
            }
          ],
          [
            {
              text: "XCHANGECOLOR",
              callback_data: "change_color_menu",
              style: newStyle
            },
            {
              text: "DEVELOPERS",
              url: "https://t.me/ItsMeXanderRzMd",
              style: newStyle
            }
          ]
        ]

        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: newKeyboard },
            {
              chat_id: chatId,
              message_id: currentMessageId
            }
          )
        } catch (e) {}
      }, 1500)
      
      buttonIntervals.set(currentMessageId, globalIntervalId)
    }
    
    return await bot.answerCallbackQuery(query.id)
  }

  await bot.answerCallbackQuery(query.id)
})

bot.on("poll_answer", async (answer) => {
  const pollData = pendingColorPoll[answer.poll_id]
  if (!pollData) return
  
  const selectedOption = answer.option_ids[0]
  let selectedColor = ""
  
  if (selectedOption === 0) selectedColor = "XRED"
  else if (selectedOption === 1) selectedColor = "XBLUE"
  else if (selectedOption === 2) selectedColor = "XGREEN"
  else if (selectedOption === 3) selectedColor = "XWHITE"
  else if (selectedOption === 4) selectedColor = "XDISCO"
  
  const colorValue = getColorFromChoice(selectedColor)
  saveColorSetting(colorValue)
  currentColor = colorValue
  
  if (buttonIntervals.has(pollData.currentMessageId)) {
    clearInterval(buttonIntervals.get(pollData.currentMessageId))
    buttonIntervals.delete(pollData.currentMessageId)
  }
  if (globalIntervalId) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
  discoActive = false
  
  await sendColoredMenu(pollData.chatId, pollData.from, colorValue, pollData.currentMessageId)
  
  delete pendingColorPoll[answer.poll_id]
})

bot.onText(/\/update (on|off)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const mode = match[1].toLowerCase()
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  if (mode === "on") {
    autoUpdateEnabled = true;
    saveAutoUpdateSetting(true);
    startAutoUpdateChecker();
    await bot.sendMessage(chatId, `✅ Auto update diaktifkan! Bot akan otomatis update ketika ada versi baru di GitHub.`);
  } else if (mode === "off") {
    autoUpdateEnabled = false;
    saveAutoUpdateSetting(false);
    stopAutoUpdateChecker();
    await bot.sendMessage(chatId, `❌ Auto update dinonaktifkan! Gunakan /autoupdate untuk update manual.`);
  }
})

bot.onText(/\/autoupdate/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const statusMsg = await bot.sendMessage(chatId, "🔄 Mengecek update dari GitHub...")
  
  const update = await checkForUpdates()
  
  if (!update.hasUpdate) {
    await bot.editMessageText(`✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    })
    return
  }
  
  await bot.editMessageText(`📦 Update ditemukan! Versi ${CURRENT_VERSION} → ${update.newVersion}\n🔄 Melakukan update...`, {
    chat_id: chatId,
    message_id: statusMsg.message_id
  })
  
  await performUpdate(chatId)
})

bot.onText(/\/checkupdate/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const statusMsg = await bot.sendMessage(chatId, "🔍 Mengecek update dari GitHub...")
  
  const update = await checkForUpdates()
  
  if (update.hasUpdate) {
    await bot.editMessageText(`📦 Update tersedia!\n\nVersi saat ini: v${CURRENT_VERSION}\nVersi terbaru: v${update.newVersion}\n\nGunakan /autoupdate untuk update.`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    })
  } else {
    await bot.editMessageText(`✅ Bot sudah versi terbaru! (v${CURRENT_VERSION})\n\nAuto Update: ${autoUpdateEnabled ? "ON (otomatis)" : "OFF (manual)"}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    })
  }
})

bot.onText(/\/blokcmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const commandName = match[1].toLowerCase().replace("/", "")
  
  if (isCommandBlocked(commandName)) {
    return bot.sendMessage(chatId, `⚠️ Command /${commandName} sudah dalam keadaan diblokir.`)
  }
  
  blockedCommands.push(commandName)
  saveBlockedCommands(blockedCommands)
  
  bot.sendMessage(chatId, `✅ Command /${commandName} berhasil diblokir. User tidak akan bisa menggunakan command ini.`)
})

bot.onText(/\/bukacmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const commandName = match[1].toLowerCase().replace("/", "")
  
  if (!isCommandBlocked(commandName)) {
    return bot.sendMessage(chatId, `⚠️ Command /${commandName} tidak dalam keadaan diblokir.`)
  }
  
  blockedCommands = blockedCommands.filter(cmd => cmd !== commandName)
  saveBlockedCommands(blockedCommands)
  
  bot.sendMessage(chatId, `✅ Command /${commandName} berhasil dibuka. User bisa menggunakan command ini kembali.`)
})

bot.onText(/\/addpremgrup\s+(\d+)([dhm])?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  if (chatType !== "group" && chatType !== "supergroup") {
    return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!")
  }
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const jumlah = parseInt(match[1])
  const unit = match[2] || 'd'
  let days = jumlah
  
  if (unit === 'h') days = jumlah / 24
  if (unit === 'm') days = jumlah / (24 * 30)
  
  if (days < 1) days = 1
  
  await addGroupPremium(chatId, Math.floor(days), userId)
  
  const chat = await bot.getChat(chatId)
  bot.sendMessage(chatId, `✅ Grup "${chat.title}" berhasil ditambahkan ke premium selama ${jumlah}${unit === 'd' ? ' hari' : unit === 'h' ? ' jam' : ' bulan'}! Anggota grup dapat mengetik "add" untuk mendapatkan akses premium.`)
})

bot.onText(/\/delpremgrup/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  if (chatType !== "group" && chatType !== "supergroup") {
    return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!")
  }
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const groupId = chatId.toString()
  const existingGroup = groupPremiumData.find(g => g.groupId === groupId)
  
  if (!existingGroup) {
    return bot.sendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup.")
  }
  
  removeGroupPremium(chatId)
  
  const chat = await bot.getChat(chatId)
  bot.sendMessage(chatId, `✅ Grup "${chat.title}" berhasil dihapus dari daftar premium grup.`)
})

bot.onText(/\/listpremgrub/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  if (chatType !== "group" && chatType !== "supergroup") {
    return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di dalam grup!")
  }
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const groupId = chatId.toString()
  const group = groupPremiumData.find(g => g.groupId === groupId)
  
  if (!group) {
    return bot.sendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup.")
  }
  
  if (group.members.length === 0) {
    return bot.sendMessage(chatId, "📌 Belum ada member yang mendaftar premium di grup ini.")
  }
  
  let message = `<blockquote>📋 Daftar Premium Member</blockquote>\n`
  message += `Grup: ${group.groupTitle}\n`
  message += `Expires: ${moment(group.expiresAt).format('YYYY-MM-DD HH:mm:ss')}\n━━━━━━━━━━━━━━━━━━\n`
  
  group.members.forEach((member, index) => {
    const expires = moment(member.expiresAt).format('YYYY-MM-DD')
    message += `${index + 1}. ${member.username || `User ${member.userId}`}\n   ID: <code>${member.userId}</code>\n   Exp: ${expires}\n\n`
  })
  
  bot.sendMessage(chatId, message, { parse_mode: "HTML" })
})

bot.onText(/^add$/i, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username || msg.from.first_name
  const chatType = msg.chat.type
  
  if (chatType !== "group" && chatType !== "supergroup") {
    return
  }
  
  const groupId = chatId.toString()
  const group = groupPremiumData.find(g => g.groupId === groupId)
  
  if (!group) {
    return bot.sendMessage(chatId, "❌ Grup ini tidak terdaftar dalam premium grup. Hubungi admin untuk mendaftarkan grup.")
  }
  
  if (Date.now() > group.expiresAt) {
    return bot.sendMessage(chatId, "❌ Masa berlaku premium grup ini sudah habis. Hubungi admin untuk memperpanjang.")
  }
  
  if (isPremium(userId)) {
    return bot.sendMessage(chatId, `✅ @${username || userId} sudah memiliki akses premium!`, { parse_mode: "HTML" })
  }
  
  const remainingDays = Math.ceil((group.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
  
  await addMemberPremiumFromGroup(chatId, userId, username, remainingDays)
  
  bot.sendMessage(chatId, `✅ Selamat @${username || userId}! Anda telah mendapatkan akses premium selama ${remainingDays} hari. Silakan gunakan command bug yang tersedia.`, { parse_mode: "HTML" })
})

async function brem(sock, target) { }
async function VisiFriend(sock, target) { }
async function OfferXForclose(sock, target) { }
async function bulldozerV2(sock, target) { }
async function xatanicaldelayv2(sock, target) { }
async function MbaPe(sock, target) { }

function createBugSuccessMessage(targetNumber, bugType, date) {
  return `
<blockquote>⬡═―—⊱「 Primrose Linux Bot 」⊰―—═⬡</blockquote>

◉ Target : ${targetNumber}
◉ Type Bug : ${bugType}
◉ Status : Successfully Send
◉ Date Now : ${date}

<blockquote>⸙ Spam Free at will</blockquote>`
}

function createCheckButton(targetNumber) {
  return {
    inline_keyboard: [[{ text: "📱 CEK TARGET", url: `https://wa.me/${targetNumber}` }]]
  }
}

function getCurrentDate() {
  return new Date().toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

async function checkUserAccess(userId, chatId, chatType, commandName) {
  const isOwnerUser = isOwner(userId)
  const isPremiumUser = isPremium(userId)
  
  if (isCommandBlocked(commandName)) {
    return false
  }
  
  if (isOwnerUser) return true
  
  if (chatType === "private" && !isPremiumUser) {
    await bot.sendMessage(chatId, "❌ Akses ditolak! Anda bukan user premium. Hubungi owner untuk membeli premium.")
    return false
  }
  
  return true
}

bot.onText(/\/Xploit(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "xploit")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /xploit 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "xploit", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 70; i++) {
    await MbaPe(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/Sanjiva(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "sanjiva")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /Sanjiva 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "Sanjiva", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 10; i++) {
    await xatanicaldelayv2(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/Stova(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "stova")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /Stova 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "Stova", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 7; i++) {
    await brem(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/Chatms(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "chatms")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /Chatms 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "Chatms", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 35; i++) {
    await VisiFriend(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/Ganesha(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "ganesha")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /Ganesha 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "Ganesha", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 10; i++) {
    await bulldozerV2(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/sendbug(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "sendbug")
  if (!hasAccess) return
  
  if (!match[1]) return bot.sendMessage(chatId, "🪧 Format: /sendbug 628xxx")
  
  const targetNumber = match[1].replace(/[^0-9]/g, "")
  const target = `${targetNumber}@s.whatsapp.net`
  const date = getCurrentDate()
  
  if (sessions.size === 0) return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.")
  
  const sock = sessions.values().next().value
  
  await bot.sendMessage(chatId, createBugSuccessMessage(targetNumber, "sendbug", date), {
    parse_mode: "HTML",
    reply_markup: createCheckButton(targetNumber)
  })
  
  for (let i = 0; i < 35; i++) {
    await VisiFriend(sock, target)
    await sleep(200)
  }
})

bot.onText(/\/reqpair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (!adminUsers.includes(msg.from.id) && !isOwner(msg.from.id)) {
    return bot.sendPhoto(chatId, thumbnailUrl, {
      caption: `<blockquote>Access Admin</blockquote>Please Buy Access Admin To The Owner!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "Owner", url: "https://t.me/ItsMeXanderRzMd" }]]
      }
    })
  }

  if (!match[1]) {
    return bot.sendMessage(chatId, "❌ Missing input. Please provide the number. Example: /reqpair 62xxxx.")
  }
  
  const botNumber = match[1].replace(/[^0-9]/g, "")

  if (!botNumber || botNumber.length < 10) {
    return bot.sendMessage(chatId, "❌ Nomor yang diberikan tidak valid. Pastikan nomor yang dimasukkan benar.")
  }

  try {
    await ConnectToWhatsApp(botNumber, chatId)
  } catch (error) {
    console.error("Error in Connect:", error)
    bot.sendMessage(chatId, "Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi.")
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:', error));
});

startAutoUpdateChecker();
startBot();
initializeWhatsAppConnections();