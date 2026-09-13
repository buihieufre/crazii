'use client';

import React, { useState, useEffect, useCallback } from 'react';

export default function AdminSubscriptionsPage() {
  // Tool 1: Random Trial Generator
  const [genDays, setGenDays] = useState(3);
  const [genCustomDays, setGenCustomDays] = useState('');
  const [genPrefix, setGenPrefix] = useState('trial');
  const [genNote, setGenNote] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [latestCreatedAccount, setLatestCreatedAccount] = useState(null);
  const [recentTrials, setRecentTrials] = useState([]);
  const [showPassword, setShowPassword] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  // Tool 2: Grant to Existing Account
  const [grantEmail, setGrantEmail] = useState('');
  const [grantDays, setGrantDays] = useState(30);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantFeedback, setGrantFeedback] = useState(null);

  // Tool 3: Cancel Subscription
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState(null);

  // Tool 4: Orders Table
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);

  // Load saved trials from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradewh_recent_trials');
      if (saved) setRecentTrials(JSON.parse(saved));
    } catch (e) {}
  }, []);

  // Fetch Orders
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const params = new URLSearchParams({
        page: String(orderPage),
        limit: '10',
        search: orderSearch,
        status: orderStatus
      });

      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOrders(data.orders || []);
          setOrderTotal(data.total || 0);
          setOrderTotalPages(data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [orderPage, orderSearch, orderStatus]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Copy to clipboard
  function handleCopyText(text, key) {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {}
  }

  // Handle Create Random Trial
  async function handleCreateRandomTrial() {
    const finalDays = genCustomDays ? parseInt(genCustomDays, 10) : genDays;
    if (!finalDays || finalDays < 1) return;

    setGenLoading(true);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/admin/create-trial-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          days: finalDays,
          prefix: genPrefix,
          note: genNote
        })
      });

      const data = await res.json();
      if (data.success && data.account) {
        setLatestCreatedAccount(data.account);
        const updated = [data.account, ...recentTrials.slice(0, 9)];
        setRecentTrials(updated);
        try { localStorage.setItem('tradewh_recent_trials', JSON.stringify(updated)); } catch (e) {}
        setGenNote('');
      } else {
        alert(data.message || 'Lỗi khi tạo tài khoản dùng thử.');
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setGenLoading(false);
    }
  }

  // Handle Grant to Existing Account
  async function handleGrantExisting() {
    if (!grantEmail) return;
    setGrantLoading(true);
    setGrantFeedback(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/admin/grant-trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: grantEmail,
          days: grantDays
        })
      });

      const data = await res.json();
      if (data.success) {
        setGrantFeedback({ type: 'success', text: data.message });
        setGrantEmail('');
      } else {
        setGrantFeedback({ type: 'error', text: data.message || 'Lỗi khi cấp gói.' });
      }
    } catch (err) {
      setGrantFeedback({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setGrantLoading(false);
    }
  }

  // Handle Cancel Subscription
  async function handleCancelSubscription() {
    if (!cancelEmail) return;
    setCancelLoading(true);
    setCancelFeedback(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetEmail: cancelEmail })
      });

      const data = await res.json();
      if (data.success) {
        setCancelFeedback({ type: 'success', text: data.message || `Đã hủy gói cước của ${cancelEmail}` });
        setCancelEmail('');
      } else {
        setCancelFeedback({ type: 'error', text: data.message || 'Lỗi khi hủy gói cước.' });
      }
    } catch (err) {
      setCancelFeedback({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setCancelLoading(false);
    }
  }

  function formatTime(isoStr) {
    if (!isoStr) return '--';
    try {
      return new Date(isoStr).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoStr;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
          Quản Trị Subscriptions & Đơn Hàng
        </h1>
        <p style={{ fontSize: '13px', color: '#8899A6', margin: '4px 0 0 0' }}>
          Tạo tài khoản dùng thử 1-click cho khách hàng, cấp gói thủ công và theo dõi các đơn hàng thanh toán NOWPayments.
        </p>
      </div>

      {/* Grid: Tool 1 (Trial Generator) + Tool 2 (Grant/Revoke) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '20px'
      }}>

        {/* TOOL 1: 1-CLICK RANDOM TRIAL GENERATOR */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🎲</span>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                Tạo Tài Khoản Dùng Thử (1-Click Generator)
              </h3>
            </div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#CBB193', background: 'rgba(203,177,147,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
              FAST TOOL
            </span>
          </div>

          <p style={{ fontSize: '12.5px', color: '#8899A6', margin: 0 }}>
            Tự động sinh email ngẫu nhiên, mật khẩu chuẩn bảo mật và kích hoạt ngay gói dùng thử theo số ngày chọn.
          </p>

          {/* Preset Days */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '8px' }}>
              Thời hạn dùng thử:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { d: 1, label: '1 Ngày' },
                { d: 3, label: '3 Ngày (Chuẩn)' },
                { d: 7, label: '7 Ngày (1 Tuần)' },
                { d: 14, label: '14 Ngày (2 Tuần)' },
                { d: 30, label: '30 Ngày (1 Tháng)' }
              ].map(item => (
                <button
                  key={item.d}
                  type="button"
                  onClick={() => { setGenDays(item.d); setGenCustomDays(''); }}
                  style={{
                    padding: '6px 12px',
                    background: genDays === item.d && !genCustomDays ? '#CBB193' : '#121827',
                    color: genDays === item.d && !genCustomDays ? '#0B0E14' : '#CBD5E1',
                    border: '1px solid #1E283D',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prefix & Note */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '6px' }}>
                Tiền tố Email:
              </label>
              <select
                value={genPrefix}
                onChange={(e) => setGenPrefix(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#F1F5F9',
                  fontSize: '12.5px',
                  outline: 'none'
                }}
              >
                <option value="trial">trial_xxxxxx@tradewh.work</option>
                <option value="vip">vip_xxxxxx@tradewh.work</option>
                <option value="guest">guest_xxxxxx@tradewh.work</option>
                <option value="demo">demo_xxxxxx@tradewh.work</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '6px' }}>
                Ghi chú khách hàng:
              </label>
              <input
                type="text"
                placeholder="VD: Telegram @alex"
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#F1F5F9',
                  fontSize: '12.5px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            disabled={genLoading}
            onClick={handleCreateRandomTrial}
            style={{
              width: '100%',
              padding: '11px',
              background: '#CBB193',
              border: 'none',
              borderRadius: '6px',
              color: '#0B0E14',
              fontSize: '13px',
              fontWeight: '800',
              cursor: genLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>{genLoading ? '⏳' : '⚡'}</span>
            <span>{genLoading ? 'Đang tạo tài khoản...' : `Tự Động Tạo Tài Khoản (${genCustomDays || genDays} Ngày)`}</span>
          </button>

          {/* Generated Result Box */}
          {latestCreatedAccount && (
            <div style={{
              background: '#121827',
              border: '1px solid #CBB193',
              borderRadius: '6px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#4ADE80' }}>
                  ✅ ĐÃ TẠO THÀNH CÔNG!
                </span>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', color: '#8899A6', fontSize: '11.5px', cursor: 'pointer' }}
                >
                  {showPassword ? '👁️ Ẩn mật khẩu' : '👁️ Hiện mật khẩu'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px', fontSize: '12.5px' }}>
                <span style={{ color: '#8899A6' }}>Email:</span>
                <span style={{ fontWeight: '700', color: '#FFFFFF', wordBreak: 'break-all' }}>{latestCreatedAccount.email}</span>
                <span style={{ color: '#8899A6' }}>Mật khẩu:</span>
                <span style={{ fontWeight: '700', color: '#CBB193', fontFamily: "'JetBrains Mono', monospace" }}>
                  {showPassword ? latestCreatedAccount.password : '••••••••••••'}
                </span>
                <span style={{ color: '#8899A6' }}>Hạn dùng:</span>
                <span style={{ color: '#4ADE80', fontWeight: '600' }}>{latestCreatedAccount.expiryDateFormatted} ({latestCreatedAccount.days} ngày)</span>
              </div>

              {/* 1-Click Copy Button */}
              <button
                type="button"
                onClick={() => {
                  const loginUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tradewh.work';
                  const copyFormat = `🚀 TÀI KHOẢN DÙNG THỬ TRADEWH PRO (${latestCreatedAccount.days} NGÀY)\nEmail: ${latestCreatedAccount.email}\nMật khẩu: ${latestCreatedAccount.password}\nThời hạn: ${latestCreatedAccount.days} ngày (Hết hạn: ${latestCreatedAccount.expiryDateFormatted})\nĐăng nhập tại: ${loginUrl}\nChúc bạn có trải nghiệm phân tích tuyệt vời!`;
                  handleCopyText(copyFormat, 'created_acc');
                }}
                style={{
                  padding: '8px 12px',
                  background: copiedKey === 'created_acc' ? '#22C55E' : '#1E2638',
                  color: copiedKey === 'created_acc' ? '#FFFFFF' : '#CBB193',
                  border: '1px solid rgba(203, 177, 147, 0.4)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {copiedKey === 'created_acc' ? '✓ ĐÃ SAO CHÉP MẪU GỬI KHÁCH!' : '📋 SAO CHÉP MẪU GỬI KHÁCH HÀNG (1-CLICK)'}
              </button>
            </div>
          )}
        </div>

        {/* TOOL 2 & 3: MANUAL GRANT & CANCEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Grant to Existing */}
          <div style={{
            background: '#0D121F',
            border: '1px solid #1A2234',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🎁</span>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                Cấp / Gia Hạn Cho Tài Khoản Có Sẵn
              </h3>
            </div>

            {grantFeedback && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '4px',
                fontSize: '12.5px',
                backgroundColor: grantFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: grantFeedback.type === 'success' ? '#4ADE80' : '#F87171'
              }}>
                {grantFeedback.text}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '6px' }}>
                Email tài khoản:
              </label>
              <input
                type="email"
                placeholder="user@gmail.com"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#F1F5F9',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '6px' }}>
                  Số ngày cấp:
                </label>
                <select
                  value={grantDays}
                  onChange={(e) => setGrantDays(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    background: '#121827',
                    border: '1px solid #1E283D',
                    borderRadius: '6px',
                    color: '#F1F5F9',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  <option value={3}>3 Ngày (Trial)</option>
                  <option value={7}>7 Ngày</option>
                  <option value={14}>14 Ngày</option>
                  <option value={30}>30 Ngày (1 Tháng)</option>
                  <option value={90}>90 Ngày (3 Tháng)</option>
                  <option value={365}>365 Ngày (1 Năm)</option>
                </select>
              </div>

              <button
                type="button"
                disabled={grantLoading || !grantEmail}
                onClick={handleGrantExisting}
                style={{
                  marginTop: '22px',
                  padding: '9px 18px',
                  background: '#CBB193',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#0B0E14',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: (grantLoading || !grantEmail) ? 'not-allowed' : 'pointer'
                }}
              >
                {grantLoading ? 'Đang cấp...' : 'Cấp Gói'}
              </button>
            </div>
          </div>

          {/* Cancel Subscription */}
          <div style={{
            background: '#0D121F',
            border: '1px solid #1A2234',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>❌</span>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                Hủy Gói Cước Tài Khoản
              </h3>
            </div>

            {cancelFeedback && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '4px',
                fontSize: '12.5px',
                backgroundColor: cancelFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: cancelFeedback.type === 'success' ? '#4ADE80' : '#F87171'
              }}>
                {cancelFeedback.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="email"
                placeholder="Nhập email tài khoản cần hủy gói..."
                value={cancelEmail}
                onChange={(e) => setCancelEmail(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#F1F5F9',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />

              <button
                type="button"
                disabled={cancelLoading || !cancelEmail}
                onClick={handleCancelSubscription}
                style={{
                  padding: '9px 16px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  color: '#F87171',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: (cancelLoading || !cancelEmail) ? 'not-allowed' : 'pointer'
                }}
              >
                {cancelLoading ? 'Đang hủy...' : 'Hủy Gói'}
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* TOOL 4: ORDERS HISTORY TABLE */}
      <div style={{
        background: '#0D121F',
        border: '1px solid #1A2234',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {/* Table Header Controls */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #1A2234',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
              Lịch Sử Đơn Hàng Thanh Toán ({orderTotal})
            </h3>
            <span style={{ fontSize: '12px', color: '#8899A6' }}>Ghi nhận từ cổng thanh toán NOWPayments</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Tìm mã đơn hoặc email..."
              value={orderSearch}
              onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
              style={{
                padding: '7px 12px',
                background: '#121827',
                border: '1px solid #1E283D',
                borderRadius: '6px',
                color: '#F1F5F9',
                fontSize: '12.5px',
                outline: 'none',
                width: '200px'
              }}
            />

            <select
              value={orderStatus}
              onChange={(e) => { setOrderStatus(e.target.value); setOrderPage(1); }}
              style={{
                padding: '7px 10px',
                background: '#121827',
                border: '1px solid #1E283D',
                borderRadius: '6px',
                color: '#CBD5E1',
                fontSize: '12.5px',
                outline: 'none'
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="finished">Thành công (finished)</option>
              <option value="waiting">Chờ thanh toán (waiting)</option>
              <option value="expired">Hết hạn (expired)</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0B0E18', borderBottom: '1px solid #1A2234', color: '#8899A6' }}>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Mã đơn hàng</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Khách hàng</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Số tiền</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Thời gian tạo</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', textAlign: 'right' }}>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#8899A6' }}>
                    Đang tải danh sách đơn hàng...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                    Chưa có đơn hàng nào phù hợp.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const statusClean = (o.status || '').toLowerCase().trim();
                  const isFinished = statusClean === 'finished';
                  const isWaiting = statusClean === 'waiting' || statusClean === 'pending';
                  const isConfirming = statusClean === 'confirming' || statusClean === 'confirmed';
                  return (
                    <tr key={o.id || o.order_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                      <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", color: '#CBB193', fontSize: '12px' }}>
                        {o.order_id}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#F1F5F9' }}>
                        {o.email || '--'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: '700', color: '#FFFFFF' }}>
                        ${o.amount || '45.00'} <span style={{ fontSize: '11px', color: '#8899A6' }}>{o.currency || 'USDT'}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: isFinished
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isConfirming
                            ? 'rgba(59, 130, 246, 0.15)'
                            : isWaiting
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isFinished
                            ? '#4ADE80'
                            : isConfirming
                            ? '#60A5FA'
                            : isWaiting
                            ? '#FACC15'
                            : '#F87171',
                          border: `1px solid ${
                            isFinished
                              ? 'rgba(34, 197, 94, 0.3)'
                              : isConfirming
                              ? 'rgba(59, 130, 246, 0.3)'
                              : isWaiting
                              ? 'rgba(234, 179, 8, 0.3)'
                              : 'rgba(239, 68, 68, 0.3)'
                          }`
                        }}>
                          {o.status || 'pending'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#8899A6', fontSize: '12px' }}>
                        {formatTime(o.created_at)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {o.payment_url ? (
                          <a
                            href={o.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '4px 8px',
                              background: '#121827',
                              border: '1px solid #1E283D',
                              borderRadius: '4px',
                              color: '#60A5FA',
                              fontSize: '11.5px',
                              textDecoration: 'none'
                            }}
                          >
                            Mở cổng ↗
                          </a>
                        ) : '--'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #1A2234',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12.5px',
          color: '#8899A6'
        }}>
          <div>Trang {orderPage} / {orderTotalPages}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={orderPage <= 1}
              onClick={() => setOrderPage(p => Math.max(1, p - 1))}
              style={{
                padding: '5px 12px',
                background: orderPage <= 1 ? '#0F131D' : '#121827',
                border: '1px solid #1E283D',
                borderRadius: '4px',
                color: orderPage <= 1 ? '#475569' : '#CBD5E1',
                cursor: orderPage <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ← Trước
            </button>
            <button
              disabled={orderPage >= orderTotalPages}
              onClick={() => setOrderPage(p => Math.min(orderTotalPages, p + 1))}
              style={{
                padding: '5px 12px',
                background: orderPage >= orderTotalPages ? '#0F131D' : '#121827',
                border: '1px solid #1E283D',
                borderRadius: '4px',
                color: orderPage >= orderTotalPages ? '#475569' : '#CBD5E1',
                cursor: orderPage >= orderTotalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Sau →
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
