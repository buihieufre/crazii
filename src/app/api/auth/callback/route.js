import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  if (error) {
    console.warn('[Supabase Auth Callback Error]:', error, error_description);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error_description || error)}`);
  }

  if (code) {
    try {
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError && data?.session) {
        return NextResponse.redirect(`${origin}/`);
      }
      if (exchangeError) {
        console.error('[Supabase Code Exchange Error]:', exchangeError.message);
      }
    } catch (e) {
      console.error('[Supabase Callback Exception]:', e.message);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
