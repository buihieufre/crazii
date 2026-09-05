import { NextResponse } from 'next/server';
import { getAuthToken, getRefreshToken, decodeJwt } from '@/lib/crazii-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = getAuthToken();
  const refresh = getRefreshToken();
  const nowSec = Math.floor(Date.now() / 1000);

  const authJwt = decodeJwt(auth);
  const refreshJwt = decodeJwt(refresh);

  const authExp = authJwt && authJwt.exp ? authJwt.exp : 0;
  const refreshExp = refreshJwt && refreshJwt.exp ? refreshJwt.exp : 0;

  return NextResponse.json({
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
}
