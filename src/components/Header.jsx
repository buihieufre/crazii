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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const layoutDropdownRef = useRef(null);
  const saveDropdownRef = useRef(null);

  const isAdmin = Boolean(
    user && (
      ['dhieu9b@gmail.com', 'buidinhhieu9b@gmail.com'].includes((user.email || '').toLowerCase().trim()) ||
      user.role === 'admin'
    )
  );

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(e.target)) {
        setIsLayoutMenuOpen(false);
      }
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target)) {
        setIsSaveMenuOpen(false);
      }
    }
    if (isLayoutMenuOpen || isSaveMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLayoutMenuOpen, isSaveMenuOpen]);

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
      <header className="main-tv-header">
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

          {/* Desktop Status Badges (Hidden on Mobile) */}
          <div className={`desktop-only-item ${wsBadgeClass}`}>
            <span className="live-dot" style={{ width: 5, height: 5 }}></span>
            <span>{wsText}</span>
          </div>

          <div className={`desktop-only-item ${tokenPillClass}`} onClick={onOpenTokenModal} title={tokenTitle}>
            <span className="live-dot" style={{ width: 5, height: 5 }}></span>
            <span>{tokenLabel}</span>
          </div>
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

          {/* Admin Management Button (Hidden for regular users) */}
          {isAdmin && (
            <Link
              href="/subscription"
              className="btn"
              style={{
                textDecoration: 'none',
                background: 'rgba(203, 177, 147, 0.15)',
                borderColor: 'rgba(203, 177, 147, 0.4)',
                color: '#CBB193',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: '700'
              }}
              title="Quản Trị Viên: Tạo TK Dùng Thử & Quản Lý"
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

          {/* User Profile & Logout Button */}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px 3px 4px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
                onClick={() => setIsMobileDrawerOpen(true)}
                title={user.email}
              >
                <img
                  src={user.picture || 'https://lh3.googleusercontent.com/a/default-user'}
                  alt="Avatar"
                  style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <span style={{ maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || user.email?.split('@')[0]}
                </span>
              </div>

              <button
                className="btn"
                onClick={onLogout}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: '#ff8a80',
                  borderColor: 'rgba(255, 82, 82, 0.3)',
                  background: 'rgba(255, 82, 82, 0.08)',
                }}
                title="Đăng xuất khỏi phiên làm việc"
              >
                <span>🚪</span>
                <span>Đăng xuất</span>
              </button>
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

          {/* Group 4: System & Token Status */}
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">
              <span>⚡</span>
              <span>TRẠNG THÁI HỆ THỐNG</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className={wsBadgeClass} style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}>
                <span className="live-dot" style={{ width: 6, height: 6 }}></span>
                <span style={{ fontSize: '12px' }}>Máy chủ WebSocket: {wsText}</span>
              </div>

              <div
                className={tokenPillClass}
                style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}
                onClick={() => {
                  onOpenTokenModal?.();
                  setIsMobileDrawerOpen(false);
                }}
              >
                <span className="live-dot" style={{ width: 6, height: 6 }}></span>
                <span style={{ fontSize: '12px' }}>{tokenLabel}</span>
              </div>
            </div>
          </div>

          {/* Group 5: Admin Management Panel (If Admin) */}
          {isAdmin && (
            <div className="mobile-drawer-group">
              <div className="mobile-group-title">
                <span>👑</span>
                <span>QUẢN TRỊ VIÊN</span>
              </div>
              <Link
                href="/subscription"
                className="mobile-admin-btn"
                onClick={() => setIsMobileDrawerOpen(false)}
              >
                <span>👑</span>
                <span>Tạo Tài Khoản Dùng Thử & Quản Trị</span>
              </Link>
            </div>
          )}

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
