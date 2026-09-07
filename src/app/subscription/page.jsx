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
  const queryNPId = searchParams ? searchParams.get('NP_id') : null;

  const [user, setUser] = useState(null);
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [message, setMessage] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Network & Price Selection States (Default USDT on BSC with $1.00 Test Price)
  const [selectedNetwork, setSelectedNetwork] = useState('bsc'); // 'bsc' (BEP-20) or 'eth' (ERC-20)
  const [selectedPrice, setSelectedPrice] = useState('1.00'); // '1.00' (test) or '15.00' (standard)

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

  // Handle auto query check if returned from NOWPayments payment gateway
  useEffect(() => {
    if (queryStatus === 'success') {
      const targetOrderId = queryOrderId || queryNPId;
      if (targetOrderId) {
        setMessage({
          type: 'info',
          text: '🔄 Đang xác nhận giao dịch thanh toán từ NOWPayments...'
        });

        const token = getSessionToken();
        fetch(`/api/payment/status/${targetOrderId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && (data.activated || data.order?.status === 'finished' || data.order?.status === 'confirmed')) {
              setMessage({
                type: 'success',
                text: '🎉 Giao dịch thành công! Gói thành viên Pro đã được kích hoạt (+30 ngày).'
              });
              fetchSubscriptionData();
            } else {
              setMessage({
                type: 'info',
                text: 'Giao dịch đang chờ xác nhận từ mạng blockchain. Vui lòng đợi trong giây lát...'
              });
              fetchSubscriptionData();
            }
          })
          .catch(err => {
            fetchSubscriptionData();
          });
      } else {
        fetchSubscriptionData();
      }
    } else if (queryStatus === 'cancel') {
      setMessage({
        type: 'info',
        text: 'Đơn hàng thanh toán đã bị tạm dừng hoặc hủy. Bạn có thể tiến hành tạo lại bất kỳ lúc nào.'
      });
    }
  }, [queryStatus, queryOrderId, queryNPId]);

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

  // Create NOWPayments Crypto Invoice with selected Network (BSC or ETH) and Price ($1 or $15)
  async function handleCreatePayment() {
    const token = getSessionToken();
    if (!token) {
      router.push('/?auth=login');
      return;
    }

    setPaying(true);
    setMessage(null);

    const networkName = selectedNetwork === 'eth' ? 'ETH (ERC-20)' : 'BSC (BEP-20)';
    const effectivePrice = (selectedNetwork === 'eth' && selectedPrice === '1.00') ? '2.00' : selectedPrice;

    try {
      const res = await fetch('/api/payment/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: effectivePrice,
          currency: "usd",
          network: selectedNetwork
        })
      });

      const data = await res.json();
      if (data.success && (data.invoiceUrl || data.paymentUrl)) {
        const url = data.invoiceUrl || data.paymentUrl;
        setPaymentInfo({
          ...data,
          networkName,
          selectedPrice: data.amount || effectivePrice
        });
        window.open(url, '_blank', 'noopener,noreferrer');
        setMessage({
          type: 'info',
          text: `Đã mở trang thanh toán USDT mạng ${networkName} ($${data.amount || effectivePrice}). Sau khi hoàn tất chuyển khoản, gói cước sẽ tự động kích hoạt +30 ngày!`
        });

        // Polling status every 4 seconds
        let count = 0;
        const interval = setInterval(async () => {
          count++;
          setPollCount(count);
          if (count > 45) {
            clearInterval(interval);
            return;
          }

          if (data.orderId) {
            try {
              const statusRes = await fetch(`/api/payment/status/${data.orderId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const statusData = await statusRes.json();
              if (statusData.activated || statusData.order?.status === 'finished' || statusData.order?.status === 'confirmed') {
                clearInterval(interval);
                setMessage({
                  type: 'success',
                  text: '🎉 Thanh toán thành công! Gói thành viên TRADEWH Pro đã được kích hoạt (+30 ngày).'
                });
                await fetchSubscriptionData();
                return;
              }
            } catch (e) {}
          }

          await fetchSubscriptionData();
        }, 4000);
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Không thể tạo hóa đơn thanh toán NOWPayments. Vui lòng thử lại sau.'
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Lỗi kết nối máy chủ thanh toán: ' + err.message
      });
    } finally {
      setPaying(false);
    }
  }

  // Active status check & sync with NOWPayments
  async function handleCheckPaymentStatus() {
    if (!paymentInfo?.orderId) return;
    const token = getSessionToken();
    setCheckingStatus(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/payment/status/${paymentInfo.orderId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && (data.activated || data.order?.status === 'finished' || data.order?.status === 'confirmed')) {
        setMessage({
          type: 'success',
          text: `🎉 Xác nhận thanh toán thành công! Gói Pro đã kích hoạt +30 ngày.`
        });
        await fetchSubscriptionData();
      } else {
        setMessage({
          type: 'info',
          text: `Trạng thái hiện tại: [${data.order?.status || 'pending'}]. Nếu bạn vừa chuyển tiền, vui lòng chờ 1-2 phút để mạng blockchain xác nhận giao dịch.`
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Lỗi kiểm tra trạng thái: ' + err.message });
    } finally {
      setCheckingStatus(false);
    }
  }

  // Simulate Payment Confirmation (for testing)
  async function handleSimulateConfirm() {
    if (!paymentInfo?.orderId) return;
    const token = getSessionToken();
    setSimulating(true);

    try {
      const res = await fetch('/api/payment/simulate-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: paymentInfo.orderId
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: `⚡ Đã mô phỏng thanh toán thành công! Gói Pro đã được gia hạn +30 ngày.`
        });
        await fetchSubscriptionData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Lỗi mô phỏng thanh toán.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setSimulating(false);
    }
  }

  const isActive = subData?.subscriptionStatus;
  const daysLeft = subData?.daysLeft || 0;
  const isAdmin = subData?.isAdmin;
  const expiryDateFormatted = subData?.subscriptionExpiry
    ? new Date(subData.subscriptionExpiry).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0B0E14',
      color: '#E9E6E7',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px 64px 16px',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Background Subtle Geometric Grid Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Top Header Navigation */}
      <header style={{
        width: '100%',
        maxWidth: '1040px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '20px',
        marginBottom: '28px',
        borderBottom: '1px solid #1A202C',
        zIndex: 1
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
            color: '#0B0E14',
            fontWeight: '900',
            fontSize: '13px',
            letterSpacing: '2px',
            padding: '5px 12px',
            borderRadius: '2px'
          }}>
            TRADEWH
          </div>
          <span style={{ fontSize: '12px', color: '#6B7C98', fontWeight: '600', letterSpacing: '1px' }}>
            TERMINAL // BILLING
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* User Identifier */}
          {(subData?.email || user?.email) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              background: '#121620',
              border: '1px solid #222938',
              borderRadius: '2px',
              fontSize: '12px',
              color: '#E9E6E7'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive ? '#22C55E' : '#EF4444' }} />
              <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subData?.email || user?.email}
              </span>
            </div>
          )}

          {/* Return To Terminal */}
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: '#121620',
              color: '#E9E6E7',
              border: '1px solid #222938',
              borderRadius: '2px',
              fontSize: '12px',
              fontWeight: '600',
              textDecoration: 'none'
            }}
          >
            <span>📊</span>
            <span>Terminal</span>
          </Link>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#F87171',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '2px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ width: '100%', maxWidth: '1040px', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Global Notification Banner */}
        {message && (
          <div style={{
            width: '100%',
            maxWidth: '820px',
            padding: '12px 18px',
            marginBottom: '24px',
            borderRadius: '2px',
            fontSize: '13px',
            lineHeight: '1.5',
            backgroundColor: message.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            border: `1px solid ${message.type === 'success' ? '#22C55E' : message.type === 'error' ? '#EF4444' : '#3B82F6'}`,
            color: message.type === 'success' ? '#4ADE80' : message.type === 'error' ? '#F87171' : '#93C5FD',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '13px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* User Current Membership Status Banner */}
        {subData && (
          <div style={{
            width: '100%',
            maxWidth: '820px',
            background: '#121620',
            border: '1px solid #222938',
            borderRadius: '2px',
            padding: '18px 24px',
            marginBottom: '28px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: isActive ? 'rgba(203, 177, 147, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${isActive ? '#CBB193' : '#EF4444'}`,
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                {isAdmin ? '👑' : isActive ? '💎' : '⚠️'}
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Tài Khoản: <strong style={{ color: '#E9E6E7' }}>{subData.email}</strong>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#E9E6E7', marginTop: '2px' }}>
                  {isAdmin
                    ? 'QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN ACCESS)'
                    : isActive
                    ? `GÓI PRO ĐANG HOẠT ĐỘNG // CÒN ${daysLeft} NGÀY`
                    : 'CHƯA KÍCH HOẠT GÓI HOẶC ĐÃ HẾT HẠN'}
                </div>
                {expiryDateFormatted && !isAdmin && (
                  <div style={{ fontSize: '12px', color: '#A0AEC0', marginTop: '2px' }}>
                    Hạn sử dụng đến: <span style={{ color: '#00E5FF', fontWeight: '600' }}>{expiryDateFormatted}</span>
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
                    padding: '9px 18px',
                    background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                    color: '#0B0E14',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '12px',
                    fontWeight: '800',
                    letterSpacing: '0.5px',
                    textDecoration: 'none',
                    boxShadow: '0 2px 10px rgba(203, 177, 147, 0.2)'
                  }}
                >
                  <span>MỞ BIỂU ĐỒ ↗</span>
                </Link>
              ) : (
                <span style={{
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#F87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '2px',
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Inactive
                </span>
              )}
            </div>
          </div>
        )}

        {/* SECTION: PRICING & PAYMENT CHECKOUT (NOWPAYMENTS DIRECT USDT) */}
        <div style={{ width: '100%', maxWidth: '820px', marginBottom: '40px' }}>
          
          <div style={{
            background: 'linear-gradient(180deg, #131722 0%, #0D1018 100%)',
            border: '1px solid #222938',
            borderRadius: '2px',
            padding: '32px 28px',
            position: 'relative'
          }}>
            
            {/* Architectural Tags Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#CBB193',
                  background: 'rgba(203, 177, 147, 0.1)',
                  border: '1px solid rgba(203, 177, 147, 0.3)',
                  padding: '3px 8px',
                  borderRadius: '2px',
                  letterSpacing: '1px'
                }}>
                  TIER: PRO TERMINAL
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#00E5FF',
                  background: 'rgba(0, 229, 255, 0.1)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  padding: '3px 8px',
                  borderRadius: '2px',
                  letterSpacing: '1px'
                }}>
                  MANUAL RENEWAL (30 NGÀY)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#26A17B', background: 'rgba(38, 161, 123, 0.15)', border: '1px solid rgba(38, 161, 123, 0.4)', padding: '3px 8px', borderRadius: '2px', fontWeight: 'bold' }}>
                  ₮ USDT (Tether)
                </span>
              </div>
            </div>

            {/* Price Selection Options (Test $1 vs Standard $15) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                1. Chọn Mức Phí Gói:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                
                {/* Option 1: Test Mode ($1 BSC / $2 ETH) */}
                <div
                  onClick={() => setSelectedPrice(selectedNetwork === 'eth' ? '2.00' : '1.00')}
                  style={{
                    padding: '14px 16px',
                    background: (selectedPrice === '1.00' || selectedPrice === '2.00') ? 'rgba(203, 177, 147, 0.12)' : '#0E1118',
                    border: `1px solid ${(selectedPrice === '1.00' || selectedPrice === '2.00') ? '#CBB193' : '#222938'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '13px', color: (selectedPrice === '1.00' || selectedPrice === '2.00') ? '#CBB193' : '#E9E6E7' }}>
                      🧪 Gói Test Thử Nghiệm
                    </strong>
                    <span style={{ fontSize: '10px', color: '#4ADE80', fontWeight: '700', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 6px', borderRadius: '2px' }}>
                      TEST MODE
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '24px', fontWeight: '900', color: '#FFFFFF' }}>
                      ${selectedNetwork === 'eth' ? '2.00' : '1.00'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#6B7C98' }}>USD / 30 Ngày</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#A0AEC0', display: 'block', marginTop: '2px' }}>
                    {selectedNetwork === 'eth' ? '≈ 2.00 USDT (Tối thiểu $2 mạng ETH ERC-20)' : '≈ 1.00 USDT (Kích hoạt 30 ngày)'}
                  </span>
                </div>

                {/* Option 2: Standard 15 USD */}
                <div
                  onClick={() => setSelectedPrice('15.00')}
                  style={{
                    padding: '14px 16px',
                    background: selectedPrice === '15.00' ? 'rgba(203, 177, 147, 0.12)' : '#0E1118',
                    border: `1px solid ${selectedPrice === '15.00' ? '#CBB193' : '#222938'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '13px', color: selectedPrice === '15.00' ? '#CBB193' : '#E9E6E7' }}>
                      💎 Gói Pro Chuẩn
                    </strong>
                    <span style={{ fontSize: '10px', color: '#CBB193', fontWeight: '700', background: 'rgba(203, 177, 147, 0.15)', padding: '2px 6px', borderRadius: '2px' }}>
                      OFFICIAL
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '24px', fontWeight: '900', color: '#FFFFFF' }}>$15.00</span>
                    <span style={{ fontSize: '11px', color: '#6B7C98' }}>USD / 30 Ngày</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#A0AEC0', display: 'block', marginTop: '2px' }}>
                    ≈ 15.00 USDT (Kích hoạt 30 ngày)
                  </span>
                </div>

              </div>
            </div>

            {/* Network Selection (Cố định 2 mạng BSC và ETH) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                2. Chọn Mạng Blockchain (USDT):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                
                {/* Network 1: BSC (BEP-20) */}
                <div
                  onClick={() => {
                    setSelectedNetwork('bsc');
                    if (selectedPrice === '2.00') setSelectedPrice('1.00');
                  }}
                  style={{
                    padding: '16px',
                    background: selectedNetwork === 'bsc' ? 'rgba(240, 185, 11, 0.08)' : '#0E1118',
                    border: `1.5px solid ${selectedNetwork === 'bsc' ? '#F0B90B' : '#222938'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🟡</span>
                      <strong style={{ fontSize: '14px', color: selectedNetwork === 'bsc' ? '#F0B90B' : '#E9E6E7' }}>
                        BNB Smart Chain (BSC)
                      </strong>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: '#0B0E14',
                      background: '#F0B90B',
                      padding: '2px 6px',
                      borderRadius: '2px'
                    }}>
                      BEP-20
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#A0AEC0', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                    Phí gas cực rẻ (~$0.05) • Xác nhận nhanh trong 3 giây.
                  </p>
                  <div style={{ fontSize: '11px', color: '#4ADE80', fontWeight: '600' }}>
                    ⚡ Khuyên dùng (Phù hợp test $1.00 USDT)
                  </div>
                </div>

                {/* Network 2: Ethereum (ERC-20) */}
                <div
                  onClick={() => {
                    setSelectedNetwork('eth');
                    if (selectedPrice === '1.00') setSelectedPrice('2.00');
                  }}
                  style={{
                    padding: '16px',
                    background: selectedNetwork === 'eth' ? 'rgba(98, 126, 234, 0.08)' : '#0E1118',
                    border: `1.5px solid ${selectedNetwork === 'eth' ? '#627EEA' : '#222938'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🔵</span>
                      <strong style={{ fontSize: '14px', color: selectedNetwork === 'eth' ? '#627EEA' : '#E9E6E7' }}>
                        Ethereum Mainnet
                      </strong>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: '#FFFFFF',
                      background: '#627EEA',
                      padding: '2px 6px',
                      borderRadius: '2px'
                    }}>
                      ERC-20
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#A0AEC0', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                    Mạng chính thức Ethereum • Độ bảo mật tối đa.
                  </p>
                  <div style={{ fontSize: '11px', color: '#CBB193', fontWeight: '600' }}>
                    Tối thiểu $2.00 USDT do phí gas ERC-20.
                  </div>
                </div>

              </div>
            </div>

            {/* Active Direct Payment Terminal Widget (Direct QR, Address, Amount) */}
            {paymentInfo && (
              <div style={{
                marginBottom: '28px',
                padding: '24px 20px',
                background: '#0B0E14',
                border: '1.5px solid #00E5FF',
                borderRadius: '2px',
                boxShadow: '0 8px 30px rgba(0, 229, 255, 0.08)'
              }}>
                {/* Payment Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #1E2536' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚡</span>
                    <strong style={{ fontSize: '15px', color: '#00E5FF', letterSpacing: '-0.3px' }}>
                      Hóa Đơn Nạp USDT Mạng {paymentInfo.networkName || (selectedNetwork === 'eth' ? 'ETH (ERC-20)' : 'BSC (BEP-20)')}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#4ADE80', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 8px', borderRadius: '2px', fontWeight: 'bold' }}>
                      WAITING PAYMENT (POLL #{pollCount})
                    </span>
                    {paymentInfo.paymentId && (
                      <span style={{ fontSize: '11px', color: '#6B7C98', fontFamily: 'monospace' }}>
                        ID: #{paymentInfo.paymentId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main QR & Details Layout */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                  
                  {/* Left: Direct QR Code */}
                  {paymentInfo.payAddress && (
                    <div style={{
                      padding: '10px',
                      background: '#FFFFFF',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
                    }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${paymentInfo.payAddress}&margin=2`}
                        alt="USDT Deposit QR"
                        style={{ width: '160px', height: '160px', display: 'block' }}
                      />
                      <span style={{ fontSize: '10px', color: '#0B0E14', fontWeight: 'bold', marginTop: '4px' }}>
                        QUÉT MÃ VÍ USDT
                      </span>
                    </div>
                  )}

                  {/* Right: Amount & Address Copy Fields */}
                  <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    {/* Amount Field */}
                    <div>
                      <span style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Số lượng USDT cần chuyển:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#121620', border: '1px solid #222938', padding: '8px 12px', borderRadius: '2px', marginTop: '4px' }}>
                        <code style={{ fontSize: '16px', fontWeight: 'bold', color: '#CBB193' }}>
                          {paymentInfo.payAmount || paymentInfo.selectedPrice} USDT
                        </code>
                        <button
                          onClick={() => handleCopyText(String(paymentInfo.payAmount || paymentInfo.selectedPrice), 'pay_amount')}
                          style={{
                            padding: '4px 8px',
                            background: copiedKey === 'pay_amount' ? 'rgba(74, 222, 128, 0.2)' : '#1E2536',
                            color: copiedKey === 'pay_amount' ? '#4ADE80' : '#E9E6E7',
                            border: '1px solid #2A3347',
                            borderRadius: '2px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {copiedKey === 'pay_amount' ? '✓ Đã chép' : '📋 Chép Số Tiền'}
                        </button>
                      </div>
                    </div>

                    {/* Address Field */}
                    {paymentInfo.payAddress && (
                      <div>
                        <span style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Địa chỉ ví nhận ({paymentInfo.networkName || 'BSC'}):
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#121620', border: '1px solid #222938', padding: '8px 12px', borderRadius: '2px', marginTop: '4px', gap: '8px' }}>
                          <code style={{ fontSize: '12px', color: '#00E5FF', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {paymentInfo.payAddress}
                          </code>
                          <button
                            onClick={() => handleCopyText(paymentInfo.payAddress, 'pay_addr')}
                            style={{
                              padding: '4px 8px',
                              background: copiedKey === 'pay_addr' ? 'rgba(74, 222, 128, 0.2)' : '#1E2536',
                              color: copiedKey === 'pay_addr' ? '#4ADE80' : '#E9E6E7',
                              border: '1px solid #2A3347',
                              borderRadius: '2px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              flexShrink: 0
                            }}
                          >
                            {copiedKey === 'pay_addr' ? '✓ Đã chép' : '📋 Chép Ví'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#A0AEC0', lineHeight: '1.4' }}>
                      ⚠️ Lưu ý: Chỉ gửi <strong>USDT</strong> qua đúng mạng <strong>{paymentInfo.networkName}</strong>. Hệ thống sẽ tự động bắt giao dịch và kích hoạt tài khoản ngay khi có xác nhận.
                    </div>

                  </div>

                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid #1E2536' }}>
                  <a
                    href={paymentInfo.paymentUrl || paymentInfo.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: '1 1 200px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '11px 18px',
                      background: '#00E5FF',
                      color: '#0B0E14',
                      textDecoration: 'none',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: '800'
                    }}
                  >
                    <span>MỞ TRÊN TRANG NOWPAYMENTS ↗</span>
                  </a>

                  {/* Active Status Sync Button */}
                  <button
                    onClick={handleCheckPaymentStatus}
                    disabled={checkingStatus}
                    style={{
                      flex: '1 1 180px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '11px 18px',
                      background: 'rgba(38, 161, 123, 0.2)',
                      color: '#4ADE80',
                      border: '1px solid #26A17B',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: checkingStatus ? 'not-allowed' : 'pointer'
                    }}
                    title="Kiểm tra trạng thái xác nhận từ NOWPayments và đồng bộ ngay"
                  >
                    <span>{checkingStatus ? '⏳ ĐANG KIỂM TRA...' : '🔄 KIỂM TRA THANH TOÁN (SYNC)'}</span>
                  </button>

                  {/* Dev / Admin Simulation Confirm Button */}
                  <button
                    onClick={handleSimulateConfirm}
                    disabled={simulating}
                    style={{
                      padding: '11px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#E9E6E7',
                      border: '1px solid #252A38',
                      borderRadius: '2px',
                      fontSize: '12px',
                      cursor: simulating ? 'not-allowed' : 'pointer'
                    }}
                    title="Mô phỏng xác nhận thanh toán blockchain để kiểm tra luồng"
                  >
                    {simulating ? 'Đang kích hoạt...' : '⚡ Mô Phỏng Xác Nhận Nhanh (Test)'}
                  </button>
                </div>
              </div>
            )}

            {/* Payment Action Button */}
            <button
              onClick={handleCreatePayment}
              disabled={paying}
              style={{
                width: '100%',
                padding: '16px 24px',
                background: paying
                  ? '#4A4644'
                  : 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                color: '#0B0E14',
                border: 'none',
                borderRadius: '2px',
                fontSize: '14px',
                fontWeight: '900',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                cursor: paying ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 4px 20px rgba(203, 177, 147, 0.2)',
                transition: 'all 0.2s ease'
              }}
            >
              {paying ? (
                <>
                  <span>🔄</span>
                  <span>ĐANG MỞ CỔNG THANH TOÁN NOWPAYMENTS...</span>
                </>
              ) : (
                <>
                  <span>💳</span>
                  <span>
                    THANH TOÁN ${selectedPrice} USDT QUA MẠNG {selectedNetwork === 'eth' ? 'ETH (ERC-20)' : 'BSC (BEP-20)'} ↗
                  </span>
                </>
              )}
            </button>

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#6B7C98' }}>
              <span>🔒 Cổng bảo mật NOWPayments</span>
              <span>•</span>
              <span>⚡ Mạng {selectedNetwork === 'eth' ? 'Ethereum (ERC-20)' : 'BNB Smart Chain (BEP-20)'}</span>
              <span>•</span>
              <span>💬 Hỗ trợ Telegram: <a href="https://t.me/dhieu9b" target="_blank" rel="noopener noreferrer" style={{ color: '#00E5FF', textDecoration: 'none' }}>@dhieu9b</a></span>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW: ADMIN MANAGEMENT CENTER                                             */}
        {/* ========================================================================= */}
        {isAdmin && (
          <div style={{ width: '100%', maxWidth: '820px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* TOOL 1: 1-CLICK RANDOM TRIAL GENERATOR */}
            <div style={{
              background: '#121620',
              border: '1px solid #CBB193',
              borderRadius: '2px',
              padding: '24px 24px',
              boxShadow: '0 0 20px rgba(203, 177, 147, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🎲</span>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#E9E6E7', margin: 0 }}>
                      Tạo Tài Khoản Dùng Thử Ngẫu Nhiên (Admin Generator)
                    </h3>
                    <p style={{ fontSize: '12px', color: '#6B7C98', margin: '2px 0 0 0' }}>
                      Tự động tạo email, mật khẩu ngẫu nhiên kèm thời hạn dùng thử và format sẵn để gửi khách.
                    </p>
                  </div>
                </div>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#0B0E14',
                  background: '#CBB193',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  textTransform: 'uppercase'
                }}>
                  Admin Tool
                </span>
              </div>

              {/* Duration Options */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Thời Hạn Dùng Thử:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
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
                        padding: '6px 12px',
                        background: genDays === item.value && !genCustomDays ? '#CBB193' : '#0B0E14',
                        color: genDays === item.value && !genCustomDays ? '#0B0E14' : '#E9E6E7',
                        border: `1px solid ${genDays === item.value && !genCustomDays ? '#CBB193' : '#222938'}`,
                        borderRadius: '2px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                    <span style={{ fontSize: '11px', color: '#6B7C98' }}>Khác:</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Số ngày"
                      value={genCustomDays}
                      onChange={(e) => setGenCustomDays(e.target.value)}
                      style={{
                        width: '80px',
                        padding: '5px 8px',
                        background: '#0B0E14',
                        border: '1px solid #222938',
                        borderRadius: '2px',
                        color: '#E9E6E7',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Prefix & Note */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Tiền Tố Email:
                  </label>
                  <select
                    value={genPrefix}
                    onChange={(e) => setGenPrefix(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: '#0B0E14',
                      border: '1px solid #222938',
                      borderRadius: '2px',
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Ghi Chú Khách Hàng:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Khách Telegram @alex"
                    value={genNote}
                    onChange={(e) => setGenNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: '#0B0E14',
                      border: '1px solid #222938',
                      borderRadius: '2px',
                      color: '#E9E6E7',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Generate Button */}
              <button
                type="button"
                onClick={handleGenerateTrialAccount}
                disabled={genLoading}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  background: genLoading ? '#4A4644' : 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                  color: '#0B0E14',
                  border: 'none',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: '800',
                  letterSpacing: '0.5px',
                  cursor: genLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {genLoading ? 'ĐANG KHỞI TẠO...' : `⚡ TỰ ĐỘNG TẠO TÀI KHOẢN & MẬT KHẨU (${genCustomDays || genDays} NGÀY)`}
              </button>

              {/* Generated Account Details Result Box */}
              {latestCreatedAccount && (
                <div style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: 'rgba(203, 177, 147, 0.05)',
                  border: '1px solid #CBB193',
                  borderRadius: '2px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#4ADE80' }}>
                      ✓ Đã Tạo Thành Công Tài Khoản!
                    </span>
                    <span style={{ fontSize: '11px', color: '#CBB193' }}>
                      Thời hạn: <strong>{latestCreatedAccount.days} Ngày</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#0B0E14', padding: '12px', borderRadius: '2px', border: '1px solid #222938' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6B7C98' }}>Email:</span>
                      <code style={{ fontSize: '13px', color: '#00E5FF', fontWeight: 'bold' }}>
                        {latestCreatedAccount.email}
                      </code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6B7C98' }}>Mật khẩu:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ fontSize: '13px', color: '#F59E0B', fontWeight: 'bold' }}>
                          {showPassword ? latestCreatedAccount.password : '••••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ background: 'none', border: 'none', color: '#6B7C98', cursor: 'pointer', fontSize: '11px' }}
                        >
                          {showPassword ? 'Ẩn' : 'Hiện'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyText(formatFullAccountMessage(latestCreatedAccount), 'full')}
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      padding: '9px 14px',
                      background: copiedKey === 'full' ? '#22C55E' : '#1A202C',
                      color: '#FFFFFF',
                      border: `1px solid ${copiedKey === 'full' ? '#22C55E' : '#CBB193'}`,
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {copiedKey === 'full' ? '✓ ĐÃ SAO CHÉP TOÀN BỘ NỘI DUNG GỬI KHÁCH!' : '📋 SAO CHÉP TOÀN BỘ THÔNG TIN (ĐỂ GỬI KHÁCH HÀNG)'}
                  </button>
                </div>
              )}

              {/* Recent Trials List */}
              {recentTrials.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Các Tài Khoản Đã Tạo Gần Đây ({recentTrials.length}):
                    </span>
                    <button
                      onClick={handleClearHistory}
                      style={{ background: 'none', border: 'none', color: '#6B7C98', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Xóa lịch sử
                    </button>
                  </div>

                  <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#0B0E14', border: '1px solid #222938', borderRadius: '2px' }}>
                    {recentTrials.map((acc, idx) => (
                      <div
                        key={acc.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderBottom: idx < recentTrials.length - 1 ? '1px solid #1A202C' : 'none',
                          fontSize: '12px'
                        }}
                      >
                        <div>
                          <span style={{ color: '#00E5FF', fontWeight: '600' }}>{acc.email}</span>
                          <span style={{ color: '#6B7C98', margin: '0 6px' }}>•</span>
                          <span style={{ color: '#F59E0B' }}>{acc.password}</span>
                          <span style={{ color: '#6B7C98', fontSize: '11px', marginLeft: '6px' }}>({acc.days}d)</span>
                        </div>
                        <button
                          onClick={() => handleCopyText(formatFullAccountMessage(acc), `hist-${idx}`)}
                          style={{
                            padding: '3px 8px',
                            background: copiedKey === `hist-${idx}` ? 'rgba(34, 197, 94, 0.2)' : '#1A202C',
                            color: copiedKey === `hist-${idx}` ? '#4ADE80' : '#E9E6E7',
                            border: '1px solid #222938',
                            borderRadius: '2px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          {copiedKey === `hist-${idx}` ? '✓ Đã chép' : '📋 Chép'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* TOOL 2: QUICK GRANT TRIAL TO REGISTERED EMAIL */}
            <div style={{
              background: '#121620',
              border: '1px solid #222938',
              borderRadius: '2px',
              padding: '20px 24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>🎁</span>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#E9E6E7', margin: 0 }}>
                  Cấp Quyền Dùng Thử Cho Email Khách Đã Đăng Ký
                </h4>
              </div>
              <p style={{ fontSize: '12px', color: '#6B7C98', margin: '0 0 14px 0' }}>
                Mở quyền trực tiếp cho email người dùng đã tạo trên hệ thống.
              </p>

              {adminMsg && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '2px',
                  fontSize: '12px',
                  marginBottom: '10px',
                  backgroundColor: adminMsg.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${adminMsg.type === 'success' ? '#22C55E' : '#EF4444'}`,
                  color: adminMsg.type === 'success' ? '#4ADE80' : '#F87171'
                }}>
                  {adminMsg.text}
                </div>
              )}

              <form onSubmit={handleAdminGrantTrial} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  placeholder="Email người dùng (vd: user@gmail.com)"
                  value={adminTargetEmail}
                  onChange={(e) => setAdminTargetEmail(e.target.value)}
                  required
                  style={{
                    flex: '2 1 200px',
                    padding: '8px 12px',
                    background: '#0B0E14',
                    border: '1px solid #222938',
                    borderRadius: '2px',
                    color: '#E9E6E7',
                    fontSize: '12px'
                  }}
                />
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={adminDays}
                  onChange={(e) => setAdminDays(e.target.value)}
                  placeholder="Số ngày"
                  style={{
                    width: '90px',
                    padding: '8px 12px',
                    background: '#0B0E14',
                    border: '1px solid #222938',
                    borderRadius: '2px',
                    color: '#E9E6E7',
                    fontSize: '12px'
                  }}
                />
                <button
                  type="submit"
                  disabled={adminLoading}
                  style={{
                    flex: '1 1 120px',
                    padding: '8px 14px',
                    background: '#252A38',
                    color: '#FFFFFF',
                    border: '1px solid #3A4359',
                    borderRadius: '2px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: adminLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {adminLoading ? 'Đang cấp...' : `🎁 Cấp ${adminDays} Ngày`}
                </button>
              </form>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0B0E14', color: '#CBB193', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        LOADING TRADEWH SUBSCRIPTION TERMINAL...
      </div>
    }>
      <SubscriptionContent />
    </Suspense>
  );
}
