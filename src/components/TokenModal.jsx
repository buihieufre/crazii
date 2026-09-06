'use client';

import React, { useState } from 'react';
import { formatTimeRemaining } from '@/lib/utils';

export default function TokenModal({
  isOpen,
  onClose,
  tokenInfo,
  onRefreshTokenSuccess
}) {
  const [refreshTokenInput, setRefreshTokenInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'success' | 'error', message: string }

  if (!isOpen) return null;

  const accessLeft = tokenInfo?.accessToken?.timeLeftSeconds || 0;
  const refreshLeft = tokenInfo?.refreshToken?.timeLeftSeconds || 0;
  const hasValidAccess = tokenInfo?.accessToken?.hasToken && !tokenInfo?.accessToken?.isExpired;
  const hasValidRefresh = tokenInfo?.refreshToken?.hasToken && !tokenInfo?.refreshToken?.isExpired;

  async function handleManualRefresh() {
    setIsRefreshing(true);
    setAlert(null);
    const token = typeof window !== 'undefined' ? (localStorage.getItem('crazii_session_token') || '') : '';
    try {
      const res = await fetch('/api/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', message: '✅ Đã refresh Access Token thành công! Biểu đồ đang cập nhật...' });
        if (onRefreshTokenSuccess) onRefreshTokenSuccess();
      } else {
        setAlert({ type: 'error', message: `❌ Không thể refresh: ${data.message || 'Lỗi server'}` });
      }
    } catch (err) {
      setAlert({ type: 'error', message: `❌ Lỗi kết nối: ${err.message}` });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSaveRefreshToken() {
    const trimmed = refreshTokenInput.trim();
    if (!trimmed) {
      setAlert({ type: 'error', message: '⚠️ Vui lòng dán mã Refresh Token hợp lệ' });
      return;
    }

    setIsSaving(true);
    setAlert(null);
    const token = typeof window !== 'undefined' ? (localStorage.getItem('crazii_session_token') || '') : '';
    try {
      const res = await fetch('/api/set-refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ refreshToken: trimmed })
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', message: '🎉 Đã lưu Refresh Token và kích hoạt nến thành công!' });
        setRefreshTokenInput('');
        if (onRefreshTokenSuccess) onRefreshTokenSuccess();
        setTimeout(onClose, 1200);
      } else {
        setAlert({ type: 'error', message: `❌ Lỗi kích hoạt token: ${data.message || 'Token không hợp lệ'}` });
      }
    } catch (err) {
      setAlert({ type: 'error', message: `❌ Lỗi kết nối: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <h3 className="modal-title">🔐 TRADEWH Authentication & Auto-Refresh</h3>
          <button className="btn" onClick={onClose}>&times;</button>
        </div>

        {/* Status Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: '#0f121a', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>ACCESS TOKEN (15M)</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: hasValidAccess ? '#00E676' : '#ff5252' }}>
              {hasValidAccess ? `Active (${formatTimeRemaining(accessLeft)})` : 'Expired (Auto-renewing...)'}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>Tự gia hạn ngầm mỗi 12m 🔄</div>
          </div>

          <div style={{ background: '#0f121a', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>REFRESH TOKEN (3 DAYS)</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: hasValidRefresh ? '#00E5FF' : '#ff5252' }}>
              {hasValidRefresh ? `Active (${formatTimeRemaining(refreshLeft)})` : 'Chưa thiết lập / Hết hạn'}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>Cấp mới Access Token liên tục</div>
          </div>
        </div>

        {/* Refresh Token Input Form */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', display: 'flex', justifyContent: 'space-between' }}>
            <span>🔑 TRADEWH Refresh Token (Hạn 3 Ngày)</span>
            <span style={{ color: 'var(--accent-green)', fontSize: 10, fontWeight: 700 }}>Khuyên dùng</span>
          </label>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 3, marginBottom: 6 }}>
            Dán mã Refresh Token (<code>typ: Refresh</code>) lấy từ hệ thống TRADEWH. Chỉ cần dán 1 lần duy nhất mỗi 3 ngày, server sẽ tự động cấp mới Access Token liên tục để biểu đồ không bao giờ bị dừng.
          </p>
          <input
            type="text"
            className="input-field"
            value={refreshTokenInput}
            onChange={(e) => setRefreshTokenInput(e.target.value)}
            placeholder="Dán mã Refresh Token mới tại đây (eyJhbGci...)"
          />
        </div>

        {/* Alert message box */}
        {alert && (
          <div style={{
            fontSize: 11,
            padding: '6px 10px',
            borderRadius: 4,
            marginBottom: 10,
            background: alert.type === 'success' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 0, 0, 0.15)',
            color: alert.type === 'success' ? '#00E676' : '#ff8a80',
            border: alert.type === 'success' ? '1px solid rgba(0, 230, 118, 0.3)' : '1px solid rgba(255, 0, 0, 0.3)'
          }}>
            {alert.message}
          </div>
        )}

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button
            className="btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{ background: '#1e283d', color: '#90caf9', borderColor: 'rgba(41, 98, 255, 0.4)' }}
          >
            {isRefreshing ? <span className="spinner"></span> : <span>🔄</span>}
            <span>Refresh Access Token Ngay</span>
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={onClose}>Đóng</button>
            <button
              className="btn btn-primary"
              onClick={handleSaveRefreshToken}
              disabled={isSaving}
            >
              {isSaving ? <span className="spinner"></span> : null}
              <span>{isSaving ? 'Đang lưu...' : 'Lưu & Kích hoạt'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
