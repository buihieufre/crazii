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

  // Network & Price Selection States (Official Plan: $45.00 USDT)
  const [selectedNetwork, setSelectedNetwork] = useState('bsc'); // 'bsc' (BEP-20) or 'eth' (ERC-20)
  const [selectedPrice, setSelectedPrice] = useState('45.00'); // Gói chính thức duy nhất: $45.00 USD

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

  // Cancel Subscription Dialog States
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellingSub, setCancellingSub] = useState(false);
  const [cancelTargetEmail, setCancelTargetEmail] = useState(null);
  const [cancelError, setCancelError] = useState(null);

  // Retrieve session token from localStorage
  function getSessionToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
  }

  // Handle Logout
  function handleLogout() {
    try {
      const supabase = createSupabaseClient();
      supabase.auth.signOut().catch(() => { });
    } catch (e) { }
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
        if (data.isActive || data.isAdmin) {
          try {
            localStorage.removeItem('crazii_last_payment_order_id');
          } catch (e) { }
          setMessage(prev => {
            if (prev?.type === 'info' && (prev?.text?.includes('Đang chờ nhận tiền') || prev?.text?.includes('xác nhận giao dịch'))) {
              return null;
            }
            return prev;
          });
        }
        try {
          const raw = localStorage.getItem('crazii_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.subscriptionStatus = Boolean(data.isActive);
            parsed.subscription_status = Boolean(data.isActive);
            parsed.subscriptionExpiry = data.subscriptionExpiry || null;
            parsed.subscription_expiry = data.subscriptionExpiry || null;
            if (data.isAdmin) parsed.role = 'admin';
            localStorage.setItem('crazii_user', JSON.stringify(parsed));
          }
        } catch (e) { }
      }
    } catch (e) {
      console.error('Failed to fetch subscription status:', e);
    } finally {
      setLoading(false);
    }
  }

  // Handle Cancel Subscription Execution
  async function handleCancelSubscription(targetEmail = null) {
    const token = getSessionToken();
    if (!token) {
      router.push('/?auth=login');
      return;
    }

    setCancellingSub(true);
    setCancelError(null);

    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetEmail: targetEmail || undefined
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsCancelModalOpen(false);
        setCancelTargetEmail(null);
        setMessage({
          type: 'success',
          text: data.message || '🎉 Đã hủy gói cước thành công. Tài khoản đã chuyển về trạng thái Chưa kích hoạt.'
        });
        await fetchSubscriptionData();
      } else {
        setCancelError(data.message || 'Không thể hủy gói cước. Vui lòng thử lại sau.');
      }
    } catch (err) {
      setCancelError('Lỗi kết nối khi hủy gói cước: ' + err.message);
    } finally {
      setCancellingSub(false);
    }
  }

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'TRADEWH';
    }
    try {
      const rawUser = localStorage.getItem('crazii_user');
      if (rawUser) {
        setUser(JSON.parse(rawUser));
      }
      const savedTrials = localStorage.getItem('tradewh_recent_trials');
      if (savedTrials) {
        setRecentTrials(JSON.parse(savedTrials));
      }
    } catch (e) { }
    fetchSubscriptionData();
  }, []);

  // Handle auto query check if returned from NOWPayments payment gateway
  useEffect(() => {
    // If account is already active or admin, clear old pending orders from localStorage and exit
    if (subData?.isActive || subData?.isAdmin) {
      try {
        localStorage.removeItem('crazii_last_payment_order_id');
      } catch (e) { }
      setMessage(prev => {
        if (prev?.type === 'info' && (prev?.text?.includes('Đang chờ nhận tiền') || prev?.text?.includes('xác nhận giao dịch'))) {
          return null;
        }
        return prev;
      });
      return;
    }

    let targetOrderId = queryOrderId || queryNPId || (searchParams ? searchParams.get('paymentId') : null) || (searchParams ? searchParams.get('payment_id') : null);
    if (!targetOrderId) {
      try {
        const savedOrderId = localStorage.getItem('crazii_last_payment_order_id');
        if (savedOrderId) targetOrderId = savedOrderId;
      } catch (e) { }
    }

    if (queryStatus === 'success' || targetOrderId) {
      if (targetOrderId) {
        setMessage({
          type: 'info',
          text: '🔄 Đang xác nhận giao dịch thanh toán từ NOWPayments...'
        });

        // Use /api/payment/sync — no auth required, directly queries NOWPayments
        fetch('/api/payment/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: targetOrderId })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && (data.activated || data.alreadyProcessed)) {
              try {
                localStorage.removeItem('crazii_last_payment_order_id');
                const stored = localStorage.getItem('crazii_user');
                if (stored) {
                  const parsed = JSON.parse(stored);
                  parsed.subscriptionStatus = true;
                  parsed.subscription_status = true;
                  if (data.subscriptionExpiry || data.order?.subscription_expiry) {
                    parsed.subscriptionExpiry = data.subscriptionExpiry || data.order?.subscription_expiry;
                    parsed.subscription_expiry = data.subscriptionExpiry || data.order?.subscription_expiry;
                  }
                  localStorage.setItem('crazii_user', JSON.stringify(parsed));
                }
              } catch (e) { }

              setMessage({
                type: 'success',
                text: '🎉 Giao dịch thành công! Gói TRADEWH Pro (30 Ngày) đã được kích hoạt (+30 ngày). Đang chuyển hướng sang biểu đồ...'
              });
              fetchSubscriptionData();

              setTimeout(() => {
                router.push('/');
              }, 1800);
            } else {
              if (subData?.isActive || subData?.isAdmin) {
                try { localStorage.removeItem('crazii_last_payment_order_id'); } catch (e) { }
                setMessage(null);
              } else {
                setMessage({
                  type: 'info',
                  text: data.message || 'Giao dịch đang chờ xác nhận từ mạng blockchain. Vui lòng đợi trong giây lát...'
                });
              }
              fetchSubscriptionData();
            }
          })
          .catch(() => {
            fetchSubscriptionData();
          });
      } else {
        fetchSubscriptionData();
      }
    } else if (queryStatus === 'cancel') {
      if (!subData?.isActive && !subData?.isAdmin) {
        setMessage({
          type: 'info',
          text: 'Đơn hàng thanh toán đã bị tạm dừng hoặc hủy. Bạn có thể tiến hành tạo lại bất kỳ lúc nào.'
        });
      }
    }
  }, [queryStatus, queryOrderId, queryNPId, subData?.isActive, subData?.isAdmin]);


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
        } catch (e) { }
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
      } catch (e) { }
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
    const effectivePrice = '45.00';

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
        if (data.orderId) {
          try {
            localStorage.setItem('crazii_last_payment_order_id', data.orderId);
          } catch (e) { }
        }
        setPaymentInfo({
          ...data,
          networkName,
          selectedPrice: data.amount || effectivePrice
        });

        setMessage({
          type: 'info',
          text: `Đang chuyển sang cổng thanh toán NOWPayments USDT (${networkName}). Sau khi chuyển khoản xong, gói cước sẽ tự động kích hoạt +30 ngày!`
        });

        // Polling status every 4 seconds (up to 20 minutes)
        let count = 0;
        const interval = setInterval(async () => {
          count++;
          setPollCount(count);
          if (count > 300) {
            clearInterval(interval);
            return;
          }

          if (data.orderId) {
            try {
              // Use /api/payment/sync: no auth required, directly queries NOWPayments
              const syncRes = await fetch('/api/payment/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: data.orderId })
              });
              const syncData = await syncRes.json();
              if (syncData.activated || syncData.alreadyProcessed) {
                clearInterval(interval);
                try {
                  localStorage.removeItem('crazii_last_payment_order_id');
                  const stored = localStorage.getItem('crazii_user');
                  if (stored) {
                    const parsed = JSON.parse(stored);
                    parsed.subscriptionStatus = true;
                    parsed.subscription_status = true;
                    if (syncData.subscriptionExpiry || syncData.order?.subscription_expiry) {
                      parsed.subscriptionExpiry = syncData.subscriptionExpiry || syncData.order?.subscription_expiry;
                      parsed.subscription_expiry = syncData.subscriptionExpiry || syncData.order?.subscription_expiry;
                    }
                    localStorage.setItem('crazii_user', JSON.stringify(parsed));
                  }
                } catch (e) { }

                setMessage({
                  type: 'success',
                  text: '🎉 Thanh toán thành công! Gói TRADEWH Pro (30 Ngày) đã được kích hoạt (+30 ngày). Đang chuyển hướng sang biểu đồ...'
                });
                await fetchSubscriptionData();

                setTimeout(() => {
                  router.push('/');
                }, 1800);
                return;
              }
            } catch (e) { }
          }

          await fetchSubscriptionData();
        }, 4000);

        // Chuyển hướng thanh toán trong cùng tab để tránh duplicate tab
        setTimeout(() => {
          window.location.href = url;
        }, 300);
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

  // Manual sync check — calls /api/payment/sync directly
  async function handleCheckPaymentStatus() {
    const orderId = paymentInfo?.orderId || (() => {
      try { return localStorage.getItem('crazii_last_payment_order_id'); } catch { return null; }
    })();
    if (!orderId) return;
    setCheckingStatus(true);
    setMessage(null);

    try {
      const res = await fetch('/api/payment/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (data.success && (data.activated || data.order?.status === 'finished' || data.order?.status === 'confirmed')) {
        try {
          const stored = localStorage.getItem('crazii_user');
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.subscriptionStatus = true;
            parsed.subscription_status = true;
            if (data.subscriptionExpiry || data.order?.subscription_expiry) {
              parsed.subscriptionExpiry = data.subscriptionExpiry || data.order?.subscription_expiry;
              parsed.subscription_expiry = data.subscriptionExpiry || data.order?.subscription_expiry;
            }
            localStorage.setItem('crazii_user', JSON.stringify(parsed));
          }
        } catch (e) { }

        setMessage({
          type: 'success',
          text: `🎉 Xác nhận thanh toán thành công! Gói TRADEWH Pro (30 Ngày) đã kích hoạt +30 ngày. Đang chuyển hướng sang biểu đồ...`
        });
        await fetchSubscriptionData();

        setTimeout(() => {
          router.push('/');
        }, 1800);
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
        try {
          const stored = localStorage.getItem('crazii_user');
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.subscriptionStatus = true;
            parsed.subscription_status = true;
            if (data.subscriptionExpiry) {
              parsed.subscriptionExpiry = data.subscriptionExpiry;
              parsed.subscription_expiry = data.subscriptionExpiry;
            }
            localStorage.setItem('crazii_user', JSON.stringify(parsed));
          }
        } catch (e) { }

        setMessage({
          type: 'success',
          text: `⚡ Đã mô phỏng thanh toán thành công! Gói TRADEWH Pro (30 Ngày) đã được gia hạn +30 ngày. Đang chuyển hướng sang biểu đồ...`
        });
        await fetchSubscriptionData();

        setTimeout(() => {
          router.push('/');
        }, 1800);
      } else {
        setMessage({ type: 'error', text: data.message || 'Lỗi mô phỏng thanh toán.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setSimulating(false);
    }
  }

  const isAdmin = Boolean(
    subData?.isAdmin ||
    user?.role === 'admin' ||
    user?.isAdmin ||
    (user?.email && ['dhieu9b@gmail.com', 'buidinhhieu9b@gmail.com'].includes((user.email || '').toLowerCase().trim()))
  );
  const isActive = Boolean(
    isAdmin ||
    subData?.subscriptionStatus ||
    (subData?.subscriptionExpiry && new Date(subData.subscriptionExpiry).getTime() > Date.now())
  );
  const daysLeft = subData?.daysLeft || 0;

  // Automatically dismiss lingering pending payment messages and clear pending order for active subscribers or admins
  useEffect(() => {
    if (isActive || isAdmin) {
      try {
        localStorage.removeItem('crazii_last_payment_order_id');
      } catch (e) { }
      setMessage(prev => {
        if (prev?.type === 'info' && (prev?.text?.includes('Đang chờ nhận tiền') || prev?.text?.includes('xác nhận giao dịch'))) {
          return null;
        }
        return prev;
      });
    }
  }, [isActive, isAdmin]);

  const expiryRaw = subData?.subscriptionExpiry || user?.subscription_expiry || user?.subscriptionExpiry;
  const expiryTime = expiryRaw ? new Date(expiryRaw).getTime() : 0;
  const isExpired = Boolean(!isAdmin && !isActive && (subData?.isExpired || (expiryTime > 0 && expiryTime <= Date.now())));
  const isNotActivated = Boolean(!isAdmin && !isActive && !isExpired);

  const expiryDateFormatted = expiryTime > 0
    ? new Date(expiryTime).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
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
        <Link href={isActive ? "/" : "/subscription"} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            THANH TOÁN
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

          {/* Return To Terminal - Chỉ xuất hiện khi đã thanh toán thành công */}
          {isActive && (
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
          )}

          {/* Quản Trị Hệ Thống (Admin Dashboard) Button - CHỈ QUẢN TRỊ VIÊN MỚI THẤY */}
          {isAdmin && (
            <Link
              href="/admin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                background: 'linear-gradient(135deg, rgba(203, 177, 147, 0.22) 0%, rgba(171, 151, 140, 0.1) 100%)',
                color: '#CBB193',
                border: '1px solid rgba(203, 177, 147, 0.5)',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: '700',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(203, 177, 147, 0.15)'
              }}
              title="Mở Bảng Quản Trị Hệ Thống (Admin Dashboard)"
            >
              <span>👑</span>
              <span>Bảng Quản Trị (Admin) ↗</span>
            </Link>
          )}

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
        {message && (!isActive || message.type !== 'info' || (!message.text.includes('Đang chờ nhận tiền') && !message.text.includes('xác nhận giao dịch'))) && (
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

        {/* ========================================================================= */}
        {/* VIEW: ACTIVE MEMBERSHIP DASHBOARD (WHEN SUBSCRIPTION IS CONFIRMED/ACTIVE) */}
        {/* ========================================================================= */}
        {isActive ? (
          <div style={{
            width: '100%',
            maxWidth: '820px',
            background: 'linear-gradient(180deg, #131A24 0%, #0D1117 100%)',
            border: '1px solid #283548',
            borderRadius: '4px',
            padding: '40px 32px',
            marginBottom: '36px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top Glow Accent Bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, #22C55E 0%, #00E5FF 50%, #CBB193 100%)'
            }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

              {/* Status Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                borderRadius: '20px',
                marginBottom: '16px'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#4ADE80', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  GÓI ĐĂNG KÝ ĐANG HOẠT ĐỘNG (ACTIVE)
                </span>
              </div>

              {/* Title & Plan Name */}
              <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#FFFFFF', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>
                {isAdmin ? '👑 GÓI QUẢN TRỊ VIÊN HỆ THỐNG' : '💎 GÓI PRO TIÊU CHUẨN (1 THÁNG)'}
              </h2>
              <p style={{ fontSize: '14px', color: '#8899A6', margin: '0 0 28px 0', maxWidth: '560px', lineHeight: '1.6' }}>
                Tài khoản <strong style={{ color: '#E9E6E7' }}>{subData?.email || user?.email}</strong> đã được kích hoạt thành công. Đầy đủ quyền hạn phân tích thị trường cao cấp.
              </p>

              {/* Details Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                width: '100%',
                marginBottom: '28px'
              }}>
                {/* Metric 1: Hạn dùng */}
                <div style={{
                  background: '#0B0E14',
                  border: '1px solid #1E2638',
                  borderRadius: '4px',
                  padding: '16px 20px',
                  textAlign: 'left'
                }}>
                  <div style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    📅 Ngày Hết Hạn
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#00E5FF' }}>
                    {expiryDateFormatted || (isAdmin ? 'Vô Thời Hạn (Admin)' : 'Đang cập nhật')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8899A6', marginTop: '2px' }}>
                    Múi giờ hệ thống (Việt Nam UTC+7)
                  </div>
                </div>

                {/* Metric 2: Thời gian còn lại */}
                <div style={{
                  background: '#0B0E14',
                  border: '1px solid #1E2638',
                  borderRadius: '4px',
                  padding: '16px 20px',
                  textAlign: 'left'
                }}>
                  <div style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    ⏳ Thời Gian Còn Lại
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#4ADE80' }}>
                    {isAdmin ? 'Toàn quyền vĩnh viễn' : `Còn ${daysLeft} Ngày`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8899A6', marginTop: '2px' }}>
                    Trạng thái kết nối sẵn sàng 24/7
                  </div>
                </div>

                {/* Metric 3: Quyền hạn kích hoạt */}
                <div style={{
                  background: '#0B0E14',
                  border: '1px solid #1E2638',
                  borderRadius: '4px',
                  padding: '16px 20px',
                  textAlign: 'left'
                }}>
                  <div style={{ fontSize: '11px', color: '#6B7C98', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    ⚡ Quyền Hạn
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#CBB193' }}>
                    Full Pro Features
                  </div>
                  <div style={{ fontSize: '11px', color: '#8899A6', marginTop: '2px' }}>
                    4 Biểu đồ + WebSocket Sub-second
                  </div>
                </div>
              </div>

              {/* Action: Big Button to Chart */}
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  maxWidth: '380px',
                  padding: '16px 28px',
                  background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                  color: '#0B0E14',
                  borderRadius: '3px',
                  fontSize: '15px',
                  fontWeight: '900',
                  letterSpacing: '1px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 24px rgba(203, 177, 147, 0.3)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <span>🚀</span>
                <span>MỞ BIỂU ĐỒ TERMINAL (CHART) ↗</span>
              </Link>

              {isAdmin && (
                <Link
                  href="/admin"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    width: '100%',
                    maxWidth: '380px',
                    padding: '14px 28px',
                    background: '#121827',
                    border: '1px solid #CBB193',
                    color: '#CBB193',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontWeight: '800',
                    textDecoration: 'none',
                    marginTop: '12px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>👑</span>
                  <span>MỞ TRANG QUẢN TRỊ (ADMIN DASHBOARD) ↗</span>
                </Link>
              )}

              <p style={{ fontSize: '12px', color: '#6B7C98', marginTop: '16px', marginBottom: 0 }}>
                💡 Gói cước của bạn đã được xác nhận. Các gói cước mua mới tự động ẩn để tránh nhầm lẫn.
              </p>
            </div>
          </div>
        ) : (
          /* User Current Membership Status Banner (Clearly Differentiated: ĐÃ HẾT HẠN vs CHƯA KÍCH HOẠT) */
          subData && (
            isExpired ? (
              /* CASE 1: ĐÃ HẾT HẠN (Previously had subscription, now expired) */
              <div style={{
                width: '100%',
                maxWidth: '820px',
                background: '#121620',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                borderRadius: '2px',
                padding: '18px 24px',
                marginBottom: '28px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid #EF4444',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    ⏳
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#8899A6', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Tài Khoản: <strong style={{ color: '#E9E6E7' }}>{subData?.email || user?.email}</strong>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#EF4444', marginTop: '2px', letterSpacing: '0.3px' }}>
                      GÓI CƯỚC ĐÃ HẾT HẠN
                    </div>
                    <div style={{ fontSize: '12px', color: '#CBD5E1', marginTop: '2px' }}>
                      {expiryDateFormatted ? (
                        <>Gói cước đã hết hạn vào ngày <strong style={{ color: '#F87171' }}>{expiryDateFormatted}</strong>. Vui lòng gia hạn gói bên dưới để tiếp tục truy cập biểu đồ.</>
                      ) : (
                        'Gói cước của bạn đã hết hạn. Vui lòng chọn gói cước bên dưới để gia hạn quyền truy cập biểu đồ phân tích.'
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{
                    padding: '6px 14px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    borderRadius: '2px',
                    fontSize: '11px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    🔴 ĐÃ HẾT HẠN
                  </span>
                </div>
              </div>
            ) : (
              /* CASE 2: CHƯA KÍCH HOẠT (Never had subscription or never activated) */
              <div style={{
                width: '100%',
                maxWidth: '820px',
                background: '#121620',
                border: '1px solid #283244',
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
                    width: '42px',
                    height: '42px',
                    background: 'rgba(203, 177, 147, 0.1)',
                    border: '1px solid #CBB193',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    🔒
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#8899A6', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Tài Khoản: <strong style={{ color: '#E9E6E7' }}>{subData?.email || user?.email}</strong>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#CBB193', marginTop: '2px', letterSpacing: '0.3px' }}>
                      CHƯA KÍCH HOẠT GÓI CƯỚC
                    </div>
                    <div style={{ fontSize: '12px', color: '#A0AEC0', marginTop: '2px' }}>
                      Tài khoản chưa từng đăng ký gói cước. Vui lòng chọn gói cước bên dưới để kích hoạt quyền truy cập biểu đồ phân tích.
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{
                    padding: '6px 14px',
                    background: 'rgba(203, 177, 147, 0.12)',
                    color: '#CBB193',
                    border: '1px solid rgba(203, 177, 147, 0.35)',
                    borderRadius: '2px',
                    fontSize: '11px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ⚪ CHƯA KÍCH HOẠT
                  </span>
                </div>
              </div>
            )
          )
        )}

        {/* SECTION: PRICING & PAYMENT CHECKOUT (NOWPAYMENTS DIRECT USDT) - ONLY SHOWN WHEN INACTIVE */}
        {!isActive && (
          <div style={{ width: '100%', maxWidth: '820px', marginBottom: '40px' }}>

            <div style={{
              background: 'linear-gradient(180deg, #131722 0%, #0D1018 100%)',
              border: '1px solid #222938',
              borderRadius: '2px',
              padding: '32px 28px',
              position: 'relative'
            }}>

              {/* Single Official Subscription Plan Card */}
              <div style={{ marginBottom: '20px' }}>
                <div
                  style={{
                    padding: '20px 24px',
                    background: 'rgba(203, 177, 147, 0.08)',
                    border: '1.5px solid #CBB193',
                    borderRadius: '2px',
                    boxShadow: '0 4px 20px rgba(203, 177, 147, 0.08)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>💎</span>
                      <strong style={{ fontSize: '16px', color: '#CBB193', letterSpacing: '0.5px' }}>
                        Gói TRADEWH Pro (30 Ngày)
                      </strong>
                    </div>
                    <span style={{ fontSize: '10px', color: '#CBB193', fontWeight: '800', background: 'rgba(203, 177, 147, 0.15)', border: '1px solid #CBB193', padding: '3px 8px', borderRadius: '2px' }}>
                      GÓI CHÍNH THỨC DUY NHẤT
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '32px', fontWeight: '900', color: '#FFFFFF', fontFamily: 'JetBrains Mono, monospace' }}>
                      $45.00
                    </span>
                    <span style={{ fontSize: '13px', color: '#CBB193', fontWeight: '600' }}>
                      USDT / 30 Ngày
                    </span>
                  </div>

                  <p style={{ fontSize: '12.5px', color: '#A0AEC0', margin: '0 0 12px 0', lineHeight: '1.5' }}>
                    Toàn quyền truy cập TRADEWH, full hệ thống tín hiệu chỉ báo chuyên sâu (KSI, KCS, Diamond, MA30, MA200, PIVOT, KCB, Màu nến) và tính năng phân tích đa màn hình.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11.5px', color: '#E9E6E7' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✅ <span>30 ngày truy cập không giới hạn</span></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✅ <span>Toàn bộ thị trường Vàng, Dầu, Crypto, Forex, Cổ phiếu</span></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>✅ <span>Tự động kích hoạt ngay sau khi chuyển khoản</span></span>
                  </div>
                </div>
              </div>

              {/* Network Selection (Tối giản 2 mạng BSC và ETH) */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#A0AEC0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Chọn Mạng Blockchain (USDT):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>

                  {/* Network 1: BSC (BEP-20) */}
                  <div
                    onClick={() => setSelectedNetwork('bsc')}
                    style={{
                      padding: '12px 16px',
                      background: selectedNetwork === 'bsc' ? 'rgba(240, 185, 11, 0.08)' : '#0E1118',
                      border: `1.5px solid ${selectedNetwork === 'bsc' ? '#F0B90B' : '#222938'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🟡</span>
                      <strong style={{ fontSize: '13px', color: selectedNetwork === 'bsc' ? '#F0B90B' : '#E9E6E7' }}>
                        BNB Smart Chain
                      </strong>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: selectedNetwork === 'bsc' ? '#0B0E14' : '#F0B90B',
                      background: selectedNetwork === 'bsc' ? '#F0B90B' : 'rgba(240, 185, 11, 0.12)',
                      padding: '2px 6px',
                      borderRadius: '2px'
                    }}>
                      BEP-20
                    </span>
                  </div>

                  {/* Network 2: Ethereum (ERC-20) */}
                  <div
                    onClick={() => setSelectedNetwork('eth')}
                    style={{
                      padding: '12px 16px',
                      background: selectedNetwork === 'eth' ? 'rgba(98, 126, 234, 0.08)' : '#0E1118',
                      border: `1.5px solid ${selectedNetwork === 'eth' ? '#627EEA' : '#222938'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🔵</span>
                      <strong style={{ fontSize: '13px', color: selectedNetwork === 'eth' ? '#627EEA' : '#E9E6E7' }}>
                        Ethereum
                      </strong>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: selectedNetwork === 'eth' ? '#FFFFFF' : '#627EEA',
                      background: selectedNetwork === 'eth' ? '#627EEA' : 'rgba(98, 126, 234, 0.15)',
                      padding: '2px 6px',
                      borderRadius: '2px'
                    }}>
                      ERC-20
                    </span>
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
                  </div>
                </div>
              )}

              {/* Minimalist Aesthetic Payment Button */}
              <button
                onClick={handleCreatePayment}
                disabled={paying}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: paying ? '#1E2330' : '#CBB193',
                  color: paying ? '#787B86' : '#0B0E14',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '700',
                  letterSpacing: '0.4px',
                  cursor: paying ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                  boxShadow: paying ? 'none' : '0 2px 10px rgba(203, 177, 147, 0.15)'
                }}
                onMouseEnter={(e) => {
                  if (!paying) {
                    e.currentTarget.style.background = '#dfc7ab';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!paying) {
                    e.currentTarget.style.background = '#CBB193';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {paying ? (
                  <>
                    <span>🔄</span>
                    <span>Đang kết nối cổng thanh toán...</span>
                  </>
                ) : (
                  <>
                    <span>Thanh toán $45 USDT</span>
                    <span style={{ fontSize: '12.5px', fontWeight: '500', opacity: 0.75 }}>
                      • {selectedNetwork === 'eth' ? 'ERC-20' : 'BEP-20'}
                    </span>
                    <span style={{ fontSize: '15px', marginLeft: '4px' }}>→</span>
                  </>
                )}
              </button>

              <div style={{
                marginTop: '10px',
                fontSize: '12px',
                color: '#8E9BAE',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}>
                <span>ℹ️</span>
                <span>Bạn sẽ được chuyển hướng sang trang khác để thanh toán</span>
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#6B7C98' }}>
                <span>🔒 Cổng bảo mật NOWPayments</span>
                <span>•</span>
                <span>⚡ Mạng {selectedNetwork === 'eth' ? 'Ethereum (ERC-20)' : 'BNB Smart Chain (BEP-20)'}</span>
                <span>•</span>
                <span>💬 Hỗ trợ Telegram: <a href="https://t.me/tradewh04" target="_blank" rel="noopener noreferrer" style={{ color: '#00E5FF', textDecoration: 'none' }}>@tradewh04</a></span>
              </div>

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
        ĐANG TẢI DỮ LIỆU THANH TOÁN TRADEWH...
      </div>
    }>
      <SubscriptionContent />
    </Suspense>
  );
}
