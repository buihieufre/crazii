const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const next = require('next');
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
    return JSON.parse(payloadStr);
  } catch (e) {
    return null;
  }
}

/**
 * Helper to get active Refresh Token (3-Day token)
 */
function getActiveRefreshToken() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^REFRESH_TOKEN=(.*)$/m);
      if (match && match[1].trim() && !match[1].includes('PLACEHOLDER')) {
        return match[1].trim();
      }
    }
  } catch (e) { }
  return process.env.REFRESH_TOKEN || '';
}

/**
 * Helper to get active Device ID
 */
function getActiveDeviceId() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^DEVICE_ID=(.*)$/m);
      if (match && match[1].trim() && !match[1].includes('PLACEHOLDER')) {
        return match[1].trim();
      }
    }
  } catch (e) { }
  return process.env.DEVICE_ID || 'fb70bf82-5d83-4c70-b7e6-9896bda770e7';
}

/**
 * Helper to get active Access/Auth Token (15-Minute token)
 */
function getActiveAuthToken(req) {
  if (req && req.query && req.query.token) {
    const qJwt = decodeJwt(req.query.token);
    const nowSec = Math.floor(Date.now() / 1000);
    if (qJwt && qJwt.exp && qJwt.exp > nowSec) {
      return req.query.token;
    }
  }

  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.trim() && !process.env.AUTH_TOKEN.includes('PLACEHOLDER')) {
    return process.env.AUTH_TOKEN.trim();
  }

  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^AUTH_TOKEN=(.*)$/m);
      if (match && match[1].trim() && !match[1].includes('PLACEHOLDER')) {
        return match[1].trim();
      }
    }
  } catch (e) { }

  return '';
}

/**
 * Helper to persist tokens to .env file and memory
 */
function updateEnvTokens({ authToken, refreshToken }) {
  try {
    const envPath = path.join(__dirname, '.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (authToken) {
      const cleanAuth = authToken.replace(/^Bearer\s+/i, '').trim();
      process.env.AUTH_TOKEN = cleanAuth;
      if (/^AUTH_TOKEN=/m.test(content)) {
        content = content.replace(/^AUTH_TOKEN=.*$/m, `AUTH_TOKEN=${cleanAuth}`);
      } else {
        content += `\nAUTH_TOKEN=${cleanAuth}\n`;
      }
    }

    if (refreshToken) {
      const cleanRefresh = refreshToken.replace(/^Bearer\s+/i, '').trim();
      process.env.REFRESH_TOKEN = cleanRefresh;
      if (/^REFRESH_TOKEN=/m.test(content)) {
        content = content.replace(/^REFRESH_TOKEN=.*$/m, `REFRESH_TOKEN=${cleanRefresh}`);
      } else {
        content += `\nREFRESH_TOKEN=${cleanRefresh}\n`;
      }
    }

    fs.writeFileSync(envPath, content, 'utf8');
    console.log(`[Token] ✅ Successfully saved token(s) to .env!`);
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

  /**
   * Core Function: Execute Refresh Token with Crazii API using the 3-day Refresh Token
   */
  async function executeRefreshToken(customRefreshToken = null) {
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

      connectUpstreamWebSocket();

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
    }
  }

  // Background Scheduler: Auto-Refresh Access Token every 30s if <= 3 minutes left
  setInterval(async () => {
    const currentAuth = getActiveAuthToken();
    const jwt = decodeJwt(currentAuth);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!jwt || !jwt.exp || (jwt.exp - nowSec <= 180)) {
      console.log(`[Auto-Refresher] ⏳ Access token expiring or missing (TimeLeft: ${jwt?.exp ? jwt.exp - nowSec : 0}s). Auto-refreshing...`);
      await executeRefreshToken();
    }
  }, 30000);

  // REST API: /api/token-info
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

  // Upstream WebSocket Connection
  let targetSocket = null;
  let activeChannels = new Set(['price', 'XAUUSD.ca_5', 'XAUUSD.ca_15']);
  let isUpstreamConnected = false;
  let upstreamReconnectTimer = null;

  function connectUpstreamWebSocket() {
    const wsToken = getActiveAuthToken(null);
    const cleanToken = wsToken.startsWith('Bearer ') ? wsToken.replace('Bearer ', '') : wsToken;
    const deviceId = getActiveDeviceId();

    const wsHost = 'https://tick-ws.crazii.com';
    console.log(`[WS Relay] Connecting to upstream WebSocket: ${wsHost}... (Token: ${cleanToken.slice(0, 15)}...)`);

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
      console.log(`[WS Relay] ✅ Connected to upstream Crazii WebSocket! Subscribing to channels: [${Array.from(activeChannels).join(', ')}]`);
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

      targetSocket.io.on('reconnect_failed', () => {
        console.error(`[WS Relay] ❌ Reconnection failed completely. Retrying in 3s...`);
        clearTimeout(upstreamReconnectTimer);
        upstreamReconnectTimer = setTimeout(connectUpstreamWebSocket, 3000);
      });
    }

    targetSocket.on('data', (payload) => {
      io.emit('data', payload);
    });

    targetSocket.on('price', (symbol, price) => {
      io.emit('price', symbol, price);
    });

    targetSocket.on('connect_error', (err) => {
      isUpstreamConnected = false;
      console.error(`[WS Relay] Connection error:`, err.message);
      io.emit('upstream_status', { connected: false, error: err.message });
    });

    targetSocket.on('disconnect', (reason) => {
      isUpstreamConnected = false;
      console.warn(`[WS Relay] Disconnected from upstream:`, reason);
      io.emit('upstream_status', { connected: false, reason: reason });
      if (reason === 'io server disconnect') {
        targetSocket.connect();
      }
    });
  }

  // Watchdog
  setInterval(() => {
    if (!targetSocket || (!targetSocket.connected && !isUpstreamConnected)) {
      if (targetSocket && typeof targetSocket.connect === 'function') {
        targetSocket.connect();
      }
    }
  }, 15000);

  // Local Frontend Socket.IO Connections
  io.on('connection', (clientSocket) => {
    clientSocket.on('subscribe', (channel) => {
      if (channel && typeof channel === 'string') {
        activeChannels.add(channel);
        if (targetSocket && targetSocket.connected) {
          targetSocket.emit('subscribe', channel);
        }
      }
    });
  });

  // Next.js Route Handler for all non-API routes
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  // Start Upstream WS & Auto-Renew Token on Startup
  (async () => {
    const auth = getActiveAuthToken();
    const jwt = decodeJwt(auth);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!jwt || !jwt.exp || jwt.exp <= nowSec + 60) {
      console.log(`[Startup] Access token is missing or expiring soon. Auto-renewing from Refresh Token...`);
      await executeRefreshToken();
    } else {
      connectUpstreamWebSocket();
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
