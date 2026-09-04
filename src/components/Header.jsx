'use client';

import React from 'react';
import { formatTimeRemaining } from '@/lib/utils';

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
}) {
  const accessLeft = tokenInfo?.accessToken?.timeLeftSeconds || 0;
  const refreshLeft = tokenInfo?.refreshToken?.timeLeftSeconds || 0;
  const hasValidAccess = tokenInfo?.accessToken?.hasToken && !tokenInfo?.accessToken?.isExpired;
  const hasValidRefresh = tokenInfo?.refreshToken?.hasToken && !tokenInfo?.refreshToken?.isExpired;

  let tokenPillClass = 'token-status-pill';
  let tokenLabel = 'Token: Đang kiểm tra...';

  if (hasValidAccess) {
    if (accessLeft <= 180) {
      tokenPillClass += ' expiring';
      tokenLabel = `🔑 Token: ${formatTimeRemaining(accessLeft)} 🔄`;
    } else {
      tokenPillClass += ' valid';
      tokenLabel = `🔑 Token: ${formatTimeRemaining(accessLeft)}`;
    }
  } else if (hasValidRefresh) {
    tokenPillClass += ' expiring';
    tokenLabel = `🔑 Token: Đang cấp mới...`;
  } else {
    tokenPillClass += ' expired';
    tokenLabel = `🔑 Token: Hết hạn (Click nhập)`;
  }

  let wsBadgeClass = 'ws-status-badge';
  let wsText = 'WS Live';
  if (wsStatus === 'cloud') {
    wsBadgeClass = 'ws-status-badge';
    wsText = 'Cloud Live';
  } else if (wsStatus === 'reconnecting') {
    wsBadgeClass += ' reconnecting';
    wsText = 'WS Reconnecting...';
  } else if (wsStatus === 'disconnected') {
    wsBadgeClass += ' disconnected';
    wsText = 'WS Disconnected';
  }

  const availableTimeframes = activeSymbolObj?.timeframes || [
    { code: `${activeSymbolObj?.code || 'XAUUSD.ca'}_5`, name: '5m', minutes: 5 },
    { code: `${activeSymbolObj?.code || 'XAUUSD.ca'}_15`, name: '15m', minutes: 15 },
    { code: `${activeSymbolObj?.code || 'XAUUSD.ca'}_1440`, name: '1D', minutes: 1440 }
  ];

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
          <span className="live-dot"></span>
          <span>{currentCode}</span>
          <span id="header-countdown-text" className="tv-header-countdown"></span>
          <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▼</span>
        </div>

        {/* Timeframe Selector for Active Symbol */}
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

        {/* Live WebSocket Status */}
        <div className={wsBadgeClass}>
          <span className="live-dot" style={{ width: 5, height: 5 }}></span>
          <span>{wsText}</span>
        </div>

        {/* Live Token Status Pill */}
        <div className={tokenPillClass} onClick={onOpenTokenModal} title="Quản lý Token & Auto-Refresh">
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
        <button className="btn" onClick={onOpenAssetSelector} title="Mở danh sách tài sản">
          <span>📊 Assets</span>
        </button>

        <button className="btn" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? <span className="spinner"></span> : <span>🔄</span>}
          <span>Refresh</span>
        </button>

        <button className="btn" onClick={onOpenTokenModal}>
          <span>🔑 Token</span>
        </button>
      </div>
    </header>
  );
}
