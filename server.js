require('dotenv').config();

// Ensure DATABASE_URL has ?pgbouncer=true before Prisma query engine starts
if (process.env.DATABASE_URL) {
  let dbUrl = process.env.DATABASE_URL.trim();
  if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) {
    dbUrl = dbUrl.slice(1, -1).trim();
  }
  if (!dbUrl.includes('pgbouncer=true')) {
    const sep = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${sep}pgbouncer=true`;
  }
  process.env.DATABASE_URL = dbUrl;
}
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

// Global JSON serialization fix for Prisma BigInt fields
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Google OAuth 2.0 & Session Configuration
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_SECRET = (process.env.SESSION_SECRET || 'crazii_jwt_session_secret_key_super_secure_2026').trim();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined);

// Payment Gateways Configuration (NOWPayments & Cryptomus)
const NOWPAYMENTS_API_KEY = (process.env.NOWPAYMENTS_API_KEY || '').trim();
const NOWPAYMENTS_IPN_SECRET_KEY = (process.env.NOWPAYMENTS_IPN_SECRET_KEY || process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
const CRYPTOMUS_MERCHANT_ID = (process.env.CRYPTOMUS_MERCHANT_ID || '').trim();
const CRYPTOMUS_PAYMENT_API_KEY = (process.env.CRYPTOMUS_PAYMENT_API_KEY || '').trim();
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();

function getAppBaseUrl(req) {
  // 1. Explicit override env takes highest priority (set this on Render dashboard)
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost') && !process.env.APP_URL.includes('127.0.0.1')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  // 2. Detect from x-forwarded-host (Render / Vercel / Nginx proxies set this)
  const forwardedHost = req?.headers?.['x-forwarded-host'];
  const forwardedProto = req?.headers?.['x-forwarded-proto'] || 'https';
  if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
    return `${forwardedProto}://${forwardedHost.split(',')[0].trim()}`;
  }

  // 3. Detect from host header
  const host = req?.headers?.host || '';
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `https://${host}`;
  }

  // 4. Local fallback
  const localHost = host || `localhost:${PORT}`;
  return `http://${localHost}`;
}


function verifyNowPaymentsSignature(payload, signatureHeader, ipnSecret) {
  if (!signatureHeader || !ipnSecret) return false;
  try {
    const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const sortedKeys = Object.keys(raw).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
      sortedObj[key] = raw[key];
    }
    const sortedString = JSON.stringify(sortedObj);
    const expectedSig = crypto.createHmac('sha512', ipnSecret).update(sortedString).digest('hex');
    return expectedSig === signatureHeader;
  } catch (e) {
    return false;
  }
}

// Admin Access Configuration
const ADMIN_SECRET_KEY = (process.env.ADMIN_SECRET_KEY || 'tradewh_admin_secret_key_2026').trim();
const ADMIN_EMAILS = [
  'dhieu9b@gmail.com',
  'buidinhhieu9b@gmail.com',
  (process.env.ADMIN_EMAIL || '').toLowerCase().trim()
].filter(Boolean);

function isUserDisabled(user) {
  if (!user) return false;
  return user.role === 'disabled' || user.isDisabled === true;
}

function isUserAdmin(user) {
  if (!user || user.role === 'disabled' || user.isDisabled === true) return false;
  const email = (user.email || '').toLowerCase().trim();
  return ADMIN_EMAILS.includes(email) || user.role === 'admin';
}

function isUserSubscriptionActive(user) {
  if (!user || user.role === 'disabled' || user.isDisabled === true) return false;
  const expiry = user.subscriptionExpiry || user.subscription_expiry;
  if (expiry) {
    const expiryTime = new Date(expiry).getTime();
    if (!isNaN(expiryTime)) {
      return expiryTime > Date.now();
    }
  }
  if (isUserAdmin(user)) return true;
  return Boolean(user.subscriptionStatus || user.subscription_status);
}

// Active Sockets tracker for single-device kick-out (disabled when ALLOW_CONCURRENT_SESSIONS is true)
let ioServer = null;
const activeUserSockets = new Map(); // userId -> Set of clientSocket instances
const ALLOW_CONCURRENT_SESSIONS = process.env.ALLOW_CONCURRENT_SESSIONS === 'true';

function kickoutUserSockets(userIdentifier, newDeviceId) {
  if (ALLOW_CONCURRENT_SESSIONS) {
    // Multi-device concurrent login enabled: keep all existing sessions alive
    return;
  }
  if (!userIdentifier) return;
  const key = String(userIdentifier).toLowerCase().trim();
  console.log(`[Single Device] ⚡ Checking sockets to kick out for user: "${key}" (newDeviceId: ${newDeviceId})`);

  if (ioServer && ioServer.sockets && ioServer.sockets.sockets) {
    for (const [socketId, s] of ioServer.sockets.sockets) {
      const sEmail = (s.userEmail || s.user?.email || '').toLowerCase().trim();
      const sId = String(s.userId || s.user?.id || s.user?.sub || '').toLowerCase().trim();

      // Strict exact match: ensure we ONLY kick sockets belonging to THIS EXACT USER
      const isMatch = (sEmail && sEmail === key) || (sId && sId === key);
      if (isMatch) {
        if (s.deviceId && s.deviceId !== newDeviceId) {
          console.log(`[Single Device] ⚡ Kicking out old socket (${s.id}) for user ${key}. (Old device: ${s.deviceId} !== New device: ${newDeviceId})`);
          try {
            s.emit('force_logout', {
              code: 'DEVICE_SESSION_TERMINATED',
              message: 'Tài khoản của bạn đã được đăng nhập trên một thiết bị khác. Phiên làm việc này đã kết thúc.'
            });
            setTimeout(() => {
              try { s.disconnect(true); } catch (e) { }
            }, 100);
          } catch (e) { }
        }
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

// Supabase & Prisma ORM Database Configurations
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const supabaseServer = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// Prisma ORM Client
const { prisma } = require('./src/lib/prisma');

/**
 * ----------------------------------------------------
 * PRISMA ORM AS PRIMARY DATA ACCESS LAYER
 * ----------------------------------------------------
 */

// Helper: Upsert full user profile to database via Prisma ORM
async function saveUserToDb(userObj) {
  if (!userObj) return null;
  const userId = String(userObj.id || userObj.sub || '').trim();
  const cleanEmail = userObj.email ? userObj.email.toLowerCase().trim() : null;
  const now = new Date();

  const dataPayload = {
    id: userId,
    email: cleanEmail,
    name: userObj.name || cleanEmail?.split('@')[0] || 'User',
    avatar_url: userObj.avatar_url || userObj.picture || null,
    current_device_id: userObj.currentDeviceId || userObj.current_device_id || null,
    subscription_status: isUserSubscriptionActive(userObj),
    subscription_expiry: userObj.subscriptionExpiry || userObj.subscription_expiry ? new Date(userObj.subscriptionExpiry || userObj.subscription_expiry) : null,
    password_hash: userObj.password_hash || userObj.passwordHash || null,
    role: isUserAdmin(userObj) ? 'admin' : (userObj.role || 'user'),
    last_sign_in_at: userObj.last_sign_in_at ? new Date(userObj.last_sign_in_at) : now
  };

  try {
    if (prisma && prisma.user) {
      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          email: dataPayload.email,
          name: dataPayload.name,
          avatar_url: dataPayload.avatar_url,
          current_device_id: dataPayload.current_device_id,
          subscription_status: dataPayload.subscription_status,
          subscription_expiry: dataPayload.subscription_expiry,
          password_hash: dataPayload.password_hash,
          role: dataPayload.role,
          last_sign_in_at: dataPayload.last_sign_in_at
        },
        create: dataPayload
      });
      return user;
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ Notice upserting user ${cleanEmail}:`, err.message);
  }

  // Fallback to Supabase REST client if DB connection is in transition
  if (supabaseServer) {
    try {
      const { data } = await supabaseServer.from('users').upsert({
        id: userId,
        email: cleanEmail,
        name: dataPayload.name,
        avatar_url: dataPayload.avatar_url,
        current_device_id: dataPayload.current_device_id,
        subscription_status: dataPayload.subscription_status,
        subscription_expiry: dataPayload.subscription_expiry ? dataPayload.subscription_expiry.toISOString() : null,
        password_hash: dataPayload.password_hash,
        role: dataPayload.role,
        last_sign_in_at: dataPayload.last_sign_in_at ? dataPayload.last_sign_in_at.toISOString() : now.toISOString()
      }, { onConflict: 'id' }).select().maybeSingle();
      return data;
    } catch (e) { }
  }

  return null;
}

// Backward-compatible alias
const saveUserToSupabase = saveUserToDb;

// Helper: Query user by email from database via Prisma ORM
async function findUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();

  try {
    if (prisma && prisma.user) {
      const data = await prisma.user.findFirst({
        where: {
          email: { equals: cleanEmail, mode: 'insensitive' }
        }
      });

      if (data) {
        return {
          ...data,
          id: data.id,
          sub: data.id,
          email: data.email,
          name: data.name || cleanEmail.split('@')[0],
          currentDeviceId: data.current_device_id || null,
          subscriptionStatus: data.role === 'disabled' ? false : Boolean(data.subscription_status),
          subscriptionExpiry: data.subscription_expiry ? data.subscription_expiry.toISOString() : null,
          password_hash: data.password_hash || null,
          role: data.role || (isUserAdmin({ email: cleanEmail }) ? 'admin' : 'user'),
          isDisabled: data.role === 'disabled'
        };
      }
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ findUserByEmail notice:`, err.message);
  }

  // Fallback to Supabase REST
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
          id: data.id,
          sub: data.id,
          email: data.email,
          name: data.name || cleanEmail.split('@')[0],
          currentDeviceId: data.current_device_id || null,
          subscriptionStatus: data.role === 'disabled' ? false : (data.subscription_status !== undefined ? data.subscription_status : false),
          subscriptionExpiry: data.subscription_expiry || null,
          password_hash: data.password_hash || null,
          role: data.role || (isUserAdmin({ email: cleanEmail }) ? 'admin' : 'user'),
          isDisabled: data.role === 'disabled'
        };
      }
    } catch (e) { }
  }

  return null;
}

// Helper: Query user by ID from database via Prisma ORM
async function findUserById(id) {
  if (!id) return null;
  const strId = String(id).trim();

  try {
    if (prisma && prisma.user) {
      const data = await prisma.user.findFirst({
        where: {
          OR: [
            { id: strId },
            { email: { equals: strId, mode: 'insensitive' } }
          ]
        }
      });

      if (data) {
        return {
          ...data,
          id: data.id,
          sub: data.id,
          email: data.email,
          name: data.name || data.email?.split('@')[0],
          currentDeviceId: data.current_device_id || null,
          subscriptionStatus: data.role === 'disabled' ? false : Boolean(data.subscription_status),
          subscriptionExpiry: data.subscription_expiry ? data.subscription_expiry.toISOString() : null,
          password_hash: data.password_hash || null,
          role: data.role || (isUserAdmin(data) ? 'admin' : 'user'),
          isDisabled: data.role === 'disabled'
        };
      }
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ findUserById notice:`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      let query = supabaseServer.from('users').select('*');
      if (strId.includes('@')) {
        query = query.ilike('email', strId.toLowerCase());
      } else {
        query = query.eq('id', strId);
      }

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return {
          ...data,
          id: data.id,
          sub: data.id,
          email: data.email,
          name: data.name || data.email?.split('@')[0],
          currentDeviceId: data.current_device_id || null,
          subscriptionStatus: data.role === 'disabled' ? false : (data.subscription_status !== undefined ? data.subscription_status : false),
          subscriptionExpiry: data.subscription_expiry || null,
          password_hash: data.password_hash || null,
          role: data.role || (isUserAdmin(data) ? 'admin' : 'user'),
          isDisabled: data.role === 'disabled'
        };
      }
    } catch (e) { }
  }

  return null;
}

// Helper: Save Subscription Order via Prisma ORM
async function saveSubscriptionOrder(orderObj) {
  if (!orderObj) return;
  try {
    if (prisma && prisma.subscriptionOrder) {
      await prisma.subscriptionOrder.upsert({
        where: { order_id: orderObj.order_id },
        update: {
          user_id: orderObj.user_id || null,
          email: orderObj.email || null,
          amount: String(orderObj.amount || '45.00'),
          currency: orderObj.currency || 'USDT',
          status: orderObj.status || 'pending',
          payment_url: orderObj.payment_url || null,
          cryptomus_uuid: orderObj.cryptomus_uuid || null,
          paid_at: orderObj.paid_at ? new Date(orderObj.paid_at) : null
        },
        create: {
          order_id: orderObj.order_id,
          user_id: orderObj.user_id || null,
          email: orderObj.email || null,
          amount: String(orderObj.amount || '45.00'),
          currency: orderObj.currency || 'USDT',
          status: orderObj.status || 'pending',
          payment_url: orderObj.payment_url || null,
          cryptomus_uuid: orderObj.cryptomus_uuid || null,
          paid_at: orderObj.paid_at ? new Date(orderObj.paid_at) : null
        }
      });
      console.log(`[Prisma ORM] ✅ Saved subscription order ${orderObj.order_id} (${orderObj.status})`);
      return;
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ Notice saving subscription order:`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      const payload = {
        order_id: orderObj.order_id,
        user_id: orderObj.user_id || null,
        email: orderObj.email || null,
        amount: String(orderObj.amount || '45.00'),
        currency: orderObj.currency || 'USDT',
        status: orderObj.status || 'pending',
        payment_url: orderObj.payment_url || null,
        cryptomus_uuid: orderObj.cryptomus_uuid || null,
        paid_at: orderObj.paid_at || null,
        updated_at: new Date().toISOString()
      };
      await supabaseServer.from('subscription_orders').upsert(payload, { onConflict: 'order_id' });
    } catch (e) { }
  }
}

// Helper to safely format order and serialize BigInt ID
function formatSubscriptionOrder(order) {
  if (!order) return null;
  return {
    ...order,
    id: order.id !== undefined && order.id !== null ? String(order.id) : null
  };
}

// Helper: Find Subscription Order by order_id via Prisma ORM
async function findSubscriptionOrder(orderId) {
  if (!orderId) return null;
  try {
    if (prisma && prisma.subscriptionOrder) {
      const order = await prisma.subscriptionOrder.findUnique({
        where: { order_id: orderId }
      });
      if (order) return formatSubscriptionOrder(order);
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ Notice finding subscription order:`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('subscription_orders')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();
      if (!error && data) return formatSubscriptionOrder(data);
    } catch (e) { }
  }

  return null;
}

// Helper: Find Subscription Order by Payment ID (NOWPayments / Cryptomus) via Prisma ORM
async function findSubscriptionOrderByPaymentId(paymentId) {
  if (!paymentId) return null;
  const strId = String(paymentId).trim();
  try {
    if (prisma && prisma.subscriptionOrder) {
      const order = await prisma.subscriptionOrder.findFirst({
        where: {
          OR: [
            { cryptomus_uuid: strId },
            { order_id: strId }
          ]
        }
      });
      if (order) return formatSubscriptionOrder(order);
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ Notice finding subscription order by payment ID:`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('subscription_orders')
        .select('*')
        .or(`cryptomus_uuid.eq.${strId},order_id.eq.${strId}`)
        .maybeSingle();
      if (!error && data) return formatSubscriptionOrder(data);
    } catch (e) { }
  }

  return null;
}

/**
 * Record user profile and login event via Prisma ORM & Database
 */
async function recordUserLoginToSupabase(user, req) {
  if (!user) return;
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
  const userId = user.id || user.sub;

  // 1. Sync User Profile to Database
  await saveUserToDb(user);

  // 2. Insert Login Event via Prisma ORM
  try {
    if (prisma && prisma.userLogin) {
      await prisma.userLogin.create({
        data: {
          user_id: userId,
          email: user.email,
          name: user.name || user.email?.split('@')[0],
          ip_address: ip
        }
      });
      console.log(`[Prisma ORM] ✅ Logged in record inserted for: ${user.email}`);
      return;
    }
  } catch (err) {
    console.warn(`[Prisma ORM] ⚠️ Login event record notice:`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      await supabaseServer.from('user_logins').insert({
        user_id: userId,
        email: user.email,
        name: user.name || user.email?.split('@')[0],
        logged_in_at: new Date().toISOString(),
        ip_address: ip
      });
    } catch (e) { }
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
  } catch (e) { }

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
    if (dbUser && (dbUser.role === 'disabled' || dbUser.isDisabled)) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        error: 'ACCOUNT_DISABLED',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ hỗ trợ.'
      });
    }
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

  // Enforce Disabled Account Barrier (Cannot access any protected APIs)
  if (dbUser.role === 'disabled' || dbUser.isDisabled) {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_DISABLED',
      error: 'ACCOUNT_DISABLED',
      message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ hỗ trợ.'
    });
  }

  // Enforce Single Device Limit (Bypassed if ALLOW_CONCURRENT_SESSIONS is true)
  if (!ALLOW_CONCURRENT_SESSIONS && dbUser.currentDeviceId && sessionPayload.deviceId && dbUser.currentDeviceId !== sessionPayload.deviceId) {
    return res.status(401).json({
      success: false,
      code: 'DEVICE_SESSION_TERMINATED',
      error: 'DEVICE_SESSION_TERMINATED',
      message: 'Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.'
    });
  }

  const isSubActive = isUserSubscriptionActive(dbUser);
  const subExp = dbUser.subscriptionExpiry || dbUser.subscription_expiry || null;

  req.user = {
    ...dbUser,
    sub: dbUser.id || dbUser.sub,
    deviceId: sessionPayload.deviceId,
    subscriptionStatus: isSubActive,
    subscription_status: isSubActive,
    subscriptionExpiry: subExp ? (typeof subExp === 'string' ? subExp : new Date(subExp).toISOString()) : null,
    subscription_expiry: subExp ? (typeof subExp === 'string' ? subExp : new Date(subExp).toISOString()) : null,
    role: isUserAdmin(dbUser) ? 'admin' : (dbUser.role || 'user')
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
 * Helper to decode JWT Payload without external dependencies (supports base64url)
 */
function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const payloadStr = Buffer.from(base64, 'base64').toString('utf8');
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
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const authMatch = envContent.match(/^(?:CRAZII_ACCESS_TOKEN|CRAZII_AUTH_TOKEN|AUTH_TOKEN)=(.*)$/m);
      if (authMatch && authMatch[1].trim() && !authMatch[1].includes('PLACEHOLDER')) {
        const val = authMatch[1].trim().replace(/^Bearer\s+/i, '');
        const jwt = decodeJwt(val);
        if (jwt && jwt.exp && jwt.exp > nowSec) {
          memoryAccessToken = val;
        }
      }
      const refMatch = envContent.match(/^(?:CRAZII_REFRESH_TOKEN|REFRESH_TOKEN)=(.*)$/m);
      if (refMatch && refMatch[1].trim() && !refMatch[1].includes('PLACEHOLDER')) {
        const val = refMatch[1].trim().replace(/^Bearer\s+/i, '');
        const jwt = decodeJwt(val);
        if (jwt && jwt.exp && jwt.exp > nowSec) {
          memoryRefreshToken = val;
        }
      }
      const devMatch = envContent.match(/^(?:CRAZII_DEVICE_ID|DEVICE_ID)=(.*)$/m);
      if (devMatch && devMatch[1].trim() && !devMatch[1].includes('PLACEHOLDER')) {
        memoryDeviceId = devMatch[1].trim();
      }
    }
  } catch (e) { }

  if (!memoryAccessToken) {
    const envVal = (process.env.CRAZII_ACCESS_TOKEN || process.env.CRAZII_AUTH_TOKEN || process.env.AUTH_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
    const jwt = decodeJwt(envVal);
    if (jwt && jwt.exp && jwt.exp > nowSec) {
      memoryAccessToken = envVal;
    } else if (envVal && !envVal.includes('PLACEHOLDER')) {
      delete process.env.CRAZII_ACCESS_TOKEN;
      delete process.env.CRAZII_AUTH_TOKEN;
      delete process.env.AUTH_TOKEN;
    }
  }
  if (!memoryRefreshToken) {
    const envVal = (process.env.CRAZII_REFRESH_TOKEN || process.env.REFRESH_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
    const jwt = decodeJwt(envVal);
    if (jwt && jwt.exp && jwt.exp > nowSec) {
      memoryRefreshToken = envVal;
    } else if (envVal && !envVal.includes('PLACEHOLDER')) {
      console.log(`[Token ENV] ⚠️ Render/System ENV token is expired (${jwt?.exp ? jwt.exp - nowSec : 0}s). Expired ENV token purged. Will prioritize loading fresh token from Database.`);
      delete process.env.CRAZII_REFRESH_TOKEN;
      delete process.env.REFRESH_TOKEN;
    }
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
 * Helpers to read/write persistent system settings from PostgreSQL (Prisma SystemSetting)
 */
async function getSystemSetting(key) {
  try {
    if (prisma && prisma.systemSetting) {
      const row = await prisma.systemSetting.findUnique({ where: { key } });
      if (row && row.value) return row.value;
    }
  } catch (err) {
    console.warn(`[SystemSetting] ⚠️ Read error for "${key}":`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (!error && data) return data.value;
    } catch (e) { }
  }
  return null;
}

async function saveSystemSetting(key, value) {
  if (!key || !value) return false;
  try {
    if (prisma && prisma.systemSetting) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value), updated_at: new Date() },
        create: { key, value: String(value) }
      });
      return true;
    }
  } catch (err) {
    console.warn(`[SystemSetting] ⚠️ Save error for "${key}":`, err.message);
  }

  // Fallback to Supabase REST
  if (supabaseServer) {
    try {
      const { error } = await supabaseServer
        .from('system_settings')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() });
      return !error;
    } catch (e) { }
  }
  return false;
}

async function loadTokensFromDb() {
  try {
    const dbRefreshToken = await getSystemSetting('crazii_refresh_token');
    if (dbRefreshToken && !dbRefreshToken.includes('PLACEHOLDER')) {
      const dbJwt = decodeJwt(dbRefreshToken);
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpired = Boolean(dbJwt && dbJwt.exp && dbJwt.exp <= nowSec);
      if (!isExpired) {
        memoryRefreshToken = dbRefreshToken;
        process.env.CRAZII_REFRESH_TOKEN = dbRefreshToken;
        console.log(`[Token DB] 🔑 Loaded Crazii Refresh Token from Database! (Expires in ~${dbJwt?.exp ? Math.round((dbJwt.exp - nowSec) / 3600) + 'h' : 'active'})`);
      } else {
        console.log(`[Token DB] ⚠️ Refresh Token in Database is expired (${dbJwt?.exp ? dbJwt.exp - nowSec : 0}s).`);
      }
    } else if (memoryRefreshToken && !memoryRefreshToken.includes('PLACEHOLDER')) {
      const jwt = decodeJwt(memoryRefreshToken);
      const nowSec = Math.floor(Date.now() / 1000);
      if (jwt && jwt.exp && jwt.exp > nowSec) {
        await saveSystemSetting('crazii_refresh_token', memoryRefreshToken);
        console.log(`[Token DB] 💾 Seeded valid Refresh Token from .env into Database.`);
      } else {
        console.log(`[Token DB] ⚠️ Refresh Token in .env is expired (${jwt?.exp ? jwt.exp - nowSec : 0}s). Skipped seeding to prevent database pollution.`);
      }
    }

    const dbAccessToken = await getSystemSetting('crazii_access_token');
    if (dbAccessToken && !dbAccessToken.includes('PLACEHOLDER')) {
      const jwt = decodeJwt(dbAccessToken);
      const nowSec = Math.floor(Date.now() / 1000);
      if (jwt && jwt.exp && jwt.exp > nowSec + 60) {
        memoryAccessToken = dbAccessToken;
        process.env.CRAZII_ACCESS_TOKEN = dbAccessToken;
        console.log(`[Token DB] 🔑 Loaded valid Access Token from Database (expires in ${jwt.exp - nowSec}s).`);
      }
    }
  } catch (err) {
    console.warn(`[Token DB] ⚠️ Failed to load tokens from Database:`, err.message);
  }
}

/**
 * Helper to persist tokens to memory, .env file, and PostgreSQL Database
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

      // Persist to Database asynchronously
      saveSystemSetting('crazii_access_token', cleanAuth).then((ok) => {
        if (ok) {
          console.log(`[Token DB] 💾 Successfully saved new Access Token to Database!`);
        }
      }).catch(() => { });

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

      // Persist to Database asynchronously
      saveSystemSetting('crazii_refresh_token', cleanRefresh).then((ok) => {
        if (ok) {
          console.log(`[Token DB] 💾 Successfully saved new Refresh Token to Database!`);
        }
      }).catch(() => { });

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
nextApp.prepare().then(async () => {
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
  ioServer = io;

  // Mutex for single-flight token refresh
  let inFlightRefreshPromise = null;
  let lastRefreshTimestamp = 0;

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
      let refreshToken = customRefreshToken;
      if (!refreshToken) {
        // ALWAYS check Database first to ensure any manual or external DB update is picked up immediately
        try {
          const dbRef = await getSystemSetting('crazii_refresh_token');
          if (dbRef && !dbRef.includes('PLACEHOLDER')) {
            const dbJwt = decodeJwt(dbRef);
            const nowSec = Math.floor(Date.now() / 1000);
            const isExpired = Boolean(dbJwt && dbJwt.exp && dbJwt.exp <= nowSec);
            if (!isExpired) {
              memoryRefreshToken = dbRef.trim();
              process.env.CRAZII_REFRESH_TOKEN = dbRef.trim();
            }
          }
        } catch (e) { }
        refreshToken = getActiveRefreshToken();
      }

      refreshToken = (refreshToken || '').replace(/^Bearer\s+/i, '').trim();
      const deviceId = getActiveDeviceId();

      if (!refreshToken || refreshToken.includes('PLACEHOLDER')) {
        console.warn(`[Token Refresh] ❌ No valid REFRESH_TOKEN found in Database or ENV to generate new Access Token.`);
        return { success: false, message: 'No valid Refresh Token found. Please update crazii_refresh_token in Database.' };
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

      console.log(`[Token Refresh] 🔄 Refreshing 15-minute Access Token using 3-day Refresh Token (Source: ${refreshToken === customRefreshToken ? 'Custom' : 'Database/Memory'})...`);
      try {
        let response = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ token: refreshToken })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[Token Refresh] ❌ Crazii API rejected refresh request (${response.status}): ${errText}`);

          // Automatic Recovery: If current token was rejected, check if DB has a newer/different token!
          try {
            const latestDbToken = await getSystemSetting('crazii_refresh_token');
            if (latestDbToken && latestDbToken.trim() !== refreshToken && !latestDbToken.includes('PLACEHOLDER')) {
              const latestJwt = decodeJwt(latestDbToken);
              const nowSec = Math.floor(Date.now() / 1000);
              const isExpired = Boolean(latestJwt && latestJwt.exp && latestJwt.exp <= nowSec);
              if (!isExpired) {
                console.log(`[Token Refresh] 🔄 Found newer valid Refresh Token in Database! Retrying refresh with DB token...`);
                memoryRefreshToken = latestDbToken.trim();
                process.env.CRAZII_REFRESH_TOKEN = latestDbToken.trim();
                response = await fetch(targetUrl, {
                  method: 'POST',
                  headers: headers,
                  body: JSON.stringify({ token: latestDbToken.trim().replace(/^Bearer\s+/i, '') })
                });
              }
            }
          } catch (retryErr) {
            console.warn(`[Token Refresh Retry Notice]:`, retryErr.message);
          }

          if (!response.ok) {
            const finalErrText = await response.text().catch(() => errText);
            return { success: false, status: response.status, message: 'Refresh Token rejected by Crazii', raw: finalErrText };
          }
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
        lastRefreshTimestamp = Date.now();

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
    // 1. Check if DB was updated externally
    try {
      const dbRef = await getSystemSetting('crazii_refresh_token');
      if (dbRef && dbRef.trim() !== memoryRefreshToken.trim() && !dbRef.includes('PLACEHOLDER')) {
        const dbJwt = decodeJwt(dbRef);
        const nowSec = Math.floor(Date.now() / 1000);
        const isExpired = Boolean(dbJwt && dbJwt.exp && dbJwt.exp <= nowSec);
        if (!isExpired) {
          console.log(`[Auto-Refresher] 🔄 Detected fresh Refresh Token in Database! Syncing into memory & refreshing...`);
          memoryRefreshToken = dbRef.trim();
          process.env.CRAZII_REFRESH_TOKEN = dbRef.trim();
          await executeRefreshToken(dbRef.trim(), true);
          return;
        }
      }
    } catch (e) { }

    // 2. Refresh Access Token before expiration
    const currentAuth = getActiveAuthToken();
    const jwt = decodeJwt(currentAuth);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!jwt || !jwt.exp || (jwt.exp - nowSec <= 120)) {
      console.log(`[Auto-Refresher] ⏳ Access token expiring soon (TimeLeft: ${jwt?.exp ? jwt.exp - nowSec : 0}s). Proactively auto-refreshing in background...`);
      await executeRefreshToken();
    }
  }, 30000);

  // Background Scheduler: Periodically scan & sync expired subscriptions (every 10 minutes)
  async function autoExpireSubscriptions() {
    try {
      if (prisma && prisma.user) {
        const now = new Date();
        const res = await prisma.user.updateMany({
          where: {
            subscription_status: true,
            subscription_expiry: { lte: now },
            role: { not: 'admin' }
          },
          data: {
            subscription_status: false
          }
        });
        if (res.count > 0) {
          console.log(`[Auto-Expire Worker] ⏰ Automatically flipped ${res.count} expired subscription(s) to subscription_status = false.`);
        }
      }
    } catch (err) {
      console.warn(`[Auto-Expire Worker Notice]:`, err.message);
    }
  }

  setTimeout(autoExpireSubscriptions, 5000);
  setInterval(autoExpireSubscriptions, 10 * 60 * 1000);

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
      const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.work';
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
      const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.work';
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
      const fromSender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@tradewh.work';
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
      if (existingUser.role === 'disabled' || existingUser.isDisabled) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_DISABLED',
          message: 'Tài khoản này đã bị vô hiệu hóa bởi Quản trị viên. Không thể đăng ký hoặc đăng nhập.'
        });
      }
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
    const existingUser = await findUserByEmail(cleanEmail);
    if (existingUser && (existingUser.role === 'disabled' || existingUser.isDisabled)) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Không thể đăng nhập.'
      });
    }

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

    await recordUserLoginToSupabase(user, req);

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

    if (existingUser.role === 'disabled' || existingUser.isDisabled) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Không thể đăng nhập.'
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

    await recordUserLoginToSupabase(updatedUser, req);

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

    if (existingUser.role === 'disabled' || existingUser.isDisabled) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ hỗ trợ.'
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

    // Build absolute Magic Link URL using configured APP_URL or request origin
    const origin = getAppBaseUrl(req);
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

    await recordUserLoginToSupabase(updatedUser, req);

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

    if (existingUser.role === 'disabled' || existingUser.isDisabled) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ hỗ trợ.'
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

    await recordUserLoginToSupabase(updatedUser, req);

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

      // Barrier: Disabled accounts cannot login via Google
      if (existingUser && (existingUser.role === 'disabled' || existingUser.isDisabled)) {
        console.warn(`[Google Auth] ⚠️ Rejected login: User ${email} is disabled.`);
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_DISABLED',
          message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Không thể đăng nhập.'
        });
      }

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
        avatar_url: payload.picture || null,
        currentDeviceId: newDeviceId,
        subscriptionStatus: isUserSubscriptionActive(existingUser || {}),
        subscriptionExpiry: existingUser?.subscriptionExpiry || null,
        role: isUserAdmin({ email }) ? 'admin' : (existingUser?.role || 'user')
      };

      await recordUserLoginToSupabase(user, req);

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
          } catch (e) { }
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
    let isExpired = false;
    let isNotActivated = false;

    const expiryTime = dbUser.subscriptionExpiry ? new Date(dbUser.subscriptionExpiry).getTime() : 0;
    if (expiryTime > 0) {
      if (expiryTime > Date.now()) {
        const diffMs = expiryTime - Date.now();
        daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      } else {
        isExpired = true;
      }
    } else {
      isNotActivated = true;
    }

    // Lazy sync in DB: If subscription is expired, asynchronously set subscription_status = false
    if (isExpired && !isAdmin && (dbUser.subscription_status === true || dbUser.subscriptionStatus === true)) {
      const targetUserId = dbUser.id || dbUser.sub;
      if (prisma && prisma.user && targetUserId) {
        prisma.user.update({
          where: { id: targetUserId },
          data: { subscription_status: false }
        }).catch(() => { });
      }
      if (supabaseServer && targetUserId) {
        supabaseServer.from('users').update({ subscription_status: false }).eq('id', targetUserId).catch(() => { });
      }
    }

    // Proactive Auto-Check: If user is not active, check if they have any pending orders from the last 24h
    if (!isActive && !isAdmin && NOWPAYMENTS_API_KEY && prisma) {
      try {
        const pendingOrder = await prisma.subscriptionOrder.findFirst({
          where: {
            OR: [
              { user_id: dbUser.id || dbUser.sub },
              { email: dbUser.email }
            ],
            status: { in: ['pending', 'waiting'] },
            created_at: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) }
          },
          orderBy: { created_at: 'desc' }
        });

        if (pendingOrder && pendingOrder.cryptomus_uuid) {
          const checkRes = await fetch(`https://api.nowpayments.io/v1/payment/${pendingOrder.cryptomus_uuid}`, {
            method: 'GET',
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const remoteStatus = checkData?.payment_status;
            if (remoteStatus === 'finished' || remoteStatus === 'confirmed' || remoteStatus === 'sending') {
              console.log(`[Auto-Reconciliation] 🚀 Found confirmed pending payment [${pendingOrder.cryptomus_uuid}] for ${dbUser.email}! Activating now...`);
              await processSuccessfulPayment({
                orderId: pendingOrder.order_id,
                paymentId: pendingOrder.cryptomus_uuid,
                paymentStatus: remoteStatus,
                actuallyPaid: checkData.actually_paid,
                priceAmount: checkData.price_amount,
                payCurrency: checkData.pay_currency,
                source: 'User Subscription Auto-Reconciliation',
                req
              });

              // Re-fetch fresh user status after activation
              const freshUser = (await findUserByEmail(user.email)) || (await findUserById(user.id || user.sub));
              if (freshUser) {
                const freshActive = isUserSubscriptionActive(freshUser);
                if (freshActive) {
                  const freshExpiry = freshUser.subscriptionExpiry || freshUser.subscription_expiry;
                  const freshExpTime = freshExpiry ? new Date(freshExpiry).getTime() : 0;
                  const freshDiff = Math.max(0, Math.ceil((freshExpTime - Date.now()) / (1000 * 60 * 60 * 24)));
                  return res.json({
                    success: true,
                    subscriptionStatus: true,
                    subscriptionExpiry: freshExpiry,
                    daysLeft: freshDiff,
                    isAdmin: false,
                    isExpired: false,
                    isNotActivated: false,
                    subscriptionState: 'active',
                    role: freshUser.role || 'user',
                    email: freshUser.email,
                    name: freshUser.name,
                    autoActivated: true
                  });
                }
              }
            }
          }
        }
      } catch (reconErr) {
        console.warn('[Auto-Reconciliation Notice]', reconErr.message);
      }
    }

    const subscriptionState = isAdmin ? 'admin' : (isActive ? 'active' : (isExpired ? 'expired' : 'not_activated'));

    return res.json({
      success: true,
      subscriptionStatus: isActive,
      subscriptionExpiry: dbUser.subscriptionExpiry || null,
      daysLeft: (isAdmin && isActive && !dbUser.subscriptionExpiry) ? 9999 : daysLeft,
      isAdmin: isAdmin,
      isExpired: !isAdmin && isExpired,
      isNotActivated: !isAdmin && isNotActivated,
      subscriptionState,
      role: isAdmin ? 'admin' : (dbUser.role || 'user'),
      email: dbUser.email,
      name: dbUser.name
    });
  });

  // POST /api/subscription/cancel (Admin-Only: Cancel/Revoke user subscription with confirmation)
  app.post('/api/subscription/cancel', requireAuthAndDevice, async (req, res) => {
    try {
      const user = req.user;

      // Bỏ phân cấp role admin: Cho phép người dùng thao tác hủy / thu hồi gói

      const { targetEmail } = req.body || {};
      const emailToCancel = (targetEmail || '').toLowerCase().trim();

      if (!emailToCancel) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp email của tài khoản cần hủy gói cước.'
        });
      }

      const targetUser = (await findUserByEmail(emailToCancel)) || (await findUserById(emailToCancel));
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: `Không tìm thấy tài khoản người dùng với email "${emailToCancel}".`
        });
      }

      const userId = String(targetUser.id || targetUser.sub || '').trim();

      // Update Prisma User & Subscription Orders atomically via Transaction
      if (prisma && prisma.$transaction) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: userId },
              data: {
                subscription_status: false,
                subscription_expiry: null
              }
            });

            await tx.subscriptionOrder.updateMany({
              where: {
                OR: [
                  { user_id: userId },
                  { email: emailToCancel }
                ],
                status: { in: ['waiting', 'pending'] }
              },
              data: { status: 'cancelled' }
            });
          }, { maxWait: 5000, timeout: 10000 });
          console.log(`[Subscription Cancel Transaction] ⚡ Successfully revoked subscription & cancelled orders for ${emailToCancel}`);
        } catch (dbErr) {
          console.warn(`[Subscription Cancel Transaction] ⚠️ Notice during transaction:`, dbErr.message);
        }
      }

      // Update Supabase users
      if (supabaseServer) {
        try {
          await supabaseServer.from('users').update({
            subscription_status: false,
            subscription_expiry: null
          }).eq('id', userId);
        } catch (supErr) {
          console.warn(`[Subscription Cancel] Supabase update notice:`, supErr.message);
        }

        try {
          await supabaseServer.from('subscription_orders').update({
            status: 'cancelled'
          }).eq('user_id', userId).in('status', ['waiting', 'pending']);
        } catch (e) { }
      }

      console.log(`[Subscription Cancel] 🛑 Cancelled subscription for: ${emailToCancel} (Requested by: ${user.email})`);

      return res.json({
        success: true,
        message: `Hủy gói cước thành công cho tài khoản ${emailToCancel}. Tài khoản đã chuyển về trạng thái Chưa kích hoạt.`,
        subscriptionStatus: false,
        subscriptionExpiry: null,
        daysLeft: 0
      });
    } catch (err) {
      console.error(`[Subscription Cancel Error]:`, err.message);
      return res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ khi hủy gói cước: ' + err.message
      });
    }
  });

  // POST /api/payment/create-invoice & POST /api/payment/create (Create Direct Crypto Payment)
  const handleCreatePaymentInvoice = async (req, res) => {
    const user = req.user;
    const userId = user.id || user.sub;
    const orderId = `SUB_${userId}_${Date.now()}`;
    const baseUrl = getAppBaseUrl(req);
    const { amount = "45.00", currency = "usd", network = "bsc", pay_currency } = req.body || {};

    // Map network to NOWPayments currency tickers (usdtbsc = BSC/BEP20, usdterc20 = Ethereum/ERC20)
    let selectedPayCurrency = 'usdtbsc';
    if (pay_currency) {
      selectedPayCurrency = pay_currency.toLowerCase();
    } else if (network === 'eth' || network === 'erc20' || network === 'usdterc20') {
      selectedPayCurrency = 'usdterc20';
    } else {
      selectedPayCurrency = 'usdtbsc';
    }

    const networkName = selectedPayCurrency === 'usdterc20' ? 'ETH (ERC-20)' : 'BSC (BEP-20)';

    console.log(`[Payment] 💳 Initiating direct payment for ${user.email} (Order: ${orderId}, Network: ${networkName}, Amount: $${amount}, BaseUrl: ${baseUrl})...`);

    // 1. Try NOWPayments Direct Invoice-Payment Flow (/v1/invoice + /v1/invoice-payment)
    if (NOWPAYMENTS_API_KEY) {
      try {
        let numAmount = parseFloat(amount) || 45.00;

        const invPayload = {
          price_amount: numAmount,
          price_currency: currency.toLowerCase(),
          order_id: orderId,
          order_description: `Gói TRADEWH Pro (30 Ngày) - $${numAmount.toFixed(2)} [USDT ${networkName}]`,
          ipn_callback_url: `${baseUrl}/api/payment/webhook`,
          success_url: `${baseUrl}/subscription?status=success&order_id=${orderId}`,
          cancel_url: `${baseUrl}/subscription?status=cancel&order_id=${orderId}`
        };

        const invResponse = await fetch('https://api.nowpayments.io/v1/invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NOWPAYMENTS_API_KEY
          },
          body: JSON.stringify(invPayload)
        });

        const invData = await invResponse.json();

        if (invResponse.ok && invData.id) {
          const invoiceId = String(invData.id);

          // Step 2: Create payment bound to this invoice for the selected currency
          const payResponse = await fetch('https://api.nowpayments.io/v1/invoice-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': NOWPAYMENTS_API_KEY
            },
            body: JSON.stringify({
              iid: invoiceId,
              pay_currency: selectedPayCurrency
            })
          });

          const payData = await payResponse.json();

          if (payResponse.ok && payData.payment_id) {
            const paymentId = String(payData.payment_id);
            const directPaymentUrl = `https://nowpayments.io/payment?iid=${invoiceId}&paymentId=${paymentId}`;

            await saveSubscriptionOrder({
              order_id: orderId,
              user_id: userId,
              email: user.email,
              amount: String(numAmount),
              currency: `USDT (${networkName})`,
              status: 'pending',
              payment_url: directPaymentUrl,
              cryptomus_uuid: paymentId
            });

            console.log(`[NOWPayments] ✅ Direct Invoice-Payment created: ${directPaymentUrl} (IID: ${invoiceId}, PID: ${paymentId}, Network: ${networkName}, Amount: $${numAmount})`);

            return res.json({
              success: true,
              orderId: orderId,
              invoiceId: invoiceId,
              paymentId: paymentId,
              paymentUrl: directPaymentUrl,
              invoiceUrl: directPaymentUrl,
              payAddress: payData.pay_address,
              payAmount: payData.pay_amount,
              payCurrency: payData.pay_currency || selectedPayCurrency,
              network: selectedPayCurrency === 'usdterc20' ? 'eth' : 'bsc',
              networkName: networkName,
              expirationDate: payData.expiration_estimate_date || null,
              amount: String(numAmount)
            });
          } else {
            console.warn('[NOWPayments /v1/invoice-payment notice]', payData);
            if (payData.message && (payData.message.includes('less than minimal') || payData.message.includes('minimal') || payData.message.includes('too small'))) {
              return res.status(400).json({
                success: false,
                message: `Mức nạp tối thiểu của mạng ${networkName} là cao hơn $${amount} do phí gas. Khuyên bạn nên chọn mạng BSC (BEP-20) chỉ từ $0.07!`,
                raw: payData
              });
            }

            // Fallback to standard invoice URL if invoice-payment couldn't be bound
            const fallbackInvUrl = invData.invoice_url || `https://nowpayments.io/payment?iid=${invoiceId}`;
            await saveSubscriptionOrder({
              order_id: orderId,
              user_id: userId,
              email: user.email,
              amount: String(numAmount),
              currency: `USDT (${networkName})`,
              status: 'pending',
              payment_url: fallbackInvUrl,
              cryptomus_uuid: invoiceId
            });

            return res.json({
              success: true,
              orderId: orderId,
              invoiceId: invoiceId,
              paymentUrl: fallbackInvUrl,
              invoiceUrl: fallbackInvUrl,
              network: selectedPayCurrency === 'usdterc20' ? 'eth' : 'bsc',
              networkName: networkName,
              amount: String(numAmount)
            });
          }
        } else {
          console.warn('[NOWPayments /v1/invoice notice]', invData);
        }
      } catch (err) {
        console.error('[NOWPayments Exception]', err.message);
      }
    }

    // 2. Fallback to Cryptomus Gateway if configured
    if (CRYPTOMUS_MERCHANT_ID && CRYPTOMUS_PAYMENT_API_KEY) {
      try {
        const payload = {
          amount: String(amount || "45.00"),
          currency: "USDT",
          order_id: orderId,
          url_return: `${baseUrl}/subscription?order_id=${orderId}&status=success`,
          url_callback: `${baseUrl}/api/payment/webhook`,
          is_payment_multiple: false,
          lifetime: 3600,
          additional_data: JSON.stringify({ userId: userId, email: user.email })
        };

        const sign = generateCryptomusSignature(payload, CRYPTOMUS_PAYMENT_API_KEY);
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
          await saveSubscriptionOrder({
            order_id: orderId,
            user_id: userId,
            email: user.email,
            amount: String(amount || "45.00"),
            currency: "USDT",
            status: 'pending',
            payment_url: data.result.url,
            cryptomus_uuid: data.result.uuid
          });

          return res.json({
            success: true,
            orderId: orderId,
            invoiceUrl: data.result.url,
            paymentUrl: data.result.url,
            uuid: data.result.uuid
          });
        }
      } catch (err) {
        console.error('[Cryptomus API Exception]', err.message);
      }
    }

    // 3. Fallback Demo / Simulated Payment Flow for development & testing
    const mockUrl = `https://nowpayments.io/payment/?iid=mock_${orderId}`;
    await saveSubscriptionOrder({
      order_id: orderId,
      user_id: userId,
      email: user.email,
      amount: String(amount || "15.00"),
      currency: "USD",
      status: 'pending',
      payment_url: mockUrl,
      is_mock: true
    });

    return res.json({
      success: true,
      orderId: orderId,
      invoiceUrl: mockUrl,
      paymentUrl: mockUrl,
      is_mock: true,
      message: 'Chế độ mô phỏng NOWPayments (chưa cấu hình NOWPAYMENTS_API_KEY)'
    });
  };

  app.post('/api/payment/create-invoice', requireAuthAndDevice, handleCreatePaymentInvoice);
  app.post('/api/payment/create', requireAuthAndDevice, handleCreatePaymentInvoice);

  /**
   * Core Idempotent & Atomic Payment Activation Processor
   * Executed inside a Prisma Database Transaction (ACID) to guarantee:
   * 1. 100% Atomicity: Order status & User subscription expiry are committed together or rolled back.
   * 2. Concurrency / Double Credit Shield: Prevents simultaneous Webhook + Polling from double-extending days.
   * 3. Idempotency: Finished / Confirmed orders exit immediately without touching expiry.
   * 4. Multi-DataStore Sync: Non-blocking Supabase REST sync post-commit.
   */
  async function processSuccessfulPayment({
    orderId,
    paymentId,
    paymentStatus,
    actuallyPaid,
    priceAmount,
    payCurrency,
    source = 'Webhook',
    req = null
  }) {
    console.log(`[Payment Processor] ⚡ Processing payment notification from [${source}] for Order [${orderId || paymentId}] (Status: ${paymentStatus})...`);

    // 1. Resolve Order ID
    let resolvedOrderId = orderId;
    if (!resolvedOrderId && paymentId) {
      const existing = await findSubscriptionOrderByPaymentId(String(paymentId));
      if (existing) resolvedOrderId = existing.order_id;
    }

    const finalStatus = paymentStatus === 'sending' ? 'confirmed' : (paymentStatus || 'finished');
    const paymentAmount = String(priceAmount || actuallyPaid || "15.00");
    const currency = payCurrency || "USDT";
    const cryptomusUuid = String(paymentId || '');

    // 2. Execute via Prisma Interactive Transaction (PostgreSQL ACID)
    if (prisma && prisma.$transaction) {
      try {
        const txResult = await prisma.$transaction(async (tx) => {
          // A. Locate Order inside transaction
          let txOrder = resolvedOrderId ? await tx.subscriptionOrder.findUnique({
            where: { order_id: resolvedOrderId }
          }) : null;

          if (!txOrder && paymentId) {
            txOrder = await tx.subscriptionOrder.findFirst({
              where: { cryptomus_uuid: String(paymentId) }
            });
            if (txOrder) resolvedOrderId = txOrder.order_id;
          }

          // B. STRICT IDEMPOTENCY GUARD:
          // If order is ALREADY finished or confirmed, EXIT IMMEDIATELY.
          if (txOrder && (txOrder.status === 'finished' || txOrder.status === 'confirmed')) {
            return {
              alreadyProcessed: true,
              orderId: resolvedOrderId,
              status: txOrder.status,
              paid_at: txOrder.paid_at,
              message: 'Order was already processed previously'
            };
          }

          // C. ATOMIC STATUS CLAIM (Concurrency Lock):
          // If order exists and is pending/waiting, update it atomically.
          // If another concurrent request already marked it finished, updateMany returns count === 0!
          if (txOrder) {
            const claimResult = await tx.subscriptionOrder.updateMany({
              where: {
                order_id: resolvedOrderId,
                OR: [
                  { status: { in: ['pending', 'waiting'] } },
                  { status: null }
                ]
              },
              data: {
                status: finalStatus,
                amount: paymentAmount,
                currency: currency,
                cryptomus_uuid: cryptomusUuid || txOrder.cryptomus_uuid || null,
                paid_at: new Date()
              }
            });

            if (claimResult.count === 0) {
              return {
                alreadyProcessed: true,
                orderId: resolvedOrderId,
                message: 'Order already processed concurrently by another process'
              };
            }
          }

          // D. Identify Target User inside Transaction
          let targetUserId = txOrder?.user_id || null;
          let targetEmail = txOrder?.email || null;

          if (!targetUserId && resolvedOrderId && resolvedOrderId.startsWith('SUB_')) {
            const parts = resolvedOrderId.split('_');
            const candidate = parts.slice(1, -1).join('_') || parts[1];
            if (candidate && candidate.includes('@')) {
              targetEmail = candidate;
            } else if (candidate) {
              targetUserId = candidate;
            }
          }

          // Query user inside tx
          let txUser = null;
          if (targetUserId) {
            txUser = await tx.user.findUnique({ where: { id: targetUserId } });
          }
          if (!txUser && targetEmail) {
            txUser = await tx.user.findUnique({ where: { email: targetEmail.toLowerCase().trim() } });
          }
          if (!txUser && targetUserId) {
            txUser = await tx.user.findFirst({ where: { email: targetUserId.toLowerCase().trim() } });
          }

          if (!txUser) {
            throw new Error(`User not found for order [${resolvedOrderId}]. Transaction aborted to preserve atomicity.`);
          }

          // E. Calculate +30 Days Subscription Expiry
          const currentExpiryTime = txUser.subscription_expiry ? new Date(txUser.subscription_expiry).getTime() : 0;
          const nowTime = Date.now();
          const baseTime = currentExpiryTime > nowTime ? currentExpiryTime : nowTime;
          const newExpiry = new Date(baseTime + (30 * 24 * 3600 * 1000));

          // F. Atomic User Update inside Transaction
          const updatedTxUser = await tx.user.update({
            where: { id: txUser.id },
            data: {
              subscription_status: true,
              subscription_expiry: newExpiry
            }
          });

          // G. If order didn't exist in DB before (e.g. ad-hoc order), create it within transaction
          if (!txOrder) {
            await tx.subscriptionOrder.create({
              data: {
                order_id: resolvedOrderId || `SUB_${txUser.id}_${Date.now()}`,
                user_id: txUser.id,
                email: txUser.email,
                status: finalStatus,
                amount: paymentAmount,
                currency: currency,
                cryptomus_uuid: cryptomusUuid || null,
                paid_at: new Date()
              }
            });
          }

          return {
            success: true,
            activated: true,
            orderId: resolvedOrderId,
            status: finalStatus,
            newExpiry: newExpiry.toISOString(),
            email: updatedTxUser.email,
            userId: updatedTxUser.id
          };
        }, {
          maxWait: 5000,
          timeout: 10000
        });

        // 3. Post-Commit Hooks (Outside Transaction: Non-blocking Supabase sync)
        if (txResult.alreadyProcessed) {
          console.log(`[Prisma Transaction] ℹ️ Order [${txResult.orderId}] was already activated. Transaction safely concluded without changes.`);
          return {
            success: true,
            alreadyProcessed: true,
            orderId: txResult.orderId,
            status: txResult.status,
            message: 'Order was already processed previously'
          };
        }

        console.log(`[Prisma Transaction] ⚡ Transaction COMMITTED successfully for order [${txResult.orderId}]! User: ${txResult.email} extended until ${txResult.newExpiry}`);

        // Async non-blocking secondary Supabase sync
        if (supabaseServer) {
          Promise.allSettled([
            supabaseServer.from('users').update({
              subscription_status: true,
              subscription_expiry: txResult.newExpiry
            }).eq('id', txResult.userId),
            supabaseServer.from('subscription_orders').upsert({
              order_id: txResult.orderId,
              user_id: txResult.userId,
              email: txResult.email,
              status: txResult.status,
              amount: paymentAmount,
              currency: currency,
              cryptomus_uuid: cryptomusUuid || null,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'order_id' })
          ]).catch(syncErr => console.warn('[Supabase Sync Notice]', syncErr.message));
        }

        return txResult;
      } catch (txErr) {
        console.error(`[Prisma Transaction] ❌ Transaction ROLLED BACK for order [${resolvedOrderId}]:`, txErr.message);
        return {
          success: false,
          error: txErr.message,
          message: 'Transaction failed and all changes were safely rolled back'
        };
      }
    }

    // Fallback: If Prisma is unavailable, proceed with standard sequential update
    console.warn(`[Payment Processor] ⚠️ Prisma unavailable, running fallback processing for [${resolvedOrderId}]`);
    let existingOrder = resolvedOrderId ? await findSubscriptionOrder(resolvedOrderId) : null;
    if (existingOrder && (existingOrder.status === 'finished' || existingOrder.status === 'confirmed')) {
      return {
        success: true,
        alreadyProcessed: true,
        orderId: resolvedOrderId,
        status: existingOrder.status,
        message: 'Order was already processed previously'
      };
    }

    let targetUser = (await findUserById(existingOrder?.user_id)) || (await findUserByEmail(existingOrder?.email));
    if (!targetUser) {
      return { success: false, message: 'User not found for order', orderId: resolvedOrderId };
    }

    const currentExpiryTime = targetUser.subscriptionExpiry ? new Date(targetUser.subscriptionExpiry).getTime() : 0;
    const nowTime = Date.now();
    const baseTime = currentExpiryTime > nowTime ? currentExpiryTime : nowTime;
    const newExpiry = new Date(baseTime + (30 * 24 * 3600 * 1000)).toISOString();

    const updatedUser = {
      ...targetUser,
      subscription_status: true,
      subscriptionStatus: true,
      subscription_expiry: newExpiry,
      subscriptionExpiry: newExpiry
    };

    await saveUserToDb(updatedUser);
    await saveSubscriptionOrder({
      order_id: resolvedOrderId,
      user_id: targetUser.id,
      email: targetUser.email,
      status: finalStatus,
      amount: paymentAmount,
      currency: currency,
      paid_at: new Date().toISOString()
    });

    return {
      success: true,
      activated: true,
      orderId: resolvedOrderId,
      status: finalStatus,
      newExpiry,
      email: targetUser.email
    };
  }

  // POST /api/payment/webhook & /api/payment/nowpayments-webhook (IPN Webhook Callback)
  const handlePaymentWebhook = async (req, res) => {
    try {
      const nowpaymentsSig = req.headers['x-nowpayments-sig'];
      const cryptomusSign = req.headers['sign'];
      const body = req.body;

      if (!body) {
        return res.status(400).json({ success: false, message: 'Missing webhook body' });
      }

      console.log(`[Payment Webhook] 📥 Received webhook notification...`);

      // A. Handle NOWPayments IPN
      if (nowpaymentsSig || body.payment_status) {
        if (NOWPAYMENTS_IPN_SECRET_KEY && nowpaymentsSig) {
          const isValid = verifyNowPaymentsSignature(body, nowpaymentsSig, NOWPAYMENTS_IPN_SECRET_KEY);
          if (!isValid) {
            console.warn(`[NOWPayments IPN] ❌ Invalid signature received: ${nowpaymentsSig}`);
            return res.status(400).json({ success: false, message: 'Invalid NOWPayments signature' });
          }
        }

        const { payment_status, order_id, actually_paid, price_amount, pay_currency, payment_id } = body;
        console.log(`[NOWPayments IPN] 📥 Order [${order_id || payment_id}] status: ${payment_status} (Paid: ${actually_paid} ${pay_currency})`);

        if (payment_status === 'finished' || payment_status === 'confirmed' || payment_status === 'sending' || payment_status === 'simulated_finished') {
          const result = await processSuccessfulPayment({
            orderId: order_id,
            paymentId: payment_id,
            paymentStatus: payment_status,
            actuallyPaid: actually_paid,
            priceAmount: price_amount,
            payCurrency: pay_currency,
            source: 'NOWPayments Webhook IPN',
            req
          });
          return res.json(result);
        }

        return res.json({ success: true, message: `NOWPayments IPN received (status: ${payment_status})` });
      }

      // B. Handle Cryptomus IPN
      if (cryptomusSign || body.status) {
        if (CRYPTOMUS_PAYMENT_API_KEY) {
          const payloadToSign = { ...body };
          delete payloadToSign.sign;
          const expectedSign = generateCryptomusSignature(payloadToSign, CRYPTOMUS_PAYMENT_API_KEY);
          if (cryptomusSign !== expectedSign && body.sign !== expectedSign) {
            console.warn(`[Cryptomus Webhook] ❌ Invalid signature received: ${cryptomusSign}`);
            return res.status(400).json({ success: false, message: 'Invalid signature' });
          }
        }

        const { status, order_id, additional_data } = body;
        if (status === 'paid' || status === 'paid_over' || status === 'paid_simulated') {
          let meta = {};
          try {
            meta = typeof additional_data === 'string' ? JSON.parse(additional_data) : (additional_data || {});
          } catch (e) { }

          const result = await processSuccessfulPayment({
            orderId: order_id,
            paymentStatus: status,
            actuallyPaid: body.amount,
            priceAmount: body.amount,
            payCurrency: body.currency,
            source: 'Cryptomus Webhook',
            req
          });
          return res.json(result);
        }

        return res.json({ success: true, message: 'Cryptomus webhook processed' });
      }

      return res.json({ success: true, message: 'Webhook received' });
    } catch (err) {
      console.error('[Payment Webhook Error]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  app.post('/api/payment/webhook', handlePaymentWebhook);
  app.post('/api/payment/nowpayments-webhook', handlePaymentWebhook);

  // GET /api/payment/status/:orderId (Check order status & active NOWPayments fallback sync)
  app.get('/api/payment/status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    let order = await findSubscriptionOrder(orderId);
    if (!order) {
      order = await findSubscriptionOrderByPaymentId(orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    // 1. If order was ALREADY finished or confirmed in DB, return immediately
    if (order.status === 'finished' || order.status === 'confirmed') {
      return res.json({
        success: true,
        order,
        activated: true,
        alreadyProcessed: true
      });
    }

    // 2. If order is still 'pending', proactively query NOWPayments API directly
    const paymentId = order.cryptomus_uuid;
    if (paymentId && NOWPAYMENTS_API_KEY) {
      try {
        const checkRes = await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
          method: 'GET',
          headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const remoteStatus = checkData?.payment_status;
          console.log(`[NOWPayments Active Check] Order [${orderId}] Payment [${paymentId}] Remote Status:`, remoteStatus);

          if (remoteStatus === 'finished' || remoteStatus === 'confirmed' || remoteStatus === 'sending') {
            const activationResult = await processSuccessfulPayment({
              orderId: order.order_id,
              paymentId: paymentId,
              paymentStatus: remoteStatus,
              actuallyPaid: checkData.actually_paid,
              priceAmount: checkData.price_amount,
              payCurrency: checkData.pay_currency,
              source: 'NOWPayments Active Check Fallback',
              req
            });

            const freshOrder = await findSubscriptionOrder(order.order_id);
            return res.json({
              success: true,
              order: freshOrder || order,
              activated: true,
              message: 'Thanh toán thành công! Gói cước đã được kích hoạt.'
            });
          }
        }
      } catch (err) {
        console.warn(`[NOWPayments Active Check Notice]`, err.message);
      }
    }

    return res.json({
      success: true,
      order,
      activated: false
    });
  });

  // POST /api/payment/simulate-confirm (Admin / Dev Test Simulation)
  app.post('/api/payment/simulate-confirm', requireAuthAndDevice, async (req, res) => {
    const user = req.user;
    const { orderId } = req.body || {};
    const isAdmin = isUserAdmin(user);

    if (!isAdmin && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Chỉ Admin mới có quyền mô phỏng thanh toán.' });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp orderId.' });
    }

    const result = await processSuccessfulPayment({
      orderId,
      paymentStatus: 'finished',
      priceAmount: "45.00",
      payCurrency: "USDT",
      source: 'Admin / Dev Simulation',
      req
    });

    if (result.success) {
      return res.json({
        success: true,
        message: result.alreadyProcessed
          ? `Đơn hàng ${orderId} đã được kích hoạt trước đó.`
          : `Đã mô phỏng thanh toán thành công cho đơn hàng ${orderId}! Gói TRADEWH Pro (30 Ngày) đã được kích hoạt +30 ngày qua Transaction.`,
        expiry: result.newExpiry,
        alreadyProcessed: Boolean(result.alreadyProcessed)
      });
    }

    return res.status(400).json(result);
  });

  // POST /api/payment/sync (Public endpoint: Check & activate payment by orderId or paymentId)
  // No auth required so it works even when user is redirected back from NOWPayments
  app.post('/api/payment/sync', async (req, res) => {
    try {
      const { orderId, paymentId, order_id, payment_id } = req.body || {};
      const targetOrderId = orderId || order_id;
      const targetPaymentId = paymentId || payment_id;

      if (!targetOrderId && !targetPaymentId) {
        return res.status(400).json({ success: false, message: 'Cần cung cấp orderId hoặc paymentId' });
      }

      // 1. Look up order in DB
      let order = targetOrderId ? await findSubscriptionOrder(targetOrderId) : null;
      if (!order && targetPaymentId) {
        order = await findSubscriptionOrderByPaymentId(String(targetPaymentId));
      }
      if (!order && targetOrderId) {
        order = await findSubscriptionOrderByPaymentId(String(targetOrderId));
      }

      if (!order) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng. Vui lòng liên hệ hỗ trợ.' });
      }

      // 2. Already done?
      if (order.status === 'finished' || order.status === 'confirmed') {
        return res.json({
          success: true,
          activated: true,
          alreadyProcessed: true,
          order,
          message: 'Gói cước đã được kích hoạt trước đó.'
        });
      }

      // 3. Check NOWPayments directly
      const npPaymentId = order.cryptomus_uuid || targetPaymentId;
      if (!npPaymentId || !NOWPAYMENTS_API_KEY) {
        return res.json({ success: true, activated: false, order, message: 'Giao dịch đang chờ xác nhận từ blockchain. Vui lòng thử lại sau ít phút.' });
      }

      console.log(`[Payment Sync] 🔍 Querying NOWPayments for payment [${npPaymentId}]...`);
      const npRes = await fetch(`https://api.nowpayments.io/v1/payment/${npPaymentId}`, {
        method: 'GET',
        headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
      });

      if (!npRes.ok) {
        const errBody = await npRes.text().catch(() => '');
        console.warn(`[Payment Sync] NOWPayments API returned ${npRes.status}: ${errBody}`);
        return res.json({ success: true, activated: false, order, message: `Đang chờ xác nhận blockchain (Status: ${order.status})` });
      }

      const npData = await npRes.json();
      const remoteStatus = npData?.payment_status;
      console.log(`[Payment Sync] 📊 NOWPayments status for [${npPaymentId}]: ${remoteStatus}`);

      if (remoteStatus === 'finished' || remoteStatus === 'confirmed' || remoteStatus === 'sending') {
        const result = await processSuccessfulPayment({
          orderId: order.order_id,
          paymentId: npPaymentId,
          paymentStatus: remoteStatus,
          actuallyPaid: npData.actually_paid,
          priceAmount: npData.price_amount,
          payCurrency: npData.pay_currency,
          source: 'Manual Payment Sync API',
          req
        });

        const freshOrder = await findSubscriptionOrder(order.order_id);
        return res.json({
          success: true,
          activated: result.activated || result.alreadyProcessed,
          alreadyProcessed: result.alreadyProcessed,
          order: freshOrder || order,
          subscriptionExpiry: result.newExpiry,
          message: result.alreadyProcessed
            ? 'Gói cước đã được kích hoạt trước đó.'
            : '🎉 Gói TRADEWH Pro (30 Ngày) đã được kích hoạt thành công (+30 ngày)!'
        });
      }

      // Partial states
      const statusMessages = {
        'waiting': 'Đang chờ nhận tiền từ ví của bạn...',
        'confirming': 'Đang xác nhận trên blockchain (còn vài phút)...',
        'partially_paid': '⚠️ Chỉ nhận được một phần tiền. Vui lòng liên hệ hỗ trợ.',
        'failed': '❌ Giao dịch thất bại. Vui lòng tạo thanh toán mới.',
        'refunded': '↩️ Giao dịch đã bị hoàn tiền.',
        'expired': '⏰ Giao dịch đã hết hạn. Vui lòng tạo thanh toán mới.',
      };

      return res.json({
        success: true,
        activated: false,
        order,
        remoteStatus,
        message: statusMessages[remoteStatus] || `Trạng thái giao dịch: ${remoteStatus}. Vui lòng đợi hoặc liên hệ hỗ trợ.`
      });

    } catch (err) {
      console.error('[Payment Sync Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi kiểm tra trạng thái: ' + err.message });
    }
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

    await recordUserLoginToSupabase(updatedUser, req);

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

  // POST /api/admin/create-trial-user (Generate Random Trial User Account)
  app.post('/api/admin/create-trial-user', requireAuthAndDevice, async (req, res) => {
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

    const { days = 3, prefix = 'trial', note = '' } = req.body || {};
    const trialDays = Math.max(1, Math.min(365, parseInt(days, 10) || 3));

    // Generate unique random email
    let generatedEmail = '';
    let isUnique = false;
    let attempts = 0;
    const cleanPrefix = (prefix || 'trial').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'trial';

    while (!isUnique && attempts < 10) {
      attempts++;
      const randomHex = crypto.randomBytes(3).toString('hex'); // 6 random characters
      generatedEmail = `${cleanPrefix}_${randomHex}@tradewh.work`;
      const existing = await findUserByEmail(generatedEmail);
      if (!existing) {
        isUnique = true;
      }
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: 'Không thể tạo email ngẫu nhiên duy nhất, vui lòng thử lại.'
      });
    }

    // Generate readable random password (e.g. Trade@749201)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const plainPassword = `Trade@${randomDigits}`;
    const passwordHash = hashPassword(plainPassword);

    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const trialDurationMs = trialDays * 24 * 3600 * 1000;
    const expiryDate = new Date(Date.now() + trialDurationMs);

    const newUser = {
      id: userId,
      sub: userId,
      email: generatedEmail,
      name: note ? `${note} (${trialDays}d)` : `Dùng thử (${trialDays} ngày)`,
      password_hash: passwordHash,
      subscriptionStatus: true,
      subscriptionExpiry: expiryDate.toISOString(),
      role: 'user'
    };

    await saveUserToDb(newUser);

    console.log(`[Admin Trial] 🎲 Admin ${requester.email} generated trial account: ${generatedEmail} (${trialDays} days, exp: ${expiryDate.toISOString()})`);

    return res.json({
      success: true,
      message: `Tạo tài khoản dùng thử ${trialDays} ngày thành công!`,
      account: {
        id: userId,
        email: generatedEmail,
        password: plainPassword,
        days: trialDays,
        subscriptionExpiry: expiryDate.toISOString(),
        expiryDateFormatted: expiryDate.toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        createdAt: new Date().toISOString()
      }
    });
  });

  // =========================================================================
  // NEXT-SHADCN ADMIN DASHBOARD REST APIs
  // =========================================================================

  // Middleware: CHỈ QUẢN TRỊ VIÊN mới được truy cập các API Quản Trị
  function checkIsAdmin(req, res, next) {
    const requester = req.user;
    const adminKey = req.headers['x-admin-key'];
    const isAdmin = isUserAdmin(requester) || adminKey === ADMIN_SECRET_KEY;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_NOT_ADMIN',
        message: 'Bạn không có quyền truy cập chức năng Quản Trị Viên này.'
      });
    }
    next();
  }

  // GET /api/admin/dashboard-stats
  app.get('/api/admin/dashboard-stats', requireAuthAndDevice, checkIsAdmin, async (req, res) => {
    try {
      let totalUsers = 0;
      let activeUsers = 0;
      let trialUsers = 0;
      let recentUsers = [];
      let recentOrders = [];
      let totalOrders = 0;
      let finishedOrders = 0;
      let calculatedRevenue = 0;

      if (prisma) {
        try {
          totalUsers = await prisma.user.count();
          activeUsers = await prisma.user.count({
            where: {
              role: { not: 'disabled' },
              OR: [
                { subscription_status: true },
                { subscription_expiry: { gt: new Date() } }
              ]
            }
          });
          const disabledUsers = await prisma.user.count({
            where: { role: 'disabled' }
          });
          trialUsers = await prisma.user.count({
            where: {
              OR: [
                { email: { startsWith: 'trial_' } },
                { name: { contains: 'Dùng thử', mode: 'insensitive' } }
              ]
            }
          });
          recentUsers = await prisma.user.findMany({
            orderBy: { created_at: 'desc' },
            take: 8,
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              subscription_status: true,
              subscription_expiry: true,
              created_at: true,
              last_sign_in_at: true,
              current_device_id: true
            }
          });

          // Lấy tất cả đơn hàng để tính toán chính xác chỉ những đơn có status 'finished'
          const allOrdersForStats = await prisma.subscriptionOrder.findMany({
            select: { id: true, amount: true, status: true }
          });
          totalOrders = allOrdersForStats.length;
          const finishedOrdersList = allOrdersForStats.filter(
            o => (o.status || '').toLowerCase().trim() === 'finished'
          );
          finishedOrders = finishedOrdersList.length;
          calculatedRevenue = 0;
          for (const ord of finishedOrdersList) {
            const parsed = parseFloat(ord.amount);
            calculatedRevenue += (!isNaN(parsed) && parsed > 0) ? parsed : 45;
          }

          recentOrders = await prisma.subscriptionOrder.findMany({
            orderBy: { created_at: 'desc' },
            take: 8
          });
        } catch (dbErr) {
          console.warn('[Admin Stats DB Warn]', dbErr.message);
        }
      }

      // Token status summary
      const auth = getActiveAuthToken(req);
      const refresh = getActiveRefreshToken();
      const nowSec = Math.floor(Date.now() / 1000);
      const authJwt = decodeJwt(auth);
      const refreshJwt = decodeJwt(refresh);
      const authExp = authJwt && authJwt.exp ? authJwt.exp : 0;
      const refreshExp = refreshJwt && refreshJwt.exp ? refreshJwt.exp : 0;

      let dbTokenUpdated = null;
      try {
        if (prisma && prisma.systemSetting) {
          const setting = await prisma.systemSetting.findUnique({ where: { key: 'crazii_tokens_updated_at' } });
          dbTokenUpdated = setting ? setting.value : null;
        }
      } catch (e) { }

      return res.json({
        success: true,
        stats: {
          totalUsers,
          activeUsers,
          disabledUsers: typeof disabledUsers !== 'undefined' ? disabledUsers : 0,
          trialUsers,
          totalOrders,
          finishedOrders,
          totalRevenue: Math.round(calculatedRevenue * 100) / 100,
          recentUsers: recentUsers.map(u => ({
            ...u,
            isDisabled: u.role === 'disabled',
            isAdmin: u.role !== 'disabled' && isUserAdmin({ email: u.email, role: u.role }),
            isActive: u.role !== 'disabled' && Boolean(isUserAdmin({ email: u.email, role: u.role }) || u.subscription_status || (u.subscription_expiry && new Date(u.subscription_expiry).getTime() > Date.now()))
          })),
          recentOrders,
          tokens: {
            accessValid: authExp > 0 && nowSec < authExp,
            accessSecondsLeft: Math.max(0, authExp - nowSec),
            refreshValid: refreshExp > 0 && nowSec < refreshExp,
            refreshSecondsLeft: Math.max(0, refreshExp - nowSec),
            dbPersistence: Boolean(dbTokenUpdated),
            lastUpdated: dbTokenUpdated,
            upstreamWsConnected: isUpstreamConnected
          }
        }
      });
    } catch (err) {
      console.error('[Admin Stats Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi nạp thống kê: ' + err.message });
    }
  });

  // GET /api/admin/users (Paginated + Filtered)
  app.get('/api/admin/users', requireAuthAndDevice, checkIsAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
      const search = (req.query.search || '').trim().toLowerCase();
      const roleFilter = (req.query.role || 'all').trim().toLowerCase();
      const statusFilter = (req.query.status || 'all').trim().toLowerCase();
      const accountStatus = (req.query.accountStatus || 'all').trim().toLowerCase();

      const whereClause = {};

      if (search) {
        whereClause.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (accountStatus === 'disabled') {
        whereClause.role = 'disabled';
      } else if (accountStatus === 'active') {
        whereClause.role = { not: 'disabled' };
      } else if (roleFilter === 'admin') {
        whereClause.role = 'admin';
      } else if (roleFilter === 'user') {
        whereClause.role = 'user';
      } else if (roleFilter === 'disabled') {
        whereClause.role = 'disabled';
      }

      if (statusFilter === 'active') {
        whereClause.OR = [
          { subscription_status: true },
          { subscription_expiry: { gt: new Date() } }
        ];
      } else if (statusFilter === 'expired') {
        whereClause.AND = [
          { subscription_expiry: { not: null } },
          { subscription_expiry: { lte: new Date() } },
          { subscription_status: false }
        ];
      } else if (statusFilter === 'none') {
        whereClause.subscription_status = false;
        whereClause.subscription_expiry = null;
      }

      let total = 0;
      let users = [];

      if (prisma) {
        total = await prisma.user.count({ where: whereClause });
        users = await prisma.user.findMany({
          where: whereClause,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            current_device_id: true,
            subscription_status: true,
            subscription_expiry: true,
            created_at: true,
            last_sign_in_at: true
          }
        });
      }

      return res.json({
        success: true,
        users: users.map(u => {
          const isDisabled = u.role === 'disabled';
          const isAdmin = !isDisabled && isUserAdmin({ email: u.email, role: u.role });
          const isSubActive = !isDisabled && Boolean(isAdmin || u.subscription_status || (u.subscription_expiry && new Date(u.subscription_expiry).getTime() > Date.now()));
          return {
            ...u,
            isDisabled,
            isAdmin,
            isActive: isSubActive,
            daysLeft: u.subscription_expiry ? Math.max(0, Math.ceil((new Date(u.subscription_expiry).getTime() - Date.now()) / (24 * 3600 * 1000))) : 0
          };
        }),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      });
    } catch (err) {
      console.error('[Admin Users Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách người dùng: ' + err.message });
    }
  });

  // POST /api/admin/users/action (Execute user action)
  app.post('/api/admin/users/action', requireAuthAndDevice, checkIsAdmin, async (req, res) => {
    try {
      const { userId, action, days, newRole } = req.body || {};
      if (!userId || !action) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin userId hoặc action' });
      }

      const targetUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      if (action === 'grant_subscription') {
        const numDays = Math.max(1, parseInt(days, 10) || 30);
        const currentExp = targetUser.subscription_expiry ? new Date(targetUser.subscription_expiry).getTime() : 0;
        const baseTime = currentExp > Date.now() ? currentExp : Date.now();
        const newExpiry = new Date(baseTime + numDays * 24 * 3600 * 1000);

        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            subscription_status: true,
            subscription_expiry: newExpiry
          }
        });

        console.log(`[Admin Action] 🎁 Admin granted ${numDays} days to ${targetUser.email}`);
        return res.json({
          success: true,
          message: `Đã cấp thành công ${numDays} ngày cho ${targetUser.email}!`,
          user: updated
        });
      }

      if (action === 'revoke_subscription') {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            subscription_status: false,
            subscription_expiry: null
          }
        });

        console.log(`[Admin Action] ⚠️ Admin revoked subscription for ${targetUser.email}`);
        return res.json({
          success: true,
          message: `Đã hủy gói cước của ${targetUser.email}.`,
          user: updated
        });
      }

      if (action === 'kick_device') {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            current_device_id: null
          }
        });

        console.log(`[Admin Action] 🔓 Admin kicked device for ${targetUser.email}`);
        return res.json({
          success: true,
          message: `Đã giải phóng thiết bị đăng nhập cho ${targetUser.email}! Người dùng có thể đăng nhập trên thiết bị mới.`,
          user: updated
        });
      }

      if (action === 'toggle_role') {
        const updatedRole = newRole || (targetUser.role === 'admin' ? 'user' : 'admin');
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { role: updatedRole }
        });

        console.log(`[Admin Action] 👑 Admin changed role of ${targetUser.email} to ${updatedRole}`);
        return res.json({
          success: true,
          message: `Đã cập nhật vai trò của ${targetUser.email} thành ${updatedRole.toUpperCase()}.`,
          user: updated
        });
      }

      if (action === 'delete_user') {
        return res.status(400).json({
          success: false,
          message: 'Hệ thống không hỗ trợ xóa người dùng, chỉ có tính năng Vô hiệu hóa tài khoản (Disable) để chặn người dùng đăng nhập.'
        });
      }

      if (action === 'toggle_disable' || action === 'disable_user' || action === 'enable_user') {
        if (targetUser.id === req.user.id || targetUser.email === req.user.email) {
          return res.status(400).json({ success: false, message: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình!' });
        }

        const willDisable = action === 'disable_user' ? true : (action === 'enable_user' ? false : (targetUser.role !== 'disabled'));
        const newRole = willDisable ? 'disabled' : (isUserAdmin({ email: targetUser.email }) ? 'admin' : 'user');

        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            role: newRole,
            ...(willDisable ? { current_device_id: null } : {})
          }
        });

        if (willDisable) {
          // Immediately disconnect any active sockets for this user
          kickoutUserSockets(userId, 'disabled');
        }

        console.log(`[Admin Action] 🔒 Admin ${willDisable ? 'VÔ HIỆU HÓA' : 'MỞ KHÓA'} user ${targetUser.email}`);
        return res.json({
          success: true,
          message: willDisable
            ? `Đã vô hiệu hóa tài khoản ${targetUser.email}. Người dùng này sẽ không thể đăng nhập.`
            : `Đã mở khóa tài khoản ${targetUser.email}. Người dùng có thể đăng nhập bình thường.`,
          user: updated,
          isDisabled: willDisable
        });
      }

      return res.status(400).json({ success: false, message: `Hành động không hợp lệ: ${action}` });
    } catch (err) {
      console.error('[Admin User Action Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi thực hiện thao tác: ' + err.message });
    }
  });

  // GET /api/admin/orders (Paginated + Filtered Orders)
  app.get('/api/admin/orders', requireAuthAndDevice, checkIsAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
      const search = (req.query.search || '').trim().toLowerCase();
      const statusFilter = (req.query.status || 'all').trim().toLowerCase();

      const whereClause = {};

      if (search) {
        whereClause.OR = [
          { order_id: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (statusFilter !== 'all') {
        whereClause.status = statusFilter;
      }

      let total = 0;
      let orders = [];

      if (prisma) {
        total = await prisma.subscriptionOrder.count({ where: whereClause });
        orders = await prisma.subscriptionOrder.findMany({
          where: whereClause,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        });
      }

      return res.json({
        success: true,
        orders,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      });
    } catch (err) {
      console.error('[Admin Orders Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách đơn hàng: ' + err.message });
    }
  });

  // GET /api/admin/tokens/status
  app.get('/api/admin/tokens/status', requireAuthAndDevice, checkIsAdmin, async (req, res) => {
    try {
      const auth = getActiveAuthToken(req);
      const refresh = getActiveRefreshToken();
      const nowSec = Math.floor(Date.now() / 1000);

      const authJwt = decodeJwt(auth);
      const refreshJwt = decodeJwt(refresh);

      const authExp = authJwt && authJwt.exp ? authJwt.exp : 0;
      const refreshExp = refreshJwt && refreshJwt.exp ? refreshJwt.exp : 0;

      let dbTokenUpdated = null;
      let dbRefreshTokenSnippet = null;

      if (prisma && prisma.systemSetting) {
        try {
          const settingTime = await prisma.systemSetting.findUnique({ where: { key: 'crazii_tokens_updated_at' } });
          dbTokenUpdated = settingTime ? settingTime.value : null;

          const settingRef = await prisma.systemSetting.findUnique({ where: { key: 'crazii_refresh_token' } });
          if (settingRef && settingRef.value) {
            dbRefreshTokenSnippet = settingRef.value.slice(0, 12) + '...' + settingRef.value.slice(-8);
          }
        } catch (e) { }
      }

      return res.json({
        success: true,
        accessToken: {
          hasToken: Boolean(auth && !auth.includes('PLACEHOLDER')),
          snippet: auth ? auth.slice(0, 12) + '...' + auth.slice(-8) : null,
          expiresAt: authExp > 0 ? new Date(authExp * 1000).toISOString() : null,
          timeLeftSeconds: Math.max(0, authExp - nowSec),
          isExpired: authExp > 0 ? nowSec >= authExp : true
        },
        refreshToken: {
          hasToken: Boolean(refresh && !refresh.includes('PLACEHOLDER')),
          snippet: refresh ? refresh.slice(0, 12) + '...' + refresh.slice(-8) : null,
          expiresAt: refreshExp > 0 ? new Date(refreshExp * 1000).toISOString() : null,
          timeLeftSeconds: Math.max(0, refreshExp - nowSec),
          isExpired: refreshExp > 0 ? nowSec >= refreshExp : true
        },
        database: {
          connected: true,
          table: 'system_settings (PostgreSQL)',
          lastUpdated: dbTokenUpdated,
          storedSnippet: dbRefreshTokenSnippet,
          autoRefreshIntervalHours: 12
        },
        upstreamWebSocket: {
          host: 'https://tick-ws.crazii.com',
          connected: isUpstreamConnected,
          activeChannels: Array.from(activeChannels)
        }
      });
    } catch (err) {
      console.error('[Admin Tokens Status Error]', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải trạng thái token: ' + err.message });
    }
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

  // Middleware for Telegram Bot API: Allows localhost / local dev without login, or requires auth on production
  function requireBotAccess(req, res, next) {
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.ip === '127.0.0.1' || req.ip === '::1' || (req.ip && req.ip.includes('127.0.0.1'));
    if (isLocal) {
      return next();
    }
    return requireAuth(req, res, next);
  }

  // GET /api/bot/config (Protected)
  app.get('/api/bot/config', requireBotAccess, (req, res) => {
    return res.json({
      success: true,
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/config (Protected)
  app.post('/api/bot/config', requireBotAccess, (req, res) => {
    const success = telegramSignalBot.saveConfig(req.body);
    syncBotChannels();
    return res.json({
      success: success,
      message: success ? 'Cấu hình Bot Telegram đã được lưu thành công!' : 'Lỗi khi lưu cấu hình',
      payload: telegramSignalBot.getStatusPayload()
    });
  });

  // POST /api/bot/test (Protected)
  app.post('/api/bot/test', requireBotAccess, async (req, res) => {
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
  app.get('/api/bot/trades', requireBotAccess, (req, res) => {
    return res.json({
      success: true,
      activeTrades: Array.from(telegramSignalBot.activeTrades.values()),
      tradeHistory: telegramSignalBot.tradeHistory,
      stats: telegramSignalBot.getStatusPayload().stats
    });
  });

  // POST /api/bot/trades/test-signal (Protected Interactive simulator trigger)
  app.post('/api/bot/trades/test-signal', requireBotAccess, async (req, res) => {
    const result = await telegramSignalBot.triggerTestSignal(req.body);
    return res.json(result);
  });

  // POST /api/bot/trades/:id/simulate-status (Protected Interactive simulator state update)
  app.post('/api/bot/trades/:id/simulate-status', requireBotAccess, async (req, res) => {
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
  app.post('/api/bot/trades/:id/close', requireBotAccess, async (req, res) => {
    const tradeId = req.params.id;
    const status = req.body.status !== undefined ? Number(req.body.status) : TRADE_STATUS.CUT_EARLY_PROFIT;
    const result = await telegramSignalBot.manualCloseTrade(tradeId, status);
    return res.json(result);
  });

  // POST /api/bot/trades/clear-history (Protected)
  app.post('/api/bot/trades/clear-history', requireBotAccess, (req, res) => {
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
        const refreshResult = await executeRefreshToken(null, true);
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
        const isUpstreamAuth = response.status === 401;
        return res.status(isUpstreamAuth ? 502 : response.status).json({
          success: false,
          code: isUpstreamAuth ? 'UPSTREAM_TOKEN_EXPIRED' : 'UPSTREAM_API_ERROR',
          status: response.status,
          statusText: response.statusText,
          message: isUpstreamAuth
            ? 'Unauthorized: Token Crazii Upstream đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật crazii_refresh_token trong Database.'
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
      if (!activeChannels.has('price')) {
        targetSocket.emit('subscribe', 'price');
      }
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
        if (!activeChannels.has('price')) {
          targetSocket.emit('subscribe', 'price');
        }
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

    let lastKickedReason = null;

    targetSocket.on('kicked', (msg) => {
      lastKickedReason = msg || 'Another login detected';
      console.warn(`[WS Relay] ⚠️ Bị máy chủ Crazii ngắt kết nối (Kicked): "${lastKickedReason}". (Tài khoản đang mở đồng thời trên crazii.com hoặc trên Render)`);
    });

    targetSocket.on('connect_error', (err) => {
      isUpstreamConnected = false;
      console.error(`[WS Relay] Connection error:`, err.message);
      io.emit('upstream_status', { connected: false, error: err.message });

      const isAuthErr = err.message && (
        err.message.includes('401') ||
        err.message.includes('403') ||
        err.message.toLowerCase().includes('unauthorized') ||
        err.message.toLowerCase().includes('forbidden')
      );

      if (isAuthErr && activeChannels.size > 0) {
        clearTimeout(upstreamReconnectTimer);
        upstreamReconnectTimer = setTimeout(async () => {
          if (activeChannels.size > 0) {
            console.log(`[WS Relay] 🔑 Auth error detected. Refreshing token and reconnecting...`);
            await executeRefreshToken(null, true);
            connectUpstreamWebSocket();
          }
        }, 3000);
      }
    });

    targetSocket.on('disconnect', (reason) => {
      isUpstreamConnected = false;
      console.warn(`[WS Relay] Disconnected from upstream:`, reason);
      io.emit('upstream_status', { connected: false, reason: reason, kicked: lastKickedReason });

      // Reconnect upstream quickly
      if (activeChannels.size > 0) {
        clearTimeout(upstreamReconnectTimer);
        lastKickedReason = null;

        upstreamReconnectTimer = setTimeout(async () => {
          if (activeChannels.size > 0) {
            const auth = getActiveAuthToken();
            const jwt = decodeJwt(auth);
            const nowSec = Math.floor(Date.now() / 1000);
            const isExpiring = !jwt || !jwt.exp || (jwt.exp - nowSec <= 60);

            if (isExpiring) {
              console.log(`[WS Relay] ⏳ Token expiring (${jwt?.exp ? jwt.exp - nowSec : 0}s left). Refreshing before reconnect...`);
              await executeRefreshToken(null, true);
            } else {
              console.log(`[WS Relay] 🔄 Reconnecting upstream WebSocket (Token valid for ${jwt.exp - nowSec}s, Reason: ${reason})...`);
            }
            connectUpstreamWebSocket();
          }
        }, 1000);
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
    channelSubscribers.clear();
  }

  // Tracking channels monitored permanently by Telegram bot
  const botMonitoredChannels = new Set();
  // Reference counter for channel subscriptions: channel -> Set of socketId
  const channelSubscribers = new Map();

  function addClientSubscription(channel, socketId) {
    if (!channelSubscribers.has(channel)) {
      channelSubscribers.set(channel, new Set());
    }
    const subs = channelSubscribers.get(channel);
    const wasEmpty = subs.size === 0;
    subs.add(socketId);
    activeChannels.add(channel);
    return wasEmpty;
  }

  function removeClientSubscription(channel, socketId) {
    if (!channelSubscribers.has(channel)) return false;
    const subs = channelSubscribers.get(channel);
    subs.delete(socketId);
    if (subs.size === 0) {
      channelSubscribers.delete(channel);
      if (!botMonitoredChannels.has(channel)) {
        activeChannels.delete(channel);
        return true;
      }
    }
    return false;
  }

  function cleanupClientAllSubscriptions(socketId) {
    for (const [channel, subs] of channelSubscribers.entries()) {
      if (subs.has(socketId)) {
        subs.delete(socketId);
        if (subs.size === 0) {
          channelSubscribers.delete(channel);
          if (!botMonitoredChannels.has(channel)) {
            activeChannels.delete(channel);
            if (targetSocket && targetSocket.connected) {
              targetSocket.emit('unsubscribe', channel);
            }
          }
        }
      }
    }
  }

  // Helper to sync bot monitored symbols into activeChannels
  function syncBotChannels() {
    if (telegramSignalBot.config.enabled && Array.isArray(telegramSignalBot.config.monitoredSymbols)) {
      telegramSignalBot.config.monitoredSymbols.forEach(sym => {
        if (sym && typeof sym === 'string') {
          const clean = sym.trim();
          botMonitoredChannels.add(clean);
          activeChannels.add(clean);
          const base = clean.split('_')[0];
          if (base) {
            botMonitoredChannels.add(base);
            activeChannels.add(base);
          }
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
        if (!jwt || !jwt.exp || (jwt.exp - nowSec <= 60)) {
          await executeRefreshToken(null, true);
        }
        connectUpstreamWebSocket();
      }
    }
  }, 30000);

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
        if (dbUser.role === 'disabled' || dbUser.isDisabled) {
          console.warn(`[Socket Auth] ❌ Rejected socket connection for disabled account: ${sessionPayload.email}`);
          return next(new Error('ACCOUNT_DISABLED: Tài khoản của bạn đã bị vô hiệu hóa.'));
        }
        if (!ALLOW_CONCURRENT_SESSIONS && dbUser.currentDeviceId && sessionPayload.deviceId && dbUser.currentDeviceId !== sessionPayload.deviceId) {
          console.warn(`[Socket Auth] ❌ Rejected socket connection due to device mismatch: ${sessionPayload.email}`);
          return next(new Error('DEVICE_SESSION_TERMINATED: Logged in from another device.'));
        }
        socket.user = dbUser;
        socket.userEmail = (dbUser.email || sessionPayload.email).toLowerCase().trim();
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

    const dbAnyUser = (await findUserByEmail(anyUser.email)) || (await findUserById(anyUser.sub));
    if (dbAnyUser && (dbAnyUser.role === 'disabled' || dbAnyUser.isDisabled)) {
      console.warn(`[Socket Auth] ❌ Rejected socket connection for disabled account: ${anyUser.email}`);
      return next(new Error('ACCOUNT_DISABLED: Tài khoản của bạn đã bị vô hiệu hóa.'));
    }

    socket.user = anyUser;
    socket.userEmail = (anyUser.email || '').toLowerCase().trim();
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

    // Automatically register client for live price ticks and ensure upstream relay is active
    addClientSubscription('price', clientSocket.id);
    if (!targetSocket || !targetSocket.connected) {
      connectUpstreamWebSocket();
    } else {
      targetSocket.emit('subscribe', 'price');
    }

    clientSocket.on('subscribe', (channel) => {
      if (channel && typeof channel === 'string') {
        const cleanChan = channel.trim();
        const isFirstSub = addClientSubscription(cleanChan, clientSocket.id);
        if (!targetSocket || !targetSocket.connected) {
          connectUpstreamWebSocket();
        } else if (isFirstSub || cleanChan.toLowerCase() === 'price') {
          targetSocket.emit('subscribe', cleanChan);
          console.log(`[WS Relay] ➕ Subscribed upstream: ${cleanChan} (Active: [${Array.from(activeChannels).join(', ')}])`);
        }
      }
    });

    clientSocket.on('unsubscribe', (channel) => {
      if (channel && typeof channel === 'string') {
        const cleanChan = channel.trim();
        const shouldUnsubUpstream = removeClientSubscription(cleanChan, clientSocket.id);
        if (shouldUnsubUpstream && targetSocket && targetSocket.connected) {
          targetSocket.emit('unsubscribe', cleanChan);
          console.log(`[WS Relay] ⏹️ Unsubscribed upstream: ${cleanChan} (Active: [${Array.from(activeChannels).join(', ')}])`);
        }
        if (activeChannels.size === 0 && botMonitoredChannels.size === 0) {
          disconnectUpstreamWebSocket();
        }
      }
    });

    clientSocket.on('disconnect', () => {
      cleanupClientAllSubscriptions(clientSocket.id);
      if (uId && activeUserSockets.has(uId)) {
        activeUserSockets.get(uId).delete(clientSocket);
        if (activeUserSockets.get(uId).size === 0) {
          activeUserSockets.delete(uId);
        }
      }

      setTimeout(() => {
        if (io.sockets.sockets.size === 0 && botMonitoredChannels.size === 0) {
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

  // Startup Token Verification: Load and verify tokens from PostgreSQL DB before listening
  try {
    await loadTokensFromDb();
    const auth = getActiveAuthToken();
    const jwt = decodeJwt(auth);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!jwt || !jwt.exp || jwt.exp <= nowSec + 60) {
      console.log(`[Startup] Access token is missing or expiring soon. Verifying Refresh Token...`);
      await executeRefreshToken();
    }
  } catch (startupTokenErr) {
    console.warn(`[Startup Token Notice]:`, startupTokenErr.message);
  }

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
