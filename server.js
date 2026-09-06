const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const next = require('next');
const { telegramSignalBot, TRADE_STATUS } = require('./src/lib/telegram-signal-bot');
const nodemailer = require('nodemailer');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Google OAuth 2.0 & Session Configuration
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_SECRET = (process.env.SESSION_SECRET || 'crazii_jwt_session_secret_key_super_secure_2026').trim();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined);

// Cryptomus Payment Configuration
const CRYPTOMUS_MERCHANT_ID = (process.env.CRYPTOMUS_MERCHANT_ID || '').trim();
const CRYPTOMUS_PAYMENT_API_KEY = (process.env.CRYPTOMUS_PAYMENT_API_KEY || '').trim();

// Admin Access Configuration
const ADMIN_SECRET_KEY = (process.env.ADMIN_SECRET_KEY || 'tradewh_admin_secret_key_2026').trim();
const ADMIN_EMAILS = [
  'dhieu9b@gmail.com',
  'buidinhhieu9b@gmail.com',
  (process.env.ADMIN_EMAIL || '').toLowerCase().trim()
].filter(Boolean);

function isUserAdmin(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  return ADMIN_EMAILS.includes(email) || user.role === 'admin';
}

function isUserSubscriptionActive(user) {
  if (!user) return false;
  if (isUserAdmin(user)) return true;
  if (user.subscriptionExpiry) {
    const expiryTime = new Date(user.subscriptionExpiry).getTime();
    return !isNaN(expiryTime) && expiryTime > Date.now();
  }
  return false;
}

// Active Sockets tracker for instant 0ms single-device kick-out
const activeUserSockets = new Map(); // userId -> Set of clientSocket instances

function kickoutUserSockets(userId, newDeviceId) {
  if (!userId) return;
  const sockets = activeUserSockets.get(userId);
  if (sockets && sockets.size > 0) {
    for (const s of sockets) {
      if (s.deviceId !== newDeviceId) {
        console.log(`[Single Device] ⚡ Forcefully logging out socket session for user ${userId}`);
        try {
          s.emit('force_logout', {
            code: 'DEVICE_SESSION_TERMINATED',
            message: 'Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.'
          });
          s.disconnect(true);
        } catch (e) {}
      }
    }
  }
}

// Cryptomus MD5 Signature Generator
function generateCryptomusSignature(payload, apiKey) {
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const base64Data = Buffer.from(jsonStr).toString('base64');
  return crypto.createHash('md5').update(base64Data + apiKey).digest('hex');
}

// Supabase Server Client Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// Local Registered Users Storage Helper
const USERS_FILE = path.join(__dirname, 'data', 'registered-users.json');

function getLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveLocalUser(userObj) {
  try {
    const list = getLocalUsers();
    const existingIdx = list.findIndex(u => (u.email && u.email.toLowerCase() === userObj.email.toLowerCase()) || (userObj.id && (u.id === userObj.id || u.sub === userObj.id)));
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...userObj, last_sign_in_at: new Date().toISOString() };
    } else {
      list.push({ ...userObj, created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local user:', e.message);
  }
}

async function findUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Try Supabase users table
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('users')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();
      if (!error && data) {
        return {
          ...data,
          currentDeviceId: data.current_device_id || data.currentDeviceId,
          subscriptionStatus: data.subscription_status !== undefined ? data.subscription_status : data.subscriptionStatus,
          subscriptionExpiry: data.subscription_expiry || data.subscriptionExpiry,
        };
      }
    } catch (e) {}
  }

  // 2. Try Local registered users store fallback
  const list = getLocalUsers();
  return list.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail) || null;
}

async function findUserById(id) {
  if (!id) return null;
  const strId = String(id).trim();

  // 1. Try Supabase users table
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('users')
        .select('*')
        .eq('id', strId)
        .maybeSingle();
      if (!error && data) {
        return {
          ...data,
          currentDeviceId: data.current_device_id || data.currentDeviceId,
          subscriptionStatus: data.subscription_status !== undefined ? data.subscription_status : data.subscriptionStatus,
          subscriptionExpiry: data.subscription_expiry || data.subscriptionExpiry,
        };
      }
    } catch (e) {}
  }

  // 2. Try Local registered users store fallback
  const list = getLocalUsers();
  return list.find(u => String(u.id || u.sub).trim() === strId) || null;
}

// Subscription Orders Store Helper
const ORDERS_FILE = path.join(__dirname, 'data', 'subscription-orders.json');

function getSubscriptionOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveSubscriptionOrder(orderObj) {
  try {
    const list = getSubscriptionOrders();
    const existingIdx = list.findIndex(o => o.order_id === orderObj.order_id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...orderObj, updated_at: new Date().toISOString() };
    } else {
      list.push({ ...orderObj, created_at: new Date().toISOString() });
    }
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving subscription order:', e.message);
  }
}

/**
 * Record user profile and login event to Supabase with comprehensive error feedback
 */
async function recordUserLoginToSupabase(user, req) {
  if (!supabaseServer) return;
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
  const nowIso = new Date().toISOString();
  const userId = user.id || user.sub;

  // 1. Sync User Profile to 'users' table
  try {
    const fullPayload = {
      id: userId,
      email: user.email,
      name: user.name || user.email?.split('@')[0],
      avatar_url: user.avatar_url || user.picture || null,
      current_device_id: user.currentDeviceId || null,
      subscription_status: isUserSubscriptionActive(user),
      subscription_expiry: user.subscriptionExpiry || null,
      role: isUserAdmin(user) ? 'admin' : (user.role || 'user'),
      last_sign_in_at: nowIso,
    };

    const { error: uErr } = await supabaseServer.from('users').upsert(fullPayload, { onConflict: 'id' });

    if (uErr) {
      // If error is about missing extra column in Supabase schema, retry with basic columns
      if (uErr.code === 'PGRST204' || uErr.message?.includes('column')) {
        const basePayload = {
          id: userId,
          email: user.email,
          name: user.name || user.email?.split('@')[0],
          avatar_url: user.avatar_url || user.picture || null,
          last_sign_in_at: nowIso,
        };
        const { error: bErr } = await supabaseServer.from('users').upsert(basePayload, { onConflict: 'id' });
        if (!bErr) {
          console.log(`[Supabase Sync] ✅ Synced basic user profile to 'users': ${user.email}`);
        } else {
          console.error(`[Supabase Sync] ❌ Failed to upsert to 'users': ${bErr.message}`);
        }
      } else {
        console.error(`[Supabase Sync] ❌ Failed to upsert to 'users': ${uErr.message} (Code: ${uErr.code})`);
      }
    } else {
      console.log(`[Supabase Sync] ✅ Synced user profile to 'users' table: ${user.email}`);
    }
  } catch (err) {
    console.error(`[Supabase Sync] ❌ Exception upserting to 'users':`, err.message);
  }

  // 2. Insert Login Event to 'user_logins' table
  try {
    const { error: lErr } = await supabaseServer.from('user_logins').insert({
      user_id: userId,
      email: user.email,
      name: user.name || user.email?.split('@')[0],
      logged_in_at: nowIso,
      ip_address: ip
    });

    if (lErr) {
      console.error(`[Supabase Sync] ❌ Failed to insert to 'user_logins': ${lErr.message} (Code: ${lErr.code})`);
    } else {
      console.log(`[Supabase Sync] ✅ Inserted login record to 'user_logins' table: ${user.email}`);
    }
  } catch (err) {
    console.error(`[Supabase Sync] ❌ Exception inserting to 'user_logins':`, err.message);
  }
}

/**
 * Session Token Helpers (HMAC-SHA256 Signed JWT) with deviceId
 */
function createSessionToken(user, deviceId = null) {
  const devId = deviceId || user.currentDeviceId || user.deviceId || crypto.randomUUID();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id || user.sub,
    email: user.email,
    name: user.name,
    picture: user.avatar_url || user.picture || null,
    deviceId: devId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600) // 7 days session
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const parts = clean.split('.');
  if (parts.length !== 3) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (parts[2] !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Dual Token Verifier (Supports both App Session Token and Supabase JWT Token)
 */
async function verifyAnyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();

  // 1. Verify App HMAC-SHA256 Session Token
  const localUser = verifySessionToken(clean);
  if (localUser) return localUser;

  // 2. Verify Supabase JWT Token
  try {
    const { data: { user }, error } = await supabaseServer.auth.getUser(clean);
    if (!error && user) {
      return {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        supabase_id: user.id
      };
    }
  } catch (e) {}

  return null;
}

/**
 * Single Device Verification Middleware (Strict Session Kick-out)
 */
async function requireAuthAndDevice(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : (req.query && req.query.sessionToken ? req.query.sessionToken : req.headers['x-session-token']);

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'UNAUTHORIZED',
      message: 'Yêu cầu đăng nhập để truy cập.'
    });
  }

  const sessionPayload = verifySessionToken(token);
  if (!sessionPayload) {
    const sbUser = await verifyAnyToken(token);
    if (!sbUser) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SESSION',
        error: 'INVALID_SESSION',
        message: 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }
    const dbUser = (await findUserByEmail(sbUser.email)) || (await findUserById(sbUser.sub)) || sbUser;
    req.user = dbUser;
    return next();
  }

  const dbUser = (await findUserByEmail(sessionPayload.email)) || (await findUserById(sessionPayload.sub));
  if (!dbUser) {
    return res.status(401).json({
      success: false,
      code: 'USER_NOT_FOUND',
      error: 'USER_NOT_FOUND',
      message: 'Không tìm thấy tài khoản người dùng.'
    });
  }

  // Enforce Single Device Limit
  if (dbUser.currentDeviceId && sessionPayload.deviceId && dbUser.currentDeviceId !== sessionPayload.deviceId) {
    return res.status(401).json({
      success: false,
      code: 'DEVICE_SESSION_TERMINATED',
      error: 'DEVICE_SESSION_TERMINATED',
      message: 'Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.'
    });
  }

  req.user = {
    ...dbUser,
    sub: dbUser.id || dbUser.sub,
    deviceId: sessionPayload.deviceId
  };
  next();
}

// Backward compatible alias
const requireAuth = requireAuthAndDevice;

/**
 * Subscription Paywall Verification Middleware
 */
async function requireSubscription(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Yêu cầu đăng nhập.'
    });
  }

  if (isUserSubscriptionActive(user)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    code: 'SUBSCRIPTION_REQUIRED',
    error: 'SUBSCRIPTION_REQUIRED',
    message: 'Tài khoản của bạn chưa kích hoạt gói Subscription hoặc gói đã hết hạn (45 USDT/tháng). Vui lòng kích hoạt gói để tiếp tục sử dụng biểu đồ.',
    subscriptionExpiry: user.subscriptionExpiry || null,
    subscriptionStatus: false
  });
}

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
  app.use(express.static(path.join(__dirname, 'public')));

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

  // ==========================================
  // AUTHENTICATION & OTP EMAIL VERIFICATION
  // ==========================================

// Password Hashing & Verification (scrypt + salt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  try {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

// Mail Transporter & OTP Dispatcher
let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return mailTransporter;
}

async function sendOtpEmail(toEmail, otpCode) {
  console.log(`\n======================================================`);
  console.log(`📧 [EMAIL OTP VERIFICATION] To: ${toEmail}`);
  console.log(`🔑 Verification Code (15-min expiry): >>> [ ${otpCode} ] <<<`);
  console.log(`======================================================\n`);

  const transporter = getMailTransporter();
  if (!transporter) {
    console.log(`[Email Service] ℹ️ SMTP not configured in .env. Code logged to server console above.`);
    return { sent: false, code: otpCode };
  }

  try {
    const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.com';
    await transporter.sendMail({
      from: `"TRADEWH Trading" <${fromSender}>`,
      to: toEmail,
      subject: `[TRADEWH] Mã xác thực tài khoản của bạn: ${otpCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #161922; color: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #252a38;">
          <h2 style="color: #d4af37; margin-top: 0; text-align: center;">Xác Thực Tài Khoản TRADEWH</h2>
          <p style="color: #a0aec0; font-size: 14px; text-align: center;">Mã xác thực 6 chữ số để kích hoạt tài khoản của bạn:</p>
          <div style="background: #0f1118; border: 1px solid #d4af37; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #00e5ff;">${otpCode}</span>
          </div>
          <p style="color: #718096; font-size: 12px; text-align: center;">Mã này có hiệu lực trong vòng <strong>15 phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
        </div>
      `,
    });
    console.log(`[Email Service] ✅ Successfully sent verification email to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Email Service Error] Failed to send email to ${toEmail}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// In-Memory Pending Registration & Password Reset Caches (15-min TTL)
const pendingRegistrations = new Map(); // cleanEmail -> { otp, passwordHash, expiresAt, createdAt }
const pendingPasswordResets = new Map(); // cleanEmail -> { otp, expiresAt, createdAt } (legacy OTP fallback)
const pendingMagicResetTokens = new Map(); // token -> { email, expiresAt, createdAt } (Magic Link)

async function sendForgotPasswordMagicLinkEmail(toEmail, resetLink) {
  console.log(`\n======================================================`);
  console.log(`🔗 [MAGIC LINK PASSWORD RESET] To: ${toEmail}`);
  console.log(`👉 Reset Link (15-min expiry):`);
  console.log(`   ${resetLink}`);
  console.log(`======================================================\n`);

  const transporter = getMailTransporter();
  if (!transporter) {
    console.log(`[Email Service] ℹ️ SMTP not configured in .env. Magic Link logged to server console above.`);
    return { sent: false, link: resetLink };
  }

  try {
    const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.com';
    await transporter.sendMail({
      from: `"TRADEWH Trading" <${fromSender}>`,
      to: toEmail,
      subject: `[TRADEWH] Đặt lại mật khẩu của bạn`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #1C212D; color: #E9E6E7; padding: 36px; border-radius: 0px; border: 1px solid #6B7C98;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #5E5653; color: #E9E6E7; font-weight: bold; font-size: 14px; letter-spacing: 2px; padding: 6px 20px; border: 1px solid #CBB193;">
              TRADEWH<sup>®</sup>
            </div>
            <h2 style="color: #E9E6E7; margin-top: 16px; margin-bottom: 6px; font-size: 22px;">Khôi Phục Mật Khẩu</h2>
            <p style="color: #AB978C; font-size: 13px; margin: 0;">Yêu cầu đặt lại mật khẩu cho tài khoản <strong>${toEmail}</strong></p>
          </div>

          <div style="background: #252A38; border: 1px solid rgba(171, 151, 140, 0.3); padding: 24px; text-align: center; margin: 24px 0;">
            <p style="color: #E9E6E7; font-size: 14px; margin-top: 0; margin-bottom: 20px; line-height: 1.5;">
              Nhấn vào nút bên dưới để tiến hành đặt mật khẩu mới cho tài khoản của bạn:
            </p>
            <a href="${resetLink}" target="_blank" style="display: inline-block; background: #6B7C98; color: #FFFFFF; font-weight: bold; font-size: 14px; text-decoration: none; padding: 13px 28px; border-radius: 0px; letter-spacing: 0.5px; border: 1px solid #AB978C;">
              ĐẶT LẠI MẬT KHẨU
            </a>
            <p style="color: #7B7F8A; font-size: 12px; margin-top: 20px; margin-bottom: 0;">
              Hoặc sao chép đường dẫn sau dán vào trình duyệt:
            </p>
            <p style="color: #CBB193; font-size: 11px; word-break: break-all; margin-top: 6px; margin-bottom: 0;">
              <a href="${resetLink}" style="color: #CBB193; text-decoration: underline;">${resetLink}</a>
            </p>
          </div>

          <p style="color: #7B7F8A; font-size: 12px; text-align: center; margin: 0; line-height: 1.5;">
            ⏱️ Liên kết này có hiệu lực trong vòng <strong>15 phút</strong>.<br />
            Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email hoặc liên hệ hỗ trợ.
          </p>
        </div>
      `,
    });
    console.log(`[Email Service] ✅ Successfully sent Magic Link email to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Email Service Error] Failed to send Magic Link email to ${toEmail}:`, err.message);
    return { sent: false, error: err.message };
  }
}

async function sendForgotPasswordEmail(toEmail, otpCode) {
  console.log(`\n======================================================`);
  console.log(`🔑 [FORGOT PASSWORD OTP] To: ${toEmail}`);
  console.log(`🔐 Reset Code (15-min expiry): >>> [ ${otpCode} ] <<<`);
  console.log(`======================================================\n`);

  const transporter = getMailTransporter();
  if (!transporter) {
    console.log(`[Email Service] ℹ️ SMTP not configured in .env. Reset code logged to server console above.`);
    return { sent: false, code: otpCode };
  }

  try {
    const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.com';
    await transporter.sendMail({
      from: `"TRADEWH Trading" <${fromSender}>`,
      to: toEmail,
      subject: `[TRADEWH] Mã khôi phục mật khẩu của bạn: ${otpCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #161922; color: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #252a38;">
          <h2 style="color: #d4af37; margin-top: 0; text-align: center;">Khôi Phục Mật Khẩu TRADEWH</h2>
          <p style="color: #a0aec0; font-size: 14px; text-align: center;">Mã xác thực 6 chữ số để đặt lại mật khẩu cho tài khoản của bạn:</p>
          <div style="background: #0f1118; border: 1px solid #d4af37; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #00e5ff;">${otpCode}</span>
          </div>
          <p style="color: #718096; font-size: 12px; text-align: center;">Mã này có hiệu lực trong vòng <strong>15 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
      `,
    });
    console.log(`[Email Service] ✅ Successfully sent password reset email to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Email Service Error] Failed to send password reset email to ${toEmail}:`, err.message);
    return { sent: false, error: err.message };
  }
}



  // GET /api/auth/config (Public)
  app.get('/api/auth/config', (req, res) => {
    return res.json({
      success: true,
      clientId: GOOGLE_CLIENT_ID
    });
  });

  // POST /api/auth/register-request (Initiate Email & Password Registration + 15-min OTP)
  app.post('/api/auth/register-request', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(cleanEmail);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = hashPassword(password);
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 phút

    pendingRegistrations.set(cleanEmail, {
      otp,
      passwordHash,
      expiresAt,
      createdAt: Date.now()
    });

    await sendOtpEmail(cleanEmail, otp);

    return res.json({
      success: true,
      message: 'Mã xác thực 6 chữ số đã được gửi đến email của bạn.',
      email: cleanEmail,
      expiresInSeconds: 900
    });
  });

  // POST /api/auth/verify-otp (Verify 15-minute OTP and finalize registration)
  app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ email và mã xác thực.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu đăng ký cho email này hoặc đã hoàn tất. Vui lòng đăng ký lại.' });
    }

    if (Date.now() > pending.expiresAt) {
      return res.status(400).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'Mã xác thực đã hết hạn (quá 15 phút). Vui lòng nhấn "Gửi lại mã".'
      });
    }

    if (pending.otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Mã xác thực không đúng. Vui lòng thử lại.' });
    }

    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const newDeviceId = crypto.randomUUID();

    const user = {
      sub: userId,
      id: userId,
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      picture: null,
      password_hash: pending.passwordHash,
      verified: true,
      currentDeviceId: newDeviceId,
      subscriptionStatus: false,
      subscriptionExpiry: null,
      role: isUserAdmin({ email: cleanEmail }) ? 'admin' : 'user'
    };

    saveLocalUser(user);
    recordUserLoginToSupabase(user, req);

    pendingRegistrations.delete(cleanEmail);

    const sessionToken = createSessionToken(user, newDeviceId);
    console.log(`[Email Auth] 🎉 New user registered & verified via OTP: ${cleanEmail} (Device: ${newDeviceId})`);

    return res.json({
      success: true,
      message: 'Xác thực tài khoản thành công!',
      sessionToken,
      user
    });
  });

  // POST /api/auth/resend-otp (Resend a fresh 15-min OTP)
  app.post('/api/auth/resend-otp', async (req, res) => {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Chưa có thông tin đăng ký cho email này. Vui lòng tạo tài khoản lại.' });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    pending.otp = newOtp;
    pending.expiresAt = Date.now() + 15 * 60 * 1000;
    pendingRegistrations.set(cleanEmail, pending);

    await sendOtpEmail(cleanEmail, newOtp);

    return res.json({
      success: true,
      message: 'Đã gửi lại mã xác thực mới (hạn 15 phút).',
      expiresInSeconds: 900
    });
  });

  // POST /api/auth/login-password (Standard Email + Password Login with Single-Device Kick-out)
  app.post('/api/auth/login-password', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(cleanEmail);

    if (!existingUser) {
      return res.status(400).json({
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Tài khoản chưa tồn tại. Vui lòng bấm Đăng ký để tạo tài khoản!'
      });
    }

    if (!existingUser.password_hash) {
      return res.status(400).json({
        success: false,
        code: 'GOOGLE_AUTH_REQUIRED',
        message: 'Tài khoản này được đăng ký bằng Google. Vui lòng nhấn nút "Đăng nhập bằng Google".'
      });
    }

    const isPasswordValid = verifyPassword(password, existingUser.password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Mật khẩu không chính xác.' });
    }

    const userId = existingUser.id || existingUser.sub;
    const newDeviceId = crypto.randomUUID();

    // ⚡ Single-device kick-out: disconnect previous active sockets immediately
    kickoutUserSockets(userId, newDeviceId);

    const updatedUser = {
      ...existingUser,
      sub: userId,
      id: userId,
      currentDeviceId: newDeviceId,
      last_sign_in_at: new Date().toISOString()
    };

    saveLocalUser(updatedUser);
    recordUserLoginToSupabase(updatedUser, req);

    const user = {
      sub: userId,
      id: userId,
      email: existingUser.email,
      name: existingUser.name || existingUser.email.split('@')[0],
      picture: existingUser.avatar_url || existingUser.picture || null,
      currentDeviceId: newDeviceId,
      subscriptionStatus: isUserSubscriptionActive(updatedUser),
      subscriptionExpiry: updatedUser.subscriptionExpiry || null,
      role: isUserAdmin(updatedUser) ? 'admin' : (updatedUser.role || 'user')
    };

    const sessionToken = createSessionToken(user, newDeviceId);
    console.log(`[Email Auth] 👤 User LOGGED IN: ${user.email} (New Device: ${newDeviceId})`);

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      sessionToken,
      user
    });
  });

  // ==========================================
  // MAGIC LINK FORGOT PASSWORD ENDPOINTS
  // ==========================================

  // POST /api/auth/forgot-password-magic-link (Generate Magic Link and send via email)
  app.post('/api/auth/forgot-password-magic-link', async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(cleanEmail);

    if (!existingUser) {
      return res.status(400).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản với email này. Vui lòng kiểm tra lại.'
      });
    }

    if (!existingUser.password_hash) {
      return res.status(400).json({
        success: false,
        code: 'GOOGLE_ACCOUNT',
        message: 'Tài khoản này được đăng ký bằng Google. Bạn có thể đăng nhập trực tiếp qua Google.'
      });
    }

    // Generate secure 32-byte (64 hex characters) magic token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

    pendingMagicResetTokens.set(token, {
      email: cleanEmail,
      expiresAt,
      createdAt: Date.now()
    });

    // Build absolute Magic Link URL
    const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const reqHost = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const origin = req.headers.origin || `${reqProto}://${reqHost}`;
    const magicLink = `${origin}/?reset_token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    await sendForgotPasswordMagicLinkEmail(cleanEmail, magicLink);

    return res.json({
      success: true,
      message: 'Liên kết đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hòm thư.',
      email: cleanEmail,
      expiresInSeconds: 900
    });
  });

  // POST /api/auth/verify-magic-token (Verify if Magic Link token is valid & not expired)
  app.post('/api/auth/verify-magic-token', (req, res) => {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Liên kết không hợp lệ.' });
    }

    const cleanToken = token.trim();
    const pending = pendingMagicResetTokens.get(cleanToken);

    if (!pending) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.'
      });
    }

    if (Date.now() > pending.expiresAt) {
      pendingMagicResetTokens.delete(cleanToken);
      return res.status(400).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Liên kết đặt lại mật khẩu đã hết hạn (quá 15 phút). Vui lòng gửi lại yêu cầu mới.'
      });
    }

    return res.json({
      success: true,
      email: pending.email,
      message: 'Token hợp lệ.'
    });
  });

  // POST /api/auth/reset-password-magic (Reset password using Magic Link token)
  app.post('/api/auth/reset-password-magic', async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const cleanToken = token.trim();
    const pending = pendingMagicResetTokens.get(cleanToken);

    if (!pending) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.'
      });
    }

    if (Date.now() > pending.expiresAt) {
      pendingMagicResetTokens.delete(cleanToken);
      return res.status(400).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Liên kết đặt lại mật khẩu đã hết hạn (quá 15 phút). Vui lòng gửi lại yêu cầu mới.'
      });
    }

    const cleanEmail = pending.email;
    const existingUser = await findUserByEmail(cleanEmail);
    if (!existingUser) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
    }

    const userId = existingUser.id || existingUser.sub;
    const newDeviceId = crypto.randomUUID();
    kickoutUserSockets(userId, newDeviceId);

    const newHash = hashPassword(newPassword);
    const updatedUser = {
      ...existingUser,
      password_hash: newHash,
      currentDeviceId: newDeviceId,
      last_sign_in_at: new Date().toISOString()
    };

    saveLocalUser(updatedUser);
    recordUserLoginToSupabase(updatedUser, req);

    // Invalidate the magic token so it can only be used once
    pendingMagicResetTokens.delete(cleanToken);

    const sessionUser = {
      sub: updatedUser.id || updatedUser.sub,
      id: updatedUser.id || updatedUser.sub,
      email: updatedUser.email,
      name: updatedUser.name || updatedUser.email.split('@')[0],
      picture: updatedUser.avatar_url || updatedUser.picture || null,
      currentDeviceId: newDeviceId,
      subscriptionStatus: isUserSubscriptionActive(updatedUser),
      subscriptionExpiry: updatedUser.subscriptionExpiry || null,
      role: isUserAdmin(updatedUser) ? 'admin' : (updatedUser.role || 'user')
    };

    const sessionToken = createSessionToken(sessionUser, newDeviceId);
    console.log(`[Magic Link Auth] 🔑 Password reset successfully for: ${cleanEmail}`);

    return res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công!',
      sessionToken,
      user: sessionUser
    });
  });

  // POST /api/auth/forgot-password-request (Send 15-min OTP to reset password)
  app.post('/api/auth/forgot-password-request', async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(cleanEmail);

    if (!existingUser) {
      return res.status(400).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản với email này. Vui lòng kiểm tra lại.'
      });
    }

    if (!existingUser.password_hash) {
      return res.status(400).json({
        success: false,
        code: 'GOOGLE_ACCOUNT',
        message: 'Tài khoản này được đăng ký bằng Google. Bạn có thể đăng nhập trực tiếp qua Google.'
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    pendingPasswordResets.set(cleanEmail, {
      otp,
      expiresAt,
      createdAt: Date.now()
    });

    await sendForgotPasswordEmail(cleanEmail, otp);

    return res.json({
      success: true,
      message: 'Mã khôi phục 6 chữ số đã được gửi đến email của bạn.',
      email: cleanEmail,
      expiresInSeconds: 900
    });
  });

  // POST /api/auth/reset-password (Verify OTP and save new password)
  app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ mã xác thực và mật khẩu mới.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingPasswordResets.get(cleanEmail);

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Yêu cầu đặt lại mật khẩu không tồn tại hoặc đã hoàn tất. Vui lòng gửi lại yêu cầu.' });
    }

    if (Date.now() > pending.expiresAt) {
      return res.status(400).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'Mã xác thực đã hết hạn (quá 15 phút). Vui lòng nhấn "Gửi lại mã".'
      });
    }

    if (pending.otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Mã xác thực không đúng. Vui lòng kiểm tra lại.' });
    }

    const existingUser = await findUserByEmail(cleanEmail);
    if (!existingUser) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
    }

    const userId = existingUser.id || existingUser.sub;
    const newDeviceId = crypto.randomUUID();
    kickoutUserSockets(userId, newDeviceId);

    const newHash = hashPassword(newPassword);
    const updatedUser = {
      ...existingUser,
      password_hash: newHash,
      currentDeviceId: newDeviceId,
      last_sign_in_at: new Date().toISOString()
    };

    saveLocalUser(updatedUser);
    recordUserLoginToSupabase(updatedUser, req);

    pendingPasswordResets.delete(cleanEmail);

    const sessionUser = {
      sub: updatedUser.id || updatedUser.sub,
      id: updatedUser.id || updatedUser.sub,
      email: updatedUser.email,
      name: updatedUser.name || updatedUser.email.split('@')[0],
      picture: updatedUser.avatar_url || updatedUser.picture || null,
      currentDeviceId: newDeviceId,
      subscriptionStatus: isUserSubscriptionActive(updatedUser),
      subscriptionExpiry: updatedUser.subscriptionExpiry || null,
      role: isUserAdmin(updatedUser) ? 'admin' : (updatedUser.role || 'user')
    };

    const sessionToken = createSessionToken(sessionUser, newDeviceId);
    console.log(`[Email Auth] 🔑 Password reset successfully for: ${cleanEmail}`);

    return res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công!',
      sessionToken,
      user: sessionUser
    });
  });

  // POST /api/auth/resend-forgot-otp (Resend fresh 15-min OTP for forgot password)
  app.post('/api/auth/resend-forgot-otp', async (req, res) => {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(cleanEmail);
    if (!existingUser) {
      return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại.' });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingPasswordResets.set(cleanEmail, {
      otp: newOtp,
      expiresAt: Date.now() + 15 * 60 * 1000,
      createdAt: Date.now()
    });

    await sendForgotPasswordEmail(cleanEmail, newOtp);

    return res.json({
      success: true,
      message: 'Đã gửi lại mã khôi phục mới (hạn 15 phút).',
      expiresInSeconds: 900
    });
  });

  // POST /api/auth/google (Public Google ID Token Exchange with Register-First Enforcement)
  app.post('/api/auth/google', async (req, res) => {
    const { credential, mode = 'login' } = req.body;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing Google ID credential' });
    }

    try {
      let payload = null;
      if (GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID
        });
        payload = ticket.getPayload();
      } else {
        // Fallback decoder for local development if GOOGLE_CLIENT_ID is not configured in .env yet
        const parts = credential.split('.');
        if (parts.length >= 2) {
          payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        }
      }

      if (!payload || !payload.email) {
        return res.status(401).json({ success: false, message: 'Invalid Google credential token' });
      }

      const email = payload.email.toLowerCase().trim();
      const existingUser = await findUserByEmail(email);

      // Strict Barrier: Unregistered users cannot directly login without registering first
      if (mode === 'login' && !existingUser) {
        console.warn(`[Google Auth] ⚠️ Rejected login: User ${email} has not registered yet.`);
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_NOT_REGISTERED',
          message: 'Tài khoản chưa đăng ký. Hãy chuyển sang Đăng ký để tạo tài khoản nhé.'
        });
      }

      const userId = existingUser?.id || existingUser?.sub || payload.sub;
      const newDeviceId = crypto.randomUUID();

      // ⚡ Single-device kick-out: disconnect old socket session
      kickoutUserSockets(userId, newDeviceId);

      const user = {
        sub: userId,
        id: userId,
        email: email,
        name: payload.name || email.split('@')[0],
        picture: payload.picture || null,
        currentDeviceId: newDeviceId,
        subscriptionStatus: isUserSubscriptionActive(existingUser || {}),
        subscriptionExpiry: existingUser?.subscriptionExpiry || null,
        role: isUserAdmin({ email }) ? 'admin' : (existingUser?.role || 'user')
      };

      saveLocalUser({
        id: user.sub,
        email: user.email,
        name: user.name,
        avatar_url: user.picture,
        currentDeviceId: newDeviceId,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role
      });
      recordUserLoginToSupabase(user, req);

      const sessionToken = createSessionToken(user, newDeviceId);
      const isNewUser = !existingUser;
      console.log(`[Google Auth] 👤 User ${isNewUser ? 'REGISTERED' : 'LOGGED IN'}: ${user.email} (${user.name}) (Device: ${newDeviceId})`);

      return res.json({
        success: true,
        message: isNewUser ? 'Đăng ký tài khoản Google thành công!' : 'Đăng nhập thành công!',
        isNewUser,
        sessionToken,
        user
      });
    } catch (err) {
      console.error(`[Google Auth Error]`, err.message);
      return res.status(401).json({
        success: false,
        message: 'Google Sign-In verification failed',
        error: err.message
      });
    }
  });

  // GET /api/auth/me (Protected User Profile)
  app.get('/api/auth/me', requireAuthAndDevice, (req, res) => {
    return res.json({
      success: true,
      user: req.user
    });
  });

  // POST /api/auth/logout (Protected User Logout)
  app.post('/api/auth/logout', requireAuthAndDevice, (req, res) => {
    const uId = req.user?.id || req.user?.sub;
    if (uId) {
      const sockets = activeUserSockets.get(uId);
      if (sockets) {
        for (const s of sockets) {
          try {
            s.disconnect(true);
          } catch (e) {}
        }
        activeUserSockets.delete(uId);
      }
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  });

  // ==========================================
  // SUBSCRIPTION, PAYMENT & ADMIN TRIAL ROUTES
  // ==========================================

  // GET /api/user/subscription (Get current user subscription details)
  app.get('/api/user/subscription', requireAuthAndDevice, async (req, res) => {
    const user = req.user;
    const dbUser = (await findUserByEmail(user.email)) || (await findUserById(user.id || user.sub)) || user;
    const isAdmin = isUserAdmin(dbUser);
    const isActive = isUserSubscriptionActive(dbUser);

    let daysLeft = 0;
    if (dbUser.subscriptionExpiry) {
      const diffMs = new Date(dbUser.subscriptionExpiry).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return res.json({
      success: true,
      subscriptionStatus: isActive,
      subscriptionExpiry: dbUser.subscriptionExpiry || null,
      daysLeft: isAdmin ? 9999 : daysLeft,
      isAdmin: isAdmin,
      role: isAdmin ? 'admin' : (dbUser.role || 'user'),
      email: dbUser.email,
      name: dbUser.name
    });
  });

  // POST /api/payment/create (Create Cryptomus 45 USDT invoice)
  app.post('/api/payment/create', requireAuthAndDevice, async (req, res) => {
    const user = req.user;
    const userId = user.id || user.sub;
    const orderId = `SUB_${userId}_${Date.now()}`;
    const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const reqHost = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const baseUrl = `${reqProto}://${reqHost}`;

    const payload = {
      amount: "45.00",
      currency: "USDT",
      order_id: orderId,
      url_return: `${baseUrl}/subscription?order_id=${orderId}&status=success`,
      url_callback: `${baseUrl}/api/payment/webhook`,
      is_payment_multiple: false,
      lifetime: 3600,
      additional_data: JSON.stringify({ userId: userId, email: user.email })
    };

    if (CRYPTOMUS_MERCHANT_ID && CRYPTOMUS_PAYMENT_API_KEY) {
      try {
        const sign = generateCryptomusSignature(payload, CRYPTOMUS_PAYMENT_API_KEY);
        console.log(`[Cryptomus] 💳 Creating invoice for user ${user.email} (Order: ${orderId})...`);

        const response = await fetch('https://api.cryptomus.com/v1/payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'merchant': CRYPTOMUS_MERCHANT_ID,
            'sign': sign
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data && data.result && data.result.url) {
          saveSubscriptionOrder({
            order_id: orderId,
            user_id: userId,
            email: user.email,
            amount: "45.00",
            currency: "USDT",
            status: 'pending',
            payment_url: data.result.url,
            cryptomus_uuid: data.result.uuid
          });

          return res.json({
            success: true,
            orderId: orderId,
            paymentUrl: data.result.url,
            uuid: data.result.uuid
          });
        } else {
          console.error('[Cryptomus Create Error]', data);
          return res.status(400).json({
            success: false,
            message: data.message || 'Không thể tạo đơn hàng trên Cryptomus',
            raw: data
          });
        }
      } catch (err) {
        console.error('[Cryptomus API Exception]', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi kết nối cổng thanh toán Cryptomus', error: err.message });
      }
    } else {
      // Fallback Demo / Simulated Payment Flow for development & testing
      const mockUrl = `https://pay.cryptomus.com/pay/mock_${orderId}`;
      saveSubscriptionOrder({
        order_id: orderId,
        user_id: userId,
        email: user.email,
        amount: "45.00",
        currency: "USDT",
        status: 'pending',
        payment_url: mockUrl,
        is_mock: true
      });

      return res.json({
        success: true,
        orderId: orderId,
        paymentUrl: mockUrl,
        is_mock: true,
        message: 'Chế độ mô phỏng Cryptomus (chưa cấu hình API Key)'
      });
    }
  });

  // POST /api/payment/webhook (Cryptomus IPN Payment Callback)
  app.post('/api/payment/webhook', async (req, res) => {
    try {
      const incomingSign = req.headers['sign'];
      const body = req.body;

      if (!body) {
        return res.status(400).json({ success: false, message: 'Missing body' });
      }

      // Verify signature if key is configured
      if (CRYPTOMUS_PAYMENT_API_KEY) {
        const payloadToSign = { ...body };
        delete payloadToSign.sign;
        const expectedSign = generateCryptomusSignature(payloadToSign, CRYPTOMUS_PAYMENT_API_KEY);

        if (incomingSign !== expectedSign && body.sign !== expectedSign) {
          console.warn(`[Cryptomus Webhook] ❌ Invalid signature received: ${incomingSign}`);
          return res.status(400).json({ success: false, message: 'Invalid signature' });
        }
      }

      const { status, order_id, additional_data } = body;
      console.log(`[Cryptomus Webhook] 📥 Received webhook for Order ${order_id} with status: ${status}`);

      if (status === 'paid' || status === 'paid_over' || status === 'paid_simulated') {
        let meta = {};
        try {
          meta = typeof additional_data === 'string' ? JSON.parse(additional_data) : (additional_data || {});
        } catch (e) {}

        const userId = meta.userId;
        const email = meta.email;

        let targetUser = (await findUserById(userId)) || (await findUserByEmail(email));
        if (!targetUser && userId) {
          targetUser = { id: userId, email: email || 'user@tradewh.com' };
        }

        if (targetUser) {
          const currentExpiryTime = targetUser.subscriptionExpiry ? new Date(targetUser.subscriptionExpiry).getTime() : 0;
          const nowTime = Date.now();
          // Add +30 days (either from now or stacked onto current valid expiry)
          const baseTime = currentExpiryTime > nowTime ? currentExpiryTime : nowTime;
          const newExpiry = new Date(baseTime + (30 * 24 * 3600 * 1000)).toISOString();

          const updated = {
            ...targetUser,
            subscriptionStatus: true,
            subscriptionExpiry: newExpiry
          };

          saveLocalUser(updated);
          recordUserLoginToSupabase(updated, req);

          saveSubscriptionOrder({
            order_id: order_id,
            user_id: targetUser.id || targetUser.sub,
            email: targetUser.email,
            status: status,
            amount: body.amount || "45.00",
            currency: body.currency || "USDT",
            paid_at: new Date().toISOString()
          });

          console.log(`[Cryptomus Webhook] 🎉 Subscription ACTIVATED for ${targetUser.email} until ${newExpiry}`);
        }
      }

      return res.json({ success: true, message: 'Webhook processed' });
    } catch (err) {
      console.error('[Cryptomus Webhook Error]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/payment/status/:orderId (Check order status)
  app.get('/api/payment/status/:orderId', requireAuthAndDevice, (req, res) => {
    const { orderId } = req.params;
    const orders = getSubscriptionOrders();
    const order = orders.find(o => o.order_id === orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    return res.json({
      success: true,
      order
    });
  });

  // POST /api/admin/grant-trial (Admin 3-Day Trial Feature)
  app.post('/api/admin/grant-trial', requireAuthAndDevice, async (req, res) => {
    const requester = req.user;
    const adminKey = req.headers['x-admin-key'];
    const isAdmin = isUserAdmin(requester) || adminKey === ADMIN_SECRET_KEY;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện tính năng quản trị này.'
      });
    }

    const { email, userId, days = 3 } = req.body || {};
    if (!email && !userId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp email hoặc userId của tài khoản cần cấp trial.'
      });
    }

    let targetUser = (email ? await findUserByEmail(email) : null) || (userId ? await findUserById(userId) : null);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy người dùng với ${email ? 'email: ' + email : 'userId: ' + userId}`
      });
    }

    const trialDurationMs = Number(days) * 24 * 3600 * 1000;
    const currentExpiryTime = targetUser.subscriptionExpiry ? new Date(targetUser.subscriptionExpiry).getTime() : 0;
    const nowTime = Date.now();
    const baseTime = currentExpiryTime > nowTime ? currentExpiryTime : nowTime;
    const newExpiry = new Date(baseTime + trialDurationMs).toISOString();

    const updatedUser = {
      ...targetUser,
      subscriptionStatus: true,
      subscriptionExpiry: newExpiry
    };

    saveLocalUser(updatedUser);
    recordUserLoginToSupabase(updatedUser, req);

    console.log(`[Admin Trial] 🎁 Admin ${requester.email} granted ${days}-day trial to ${targetUser.email} until ${newExpiry}`);

    return res.json({
      success: true,
      message: `Đã cấp ${days} ngày dùng thử thành công cho ${targetUser.email}!`,
      user: {
        id: updatedUser.id || updatedUser.sub,
        email: updatedUser.email,
        subscriptionStatus: true,
        subscriptionExpiry: newExpiry
      }
    });
  });

  // REST API: /api/token-info (Protected Safe metadata query without exposing raw tokens)
  app.get('/api/token-info', requireAuth, (req, res) => {
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
        expiresAt: authExp > 0 ? new Date(authExp * 1000).toISOString() : null,
        timeLeftSeconds: Math.max(0, authExp - nowSec),
        isExpired: authExp > 0 ? nowSec >= authExp : true
      },
      refreshToken: {
        hasToken: Boolean(refresh && !refresh.includes('PLACEHOLDER')),
        expiresAt: refreshExp > 0 ? new Date(refreshExp * 1000).toISOString() : null,
        timeLeftSeconds: Math.max(0, refreshExp - nowSec),
        isExpired: refreshExp > 0 ? nowSec >= refreshExp : true
      }
    });
  });

  // REST API: /api/refresh-token (Protected Zero-leakage manual refresh trigger)
  app.post('/api/refresh-token', requireAuth, async (req, res) => {
    const customRefreshToken = req.body && req.body.refreshToken ? req.body.refreshToken : (req.body && req.body.token ? req.body.token : null);
    const result = await executeRefreshToken(customRefreshToken, true);
    if (result.success) {
      return res.json({
        success: true,
        message: 'Access Token refreshed successfully on server',
        expiresIn: 900
      });
    } else {
      return res.status(result.status || 500).json({ success: false, message: result.message || 'Refresh token rejected' });
    }
  });

  // REST API: /api/set-refresh-token (Protected)
  app.post('/api/set-refresh-token', requireAuth, async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Refresh Token provided' });
    }

    const cleanRefresh = refreshToken.replace(/^Bearer\s+/i, '').trim();
    updateEnvTokens({ refreshToken: cleanRefresh });

    const refreshResult = await executeRefreshToken(cleanRefresh, true);
    return res.json({
      success: refreshResult.success,
      message: refreshResult.success ? 'Refresh Token saved & Access Token renewed!' : (refreshResult.message || 'Error updating token')
    });
  });

  // REST API: /api/update-token (Protected)
  app.post('/api/update-token', requireAuth, (req, res) => {
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

  // GET /api/bot/config (Protected)
  app.get('/api/bot/config', requireAuth, (req, res) => {
    return res.json({
      success: true,
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/config (Protected)
  app.post('/api/bot/config', requireAuth, (req, res) => {
    const success = telegramSignalBot.saveConfig(req.body);
    syncBotChannels();
    return res.json({
      success: success,
      message: success ? 'Cấu hình Bot Telegram đã được lưu thành công!' : 'Lỗi khi lưu cấu hình',
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/test (Protected)
  app.post('/api/bot/test', requireAuth, async (req, res) => {
    const { botToken, chatId, message } = req.body;
    const testText = message || `🤖 <b>TRADEWH TELEGRAM SIGNAL BOT</b>\n\n✅ <i>Kết nối thành công!</i>\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n⚡ Hệ thống Live Tracking tín hiệu đã sẵn sàng!`;
    const result = await telegramSignalBot.sendTelegramMessage(testText, { botToken, chatId });
    if (result.success) {
      return res.json({ success: true, message: 'Đã gửi tin nhắn thử nghiệm thành công tới Telegram!', result });
    } else {
      return res.status(400).json({ success: false, message: result.error || 'Không thể gửi tin nhắn tới Telegram. Vui lòng kiểm tra Bot Token và Chat ID.', result });
    }
  });

  // GET /api/bot/trades (Protected)
  app.get('/api/bot/trades', requireAuth, (req, res) => {
    return res.json({
      success: true,
      activeTrades: Array.from(telegramSignalBot.activeTrades.values()),
      tradeHistory: telegramSignalBot.tradeHistory,
      stats: telegramSignalBot.getStatusPayload().stats
    });
  });

  // POST /api/bot/trades/test-signal (Protected Interactive simulator trigger)
  app.post('/api/bot/trades/test-signal', requireAuth, async (req, res) => {
    const result = await telegramSignalBot.triggerTestSignal(req.body);
    return res.json(result);
  });

  // POST /api/bot/trades/:id/simulate-status (Protected Interactive simulator state update)
  app.post('/api/bot/trades/:id/simulate-status', requireAuth, async (req, res) => {
    const tradeId = req.params.id;
    const { status, reason } = req.body;
    const trade = telegramSignalBot.activeTrades.get(tradeId);
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    await telegramSignalBot.transitionTradeStatus(trade, Number(status), reason || 'Simulated state change');
    return res.json({ success: true, trade });
  });

  // POST /api/bot/trades/:id/close (Protected)
  app.post('/api/bot/trades/:id/close', requireAuth, async (req, res) => {
    const tradeId = req.params.id;
    const status = req.body.status !== undefined ? Number(req.body.status) : TRADE_STATUS.CUT_EARLY_PROFIT;
    const result = await telegramSignalBot.manualCloseTrade(tradeId, status);
    return res.json(result);
  });

  // POST /api/bot/trades/clear-history (Protected)
  app.post('/api/bot/trades/clear-history', requireAuth, (req, res) => {
    telegramSignalBot.tradeHistory = [];
    telegramSignalBot.saveTrades();
    return res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử lệnh!' });
  });

  // REST API: /api/candles (Protected Reverse Proxy with Subscription Paywall)
  app.get('/api/candles', requireAuthAndDevice, requireSubscription, async (req, res) => {
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

  // Socket.IO Strict Session Authentication & Single-Device Limit Middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken || socket.handshake.query?.sessionToken;
    if (!token) {
      console.warn(`[Socket Auth] ❌ Rejected unauthenticated socket connection (missing sessionToken)`);
      return next(new Error('UNAUTHORIZED: Authentication required.'));
    }

    const sessionPayload = verifySessionToken(token);
    if (sessionPayload) {
      const dbUser = (await findUserByEmail(sessionPayload.email)) || (await findUserById(sessionPayload.sub));
      if (dbUser) {
        if (dbUser.currentDeviceId && sessionPayload.deviceId && dbUser.currentDeviceId !== sessionPayload.deviceId) {
          console.warn(`[Socket Auth] ❌ Rejected socket connection due to device mismatch: ${sessionPayload.email}`);
          return next(new Error('DEVICE_SESSION_TERMINATED: Logged in from another device.'));
        }
        socket.user = dbUser;
        socket.userId = dbUser.id || dbUser.sub;
        socket.deviceId = sessionPayload.deviceId;
        console.log(`[Socket Auth] 👤 Socket connected for: ${dbUser.email} (Device: ${sessionPayload.deviceId})`);
        return next();
      }
    }

    const anyUser = await verifyAnyToken(token);
    if (!anyUser) {
      console.warn(`[Socket Auth] ❌ Rejected unauthenticated socket connection (invalid sessionToken)`);
      return next(new Error('UNAUTHORIZED: Invalid or expired sessionToken'));
    }

    socket.user = anyUser;
    socket.userId = anyUser.id || anyUser.sub;
    socket.deviceId = anyUser.deviceId || null;
    console.log(`[Socket Auth] 👤 Socket connection authenticated for: ${anyUser.email}`);
    next();
  });

  // Local Frontend Socket.IO Connections (Single-Device Tracker)
  io.on('connection', (clientSocket) => {
    const uId = clientSocket.userId;
    if (uId) {
      if (!activeUserSockets.has(uId)) {
        activeUserSockets.set(uId, new Set());
      }
      activeUserSockets.get(uId).add(clientSocket);
    }

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
      if (uId && activeUserSockets.has(uId)) {
        activeUserSockets.get(uId).delete(clientSocket);
        if (activeUserSockets.get(uId).size === 0) {
          activeUserSockets.delete(uId);
        }
      }

      setTimeout(() => {
        if (io.sockets.sockets.size === 0) {
          disconnectUpstreamWebSocket();
        }
      }, 5000);
    });
  });

  // Route to serve standalone index.html if requested
  app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
