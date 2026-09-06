const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { prisma } = require('../src/lib/prisma');

async function testPrisma() {
  console.log('🔄 Đang kiểm tra kết nối Prisma ORM...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '(Đã được cấu hình)' : '(Chưa cấu hình)');

  try {
    const users = await prisma.user.findMany({
      take: 5
    });
    console.log(`✅ [Prisma ORM] Kết nối Database thành công! Tìm thấy ${users.length} users:`);
    console.table(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      device: u.current_device_id || '(null)',
      sub_status: u.subscription_status,
      role: u.role
    })));
  } catch (err) {
    console.error('❌ [Prisma ORM] Lỗi kết nối / truy vấn:', err.message);
    if (!process.env.DATABASE_URL) {
      console.log('👉 Hướng dẫn: Vui lòng thêm DATABASE_URL="postgresql://..." vào file .env.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

testPrisma();
