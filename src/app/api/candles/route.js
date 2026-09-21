import { NextResponse } from 'next/server';
import { getAuthToken, getDeviceId, decodeJwt, executeRefreshToken } from '@/lib/crazii-api';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') || 'XAUUSD.ca_5';
  const targetUrl = `https://sale-api.crazii.com/api/v1/chart/candle?code=${encodeURIComponent(code)}`;

  let authToken = getAuthToken();
  const deviceId = getDeviceId();

  const jwt = decodeJwt(authToken);
  const nowSec = Math.floor(Date.now() / 1000);

  // Auto-refresh if token is expired or missing
  if (!authToken || !jwt || !jwt.exp || jwt.exp <= nowSec) {
    const refRes = await executeRefreshToken();
    if (refRes.success) {
      authToken = refRes.accessToken || refRes.token;
    }
  }

  const headers = {
    'Accept': 'application/json',
    'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
    'Device-Id': deviceId,
    'Origin': 'https://crazii.com',
    'Referer': 'https://crazii.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  let response = null;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await fetch(targetUrl, { 
        method: 'GET', 
        headers: headers, 
        cache: 'no-store',
        signal: AbortSignal.timeout(12000)
      });

      // 401 Recovery: Refresh token and retry once
      if (response.status === 401) {
        const refreshResult = await executeRefreshToken(true);
        if (refreshResult.success) {
          authToken = refreshResult.accessToken || refreshResult.token;
          headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
          response = await fetch(targetUrl, { 
            method: 'GET', 
            headers: headers, 
            cache: 'no-store',
            signal: AbortSignal.timeout(12000)
          });
        }
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }
  }

  if (!response && lastError) {
    return NextResponse.json({ 
      success: false, 
      message: 'Proxy fetch error', 
      error: lastError.message,
      cause: lastError.cause ? (lastError.cause.code || lastError.cause.message || String(lastError.cause)) : undefined
    }, { status: 500 });
  }

  try {
    if (!response.ok) {
      const errorText = await response.text();
      const isUpstreamAuth = response.status === 401;
      return NextResponse.json({
        success: false,
        code: isUpstreamAuth ? 'UPSTREAM_TOKEN_EXPIRED' : 'UPSTREAM_API_ERROR',
        status: response.status,
        statusText: response.statusText,
        message: isUpstreamAuth
          ? 'Unauthorized: Token Crazii Upstream đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật crazii_refresh_token trong Database.'
          : `Target API Error: ${response.statusText}`,
        raw: errorText
      }, { status: isUpstreamAuth ? 502 : response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      message: 'Proxy fetch error', 
      error: error.message,
      cause: error.cause ? (error.cause.code || error.cause.message || String(error.cause)) : undefined
    }, { status: 500 });
  }
}
