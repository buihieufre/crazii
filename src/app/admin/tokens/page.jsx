'use client';

import React, { useState, useEffect, useCallback } from 'react';

export default function AdminTokensPage() {
  const [tokenStatus, setTokenStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Manual token input state
  const [manualRefreshToken, setManualRefreshToken] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualFeedback, setManualFeedback] = useState(null);

  // Countdown timers (seconds)
  const [accessSecLeft, setAccessSecLeft] = useState(0);
  const [refreshSecLeft, setRefreshSecLeft] = useState(0);

  const fetchTokenStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/admin/tokens/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTokenStatus(data);
          setAccessSecLeft(data.accessToken?.timeLeftSeconds || 0);
          setRefreshSecLeft(data.refreshToken?.timeLeftSeconds || 0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch token status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokenStatus();
    const interval = setInterval(fetchTokenStatus, 30000); // sync every 30s
    return () => clearInterval(interval);
  }, [fetchTokenStatus]);

  // Live countdown tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      setAccessSecLeft(sec => Math.max(0, sec - 1));
      setRefreshSecLeft(sec => Math.max(0, sec - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Force Refresh Token API call
  async function handleForceRefresh() {
    setRefreshing(true);
    setActionFeedback(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/refresh-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback({ type: 'success', text: '⚡ Làm mới token thành công! Crazii đã cấp mới Refresh Token 72 giờ và lưu vào Supabase PostgreSQL.' });
        await fetchTokenStatus();
      } else {
        setActionFeedback({ type: 'error', text: data.message || 'Không thể làm mới token.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
    } finally {
      setRefreshing(false);
    }
  }

  // Save manual refresh token
  async function handleSaveManualToken() {
    if (!manualRefreshToken.trim()) return;
    setManualSaving(true);
    setManualFeedback(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/set-refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ refreshToken: manualRefreshToken.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setManualFeedback({ type: 'success', text: '🎉 Đã lưu Refresh Token mới và kích hoạt Access Token thành công!' });
        setManualRefreshToken('');
        await fetchTokenStatus();
      } else {
        setManualFeedback({ type: 'error', text: data.message || 'Không thể áp dụng token mới.' });
      }
    } catch (err) {
      setManualFeedback({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setManualSaving(false);
    }
  }

  // Format countdown
  function formatCountdown(sec) {
    if (sec <= 0) return 'Đã hết hạn';
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    if (hours > 0) {
      return `${hours} giờ ${minutes} phút ${seconds} giây`;
    }
    return `${minutes} phút ${seconds < 10 ? '0' : ''}${seconds} giây`;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '--';
    try {
      return new Date(isoStr).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoStr;
    }
  }

  if (loading && !tokenStatus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#8899A6' }}>
        <div style={{
          width: '28px',
          height: '28px',
          border: '2px solid rgba(203, 177, 147, 0.2)',
          borderTopColor: '#CBB193',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '12px'
        }} />
        <span style={{ fontSize: '13px' }}>Đang nạp trạng thái token máy chủ...</span>
      </div>
    );
  }

  const isAccessOk = accessSecLeft > 0;
  const isRefreshOk = refreshSecLeft > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
            Quản Trị Token Crazii & Proxy Server
          </h1>
          <p style={{ fontSize: '13px', color: '#8899A6', margin: '4px 0 0 0' }}>
            Theo dõi thời gian sống của token, kiểm tra cơ chế tự động gia hạn cuốn chiếu (Rolling Renewal) và máy chủ WebSocket upstream.
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={handleForceRefresh}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: '#CBB193',
            border: 'none',
            borderRadius: '6px',
            color: '#0B0E14',
            fontSize: '13px',
            fontWeight: '800',
            cursor: refreshing ? 'not-allowed' : 'pointer'
          }}
        >
          <span>{refreshing ? '⏳' : '⚡'}</span>
          <span>{refreshing ? 'Đang gia hạn token...' : 'Force Refresh Token Ngay'}</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {actionFeedback && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: actionFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${actionFeedback.type === 'success' ? '#22C55E' : '#EF4444'}`,
          color: actionFeedback.type === 'success' ? '#4ADE80' : '#F87171'
        }}>
          <span>{actionFeedback.text}</span>
          <button onClick={() => setActionFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 2 Main Countdown Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>

        {/* Card 1: Access Token */}
        <div style={{
          background: '#0D121F',
          border: `1px solid ${isAccessOk ? '#1A2234' : 'rgba(239, 68, 68, 0.5)'}`,
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                Crazii Access Token
              </h3>
            </div>
            <span style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '700',
              background: isAccessOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isAccessOk ? '#4ADE80' : '#F87171'
            }}>
              {isAccessOk ? 'VALID (15 PHÚT)' : 'EXPIRED'}
            </span>
          </div>

          <div style={{ fontSize: '26px', fontWeight: '900', color: isAccessOk ? '#4ADE80' : '#F87171', fontFamily: "'JetBrains Mono', monospace" }}>
            {formatCountdown(accessSecLeft)}
          </div>

          <div style={{ fontSize: '12.5px', color: '#8899A6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>Thời điểm hết hạn: <strong style={{ color: '#CBD5E1' }}>{formatTime(tokenStatus?.accessToken?.expiresAt)}</strong></div>
            <div>Mã token: <code style={{ color: '#CBB193', fontFamily: "'JetBrains Mono', monospace" }}>{tokenStatus?.accessToken?.snippet || 'Chưa có'}</code></div>
          </div>
        </div>

        {/* Card 2: Refresh Token */}
        <div style={{
          background: '#0D121F',
          border: `1px solid ${isRefreshOk ? '#1A2234' : 'rgba(239, 68, 68, 0.5)'}`,
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🔄</span>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                Crazii Refresh Token (72 Giờ)
              </h3>
            </div>
            <span style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '700',
              background: isRefreshOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isRefreshOk ? '#4ADE80' : '#F87171'
            }}>
              {isRefreshOk ? 'ROLLING RENEWAL' : 'EXPIRED'}
            </span>
          </div>

          <div style={{ fontSize: '26px', fontWeight: '900', color: isRefreshOk ? '#CBB193' : '#F87171', fontFamily: "'JetBrains Mono', monospace" }}>
            {formatCountdown(refreshSecLeft)}
          </div>

          <div style={{ fontSize: '12.5px', color: '#8899A6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>Thời điểm hết hạn: <strong style={{ color: '#CBD5E1' }}>{formatTime(tokenStatus?.refreshToken?.expiresAt)}</strong></div>
            <div>Mã token: <code style={{ color: '#CBB193', fontFamily: "'JetBrains Mono', monospace" }}>{tokenStatus?.refreshToken?.snippet || 'Chưa có'}</code></div>
          </div>
        </div>

      </div>

      {/* Grid: Database Persistence & Upstream WebSocket */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>

        {/* Database Persistence Status */}
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
            <span style={{ fontSize: '18px' }}>🗄️</span>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
              Lưu Trữ Tự Động Vào Database (Supabase)
            </h3>
          </div>

          <p style={{ fontSize: '12.5px', color: '#8899A6', margin: 0, lineHeight: '1.5' }}>
            Mỗi khi Crazii cấp Refresh Token mới (thời hạn 72 giờ), hệ thống tự động ghi đè vào bảng <code style={{ color: '#CBB193' }}>system_settings</code> trong PostgreSQL. Khi Render khởi động lại, server tự nạp lại token mới nhất mà không cần cập nhật file .env.
          </p>

          <div style={{ background: '#121827', border: '1px solid #1E283D', borderRadius: '6px', padding: '12px', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Bảng lưu trữ:</span>
              <span style={{ color: '#F1F5F9', fontWeight: '600' }}>system_settings</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Trạng thái kết nối:</span>
              <span style={{ color: '#4ADE80', fontWeight: '700' }}>✅ Đang kết nối 24/7</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Lần lưu DB gần nhất:</span>
              <span style={{ color: '#CBB193', fontWeight: '600' }}>{formatTime(tokenStatus?.database?.lastUpdated)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Chu kỳ tự gia hạn:</span>
              <span style={{ color: '#60A5FA', fontWeight: '600' }}>Mỗi 12 tiếng tự động cuốn chiếu</span>
            </div>
          </div>
        </div>

        {/* Upstream WebSocket Streaming Status */}
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
            <span style={{ fontSize: '18px' }}>📡</span>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
              Upstream WebSocket Proxy (Crazii Tick)
            </h3>
          </div>

          <p style={{ fontSize: '12.5px', color: '#8899A6', margin: 0, lineHeight: '1.5' }}>
            Proxy kết nối on-demand duy nhất một kênh lên máy chủ upstream Crazii và phân phối lại (multicast) dữ liệu nến, giá và chỉ báo tới tất cả người dùng xem biểu đồ.
          </p>

          <div style={{ background: '#121827', border: '1px solid #1E283D', borderRadius: '6px', padding: '12px', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Máy chủ nguồn:</span>
              <code style={{ color: '#CBB193', fontFamily: "'JetBrains Mono', monospace" }}>https://tick-ws.crazii.com</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Trạng thái socket:</span>
              <span style={{ color: tokenStatus?.upstreamWebSocket?.connected ? '#4ADE80' : '#94A3B8', fontWeight: '700' }}>
                {tokenStatus?.upstreamWebSocket?.connected ? '⚡ Live Streaming (Active)' : '⏸️ Idle (Chờ client chọn cặp)'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8899A6' }}>Kênh đang relay:</span>
              <span style={{ color: '#F1F5F9', fontWeight: '600' }}>
                {tokenStatus?.upstreamWebSocket?.activeChannels?.length > 0
                  ? tokenStatus.upstreamWebSocket.activeChannels.join(', ')
                  : 'Chưa có kênh nào'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Manual Refresh Token Update Box */}
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
          <span style={{ fontSize: '18px' }}>✍️</span>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
            Cập Nhật Refresh Token Thủ Công (Dự Phòng Khẩn Cấp)
          </h3>
        </div>

        <p style={{ fontSize: '12.5px', color: '#8899A6', margin: 0 }}>
          Nếu token trên hệ thống bị hết hạn hoàn toàn do máy chủ Crazii thay đổi, bạn có thể dán mã Refresh Token mới nhất tại đây. Hệ thống sẽ tự động xác thực, kích hoạt Access Token và lưu ngay vào Database.
        </p>

        {manualFeedback && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '12.5px',
            backgroundColor: manualFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: manualFeedback.type === 'success' ? '#4ADE80' : '#F87171'
          }}>
            {manualFeedback.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Dán mã Bearer Refresh Token mới vào đây (VD: eyJhbGci...)..."
            value={manualRefreshToken}
            onChange={(e) => setManualRefreshToken(e.target.value)}
            style={{
              flex: '1 1 320px',
              padding: '10px 14px',
              background: '#121827',
              border: '1px solid #1E283D',
              borderRadius: '6px',
              color: '#F1F5F9',
              fontSize: '12.5px',
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none'
            }}
          />

          <button
            type="button"
            disabled={manualSaving || !manualRefreshToken.trim()}
            onClick={handleSaveManualToken}
            style={{
              padding: '10px 20px',
              background: '#CBB193',
              border: 'none',
              borderRadius: '6px',
              color: '#0B0E14',
              fontSize: '13px',
              fontWeight: '700',
              cursor: (manualSaving || !manualRefreshToken.trim()) ? 'not-allowed' : 'pointer'
            }}
          >
            {manualSaving ? 'Đang lưu...' : 'Lưu & Kích Hoạt Token'}
          </button>
        </div>
      </div>

    </div>
  );
}
