const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const next = require('next');
const { telegramSignalBot, TRADE_STATUS } = require('./src/lib/telegram-signal-bot');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

/**
 * Helper to decode JWT Payload without external dependencies
 */
function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
    const parsed = JSON.parse(payloadStr);
    if (parsed && typeof parsed === 'object') {
      delete parsed.upn;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

// --- IN-MEMORY TOKEN SINGLETON ---
let memoryAccessToken = '';
let memoryRefreshToken = '';
let memoryDeviceId = 'fb70bf82-5d83-4c70-b7e6-9896bda770e7';

function initTokensFromEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const authMatch = envContent.match(/^(?:CRAZII_ACCESS_TOKEN|CRAZII_AUTH_TOKEN|AUTH_TOKEN)=(.*)$/m);
      if (authMatch && authMatch[1].trim() && !authMatch[1].includes('PLACEHOLDER')) {
        memoryAccessToken = authMatch[1].trim().replace(/^Bearer\s+/i, '');
      }
      const refMatch = envContent.match(/^(?:CRAZII_REFRESH_TOKEN|REFRESH_TOKEN)=(.*)$/m);
      if (refMatch && refMatch[1].trim() && !refMatch[1].includes('PLACEHOLDER')) {
        memoryRefreshToken = refMatch[1].trim().replace(/^Bearer\s+/i, '');
      }
      const devMatch = envContent.match(/^(?:CRAZII_DEVICE_ID|DEVICE_ID)=(.*)$/m);
      if (devMatch && devMatch[1].trim() && !devMatch[1].includes('PLACEHOLDER')) {
        memoryDeviceId = devMatch[1].trim();
      }
    }
  } catch (e) {}

  if (!memoryAccessToken) {
    memoryAccessToken = (process.env.CRAZII_ACCESS_TOKEN || process.env.CRAZII_AUTH_TOKEN || process.env.AUTH_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  }
  if (!memoryRefreshToken) {
    memoryRefreshToken = (process.env.CRAZII_REFRESH_TOKEN || process.env.REFRESH_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  }
  if (!memoryDeviceId || memoryDeviceId.includes('PLACEHOLDER')) {
    memoryDeviceId = (process.env.CRAZII_DEVICE_ID || process.env.DEVICE_ID || 'fb70bf82-5d83-4c70-b7e6-9896bda770e7').trim();
  }
}
initTokensFromEnv();

/**
 * Helper to get active Refresh Token (3-Day token)
 */
function getActiveRefreshToken() {
  return memoryRefreshToken || '';
}

/**
 * Helper to get active Device ID
 */
function getActiveDeviceId() {
  return memoryDeviceId || 'fb70bf82-5d83-4c70-b7e6-9896bda770e7';
}

/**
 * Helper to get active Access/Auth Token (15-Minute token)
 */
function getActiveAuthToken(req) {
  if (req && req.query && req.query.token) {
    const qJwt = decodeJwt(req.query.token);
    const nowSec = Math.floor(Date.now() / 1000);
    if (qJwt && qJwt.exp && qJwt.exp > nowSec) {
      return req.query.token.replace(/^Bearer\s+/i, '').trim();
    }
  }
  return memoryAccessToken || '';
}

/**
 * Helper to persist tokens to memory and .env file
 */
function updateEnvTokens({ authToken, refreshToken }) {
  try {
    const envPath = path.join(__dirname, '.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (authToken) {
      const cleanAuth = authToken.replace(/^Bearer\s+/i, '').trim();
      memoryAccessToken = cleanAuth;
      process.env.CRAZII_ACCESS_TOKEN = cleanAuth;
      delete process.env.CRAZII_AUTH_TOKEN;
      delete process.env.AUTH_TOKEN;

      if (/^CRAZII_ACCESS_TOKEN=/m.test(content)) {
        content = content.replace(/^CRAZII_ACCESS_TOKEN=.*$/m, `CRAZII_ACCESS_TOKEN=${cleanAuth}`);
      } else if (/^AUTH_TOKEN=/m.test(content)) {
        content = content.replace(/^AUTH_TOKEN=.*$/m, `CRAZII_ACCESS_TOKEN=${cleanAuth}`);
      } else {
        content += `\nCRAZII_ACCESS_TOKEN=${cleanAuth}\n`;
      }
    }

    if (refreshToken) {
      const cleanRefresh = refreshToken.replace(/^Bearer\s+/i, '').trim();
      memoryRefreshToken = cleanRefresh;
      process.env.CRAZII_REFRESH_TOKEN = cleanRefresh;
      delete process.env.REFRESH_TOKEN;

      if (/^CRAZII_REFRESH_TOKEN=/m.test(content)) {
        content = content.replace(/^CRAZII_REFRESH_TOKEN=.*$/m, `CRAZII_REFRESH_TOKEN=${cleanRefresh}`);
      } else if (/^REFRESH_TOKEN=/m.test(content)) {
        content = content.replace(/^REFRESH_TOKEN=.*$/m, `CRAZII_REFRESH_TOKEN=${cleanRefresh}`);
      } else {
        content += `\nCRAZII_REFRESH_TOKEN=${cleanRefresh}\n`;
      }
    }

    const existingContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (existingContent.trim() !== content.trim()) {
      fs.writeFileSync(envPath, content, 'utf8');
      console.log(`[Token] ✅ Successfully saved token(s) to .env!`);
    }
    return true;
  } catch (err) {
    console.error(`[Token] Failed to write token to .env:`, err.message);
    return false;
  }
}

// Prepare Next.js App
nextApp.prepare().then(() => {
  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // Initialize Local Socket.IO Server
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Mutex for single-flight token refresh
  let inFlightRefreshPromise = null;

  /**
   * Core Function: Execute Refresh Token with Crazii API using the 3-day Refresh Token
   */
  async function executeRefreshToken(customRefreshToken = null, force = false) {
    // If no custom token is passed and force is false, check if the current token is still valid (> 2 minutes left)
    if (!customRefreshToken && !force) {
      const currentAuth = getActiveAuthToken();
      const jwt = decodeJwt(currentAuth);
      const nowSec = Math.floor(Date.now() / 1000);
      if (jwt && jwt.exp && (jwt.exp - nowSec > 120)) {
        return {
          success: true,
          token: currentAuth,
          accessToken: currentAuth,
          accessPayload: jwt,
          refreshPayload: decodeJwt(getActiveRefreshToken())
        };
      }
    }

    // Single-flight deduplication: If a refresh is already in flight, reuse its promise
    if (inFlightRefreshPromise) {
      return await inFlightRefreshPromise;
    }

    inFlightRefreshPromise = (async () => {
      const refreshToken = (customRefreshToken || getActiveRefreshToken()).replace(/^Bearer\s+/i, '').trim();
      const deviceId = getActiveDeviceId();

      if (!refreshToken || refreshToken.includes('PLACEHOLDER')) {
        console.warn(`[Token Refresh] ❌ No valid REFRESH_TOKEN found to generate new Access Token.`);
        return { success: false, message: 'No valid Refresh Token configured. Please set REFRESH_TOKEN in .env or UI.' };
      }

      const targetUrl = 'https://sale-api.crazii.com/api/v1/users/refresh-token';
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Device-Id': deviceId,
        'Origin': 'https://crazii.com',
        'Referer': 'https://crazii.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0'
      };

      console.log(`[Token Refresh] 🔄 Refreshing 15-minute Access Token using 3-day Refresh Token...`);
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ token: refreshToken })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[Token Refresh] ❌ Crazii API rejected refresh request (${response.status}): ${errText}`);
          return { success: false, status: response.status, message: 'Refresh Token rejected by Crazii', raw: errText };
        }

        const data = await response.json();
        let newAccessToken = null;
        let newRefreshToken = null;

        if (data && data.data) {
          newAccessToken = data.data.accessToken;
          newRefreshToken = data.data.refreshToken;
        } else if (data && data.accessToken) {
          newAccessToken = data.accessToken;
        }

        if (!newAccessToken) {
          console.warn(`[Token Refresh] ⚠️ Response did not contain accessToken:`, data);
          return { success: false, message: 'No accessToken in response', data };
        }

        const decodedAccess = decodeJwt(newAccessToken);
        const decodedRefresh = decodeJwt(newRefreshToken || refreshToken);

        console.log(`[Token Refresh] 🎉 Got new Access Token! (Expires in ~15 mins: ${new Date((decodedAccess?.exp || 0) * 1000).toLocaleTimeString()})`);

        updateEnvTokens({
          authToken: newAccessToken,
          refreshToken: newRefreshToken || (customRefreshToken ? refreshToken : null)
        });

        // Reconnect upstream WebSocket if active channels are registered
        if (activeChannels.size > 0) {
          connectUpstreamWebSocket();
        }

        io.emit('token_refreshed', {
          success: true,
          token: newAccessToken,
          accessToken: newAccessToken,
          accessPayload: decodedAccess,
          refreshPayload: decodedRefresh,
          timestamp: Date.now()
        });

        return {
          success: true,
          token: newAccessToken,
          accessToken: newAccessToken,
          accessPayload: decodedAccess,
          refreshPayload: decodedRefresh
        };
      } catch (error) {
        console.error(`[Token Refresh Error]`, error.message);
        return { success: false, error: error.message };
      } finally {
        inFlightRefreshPromise = null;
      }
    })();

    return await inFlightRefreshPromise;
  }

  // Background Scheduler: Proactively auto-refresh Access Token every 30s only when <= 2 minutes left
  setInterval(async () => {
    const currentAuth = getActiveAuthToken();
    const jwt = decodeJwt(currentAuth);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!jwt || !jwt.exp || (jwt.exp - nowSec <= 120)) {
      console.log(`[Auto-Refresher] ⏳ Access token expiring soon (TimeLeft: ${jwt?.exp ? jwt.exp - nowSec : 0}s). Proactively auto-refreshing in background...`);
      await executeRefreshToken();
    }
  }, 30000);

  // REST API: /api/token-info (Pure query without triggering redundant refreshes)
  app.get('/api/token-info', (req, res) => {
    const auth = getActiveAuthToken(req);
    const refresh = getActiveRefreshToken();
    const nowSec = Math.floor(Date.now() / 1000);

    const authJwt = decodeJwt(auth);
    const refreshJwt = decodeJwt(refresh);

    const authExp = authJwt && authJwt.exp ? authJwt.exp : 0;
    const refreshExp = refreshJwt && refreshJwt.exp ? refreshJwt.exp : 0;

    return res.json({
      accessToken: {
        hasToken: Boolean(auth && !auth.includes('PLACEHOLDER')),
        preview: auth ? `${auth.slice(0, 15)}...${auth.slice(-10)}` : null,
        expiresAt: authExp > 0 ? new Date(authExp * 1000).toISOString() : null,
        timeLeftSeconds: Math.max(0, authExp - nowSec),
        isExpired: authExp > 0 ? nowSec >= authExp : true,
        payload: authJwt
      },
      refreshToken: {
        hasToken: Boolean(refresh && !refresh.includes('PLACEHOLDER')),
        preview: refresh ? `${refresh.slice(0, 15)}...${refresh.slice(-10)}` : null,
        expiresAt: refreshExp > 0 ? new Date(refreshExp * 1000).toISOString() : null,
        timeLeftSeconds: Math.max(0, refreshExp - nowSec),
        isExpired: refreshExp > 0 ? nowSec >= refreshExp : true,
        payload: refreshJwt
      }
    });
  });

  // REST API: /api/refresh-token
  app.post('/api/refresh-token', async (req, res) => {
    const customRefreshToken = req.body && req.body.refreshToken ? req.body.refreshToken : (req.body && req.body.token ? req.body.token : null);
    const result = await executeRefreshToken(customRefreshToken);
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(result.status || 500).json(result);
    }
  });

  // REST API: /api/set-refresh-token
  app.post('/api/set-refresh-token', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Refresh Token provided' });
    }

    const cleanRefresh = refreshToken.replace(/^Bearer\s+/i, '').trim();
    updateEnvTokens({ refreshToken: cleanRefresh });

    const refreshResult = await executeRefreshToken(cleanRefresh);
    return res.json({
      success: refreshResult.success,
      message: refreshResult.success ? 'Refresh Token saved & Access Token renewed!' : refreshResult.message,
      result: refreshResult
    });
  });

  // REST API: /api/update-token
  app.post('/api/update-token', (req, res) => {
    const { token, refreshToken } = req.body;
    if (refreshToken) updateEnvTokens({ refreshToken });
    if (token) {
      const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
      updateEnvTokens({ authToken: cleanToken });
      connectUpstreamWebSocket();
    }
    return res.json({ success: true, message: 'Tokens updated successfully' });
  });

  // ==========================================
  // TELEGRAM SIGNAL BOT REST API ENDPOINTS
  // ==========================================

  // GET /api/bot/config
  app.get('/api/bot/config', (req, res) => {
    return res.json({
      success: true,
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/config
  app.post('/api/bot/config', (req, res) => {
    const success = telegramSignalBot.saveConfig(req.body);
    syncBotChannels();
    return res.json({
      success: success,
      message: success ? 'Cấu hình Bot Telegram đã được lưu thành công!' : 'Lỗi khi lưu cấu hình',
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/test
  app.post('/api/bot/test', async (req, res) => {
    const { botToken, chatId, message } = req.body;
    const testText = message || `🤖 <b>CRAZII TELEGRAM SIGNAL BOT</b>\n\n✅ <i>Kết nối thành công!</i>\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n⚡ Hệ thống Live Tracking tín hiệu đã sẵn sàng!`;
    const result = await telegramSignalBot.sendTelegramMessage(testText, { botToken, chatId });
    if (result.success) {
      return res.json({ success: true, message: 'Đã gửi tin nhắn thử nghiệm thành công tới Telegram!', result });
    } else {
      return res.status(400).json({ success: false, message: result.error || 'Không thể gửi tin nhắn tới Telegram. Vui lòng kiểm tra Bot Token và Chat ID.', result });
    }
  });

  // GET /api/bot/trades
  app.get('/api/bot/trades', (req, res) => {
    return res.json({
      success: true,
      activeTrades: Array.from(telegramSignalBot.activeTrades.values()),
      tradeHistory: telegramSignalBot.tradeHistory,
      stats: telegramSignalBot.getStatusPayload().stats
    });
  });

  // POST /api/bot/trades/test-signal (Interactive simulator trigger)
  app.post('/api/bot/trades/test-signal', async (req, res) => {
    const result = await telegramSignalBot.triggerTestSignal(req.body);
    return res.json(result);
  });

  // POST /api/bot/trades/:id/simulate-status (Interactive simulator state update & live edit)
  app.post('/api/bot/trades/:id/simulate-status', async (req, res) => {
    const tradeId = req.params.id;
    const { status, reason } = req.body;
    const trade = telegramSignalBot.activeTrades.get(tradeId);
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    await telegramSignalBot.transitionTradeStatus(trade, Number(status), reason || 'Simulated state change');
    return res.json({ success: true, trade });
  });

  // POST /api/bot/trades/:id/close
  app.post('/api/bot/trades/:id/close', async (req, res) => {
    const tradeId = req.params.id;
    const status = req.body.status !== undefined ? Number(req.body.status) : TRADE_STATUS.CUT_EARLY_PROFIT;
    const result = await telegramSignalBot.manualCloseTrade(tradeId, status);
    return res.json(result);
  });

  // POST /api/bot/trades/clear-history
  app.post('/api/bot/trades/clear-history', (req, res) => {
    telegramSignalBot.tradeHistory = [];
    telegramSignalBot.saveTrades();
    return res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử lệnh!' });
  });

  // REST API: /api/candles
  app.get('/api/candles', async (req, res) => {
    const code = req.query.code || 'XAUUSD.ca_5';
    const targetUrl = `https://sale-api.crazii.com/api/v1/chart/candle?code=${encodeURIComponent(code)}`;

    let authToken = getActiveAuthToken(req);
    const deviceId = getActiveDeviceId();

    const jwt = decodeJwt(authToken);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!authToken || !jwt || !jwt.exp || jwt.exp <= nowSec) {
      console.log(`[REST] Active token missing or expired. Auto-renewing from Refresh Token...`);
      const refRes = await executeRefreshToken();
      if (refRes.success) {
        authToken = refRes.accessToken || refRes.token;
      }
    }

    console.log(`[${new Date().toISOString()}] REST Request for: ${code}`);

    const headers = {
      'Accept': 'application/json',
      'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
      'Device-Id': deviceId,
      'Origin': 'https://crazii.com',
      'Referer': 'https://crazii.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
      let response = await fetch(targetUrl, { method: 'GET', headers: headers });

      if (response.status === 401) {
        console.warn(`[REST 401] Token rejected. Attempting auto refresh-token...`);
        const refreshResult = await executeRefreshToken();
        if (refreshResult.success) {
          authToken = refreshResult.accessToken || refreshResult.token;
          headers['Authorization'] = `Bearer ${authToken}`;
          console.log(`[REST] Retrying candle fetch with freshly refreshed token...`);
          response = await fetch(targetUrl, { method: 'GET', headers: headers });
        }
      }

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          status: response.status,
          statusText: response.statusText,
          message: response.status === 401
            ? 'Unauthorized: Token expired or invalid. Please click 🔑 Token to refresh or update.'
            : `Target API Error: ${response.statusText}`,
          raw: errorText
        });
      }

      if (isJson) {
        const data = await response.json();
        return res.json(data);
      } else {
        const rawText = await response.text();
        return res.send(rawText);
      }
    } catch (error) {
      console.error(`[REST Error]`, error.message);
      return res.status(500).json({ success: false, message: 'Proxy fetch error', error: error.message });
    }
  });

  // Upstream WebSocket Connection (STRICTLY ON-DEMAND: Only connects when client selects an asset)
  let targetSocket = null;
  let activeChannels = new Set();
  let isUpstreamConnected = false;
  let upstreamReconnectTimer = null;

  function connectUpstreamWebSocket() {
    if (activeChannels.size === 0) {
      console.log(`[WS Relay] ⏸️ No active channels subscribed. Upstream WebSocket remains IDLE.`);
      return;
    }

    const wsToken = getActiveAuthToken(null);
    const cleanToken = wsToken.startsWith('Bearer ') ? wsToken.replace('Bearer ', '') : wsToken;
    const deviceId = getActiveDeviceId();

    const wsHost = 'https://tick-ws.crazii.com';
    console.log(`[WS Relay] ⚡ Connecting on-demand to upstream WebSocket: ${wsHost}... (Channels: [${Array.from(activeChannels).join(', ')}])`);

    if (targetSocket) {
      try {
        targetSocket.removeAllListeners();
        targetSocket.close();
      } catch (e) { }
    }

    targetSocket = ioClient(wsHost, {
      transports: ['websocket'],
      query: {
        role: 'downstream',
        token: cleanToken,
        deviceId: deviceId
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 10000,
      extraHeaders: {
        'Origin': 'https://crazii.com',
        'Referer': 'https://crazii.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
        'Device-Id': deviceId
      }
    });

    targetSocket.on('connect', () => {
      isUpstreamConnected = true;
      console.log(`[WS Relay] ✅ Connected to upstream Crazii WebSocket! Subscribing to: [${Array.from(activeChannels).join(', ')}]`);
      activeChannels.forEach(channel => {
        targetSocket.emit('subscribe', channel);
      });
      io.emit('upstream_status', { connected: true, timestamp: Date.now() });
    });

    if (targetSocket.io) {
      targetSocket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[WS Relay] 🔄 Reconnection attempt #${attempt} to upstream WebSocket...`);
        io.emit('upstream_status', { connected: false, reconnecting: true, attempt: attempt });
      });

      targetSocket.io.on('reconnect', (attempt) => {
        isUpstreamConnected = true;
        console.log(`[WS Relay] ✅ Successfully reconnected to upstream on attempt #${attempt}!`);
        activeChannels.forEach(channel => {
          targetSocket.emit('subscribe', channel);
        });
        io.emit('upstream_status', { connected: true, timestamp: Date.now() });
      });

      targetSocket.io.on('reconnect_error', (err) => {
        console.warn(`[WS Relay] ⚠️ Reconnection error:`, err.message);
      });

      targetSocket.io.on('reconnect_failed', async () => {
        console.error(`[WS Relay] ❌ Reconnection failed completely. Forcing token refresh & retrying in 3s...`);
        clearTimeout(upstreamReconnectTimer);
        if (activeChannels.size > 0) {
          upstreamReconnectTimer = setTimeout(async () => {
            if (activeChannels.size > 0) {
              await executeRefreshToken(null, true);
              connectUpstreamWebSocket();
            }
          }, 3000);
        }
      });
    }

    targetSocket.on('data', (...args) => {
      io.emit('data', ...args);
      try {
        telegramSignalBot.processDataEvent(args[0]);
      } catch (err) {
        console.error(`[Telegram Bot Error on Data]`, err.message);
      }
    });

    targetSocket.on('price', (...args) => {
      io.emit('price', ...args);
      try {
        telegramSignalBot.processTickEvent(args[0], args[1]);
      } catch (err) {
        console.error(`[Telegram Bot Error on Tick]`, err.message);
      }
    });

    targetSocket.on('connect_error', (err) => {
      isUpstreamConnected = false;
      console.error(`[WS Relay] Connection error:`, err.message);
      io.emit('upstream_status', { connected: false, error: err.message });

      const isAuthErr = err.message && (
        err.message.includes('401') || 
        err.message.includes('403') || 
        err.message.toLowerCase().includes('unauthorized') || 
        err.message.toLowerCase().includes('forbidden') ||
        err.message.toLowerCase().includes('websocket error')
      );

      if (isAuthErr && activeChannels.size > 0) {
        clearTimeout(upstreamReconnectTimer);
        upstreamReconnectTimer = setTimeout(async () => {
          if (activeChannels.size > 0) {
            console.log(`[WS Relay] 🔑 Auth/Handshake error detected. Refreshing token and reconnecting...`);
            await executeRefreshToken(null, true);
            connectUpstreamWebSocket();
          }
        }, 2000);
      }
    });

    targetSocket.on('disconnect', (reason) => {
      isUpstreamConnected = false;
      console.warn(`[WS Relay] Disconnected from upstream:`, reason);
      io.emit('upstream_status', { connected: false, reason: reason });

      // When Crazii server closes the socket (e.g. 15-min token expiration), force token refresh & reconnect
      if (activeChannels.size > 0) {
        clearTimeout(upstreamReconnectTimer);
        upstreamReconnectTimer = setTimeout(async () => {
          if (activeChannels.size > 0) {
            console.log(`[WS Relay] 🔄 Re-authenticating & reconnecting upstream WebSocket (Reason: ${reason})...`);
            await executeRefreshToken(null, true);
            connectUpstreamWebSocket();
          }
        }, 1500);
      }
    });
  }

  function disconnectUpstreamWebSocket() {
    clearTimeout(upstreamReconnectTimer);
    if (targetSocket) {
      console.log(`[WS Relay] 🛑 Disconnecting upstream WebSocket (Idle / No active asset)`);
      try {
        targetSocket.removeAllListeners();
        targetSocket.disconnect();
        targetSocket.close();
      } catch (e) { }
      targetSocket = null;
    }
    isUpstreamConnected = false;
    activeChannels.clear();
  }

  // Helper to sync bot monitored symbols into activeChannels
  function syncBotChannels() {
    if (telegramSignalBot.config.enabled && Array.isArray(telegramSignalBot.config.monitoredSymbols)) {
      telegramSignalBot.config.monitoredSymbols.forEach(sym => {
        if (sym && typeof sym === 'string') {
          activeChannels.add(sym.trim());
          const base = sym.split('_')[0];
          if (base) activeChannels.add(base);
        }
      });
      if (activeChannels.size > 0 && (!targetSocket || !targetSocket.connected)) {
        connectUpstreamWebSocket();
      }
    }
  }
  syncBotChannels();

  // Watchdog: Only keeps connection alive if there are active channels requested
  setInterval(async () => {
    if (activeChannels.size > 0) {
      if (!targetSocket || !targetSocket.connected || !isUpstreamConnected) {
        console.log(`[WS Watchdog] 🩺 Upstream socket disconnected with active channels [${Array.from(activeChannels).join(', ')}]. Checking token & reconnecting...`);
        const auth = getActiveAuthToken();
        const jwt = decodeJwt(auth);
        const nowSec = Math.floor(Date.now() / 1000);
        if (!jwt || !jwt.exp || (jwt.exp - nowSec <= 120)) {
          await executeRefreshToken(null, true);
        }
        connectUpstreamWebSocket();
      }
    }
  }, 15000);

  // Local Frontend Socket.IO Connections (On-Demand)
  io.on('connection', (clientSocket) => {
    clientSocket.emit('upstream_status', {
      connected: isUpstreamConnected,
      timestamp: Date.now()
    });

    clientSocket.on('subscribe', (channel) => {
      if (channel && typeof channel === 'string') {
        activeChannels.add(channel);
        activeChannels.add('price');
        if (!targetSocket || !targetSocket.connected) {
          connectUpstreamWebSocket();
        } else {
          targetSocket.emit('subscribe', channel);
          targetSocket.emit('subscribe', 'price');
        }
      }
    });

    clientSocket.on('unsubscribe', (channel) => {
      if (channel && typeof channel === 'string') {
        activeChannels.delete(channel);
        if (targetSocket && targetSocket.connected) {
          targetSocket.emit('unsubscribe', channel);
        }
        if (activeChannels.size === 0) {
          disconnectUpstreamWebSocket();
        }
      }
    });

    clientSocket.on('disconnect', () => {
      setTimeout(() => {
        if (io.sockets.sockets.size === 0) {
          disconnectUpstreamWebSocket();
        }
      }, 5000);
    });
  });

  // Next.js Route Handler for all non-API routes
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  // Startup Token Verification (Does NOT connect upstream WS until user clicks an asset)
  (async () => {
    const auth = getActiveAuthToken();
    const jwt = decodeJwt(auth);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!jwt || !jwt.exp || jwt.exp <= nowSec + 60) {
      console.log(`[Startup] Access token is missing or expiring soon. Verifying Refresh Token...`);
      await executeRefreshToken();
    }
  })();

  // Listen on PORT
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`====================================================`);
    console.log(`  🚀 CRAZII Next.js Pro Terminal is running!`);
    console.log(`  📊 Web App:      http://localhost:${PORT}`);
    console.log(`  🔌 REST API:     http://localhost:${PORT}/api/candles`);
    console.log(`  ⚡ Socket.IO WS: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}).catch((ex) => {
  console.error(ex.stack);
  process.exit(1);
});
