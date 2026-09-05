import { NextResponse } from 'next/server';
import { executeRefreshToken } from '@/lib/crazii-api';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await executeRefreshToken(true);
  if (result.success) {
    return NextResponse.json({
      success: true,
      message: 'Access Token refreshed successfully on server',
      expiresIn: 900
    });
  } else {
    return NextResponse.json({ success: false, message: result.message || 'Refresh failed' }, { status: result.status || 500 });
  }
}
