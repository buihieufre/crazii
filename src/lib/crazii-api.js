import dns from 'dns';
if (dns && typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export function decodeJwt(token) {
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

export async function getValidRefreshToken() {
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. ALWAYS query Database first (Supabase REST) as primary source of truth
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';
    const res = await fetch(`${supabaseUrl}/rest/v1/system_settings?key=eq.crazii_refresh_token&select=value`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows[0] && rows[0].value) {
        const dbToken = rows[0].value.replace(/^Bearer\s+/i, '').trim();
        const dbJwt = decodeJwt(dbToken);
        const isExpired = Boolean(dbJwt && dbJwt.exp && dbJwt.exp <= nowSec);
        if (!isExpired && !dbToken.includes('PLACEHOLDER')) {
          process.env.CRAZII_REFRESH_TOKEN = dbToken;
          return dbToken;
        }
      }
    }
  } catch (e) { }

  // 2. Fallback to Environment Variables only if valid and not expired
  const envToken = (process.env.CRAZII_REFRESH_TOKEN || process.env.REFRESH_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
  const envJwt = decodeJwt(envToken);
  if (envJwt && envJwt.exp && envJwt.exp > nowSec && !envToken.includes('PLACEHOLDER')) {
    return envToken;
  }

  return envToken;
}

export function getRefreshToken() {
  return (process.env.CRAZII_REFRESH_TOKEN || process.env.REFRESH_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
}

export function getDeviceId() {
  return (process.env.CRAZII_DEVICE_ID || process.env.DEVICE_ID || 'fb70bf82-5d83-4c70-b7e6-9896bda770e7').trim();
}

export function getAuthToken() {
  const token = (process.env.CRAZII_ACCESS_TOKEN || process.env.CRAZII_AUTH_TOKEN || process.env.AUTH_TOKEN || '').trim();
  return token;
}

let inFlightRefreshPromise = null;

export async function executeRefreshToken(force = false) {
  const currentAuth = getAuthToken();
  const jwt = decodeJwt(currentAuth);
  const nowSec = Math.floor(Date.now() / 1000);

  // If token is still valid with > 3 mins left and not forcing, reuse it without making external request
  if (!force && jwt && jwt.exp && (jwt.exp - nowSec > 180)) {
    return {
      success: true,
      token: currentAuth,
      accessToken: currentAuth,
      accessPayload: jwt,
      refreshPayload: decodeJwt(getRefreshToken())
    };
  }

  // Single-flight deduplication
  if (inFlightRefreshPromise) {
    return await inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    const refreshToken = await getValidRefreshToken();
    const deviceId = getDeviceId();

    if (!refreshToken || refreshToken.includes('PLACEHOLDER')) {
      return { success: false, message: 'No valid Refresh Token found in Database or Environment Variables.' };
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

    let refreshResponse = null;
    let refreshError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        refreshResponse = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ token: refreshToken }),
          signal: AbortSignal.timeout(10000)
        });
        refreshError = null;
        break;
      } catch (netErr) {
        refreshError = netErr;
        console.warn(`[API Token Refresh Attempt ${attempt}/3 Failed]:`, netErr.message, netErr.cause ? `(Cause: ${netErr.cause.code || netErr.cause.message || netErr.cause})` : '');
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 600 * attempt));
        }
      }
    }

    if (!refreshResponse && refreshError) {
      return { 
        success: false, 
        error: refreshError.message,
        cause: refreshError.cause ? (refreshError.cause.code || refreshError.cause.message || String(refreshError.cause)) : undefined
      };
    }

    try {
      const response = refreshResponse;

      if (!response.ok) {
        const errText = await response.text();
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
        return { success: false, message: 'No accessToken in response', data };
      }

      // In memory update for the current serverless instance
      process.env.CRAZII_ACCESS_TOKEN = newAccessToken;
      if (newRefreshToken) process.env.CRAZII_REFRESH_TOKEN = newRefreshToken;

      // Persist to Supabase PostgreSQL DB asynchronously
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';
        if (newRefreshToken) {
          fetch(`${supabaseUrl}/rest/v1/system_settings`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ key: 'crazii_refresh_token', value: newRefreshToken, updated_at: new Date().toISOString() })
          }).catch(() => { });
        }
        fetch(`${supabaseUrl}/rest/v1/system_settings`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ key: 'crazii_access_token', value: newAccessToken, updated_at: new Date().toISOString() })
        }).catch(() => { });
      } catch (e) { }

      const decodedAccess = decodeJwt(newAccessToken);
      const decodedRefresh = decodeJwt(newRefreshToken || refreshToken);

      return {
        success: true,
        token: newAccessToken,
        accessToken: newAccessToken,
        accessPayload: decodedAccess,
        refreshPayload: decodedRefresh
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        cause: error.cause ? (error.cause.code || error.cause.message || String(error.cause)) : undefined
      };
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return await inFlightRefreshPromise;
}
