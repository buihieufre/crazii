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
  isAutoSave = true,
  onToggleAutoSave,
  saveStatus = 'saved', // 'saved' | 'saving' | 'idle'
  lastSavedTime = null,
  onSaveNow,
  onResetLayout,
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const layoutDropdownRef = useRef(null);
  const saveDropdownRef = useRef(null);

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
    tokenTitle = 'Refresh Token đã hết hạn hoặc chưa cấu hình. Click để dán token mới từ crazii.com';
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
    <header>
      <div className="brand-section">
        <div className="brand-logo">CRAZII<span>.COM</span></div>
        
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
          <span>{currentCode || 'Chọn tài sản'}</span>
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

        {/* Live WebSocket Status */}
        <div className={wsBadgeClass}>
          <span className="live-dot" style={{ width: 5, height: 5 }}></span>
          <span>{wsText}</span>
        </div>

        {/* Live Token Status Pill */}
        <div className={tokenPillClass} onClick={onOpenTokenModal} title={tokenTitle}>
          <span className="live-dot" style={{ width: 5, height: 5 }}></span>
          <span>{tokenLabel}</span>
        </div>
      </div>

      {/* Direct DOM OHLC Bar (Zero React Re-render at 60fps) */}
      <div className="ohlc-bar">
        <div className="ohlc-item">
          <span className="ohlc-lbl">O:</span>
          <span id="ohlc-val-o" className="ohlc-val">-</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">H:</span>
          <span id="ohlc-val-h" className="ohlc-val">-</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">L:</span>
          <span id="ohlc-val-l" className="ohlc-val">-</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">C:</span>
          <span id="ohlc-val-c" className="ohlc-val">-</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">TWB O:</span>
          <span id="ohlc-val-twb-o" className="ohlc-val">-</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">TWB C:</span>
          <span id="ohlc-val-twb-c" className="ohlc-val">-</span>
        </div>
        <span id="ohlc-twb-tag" className="twb-tag" style={{ display: 'none' }}>-</span>
      </div>

      {/* Controls */}
      <div className="controls-section">
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

        {/* Telegram Signal Bot Dashboard Button (Temporarily Hidden) */}
        {/*
        <Link
          href="/bot-config"
          className="btn"
          style={{
            textDecoration: 'none',
            background: 'rgba(0, 229, 255, 0.1)',
            borderColor: 'rgba(0, 229, 255, 0.35)',
            color: '#00E5FF',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}
          title="Cấu hình Live Telegram Signal Bot"
        >
          <span>🤖</span>
          <span>Bot Signals</span>
        </Link>
        */}

        {/* Fullscreen Toggle Button */}
        <button
          className="btn"
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình (Fullscreen)"}
        >
          <span>{isFullscreen ? '🗗' : '⛶'}</span>
          <span>{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
        </button>
      </div>
    </header>
  );
}

