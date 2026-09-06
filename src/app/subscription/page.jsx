'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';

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
  const [pollCount, setPollCount] = useState(0);
  const [message, setMessage] = useState(null);

  // Admin Tool 1: Random Trial Generator state
  const [genDays, setGenDays] = useState(3);
  const [genCustomDays, setGenCustomDays] = useState('');
  const [genPrefix, setGenPrefix] = useState('trial');
  const [genNote, setGenNote] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [latestCreatedAccount, setLatestCreatedAccount] = useState(null);
  const [recentTrials, setRecentTrials] = useState([]);
  const [showPassword, setShowPassword] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  // Admin Tool 2: Grant Trial to Existing Account
  const [adminTargetEmail, setAdminTargetEmail] = useState('');
  const [adminDays, setAdminDays] = useState(3);
  const [adminMsg, setAdminMsg] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Admin Tool 3: Collapsible payment test
  const [showAdminPaymentTest, setShowAdminPaymentTest] = useState(false);

  // Retrieve session token from localStorage
  function getSessionToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
  }

  // Handle Logout
  function handleLogout() {
    try {
      const supabase = createSupabaseClient();
      supabase.auth.signOut().catch(() => {});
    } catch (e) {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('crazii_session_token');
      localStorage.removeItem('tradewh_session_token');
      localStorage.removeItem('crazii_user');
    }
    router.push('/');
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
          localStorage.removeItem('crazii_session_token');
          localStorage.removeItem('tradewh_session_token');
          router.push('/?kickout=1');
          return;
        }
        localStorage.removeItem('crazii_session_token');
        localStorage.removeItem('tradewh_session_token');
        router.push('/');
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
    try {
      const rawUser = localStorage.getItem('crazii_user');
      if (rawUser) {
        setUser(JSON.parse(rawUser));
      }
      const savedTrials = localStorage.getItem('tradewh_recent_trials');
      if (savedTrials) {
        setRecentTrials(JSON.parse(savedTrials));
      }
    } catch (e) {}
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

  // Copy to clipboard helper
  function handleCopyText(text, key) {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (e) {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  }

  // Format full account string for customer dispatch
  function formatFullAccountMessage(acc) {
    if (!acc) return '';
    return [
      `🌟 THÔNG TIN TÀI KHOẢN TRẢI NGHIỆM TRADEWH PRO 🌟`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🌐 Link đăng nhập: https://crazii.onrender.com/`,
      `👤 Tài khoản: ${acc.email}`,
      `🔑 Mật khẩu: ${acc.password}`,
      `⏱️ Thời hạn: ${acc.days} Ngày (Hết hạn: ${acc.expiryDateFormatted || acc.subscriptionExpiry})`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `⚠️ Lưu ý: Tài khoản chỉ hỗ trợ đăng nhập trên 1 thiết bị/trình duyệt tại cùng một thời điểm.`
    ].join('\n');
  }

  // Generate Random Trial Account (Admin Only)
  async function handleGenerateTrialAccount() {
    const token = getSessionToken();
    if (!token) return;

    const actualDays = genCustomDays ? parseInt(genCustomDays, 10) : genDays;
    if (!actualDays || actualDays < 1) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập số ngày hợp lệ (tối thiểu 1 ngày).' });
      return;
    }

    setGenLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/create-trial-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          days: actualDays,
          prefix: genPrefix,
          note: genNote.trim()
        })
      });

      const data = await res.json();
      if (data.success && data.account) {
        setLatestCreatedAccount(data.account);
        const updatedHistory = [data.account, ...recentTrials.filter(item => item.email !== data.account.email)].slice(0, 20);
        setRecentTrials(updatedHistory);
        try {
          localStorage.setItem('tradewh_recent_trials', JSON.stringify(updatedHistory));
        } catch (e) {}
        setMessage({ type: 'success', text: `Đã tạo thành công tài khoản dùng thử ${actualDays} ngày!` });
        setGenNote('');
      } else {
        setMessage({ type: 'error', text: data.message || 'Không thể tạo tài khoản dùng thử.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Lỗi khi tạo tài khoản: ' + err.message });
    } finally {
      setGenLoading(false);
    }
  }

  // Clear Recent Trials History
  function handleClearHistory() {
    if (window.confirm('Bạn có chắc muốn xóa lịch sử danh sách các tài khoản đã tạo trên trình duyệt này?')) {
      setRecentTrials([]);
      try {
        localStorage.removeItem('tradewh_recent_trials');
      } catch (e) {}
    }
  }

  // Admin Quick Grant Trial (Existing Account)
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
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
        setMessage({
          type: 'info',
          text: `Đã mở trang thanh toán Cryptomus. Sau khi hoàn tất chuyển khoản 45 USDT, gói cước sẽ tự động kích hoạt!`
        });

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
      padding: '30px 20px 60px 20px',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Background Decorative Mesh Glow */}
      <div style={{
        position: 'absolute',
        top: '-150px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '900px',
        height: '500px',
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
        marginBottom: '36px',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* User Profile Badge */}
          {(subData?.email || user?.email) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px 5px 6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#E9E6E7'
              }}
              title={subData?.email || user?.email}
            >
              <img
                src={user?.picture || 'https://lh3.googleusercontent.com/a/default-user'}
                alt="Avatar"
                style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.src = 'https://lh3.googleusercontent.com/a/default-user'; }}
              />
              <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subData?.name || user?.name || (subData?.email || user?.email)?.split('@')[0]}
              </span>
            </div>
          )}

          {/* Back to Terminal Link */}
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
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: '600',
              textDecoration: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span>📊</span>
            <span>Quay lại Terminal</span>
          </Link>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#f87171';
            }}
            title="Đăng xuất khỏi phiên làm việc"
          >
            <span>🚪</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ width: '100%', maxWidth: '980px', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Title Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
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
            marginBottom: '14px',
            letterSpacing: '0.5px'
          }}>
            <span>{isAdmin ? '👑 ADMIN CONTROL CENTER' : '💎 TRADEWH MEMBERSHIP'}</span>
          </div>

          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            margin: '0 0 10px 0',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #CBB193 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {isAdmin ? 'Trung Tâm Quản Trị & Cấp Quyền Dùng Thử' : 'Trạng Thái Tài Khoản Thành Viên'}
          </h1>

          <p style={{
            fontSize: '14px',
            color: '#AB978C',
            maxWidth: '580px',
            margin: '0 auto',
            lineHeight: '1.6'
          }}>
            {isAdmin
              ? 'Tạo tài khoản ngẫu nhiên, cấp quyền dùng thử nhanh và quản lý quyền truy cập hệ thống giao dịch.'
              : 'Hệ thống hạ tầng dữ liệu biểu đồ real-time, Diamond AI Signals và bộ chỉ báo dao động chuyên sâu.'}
          </p>
        </div>

        {/* Global Notifications / Alert Banner */}
        {message && (
          <div style={{
            width: '100%',
            maxWidth: '780px',
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
            maxWidth: '780px',
            background: '#131722',
            border: '1px solid #252a38',
            borderRadius: '4px',
            padding: '18px 24px',
            marginBottom: '32px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px',
                height: '44px',
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
                  Tài khoản đăng nhập: <strong style={{ color: '#E9E6E7' }}>{subData.email}</strong>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#E9E6E7', marginTop: '2px' }}>
                  {isAdmin
                    ? 'Quản trị viên hệ thống (Admin Access - Vô hạn)'
                    : isActive
                    ? `Gói Đang Hoạt Động (${daysLeft} ngày còn lại)`
                    : 'Tài khoản chưa kích hoạt / Đã hết hạn'}
                </div>
                {expiryDateFormatted && !isAdmin && (
                  <div style={{ fontSize: '12px', color: '#6B7C98', marginTop: '2px' }}>
                    Thời hạn sử dụng đến: {expiryDateFormatted}
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
                    padding: '9px 20px',
                    background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                    color: '#0B0E14',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '13px',
                    fontWeight: '700',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(203, 177, 147, 0.25)'
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
                  Chưa kích hoạt
                </span>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: REGULAR USER VIEW (PRICING PACKAGES TEMPORARILY HIDDEN)            */}
        {/* ========================================================================= */}
        {!isAdmin && (
          <div style={{
            width: '100%',
            maxWidth: '680px',
            background: 'linear-gradient(180deg, #131722 0%, #0c0f17 100%)',
            border: '1px solid #252a38',
            borderRadius: '6px',
            padding: '36px 30px',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '42px', marginBottom: '16px' }}>
              {isActive ? '💎' : '🔒'}
            </div>

            <h2 style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#E9E6E7',
              margin: '0 0 12px 0'
            }}>
              {isActive
                ? 'Tài Khoản Đang Có Quyền Truy Cập Đầy Đủ'
                : 'Quyền Truy Cập Nền Tảng Giao Dịch TRADEWH'}
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#AB978C',
              lineHeight: '1.6',
              maxWidth: '520px',
              margin: '0 auto 24px auto'
            }}>
              {isActive
                ? `Tài khoản của bạn đã được kích hoạt sử dụng trọn bộ tính năng biểu đồ đa khung thời gian, Diamond AI Signals và KSI Oscillator. Bạn còn ${daysLeft} ngày sử dụng.`
                : 'Nền tảng TRADEWH hiện đang trong giai đoạn triển khai đặc quyền thông qua tài khoản dùng thử được cấp trực tiếp. Nếu bạn cần nhận tài khoản trải nghiệm hoặc hỗ trợ gia hạn, vui lòng liên hệ Admin qua Telegram.'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {isActive ? (
                <Link
                  href="/"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 28px',
                    background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                    color: '#0B0E14',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '800',
                    boxShadow: '0 4px 15px rgba(203, 177, 147, 0.25)'
                  }}
                >
                  <span>📊</span>
                  <span>VÀO BIỂU ĐỒ GIAO DỊCH NGAY</span>
                </Link>
              ) : (
                <>
                  <a
                    href="https://t.me/dhieu9b"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 24px',
                      background: '#0088cc',
                      color: '#ffffff',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '700',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 15px rgba(0, 136, 204, 0.3)'
                    }}
                  >
                    <span>💬</span>
                    <span>Liên Hệ Admin Qua Telegram</span>
                  </a>
                  <Link
                    href="/"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '12px 20px',
                      background: '#1c212d',
                      color: '#E9E6E7',
                      textDecoration: 'none',
                      border: '1px solid #252a38',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    <span>Quay lại Trang Chủ</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: ADMIN MANAGEMENT DASHBOARD                                        */}
        {/* ========================================================================= */}
        {isAdmin && (
          <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* TOOL 1: RANDOM TRIAL ACCOUNT GENERATOR */}
            <div style={{
              background: 'linear-gradient(180deg, #131722 0%, #0d111a 100%)',
              border: '1px solid #CBB193',
              borderRadius: '6px',
              padding: '28px 24px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(203, 177, 147, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>🎲</span>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#E9E6E7', margin: 0 }}>
                      Tạo Tài Khoản Dùng Thử Ngẫu Nhiên
                    </h2>
                    <p style={{ fontSize: '12px', color: '#AB978C', margin: '2px 0 0 0' }}>
                      Tự động tạo email và mật khẩu ngẫu nhiên kèm thời hạn dùng thử.
                    </p>
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#0B0E14',
                  background: '#CBB193',
                  padding: '3px 8px',
                  borderRadius: '2px',
                  textTransform: 'uppercase'
                }}>
                  1-Click Generator
                </span>
              </div>

              {/* Duration Options */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#E9E6E7', marginBottom: '8px' }}>
                  ⏱️ Chọn Thời Hạn Dùng Thử:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {[
                    { label: '1 Ngày', value: 1 },
                    { label: '3 Ngày (Chuẩn)', value: 3 },
                    { label: '7 Ngày (1 Tuần)', value: 7 },
                    { label: '14 Ngày (2 Tuần)', value: 14 },
                    { label: '30 Ngày (1 Tháng)', value: 30 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setGenDays(item.value);
                        setGenCustomDays('');
                      }}
                      style={{
                        padding: '8px 14px',
                        background: genDays === item.value && !genCustomDays ? '#CBB193' : '#1c212d',
                        color: genDays === item.value && !genCustomDays ? '#0B0E14' : '#E9E6E7',
                        border: `1px solid ${genDays === item.value && !genCustomDays ? '#CBB193' : '#252a38'}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                    <span style={{ fontSize: '12px', color: '#6B7C98' }}>Hoặc:</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Số ngày khác"
                      value={genCustomDays}
                      onChange={(e) => setGenCustomDays(e.target.value)}
                      style={{
                        width: '105px',
                        padding: '7px 10px',
                        background: '#0b0e14',
                        border: '1px solid #252a38',
                        borderRadius: '4px',
                        color: '#E9E6E7',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Prefix & Note Options */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#E9E6E7', marginBottom: '6px' }}>
                    🏷️ Tiền tố Email:
                  </label>
                  <select
                    value={genPrefix}
                    onChange={(e) => setGenPrefix(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      background: '#0b0e14',
                      border: '1px solid #252a38',
                      borderRadius: '4px',
                      color: '#E9E6E7',
                      fontSize: '12px'
                    }}
                  >
                    <option value="trial">trial_xxxxxx@tradewh.com</option>
                    <option value="vip">vip_xxxxxx@tradewh.com</option>
                    <option value="user">user_xxxxxx@tradewh.com</option>
                    <option value="member">member_xxxxxx@tradewh.com</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#E9E6E7', marginBottom: '6px' }}>
                    📝 Ghi chú (Khách hàng / Nguồn):
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Khách Telegram @alex"
                    value={genNote}
                    onChange={(e) => setGenNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      background: '#0b0e14',
                      border: '1px solid #252a38',
                      borderRadius: '4px',
                      color: '#E9E6E7',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Generate Action Button */}
              <button
                type="button"
                onClick={handleGenerateTrialAccount}
                disabled={genLoading}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  background: genLoading ? '#5E5653' : 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                  color: '#0B0E14',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '800',
                  letterSpacing: '0.5px',
                  cursor: genLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(203, 177, 147, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {genLoading ? (
                  <>
                    <span>🔄</span>
                    <span>ĐANG KHỞI TẠO TÀI KHOẢN...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>TỰ ĐỘNG TẠO TÀI KHOẢN & MẬT KHẨU ({genCustomDays || genDays} NGÀY)</span>
                  </>
                )}
              </button>

              {/* HIGHLIGHT: LATEST GENERATED ACCOUNT RESULT BOX */}
              {latestCreatedAccount && (
                <div style={{
                  marginTop: '24px',
                  padding: '20px',
                  background: 'rgba(203, 177, 147, 0.08)',
                  border: '1px solid #CBB193',
                  borderRadius: '6px',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🎉</span>
                      <strong style={{ fontSize: '14px', color: '#4ade80' }}>
                        Đã Tạo Thành Công Tài Khoản Dùng Thử!
                      </strong>
                    </div>
                    <span style={{ fontSize: '12px', color: '#AB978C' }}>
                      Hạn: <strong style={{ color: '#CBB193' }}>{latestCreatedAccount.days} Ngày</strong>
                    </span>
                  </div>

                  {/* Account Details Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#0b0e14', padding: '14px', borderRadius: '4px', border: '1px solid #252a38' }}>
                    {/* Email Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#6B7C98', width: '70px' }}>Email:</span>
                        <code style={{ fontSize: '14px', color: '#00E5FF', fontWeight: 'bold' }}>
                          {latestCreatedAccount.email}
                        </code>
                      </div>
                      <button
                        onClick={() => handleCopyText(latestCreatedAccount.email, 'email')}
                        style={{
                          padding: '4px 10px',
                          background: copiedKey === 'email' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          color: copiedKey === 'email' ? '#4ade80' : '#E9E6E7',
                          border: `1px solid ${copiedKey === 'email' ? '#4ade80' : '#252a38'}`,
                          borderRadius: '3px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedKey === 'email' ? '✓ Đã chép Email' : '📋 Chép Email'}
                      </button>
                    </div>

                    {/* Password Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#6B7C98', width: '70px' }}>Mật khẩu:</span>
                        <code style={{ fontSize: '14px', color: '#f59e0b', fontWeight: 'bold', letterSpacing: '1px' }}>
                          {showPassword ? latestCreatedAccount.password : '••••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ background: 'none', border: 'none', color: '#6B7C98', cursor: 'pointer', fontSize: '12px' }}
                          title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        >
                          {showPassword ? '👁️' : '🔒'}
                        </button>
                      </div>
                      <button
                        onClick={() => handleCopyText(latestCreatedAccount.password, 'password')}
                        style={{
                          padding: '4px 10px',
                          background: copiedKey === 'password' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          color: copiedKey === 'password' ? '#4ade80' : '#E9E6E7',
                          border: `1px solid ${copiedKey === 'password' ? '#4ade80' : '#252a38'}`,
                          borderRadius: '3px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedKey === 'password' ? '✓ Đã chép Mật khẩu' : '📋 Chép Mật khẩu'}
                      </button>
                    </div>

                    {/* Expiry Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7C98', marginTop: '2px' }}>
                      <span style={{ width: '70px' }}>Hết hạn:</span>
                      <span style={{ color: '#E9E6E7' }}>
                        {latestCreatedAccount.expiryDateFormatted || latestCreatedAccount.subscriptionExpiry}
                      </span>
                    </div>
                  </div>

                  {/* Copy All Dispatch Button */}
                  <button
                    onClick={() => handleCopyText(formatFullAccountMessage(latestCreatedAccount), 'full')}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '10px 16px',
                      background: copiedKey === 'full' ? '#22c55e' : '#1c212d',
                      color: '#ffffff',
                      border: `1px solid ${copiedKey === 'full' ? '#22c55e' : '#CBB193'}`,
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>{copiedKey === 'full' ? '✓' : '📋'}</span>
                    <span>
                      {copiedKey === 'full'
                        ? 'ĐÃ SAO CHÉP TOÀN BỘ NỘI DUNG GỬI KHÁCH!'
                        : 'SAO CHÉP TOÀN BỘ THÔNG TIN (ĐỂ GỬI KHÁCH HÀNG)'}
                    </span>
                  </button>
                </div>
              )}

              {/* RECENT TRIAL ACCOUNTS LIST */}
              {recentTrials.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#AB978C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📋 Các Tài Khoản Vừa Tạo Gần Đây ({recentTrials.length}):
                    </span>
                    <button
                      onClick={handleClearHistory}
                      style={{ background: 'none', border: 'none', color: '#6B7C98', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                    >
                      Xóa lịch sử
                    </button>
                  </div>

                  <div style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    background: '#0b0e14',
                    border: '1px solid #252a38',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {recentTrials.map((acc, idx) => (
                      <div
                        key={acc.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderBottom: idx < recentTrials.length - 1 ? '1px solid #1a202c' : 'none',
                          fontSize: '12px',
                          gap: '10px'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ color: '#00E5FF' }}>{acc.email}</strong>
                            <span style={{ color: '#6B7C98' }}>•</span>
                            <span style={{ color: '#f59e0b', fontWeight: '600' }}>{acc.password}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#6B7C98', marginTop: '2px' }}>
                            Thời hạn: {acc.days} ngày | Hết hạn: {acc.expiryDateFormatted || acc.subscriptionExpiry}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleCopyText(formatFullAccountMessage(acc), `hist-${idx}`)}
                            style={{
                              padding: '4px 8px',
                              background: copiedKey === `hist-${idx}` ? 'rgba(74, 222, 128, 0.2)' : '#1c212d',
                              color: copiedKey === `hist-${idx}` ? '#4ade80' : '#E9E6E7',
                              border: '1px solid #252a38',
                              borderRadius: '2px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                            title="Sao chép toàn bộ nội dung gửi khách"
                          >
                            {copiedKey === `hist-${idx}` ? '✓ Đã chép' : '📋 Chép gửi'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* TOOL 2: GRANT TRIAL TO EXISTING REGISTERED ACCOUNT */}
            <div style={{
              background: '#131722',
              border: '1px solid #252a38',
              borderRadius: '6px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>🎁</span>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#E9E6E7', margin: 0 }}>
                  Cấp Quyền Dùng Thử Cho Email Khách Đã Đăng Ký
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: '#AB978C', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                Dùng khi khách hàng đã tự tạo tài khoản email trên hệ thống và bạn muốn mở quyền sử dụng cho email đó.
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
                    placeholder="Email người dùng đã đăng ký (vd: user@gmail.com)"
                    value={adminTargetEmail}
                    onChange={(e) => setAdminTargetEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#0b0e14',
                      border: '1px solid #252a38',
                      borderRadius: '4px',
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
                      borderRadius: '4px',
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
                      borderRadius: '4px',
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

            {/* TOOL 3: OPTIONAL ADMIN CRYPTOMUS TEST BOX (COLLAPSIBLE) */}
            <div style={{
              background: '#131722',
              border: '1px solid #252a38',
              borderRadius: '6px',
              padding: '18px 24px'
            }}>
              <div
                onClick={() => setShowAdminPaymentTest(!showAdminPaymentTest)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>💳</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#AB978C' }}>
                    Kiểm Tra Cổng Thanh Toán Cryptomus (45 USDT)
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#6B7C98' }}>
                  {showAdminPaymentTest ? '▲ Thu gọn' : '▼ Mở rộng'}
                </span>
              </div>

              {showAdminPaymentTest && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #252a38' }}>
                  <p style={{ fontSize: '12px', color: '#6B7C98', margin: '0 0 12px 0' }}>
                    Phần này chỉ dùng để kiểm tra luồng thanh toán hóa đơn 45 USDT qua Cryptomus.
                  </p>
                  <button
                    onClick={handleCreatePayment}
                    disabled={paying}
                    style={{
                      padding: '10px 18px',
                      background: '#CBB193',
                      color: '#0B0E14',
                      border: 'none',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: paying ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {paying ? 'Đang tạo đơn...' : 'Tạo Đơn Hàng Thử Nghiệm (45 USDT)'}
                  </button>

                  {paymentInfo && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#CBB193' }}>
                      Đơn: #{paymentInfo.orderId} - <a href={paymentInfo.paymentUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00E5FF' }}>Mở cổng thanh toán ↗</a>
                    </div>
                  )}
                </div>
              )}
            </div>

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
