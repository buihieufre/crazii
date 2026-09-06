'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const AVAILABLE_PAIRS = [
  { code: 'XAUUSD.ca_5', name: 'XAUUSD (Vàng)', tf: '5m' },
  { code: 'XAUUSD.ca_15', name: 'XAUUSD (Vàng)', tf: '15m' },
  { code: 'XAUUSD.ca_60', name: 'XAUUSD (Vàng)', tf: '1h' },
  { code: 'BTCUSD_5', name: 'BTCUSD (Bitcoin)', tf: '5m' },
  { code: 'BTCUSD_15', name: 'BTCUSD (Bitcoin)', tf: '15m' },
  { code: 'BTCUSD_60', name: 'BTCUSD (Bitcoin)', tf: '1h' },
  { code: 'ETHUSD_5', name: 'ETHUSD (Ethereum)', tf: '5m' },
  { code: 'ETHUSD_15', name: 'ETHUSD (Ethereum)', tf: '15m' },
  { code: 'EURUSD_5', name: 'EURUSD', tf: '5m' },
  { code: 'EURUSD_15', name: 'EURUSD', tf: '15m' },
  { code: 'GBPUSD_5', name: 'GBPUSD', tf: '5m' },
  { code: 'USDJPY_5', name: 'USDJPY', tf: '5m' }
];

export default function BotConfigPage() {
  // Navigation Tabs: 'config' (OPT 1) | 'simulator' (OPT 2) | 'trades' (OPT 3)
  const [activeTab, setActiveTab] = useState('config');

  // Config state
  const [config, setConfig] = useState({
    enabled: false,
    botToken: '',
    chatId: '',
    maxConcurrentTrades: 10,
    defaultSlOffset: 20,
    monitoredSymbols: ['XAUUSD.ca_5', 'BTCUSD_5'],
    enableNotifications: true,
    allowEarlyCut: true,
    autoMoveSlToBreakEven: true
  });

  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error' | 'info', message: string }

  // Trades state
  const [activeTrades, setActiveTrades] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [stats, setStats] = useState({ totalTrades: 0, activeCount: 0, historyCount: 0, winCount: 0, lossCount: 0 });
  const [isLoadingTrades, setIsLoadingTrades] = useState(true);

  // Simulator state
  const [simPair, setSimPair] = useState('XAUUSD.ca_5');
  const [simDir, setSimDir] = useState(1);
  const [simEntry, setSimEntry] = useState('2918.50');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastSimTradeId, setLastSimTradeId] = useState(null);
  const [previewStatus, setPreviewStatus] = useState(0); // 0, 1, 2, -1, 3, -2

  // Load config & trades from server
  const loadBotData = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/config');
      if (res.ok) {
        const data = await res.json();
        if (data.payload) {
          if (data.payload.config) {
            setConfig((prev) => ({
              ...prev,
              ...data.payload.config,
              botToken: data.payload.config.botToken || prev.botToken
            }));
          }
          if (data.payload.activeTrades) setActiveTrades(data.payload.activeTrades);
          if (data.payload.tradeHistory) setTradeHistory(data.payload.tradeHistory);
          if (data.payload.stats) setStats(data.payload.stats);
        }
      }
    } catch (err) {
      console.warn('Failed to load bot config:', err.message);
    } finally {
      setIsLoadingTrades(false);
    }
  }, []);

  useEffect(() => {
    loadBotData();
    const interval = setInterval(loadBotData, 6000);
    return () => clearInterval(interval);
  }, [loadBotData]);

  // Save Config
  const handleSaveConfig = async (overrideParams = {}) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = { ...config, ...overrideParams };
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: '✅ Đã lưu cấu hình Bot Telegram thành công!' });
        if (data.payload?.config) {
          setConfig(prev => ({ ...prev, ...data.payload.config }));
        }
      } else {
        setFeedback({ type: 'error', message: `❌ Lỗi lưu cấu hình: ${data.message || 'Lỗi server'}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `❌ Lỗi kết nối: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Test Telegram Connection
  const handleTestConnection = async () => {
    if (!config.botToken || !config.chatId) {
      setFeedback({ type: 'error', message: '⚠️ Vui lòng nhập cả Bot Token và Chat ID trước khi kiểm tra kết nối.' });
      return;
    }

    setIsTestingConnection(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/bot/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: '🎉 Kết nối thành công! Đã gửi tin nhắn mẫu tới nhóm/kênh Telegram của bạn.' });
      } else {
        setFeedback({ type: 'error', message: `❌ Kết nối thất bại: ${data.message || 'Telegram từ chối yêu cầu'}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `❌ Lỗi gửi tin nhắn: ${err.message}` });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Toggle Monitored Symbol
  const handleToggleSymbol = (symbolCode) => {
    setConfig(prev => {
      const current = prev.monitoredSymbols || [];
      const exists = current.includes(symbolCode);
      const next = exists ? current.filter(s => s !== symbolCode) : [...current, symbolCode];
      return { ...prev, monitoredSymbols: next };
    });
  };

  // Trigger Demo Test Signal
  const handleTriggerTestSignal = async () => {
    if (!config.botToken || !config.chatId) {
      setFeedback({ type: 'error', message: '⚠️ Vui lòng cấu hình Bot Token và Chat ID trước khi bắn tín hiệu thử.' });
      return;
    }

    setIsSimulating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/bot/trades/test-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: simPair,
          dir: simDir,
          entry: parseFloat(simEntry)
        })
      });
      const data = await res.json();
      if (data.success && data.trade) {
        setLastSimTradeId(data.trade.id);
        setPreviewStatus(0);
        setFeedback({
          type: 'success',
          message: `🚀 Đã bắn tín hiệu #${data.trade.id} (${simDir === 1 ? 'BUY' : 'SELL'}) tới Telegram! Hãy kiểm tra nhóm chat và bấm các nút bên dưới để xem tin nhắn tự sửa trực tiếp.`
        });
        loadBotData();
      } else {
        setFeedback({ type: 'error', message: `❌ Lỗi bắn tín hiệu: ${data.message || 'Không thể gửi'}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `❌ Lỗi: ${err.message}` });
    } finally {
      setIsSimulating(false);
    }
  };

  // Simulate Status Transition on Trade
  const handleSimulateStatus = async (tradeId, newStatus, reasonText) => {
    setPreviewStatus(newStatus);
    try {
      const res = await fetch(`/api/bot/trades/${encodeURIComponent(tradeId)}/simulate-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason: reasonText })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `⚡ Đã chuyển sang [Status ${newStatus}] cho lệnh #${tradeId} và tự động chỉnh sửa tin nhắn Telegram!`
        });
        loadBotData();
      } else {
        setFeedback({ type: 'error', message: `❌ Lỗi: ${data.message}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `❌ Lỗi: ${err.message}` });
    }
  };

  // Manual Close Trade
  const handleCloseTrade = async (tradeId, status = 3) => {
    try {
      const res = await fetch(`/api/bot/trades/${encodeURIComponent(tradeId)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'info', message: `Đã đóng lệnh #${tradeId} thành công.` });
        loadBotData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `Lỗi khi đóng lệnh: ${err.message}` });
    }
  };

  // Clear History
  const handleClearHistory = async () => {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử lệnh đã đóng?')) return;
    try {
      const res = await fetch('/api/bot/trades/clear-history', { method: 'POST' });
      if (res.ok) {
        setTradeHistory([]);
        setFeedback({ type: 'info', message: 'Đã xóa sạch lịch sử lệnh.' });
        loadBotData();
      }
    } catch (e) {}
  };

  const winRate = stats.totalTrades > 0 ? ((stats.winCount / Math.max(1, stats.winCount + stats.lossCount)) * 100).toFixed(1) : 0;

  // Render Telegram Message Preview text for Simulator
  const renderPreviewText = () => {
    const isBuy = simDir === 1;
    const entryNum = parseFloat(simEntry) || 2918.50;
    const slOffset = config.defaultSlOffset || 20;
    const initialSlVal = isBuy ? entryNum - slOffset : entryNum + slOffset;
    
    // Nếu trạng thái >= 1 (đã hit TP1), SL hiển thị là Entry (Hòa vốn)
    const isHitTp1OrMore = previewStatus === 1 || previewStatus === 2 || previewStatus === 3;
    const currentSlVal = (isHitTp1OrMore && config.autoMoveSlToBreakEven !== false) ? entryNum : initialSlVal;

    const tp1Val = isBuy ? entryNum + slOffset * 1.5 : entryNum - slOffset * 1.5;
    const tp2Val = isBuy ? entryNum + slOffset * 3.0 : entryNum - slOffset * 3.0;
    const tradeCode = lastSimTradeId || `${simPair.split('_')[0]}_M5_TEST`;

    let slTag = '';
    if (previewStatus === -1) {
      slTag = ' [ ❌(Bị Quét) ]';
    } else if (previewStatus === 3 && config.autoMoveSlToBreakEven !== false) {
      slTag = ' [ 🛡(Cắn SL Hòa Vốn - Đã Lãi TP1) ]';
    } else if (isHitTp1OrMore && config.autoMoveSlToBreakEven !== false) {
      slTag = ' [ 🛡(Đã Dời Về Hòa Vốn) ]';
    }

    const tp1Tag = isHitTp1OrMore ? ' [ ⚡(ĐÃ HIT) ]' : '';
    const tp2Tag = previewStatus === 2 ? ' [ 🎯(ĐÃ HIT) ]' : '';

    return (
      <div style={{
        fontFamily: 'monospace',
        fontSize: 12.5,
        lineHeight: 1.6,
        color: '#e0e0e0',
        whiteSpace: 'pre-wrap',
        background: '#182533', // Telegram Dark Theme message color
        padding: '16px 18px',
        borderRadius: '12px 12px 12px 2px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, color: '#6c7883' }}>
          {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ✓✓
        </div>
        <div>{isBuy ? '📈 [SWING BUY]' : '📉 [SWING SELL]'} #{tradeCode}</div>
        <div><b>Cặp:</b> {simPair.replace(/\.ca$/i, '').toUpperCase()} (M5)</div>
        <br />
        <div>🏷 <b>Giá vào:</b> {entryNum.toFixed(2)}</div>
        <div style={{ color: previewStatus === -1 ? '#ff5252' : (isHitTp1OrMore ? '#00E676' : 'inherit') }}>
          🛑 <b>SL:</b> {currentSlVal.toFixed(2)}<b style={{ color: previewStatus === -1 ? '#ff5252' : '#00E676' }}>{slTag}</b>
        </div>
        <div style={{ color: previewStatus === 1 || previewStatus === 2 || previewStatus === 3 ? '#00E676' : 'inherit' }}>✅ <b>TP1:</b> {tp1Val.toFixed(2)}<b style={{ color: '#00E676' }}>{tp1Tag}</b></div>
        <div style={{ color: previewStatus === 2 ? '#00E5FF' : 'inherit' }}>✅ <b>TP2:</b> {tp2Val.toFixed(2)}<b style={{ color: '#00E5FF' }}>{tp2Tag}</b></div>
        <br />
        <div style={{ color: '#FFB300' }}>📊 <b>TRẠNG THÁI:</b></div>
        <div style={{ color: previewStatus === 0 ? '#FFB300' : '#787b86', fontWeight: previewStatus === 0 ? 'bold' : 'normal' }}>
          {previewStatus === 0 ? '👉 ' : '  '}0: ⏳ Đang chạy...
        </div>
        <div style={{ color: previewStatus === 1 ? '#00E676' : '#787b86', fontWeight: previewStatus === 1 ? 'bold' : 'normal' }}>
          {previewStatus === 1 ? '👉 ' : '  '}1: ⚡ Đã cán TP1 (Đang gồng TP2)
        </div>
        <div style={{ color: previewStatus === 2 ? '#00E5FF' : '#787b86', fontWeight: previewStatus === 2 ? 'bold' : 'normal' }}>
          {previewStatus === 2 ? '👉 ' : '  '}2: 🎯 FULL TP2 (WIN ĐẬM) 🔥
        </div>
        <div style={{ color: previewStatus === -1 ? '#ff5252' : '#787b86', fontWeight: previewStatus === -1 ? 'bold' : 'normal' }}>
          {previewStatus === -1 ? '👉 ' : '  '}-1: 🛑 HIT SL (LOSS)
        </div>
        <div style={{ color: previewStatus === -2 ? '#ff8a80' : '#787b86', fontWeight: previewStatus === -2 ? 'bold' : 'normal' }}>
          {previewStatus === -2 ? '👉 ' : '  '}-2: ⚠️ CẮT LỆNH SỚM (Chưa có TP)
        </div>
        <div style={{ color: previewStatus === 3 ? '#FFB300' : '#787b86', fontWeight: previewStatus === 3 ? 'bold' : 'normal' }}>
          {previewStatus === 3 ? '👉 ' : '  '}3: ⚠️ CẮT SỚM (Đã chốt túi TP1 💸)
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      height: '100%',
      backgroundColor: '#0b0e14',
      color: '#d1d4dc',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      {/* Top Navbar */}
      <header style={{
        background: '#151821',
        borderBottom: '1px solid #1e222d',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid #2a2e39',
              color: '#d1d4dc',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <span>←</span> Quay lại Biểu đồ (Terminal)
          </Link>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#CBB193', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🤖 TRADEWH</span>
            <span style={{ fontSize: 13, color: '#AB978C', fontWeight: 600 }}>· Telegram Live Signal Bot</span>
          </div>
        </div>

        {/* Master Active Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: config.enabled ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 255, 255, 0.06)',
            color: config.enabled ? '#00E676' : '#787b86',
            border: `1px solid ${config.enabled ? 'rgba(0, 230, 118, 0.4)' : '#2a2e39'}`
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: config.enabled ? '#00E676' : '#787b86',
              boxShadow: config.enabled ? '0 0 8px #00E676' : 'none'
            }} />
            <span>{config.enabled ? 'BOT ĐANG CHẠY (STREAMING LIVE)' : 'BOT ĐÃ TẮT'}</span>
          </div>

          <button
            onClick={() => handleSaveConfig({ enabled: !config.enabled })}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: config.enabled ? 'linear-gradient(135deg, #ff5252, #d32f2f)' : 'linear-gradient(135deg, #00E676, #00b0ff)',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.2s'
            }}
          >
            {config.enabled ? 'Tắt Bot' : 'Bật Bot Ngay'}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ flex: 1, padding: '24px 20px 80px 20px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        {/* Feedback Alert Banner */}
        {feedback && (
          <div style={{
            marginBottom: 20,
            padding: '12px 18px',
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: feedback.type === 'success' ? 'rgba(0, 230, 118, 0.12)' : feedback.type === 'error' ? 'rgba(255, 82, 82, 0.15)' : 'rgba(41, 98, 255, 0.15)',
            color: feedback.type === 'success' ? '#00E676' : feedback.type === 'error' ? '#ff5252' : '#82b1ff',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(0, 230, 118, 0.35)' : feedback.type === 'error' ? 'rgba(255, 82, 82, 0.35)' : 'rgba(41, 98, 255, 0.35)'}`
          }}>
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18 }}>&times;</button>
          </div>
        )}

        {/* Top Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ background: '#151821', border: '1px solid #1e222d', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: '#787b86', fontWeight: 700, letterSpacing: 0.5 }}>LỆNH ĐANG THEO DÕI (LIVE)</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: '#00E5FF' }}>
              {activeTrades.length} <span style={{ fontSize: 13, color: '#787b86', fontWeight: 500 }}>/ {config.maxConcurrentTrades || 10} tối đa</span>
            </div>
            <div style={{ fontSize: 11, color: '#787b86', marginTop: 4 }}>Cập nhật real-time từng tick</div>
          </div>

          <div style={{ background: '#151821', border: '1px solid #1e222d', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: '#787b86', fontWeight: 700, letterSpacing: 0.5 }}>TỶ LỆ THẮNG (WIN RATE)</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: '#00E676' }}>
              {winRate}%
            </div>
            <div style={{ fontSize: 11, color: '#787b86', marginTop: 4 }}>
              {stats.winCount} Thắng (TP1/TP2) · {stats.lossCount} Thua (SL/Cắt)
            </div>
          </div>

          <div style={{ background: '#151821', border: '1px solid #1e222d', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: '#787b86', fontWeight: 700, letterSpacing: 0.5 }}>TỔNG LỆNH ĐÃ THỰC THI</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: '#FFB300' }}>
              {stats.totalTrades}
            </div>
            <div style={{ fontSize: 11, color: '#787b86', marginTop: 4 }}>Gồm cả lệnh test và live</div>
          </div>

          <div style={{ background: '#151821', border: '1px solid #1e222d', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: '#787b86', fontWeight: 700, letterSpacing: 0.5 }}>TRẠNG THÁI TELEGRAM</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 10, color: config.botToken && config.chatId ? '#00E676' : '#ffa726' }}>
              {config.botToken && config.chatId ? '✅ Đã cấu hình' : '⚠️ Chưa đủ thông tin'}
            </div>
            <div style={{ fontSize: 11, color: '#787b86', marginTop: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {config.chatId ? `Chat: ${config.chatId}` : 'Chưa đặt Chat ID'}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* OPTION SELECTOR TABS (Matching User Diagram Specification) */}
        {/* ======================================================== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* OPT 1: Cấu hình Telegram & Tham số Bot */}
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            style={{
              flex: '1 1 240px',
              maxWidth: 340,
              padding: '14px 18px',
              borderRadius: '10px 10px 0 0',
              border: activeTab === 'config' ? '2px solid #FF4081' : '1px solid #2a2e39',
              borderBottom: activeTab === 'config' ? '3px solid #FF4081' : '1px solid #2a2e39',
              background: activeTab === 'config'
                ? 'linear-gradient(180deg, rgba(255, 64, 129, 0.22) 0%, rgba(21, 24, 33, 1) 100%)'
                : '#151821',
              color: activeTab === 'config' ? '#fff' : '#787b86',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              boxShadow: activeTab === 'config' ? '0 -2px 14px rgba(255, 64, 129, 0.25)' : 'none',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: activeTab === 'config' ? '#FF4081' : '#787b86' }}>
                OPTION 1
              </span>
              {activeTab === 'config' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4081', boxShadow: '0 0 6px #FF4081' }} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: activeTab === 'config' ? '#fff' : '#d1d4dc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚙️</span> Cấu hình Telegram & Tham số
            </div>
            <div style={{ fontSize: 11, color: '#787b86' }}>Bot Token, Chat ID, SL Offset, Cặp theo dõi</div>
          </button>

          {/* OPT 2: Bộ Giả Lập Tín Hiệu */}
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            style={{
              flex: '1 1 240px',
              maxWidth: 340,
              padding: '14px 18px',
              borderRadius: '10px 10px 0 0',
              border: activeTab === 'simulator' ? '2px solid #00E5FF' : '1px solid #2a2e39',
              borderBottom: activeTab === 'simulator' ? '3px solid #00E5FF' : '1px solid #2a2e39',
              background: activeTab === 'simulator'
                ? 'linear-gradient(180deg, rgba(0, 229, 255, 0.22) 0%, rgba(21, 24, 33, 1) 100%)'
                : '#151821',
              color: activeTab === 'simulator' ? '#fff' : '#787b86',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              boxShadow: activeTab === 'simulator' ? '0 -2px 14px rgba(0, 229, 255, 0.25)' : 'none',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: activeTab === 'simulator' ? '#00E5FF' : '#787b86' }}>
                OPTION 2
              </span>
              {activeTab === 'simulator' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5FF', boxShadow: '0 0 6px #00E5FF' }} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: activeTab === 'simulator' ? '#fff' : '#d1d4dc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚀</span> Bộ Giả Lập Tín Hiệu & Live Edit
            </div>
            <div style={{ fontSize: 11, color: '#787b86' }}>Bắn tín hiệu test & Sửa tin nhắn trực tiếp</div>
          </button>

          {/* OPT 3: Danh Sách Lệnh & Lịch Sử */}
          <button
            type="button"
            onClick={() => setActiveTab('trades')}
            style={{
              flex: '1 1 240px',
              maxWidth: 340,
              padding: '14px 18px',
              borderRadius: '10px 10px 0 0',
              border: activeTab === 'trades' ? '2px solid #00E676' : '1px solid #2a2e39',
              borderBottom: activeTab === 'trades' ? '3px solid #00E676' : '1px solid #2a2e39',
              background: activeTab === 'trades'
                ? 'linear-gradient(180deg, rgba(0, 230, 118, 0.22) 0%, rgba(21, 24, 33, 1) 100%)'
                : '#151821',
              color: activeTab === 'trades' ? '#fff' : '#787b86',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              boxShadow: activeTab === 'trades' ? '0 -2px 14px rgba(0, 230, 118, 0.25)' : 'none',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: activeTab === 'trades' ? '#00E676' : '#787b86' }}>
                OPTION 3
              </span>
              <span style={{
                padding: '1px 7px',
                borderRadius: 10,
                fontSize: 10.5,
                fontWeight: 800,
                background: activeTrades.length > 0 ? '#00E676' : '#2a2e39',
                color: activeTrades.length > 0 ? '#0b0e14' : '#787b86'
              }}>
                {activeTrades.length} Đang mở
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: activeTab === 'trades' ? '#fff' : '#d1d4dc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📊</span> Lệnh Đang Chạy & Lịch Sử
            </div>
            <div style={{ fontSize: 11, color: '#787b86' }}>Theo dõi lệnh active, chốt lệnh, winrate</div>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1 CONTENT: CẤU HÌNH TELEGRAM & THAM SỐ BOT            */}
        {/* ======================================================== */}
        {activeTab === 'config' && (
          <div style={{
            background: '#151821',
            border: '2px solid #FF4081',
            borderRadius: '0 12px 12px 12px',
            padding: '24px 26px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚙️</span> Cấu hình Telegram & Tham số Bot Tín Hiệu
                </div>
                <div style={{ fontSize: 12.5, color: '#787b86', marginTop: 3 }}>
                  Thiết lập thông tin bot Telegram, điều chỉnh thông số cắt lỗ, giới hạn lệnh và quản lý cặp tiền streaming.
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSaveConfig()}
                disabled={isSaving}
                style={{
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: 'none',
                  background: 'linear-gradient(135deg, #00E676, #00b0ff)',
                  color: '#0b0e14',
                  boxShadow: '0 2px 12px rgba(0, 230, 118, 0.35)',
                  transition: 'all 0.2s'
                }}
              >
                {isSaving ? 'Đang lưu...' : '💾 Lưu Cấu Hình Ngay'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 24 }}>
              {/* Telegram Credentials Box */}
              <div style={{ background: '#0b0e14', border: '1px solid #1e222d', borderRadius: 10, padding: '18px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#00E5FF', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>💬</span> Thông Tin Telegram Bot API
                </div>

                {/* Telegram Bot Token */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#d1d4dc' }}>Telegram Bot Token:</label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      style={{ background: 'transparent', border: 'none', color: '#00E5FF', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showToken ? 'Ẩn token' : 'Hiện token'}
                    </button>
                  </div>
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    value={config.botToken || ''}
                    onChange={(e) => setConfig({ ...config, botToken: e.target.value.trim() })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #2a2e39',
                      background: '#151821',
                      color: '#fff',
                      fontSize: 13,
                      fontFamily: 'monospace'
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#787b86', marginTop: 4 }}>
                    Tạo bot tại <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: '#00E5FF' }}>@BotFather</a> để nhận mã Token.
                  </div>
                </div>

                {/* Telegram Chat ID */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#d1d4dc', marginBottom: 6 }}>
                    Telegram Chat ID hoặc @Tên_Kênh:
                  </label>
                  <input
                    type="text"
                    placeholder="-1001234567890 hoặc @my_signal_channel"
                    value={config.chatId || ''}
                    onChange={(e) => setConfig({ ...config, chatId: e.target.value.trim() })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #2a2e39',
                      background: '#151821',
                      color: '#fff',
                      fontSize: 13,
                      fontFamily: 'monospace'
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#787b86', marginTop: 4 }}>
                    Thêm bot vào nhóm/kênh với quyền Quản trị viên (Admin) để bot gửi & sửa tin nhắn.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid #00E5FF',
                    background: 'rgba(0, 229, 255, 0.1)',
                    color: '#00E5FF',
                    transition: 'all 0.15s'
                  }}
                >
                  {isTestingConnection ? 'Đang kiểm tra kết nối...' : '📡 Thử Kết Nối & Gửi Tin Nhắn Mẫu'}
                </button>
              </div>

              {/* Bot Parameters Box */}
              <div style={{ background: '#0b0e14', border: '1px solid #1e222d', borderRadius: 10, padding: '18px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FFB300', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🎯</span> Tham Số Quản Lý Lệnh
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#d1d4dc', marginBottom: 6 }}>
                      SL Offset (Điểm / Giá):
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={config.defaultSlOffset || 20}
                      onChange={(e) => setConfig({ ...config, defaultSlOffset: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 6,
                        border: '1px solid #2a2e39',
                        background: '#151821',
                        color: '#fff',
                        fontSize: 13
                      }}
                    />
                    <div style={{ fontSize: 10.5, color: '#787b86', marginTop: 3 }}>Khoảng cách SL từ Entry (vd 20 điểm)</div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#d1d4dc', marginBottom: 6 }}>
                      Số lệnh tối đa đồng thời:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={config.maxConcurrentTrades || 10}
                      onChange={(e) => setConfig({ ...config, maxConcurrentTrades: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 6,
                        border: '1px solid #2a2e39',
                        background: '#151821',
                        color: '#fff',
                        fontSize: 13
                      }}
                    />
                    <div style={{ fontSize: 10.5, color: '#787b86', marginTop: 3 }}>Giới hạn lệnh mở cùng lúc (1-20)</div>
                  </div>
                </div>

                {/* Checkbox Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={config.autoMoveSlToBreakEven !== false}
                      onChange={(e) => setConfig({ ...config, autoMoveSlToBreakEven: e.target.checked })}
                      style={{ accentColor: '#00E676', width: 18, height: 18 }}
                    />
                    <span style={{ color: '#00E676', fontWeight: 700 }}>🛡 Tự động Dời SL về Hòa Vốn (Break-Even = Entry) ngay khi cán TP1</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={config.allowEarlyCut !== false}
                      onChange={(e) => setConfig({ ...config, allowEarlyCut: e.target.checked })}
                      style={{ accentColor: '#00E676', width: 18, height: 18 }}
                    />
                    <span>Tự động Cắt Lệnh Sớm khi nến đổi màu (Đảo chiều xu hướng)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={config.enableNotifications !== false}
                      onChange={(e) => setConfig({ ...config, enableNotifications: e.target.checked })}
                      style={{ accentColor: '#00E676', width: 18, height: 18 }}
                    />
                    <span>Kích hoạt Live In-Place Edit (Sửa tin nhắn trực tiếp, không spam)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Monitored Symbols Selector */}
            <div style={{ background: '#0b0e14', border: '1px solid #1e222d', borderRadius: 10, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>
                  📡 Danh Sách Cặp Tiền & Khung Thời Gian Theo Dõi Tự Động:
                </label>
                <span style={{ fontSize: 11.5, color: '#00E5FF' }}>
                  Đang chọn: {(config.monitoredSymbols || []).length} cặp
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AVAILABLE_PAIRS.map(pair => {
                  const isSelected = (config.monitoredSymbols || []).includes(pair.code);
                  return (
                    <button
                      key={pair.code}
                      type="button"
                      onClick={() => handleToggleSymbol(pair.code)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #00E5FF' : '1px solid #2a2e39',
                        background: isSelected ? 'rgba(0, 229, 255, 0.18)' : '#151821',
                        color: isSelected ? '#00E5FF' : '#787b86',
                        transition: 'all 0.15s'
                      }}
                    >
                      {pair.name} · {pair.tf} {isSelected ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2 CONTENT: BỘ GIẢ LẬP TÍN HIỆU & SỬA TIN NHẮN LIVE   */}
        {/* ======================================================== */}
        {activeTab === 'simulator' && (
          <div style={{
            background: '#151821',
            border: '2px solid #00E5FF',
            borderRadius: '0 12px 12px 12px',
            padding: '24px 26px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🚀</span> Bộ Giả Lập Tín Hiệu & Live Edit (Interactive Tester)
              </div>
              <div style={{ fontSize: 12.5, color: '#787b86', marginTop: 3 }}>
                Bắn một tín hiệu mẫu vào nhóm Telegram của bạn, sau đó nhấn các nút trạng thái bên dưới để quan sát tin nhắn trên Telegram <b>tự động chỉnh sửa trực tiếp</b> theo thời gian thực mà không phát sinh thêm tin nhắn rác!
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
              {/* Simulator Input Form & Action Controls */}
              <div style={{ background: '#0b0e14', border: '1px solid #1e222d', borderRadius: 10, padding: '18px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#00E5FF', marginBottom: 14 }}>
                  1. Cấu Hình Tín Hiệu Thử Nghiệm
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#787b86', marginBottom: 4 }}>Cặp tài sản:</label>
                    <select
                      value={simPair}
                      onChange={(e) => {
                        setSimPair(e.target.value);
                        if (e.target.value.includes('BTC')) setSimEntry('64850.00');
                        else if (e.target.value.includes('ETH')) setSimEntry('2650.00');
                        else setSimEntry('2918.50');
                      }}
                      style={{ width: '100%', padding: '9px 10px', borderRadius: 6, background: '#151821', border: '1px solid #2a2e39', color: '#fff', fontSize: 12.5 }}
                    >
                      <option value="XAUUSD.ca_5">XAUUSD (Vàng) · M5</option>
                      <option value="BTCUSD_5">BTCUSD (Bitcoin) · M5</option>
                      <option value="ETHUSD_15">ETHUSD (Ethereum) · M15</option>
                      <option value="EURUSD_5">EURUSD · M5</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#787b86', marginBottom: 4 }}>Hướng lệnh:</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setSimDir(1)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: simDir === 1 ? '1px solid #00E676' : '1px solid #2a2e39',
                          background: simDir === 1 ? 'rgba(0, 230, 118, 0.25)' : '#151821',
                          color: simDir === 1 ? '#00E676' : '#787b86'
                        }}
                      >
                        📈 BUY
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimDir(-1)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: simDir === -1 ? '1px solid #ff5252' : '1px solid #2a2e39',
                          background: simDir === -1 ? 'rgba(255, 82, 82, 0.25)' : '#151821',
                          color: simDir === -1 ? '#ff5252' : '#787b86'
                        }}
                      >
                        📉 SELL
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#787b86', marginBottom: 4 }}>Giá vào lệnh (Entry):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simEntry}
                    onChange={(e) => setSimEntry(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 6, background: '#151821', border: '1px solid #2a2e39', color: '#fff', fontSize: 13 }}
                  />
                </div>

                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={handleTriggerTestSignal}
                  disabled={isSimulating}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'linear-gradient(135deg, #FFB300, #ff8f00)',
                    color: '#0b0e14',
                    boxShadow: '0 2px 12px rgba(255, 179, 0, 0.35)',
                    transition: 'all 0.2s',
                    marginBottom: 16
                  }}
                >
                  {isSimulating ? 'Đang bắn tín hiệu...' : '🚀 Bắn Tín Hiệu Thử Nghiệm Tới Telegram'}
                </button>

                {/* Live Edit Buttons */}
                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #1e222d' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚡</span> 2. Giả Lập Đổi Trạng Thái & Sửa Tin Nhắn:
                  </div>
                  <div style={{ fontSize: 11, color: '#787b86', marginBottom: 10 }}>
                    {lastSimTradeId ? `Đang thao tác trên lệnh #${lastSimTradeId}` : 'Chưa có lệnh test, bấm các nút để thử nghiệm xem trước:'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      onClick={() => {
                        if (lastSimTradeId) handleSimulateStatus(lastSimTradeId, 1, 'Simulated TP1');
                        else setPreviewStatus(1);
                      }}
                      style={{ padding: '8px', borderRadius: 6, background: 'rgba(0, 230, 118, 0.15)', border: '1px solid rgba(0, 230, 118, 0.4)', color: '#00E676', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ⚡ Chạm TP1 (Status 1)
                    </button>
                    <button
                      onClick={() => {
                        if (lastSimTradeId) handleSimulateStatus(lastSimTradeId, 2, 'Simulated FULL TP2');
                        else setPreviewStatus(2);
                      }}
                      style={{ padding: '8px', borderRadius: 6, background: 'rgba(0, 229, 255, 0.15)', border: '1px solid rgba(0, 229, 255, 0.4)', color: '#00E5FF', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🎯 FULL TP2 (Status 2)
                    </button>
                    <button
                      onClick={() => {
                        if (lastSimTradeId) handleSimulateStatus(lastSimTradeId, -1, 'Simulated SL');
                        else setPreviewStatus(-1);
                      }}
                      style={{ padding: '8px', borderRadius: 6, background: 'rgba(255, 82, 82, 0.15)', border: '1px solid rgba(255, 82, 82, 0.4)', color: '#ff5252', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🛑 Dính SL (Status -1)
                    </button>
                    <button
                      onClick={() => {
                        if (lastSimTradeId) handleSimulateStatus(lastSimTradeId, 3, 'Simulated Cut Early Profit');
                        else setPreviewStatus(3);
                      }}
                      style={{ padding: '8px', borderRadius: 6, background: 'rgba(255, 179, 0, 0.15)', border: '1px solid rgba(255, 179, 0, 0.4)', color: '#FFB300', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ⚠️ Cắt Sớm (Status 3)
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Live Message Preview Box */}
              <div style={{ background: '#0b0e14', border: '1px solid #1e222d', borderRadius: 10, padding: '18px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FFB300', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📱 Xem Trước Tin Nhắn Telegram (Live Preview)</span>
                  <span style={{ fontSize: 10.5, color: '#787b86' }}>Tự đổi theo trạng thái</span>
                </div>

                {renderPreviewText()}

                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid #1e222d', fontSize: 11.5, color: '#787b86' }}>
                  💡 <b>Cơ chế hoạt động:</b> Khi giá chạy chạm TP1, TP2, SL hoặc nến đổi màu, bot gửi lệnh <code>editMessageText</code> lên Telegram để cập nhật trực tiếp tại tin nhắn này.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3 CONTENT: LỆNH ĐANG CHẠY & LỊCH SỬ GIAO DỊCH         */}
        {/* ======================================================== */}
        {activeTab === 'trades' && (
          <div style={{
            background: '#151821',
            border: '2px solid #00E676',
            borderRadius: '0 12px 12px 12px',
            padding: '24px 26px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
            {/* Active Trades Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📊</span> Danh Sách Lệnh Đang Chạy Real-time ({activeTrades.length})
                </div>
                <div style={{ fontSize: 12, color: '#787b86', marginTop: 2 }}>
                  Tất cả các lệnh đang được bot theo dõi tick-by-tick và tự động cập nhật tin nhắn Telegram.
                </div>
              </div>

              <button
                onClick={loadBotData}
                style={{ background: 'transparent', border: '1px solid #2a2e39', borderRadius: 6, color: '#d1d4dc', padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                🔄 Làm mới dữ liệu
              </button>
            </div>

            {activeTrades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: '#787b86', fontSize: 13, background: '#0b0e14', borderRadius: 8, border: '1px solid #1e222d', marginBottom: 28 }}>
                {isLoadingTrades ? 'Đang tải dữ liệu lệnh...' : 'Hiện không có lệnh nào đang chạy. Khi có nến tín hiệu thỏa điều kiện, bot sẽ tự động mở lệnh và hiển thị tại đây.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 28 }}>
                {activeTrades.map(trade => {
                  const isBuy = trade.dir === 1;
                  return (
                    <div
                      key={trade.id}
                      style={{
                        background: '#0b0e14',
                        border: `1px solid ${isBuy ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 82, 82, 0.3)'}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        position: 'relative',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                      }}
                    >
                      {/* Header line */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 900,
                            background: isBuy ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 82, 82, 0.2)',
                            color: isBuy ? '#00E676' : '#ff5252',
                            marginRight: 6
                          }}>
                            {isBuy ? '📈 SWING BUY' : '📉 SWING SELL'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                            {(trade.symbol || '').replace(/\.ca$/i, '')} · M{trade.timeframe}
                          </span>
                        </div>
                        <span style={{ fontSize: 10.5, color: '#787b86', fontFamily: 'monospace' }}>#{trade.id}</span>
                      </div>

                      {/* Price Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, marginBottom: 12 }}>
                        <div><span style={{ color: '#787b86' }}>Entry:</span> <b style={{ color: '#fff' }}>{trade.entry}</b></div>
                        <div><span style={{ color: '#ff5252' }}>SL:</span> <b style={{ color: '#ff5252' }}>{trade.sl}</b></div>
                        <div><span style={{ color: '#00E676' }}>TP1:</span> <b style={{ color: '#00E676' }}>{trade.tp1}</b></div>
                        <div><span style={{ color: '#00E5FF' }}>TP2:</span> <b style={{ color: '#00E5FF' }}>{trade.tp2}</b></div>
                      </div>

                      {/* Current Status Pill */}
                      <div style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: trade.status === 1 ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 179, 0, 0.12)',
                        color: trade.status === 1 ? '#00E676' : '#FFB300',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span>{trade.status === 1 ? '⚡ ĐÃ CÁN TP1 (Đang gồng TP2)' : '⏳ ĐANG CHẠY...'}</span>
                      </div>

                      {/* Footer & Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #1e222d' }}>
                        <span style={{ fontSize: 10.5, color: '#787b86' }}>
                          Msg ID: {trade.msg_id || 'Chưa gửi'}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleCloseTrade(trade.id, 3)}
                            style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(0, 230, 118, 0.15)', border: '1px solid rgba(0, 230, 118, 0.3)', color: '#00E676', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                          >
                            Chốt lời
                          </button>
                          <button
                            onClick={() => handleCloseTrade(trade.id, -2)}
                            style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255, 82, 82, 0.15)', border: '1px solid rgba(255, 82, 82, 0.3)', color: '#ff5252', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                          >
                            Cắt lỗ
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Trade History Section */}
            <div style={{ paddingTop: 20, borderTop: '1px solid #1e222d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📜</span> Lịch Sử Lệnh Đã Đóng ({tradeHistory.length})
                </div>
                {tradeHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    style={{ background: 'transparent', border: '1px solid #ff5252', borderRadius: 6, color: '#ff5252', padding: '4px 12px', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Xóa lịch sử
                  </button>
                )}
              </div>

              {tradeHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 20px', color: '#787b86', fontSize: 13, background: '#0b0e14', borderRadius: 8, border: '1px solid #1e222d' }}>
                  Chưa có lịch sử lệnh nào được lưu.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', background: '#0b0e14', borderRadius: 8, border: '1px solid #1e222d' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a2e39', color: '#787b86' }}>
                        <th style={{ padding: '10px 12px' }}>ID / Cặp</th>
                        <th style={{ padding: '10px 12px' }}>Loại</th>
                        <th style={{ padding: '10px 12px' }}>Entry</th>
                        <th style={{ padding: '10px 12px' }}>SL / TP1 / TP2</th>
                        <th style={{ padding: '10px 12px' }}>Kết quả</th>
                        <th style={{ padding: '10px 12px' }}>Thời gian đóng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.map(item => {
                        const isBuy = item.dir === 1;
                        let resultBadge = <span style={{ color: '#FFB300' }}>⏳ Đang chạy</span>;
                        if (item.status === 2) resultBadge = <span style={{ color: '#00E5FF', fontWeight: 800 }}>🎯 FULL TP2 (WIN)</span>;
                        else if (item.status === 1) resultBadge = <span style={{ color: '#00E676', fontWeight: 800 }}>⚡ HIT TP1</span>;
                        else if (item.status === -1) resultBadge = <span style={{ color: '#ff5252', fontWeight: 800 }}>🛑 HIT SL (LOSS)</span>;
                        else if (item.status === -2) resultBadge = <span style={{ color: '#ff8a80' }}>⚠️ Cắt Sớm (Loss)</span>;
                        else if (item.status === 3) resultBadge = <span style={{ color: '#00E676' }}>⚠️ Cắt Sớm (Lãi TP1 💸)</span>;

                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #1a1d26' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 700, color: '#fff' }}>{(item.symbol || '').replace(/\.ca$/i, '')} · M{item.timeframe}</div>
                              <div style={{ fontSize: 10, color: '#787b86', fontFamily: 'monospace' }}>#{item.id}</div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 10.5,
                                fontWeight: 800,
                                background: isBuy ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                                color: isBuy ? '#00E676' : '#ff5252'
                              }}>
                                {isBuy ? 'BUY' : 'SELL'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{item.entry}</td>
                            <td style={{ padding: '10px 12px', color: '#787b86', fontSize: 11 }}>
                              SL: <span style={{ color: '#ff5252' }}>{item.sl}</span> · TP1: <span style={{ color: '#00E676' }}>{item.tp1}</span> · TP2: <span style={{ color: '#00E5FF' }}>{item.tp2}</span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>{resultBadge}</td>
                            <td style={{ padding: '10px 12px', color: '#787b86', fontSize: 11 }}>
                              {item.closedAt ? new Date(item.closedAt).toLocaleTimeString('vi-VN') : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
