const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSupabaseState() {
  console.log('🔄 Đang kiểm tra trạng thái Supabase Database:', SUPABASE_URL);

  // 1. Check users table
  const { data: users, error: uErr } = await supabase.from('users').select('*').limit(10);
  if (uErr) {
    console.error(`❌ Lỗi truy vấn bảng 'users': ${uErr.message} (Code: ${uErr.code})`);
  } else {
    console.log(`✅ Bảng 'users': Tìm thấy ${users.length} tài khoản trong DB.`);
    console.table(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      device: u.current_device_id || '(chưa có)',
      sub_status: u.subscription_status,
      role: u.role
    })));
  }

  // 2. Check user_logins table
  const { data: logins, error: lErr } = await supabase.from('user_logins').select('*').order('logged_in_at', { ascending: false }).limit(5);
  if (lErr) {
    console.error(`❌ Lỗi truy vấn bảng 'user_logins': ${lErr.message}`);
  } else {
    console.log(`✅ Bảng 'user_logins': Tìm thấy ${logins.length} bản ghi đăng nhập gần nhất.`);
  }

  // 3. Check subscription_orders table
  const { data: orders, error: oErr } = await supabase.from('subscription_orders').select('*').limit(5);
  if (oErr) {
    console.log(`⚠️ Bảng 'subscription_orders' chưa được tạo hoặc RLS chặn: ${oErr.message}`);
  } else {
    console.log(`✅ Bảng 'subscription_orders': Sẵn sàng, tìm thấy ${orders.length} đơn hàng.`);
  }

  console.log('🏁 Hoàn tất kiểm tra.');
}

checkSupabaseState();
