'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Header from '@/components/Header';
import ChartContainer from '@/components/ChartContainer';
import TokenModal from '@/components/TokenModal';
import AssetSelector from '@/components/AssetSelector';
import { calculateBarCountdown } from '@/lib/utils';
import { updateHeaderCountdown } from '@/lib/ohlc-updater';
import { getSymbolByCode } from '@/lib/assets-data';

export default function TerminalPage() {
  const chartRef = useRef(null);
  const socketRef = useRef(null);

  // Standby initial state: No asset selected by default to avoid Crazii session conflict
  const [activeSymbolObj, setActiveSymbolObj] = useState(null);
  const [currentCode, setCurrentCode] = useState(null);
  const [timeframeLabel, setTimeframeLabel] = useState('5m');
  const [timeframeMinutes, setTimeframeMinutes] = useState(5);
  const [wsStatus, setWsStatus] = useState('idle'); // 'idle' | 'live' | 'cloud' | 'reconnecting' | 'disconnected'
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(true); // Open watchlist on arrival
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [ksiLabelText, setKsiLabelText] = useState('BOYS BUYING (KSI)');
  const [kcxLabelText, setKcxLabelText] = useState('BEARISHNESS (KCX)');

  const currentCodeRef = useRef(currentCode);
  currentCodeRef.current = currentCode;

  const timeframeMinutesRef = useRef(timeframeMinutes);
  timeframeMinutesRef.current = timeframeMinutes;

  // Fetch Token Info from Backend
  const fetchTokenInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/token-info');
      if (!res.ok) return;
      const data = await res.json();
      setTokenInfo(data);
    } catch (e) {
      console.warn('Failed to fetch token info:', e);
    }
  }, []);

  // Fetch Historical Candles Strictly On-Demand (Only when an asset is selected)
  const fetchCandles = useCallback(async (codeToFetch = currentCode, isSilent = false, isInitial = false) => {
    if (!codeToFetch) return;
    if (!isSilent) setIsRefreshing(true);

    try {
      const res = await fetch(`/api/candles?code=${encodeURIComponent(codeToFetch)}`);
      const contentType = res.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        if (!isSilent) {
          setNotification({
            type: 'error',
            message: `API trả về phản hồi không hợp lệ (${res.status}). Vui lòng kiểm tra biến môi trường CRAZII_REFRESH_TOKEN trên Vercel / Server.`
          });
        }
        return;
      }

      const result = await res.json();

      if (!res.ok) {
        if (!isSilent) {
          setNotification({
            type: 'error',
            message: `API (${codeToFetch}): ${result.message || 'Authentication required. Check CRAZII_REFRESH_TOKEN in Environment Variables.'}`
          });
        }
        return;
      }

      let list = [];
      if (Array.isArray(result)) list = result;
      else if (Array.isArray(result.data)) list = result.data;
      else if (Array.isArray(result.candles)) list = result.candles;
      else if (result.success && Array.isArray(result.result)) list = result.result;

      if (list.length === 0) {
        if (!isSilent) {
          setNotification({
            type: 'info',
            message: `Received 0 candle records for ${codeToFetch}.`
          });
        }
        return;
      }

      setNotification(null);

      if (chartRef.current) {
        chartRef.current.renderDataset(list, isInitial);
      }

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('subscribe', codeToFetch);
        socketRef.current.emit('subscribe', 'price');
      }
    } catch (err) {
      if (!isSilent) {
        setNotification({
          type: 'error',
          message: `Lỗi kết nối API: ${err.message}`
        });
      }
    } finally {
      if (!isSilent) setIsRefreshing(false);
    }
  }, [currentCode]);

  // Handle Asset Switch from Watchlist (Activates Streaming strictly on click)
  const handleSelectAsset = useCallback((symbolCode, tfCode, tfName, tfMinutes) => {
    const symObj = getSymbolByCode(symbolCode);
    setActiveSymbolObj(symObj);
    setCurrentCode(tfCode);
    setTimeframeLabel(tfName);
    setTimeframeMinutes(tfMinutes);
    fetchCandles(tfCode, false, true);
  }, [fetchCandles]);

  // Handle Timeframe Switch (Activates Streaming for chosen timeframe)
  const handleSelectTimeframe = useCallback((code, label, minutes) => {
    setCurrentCode(code);
    setTimeframeLabel(label);
    setTimeframeMinutes(minutes);
    fetchCandles(code, false, true);
  }, [fetchCandles]);

  // Real-time Countdown Timer Loop (Direct DOM update at 60fps)
  useEffect(() => {
    if (!currentCode) return;

    function updateCountdown() {
      const formatted = calculateBarCountdown(timeframeMinutesRef.current);
      updateHeaderCountdown(formatted);

      const scaleCountdownEl = document.querySelector('.tv-scale-countdown-text');
      if (scaleCountdownEl) {
        scaleCountdownEl.innerText = formatted;
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentCode, timeframeMinutes]);

  // Setup WebSocket Listener / Live Polling Fallback (STRICTLY ON-DEMAND when an asset is clicked)
  useEffect(() => {
    if (!currentCode) {
      setWsStatus('idle');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    let socket = null;
    let isVercel = false;

    if (typeof window !== 'undefined') {
      isVercel = window.location.hostname.includes('vercel.app');
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (isVercel ? null : undefined);

    if (wsUrl !== null) {
      try {
        socket = io(wsUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 2000,
          timeout: 5000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          setWsStatus('live');
          socket.emit('subscribe', 'price');
          socket.emit('subscribe', currentCodeRef.current);
        });

        socket.on('disconnect', () => {
          setWsStatus('disconnected');
        });

        socket.on('connect_error', () => {
          setWsStatus('cloud');
        });

        socket.on('upstream_status', (status) => {
          if (status.connected) setWsStatus('live');
          else if (status.reconnecting) setWsStatus('reconnecting');
          else setWsStatus('cloud');
        });

        socket.on('token_refreshed', () => {
          fetchTokenInfo();
        });

        // Full CSV Candle Stream (Zero React Re-render)
        socket.on('data', (csvPayload) => {
          if (typeof csvPayload !== 'string') return;
          const parts = csvPayload.split(',');
          if (parts.length < 13) return;

          if (chartRef.current) {
            chartRef.current.updateLiveCsv(parts);
          }

          const ksiText = parts[46]?.trim();
          const kcxText = parts[41]?.trim();
          if (ksiText) setKsiLabelText((prev) => (prev !== `${ksiText} (KSI)` ? `${ksiText} (KSI)` : prev));
          if (kcxText) setKcxLabelText((prev) => (prev !== `${kcxText} (KCX)` ? `${kcxText} (KCX)` : prev));
        });

        // Sub-second Live Tick Price (Zero React Re-render)
        socket.on('price', (symbol, priceStr) => {
          const expectedSymbol = currentCodeRef.current?.split('_')[0];
          if (symbol !== expectedSymbol) return;

          if (chartRef.current) {
            chartRef.current.updateLiveTickPrice(priceStr);
          }
        });
      } catch (e) {
        setWsStatus('cloud');
      }
    } else {
      setWsStatus('cloud');
    }

    // High-performance Live Polling Fallback when WebSocket is not active (e.g. on Vercel)
    const pollInterval = setInterval(() => {
      if (currentCodeRef.current && (!socket || !socket.connected)) {
        fetchCandles(currentCodeRef.current, true);
      }
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      if (socket) {
        if (currentCodeRef.current) {
          socket.emit('unsubscribe', currentCodeRef.current);
          socket.emit('unsubscribe', 'price');
        }
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [currentCode, fetchCandles, fetchTokenInfo]);

  // Initial Load On Page Access (Only verifies Token, DOES NOT call candle API until an asset is clicked)
  useEffect(() => {
    fetchTokenInfo();

    const tokenInterval = setInterval(fetchTokenInfo, 15000);
    return () => clearInterval(tokenInterval);
  }, [fetchTokenInfo]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Header */}
      <Header
        currentCode={currentCode}
        activeSymbolObj={activeSymbolObj}
        onOpenAssetSelector={() => setIsAssetSelectorOpen(true)}
        timeframeLabel={timeframeLabel}
        onSelectTimeframe={handleSelectTimeframe}
        wsStatus={wsStatus}
        tokenInfo={tokenInfo}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        isRefreshing={isRefreshing}
        onRefresh={() => {
          if (currentCode) fetchCandles(currentCode, false, false);
          else setIsAssetSelectorOpen(true);
        }}
      />

      {/* Notification Banner */}
      {notification && (
        <div id="notification-banner" className={notification.type}>
          <span>{notification.message}</span>
          <button className="btn" onClick={() => setNotification(null)}>&times;</button>
        </div>
      )}

      {/* Main Interactive Chart Viewport */}
      <ChartContainer
        ref={chartRef}
        currentCode={currentCode}
        activeSymbolObj={activeSymbolObj}
        ksiLabelText={ksiLabelText}
        kcxLabelText={kcxLabelText}
        onOpenAssetSelector={() => setIsAssetSelectorOpen(true)}
      />

      {/* Asset Selector Watchlist Modal */}
      <AssetSelector
        isOpen={isAssetSelectorOpen}
        onClose={() => {
          // Allow closing if an asset is already selected
          if (currentCode) setIsAssetSelectorOpen(false);
        }}
        currentSymbolCode={activeSymbolObj?.code}
        currentTimeframeCode={currentCode}
        onSelectAsset={handleSelectAsset}
      />

      {/* Token & Auto-Refresh Modal */}
      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        tokenInfo={tokenInfo}
        onRefreshTokenSuccess={() => {
          fetchTokenInfo();
          if (currentCode) fetchCandles(currentCode, false, false);
        }}
      />
    </div>
  );
}
