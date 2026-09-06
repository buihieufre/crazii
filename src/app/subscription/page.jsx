'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryOrderId = searchParams ? searchParams.get('order_id') : null;
  const queryStatus = searchParams ? searchParams.get('status') : null;

  const [user, setUser] = useState(null);
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [adminTargetEmail, setAdminTargetEmail] = useState('');
  const [adminDays, setAdminDays] = useState(3);
  const [adminMsg, setAdminMsg] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [message, setMessage] = useState(null);

  // Retrieve session token from localStorage
  function getSessionToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
  }

  // Load current user and subscription data
  async function fetchSubscriptionData() {
    const token = getSessionToken();
    if (!token) {
      router.push('/?auth=login');
      return;
    }

    try {
      const res = await fetch('/api/user/subscription', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.code === 'DEVICE_SESSION_TERMINATED') {
          alert('Tài khoản của bạn đã đăng nhập ở thiết bị khác.');
        }
        localStorage.removeItem('crazii_session_token');
        localStorage.removeItem('tradewh_session_token');
        router.push('/?auth=login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setSubData(data);
      }
    } catch (e) {
      console.error('Failed to fetch subscription status:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  // Handle auto query check if returned from Cryptomus payment gateway
  useEffect(() => {
    if (queryStatus === 'success' || queryOrderId) {
      setMessage({
        type: 'success',
        text: 'Cảm ơn bạn đã thanh toán! Hệ thống đang tự động đồng bộ thời hạn gói...'
      });
      fetchSubscriptionData();
    }
  }, [queryStatus, queryOrderId]);

  // Create Cryptomus Payment Invoice (45.00 USDT)
  async function handleCreatePayment() {
    const token = getSessionToken();
    if (!token) {
      router.push('/?auth=login');
      return;
    }

    setPaying(true);
    setMessage(null);

    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success && data.paymentUrl) {
        setPaymentInfo(data);
        // Open payment link in new window / tab
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
        setMessage({
          type: 'info',
          text: `Đã mở trang thanh toán Cryptomus. Sau khi hoàn tất chuyển khoản 45 USDT, gói cước sẽ tự động kích hoạt!`
        });

        // Start auto-polling for 2 minutes
        let count = 0;
        const interval = setInterval(async () => {
          count++;
          setPollCount(count);
          if (count > 24) {
            clearInterval(interval);
            return;
          }
          await fetchSubscriptionData();
        }, 5000);
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Không thể tạo đơn hàng thanh toán. Vui lòng thử lại sau.'
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Lỗi kết nối tới máy chủ thanh toán: ' + err.message
      });
    } finally {
      setPaying(false);
    }
  }

  // Admin Quick Grant Trial (3 Days)
  async function handleAdminGrantTrial(e) {
    e.preventDefault();
    if (!adminTargetEmail) return;

    const token = getSessionToken();
    setAdminLoading(true);
    setAdminMsg(null);

    try {
      const res = await fetch('/api/admin/grant-trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: adminTargetEmail.trim(),
          days: Number(adminDays) || 3
        })
      });

      const data = await res.json();
      if (data.success) {
        setAdminMsg({ type: 'success', text: data.message });
        setAdminTargetEmail('');
        fetchSubscriptionData();
      } else {
        setAdminMsg({ type: 'error', text: data.message || 'Không thể cấp trial.' });
      }
    } catch (err) {
      setAdminMsg({ type: 'error', text: 'Lỗi thực hiện: ' + err.message });
    } finally {
      setAdminLoading(false);
    }
  }

  const isActive = subData?.subscriptionStatus;
  const daysLeft = subData?.daysLeft || 0;
  const isAdmin = subData?.isAdmin;
  const expiryDateFormatted = subData?.subscriptionExpiry
    ? new Date(subData.subscriptionExpiry).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0b0e14',
      color: '#E9E6E7',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Background Decorative Mesh Glow */}
      <div style={{
        position: 'absolute',
        top: '-150px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '800px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(203, 177, 147, 0.08) 0%, rgba(11, 14, 20, 0) 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Top Navigation Bar */}
      <header style={{
        width: '100%',
        maxWidth: '1080px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '40px',
        zIndex: 1
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
            color: '#0B0E14',
            fontWeight: '900',
            fontSize: '14px',
            letterSpacing: '2px',
            padding: '6px 14px',
            borderRadius: '2px',
            boxShadow: '0 2px 10px rgba(203, 177, 147, 0.2)'
          }}>
            TRADEWH
          </div>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#131722',
              color: '#E9E6E7',
              border: '1px solid #252a38',
              borderRadius: '2px',
              fontSize: '13px',
              fontWeight: '600',
              textDecoration: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>📊</span>
            <span>Quay lại Terminal</span>
          </Link>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ width: '100%', maxWidth: '980px', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Title & Badge Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 14px',
            background: 'rgba(203, 177, 147, 0.1)',
            border: '1px solid rgba(203, 177, 147, 0.3)',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#CBB193',
            marginBottom: '16px',
            letterSpacing: '0.5px'
          }}>
            <span>💎</span>
            <span>TRADEWH MEMBERSHIP PASS</span>
          </div>

          <h1 style={{
            fontSize: '36px',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            margin: '0 0 12px 0',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #CBB193 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Kích Hoạt Gói Giao Dịch Chuyên Nghiệp
          </h1>

          <p style={{
            fontSize: '15px',
            color: '#AB978C',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: '1.6'
          }}>
            Truy cập trọn bộ công cụ biểu đồ real-time, thuật toán Diamond AI Signals và bộ dao động độc quyền KSI & KCX Oscillator.
          </p>
        </div>

        {/* Global Notifications / Alert Banner */}
        {message && (
          <div style={{
            width: '100%',
            maxWidth: '720px',
            padding: '12px 20px',
            marginBottom: '24px',
            borderRadius: '4px',
            fontSize: '13px',
            lineHeight: '1.5',
            backgroundColor: message.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : message.type === 'error' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(96, 165, 250, 0.1)',
            border: `1px solid ${message.type === 'success' ? '#4ade80' : message.type === 'error' ? '#f87171' : '#60a5fa'}`,
            color: message.type === 'success' ? '#4ade80' : message.type === 'error' ? '#f87171' : '#93c5fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Current User Status Banner */}
        {subData && (
          <div style={{
            width: '100%',
            maxWidth: '720px',
            background: '#131722',
            border: '1px solid #252a38',
            borderRadius: '4px',
            padding: '18px 24px',
            marginBottom: '36px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: isActive ? 'rgba(203, 177, 147, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                border: `1px solid ${isActive ? '#CBB193' : '#ff5252'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                {isAdmin ? '👑' : isActive ? '💎' : '⚠️'}
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#AB978C', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Tài khoản: <strong style={{ color: '#E9E6E7' }}>{subData.email}</strong>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#E9E6E7', marginTop: '2px' }}>
                  {isAdmin
                    ? 'Quản trị viên (Admin - Vô hạn)'
                    : isActive
                    ? `Gói Đang Hoạt Động (${daysLeft} ngày còn lại)`
                    : 'Gói Cước Đã Hết Hạn / Chưa Kích Hoạt'}
                </div>
                {expiryDateFormatted && !isAdmin && (
                  <div style={{ fontSize: '12px', color: '#6B7C98', marginTop: '2px' }}>
                    Hết hạn vào: {expiryDateFormatted}
                  </div>
                )}
              </div>
            </div>

            <div>
              {isActive ? (
                <Link
                  href="/"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                    color: '#0B0E14',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '13px',
                    fontWeight: '700',
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <span>Mở Biểu Đồ 🚀</span>
                </Link>
              ) : (
                <span style={{
                  padding: '6px 14px',
                  background: 'rgba(255, 82, 82, 0.1)',
                  color: '#ff5252',
                  border: '1px solid rgba(255, 82, 82, 0.3)',
                  borderRadius: '2px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  Cần kích hoạt
                </span>
              )}
            </div>
          </div>
        )}

        {/* Pricing Card: 45 USDT / 30 Days */}
        <div style={{
          width: '100%',
          maxWidth: '520px',
          background: 'linear-gradient(180deg, #131722 0%, #0c0f17 100%)',
          border: '1px solid #CBB193',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(203, 177, 147, 0.15)',
          borderRadius: '4px',
          padding: '36px 32px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Top Tag */}
          <div style={{
            position: 'absolute',
            top: '-12px',
            right: '24px',
            background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
            color: '#0B0E14',
            fontSize: '11px',
            fontWeight: '800',
            letterSpacing: '1px',
            padding: '4px 12px',
            borderRadius: '2px',
            textTransform: 'uppercase'
          }}>
            Khuyên Dùng
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', color: '#CBB193', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
              TRADEWH PRO PASS
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '42px', fontWeight: '900', color: '#E9E6E7', letterSpacing: '-1px' }}>
                45
              </span>
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#CBB193' }}>
                USDT
              </span>
              <span style={{ fontSize: '14px', color: '#6B7C98' }}>
                / 30 ngày
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#AB978C', margin: '8px 0 0 0', lineHeight: '1.5' }}>
              Mở khóa toàn bộ hạ tầng dữ liệu và công cụ phân tích kỹ thuật chuẩn tài chính.
            </p>
          </div>

          <div style={{ height: '1px', background: '#252a38', margin: '8px 0 24px 0' }} />

          {/* Feature List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
            {[
              { icon: '⚡', title: 'Hạ tầng Streaming Nến Realtime 0ms', desc: 'Dữ liệu thời gian thực không độ trễ, đa khung thời gian.' },
              { icon: '💎', title: 'Diamond AI Signals (Buy / Sell)', desc: 'Thuật toán phát hiện điểm đảo chiều và xu hướng mạnh mẽ.' },
              { icon: '📈', title: 'KSI & KCX Oscillator Độc Quyền', desc: 'Bộ chỉ báo dòng tiền và sức mạnh động lượng chuyên sâu.' },
              { icon: '🗖', title: 'Multi-Layout Đa Màn Hình', desc: 'Chia 2 cột, 2 hàng, 3 cột, 4 lưới tiện lợi cho trader.' },
              { icon: '🤖', title: 'Đồng Bộ Telegram Signal Bot', desc: 'Nhận thông báo lệnh tự động trực tiếp về điện thoại.' },
              { icon: '🔒', title: 'Bảo Mật Phiên Đơn Thiết Bị', desc: 'Đảm bảo tài khoản giao dịch không bị xâm nhập trái phép.' },
            ].map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '16px', lineHeight: '1.2' }}>{feat.icon}</span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#E9E6E7' }}>{feat.title}</div>
                  <div style={{ fontSize: '11.5px', color: '#6B7C98', marginTop: '2px' }}>{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCreatePayment}
            disabled={paying}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: paying
                ? '#5E5653'
                : 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
              color: '#0B0E14',
              border: 'none',
              borderRadius: '2px',
              fontSize: '14px',
              fontWeight: '800',
              letterSpacing: '0.5px',
              cursor: paying ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(203, 177, 147, 0.2)'
            }}
          >
            {paying ? (
              <>
                <span className="spinner-icon">🔄</span>
                <span>ĐANG KHỞI TẠO ĐƠN HÀNG...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>THANH TOÁN 45 USDT QUA CRYPTOMUS</span>
              </>
            )}
          </button>

          <div style={{
            fontSize: '11px',
            color: '#6B7C98',
            textAlign: 'center',
            marginTop: '12px',
            lineHeight: '1.4'
          }}>
            Hỗ trợ USDT (TRC20, BEP20, TON, Solana, Polygon, v.v.). Tự động kích hoạt sau khi mạng lưới xác nhận.
          </div>

          {/* Active Payment Pending Box */}
          {paymentInfo && (
            <div style={{
              marginTop: '20px',
              padding: '14px',
              background: 'rgba(203, 177, 147, 0.05)',
              border: '1px dashed #CBB193',
              borderRadius: '2px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#CBB193', fontWeight: '600' }}>
                Đơn hàng: #{paymentInfo.orderId}
              </div>
              <div style={{ fontSize: '11px', color: '#AB978C', marginTop: '4px' }}>
                Đang chờ mạng lưới xác thực thanh toán... (Lần quét: {pollCount})
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                <a
                  href={paymentInfo.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '12px',
                    color: '#0B0E14',
                    background: '#CBB193',
                    padding: '5px 12px',
                    fontWeight: '600',
                    textDecoration: 'none',
                    borderRadius: '2px'
                  }}
                >
                  Mở lại trang thanh toán ↗
                </a>
                <button
                  onClick={fetchSubscriptionData}
                  style={{
                    fontSize: '12px',
                    color: '#E9E6E7',
                    background: '#252a38',
                    border: '1px solid #6B7C98',
                    padding: '5px 12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '2px'
                  }}
                >
                  Kiểm tra ngay 🔄
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Admin Quick Trial Grant Tool */}
        {isAdmin && (
          <div style={{
            width: '100%',
            maxWidth: '520px',
            background: '#131722',
            border: '1px solid #6B7C98',
            borderRadius: '4px',
            padding: '24px',
            marginTop: '36px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '18px' }}>👑</span>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#E9E6E7', margin: 0 }}>
                Quản Trị Viên: Cấp Quyền Dùng Thử (Trial)
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: '#AB978C', margin: '0 0 16px 0', lineHeight: '1.5' }}>
              Nhập email người dùng để cấp quyền sử dụng hệ thống ngay lập tức mà không cần thanh toán.
            </p>

            {adminMsg && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '2px',
                fontSize: '12px',
                marginBottom: '12px',
                backgroundColor: adminMsg.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                border: `1px solid ${adminMsg.type === 'success' ? '#4ade80' : '#f87171'}`,
                color: adminMsg.type === 'success' ? '#4ade80' : '#f87171'
              }}>
                {adminMsg.text}
              </div>
            )}

            <form onSubmit={handleAdminGrantTrial} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <input
                  type="email"
                  placeholder="Email người dùng (vd: user@gmail.com)"
                  value={adminTargetEmail}
                  onChange={(e) => setAdminTargetEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#0b0e14',
                    border: '1px solid #252a38',
                    borderRadius: '2px',
                    color: '#E9E6E7',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={adminDays}
                  onChange={(e) => setAdminDays(e.target.value)}
                  placeholder="Số ngày (vd: 3)"
                  style={{
                    width: '120px',
                    padding: '10px 12px',
                    background: '#0b0e14',
                    border: '1px solid #252a38',
                    borderRadius: '2px',
                    color: '#E9E6E7',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  disabled={adminLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#6B7C98',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: adminLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {adminLoading ? 'Đang cấp...' : `🎁 Cấp ${adminDays} Ngày Dùng Thử`}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0b0e14', color: '#CBB193', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Đang tải...</div>}>
      <SubscriptionContent />
    </Suspense>
  );
}
