'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Header from '@/components/Header';
import ChartContainer from '@/components/ChartContainer';
import TokenModal from '@/components/TokenModal';
import { calculateBarCountdown } from '@/lib/utils';

export default function TerminalPage() {
  const chartRef = useRef(null);
  const socketRef = useRef(null);

  const [currentCode, setCurrentCode] = useState('XAUUSD.ca_5');
  const [timeframeLabel, setTimeframeLabel] = useState('5m');
  const [timeframeMinutes, setTimeframeMinutes] = useState(5);
  const [wsStatus, setWsStatus] = useState('live'); // 'live' | 'reconnecting' | 'disconnected'
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [countdownText, setCountdownText] = useState('05:00');
  const [ksiLabelText, setKsiLabelText] = useState('BOYS BUYING (KSI)');
  const [kcxLabelText, setKcxLabelText] = useState('BEARISHNESS (KCX)');

  const [ohlc, setOhlc] = useState({
    open: undefined,
    high: undefined,
    low: undefined,
    close: undefined,
    twbOpen: undefined,
    twbClose: undefined,
    flash: null,
  });

  const prevPriceRef = useRef(null);

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

  // Fetch Historical Candles
  const fetchCandles = useCallback(async (codeToFetch = currentCode) => {
    setIsRefreshing(true);
    setNotification(null);

    try {
      const res = await fetch(`/api/candles?code=${encodeURIComponent(codeToFetch)}`);
      const result = await res.json();

      if (!res.ok) {
        setNotification({
          type: 'error',
          message: `API (${codeToFetch}): ${result.message || 'Authentication required.'}`
        });
        return;
      }

      let list = [];
      if (Array.isArray(result)) list = result;
      else if (Array.isArray(result.data)) list = result.data;
      else if (Array.isArray(result.candles)) list = result.candles;
      else if (result.success && Array.isArray(result.result)) list = result.result;

      if (list.length === 0) {
        setNotification({
          type: 'info',
          message: `Received 0 candle records for ${codeToFetch}.`
        });
        return;
      }

      if (chartRef.current) {
        chartRef.current.renderDataset(list);
      }

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('subscribe', codeToFetch);
        socketRef.current.emit('subscribe', 'price');
      }
    } catch (err) {
      setNotification({
        type: 'error',
        message: `Proxy unreachable: ${err.message}. Ensure 'node server.js' is running.`
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [currentCode]);

  // Handle Timeframe Switch
  const handleSelectTimeframe = useCallback((code, label, minutes) => {
    setCurrentCode(code);
    setTimeframeLabel(label);
    setTimeframeMinutes(minutes);
    fetchCandles(code);
  }, [fetchCandles]);

  // Real-time Countdown Timer Loop
  useEffect(() => {
    function tick() {
      const formatted = calculateBarCountdown(timeframeMinutes);
      setCountdownText(formatted);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timeframeMinutes]);

  // Setup WebSocket Listener
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setWsStatus('live');
      socket.emit('subscribe', 'price');
      socket.emit('subscribe', currentCode);
    });

    socket.on('disconnect', () => {
      setWsStatus('disconnected');
    });

    socket.on('upstream_status', (status) => {
      if (status.connected) setWsStatus('live');
      else if (status.reconnecting) setWsStatus('reconnecting');
      else setWsStatus('disconnected');
    });

    socket.on('token_refreshed', () => {
      fetchTokenInfo();
    });

    // Full CSV Candle Stream
    socket.on('data', (csvPayload) => {
      if (typeof csvPayload !== 'string') return;
      const parts = csvPayload.split(',');
      if (parts.length < 13) return;

      if (chartRef.current) {
        chartRef.current.updateLiveCsv(parts);
      }

      const ksiText = parts[46]?.trim();
      const kcxText = parts[41]?.trim();
      if (ksiText) setKsiLabelText(`${ksiText} (KSI)`);
      if (kcxText) setKcxLabelText(`${kcxText} (KCX)`);
    });

    // Sub-second Live Tick Price
    socket.on('price', (symbol, priceStr) => {
      const expectedSymbol = currentCode.split('_')[0];
      if (symbol !== expectedSymbol) return;

      const price = parseFloat(priceStr);
      if (isNaN(price)) return;

      if (chartRef.current) {
        chartRef.current.updateLiveTickPrice(price);
      }

      setOhlc((prev) => {
        let flash = null;
        if (prev.close !== undefined) {
          if (price > prev.close) flash = 'flash-up';
          else if (price < prev.close) flash = 'flash-down';
        }
        return {
          ...prev,
          close: price,
          high: prev.high !== undefined ? Math.max(prev.high, price) : price,
          low: prev.low !== undefined ? Math.min(prev.low, price) : price,
          flash: flash,
        };
      });

      if (prevPriceRef.current !== null) {
        setTimeout(() => {
          setOhlc((prev) => ({ ...prev, flash: null }));
        }, 400);
      }
      prevPriceRef.current = price;
    });

    return () => {
      socket.disconnect();
    };
  }, [currentCode, fetchTokenInfo]);

  // Initial Load
  useEffect(() => {
    fetchTokenInfo();
    fetchCandles('XAUUSD.ca_5');

    const tokenInterval = setInterval(fetchTokenInfo, 10000);
    return () => clearInterval(tokenInterval);
  }, [fetchTokenInfo, fetchCandles]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Header */}
      <Header
        currentCode={currentCode}
        timeframeLabel={timeframeLabel}
        onSelectTimeframe={handleSelectTimeframe}
        wsStatus={wsStatus}
        tokenInfo={tokenInfo}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        ohlc={ohlc}
        isRefreshing={isRefreshing}
        onRefresh={() => fetchCandles(currentCode)}
        countdownText={countdownText}
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
        countdownText={countdownText}
        onCrosshairOHLC={(data) => setOhlc((prev) => ({ ...prev, ...data }))}
        ksiLabelText={ksiLabelText}
        kcxLabelText={kcxLabelText}
      />

      {/* Token & Auto-Refresh Modal */}
      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        tokenInfo={tokenInfo}
        onRefreshTokenSuccess={() => {
          fetchTokenInfo();
          fetchCandles(currentCode);
        }}
      />
    </div>
  );
}
