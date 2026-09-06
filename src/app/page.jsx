'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Header from '@/components/Header';
import ChartContainer from '@/components/ChartContainer';
import LeftDrawingPanel, { DRAWING_TOOLS } from '@/components/LeftDrawingPanel';
import TokenModal from '@/components/TokenModal';
import AssetSelector from '@/components/AssetSelector';
import RightWatchlistSidebar from '@/components/RightWatchlistSidebar';
import TimezoneModal from '@/components/TimezoneModal';
import AuthOverlay from '@/components/AuthOverlay';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { calculateBarCountdown } from '@/lib/utils';
import { updateHeaderCountdown } from '@/lib/ohlc-updater';
import { getSymbolByCode } from '@/lib/assets-data';
import { getDefaultTimezone } from '@/lib/timezones';

export default function TerminalPage() {
  // Google & Supabase Sign-In Barrier Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Layout and Multi-Chart State
  const [activeLayout, setActiveLayout] = useState('1'); // '1' | '2-col' | '2-row' | '3-col' | '3-grid' | '4-grid'
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Right Watchlist Sidebar State (Always toggleable via right toolbar)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Drawing tools state
  const [activeDrawingTool, setActiveDrawingTool] = useState(DRAWING_TOOLS.CROSSHAIR);
  const [isDrawingsHidden, setIsDrawingsHidden] = useState(false);
  const [isDrawingsLocked, setIsDrawingsLocked] = useState(false);

  // Autosave State & Persistence
  const [isAutoSave, setIsAutoSave] = useState(true);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'idle'
  const isHydratedRef = useRef(false);

  // 4 Chart Slot configurations
  const [slots, setSlots] = useState([
    { id: 0, code: null, symbolObj: null, tfName: '5m', tfMinutes: 5 },
    { id: 1, code: null, symbolObj: null, tfName: '15m', tfMinutes: 15 },
    { id: 2, code: null, symbolObj: null, tfName: '1D', tfMinutes: 1440 },
    { id: 3, code: null, symbolObj: null, tfName: '5m', tfMinutes: 5 },
  ]);

  const chartRef0 = useRef(null);
  const chartRef1 = useRef(null);
  const chartRef2 = useRef(null);
  const chartRef3 = useRef(null);
  const chartRefs = [chartRef0, chartRef1, chartRef2, chartRef3];

  const socketRef = useRef(null);

  // Standby initial state
  const [activeSymbolObj, setActiveSymbolObj] = useState(null);
  const [currentCode, setCurrentCode] = useState(null);
  const [timeframeLabel, setTimeframeLabel] = useState('5m');
  const [timeframeMinutes, setTimeframeMinutes] = useState(5);
  const [wsStatus, setWsStatus] = useState('idle'); // 'idle' | 'live' | 'cloud' | 'reconnecting' | 'disconnected'
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false); // Right sidebar is primary
  const [activeTimezone, setActiveTimezone] = useState(getDefaultTimezone);
  const [isTimezoneModalOpen, setIsTimezoneModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [ksiLabelText, setKsiLabelText] = useState('BOYS BUYING (KSI)');
  const [kcxLabelText, setKcxLabelText] = useState('BEARISHNESS (KCX)');

  // Load right sidebar state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradewh_right_sidebar_open');
      if (saved !== null) {
        setIsRightSidebarOpen(saved === 'true');
      }
    } catch (e) {}
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setIsRightSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('tradewh_right_sidebar_open', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const activeSlotIndexRef = useRef(activeSlotIndex);
  activeSlotIndexRef.current = activeSlotIndex;

  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const activeLayoutRef = useRef(activeLayout);
  activeLayoutRef.current = activeLayout;

  const currentCodeRef = useRef(currentCode);
  currentCodeRef.current = currentCode;

  const timeframeMinutesRef = useRef(timeframeMinutes);
  timeframeMinutesRef.current = timeframeMinutes;

  // Session Token Helper
  const getSessionToken = useCallback(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('crazii_session_token') || '') : '';
  }, []);

  // Logout Handler
  const handleLogout = useCallback(async () => {
    const token = getSessionToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {}
    }
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } catch (e) {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('crazii_session_token');
      localStorage.removeItem('crazii_user');
    }
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    setWsStatus('disconnected');
  }, [getSessionToken]);

  // Initial Auth Check on Mount (Supports Supabase Auth & Local Session)
  useEffect(() => {
    async function verifyAuth() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('crazii_session_token') : null;

      // 1. Try checking Supabase Auth session first
      try {
        const supabase = createSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userObj = {
            sub: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
            picture: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('crazii_session_token', session.access_token);
            localStorage.setItem('crazii_user', JSON.stringify(userObj));
          }
          setCurrentUser(userObj);
          setIsAuthenticated(true);
          setIsCheckingAuth(false);
          return;
        }
      } catch (supaErr) {
        console.warn('Supabase getSession error:', supaErr);
      }

      // 2. Fallback to Local Session Token check
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        } else {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('crazii_session_token');
            localStorage.removeItem('crazii_user');
          }
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
      } catch (e) {
        setIsAuthenticated(false);
        setCurrentUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    verifyAuth();

    // Listen for Supabase Auth state changes
    try {
      const supabase = createSupabaseClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const userObj = {
            sub: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
            picture: session.user.user_metadata?.avatar_url || null,
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('crazii_session_token', session.access_token);
            localStorage.setItem('crazii_user', JSON.stringify(userObj));
          }
          setCurrentUser(userObj);
          setIsAuthenticated(true);
          setIsCheckingAuth(false);
        }
      });

      return () => {
        subscription?.unsubscribe();
      };
    } catch (e) {}
  }, []);

  // Helper to subscribe visible slot codes on active socket connection
  const subscribeVisibleSlots = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const count = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));
    for (let i = 0; i < count; i++) {
      const slot = slotsRef.current[i];
      if (slot && slot.code) {
        socketRef.current.emit('subscribe', slot.code);
        const sym = slot.code.split('_')[0];
        if (sym && sym !== slot.code) {
          socketRef.current.emit('subscribe', sym);
        }
      }
    }
    socketRef.current.emit('subscribe', 'price');
  }, []);

  // Fullscreen event listener
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen error:', err);
      });
    }
  }, []);

  const handleSelectTimezone = useCallback((tz) => {
    setActiveTimezone(tz);
    try {
      localStorage.setItem('crazii_timezone_id', tz.id);
    } catch (e) {}
  }, []);

  // Fetch Token Info from Backend
  const fetchTokenInfo = useCallback(async () => {
    const token = getSessionToken();
    if (!token) return;

    try {
      const res = await fetch('/api/token-info', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setTokenInfo(data);
    } catch (e) {
      console.warn('Failed to fetch token info:', e);
    }
  }, [getSessionToken, handleLogout]);

  // Fetch Historical Candles for a specific Slot
  const fetchCandlesForSlot = useCallback(async (slotIndex, codeToFetch, isSilent = false, isInitial = false) => {
    if (!codeToFetch) return;
    const token = getSessionToken();
    if (!token) return;

    if (!isSilent) setIsRefreshing(true);

    try {
      const res = await fetch(`/api/candles?code=${encodeURIComponent(codeToFetch)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.code === 'DEVICE_SESSION_TERMINATED') {
          alert('Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.');
        }
        handleLogout();
        return;
      }

      if (res.status === 403) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.code === 'SUBSCRIPTION_REQUIRED') {
          if (!isSilent) {
            setNotification({
              type: 'error',
              message: 'Tài khoản cần kích hoạt gói Subscription (45 USDT/tháng) để sử dụng biểu đồ.'
            });
          }
          if (typeof window !== 'undefined' && window.location.pathname !== '/subscription') {
            window.location.href = '/subscription';
          }
        }
        return;
      }

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

      let targetChartRef = chartRefs[slotIndex];
      let retryCount = 0;
      while ((!targetChartRef || !targetChartRef.current) && retryCount < 10) {
        await new Promise((r) => setTimeout(r, 80));
        targetChartRef = chartRefs[slotIndex];
        retryCount++;
      }

      if (targetChartRef && targetChartRef.current) {
        targetChartRef.current.renderDataset(list, isInitial);
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
  }, []);

  // Synchronize drawings across visible slots sharing the same symbol
  const handleSyncDrawings = useCallback((symbolKey, newDrawings, sourceSlotIndex) => {
    const visibleCount = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));
    for (let i = 0; i < visibleCount; i++) {
      if (i !== sourceSlotIndex) {
        const slot = slotsRef.current[i];
        const slotSym = slot?.code ? slot.code.split('_')[0] : (i === 0 ? currentCodeRef.current?.split('_')[0] : null);
        if (!symbolKey || !slotSym || slotSym === symbolKey) {
          chartRefs[i].current?.syncDrawings(newDrawings);
        }
      }
    }
  }, []);

  // Synchronize crosshair across all visible slots
  const handleSyncCrosshair = useCallback((time, price, sourceSlotIndex) => {
    const visibleCount = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));
    for (let i = 0; i < visibleCount; i++) {
      if (i !== sourceSlotIndex) {
        if (time) {
          chartRefs[i].current?.syncCrosshair(time, price);
        } else {
          chartRefs[i].current?.clearCrosshair();
        }
      }
    }
  }, []);

  const renderedCodesRef = useRef({});

  // 1. Initial Load: Hydrate Saved Layout from LocalStorage
  useEffect(() => {
    let hydratedSlots = null;
    let hydratedLayout = '1';
    let hydratedCode = null;

    try {
      const saved = localStorage.getItem('crazii_chart_autosave_v1');
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data === 'object') {
          if (data.layout) {
            hydratedLayout = data.layout;
            setActiveLayout(data.layout);
          }
          if (data.activeSlotIndex !== undefined) setActiveSlotIndex(data.activeSlotIndex);
          if (data.isAutoSave !== undefined) setIsAutoSave(data.isAutoSave);
          if (data.lastSavedTime) setLastSavedTime(data.lastSavedTime);

          if (Array.isArray(data.slots) && data.slots.length === 4) {
            const restoredSlots = data.slots.map((s, idx) => {
              const symCode = s?.code ? s.code.split('_')[0] : null;
              const symObj = s?.symbolObj || (symCode ? getSymbolByCode(symCode) : null);
              return {
                id: idx,
                code: s?.code || null,
                symbolObj: symObj,
                tfName: s?.tfName || '5m',
                tfMinutes: s?.tfMinutes || 5,
              };
            });
            hydratedSlots = restoredSlots;
            setSlots(restoredSlots);
          }

          if (data.currentCode) {
            hydratedCode = data.currentCode;
            setCurrentCode(data.currentCode);
            setTimeframeLabel(data.timeframeLabel || '5m');
            setTimeframeMinutes(data.timeframeMinutes || 5);
            const symObj = getSymbolByCode(data.currentCode.split('_')[0]);
            if (symObj) {
              setActiveSymbolObj(symObj);
              setIsAssetSelectorOpen(false);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to hydrate chart autosave:', e);
    } finally {
      isHydratedRef.current = true;
    }

    // Trigger immediate historical candle loading for all visible slots
    const visibleCount = hydratedLayout === '1' ? 1 : (hydratedLayout.startsWith('2') ? 2 : (hydratedLayout.startsWith('3') ? 3 : 4));
    setTimeout(() => {
      for (let i = 0; i < visibleCount; i++) {
        const code = hydratedSlots?.[i]?.code || (i === 0 ? hydratedCode : null);
        if (code) {
          renderedCodesRef.current[i] = code;
          fetchCandlesForSlot(i, code, i > 0, true);
        }
      }
    }, 60);
  }, [fetchCandlesForSlot]);

  // 2. Debounced Autosave on Any Layout / Slot / Timeframe Change
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (!isAutoSave) return;

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        const payload = {
          layout: activeLayout,
          activeSlotIndex,
          slots: slotsRef.current,
          currentCode,
          timeframeLabel,
          timeframeMinutes,
          isAutoSave: true,
          lastSavedTime: Date.now(),
        };
        localStorage.setItem('crazii_chart_autosave_v1', JSON.stringify(payload));
        setLastSavedTime(payload.lastSavedTime);
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('idle');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [activeLayout, activeSlotIndex, slots, currentCode, timeframeLabel, timeframeMinutes, isAutoSave]);

  // Ensure visible slots with codes always have historical candles loaded
  useEffect(() => {
    if (!isHydratedRef.current) return;
    const count = activeLayout === '1' ? 1 : (activeLayout.startsWith('2') ? 2 : (activeLayout.startsWith('3') ? 3 : 4));
    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      const code = slot?.code || (i === 0 ? currentCode : null);
      if (code && renderedCodesRef.current[i] !== code) {
        renderedCodesRef.current[i] = code;
        fetchCandlesForSlot(i, code, i > 0, true);
      }
    }
  }, [slots, activeLayout, currentCode, fetchCandlesForSlot]);

  // Manual Save Now
  const handleSaveNow = useCallback(() => {
    setSaveStatus('saving');
    try {
      const payload = {
        layout: activeLayoutRef.current,
        activeSlotIndex,
        slots: slotsRef.current,
        currentCode: currentCodeRef.current,
        timeframeLabel,
        timeframeMinutes: timeframeMinutesRef.current,
        isAutoSave,
        lastSavedTime: Date.now(),
      };
      localStorage.setItem('crazii_chart_autosave_v1', JSON.stringify(payload));
      setLastSavedTime(payload.lastSavedTime);
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('idle');
    }
  }, [activeSlotIndex, timeframeLabel, isAutoSave]);

  // Toggle AutoSave
  const handleToggleAutoSave = useCallback(() => {
    setIsAutoSave((prev) => {
      const next = !prev;
      try {
        const saved = localStorage.getItem('crazii_chart_autosave_v1');
        if (saved) {
          const data = JSON.parse(saved);
          data.isAutoSave = next;
          localStorage.setItem('crazii_chart_autosave_v1', JSON.stringify(data));
        }
      } catch (e) {}
      return next;
    });
  }, []);

  // Reset to Default Layout
  const handleResetLayout = useCallback(() => {
    setActiveLayout('1');
    setActiveSlotIndex(0);
    try {
      localStorage.removeItem('crazii_chart_autosave_v1');
    } catch (e) {}
    setLastSavedTime(null);
    setSaveStatus('saved');
  }, []);

  // Handle Asset Switch from Watchlist (Targeted to Active Slot)
  const handleSelectAsset = useCallback((symbolCode, tfCode, tfName, tfMinutes) => {
    const symObj = getSymbolByCode(symbolCode);
    const targetSlotIndex = activeSlotIndex;

    setSlots((prev) => {
      const next = [...prev];
      const isFirstEverPick = prev.every((s) => !s.code);
      if (isFirstEverPick) {
        const tfs = symObj?.timeframes || [];
        return [
          { id: 0, code: tfCode, symbolObj: symObj, tfName: tfName, tfMinutes: tfMinutes },
          { id: 1, code: tfs[1]?.code || tfs[0]?.code || tfCode, symbolObj: symObj, tfName: tfs[1]?.name || '15m', tfMinutes: tfs[1]?.minutes || 15 },
          { id: 2, code: tfs[2]?.code || tfs[0]?.code || tfCode, symbolObj: symObj, tfName: tfs[2]?.name || '1D', tfMinutes: tfs[2]?.minutes || 1440 },
          { id: 3, code: tfs[3]?.code || tfs[0]?.code || tfCode, symbolObj: symObj, tfName: tfs[3]?.name || '5m', tfMinutes: tfs[3]?.minutes || 5 },
        ];
      }

      next[targetSlotIndex] = {
        id: targetSlotIndex,
        code: tfCode,
        symbolObj: symObj,
        tfName: tfName,
        tfMinutes: tfMinutes,
      };
      return next;
    });

    setActiveSymbolObj(symObj);
    setCurrentCode(tfCode);
    setTimeframeLabel(tfName);
    setTimeframeMinutes(tfMinutes);
    setIsAssetSelectorOpen(false);

    // Fetch candles for targeted slot
    renderedCodesRef.current[targetSlotIndex] = tfCode;
    fetchCandlesForSlot(targetSlotIndex, tfCode, false, true);

    setTimeout(subscribeVisibleSlots, 100);
  }, [activeSlotIndex, fetchCandlesForSlot, subscribeVisibleSlots]);

  // Handle Timeframe Switch on focused slot (or global header)
  const handleSelectTimeframe = useCallback((code, label, minutes) => {
    const targetSlotIndex = activeSlotIndex;
    const currentSlot = slotsRef.current[targetSlotIndex];
    const symObj = currentSlot?.symbolObj || activeSymbolObj;

    setCurrentCode(code);
    setTimeframeLabel(label);
    setTimeframeMinutes(minutes);

    setSlots((prev) => {
      const next = [...prev];
      if (next[targetSlotIndex]) {
        next[targetSlotIndex] = {
          ...next[targetSlotIndex],
          code,
          tfName: label,
          tfMinutes: minutes,
          symbolObj: symObj,
        };
      }
      return next;
    });

    renderedCodesRef.current[targetSlotIndex] = code;
    fetchCandlesForSlot(targetSlotIndex, code, false, true);
    setTimeout(subscribeVisibleSlots, 100);
  }, [activeSlotIndex, activeSymbolObj, fetchCandlesForSlot, subscribeVisibleSlots]);

  // Handle Slot Timeframe Switch directly from slot header
  const handleSlotChangeTimeframe = useCallback((slotIndex, tf) => {
    const slot = slotsRef.current[slotIndex];
    if (!slot) return;
    const symObj = slot.symbolObj || (slot.code ? getSymbolByCode(slot.code.split('_')[0]) : null) || activeSymbolObj;

    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = {
        ...next[slotIndex],
        code: tf.code,
        tfName: tf.name,
        tfMinutes: tf.minutes,
        symbolObj: symObj,
      };
      return next;
    });

    if (slotIndex === activeSlotIndex) {
      setCurrentCode(tf.code);
      setTimeframeLabel(tf.name);
      setTimeframeMinutes(tf.minutes);
      setActiveSymbolObj(symObj);
    }

    renderedCodesRef.current[slotIndex] = tf.code;
    fetchCandlesForSlot(slotIndex, tf.code, false, true);
    setTimeout(subscribeVisibleSlots, 100);
  }, [activeSlotIndex, activeSymbolObj, fetchCandlesForSlot, subscribeVisibleSlots]);

  // Handle Chart Slot Selection (Immediately syncs active slot, symbol, timeframe, and topbar OHLC)
  const handleSelectSlot = useCallback((index) => {
    setActiveSlotIndex(index);
    const slot = slotsRef.current[index] || {};
    const slotSymbolObj = slot.symbolObj || (slot.code ? getSymbolByCode(slot.code.split('_')[0]) : null) || activeSymbolObj;
    if (slot.code) {
      setCurrentCode(slot.code);
      setTimeframeLabel(slot.tfName || '5m');
      setTimeframeMinutes(slot.tfMinutes || 5);
      if (slotSymbolObj) setActiveSymbolObj(slotSymbolObj);
    }
    const targetChart = chartRefs[index]?.current;
    if (targetChart && targetChart.refreshOhlcHeader) {
      targetChart.refreshOhlcHeader();
    }
  }, [activeSymbolObj]);

  // Handle Layout Switch
  const handleSelectLayout = useCallback((newLayout) => {
    setActiveLayout(newLayout);
    const visibleCount = newLayout === '1' ? 1 : (newLayout.startsWith('2') ? 2 : (newLayout.startsWith('3') ? 3 : 4));

    // Fetch data for any newly shown slot that has a code
    for (let i = 0; i < visibleCount; i++) {
      const slot = slotsRef.current[i];
      if (slot && slot.code) {
        fetchCandlesForSlot(i, slot.code, true, false);
      }
    }

    setTimeout(subscribeVisibleSlots, 100);
  }, [fetchCandlesForSlot, subscribeVisibleSlots]);

  // Real-time Header Countdown Timer Loop (Only updates Header badge for focused slot)
  useEffect(() => {
    if (!currentCode) return;

    function updateCountdown() {
      const formatted = calculateBarCountdown(timeframeMinutesRef.current);
      updateHeaderCountdown(formatted);
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentCode, timeframeMinutes]);

  // Handle Login Success from Google
  const handleLoginSuccess = useCallback((token, user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    // Reload visible slots on login
    const visibleCount = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));
    for (let i = 0; i < visibleCount; i++) {
      const slot = slotsRef.current[i];
      const code = slot?.code || (i === 0 ? currentCodeRef.current : null);
      if (code) {
        renderedCodesRef.current[i] = code;
        fetchCandlesForSlot(i, code, i > 0, true);
      }
    }
    fetchTokenInfo();
  }, [fetchCandlesForSlot, fetchTokenInfo]);

  // Persistent WebSocket Connection Lifecycle (Authenticated Only)
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getSessionToken();
    if (!token) return;

    let socket = null;
    let isVercel = false;

    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      isVercel = host.includes('vercel.app');
    }

    if (!isVercel) {
      try {
        socket = io(window.location.origin, {
          auth: { sessionToken: token },
          query: { sessionToken: token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 10000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          setWsStatus('live');
          setNotification(null);
          subscribeVisibleSlots();
        });

        // 1. Listen for full candle CSV 'data' events from Crazii Relay
        socket.on('data', (csvPayload) => {
          if (!csvPayload) return;
          const str = typeof csvPayload === 'string' ? csvPayload : (csvPayload.rawData || csvPayload.data || '');
          if (!str) return;
          const parts = str.split(',');
          if (parts.length < 13) return;

          const symbol = parts[2]?.trim();
          const timeframe = parts[3]?.trim();
          if (!symbol || !timeframe) return;

          const count = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));

          for (let idx = 0; idx < count; idx++) {
            const slot = slotsRef.current[idx];
            if (!slot || !slot.code) continue;
            const expectedSymbol = slot.code.split('_')[0]?.trim();
            const expectedTf = slot.code.split('_')[1]?.trim();

            const isSymbolMatch = symbol === expectedSymbol || symbol.replace(/\.ca$/i, '') === expectedSymbol?.replace(/\.ca$/i, '');
            const isTfMatch = timeframe === expectedTf || String(parseInt(timeframe, 10)) === String(parseInt(expectedTf, 10));

            if (isSymbolMatch && isTfMatch) {
              const targetRef = chartRefs[idx];
              if (targetRef && targetRef.current) {
                targetRef.current.updateLiveCsv(parts, idx === activeSlotIndexRef.current);
              }
            }
          }
        });

        // 2. Listen for sub-second tick 'price' events
        socket.on('price', (arg1, arg2) => {
          let sym = typeof arg1 === 'string' ? arg1 : (arg1?.symbol || arg1?.code || '');
          let priceVal = arg2 !== undefined ? arg2 : (typeof arg1 === 'object' ? (arg1?.price || arg1?.lastPrice) : undefined);

          if (!sym || priceVal === undefined) return;
          sym = String(sym).trim();

          const count = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));

          for (let idx = 0; idx < count; idx++) {
            const slot = slotsRef.current[idx];
            if (!slot || !slot.code) continue;
            const expectedSymbol = slot.code.split('_')[0]?.trim();

            const isSymbolMatch = sym === expectedSymbol || sym.replace(/\.ca$/i, '') === expectedSymbol?.replace(/\.ca$/i, '');

            if (isSymbolMatch) {
              const targetRef = chartRefs[idx];
              if (targetRef && targetRef.current) {
                targetRef.current.updateLiveTickPrice(priceVal, idx === activeSlotIndexRef.current);
              }
            }
          }
        });

        socket.on('force_logout', (data) => {
          alert(data?.message || 'Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.');
          handleLogout();
        });

        socket.on('upstream_status', (status) => {
          if (status.connected) {
            setWsStatus('live');
          } else if (status.reconnecting) {
            setWsStatus('reconnecting');
          } else {
            setWsStatus('cloud');
          }
        });

        socket.on('token_refreshed', () => {
          fetchTokenInfo();
        });

        socket.on('connect_error', (err) => {
          if (err?.message && err.message.includes('DEVICE_SESSION_TERMINATED')) {
            alert('Tài khoản của bạn đã được đăng nhập trên một thiết bị/trình duyệt khác. Phiên làm việc này đã kết thúc.');
            handleLogout();
            return;
          }
          console.warn('[Socket Connection Error]', err?.message);
          setWsStatus('cloud');
        });

        socket.on('disconnect', () => {
          setWsStatus('disconnected');
        });
      } catch (e) {
        setWsStatus('cloud');
      }
    } else {
      setWsStatus('cloud');
    }

    // Live Polling Fallback (when socket is offline / cloud mode)
    const pollInterval = setInterval(() => {
      if (!socket || !socket.connected) {
        const visibleCount = activeLayoutRef.current === '1' ? 1 : (activeLayoutRef.current.startsWith('2') ? 2 : (activeLayoutRef.current.startsWith('3') ? 3 : 4));
        for (let i = 0; i < visibleCount; i++) {
          const slot = slotsRef.current[i];
          if (slot && slot.code) {
            fetchCandlesForSlot(i, slot.code, true);
          }
        }
      }
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [isAuthenticated, getSessionToken, fetchCandlesForSlot, fetchTokenInfo, subscribeVisibleSlots]);

  // Re-subscribe visible slots whenever layout or slot codes change
  useEffect(() => {
    if (isAuthenticated) {
      subscribeVisibleSlots();
    }
  }, [isAuthenticated, slots, activeLayout, subscribeVisibleSlots]);

  // Initial & Periodic Load On Page Access (Authenticated Only)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchTokenInfo();
    const tokenInterval = setInterval(fetchTokenInfo, 15000);
    return () => clearInterval(tokenInterval);
  }, [isAuthenticated, fetchTokenInfo]);

  // Determine how many slots to display based on layout
  const visibleSlotCount = activeLayout === '1' ? 1 : (activeLayout.startsWith('2') ? 2 : (activeLayout.startsWith('3') ? 3 : 4));

  // 1. Initial Checking Auth Loading Screen
  if (isCheckingAuth) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14', color: '#00e5ff', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <span className="spinner" style={{ width: '32px', height: '32px' }} />
          <span style={{ fontSize: '13px', letterSpacing: '0.5px' }}>Đang kiểm tra trạng thái đăng nhập...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Barrier: Render Full-Screen Google Sign-In Screen
  if (!isAuthenticated) {
    return <AuthOverlay onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Authenticated Dashboard
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0b0e14' }}>
      {/* Top Navigation Header */}
      <Header
        currentCode={currentCode}
        activeSymbolObj={activeSymbolObj}
        onOpenAssetSelector={() => setIsRightSidebarOpen(true)}
        timeframeLabel={timeframeLabel}
        onSelectTimeframe={handleSelectTimeframe}
        wsStatus={wsStatus}
        tokenInfo={tokenInfo}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        isRefreshing={isRefreshing}
        onRefresh={() => {
          if (currentCode) {
            for (let i = 0; i < visibleSlotCount; i++) {
              if (slots[i]?.code) fetchCandlesForSlot(i, slots[i].code, false, false);
            }
          } else {
            setIsRightSidebarOpen(true);
          }
        }}
        activeLayout={activeLayout}
        onSelectLayout={handleSelectLayout}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={handleToggleRightSidebar}
        isAutoSave={isAutoSave}
        onToggleAutoSave={handleToggleAutoSave}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        onSaveNow={handleSaveNow}
        onResetLayout={handleResetLayout}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Notification Banner */}
      {notification && (
        <div id="notification-banner" className={notification.type}>
          <span>{notification.message}</span>
          <button className="btn" onClick={() => setNotification(null)}>&times;</button>
        </div>
      )}

      {/* Main Terminal Viewport (Left Drawing Panel + Multi-Chart Area) */}
      <div className="terminal-main-content">
        {/* TradingView Left Vertical Drawing Panel */}
        <LeftDrawingPanel
          activeTool={activeDrawingTool}
          onSelectTool={(tool) => setActiveDrawingTool(tool)}
          isDrawingsHidden={isDrawingsHidden}
          onToggleHideDrawings={() => setIsDrawingsHidden((prev) => !prev)}
          isDrawingsLocked={isDrawingsLocked}
          onToggleLockDrawings={() => setIsDrawingsLocked((prev) => !prev)}
          onUndo={() => {
            const activeRef = chartRefs[activeSlotIndex];
            if (activeRef?.current?.undoDrawings) {
              activeRef.current.undoDrawings();
            }
          }}
          onRedo={() => {
            const activeRef = chartRefs[activeSlotIndex];
            if (activeRef?.current?.redoDrawings) {
              activeRef.current.redoDrawings();
            }
          }}
          onClearAllDrawings={() => {
            const activeRef = chartRefs[activeSlotIndex];
            if (activeRef?.current?.clearAllDrawings) {
              activeRef.current.clearAllDrawings();
            }
          }}
          hasDrawings={true}
        />

        {/* Multi-Chart Grid Viewport */}
        <div className={`multi-chart-wrapper layout-${activeLayout}`}>
          {Array.from({ length: visibleSlotCount }).map((_, index) => {
            const slot = slots[index] || {};
            const isSlotActive = index === activeSlotIndex;
            const slotSymbolObj = slot.symbolObj || (slot.code ? getSymbolByCode(slot.code.split('_')[0]) : null) || activeSymbolObj;
            const availableTfs = slotSymbolObj?.timeframes || [];

            return (
              <div
                key={index}
                className={`chart-slot-wrapper ${isSlotActive && activeLayout !== '1' ? 'active-slot' : ''}`}
                onClick={() => handleSelectSlot(index)}
                onMouseDown={() => handleSelectSlot(index)}
              >
                {/* Compact Slot Header (Shown when layout is multi-chart) */}
                {activeLayout !== '1' && (
                  <div className="chart-slot-header">
                    <div className="slot-left-info">
                      <button
                        className="slot-symbol-badge-btn"
                        title={`Click để đổi mã tài sản cho Khung #${index + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSlot(index);
                          setIsRightSidebarOpen(true);
                        }}
                      >
                        {slotSymbolObj?.image && (
                          <img
                            src={slotSymbolObj.image.split(';')[0]}
                            alt={slotSymbolObj.name}
                            className="slot-symbol-img"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        )}
                        <span className="slot-symbol-name">{slotSymbolObj?.name || 'CHỌN MÃ'}</span>
                        <span className="slot-symbol-tf">· {slot.tfName || '5m'}</span>
                        <span className="slot-symbol-arrow">▾</span>
                      </button>
                      {isSlotActive && <span className="slot-active-tag">ĐANG CHỌN</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {availableTfs.length > 0 && (
                        <div className="slot-tf-group">
                          {availableTfs.map((tf) => (
                            <button
                              key={tf.code}
                              className={`slot-tf-btn ${slot.code === tf.code ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSlotChangeTimeframe(index, tf);
                              }}
                            >
                              {tf.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        className="slot-action-btn"
                        title="Mở toàn khung biểu đồ này"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSlot(index);
                          setActiveLayout('1');
                        }}
                      >
                        🗖
                      </button>
                    </div>
                  </div>
                )}

                {/* Chart Component for this Slot */}
                <ChartContainer
                  ref={chartRefs[index]}
                  slotIndex={index}
                  isSlotActive={isSlotActive}
                  onSelectSlot={() => handleSelectSlot(index)}
                  currentCode={slot.code || (index === 0 ? currentCode : null)}
                  activeSymbolObj={slotSymbolObj}
                  timeframeMinutes={slot.tfMinutes || (index === 0 ? timeframeMinutes : 5)}
                  ksiLabelText={ksiLabelText}
                  kcxLabelText={kcxLabelText}
                  onOpenAssetSelector={() => {
                    handleSelectSlot(index);
                    setIsRightSidebarOpen(true);
                  }}
                  activeTimezone={activeTimezone}
                  onOpenTimezoneModal={() => setIsTimezoneModalOpen(true)}
                  hideStandbyOverlay={index > 0 && !!currentCode}
                  activeDrawingTool={index === activeSlotIndex ? activeDrawingTool : DRAWING_TOOLS.CROSSHAIR}
                  onToolCompleted={() => setActiveDrawingTool(DRAWING_TOOLS.CROSSHAIR)}
                  isDrawingsHidden={isDrawingsHidden}
                  isDrawingsLocked={isDrawingsLocked}
                  onSyncDrawings={handleSyncDrawings}
                  onSyncCrosshair={handleSyncCrosshair}
                />
              </div>
            );
          })}
        </div>

        {/* Right Watchlist Sidebar & Always-Visible Toggle Button Strip */}
        <RightWatchlistSidebar
          isOpen={isRightSidebarOpen}
          onToggleOpen={handleToggleRightSidebar}
          targetSlotIndex={activeSlotIndex}
          onSelectSlot={handleSelectSlot}
          activeLayout={activeLayout}
          currentSlotCode={slots[activeSlotIndex]?.code || currentCode}
          currentSymbolCode={slots[activeSlotIndex]?.symbolObj?.code || activeSymbolObj?.code}
          currentTimeframeCode={slots[activeSlotIndex]?.code || currentCode}
          onSelectAsset={handleSelectAsset}
          visibleSlotCount={visibleSlotCount}
        />
      </div>

      {/* Asset Selector Watchlist Modal */}
      <AssetSelector
        isOpen={isAssetSelectorOpen}
        onClose={() => {
          if (currentCode) setIsAssetSelectorOpen(false);
        }}
        currentSymbolCode={slots[activeSlotIndex]?.symbolObj?.code || activeSymbolObj?.code}
        currentTimeframeCode={slots[activeSlotIndex]?.code || currentCode}
        targetSlotIndex={activeSlotIndex}
        activeLayout={activeLayout}
        onSelectAsset={handleSelectAsset}
      />

      {/* Timezone Switcher Modal */}
      <TimezoneModal
        isOpen={isTimezoneModalOpen}
        onClose={() => setIsTimezoneModalOpen(false)}
        activeTimezone={activeTimezone}
        onSelectTimezone={handleSelectTimezone}
      />

      {/* Token & Auto-Refresh Modal */}
      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        tokenInfo={tokenInfo}
        onRefreshTokenSuccess={() => {
          fetchTokenInfo();
          if (currentCode) {
            for (let i = 0; i < visibleSlotCount; i++) {
              if (slots[i]?.code) fetchCandlesForSlot(i, slots[i].code, false, false);
            }
          }
        }}
      />
    </div>
  );
}
