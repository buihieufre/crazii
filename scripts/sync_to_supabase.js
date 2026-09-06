const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wlhlspmruezijcghgtqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6Atv2XIec0c5qV75FTEWCg_gNLh7tDw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncAll() {
  console.log('🔄 Bắt đầu đồng bộ người dùng lên Supabase:', SUPABASE_URL);
  const usersFile = path.join(__dirname, '..', 'data', 'registered-users.json');
  if (!fs.existsSync(usersFile)) {
    console.log('Không tìm thấy file data/registered-users.json');
    return;
  }

  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  console.log(`Tìm thấy ${users.length} tài khoản trong hệ thống local.`);

  for (const u of users) {
    const userId = u.id || u.sub;
    console.log(`Đang đồng bộ: ${u.email} (ID: ${userId})...`);

    // 1. Upsert to users
    const { error: uErr } = await supabase.from('users').upsert({
      id: userId,
      email: u.email,
      name: u.name || u.email.split('@')[0],
      avatar_url: u.avatar_url || u.picture || null,
      last_sign_in_at: u.last_sign_in_at || new Date().toISOString()
    }, { onConflict: 'id' });

    if (uErr) {
      console.error(`❌ Lỗi đồng bộ 'users' cho ${u.email}:`, uErr.message, `(Code: ${uErr.code})`);
      if (uErr.code === '42501') {
        console.log('👉 Gợi ý: Bảng đang bật RLS. Hãy tắt RLS hoặc cấp quyền trong Supabase SQL Editor.');
      }
    } else {
      console.log(`✅ Đã đồng bộ thành công vào bảng 'users': ${u.email}`);
    }

    // 2. Insert login event
    const { error: lErr } = await supabase.from('user_logins').insert({
      user_id: userId,
      email: u.email,
      name: u.name || u.email.split('@')[0],
      logged_in_at: u.last_sign_in_at || new Date().toISOString(),
      ip_address: '127.0.0.1'
    });

    if (lErr) {
      console.error(`❌ Lỗi thêm vào 'user_logins' cho ${u.email}:`, lErr.message, `(Code: ${lErr.code})`);
    } else {
      console.log(`✅ Đã thêm lịch sử đăng nhập vào bảng 'user_logins': ${u.email}`);
    }
  }

  console.log('🏁 Hoàn tất quá trình đồng bộ.');
}

syncAll();
