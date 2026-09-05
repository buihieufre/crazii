export function decodeJwt(token) {
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
    const refreshToken = getRefreshToken();
    const deviceId = getDeviceId();

    if (!refreshToken || refreshToken.includes('PLACEHOLDER')) {
      return { success: false, message: 'No valid Refresh Token configured in Environment Variables.' };
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

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ token: refreshToken })
      });

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
      return { success: false, error: error.message };
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return await inFlightRefreshPromise;
}
