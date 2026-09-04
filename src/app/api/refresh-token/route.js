import { NextResponse } from 'next/server';
import { executeRefreshToken } from '@/lib/crazii-api';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await executeRefreshToken();
  if (result.success) {
    return NextResponse.json(result);
  } else {
    return NextResponse.json(result, { status: result.status || 500 });
  }
}
