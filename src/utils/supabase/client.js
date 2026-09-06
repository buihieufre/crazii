import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';

export const createClient = () =>
  createBrowserClient(
    supabaseUrl,
    supabaseKey,
  );
