'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatTimeRemaining } from '@/lib/utils';

function getLayoutIcon(layout) {
  switch (layout) {
    case '2-col': return '◫';
    case '2-row': return '⬒';
    case '3-col': return '⊞';
    case '3-grid': return '◰';
    case '4-grid': return '▦';
    default: return '🗖';
  }
}

function getLayoutLabel(layout) {
  switch (layout) {
    case '2-col': return '2 Cột';
    case '2-row': return '2 Hàng';
    case '3-col': return '3 Cột';
    case '3-grid': return '3 Khung';
    case '4-grid': return '4 Khung';
    default: return '1 Khung';
  }
}

export default function Header({
  currentCode,
  activeSymbolObj,
  onOpenAssetSelector,
  onSelectTimeframe,
  wsStatus,
  tokenInfo,
  onOpenTokenModal,
  isRefreshing,
  onRefresh,
  activeLayout = '1',
  onSelectLayout,
  isFullscreen = false,
  onToggleFullscreen,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  isAutoSave = true,
  onToggleAutoSave,
  saveStatus = 'saved', // 'saved' | 'saving' | 'idle'
  lastSavedTime = null,
  onSaveNow,
  onResetLayout,
  user = null,
  onLogout,
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const layoutDropdownRef = useRef(null);
  const saveDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);

  // Robust Admin check (supports email whitelist, role case-insensitivity, and cached crazii_user fallback)
  let effectiveUser = user;
  if (!effectiveUser && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('crazii_user');
      if (raw) effectiveUser = JSON.parse(raw);
    } catch (e) {}
  }

  const isAdmin = Boolean(
    effectiveUser && (
      ['dhieu9b@gmail.com', 'buidinhhieu9b@gmail.com'].includes((effectiveUser.email || '').toLowerCase().trim()) ||
      (effectiveUser.role || '').toLowerCase() === 'admin' ||
      effectiveUser.isAdmin === true
    )
  );

  const isSubscribed = Boolean(
    isAdmin || (
      user && (
        user.subscriptionStatus === true ||
        user.subscription_status === true ||
        (user.subscriptionExpiry && new Date(user.subscriptionExpiry).getTime() > Date.now()) ||
        (user.subscription_expiry && new Date(user.subscription_expiry).getTime() > Date.now())
      )
    )
  );

  const expiryRaw = user?.subscriptionExpiry || user?.subscription_expiry;
  let expiryFormatted = null;
  let daysLeft = 0;
  let isExpired = false;
  let isNotActivated = false;

  if (expiryRaw) {
    const expTime = new Date(expiryRaw).getTime();
    if (!isNaN(expTime)) {
      if (expTime > Date.now()) {
        const diff = expTime - Date.now();
        daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      } else {
        isExpired = true;
      }
      expiryFormatted = new Date(expiryRaw).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } else {
      isNotActivated = true;
    }
  } else {
    isNotActivated = true;
  }

  let planName = 'Chưa đăng ký gói cước';
  if (isAdmin) {
    planName = 'Quản Trị Viên (Admin Access)';
  } else if (isSubscribed) {
    const email = (user?.email || '').toLowerCase();
    if (email.startsWith('trial_') || (user?.name || '').toLowerCase().includes('dùng thử')) {
      planName = 'Gói Dùng Thử (Trial)';
    } else {
      planName = 'Gói TRADEWH Pro (30 Ngày)';
    }
  } else if (isExpired) {
    planName = 'Gói TRADEWH Pro (Đã hết hạn)';
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(e.target)) {
        setIsLayoutMenuOpen(false);
      }
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target)) {
        setIsSaveMenuOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isLayoutMenuOpen || isSaveMenuOpen || isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLayoutMenuOpen, isSaveMenuOpen, isUserMenuOpen]);

  const accessLeft = tokenInfo?.accessToken?.timeLeftSeconds || 0;
  const refreshLeft = tokenInfo?.refreshToken?.timeLeftSeconds || 0;
  const hasValidAccess = tokenInfo?.accessToken?.hasToken && !tokenInfo?.accessToken?.isExpired;
  const hasValidRefresh = tokenInfo?.refreshToken?.hasToken && !tokenInfo?.refreshToken?.isExpired;

  let tokenPillClass = 'token-status-pill';
  let tokenLabel = 'Token: Đang kiểm tra...';
  let tokenTitle = 'Quản lý Token & Auto-Refresh';

  if (hasValidRefresh || hasValidAccess) {
    tokenPillClass += ' valid';
    tokenLabel = '🔑 Token: Hoạt động';
    tokenTitle = `Hệ thống tự động gia hạn token ngầm (Refresh Token còn: ${formatTimeRemaining(refreshLeft || accessLeft)}). Click để xem chi tiết.`;
  } else {
    tokenPillClass += ' expired';
    tokenLabel = '🔑 Token: Hết hạn (Click nhập)';
    tokenTitle = 'Refresh Token đã hết hạn hoặc chưa cấu hình. Click để dán token mới.';
  }

  let wsBadgeClass = 'ws-status-badge';
  let wsText = 'WS Live';
  if (wsStatus === 'idle') {
    wsBadgeClass += ' idle';
    wsText = 'WS Idle (Chờ chọn)';
  } else if (wsStatus === 'cloud') {
    wsBadgeClass = 'ws-status-badge';
    wsText = 'Cloud Live';
  } else if (wsStatus === 'reconnecting') {
    wsBadgeClass += ' reconnecting';
    wsText = 'WS Reconnecting...';
  } else if (wsStatus === 'disconnected') {
    wsBadgeClass += ' disconnected';
    wsText = 'WS Disconnected';
  }

  const availableTimeframes = activeSymbolObj?.timeframes || [];

  const formattedSavedTime = lastSavedTime
    ? new Date(lastSavedTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <>
      <header className="main-tv-header" style={{ position: 'relative', zIndex: 99999 }}>
        {/* Brand & Symbol & Timeframe Selection (Visible on Desktop & Mobile) */}
        <div className="brand-section">
          <div className="brand-logo">TRADEWH<span>.COM</span></div>
          
          {/* Symbol Pill with Icon -> click to open Asset Selector */}
          <div
            className="symbol-pill"
            onClick={onOpenAssetSelector}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click để chọn danh sách tài sản"
          >
            {activeSymbolObj?.image && (
              <img
                src={activeSymbolObj.image.split(';')[0]}
                alt={activeSymbolObj.name}
                style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <span className="live-dot" style={{ backgroundColor: currentCode ? 'var(--accent-green)' : '#ffa726' }}></span>
            <span className="symbol-pill-code">{currentCode || 'Chọn tài sản'}</span>
            <span id="header-countdown-text" className="tv-header-countdown"></span>
            <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▼</span>
          </div>

          {/* Timeframe Selector for Active Symbol */}
          {availableTimeframes.length > 0 && (
            <div className="tf-group">
              {availableTimeframes.map((tf) => (
                <button
                  key={tf.code}
                  className={`tf-btn ${currentCode === tf.code ? 'active' : ''}`}
                  onClick={() => onSelectTimeframe(tf.code, tf.name, tf.minutes)}
                >
                  {tf.name}
                </button>
              ))}
            </div>
          )}

        </div>

        {/* Desktop Controls (Hidden on Mobile) */}
        <div className="controls-section desktop-only-controls">
          {/* Autosave & Save Layout Widget */}
          <div className="save-dropdown-wrapper" ref={saveDropdownRef}>
            <button
              className={`btn save-status-btn ${saveStatus === 'saving' ? 'saving' : (isAutoSave ? 'saved' : '')}`}
              onClick={() => setIsSaveMenuOpen((prev) => !prev)}
              title="Quản lý lưu bố cục & Tự động lưu"
            >
              <span>{saveStatus === 'saving' ? '☁️' : (isAutoSave ? '☁️' : '💾')}</span>
              <span>
                {saveStatus === 'saving'
                  ? 'Đang lưu...'
                  : (isAutoSave ? (formattedSavedTime ? `Đã lưu ${formattedSavedTime}` : 'Tự động lưu') : 'Lưu bố cục')}
              </span>
              <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>▼</span>
            </button>

            {isSaveMenuOpen && (
              <div className="save-dropdown-menu">
                <div className="save-menu-header">Bố cục & Lưu trữ</div>

                {/* Autosave Switch */}
                <div
                  className="autosave-toggle-row"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAutoSave?.();
                  }}
                >
                  <div className="autosave-label-group">
                    <span className="autosave-label-title">Tự động lưu (Auto-save)</span>
                    <span className="autosave-label-desc">Tự động lưu mọi thay đổi bố cục và nến</span>
                  </div>
                  <div className={`toggle-switch-pill ${isAutoSave ? 'active' : ''}`}>
                    <div className="toggle-switch-knob" />
                  </div>
                </div>

                {/* Save Now Button */}
                <button
                  className="save-menu-item"
                  onClick={() => {
                    onSaveNow?.();
                    setIsSaveMenuOpen(false);
                  }}
                >
                  <span>💾</span>
                  <span>Lưu biểu đồ ngay</span>
                </button>

                {/* Reset to Default Layout */}
                <button
                  className="save-menu-item danger"
                  onClick={() => {
                    if (window.confirm('Đặt lại toàn bộ bố cục và các khung về mặc định?')) {
                      onResetLayout?.();
                      setIsSaveMenuOpen(false);
                    }
                  }}
                >
                  <span>🔄</span>
                  <span>Đặt lại bố cục mặc định</span>
                </button>

                {formattedSavedTime && (
                  <div className="save-last-time-tag">
                    Lưu gần nhất: {formattedSavedTime}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Multi-Chart Layout Dropdown Selector */}
          <div className="layout-dropdown-wrapper" ref={layoutDropdownRef}>
            <button
              className={`btn ${activeLayout !== '1' ? 'active-layout-btn' : ''}`}
              onClick={() => setIsLayoutMenuOpen((prev) => !prev)}
              title="Bố cục chia màn hình (1, 2, 3, 4 biểu đồ)"
            >
              <span>{getLayoutIcon(activeLayout)}</span>
              <span>{getLayoutLabel(activeLayout)}</span>
              <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>▼</span>
            </button>

            {isLayoutMenuOpen && (
              <div className="layout-dropdown-menu">
                <div className="layout-dropdown-header">Bố cục biểu đồ</div>
                
                <div
                  className={`layout-option-item ${activeLayout === '1' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('1'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }}>
                    <div></div>
                  </div>
                  <span>1 Màn hình (Single)</span>
                </div>

                <div
                  className={`layout-option-item ${activeLayout === '2-col' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('2-col'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }}>
                    <div></div>
                    <div></div>
                  </div>
                  <span>Chia đôi (2 Cột dọc)</span>
                </div>

                <div
                  className={`layout-option-item ${activeLayout === '2-row' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('2-row'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' }}>
                    <div></div>
                    <div></div>
                  </div>
                  <span>Chia đôi (2 Hàng ngang)</span>
                </div>

                <div
                  className={`layout-option-item ${activeLayout === '3-col' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('3-col'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr' }}>
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                  <span>Chia 3 (3 Cột)</span>
                </div>

                <div
                  className={`layout-option-item ${activeLayout === '3-grid' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('3-grid'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1.25fr 1fr', gridTemplateRows: '1fr 1fr' }}>
                    <div style={{ gridRow: '1 / span 2' }}></div>
                    <div></div>
                    <div></div>
                  </div>
                  <span>Chia 3 (1 Lớn + 2 Nhỏ)</span>
                </div>

                <div
                  className={`layout-option-item ${activeLayout === '4-grid' ? 'active' : ''}`}
                  onClick={() => { onSelectLayout?.('4-grid'); setIsLayoutMenuOpen(false); }}
                >
                  <div className="layout-icon-preview" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                  <span>Chia 4 (Lưới 2x2)</span>
                </div>
              </div>
            )}
          </div>

          {/* Subscription / Membership Button (Hidden automatically if user already subscribed and not admin) */}
          {(!isSubscribed && !isAdmin) && (
            <Link
              href="/subscription"
              className="btn subscription-btn-highlight"
              style={{
                textDecoration: 'none',
                background: 'linear-gradient(135deg, rgba(203, 177, 147, 0.18) 0%, rgba(171, 151, 140, 0.08) 100%)',
                borderColor: 'rgba(203, 177, 147, 0.45)',
                color: '#CBB193',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: '700',
                boxShadow: '0 1px 6px rgba(203, 177, 147, 0.15)'
              }}
              title="Đăng Ký Gói Pro $15/Tháng"
            >
              <span>💎</span>
              <span>Gói Đăng Ký</span>
            </Link>
          )}

          {/* Admin Dashboard Direct Button - Bỏ phân cấp role admin, hiển thị cho mọi user */}
          {effectiveUser && (
            <Link
              href="/admin"
              className="btn subscription-btn-highlight"
              style={{
                textDecoration: 'none',
                background: 'linear-gradient(135deg, rgba(203, 177, 147, 0.18) 0%, rgba(171, 151, 140, 0.08) 100%)',
                borderColor: 'rgba(203, 177, 147, 0.45)',
                color: '#CBB193',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: '700',
                boxShadow: '0 1px 6px rgba(203, 177, 147, 0.15)'
              }}
              title="Mở Bảng Quản Trị Hệ Thống (Admin Dashboard)"
            >
              <span>👑</span>
              <span>Quản Trị</span>
            </Link>
          )}

          {/* Fullscreen Toggle Button */}
          <button
            className="btn"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình (Fullscreen)"}
          >
            <span>{isFullscreen ? '🗗' : '⛶'}</span>
            <span>{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
          </button>

          {/* User Profile & Interactive Avatar Dropdown Menu */}
          {user && (
            <div
              className="user-dropdown-wrapper"
              ref={userDropdownRef}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '4px',
                zIndex: 999999
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px 3px 4px',
                  background: isUserMenuOpen ? 'rgba(203, 177, 147, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: isUserMenuOpen ? '1px solid #CBB193' : '1px solid var(--border-color)',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setIsUserMenuOpen(prev => !prev)}
                title={`Click xem chi tiết gói & tài khoản (${user.email})`}
              >
                <img
                  src={user.picture || 'https://lh3.googleusercontent.com/a/default-user'}
                  alt="Avatar"
                  style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.src = 'https://lh3.googleusercontent.com/a/default-user'; }}
                />
                <span style={{ maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || user.email?.split('@')[0]}
                </span>
                <span style={{ fontSize: '8px', opacity: 0.7 }}>▼</span>
              </div>

              {/* Desktop Avatar Dropdown Card */}
              {isUserMenuOpen && (
                <div
                  className="user-dropdown-card"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '310px',
                    background: '#121620',
                    border: '1px solid #283244',
                    borderRadius: '6px',
                    padding: '16px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.95)',
                    zIndex: 2147483647,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  {/* User Profile Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={user.picture || 'https://lh3.googleusercontent.com/a/default-user'}
                      alt="Avatar"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${isSubscribed ? '#CBB193' : isExpired ? '#EF4444' : '#64748B'}`
                      }}
                      onError={(e) => { e.currentTarget.src = 'https://lh3.googleusercontent.com/a/default-user'; }}
                    />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.name || 'Thành Viên'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8899A6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </div>
                      <span style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        fontSize: '10px',
                        fontWeight: '700',
                        color: isAdmin ? '#F59E0B' : isSubscribed ? '#CBB193' : isExpired ? '#F87171' : '#94A3B8',
                        background: isAdmin ? 'rgba(245, 158, 11, 0.12)' : isSubscribed ? 'rgba(203, 177, 147, 0.15)' : isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        border: `1px solid ${isAdmin ? 'rgba(245, 158, 11, 0.3)' : isSubscribed ? 'rgba(203, 177, 147, 0.3)' : isExpired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`
                      }}>
                        {isAdmin ? '👑 Quản Trị Viên' : isSubscribed ? '💎 Pro Member' : isExpired ? '⚠️ Đã Hết Hạn' : '⚪ Chưa Kích Hoạt'}
                      </span>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: '#1E2638' }} />

                  {/* Subscription Info Box */}
                  <div style={{
                    background: '#0B0E14',
                    border: '1px solid #1E2638',
                    borderRadius: '4px',
                    padding: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#8899A6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Gói Dịch Vụ
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: isSubscribed ? '#4ADE80' : isExpired ? '#F87171' : '#94A3B8',
                        background: isSubscribed ? 'rgba(74, 222, 128, 0.12)' : isExpired ? 'rgba(248, 113, 113, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        border: `1px solid ${isSubscribed ? 'rgba(74, 222, 128, 0.3)' : isExpired ? 'rgba(248, 113, 113, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`
                      }}>
                        {isSubscribed ? '🟢 ĐANG HOẠT ĐỘNG' : isExpired ? '🔴 ĐÃ HẾT HẠN' : '⚪ CHƯA KÍCH HOẠT'}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#CBB193', marginBottom: '6px' }}>
                      {planName}
                    </div>

                    {isSubscribed && expiryFormatted && !isAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#CBD5E1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#8899A6' }}>Hạn sử dụng:</span>
                          <span style={{ color: '#00E5FF', fontWeight: '700' }}>{expiryFormatted}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span style={{ color: '#8899A6' }}>Thời gian còn lại:</span>
                          <span style={{ color: '#4ADE80', fontWeight: '700' }}>Còn {daysLeft} ngày</span>
                        </div>
                      </div>
                    )}

                    {isExpired && !isAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#CBD5E1' }}>
                        {expiryFormatted && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#8899A6' }}>Đã hết hạn vào:</span>
                            <span style={{ color: '#F87171', fontWeight: '700' }}>{expiryFormatted}</span>
                          </div>
                        )}
                        <div style={{ color: '#F87171', fontSize: '10px', marginTop: '2px' }}>
                          ⚠️ Gói đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.
                        </div>
                      </div>
                    )}

                    {isNotActivated && !isAdmin && (
                      <div style={{ fontSize: '11px', color: '#8899A6', marginTop: '2px' }}>
                        Tài khoản chưa từng đăng ký gói cước nào.
                      </div>
                    )}

                    {isAdmin && (
                      <div style={{ fontSize: '11px', color: '#F59E0B' }}>
                        Tài khoản Quản Trị Viên toàn quyền truy cập vĩnh viễn.
                      </div>
                    )}
                  </div>

                  {/* Navigation Links */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {effectiveUser && (
                      <Link
                        href="/admin"
                        onClick={() => setIsUserMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          background: 'rgba(203, 177, 147, 0.15)',
                          border: '1px solid rgba(203, 177, 147, 0.4)',
                          borderRadius: '4px',
                          color: '#CBB193',
                          fontSize: '12px',
                          fontWeight: '800',
                          textDecoration: 'none'
                        }}
                      >
                        <span>👑</span>
                        <span>Bảng Quản Trị Hệ Thống (Admin Dashboard)</span>
                      </Link>
                    )}

                    {!isSubscribed && !isAdmin && (
                      <Link
                        href="/subscription"
                        onClick={() => setIsUserMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                          borderRadius: '4px',
                          color: '#0B0E14',
                          fontSize: '12px',
                          fontWeight: '800',
                          textDecoration: 'none',
                          justifyContent: 'center'
                        }}
                      >
                        <span>💎</span>
                        <span>Đăng Ký Gói Pro ($15/Tháng)</span>
                      </Link>
                    )}
                  </div>

                  <div style={{ height: '1px', background: '#1E2638' }} />

                  {/* Logout Action */}
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout?.();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '4px',
                      color: '#F87171',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>🚪</span>
                    <span>Đăng xuất khỏi tài khoản</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Header Right: Avatar Trigger Button ONLY */}
        <div className="mobile-header-avatar-btn" onClick={() => setIsMobileDrawerOpen(true)}>
          <img
            src={user?.picture || 'https://lh3.googleusercontent.com/a/default-user'}
            alt="Avatar"
            className="mobile-avatar-img"
            onError={(e) => { e.currentTarget.src = 'https://lh3.googleusercontent.com/a/default-user'; }}
          />
          {isAdmin && <span className="mobile-admin-crown">👑</span>}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MOBILE LEFT DRAWER (SLIDES FROM LEFT ON AVATAR CLICK)                     */}
      {/* ========================================================================= */}
      {isMobileDrawerOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}

      <aside className={`mobile-left-drawer ${isMobileDrawerOpen ? 'open' : ''}`}>
        {/* Drawer Header: User Profile Card */}
        <div className="mobile-drawer-header">
          <div className="mobile-user-card">
            <img
              src={user?.picture || 'https://lh3.googleusercontent.com/a/default-user'}
              alt="Avatar"
              className="mobile-drawer-avatar"
              onError={(e) => { e.currentTarget.src = 'https://lh3.googleusercontent.com/a/default-user'; }}
            />
            <div className="mobile-user-details">
              <div className="mobile-user-name">
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </div>
              <div className="mobile-user-email">{user?.email || 'Chưa đăng nhập'}</div>
              <div className="mobile-user-badge-row">
                {isAdmin ? (
                  <span className="role-tag admin">👑 Quản trị viên</span>
                ) : (
                  <span className="role-tag pro">💎 Pro Member</span>
                )}
              </div>
            </div>
          </div>

          <button
            className="mobile-drawer-close-btn"
            onClick={() => setIsMobileDrawerOpen(false)}
            title="Đóng Menu"
          >
            ✕
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="mobile-drawer-body">
          
          {/* Group 1: Layout Selection */}
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">
              <span>🗖</span>
              <span>BỐ CỤC BIỂU ĐỒ (LAYOUT)</span>
            </div>
            <div className="mobile-layout-grid">
              {[
                { id: '1', label: '1 Khung (Single)', icon: '🗖' },
                { id: '2-col', label: '2 Cột Dọc', icon: '◫' },
                { id: '2-row', label: '2 Hàng Ngang', icon: '⬒' },
                { id: '3-col', label: '3 Cột', icon: '⊞' },
                { id: '3-grid', label: '3 Khung (1+2)', icon: '◰' },
                { id: '4-grid', label: '4 Khung (Lưới)', icon: '▦' },
              ].map((item) => (
                <button
                  key={item.id}
                  className={`mobile-layout-chip ${activeLayout === item.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectLayout?.(item.id);
                    setIsMobileDrawerOpen(false);
                  }}
                >
                  <span className="chip-icon">{item.icon}</span>
                  <span className="chip-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group 2: Fullscreen Action */}
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">
              <span>⛶</span>
              <span>TOÀN MÀN HÌNH</span>
            </div>
            <button
              className="mobile-action-card-btn"
              onClick={() => {
                onToggleFullscreen?.();
                setIsMobileDrawerOpen(false);
              }}
            >
              <span>{isFullscreen ? '🗗' : '⛶'}</span>
              <span>{isFullscreen ? 'Thoát toàn màn hình' : 'Bật toàn màn hình (Fullscreen)'}</span>
            </button>
          </div>

          {/* Group 3: Save & Autosave Layout */}
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">
              <span>💾</span>
              <span>LƯU TRỮ & BỐ CỤC</span>
            </div>

            {/* Auto-Save Switch */}
            <div
              className="mobile-toggle-card"
              onClick={() => onToggleAutoSave?.()}
            >
              <div>
                <div className="mobile-toggle-name">Tự động lưu bố cục</div>
                <div className="mobile-toggle-desc">
                  {isAutoSave ? (formattedSavedTime ? `Đã lưu lúc ${formattedSavedTime}` : 'Đang bật tự động lưu') : 'Đang tắt tự động lưu'}
                </div>
              </div>
              <div className={`toggle-switch-pill ${isAutoSave ? 'active' : ''}`}>
                <div className="toggle-switch-knob" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                className="mobile-secondary-btn"
                onClick={() => {
                  onSaveNow?.();
                  setIsMobileDrawerOpen(false);
                }}
              >
                <span>💾 Lưu ngay</span>
              </button>

              <button
                className="mobile-secondary-btn danger"
                onClick={() => {
                  if (window.confirm('Đặt lại toàn bộ bố cục và các khung về mặc định?')) {
                    onResetLayout?.();
                    setIsMobileDrawerOpen(false);
                  }
                }}
              >
                <span>🔄 Đặt lại</span>
              </button>
            </div>
          </div>


          {/* Group 5: Subscription & Admin Panel */}
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">
              <span>👑</span>
              <span>QUẢN TRỊ VIÊN & GÓI CƯỚC</span>
            </div>
            
            {/* Direct Admin Dashboard link for all users */}
            <Link
              href="/admin"
              className="mobile-admin-btn"
              onClick={() => setIsMobileDrawerOpen(false)}
              style={{
                textDecoration: 'none',
                background: 'linear-gradient(135deg, rgba(203, 177, 147, 0.22) 0%, rgba(171, 151, 140, 0.1) 100%)',
                borderColor: 'rgba(203, 177, 147, 0.5)',
                color: '#CBB193',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: '700',
                marginBottom: '10px'
              }}
            >
              <span>👑</span>
              <span>Bảng Quản Trị Hệ Thống (Admin)</span>
            </Link>

            {isSubscribed ? (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  borderRadius: '4px',
                  color: '#4ADE80',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ fontWeight: '800' }}>✅ Gói Pro Đang Hoạt Động</div>
                <div style={{ fontSize: '11px', color: '#A0AEC0' }}>
                  {planName} {expiryFormatted ? `• Hạn: ${expiryFormatted} (${daysLeft} ngày)` : ''}
                </div>
              </div>
            ) : isExpired ? (
              <Link
                href="/subscription"
                className="mobile-admin-btn"
                onClick={() => setIsMobileDrawerOpen(false)}
                style={{
                  textDecoration: 'none',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  color: '#F87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: '700'
                }}
              >
                <span>⏳</span>
                <span>Gói Cước Đã Hết Hạn - Gia Hạn Ngay</span>
              </Link>
            ) : (
              <Link
                href="/subscription"
                className="mobile-admin-btn"
                onClick={() => setIsMobileDrawerOpen(false)}
                style={{
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg, rgba(203, 177, 147, 0.18) 0%, rgba(171, 151, 140, 0.08) 100%)',
                  borderColor: 'rgba(203, 177, 147, 0.45)',
                  color: '#CBB193',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: '700'
                }}
              >
                <span>💎</span>
                <span>Chưa Kích Hoạt - Đăng Ký Gói Pro</span>
              </Link>
            )}
          </div>

          {/* Group 6: Logout Button (Elevated with bottom padding for mobile safe area) */}
          <div className="mobile-logout-wrapper">
            <button
              className="mobile-logout-btn"
              onClick={() => {
                setIsMobileDrawerOpen(false);
                onLogout?.();
              }}
            >
              <span>🚪</span>
              <span>Đăng xuất khỏi phiên làm việc</span>
            </button>
          </div>

        </div>
      </aside>

      <style jsx>{`
        .main-tv-header {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 99999 !important;
        }

        .user-dropdown-wrapper {
          position: relative;
          z-index: 999999 !important;
        }

        .user-dropdown-card {
          z-index: 2147483647 !important;
        }

        .subscription-btn-highlight {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .subscription-btn-highlight:hover {
          background: linear-gradient(135deg, rgba(203, 177, 147, 0.3) 0%, rgba(171, 151, 140, 0.15) 100%) !important;
          border-color: #CBB193 !important;
          color: #FFFFFF !important;
          transform: translateY(-1px);
        }

        .mobile-header-avatar-btn {
          display: none;
        }

        .mobile-drawer-backdrop {
          display: none;
        }

        .mobile-left-drawer {
          display: none;
        }

        @media (max-width: 768px) {
          .desktop-only-controls {
            display: none !important;
          }

          .desktop-only-item {
            display: none !important;
          }

          .brand-logo {
            display: none !important;
          }

          .main-tv-header {
            padding: 3px 6px;
            min-height: 38px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
          }

          .brand-section {
            display: flex;
            align-items: center;
            gap: 5px;
            flex: 1;
            min-width: 0;
            overflow-x: auto;
            scrollbar-width: none;
          }

          .brand-section::-webkit-scrollbar {
            display: none;
          }

          .symbol-pill {
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 700;
            border-radius: 4px;
            flex-shrink: 0;
          }

          .tf-group {
            flex-shrink: 0;
            display: flex;
            gap: 2px;
            padding: 1px 2px;
          }

          .tf-btn {
            padding: 3px 6px;
            font-size: 10px;
          }

          /* Mobile Avatar Trigger Button on Header */
          .mobile-header-avatar-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            cursor: pointer;
            padding: 2px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 50%;
            flex-shrink: 0;
            margin-left: 4px;
          }

          .mobile-avatar-img {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            object-fit: cover;
          }

          .mobile-admin-crown {
            position: absolute;
            top: -5px;
            right: -5px;
            font-size: 10px;
          }

          /* Mobile Backdrop */
          .mobile-drawer-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            z-index: 1500;
            animation: fadeInBackdrop 0.2s ease-out;
          }

          /* Mobile Left Drawer */
          .mobile-left-drawer {
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: min(85vw, 340px);
            background: #131722;
            border-right: 1px solid #252a38;
            box-shadow: 10px 0 35px rgba(0, 0, 0, 0.9);
            z-index: 1600;
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
          }

          .mobile-left-drawer.open {
            transform: translateX(0);
          }

          .mobile-drawer-header {
            padding: 18px 16px 14px 16px;
            background: #181d2a;
            border-bottom: 1px solid #252a38;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .mobile-user-card {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }

          .mobile-drawer-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #CBB193;
            flex-shrink: 0;
          }

          .mobile-user-details {
            min-width: 0;
          }

          .mobile-user-name {
            font-size: 14px;
            font-weight: 700;
            color: #E9E6E7;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobile-user-email {
            font-size: 11px;
            color: #6B7C98;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px;
          }

          .mobile-user-badge-row {
            margin-top: 4px;
          }

          .role-tag {
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 3px;
            display: inline-block;
          }

          .role-tag.admin {
            background: rgba(203, 177, 147, 0.15);
            color: #CBB193;
            border: 1px solid rgba(203, 177, 147, 0.3);
          }

          .role-tag.pro {
            background: rgba(0, 229, 255, 0.15);
            color: #00E5FF;
            border: 1px solid rgba(0, 229, 255, 0.3);
          }

          .mobile-drawer-close-btn {
            background: #202636;
            border: 1px solid #2b3245;
            color: #AB978C;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .mobile-drawer-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 18px;
          }

          .mobile-drawer-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .mobile-group-title {
            font-size: 11px;
            font-weight: 800;
            color: #6B7C98;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .mobile-layout-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }

          .mobile-layout-chip {
            background: #181d2a;
            border: 1px solid #252a38;
            border-radius: 4px;
            padding: 8px 10px;
            color: #d1d4dc;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .mobile-layout-chip.active {
            background: rgba(41, 98, 255, 0.2);
            color: #2962FF;
            border-color: #2962FF;
          }

          .mobile-action-card-btn {
            width: 100%;
            background: #181d2a;
            border: 1px solid #252a38;
            border-radius: 4px;
            padding: 10px 12px;
            color: #E9E6E7;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }

          .mobile-toggle-card {
            background: #181d2a;
            border: 1px solid #252a38;
            border-radius: 4px;
            padding: 10px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
          }

          .mobile-toggle-name {
            font-size: 12px;
            font-weight: 600;
            color: #E9E6E7;
          }

          .mobile-toggle-desc {
            font-size: 10px;
            color: #6B7C98;
            margin-top: 2px;
          }

          .mobile-secondary-btn {
            flex: 1;
            background: #181d2a;
            border: 1px solid #252a38;
            border-radius: 4px;
            padding: 8px 10px;
            color: #E9E6E7;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          }

          .mobile-secondary-btn.danger {
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.3);
          }

          .mobile-admin-btn {
            width: 100%;
            background: rgba(203, 177, 147, 0.15);
            border: 1px solid rgba(203, 177, 147, 0.4);
            border-radius: 4px;
            padding: 10px 14px;
            color: #CBB193;
            font-size: 12px;
            font-weight: 700;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .mobile-logout-wrapper {
            margin-top: auto;
            padding-top: 18px;
            padding-bottom: max(32px, env(safe-area-inset-bottom, 24px));
            border-top: 1px solid #1e222d;
          }

          .mobile-logout-btn {
            width: 100%;
            background: rgba(239, 68, 68, 0.14);
            border: 1px solid rgba(239, 68, 68, 0.4);
            border-radius: 6px;
            padding: 13px 16px;
            color: #f87171;
            font-size: 13.5px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.15);
            transition: all 0.15s ease;
          }

          .mobile-logout-btn:active {
            background: rgba(239, 68, 68, 0.25);
            transform: scale(0.98);
          }
        }

        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
