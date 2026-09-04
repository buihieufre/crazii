'use client';

import React from 'react';
import { TIMEFRAMES } from '@/lib/chart-constants';
import { formatTimeRemaining } from '@/lib/utils';

export default function Header({
  currentCode,
  timeframeLabel,
  onSelectTimeframe,
  wsStatus,
  tokenInfo,
  onOpenTokenModal,
  ohlc,
  isRefreshing,
  onRefresh,
  countdownText
}) {
  const isBullish = ohlc.twbClose > ohlc.twbOpen;
  const isBearish = ohlc.twbClose < ohlc.twbOpen;

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
  if (wsStatus === 'reconnecting') {
    wsBadgeClass += ' reconnecting';
    wsText = 'WS Reconnecting...';
  } else if (wsStatus === 'disconnected') {
    wsBadgeClass += ' disconnected';
    wsText = 'WS Disconnected';
  }

  return (
    <header>
      <div className="brand-section">
        <div className="brand-logo">CRAZII<span>.COM</span></div>
        
        <div className="symbol-pill">
          <span className="live-dot"></span>
          <span>{currentCode}</span>
          {countdownText && (
            <span className="tv-header-countdown">({countdownText})</span>
          )}
        </div>

        {/* Timeframe Selector */}
        <div className="tf-group">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.code}
              className={`tf-btn ${currentCode === tf.code ? 'active' : ''}`}
              onClick={() => onSelectTimeframe(tf.code, tf.label, tf.minutes)}
            >
              {tf.label}
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

      {/* Live Dynamic OHLC Values */}
      <div className="ohlc-bar">
        <div className="ohlc-item">
          <span className="ohlc-lbl">O:</span>
          <span className="ohlc-val">{ohlc.open !== undefined ? Number(ohlc.open).toFixed(2) : '-'}</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">H:</span>
          <span className="ohlc-val">{ohlc.high !== undefined ? Number(ohlc.high).toFixed(2) : '-'}</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">L:</span>
          <span className="ohlc-val">{ohlc.low !== undefined ? Number(ohlc.low).toFixed(2) : '-'}</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">C:</span>
          <span className={`ohlc-val ${ohlc.flash || ''}`}>
            {ohlc.close !== undefined ? Number(ohlc.close).toFixed(2) : '-'}
          </span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">TWB O:</span>
          <span className="ohlc-val">{ohlc.twbOpen !== undefined ? Number(ohlc.twbOpen).toFixed(2) : '-'}</span>
        </div>
        <div className="ohlc-item">
          <span className="ohlc-lbl">TWB C:</span>
          <span className="ohlc-val">{ohlc.twbClose !== undefined ? Number(ohlc.twbClose).toFixed(2) : '-'}</span>
        </div>

        {ohlc.twbOpen !== undefined && ohlc.twbClose !== undefined && (
          <span
            className={`twb-tag ${isBullish ? 'twb-bullish' : isBearish ? 'twb-bearish' : ''}`}
          >
            {isBullish ? '🟡 BULLISH' : isBearish ? '🔴 BEARISH' : '⚪ NEUTRAL'}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="controls-section">
        <select
          className="select-symbol"
          value={currentCode}
          onChange={(e) => {
            const found = TIMEFRAMES.find(t => t.code === e.target.value);
            if (found) onSelectTimeframe(found.code, found.label, found.minutes);
          }}
        >
          <option value="XAUUSD.ca_5">XAUUSD 5M (Default)</option>
          <option value="XAUUSD.ca_15">XAUUSD 15M</option>
          <option value="XAUUSD.ca_1440">XAUUSD 1D</option>
        </select>

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
