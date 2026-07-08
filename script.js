// ==========================================
// ДИНАМИЧЕСКИЕ НАСТРОЙКИ ИЗ URL
// ==========================================
const urlParams = new URLSearchParams(window.location.search);

// ==========================================
// API URL (ДЛЯ РАЗНЫХ СРЕД)
// ==========================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'  // Локальная разработка
    : 'https://api.your-domain.com'; // 🔥 ЗАМЕНИ НА АДРЕС ТВОЕГО СЕРВЕРА ПОЗЖЕ

console.log(`🌐 API URL: ${API_URL}`);

// Базовые настройки канала
const TWITCH_CHANNEL = (urlParams.get('channel') || '1diwan').toLowerCase();
const TWITCH_USER_ID = urlParams.get('twitchId') || '471329642';

console.log(`📺 Канал: ${TWITCH_CHANNEL}, ID: ${TWITCH_USER_ID}`);

// Настройки кастомизации
const FONT_SIZE = urlParams.get('fontSize') || '22'; 
const HIDE_TIME = parseInt(urlParams.get('hideTime')) || 20; 
const SHOW_TIME = urlParams.get('showTime') !== 'false'; 
const MAX_MESSAGES = parseInt(urlParams.get('maxMessages')) || 10;

// Анимации из URL
const ENTER_ANIM = urlParams.get('enterAnim') || 'slideUp';
const EXIT_ANIM = urlParams.get('exitAnim') || 'slideOut';

// Применяем размер шрифта к чату через CSS-переменную
document.documentElement.style.setProperty('--chat-font-size', `${FONT_SIZE}px`);

const emoteCache = new Map();

let reconnectAttempts = 0;
let socket = null;

// ==========================================
// СТАТИСТИКА (С СОХРАНЕНИЕМ В localStorage)
// ==========================================
const STORAGE_KEY = 'twitch_chat_stats';

const stats = {
    viewers: new Set(),
    totalMessages: 0,
    messageTimestamps: [],
    topChatter: {},
    gifts: 0,
    raids: 0,
    sessionStart: Date.now()
};

// Загружаем статистику из localStorage
function loadStatsFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.timestamp && Date.now() - data.timestamp < 86400000) {
                stats.viewers = new Set(data.viewers || []);
                stats.totalMessages = data.totalMessages || 0;
                stats.messageTimestamps = data.messageTimestamps || [];
                stats.topChatter = data.topChatter || {};
                stats.gifts = data.gifts || 0;
                stats.raids = data.raids || 0;
                stats.sessionStart = data.sessionStart || Date.now();
                console.log('📊 Статистика загружена из localStorage');
                return true;
            }
        }
    } catch (e) {
        console.warn('⚠️ Ошибка загрузки статистики:', e);
    }
    return false;
}

// Сохраняем статистику в localStorage
function saveStatsToStorage() {
    try {
        const data = {
            viewers: Array.from(stats.viewers),
            totalMessages: stats.totalMessages,
            messageTimestamps: stats.messageTimestamps,
            topChatter: stats.topChatter,
            gifts: stats.gifts,
            raids: stats.raids,
            sessionStart: stats.sessionStart || Date.now(),
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('⚠️ Ошибка сохранения статистики:', e);
    }
}

loadStatsFromStorage();

function updateStatsDisplay() {
    const statViewers = document.getElementById('statViewers');
    const statMessages = document.getElementById('statMessages');
    const statSpeed = document.getElementById('statSpeed');
    const statTopChatter = document.getElementById('statTopChatter');
    const statGifts = document.getElementById('statGifts');
    const statRaids = document.getElementById('statRaids');
    
    if (statViewers) statViewers.textContent = stats.viewers.size;
    if (statMessages) statMessages.textContent = stats.totalMessages;
    if (statGifts) statGifts.textContent = stats.gifts;
    if (statRaids) statRaids.textContent = stats.raids;
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    stats.messageTimestamps = stats.messageTimestamps.filter(t => t > oneMinuteAgo);
    if (statSpeed) statSpeed.textContent = stats.messageTimestamps.length;
    
    let topUser = '—';
    let topCount = 0;
    for (const [user, count] of Object.entries(stats.topChatter)) {
        if (count > topCount) {
            topCount = count;
            topUser = user;
        }
    }
    if (statTopChatter) statTopChatter.textContent = topUser !== '—' ? `${topUser} (${topCount})` : '—';
    
    // Отправляем в панель и сохраняем
    sendStatsToPanel();
    saveStatsToStorage();
}

function processRealMessageForStats(user, text, badges) {
    console.log(`📊 Сообщение от ${user}, всего: ${stats.totalMessages + 1}`);
    
    stats.viewers.add(user);
    stats.totalMessages++;
    stats.messageTimestamps.push(Date.now());
    
    if (!stats.topChatter[user]) stats.topChatter[user] = 0;
    stats.topChatter[user]++;
    
    const activity = detectActivity(text, user, badges);
    if (activity.type === 'gift-sub') stats.gifts++;
    else if (activity.type === 'raid') stats.raids++;
    
    updateStatsDisplay();
}

function resetStats() {
    stats.viewers.clear();
    stats.totalMessages = 0;
    stats.messageTimestamps = [];
    stats.topChatter = {};
    stats.gifts = 0;
    stats.raids = 0;
    stats.sessionStart = Date.now();
    updateStatsDisplay();
    console.log('📊 Статистика сброшена');
}

// ==========================================
// СВЯЗЬ С ПАНЕЛЬЮ УПРАВЛЕНИЯ
// ==========================================
const statsChannel = new BroadcastChannel('twitch_stats');

function sendStatsToPanel() {
    try {
        const data = {
            type: 'stats_update',
            viewers: stats.viewers.size,
            totalMessages: stats.totalMessages,
            speed: stats.messageTimestamps.length,
            topChatter: getTopChatter(),
            gifts: stats.gifts,
            raids: stats.raids,
            timestamp: Date.now()
        };
        statsChannel.postMessage(data);
        console.log('📤 Отправлено в панель:', data);
    } catch (e) {
        console.warn('⚠️ Ошибка отправки статистики:', e);
    }
}

function getTopChatter() {
    let topUser = '—';
    let topCount = 0;
    for (const [user, count] of Object.entries(stats.topChatter)) {
        if (count > topCount) {
            topCount = count;
            topUser = user;
        }
    }
    return topUser !== '—' ? `${topUser} (${topCount})` : '—';
}

// Единый обработчик сообщений из панели
statsChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'request_stats') {
        console.log('📤 Принудительная отправка статистики по запросу');
        sendStatsToPanel();
    }
    if (event.data && event.data.type === 'reset_stats') {
        console.log('🗑️ Получена команда сброса статистики');
        resetStats();
        sendStatsToPanel();
    }
};

// Отправляем начальное состояние
setTimeout(() => {
    sendStatsToPanel();
    console.log('📤 Начальная статистика отправлена');
}, 100);

// Обновляем статистику при переключении на вкладку
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('👁️ Вкладка активна, обновляем статистику');
        sendStatsToPanel();
    }
});

// ==========================================
// ПРОВЕРКА СТАТУСА КАНАЛА (LIVE/OFFLINE)
// ==========================================
let isChannelLive = false;
let channelCheckInterval = null;

async function checkChannelStatus() {
    const channel = TWITCH_CHANNEL;
    if (!channel) return;
    
    try {
        // Используем decapi.me как основной метод (не требует API ключей)
        const response = await fetch(`https://decapi.me/twitch/uptime/${channel}`);
        if (response.ok) {
            const uptime = await response.text();
            isChannelLive = !uptime.toLowerCase().includes('is offline') && uptime.trim() !== '';
        } else {
            // Fallback: другой сервис
            const altResponse = await fetch(`https://api.gempir.com/stream/${channel}`);
            if (altResponse.ok) {
                const data = await altResponse.json();
                isChannelLive = data.live || false;
            }
        }
        updateLiveStatus();
        console.log(`📺 Канал ${channel}: ${isChannelLive ? 'LIVE ✅' : 'OFFLINE ❌'}`);
    } catch (err) {
        console.error('Ошибка проверки статуса канала:', err);
    }
}

function updateLiveStatus() {
    const statusElement = document.getElementById('statsStatus');
    if (!statusElement) return;
    
    if (isChannelLive) {
        statusElement.textContent = '● LIVE';
        statusElement.style.color = '#4caf50';
    } else {
        statusElement.textContent = '● OFFLINE';
        statusElement.style.color = '#ef5350';
    }
}

function startChannelStatusCheck() {
    checkChannelStatus();
    if (channelCheckInterval) {
        clearInterval(channelCheckInterval);
    }
    channelCheckInterval = setInterval(checkChannelStatus, 30000);
}

function stopChannelStatusCheck() {
    if (channelCheckInterval) {
        clearInterval(channelCheckInterval);
        channelCheckInterval = null;
    }
}

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
const messageQueue = [];
let isRendering = false;

let sevenTVEmotes = {};
let bttvEmotes = {};
let ffzEmotes = {};

let badgeMap = {};
let channelBadgeMap = {};
const chat = document.getElementById("chat");

// ==========================================
// ЗАГРУЗКА СМАЙЛИКОВ
// ==========================================
async function load7TVEmotes() {
    try {
        const response = await fetch(`https://7tv.io/v3/users/twitch/${TWITCH_USER_ID}`);
        if (!response.ok) throw new Error("7TV API error");
        
        const data = await response.json();
        if (data.emote_set && data.emote_set.emotes) {
            data.emote_set.emotes.forEach(emote => {
                sevenTVEmotes[emote.name] = `https:${emote.data.host.url}/4x.webp`;
            });
        }
        console.log(`7TV loaded: ${Object.keys(sevenTVEmotes).length} emotes`);
    } catch (err) {
        console.error("Failed to load 7TV emotes:", err);
    }
}

async function loadBTTVEmotes() {
    try {
        const response = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${TWITCH_USER_ID}`);
        if (!response.ok) {
            console.log("No BTTV emotes for this channel");
            return;
        }
        const data = await response.json();
        const allEmotes = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
        allEmotes.forEach(emote => {
            bttvEmotes[emote.code] = `https://cdn.betterttv.net/emote/${emote.id}/3x`;
        });
        console.log("BTTV loaded:", Object.keys(bttvEmotes).length);
    } catch (err) {
        console.error(err);
    }
}

async function loadBTTVGlobalEmotes() {
    try {
        const response = await fetch("https://api.betterttv.net/3/cached/emotes/global");
        const data = await response.json();
        data.forEach(emote => {
            bttvEmotes[emote.code] = `https://cdn.betterttv.net/emote/${emote.id}/3x`;
        });
        console.log("BTTV global loaded:", Object.keys(bttvEmotes).length);
    } catch (err) {
        console.error("BTTV global error:", err);
    }
}

// ==========================================
// ЗАГРУЗКА ЗНАЧКОВ (BADGES)
// ==========================================
async function loadBadges() {
    try {
        const res = await fetch(`${API_URL}/badges/global`);
        if (!res.ok) {
            console.warn("Badges API not ok");
            return;
        }
        const data = await res.json();
        if (!data?.data) return;
        data.data.forEach(set => {
            badgeMap[set.set_id] = {};
            set.versions.forEach(version => {
                badgeMap[set.set_id][version.id] = version.image_url_1x;
            });
        });
        console.log("Badges loaded");
    } catch (err) {
        console.warn("Badges failed:", err);
    }
}

async function loadChannelBadges() {
    try {
        const res = await fetch(`${API_URL}/badges/channel/${TWITCH_USER_ID}`);
        const json = await res.json();
        const data = json.data || [];
        if (!data.length) {
            console.log("ℹ️ No channel badges for this user");
            return;
        }
        for (const set of data) {
            const setId = set.set_id || set.id;
            if (!setId) continue;
            channelBadgeMap[setId] = {};
            for (const version of set.versions || []) {
                if (!version?.id) continue;
                channelBadgeMap[setId][version.id] =
                    version.image_url_1x ||
                    version.image_url_2x ||
                    version.image_url_4x;
            }
        }
        console.log("✅ Channel badges loaded:", Object.keys(channelBadgeMap).length);
    } catch (err) {
        console.warn("Channel badges failed:", err);
    }
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function getThirdPartyEmote(word) {
    if (emoteCache.has(word)) {
        return emoteCache.get(word);
    }
    const url = sevenTVEmotes[word] || bttvEmotes[word] || ffzEmotes[word];
    if (!url) return null;
    emoteCache.set(word, url);
    return url;
}

function escapeHTML(str = "") {
    return String(str).replace(/[&<>"']/g, match => {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escapeMap[match];
    });
}

function buildBadges(badgesString) {
    if (!badgesString) return "";
    let html = "";
    const badges = badgesString.split(",");
    badges.forEach(badge => {
        const parts = badge.split("/");
        const set = parts[0];
        const version = parts[1] || '1';
        const url = channelBadgeMap?.[set]?.[version] || badgeMap?.[set]?.[version];
        if (url) {
            html += `<img class="badge" src="${url}" alt="${set}" title="${set}">`;
        }
    });
    return html;
}

function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function randomColor() {
    const colors = ["#FF0000", "#00FF00", "#0099FF", "#FF9900", "#CC00FF", "#FF66CC", "#FFFF00", "#00FFFF"];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ==========================================
// ПАРСИНГ СМАЙЛИКОВ
// ==========================================
async function loadFFZGlobalEmotes() {
    try {
        const response = await fetch("https://api.frankerfacez.com/v1/set/global");
        const data = await response.json();
        const sets = data.sets || {};
        Object.values(sets).forEach(set => {
            if (!set.emoticons) return;
            set.emoticons.forEach(emote => {
                const name = emote.name;
                const url = emote.urls["4"] || emote.urls["2"] || emote.urls["1"];
                if (!name || !url) return;
                ffzEmotes[name] = url.startsWith("//") ? "https:" + url : url;
            });
        });
        console.log("FFZ loaded:", Object.keys(ffzEmotes).length);
    } catch (err) {
        console.error("FFZ error:", err);
    }
}

async function loadFFZChannelEmotes() {
    try {
        const response = await fetch(`https://api.frankerfacez.com/v1/room/id/${TWITCH_USER_ID}`);
        const data = await response.json();
        const sets = data.sets || {};
        Object.values(sets).forEach(set => {
            if (!set.emoticons) return;
            set.emoticons.forEach(emote => {
                const name = emote.name;
                const url = emote.urls["4"] || emote.urls["2"] || emote.urls["1"];
                if (!name || !url) return;
                ffzEmotes[name] = url.startsWith("//") ? "https:" + url : url;
            });
        });
        console.log("FFZ channel loaded:", Object.keys(ffzEmotes).length);
    } catch (err) {
        console.error("FFZ channel error:", err);
    }
}

function parseAllEmotes(text, twitchEmotesRaw) {
    if (!twitchEmotesRaw) {
        return parseThirdPartyEmotes(escapeHTML(text));
    }
    try {
        let nodes = [];
        const emotesData = twitchEmotesRaw.split('/').filter(Boolean);
        emotesData.forEach(emote => {
            const [id, positions] = emote.split(':');
            if (!id || !positions) return;
            positions.split(',').forEach(pos => {
                const [start, end] = pos.split('-').map(Number);
                nodes.push({ id, start, end });
            });
        });
        nodes.sort((a, b) => a.start - b.start);
        let finalHTML = "";
        let lastIndex = 0;
        nodes.forEach(node => {
            if (node.start > lastIndex) {
                finalHTML += escapeHTML(text.substring(lastIndex, node.start));
            }
            const emoteName = escapeHTML(text.substring(node.start, node.end + 1));
            finalHTML += `
                <img class="emote" 
                     src="https://static-cdn.jtvnw.net/emoticons/v2/${node.id}/default/dark/3.0"
                     alt="${emoteName}"
                     title="${emoteName}"
                     loading="lazy">
            `;
            lastIndex = node.end + 1;
        });
        if (lastIndex < text.length) {
            finalHTML += escapeHTML(text.substring(lastIndex));
        }
        return parseThirdPartyEmotes(finalHTML);
    } catch (e) {
        console.error("Ошибка парсера:", e);
        return escapeHTML(text);
    }
}

function parseThirdPartyEmotes(htmlString) {
    return htmlString
        .split(/(\s+)/)
        .map(part => {
            if (/^\s+$/.test(part)) return part;
            if (part.includes("<img") || part.includes("src=") || part.includes("class=")) {
                return part;
            }
            const match = part.match(/^([.,\/#!$%\^&\*;:{}=\-_`~()]*)(.*?)([.,\/#!$%\^&\*;:{}=\-_`~()]*)$/);
            if (!match) return part;
            const [, leadingPunct, coreWord, trailingPunct] = match;
            const url = getThirdPartyEmote(coreWord);
            if (!url) return part;
            return `
                ${leadingPunct}
                <img class="emote" src="${url}" alt="${coreWord}" title="${coreWord}">
                ${trailingPunct}
            `;
        })
        .join("");
}

function buildEmoteCache() {
    emoteCache.clear();
    for (const [k, v] of Object.entries(sevenTVEmotes)) {
        emoteCache.set(k, v);
    }
    for (const [k, v] of Object.entries(bttvEmotes)) {
        emoteCache.set(k, v);
    }
    for (const [k, v] of Object.entries(ffzEmotes)) {
        emoteCache.set(k, v);
    }
    console.log("🔥 Emote cache built:", emoteCache.size);
}

// ==========================================
// ОПРЕДЕЛЕНИЕ АКТИВНОСТЕЙ
// ==========================================
function detectActivity(message, user, badges) {
    const text = message.toLowerCase();
    const result = { type: null, class: '', displayName: user };

    if (text.includes('рейд') || text.includes('raid') || text.includes('привел') || text.includes('привела')) {
        result.type = 'raid'; result.class = 'raid';
    } else if ((badges && badges.includes('first_message')) || text.includes('первое сообщение')) {
        result.type = 'first-message'; result.class = 'first-message';
    } else if (text.includes('подарил') || text.includes('gift') || text.includes('подписку') || text.includes('саб') || text.includes('sub')) {
        result.type = 'gift-sub'; result.class = 'gift-sub';
    } else if (text.includes('vip') && (text.includes('назначил') || text.includes('стал') || text.includes('получил'))) {
        result.type = 'vip-assign'; result.class = 'vip-assign';
    } else if (text.includes('день рождения') || text.includes('happy birthday') || text.includes('с днём рождения')) {
        result.type = 'birthday'; result.class = 'birthday';
    } else if (text.includes('модератор') || text.includes('moderator')) {
        result.type = 'mod-assign'; result.class = 'mod-assign';
    }
    return result;
}

// ==========================================
// ГЛАВНАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ СООБЩЕНИЯ
// ==========================================
function addMessageWithHTML(user, readyHtmlText, color = "#ffffff", badgesString = "") {
    messageQueue.push({ user, readyHtmlText, color, badgesString });
    if (!isRendering) {
        processQueue();
    }
}

function processQueue() {
    if (messageQueue.length === 0) {
        isRendering = false;
        return;
    }
    isRendering = true;
    const { user, readyHtmlText, color, badgesString } = messageQueue.shift();
    if (!chat) {
        isRendering = false;
        return;
    }
    const limit = MAX_MESSAGES || 10;
    const el = document.createElement("div");
    el.className = "message";
    
    const activity = detectActivity(readyHtmlText, user, badgesString);
    
    if (activity.class) {
        el.classList.add(activity.class);
        el.classList.add('activity');
    }
    
    el.classList.add(`enter-${ENTER_ANIM}`);
    
    if (badgesString.includes("broadcaster")) {
        el.classList.add("broadcaster");
    }
    if (badgesString.includes("moderator")) {
        el.classList.add("moderator");
    }
    if (badgesString.includes("vip")) {
        el.classList.add("vip");
    }
    
    const badgeHTML = buildBadges(badgesString);
    const safeUser = escapeHTML(user);
    const timeHTML = SHOW_TIME ? `<span class="time">[${getCurrentTime()}]</span>` : '';
    
    // 🔥 Добавляем иконку для первого сообщения
    let activityIcon = '';
    if (activity.type === 'first-message') {
        activityIcon = '<span class="first-icon">🌸</span>';
    }
    
    el.innerHTML = `
        ${timeHTML}
        ${badgeHTML}
        ${activityIcon}
        <span class="username" style="color:${color}">
            ${safeUser}
        </span>: ${readyHtmlText}
    `;
    
    chat.prepend(el);
    chat.style.opacity = "1";
    
    while (chat.children.length > limit) {
        chat.removeChild(chat.lastElementChild);
    }
    
    if (typeof processRealMessageForStats === 'function') {
        processRealMessageForStats(user, readyHtmlText, badgesString);
    }
    
    const hideSeconds = HIDE_TIME || 20;
    if (hideSeconds > 0) {
        setTimeout(() => {
            if (!el.isConnected) return;
            el.classList.remove(`enter-${ENTER_ANIM}`);
            el.classList.add(`exit-${EXIT_ANIM}`);
            setTimeout(() => {
                if (el.isConnected) {
                    el.remove();
                }
            }, 500);
        }, hideSeconds * 1000);
    }
    requestAnimationFrame(() => {
        processQueue();
    });
}

// ==========================================
// ПОДКЛЮЧЕНИЕ К TWITCH
// ==========================================
function connectToTwitch() {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        return;
    }
    if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onopen = null;
        try {
            socket.close();
        } catch (e) {}
    }
    if (reconnectAttempts > 10) {
        console.error("❌ Too many reconnect attempts. Stopping.");
        return;
    }
    socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    socket.onopen = () => {
        console.log(`Connected to Twitch chat: #${TWITCH_CHANNEL}`);
        reconnectAttempts = 0;
        socket.send("CAP REQ :twitch.tv/tags");
        socket.send("CAP REQ :twitch.tv/commands");
        socket.send("CAP REQ :twitch.tv/membership");
        socket.send("PASS SCHMOOPIIE");
        socket.send("NICK justinfan" + Math.floor(10000 + Math.random() * 90000));
        socket.send(`JOIN #${TWITCH_CHANNEL}`);
    };
    
    socket.onmessage = (event) => {
        const raw = event.data;
        if (!raw.includes("PRIVMSG")) return;
        
        const userMatch = raw.match(/display-name=([^;]*)/);
        const loginMatch = raw.match(/:(\w+)!/);
        const user = userMatch?.[1] || loginMatch?.[1] || "unknown";
        
        const tmiTarget = `PRIVMSG #${TWITCH_CHANNEL} :`;
        const index = raw.indexOf(tmiTarget);
        if (index === -1) return;
        
        const text = raw.substring(index + tmiTarget.length).trim();
        
        // 🔥 ЦВЕТ: если не указан — используем случайный
        const colorMatch = raw.match(/color=([^;]*)/);
        const color = colorMatch?.[1] || randomColor();
        
        const badgesMatch = raw.match(/badges=([^;]*)/);
        const badges = badgesMatch?.[1] || "";
        
        let twitchEmotesRaw = "";
        const tags = raw.split(";");
        for (let t of tags) {
            if (t.startsWith("emotes=")) {
                twitchEmotesRaw = t.split("=")[1] || "";
                break;
            }
        }
        
        const finalHTML = parseAllEmotes(text, twitchEmotesRaw);
        addMessageWithHTML(user, finalHTML, color, badges);
    };
    
    socket.onerror = (err) => {
        console.error("WS error:", err);
    };
    socket.onclose = () => {
        reconnectAttempts++;
        const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 60000);
        console.log(`Socket closed. Reconnecting in ${delay}ms... (${reconnectAttempts})`);
        setTimeout(connectToTwitch, delay);
    };
}

if (chat && chat.children.length === 0) {
    chat.style.opacity = "0";
} else if (chat) {
    chat.style.opacity = "1";
}

async function fetchTwitchUser(login) {
    if (!login) return;
    const twitchIdInput = document.getElementById("twitchId");
    if (!twitchIdInput) return;
    try {
        const res = await fetch(`${API_URL}/user/${login}`);
        const data = await res.json();
        const user = data.data?.[0];
        if (!user) return;
        twitchIdInput.value = user.id;
        if (typeof generateUrl === 'function') {
            generateUrl();
        }
    } catch (err) {
        console.error("User lookup failed:", err);
    }
}

// ==========================================
// ТОЧКА ВХОДА
// ==========================================
async function loadAllChatAssets() {
    console.log("🚀 Loading chat assets...");
    const start = performance.now();
    const results = await Promise.allSettled([
        loadBadges(),
        loadChannelBadges(),
        load7TVEmotes(),
        loadBTTVEmotes(),
        loadBTTVGlobalEmotes(),
        loadFFZGlobalEmotes(),
        loadFFZChannelEmotes()
    ]);
    const names = ['Badges', 'ChannelBadges', '7TV', 'BTTV', 'BTTV Global', 'FFZ Global', 'FFZ Channel'];
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            console.log(`✅ ${names[i]} OK`);
        } else {
            console.log(`❌ ${names[i]} FAILED:`, result.reason?.message || 'Unknown error');
        }
    });
    console.log("🏁 TOTAL:", Math.round(performance.now() - start), "ms");
    buildEmoteCache();
}

console.log("📊 Emotes:", {
    sevenTV: Object.keys(sevenTVEmotes).length,
    bttv: Object.keys(bttvEmotes).length,
    ffz: Object.keys(ffzEmotes).length,
    total: emoteCache.size
});

(async () => {
    await loadAllChatAssets();
    connectToTwitch();
})();