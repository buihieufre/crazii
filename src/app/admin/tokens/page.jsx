'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminTokensRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#8899A6' }}>
      Đang chuyển hướng về bảng điều khiển quản trị...
    </div>
  );
}
