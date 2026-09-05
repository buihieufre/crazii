'use client';

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as LightweightCharts from 'lightweight-charts';
import { BULLISH_COLOR, BEARISH_COLOR, NEUTRAL_COLOR, PRICE_LINE_SPECS } from '@/lib/chart-constants';
import { parseTimestampToSeconds, calculateBarCountdown } from '@/lib/utils';
import { updateOhlcHeader } from '@/lib/ohlc-updater';
import { formatTimeWithOffset, formatTickMark, getCurrentTimeInOffset } from '@/lib/timezones';
import DrawingPropsBar from '@/components/DrawingPropsBar';
import { DRAWING_TOOLS } from '@/components/LeftDrawingPanel';
import {
  getCanvasCoordinates,
  pointToPixel,
  pixelToPoint,
  hitTestDrawing,
  renderDrawings,
  DrawingToolsPrimitive,
} from '@/lib/drawing-engine';

// Custom 60fps Canvas Primitive for Crazii Signal Diamonds
class DiamondSignalsPaneView {
  constructor(primitive) {
    this._primitive = primitive;
  }

  update() {}

  renderer() {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context: ctx }) => {
          this._primitive.draw(ctx);
        });
      },
    };
  }

  zOrder() {
    return 'top';
  }
}

class DiamondSignalsPrimitive {
  constructor() {
    this._paneViews = [new DiamondSignalsPaneView(this)];
    this._signals = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews() {
    return this._paneViews;
  }

  updateAllViews() {
    this._paneViews.forEach((pw) => pw.update());
  }

  setSignals(signals) {
    this._signals = Array.isArray(signals) ? signals : [];
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  updateLiveSignal(time, liveSignals) {
    this._signals = this._signals.filter((s) => s.time !== time).concat(liveSignals || []);
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  draw(ctx) {
    if (!this._chart || !this._series) return;
    const timeScale = this._chart.timeScale();
    const series = this._series;

    // Render Signal Diamonds (Cyan & Peach Cluster)
    const signals = this._signals;
    if (!signals || signals.length === 0) return;

    for (let i = 0; i < signals.length; i++) {
      const sig = signals[i];
      const x = timeScale.timeToCoordinate(sig.time);
      if (x === null || x === undefined || isNaN(x)) continue;
      if (x < -20 || x > ctx.canvas.width + 20) continue;

      let y = null;
      if (sig.price !== undefined && !isNaN(sig.price) && sig.price > 0) {
        y = series.priceToCoordinate(sig.price);
      }

      if (y === null || y === undefined || isNaN(y)) {
        if (sig.type === 'buy_diamond') {
          const lowY = series.priceToCoordinate(sig.low);
          y = lowY !== null && !isNaN(lowY) ? lowY + 12 : null;
        } else {
          const highY = series.priceToCoordinate(sig.high);
          y = highY !== null && !isNaN(highY) ? highY - 12 : null;
        }
      }

      if (y === null || y === undefined || isNaN(y)) continue;

      if (sig.type === 'buy_diamond') {
        // Cyan Diamond (Strategy 1 / Strategy 2 Buy) 🔷
        ctx.save();
        ctx.beginPath();
        const size = 6;
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fillStyle = '#00E5FF';
        ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Inner white center dot
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();
      } else if (sig.type === 'add_cluster' || sig.type === 'sell_cluster') {
        // Peach / Amber 4-Diamond Cluster (Strategy 1 Sell / Strategy 3 Add) 🔶
        ctx.save();
        const subSize = 2.6;
        const gap = 4.2;
        const offsets = [
          { dx: 0, dy: -gap },
          { dx: gap, dy: 0 },
          { dx: 0, dy: gap },
          { dx: -gap, dy: 0 },
        ];
        ctx.fillStyle = '#FFA726';
        ctx.strokeStyle = '#FFE0B2';
        ctx.lineWidth = 0.8;
        ctx.shadowColor = 'rgba(255, 167, 38, 0.7)';
        ctx.shadowBlur = 4;
        for (let j = 0; j < offsets.length; j++) {
          const { dx, dy } = offsets[j];
          const cx = x + dx;
          const cy = y + dy;
          ctx.beginPath();
          ctx.moveTo(cx, cy - subSize);
          ctx.lineTo(cx + subSize, cy);
          ctx.lineTo(cx, cy + subSize);
          ctx.lineTo(cx - subSize, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}

// Custom 60fps Canvas Primitive for KCX Green Oversold & Blink Histogram Bars (Calculated Height & Blinking)
class KcxBlinkPaneView {
  constructor(primitive) {
    this._primitive = primitive;
  }

  update() {}

  renderer() {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context: ctx }) => {
          this._primitive.draw(ctx);
        });
      },
    };
  }

  zOrder() {
    return 'top';
  }
}

class KcxBlinkPrimitive {
  constructor() {
    this._paneViews = [new KcxBlinkPaneView(this)];
    this._blinkItems = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._animFrameId = null;
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
    this._startAnimLoop();
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  _startAnimLoop() {
    if (this._animFrameId) return;
    const loop = () => {
      if (!this._chart || !this._series) {
        this._animFrameId = null;
        return;
      }
      const hasLive = this._blinkItems && this._blinkItems.some((item) => item.isLive);
      if (hasLive && this._requestUpdate) {
        this._requestUpdate();
      }
      this._animFrameId = requestAnimationFrame(loop);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  paneViews() {
    return this._paneViews;
  }

  updateAllViews() {
    this._paneViews.forEach((pw) => pw.update());
  }

  setBlinkItems(items) {
    this._blinkItems = Array.isArray(items) ? items : [];
    this._startAnimLoop();
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  updateLiveBlink(time, hasBlink, kcxVal) {
    this._blinkItems = this._blinkItems.filter((b) => b.time !== time);
    if (hasBlink && !isNaN(kcxVal) && kcxVal !== 0) {
      this._blinkItems.push({ time, kcx: kcxVal, isLive: true });
    }
    this._startAnimLoop();
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  draw(ctx) {
    if (!this._chart || !this._series) return;
    const timeScale = this._chart.timeScale();
    const series = this._series;
    const items = this._blinkItems;
    if (!items || items.length === 0) return;

    // Calculate dynamic bar width matching chart's current bar spacing
    let barWidth = 4;
    try {
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (visibleRange) {
        const barsCount = Math.max(1, visibleRange.to - visibleRange.from);
        const chartWidth = ctx.canvas.width;
        barWidth = Math.max(2, Math.min(14, (chartWidth / barsCount) * 0.72));
      }
    } catch (e) {}

    const now = Date.now();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const x = timeScale.timeToCoordinate(item.time);
      if (x === null || x === undefined || isNaN(x)) continue;
      if (x < -20 || x > ctx.canvas.width + 20) continue;

      // Coordinate for KCX -300 baseline threshold
      const y300 = series.priceToCoordinate(-300);
      // Coordinate for the actual KCX value (e.g. -340.9)
      const yKcx = series.priceToCoordinate(item.kcx);

      if (yKcx === null || yKcx === undefined || isNaN(yKcx)) {
        continue;
      }

      let yTop, yBottom;
      if (y300 !== null && !isNaN(y300) && item.kcx <= -300) {
        // Starts at -300 threshold and extends downwards to actual kcx value
        yTop = Math.min(y300, yKcx);
        yBottom = Math.max(y300, yKcx);
      } else {
        // If between 0 and -300: draw prominent green block at bottom of the bar
        yTop = yKcx - 8;
        yBottom = yKcx;
      }

      const barHeight = Math.max(6, yBottom - yTop);

      ctx.save();

      // Pulsing alpha for active live / latest candle
      let alpha = 1.0;
      if (item.isLive) {
        // Smooth continuous sine wave pulse between 0.25 and 1.0
        alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now / 150));
      }

      ctx.globalAlpha = alpha;

      const barX = Math.round(x - barWidth / 2);
      const w = Math.max(2, Math.round(barWidth));
      const h = Math.max(5, Math.round(barHeight));

      // 1. Neon Lime Green Solid Bar Fill
      ctx.fillStyle = '#76FF03'; // Bright Neon Lime
      ctx.shadowColor = 'rgba(118, 255, 3, 0.95)';
      ctx.shadowBlur = item.isLive ? 8 : 4;
      ctx.fillRect(barX, yTop, w, h);

      // 2. Bright core highlight for 3D depth
      if (w >= 3) {
        ctx.fillStyle = item.isLive ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.35)';
        ctx.shadowBlur = 0;
        ctx.fillRect(barX + 1, yTop, Math.max(1, w - 2), Math.max(3, h - 1));
      }

      ctx.restore();
    }
  }
}

const ChartContainer = forwardRef(function ChartContainer(
  {
    slotIndex = 0,
    isSlotActive = true,
    currentCode,
    activeSymbolObj,
    timeframeMinutes,
    ksiLabelText,
    kcxLabelText,
    onOpenAssetSelector,
    activeTimezone,
    onOpenTimezoneModal,
    hideStandbyOverlay = false,
    activeDrawingTool = DRAWING_TOOLS.CROSSHAIR,
    onToolCompleted,
    isDrawingsHidden = false,
    isDrawingsLocked = false,
    onSyncDrawings,
    onSyncCrosshair,
    onSelectSlot,
  },
  ref
) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const ksiSeriesRef = useRef(null);
  const kcxSeriesRef = useRef(null);
  const activePriceLinesMapRef = useRef(new Map());
  const rawCandleMapRef = useRef(new Map());
  const diamondSignalsPrimitiveRef = useRef(null);
  const kcxBlinkPrimitiveRef = useRef(null);
  const drawingToolsPrimitiveRef = useRef(null);

  // Drawing Tools State & Refs
  const [drawings, setDrawings] = useState([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const drawingCanvasRef = useRef(null);
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const selectedDrawingIdRef = useRef(selectedDrawingId);
  selectedDrawingIdRef.current = selectedDrawingId;

  const activeToolRef = useRef(activeDrawingTool);
  activeToolRef.current = activeDrawingTool;

  const isDrawingsHiddenRef = useRef(isDrawingsHidden);
  isDrawingsHiddenRef.current = isDrawingsHidden;

  const isDrawingsLockedRef = useRef(isDrawingsLocked);
  isDrawingsLockedRef.current = isDrawingsLocked;

  const cachedCandlesRef = useRef([]);
  const currentDraftRef = useRef(null);
  const dragInfoRef = useRef({ mode: 'none', drawingId: null, handleIndex: -1, startPoint: null, originalPoints: [] });

  // Direct DOM refs for 60fps zero-react-render badge updates
  const tvBadgeRef = useRef(null);
  const tvPriceTextRef = useRef(null);
  const tvSymbolTextRef = useRef(null);
  const tvCountdownTextRef = useRef(null);
  const leftBadgesContainerRef = useRef(null);

  const latestCandleRef = useRef(null);
  const currentCodeRef = useRef(currentCode);
  currentCodeRef.current = currentCode;

  const decimalsRef = useRef(activeSymbolObj?.decimals || 2);
  decimalsRef.current = activeSymbolObj?.decimals !== undefined ? activeSymbolObj.decimals : 2;

  const isSlotActiveRef = useRef(isSlotActive);
  isSlotActiveRef.current = isSlotActive;

  // Synchronize Topbar OHLC when this slot becomes active or changes asset
  useEffect(() => {
    if (isSlotActive) {
      if (latestCandleRef.current) {
        updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
      } else {
        updateOhlcHeader(null);
      }
    }
  }, [isSlotActive, activeSymbolObj, currentCode]);

  const [ksiHeightFactor, setKsiHeightFactor] = useState(180);
  const [kcxHeightFactor, setKcxHeightFactor] = useState(180);
  const [panePositions, setPanePositions] = useState({ ksiTop: 0, kcxTop: 0 });

  const timezoneOffsetRef = useRef(activeTimezone?.offset !== undefined ? activeTimezone.offset : 420);
  timezoneOffsetRef.current = activeTimezone?.offset !== undefined ? activeTimezone.offset : 420;

  const [tzClock, setTzClock] = useState(() => getCurrentTimeInOffset(activeTimezone?.offset || 420));
  useEffect(() => {
    const update = () => setTzClock(getCurrentTimeInOffset(activeTimezone?.offset || 420));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeTimezone]);

  // Undo / Redo History Stacks
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Get symbol key for localStorage
  const getSymbolKey = useCallback(() => {
    if (!currentCode) return 'DEFAULT';
    return currentCode.split('_')[0] || 'DEFAULT';
  }, [currentCode]);

  // Save drawings helper with multi-chart synchronization
  const saveDrawings = useCallback((newDrawings, shouldSync = true) => {
    setDrawings(newDrawings);
    drawingsRef.current = newDrawings;
    const symKey = getSymbolKey();
    try {
      const key = `crazii_drawings_${symKey}`;
      localStorage.setItem(key, JSON.stringify(newDrawings));
    } catch (e) {}
    if (shouldSync && onSyncDrawings) {
      onSyncDrawings(symKey, newDrawings, slotIndex);
    }
  }, [getSymbolKey, onSyncDrawings, slotIndex]);

  // Save drawings with Undo History Snapshot
  const saveDrawingsWithHistory = useCallback((newDrawings) => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(drawingsRef.current)));
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    saveDrawings(newDrawings, true);
  }, [saveDrawings]);

  // Redraw drawings natively via primitive (Zero Lag)
  const redrawDrawings = useCallback(() => {
    if (drawingToolsPrimitiveRef.current) {
      drawingToolsPrimitiveRef.current.setDrawings(
        drawingsRef.current,
        selectedDrawingIdRef.current,
        currentDraftRef.current,
        isDrawingsHiddenRef.current
      );
    }
  }, []);

  // Undo (Ctrl + Z)
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    redoStackRef.current.push(JSON.parse(JSON.stringify(drawingsRef.current)));
    saveDrawings(prev, true);
    if (!prev.find((d) => d.id === selectedDrawingIdRef.current)) {
      setSelectedDrawingId(null);
    }
    redrawDrawings();
  }, [saveDrawings, redrawDrawings]);

  // Redo (Ctrl + Y / Ctrl + Shift + Z)
  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    undoStackRef.current.push(JSON.parse(JSON.stringify(drawingsRef.current)));
    saveDrawings(next, true);
    redrawDrawings();
  }, [saveDrawings, redrawDrawings]);

  // Load drawings from localStorage on symbol change
  useEffect(() => {
    const key = `crazii_drawings_${getSymbolKey()}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDrawings(parsed);
        } else {
          setDrawings([]);
        }
      } else {
        setDrawings([]);
      }
    } catch (e) {
      setDrawings([]);
    }
    undoStackRef.current = [];
    redoStackRef.current = [];
    setSelectedDrawingId(null);
  }, [getSymbolKey]);

  useEffect(() => {
    redrawDrawings();
  }, [drawings, selectedDrawingId, isDrawingsHidden, redrawDrawings]);

  // Canvas Mouse Down
  const handleCanvasMouseDown = (e) => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoordinates(e, canvas);
    const point = pixelToPoint(x, y, chartRef.current, candleSeriesRef.current, cachedCandlesRef.current);
    if (!point) return;

    const hit = hitTestDrawing(x, y, drawingsRef.current, chartRef.current, candleSeriesRef.current);

    // TARGET / SELECT DRAWING
    if (hit) {
      setSelectedDrawingId(hit.drawing.id);
      if (hit.drawing.isLocked || isDrawingsLockedRef.current) {
        dragInfoRef.current = { mode: 'none' };
        return;
      }

      if (hit.type === 'handle' || hit.type === 'handle_sl' || hit.type === 'handle_width') {
        dragInfoRef.current = {
          mode: 'handle',
          drawingId: hit.drawing.id,
          handleIndex: hit.handleIndex,
          startPoint: point,
          originalPoints: JSON.parse(JSON.stringify(hit.drawing.points)),
          originalSlPrice: hit.drawing.slPrice,
        };
      } else {
        dragInfoRef.current = {
          mode: 'body',
          drawingId: hit.drawing.id,
          startPoint: point,
          originalPoints: JSON.parse(JSON.stringify(hit.drawing.points)),
          originalSlPrice: hit.drawing.slPrice,
        };
      }
      return;
    }

    // UNTARGET / DESELECT when clicking on empty canvas area
    if (selectedDrawingIdRef.current) {
      setSelectedDrawingId(null);
    }

    if (activeToolRef.current === DRAWING_TOOLS.CROSSHAIR || activeToolRef.current === DRAWING_TOOLS.CURSOR) {
      return;
    }

    if (!isDrawingsLockedRef.current) {
      const tool = activeToolRef.current;

      // Single-click tools
      if (tool === DRAWING_TOOLS.HORIZONTAL_LINE || tool === DRAWING_TOOLS.VERTICAL_LINE || tool === DRAWING_TOOLS.PRICE_TAG || tool === DRAWING_TOOLS.TEXT) {
        const newDrawing = {
          id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          type: tool,
          points: [point],
          color: tool === DRAWING_TOOLS.PRICE_TAG ? '#00E5FF' : '#2962FF',
          lineWidth: 2,
          lineStyle: 'solid',
          text: tool === DRAWING_TOOLS.TEXT ? 'Ghi chú phân tích' : '',
        };
        const updated = [...drawingsRef.current, newDrawing];
        saveDrawingsWithHistory(updated);
        setSelectedDrawingId(newDrawing.id);
        if (onToolCompleted) onToolCompleted();
        return;
      }

      // 2-point tools (trendline, ray, arrow, rectangle, fibonacci, long, short, grid, volume_range)
      currentDraftRef.current = {
        id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: tool,
        points: [point, { ...point }],
        color: tool === DRAWING_TOOLS.LONG_POSITION ? '#00E676' : tool === DRAWING_TOOLS.SHORT_POSITION ? '#FF5252' : '#2962FF',
        lineWidth: 2,
        lineStyle: 'solid',
      };

      dragInfoRef.current = {
        mode: 'creating',
        drawingId: currentDraftRef.current.id,
        handleIndex: 1,
        startPoint: point,
      };

      redrawDrawings();
    }
  };

  // Canvas Mouse Move
  const handleCanvasMouseMove = (e) => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoordinates(e, canvas);
    const point = pixelToPoint(x, y, chartRef.current, candleSeriesRef.current, cachedCandlesRef.current);
    if (!point) return;

    // Creating new shape
    if (dragInfoRef.current.mode === 'creating' && currentDraftRef.current) {
      currentDraftRef.current.points[1] = point;
      redrawDrawings();
      return;
    }

    // Dragging handle
    if (dragInfoRef.current.mode === 'handle') {
      const { drawingId, handleIndex } = dragInfoRef.current;
      const curDrawings = drawingsRef.current.map((d) => {
        if (d.id !== drawingId) return d;
        const newPoints = [...d.points];
        if (handleIndex === 2) {
          // SL handle for long/short
          return { ...d, slPrice: point.price };
        } else if (handleIndex === 3) {
          // Width handle for long/short
          newPoints[1] = { ...newPoints[1], time: point.time };
          return { ...d, points: newPoints };
        } else {
          newPoints[handleIndex] = point;
          return { ...d, points: newPoints };
        }
      });
      drawingsRef.current = curDrawings;
      redrawDrawings();
      return;
    }

    // Dragging whole body
    if (dragInfoRef.current.mode === 'body') {
      const { drawingId, startPoint, originalPoints, originalSlPrice } = dragInfoRef.current;
      const deltaPrice = point.price - startPoint.price;
      const deltaTime = point.time - startPoint.time;

      const curDrawings = drawingsRef.current.map((d) => {
        if (d.id !== drawingId) return d;
        const newPoints = originalPoints.map((p) => ({
          time: p.time + deltaTime,
          price: p.price + deltaPrice,
        }));
        return {
          ...d,
          points: newPoints,
          slPrice: originalSlPrice !== undefined ? originalSlPrice + deltaPrice : undefined,
        };
      });
      drawingsRef.current = curDrawings;
      redrawDrawings();
      return;
    }
  };

  // Canvas Mouse Up
  const handleCanvasMouseUp = () => {
    if (dragInfoRef.current.mode === 'creating' && currentDraftRef.current) {
      const draft = currentDraftRef.current;
      currentDraftRef.current = null;
      dragInfoRef.current = { mode: 'none' };

      const updated = [...drawingsRef.current, draft];
      saveDrawingsWithHistory(updated);
      setSelectedDrawingId(draft.id);
      if (onToolCompleted) onToolCompleted();
      redrawDrawings();
      return;
    }

    if (dragInfoRef.current.mode === 'handle' || dragInfoRef.current.mode === 'body') {
      dragInfoRef.current = { mode: 'none' };
      saveDrawingsWithHistory(drawingsRef.current);
      redrawDrawings();
    }
  };

  // Wrapper Mouse Move to enable pointerEvents dynamically
  const handleWrapperMouseMove = (e) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !chartRef.current || !candleSeriesRef.current) return;

    if (activeToolRef.current !== DRAWING_TOOLS.CROSSHAIR && activeToolRef.current !== DRAWING_TOOLS.CURSOR) {
      canvas.style.pointerEvents = 'auto';
      return;
    }

    if (dragInfoRef.current.mode !== 'none' || currentDraftRef.current) {
      canvas.style.pointerEvents = 'auto';
      return;
    }

    const { x, y } = getCanvasCoordinates(e, canvas);
    const hit = hitTestDrawing(x, y, drawingsRef.current, chartRef.current, candleSeriesRef.current);
    if (hit) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.cursor = hit.type === 'handle' ? 'crosshair' : 'move';
    } else {
      canvas.style.pointerEvents = selectedDrawingIdRef.current ? 'auto' : 'none';
      canvas.style.cursor = 'default';
    }
  };

  // Keyboard Shortcuts (Ctrl+Z Undo, Ctrl+Y Redo, Delete, Escape)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Undo: Ctrl + Z
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      // Delete selected drawing
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDrawingIdRef.current) {
          e.preventDefault();
          const updated = drawingsRef.current.filter((d) => d.id !== selectedDrawingIdRef.current);
          saveDrawingsWithHistory(updated);
          setSelectedDrawingId(null);
        }
        return;
      }

      // Untarget / Deselect / Escape
      if (e.key === 'Escape') {
        if (currentDraftRef.current) {
          currentDraftRef.current = null;
          redrawDrawings();
        }
        setSelectedDrawingId(null);
        if (onToolCompleted) onToolCompleted();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, saveDrawingsWithHistory, onToolCompleted, redrawDrawings]);

  // Independent Local Bar Countdown Timer for this specific chart instance
  useEffect(() => {
    function updateCountdown() {
      let mins = timeframeMinutes;
      if (!mins && currentCode) {
        const parts = currentCode.split('_');
        if (parts.length > 1) mins = parseInt(parts[1], 10);
      }
      if (!mins || isNaN(mins)) mins = 5;

      const formatted = calculateBarCountdown(mins);
      if (tvCountdownTextRef.current) {
        tvCountdownTextRef.current.innerText = formatted;
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentCode, timeframeMinutes]);


  // Apply 100% Solid Opaque Background & Border Styles to each pane DOM element
  function applySolidPaneStyles(panes) {
    if (!panes || panes.length < 3) return;
    const el0 = panes[0]?.getHTMLElement();
    if (el0) {
      el0.style.backgroundColor = '#0b0e14';
    }
    const el1 = panes[1]?.getHTMLElement();
    if (el1) {
      el1.style.backgroundColor = '#0e121a'; // Solid Opaque background for KSI
      el1.style.borderTop = '2px solid #232838';
    }
    const el2 = panes[2]?.getHTMLElement();
    if (el2) {
      el2.style.backgroundColor = '#0e121a'; // Solid Opaque background for KCX
      el2.style.borderTop = '2px solid #232838';
    }
  }

  function updatePaneHeaderPositions() {
    if (!chartRef.current || !containerRef.current) return;
    const panes = chartRef.current.panes();
    if (!panes || panes.length < 3) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const el1 = panes[1]?.getHTMLElement();
    const el2 = panes[2]?.getHTMLElement();

    if (el1 && el2) {
      const rect1 = el1.getBoundingClientRect();
      const rect2 = el2.getBoundingClientRect();
      setPanePositions({
        ksiTop: Math.max(0, rect1.top - containerRect.top),
        kcxTop: Math.max(0, rect2.top - containerRect.top),
      });
    }
  }

  const handleAdjustPane = (paneIndex, delta) => {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    if (!panes || panes.length <= paneIndex) return;

    if (paneIndex === 1) {
      const current = panes[1].getStretchFactor() || 180;
      const next = Math.max(80, Math.min(500, current + delta));
      panes[1].setStretchFactor(next);
      setKsiHeightFactor(next);
    } else if (paneIndex === 2) {
      const current = panes[2].getStretchFactor() || 180;
      const next = Math.max(80, Math.min(500, current + delta));
      panes[2].setStretchFactor(next);
      setKcxHeightFactor(next);
    }
    requestAnimationFrame(updatePaneHeaderPositions);
  };

  const handleSetPreset = (paneIndex, presetFactor) => {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    if (!panes || panes.length <= paneIndex) return;

    panes[paneIndex].setStretchFactor(presetFactor);
    if (paneIndex === 1) setKsiHeightFactor(presetFactor);
    if (paneIndex === 2) setKcxHeightFactor(presetFactor);
    requestAnimationFrame(updatePaneHeaderPositions);
  };

  const handleStartDrag = (e, dividerIndex) => {
    e.preventDefault();
    const startY = e.clientY;
    const panes = chartRef.current?.panes();
    if (!panes || panes.length < 3) return;

    const startStretch0 = panes[0].getStretchFactor() || 700;
    const startStretch1 = panes[1].getStretchFactor() || 180;
    const startStretch2 = panes[2].getStretchFactor() || 180;
    const totalStretch = startStretch0 + startStretch1 + startStretch2;
    const containerH = containerRef.current?.clientHeight || 600;

    const onMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaStretch = (deltaY / containerH) * totalStretch;

      if (dividerIndex === 1) {
        const newStretch0 = Math.max(200, startStretch0 + deltaStretch);
        const newStretch1 = Math.max(80, startStretch1 - deltaStretch);
        panes[0].setStretchFactor(newStretch0);
        panes[1].setStretchFactor(newStretch1);
        setKsiHeightFactor(newStretch1);
      } else if (dividerIndex === 2) {
        const newStretch1 = Math.max(80, startStretch1 + deltaStretch);
        const newStretch2 = Math.max(80, startStretch2 - deltaStretch);
        panes[1].setStretchFactor(newStretch1);
        panes[2].setStretchFactor(newStretch2);
        setKsiHeightFactor(newStretch1);
        setKcxHeightFactor(newStretch2);
      }
      requestAnimationFrame(updatePaneHeaderPositions);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      requestAnimationFrame(updatePaneHeaderPositions);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Dynamically update chart options when timezone changes
  useEffect(() => {
    if (chartRef.current) {
      const offset = activeTimezone?.offset !== undefined ? activeTimezone.offset : 420;
      timezoneOffsetRef.current = offset;
      try {
        chartRef.current.applyOptions({
          localization: {
            timeFormatter: (t) => formatTimeWithOffset(t, offset),
          },
          timeScale: {
            tickMarkFormatter: (time, tickMarkType) => formatTickMark(time, tickMarkType, offset),
          },
        });
      } catch (e) {}
    }
  }, [activeTimezone]);

  // Reset forming candle and markers when symbol changes
  useEffect(() => {
    latestCandleRef.current = null;
    rawCandleMapRef.current.clear();
    if (diamondSignalsPrimitiveRef.current) {
      diamondSignalsPrimitiveRef.current.setSignals([]);
    }
    if (kcxBlinkPrimitiveRef.current) {
      kcxBlinkPrimitiveRef.current.setBlinkItems([]);
    }
    activePriceLinesMapRef.current.forEach((line) => {
      try { candleSeriesRef.current?.removePriceLine(line); } catch (e) {}
    });
    activePriceLinesMapRef.current.clear();
    if (leftBadgesContainerRef.current) leftBadgesContainerRef.current.innerHTML = '';
  }, [currentCode]);

  // Expose API for real-time updates and dataset loading
  useImperativeHandle(ref, () => ({
    clearAllDrawings() {
      saveDrawingsWithHistory([]);
      setSelectedDrawingId(null);
      redrawDrawings();
    },

    undoDrawings() {
      handleUndo();
    },

    redoDrawings() {
      handleRedo();
    },

    deselectDrawing() {
      setSelectedDrawingId(null);
    },

    syncDrawings(incomingDrawings) {
      if (!Array.isArray(incomingDrawings)) return;
      setDrawings(incomingDrawings);
      drawingsRef.current = incomingDrawings;
      if (!incomingDrawings.find((d) => d.id === selectedDrawingIdRef.current)) {
        setSelectedDrawingId(null);
      }
      redrawDrawings();
    },

    syncCrosshair(time, price) {
      if (!chartRef.current || !candleSeriesRef.current) return;
      if (!time) {
        try {
          chartRef.current.clearCrosshairPosition();
        } catch (e) {}
        return;
      }

      try {
        let targetPrice = price;
        if (targetPrice === undefined || isNaN(targetPrice)) {
          const candle = rawCandleMapRef.current?.get(time);
          if (candle && candle.close !== undefined) {
            targetPrice = candle.close;
          } else if (latestCandleRef.current) {
            targetPrice = latestCandleRef.current.close;
          }
        }
        chartRef.current.setCrosshairPosition(targetPrice !== undefined ? targetPrice : 0, time, candleSeriesRef.current);
      } catch (e) {
        try {
          chartRef.current.clearCrosshairPosition();
        } catch (err) {}
      }
    },

    clearCrosshair() {
      if (chartRef.current) {
        try {
          chartRef.current.clearCrosshairPosition();
        } catch (e) {}
      }
    },

    renderDataset(dataArray, isInitial = false) {
      if (!Array.isArray(dataArray) || dataArray.length === 0) return;
      if (!candleSeriesRef.current) return;

      rawCandleMapRef.current.clear();
      const candleData = [];
      const ksiData = [];
      const kcxData = [];
      const signals = [];

      const sortedArray = [...dataArray].sort((a, b) => {
        const tA = parseTimestampToSeconds(a.timestamp || a.time);
        const tB = parseTimestampToSeconds(b.timestamp || b.time);
        return tA - tB;
      });

      const seenTimestamps = new Set();

      const kcxBlinkItems = [];

      for (const item of sortedArray) {
        if (!item || item.open === undefined || item.close === undefined) continue;

        const time = parseTimestampToSeconds(item.timestamp || item.time);
        if (seenTimestamps.has(time)) continue;
        seenTimestamps.add(time);

        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const twbOpen = parseFloat(item.twb_open);
        const twbClose = parseFloat(item.twb_close);

        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

        let candleColor = NEUTRAL_COLOR;
        if (!isNaN(twbOpen) && !isNaN(twbClose)) {
          if (twbClose > twbOpen) candleColor = BULLISH_COLOR;
          else if (twbClose < twbOpen) candleColor = BEARISH_COLOR;
        }

        rawCandleMapRef.current.set(time, {
          ...item,
          time,
          open,
          high,
          low,
          close,
          twbOpen,
          twbClose,
        });

        candleData.push({
          time: time,
          open: open,
          high: high,
          low: low,
          close: close,
          color: candleColor,
          wickColor: candleColor,
          borderColor: candleColor,
        });

        // Signals (Cyan Diamond Buy / Peach 4-Cluster Add)
        const buySignal1 = parseFloat(item.pivots_buy_strategy_1);
        const sellSignal1 = parseFloat(item.pivots_sell_strategy_1);
        const buySignal2 = parseFloat(item.kcx_buy_strategy_2);
        const addSignal3 = parseFloat(item.kcx_add_strategy_3);

        if (!isNaN(buySignal2) && buySignal2 > 0) {
          signals.push({ time, price: buySignal2, low, high, open, close, type: 'buy_diamond' });
        } else if (!isNaN(buySignal1) && buySignal1 > 0) {
          signals.push({ time, price: buySignal1, low, high, open, close, type: 'buy_diamond' });
        }

        if (!isNaN(addSignal3) && addSignal3 > 0) {
          signals.push({ time, price: addSignal3, low, high, open, close, type: 'add_cluster' });
        } else if (!isNaN(sellSignal1) && sellSignal1 > 0) {
          signals.push({ time, price: sellSignal1, low, high, open, close, type: 'add_cluster' });
        }

        // Histograms (KSI & KCX)
        const ksiGreen = parseFloat(item.ksi_green);
        const ksiRed = parseFloat(item.ksi_red);
        let ksiVal = 0;
        let ksiColor = 'rgba(0, 230, 118, 0.9)';

        if (!isNaN(ksiGreen) && ksiGreen > 0) {
          ksiVal = ksiGreen;
          ksiColor = '#00E676';
        } else if (!isNaN(ksiRed) && ksiRed > 0) {
          ksiVal = ksiRed;
          ksiColor = '#FF3B30';
        }

        ksiData.push({
          time: time,
          value: ksiVal,
          color: ksiColor,
        });

        const kcxVal = parseFloat(item.kcx);
        const blinkBack = parseInt(item.kcx_blink_bar_candles_back, 10);
        const isBlinkBar = (!isNaN(blinkBack) && blinkBack === 0) || (item.kcx_symbol && item.kcx_symbol !== '0') || (!isNaN(kcxVal) && kcxVal <= -300);

        if (isBlinkBar && !isNaN(kcxVal) && kcxVal !== 0) {
          kcxBlinkItems.push({
            time: time,
            kcx: kcxVal,
            isLive: false,
          });
        }

        kcxData.push({
          time: time,
          value: isNaN(kcxVal) ? 0 : kcxVal,
          color: '#00BFFF',
        });
      }

      // Mark the most recent KCX blink bar (and/or latest active KCX candle) to blink
      if (kcxBlinkItems.length > 0) {
        kcxBlinkItems[kcxBlinkItems.length - 1].isLive = true;
      }

      if (sortedArray.length > 0) {
        const lastCandle = sortedArray[sortedArray.length - 1];
        const lastKcx = parseFloat(lastCandle.kcx);
        const lastTime = parseTimestampToSeconds(lastCandle.timestamp || lastCandle.time);
        if (!isNaN(lastKcx) && lastKcx < 0) {
          const existing = kcxBlinkItems.find((b) => b.time === lastTime);
          if (existing) {
            existing.isLive = true;
          } else {
            kcxBlinkItems.push({
              time: lastTime,
              kcx: lastKcx,
              isLive: true,
            });
          }
        }
      }

      cachedCandlesRef.current = candleData;

      if (candleSeriesRef.current) candleSeriesRef.current.setData(candleData);
      if (ksiSeriesRef.current) ksiSeriesRef.current.setData(ksiData);
      if (kcxSeriesRef.current) kcxSeriesRef.current.setData(kcxData);

      if (kcxBlinkPrimitiveRef.current) {
        kcxBlinkPrimitiveRef.current.setBlinkItems(kcxBlinkItems);
      }

      if (diamondSignalsPrimitiveRef.current) {
        diamondSignalsPrimitiveRef.current.setSignals(signals);
      }

      if (sortedArray.length > 0) {
        const lastItem = sortedArray[sortedArray.length - 1];
        renderPriceLines(lastItem);

        const lastTime = parseTimestampToSeconds(lastItem.timestamp || lastItem.time);
        const twbOpen = parseFloat(lastItem.twb_open);
        const twbClose = parseFloat(lastItem.twb_close);
        const open = parseFloat(lastItem.open);
        const high = parseFloat(lastItem.high);
        const low = parseFloat(lastItem.low);
        const close = parseFloat(lastItem.close);

        latestCandleRef.current = {
          time: lastTime,
          open: open,
          high: Math.max(open, close, high),
          low: Math.min(open, close, low),
          close: close,
          twbOpen: twbOpen,
          twbClose: twbClose,
          color: twbClose >= twbOpen ? BULLISH_COLOR : BEARISH_COLOR,
          wickColor: twbClose >= twbOpen ? BULLISH_COLOR : BEARISH_COLOR,
          borderColor: twbClose >= twbOpen ? BULLISH_COLOR : BEARISH_COLOR,
        };

        if (isSlotActiveRef.current) {
          updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
        }
      }

      // ONLY fitContent on initial load/switch, NEVER on background polling
      if (isInitial && chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      requestAnimationFrame(() => {
        updateBadgePositions();
        updateTvBadgePosition();
        updatePaneHeaderPositions();
        applySolidPaneStyles(chartRef.current?.panes());
        redrawDrawings();
      });
    },

    updateLiveCsv(data, isSlotActive = true) {
      let parts = data;
      if (typeof data === 'string') {
        parts = data.split(',');
      }
      if (!Array.isArray(parts) || parts.length < 13) return;
      if (!candleSeriesRef.current) return;

      const symbol = parts[2]?.trim();
      const timeframe = parts[3]?.trim();
      const timestampStr = parts[4]?.trim();
      const twbOpen = parseFloat(parts[5]);
      const twbClose = parseFloat(parts[8]);
      const open = parseFloat(parts[9]);
      const high = parseFloat(parts[10]);
      const low = parseFloat(parts[11]);
      const close = parseFloat(parts[12]);

      if (isNaN(open) || isNaN(close)) return;

      const expectedSymbol = currentCodeRef.current?.split('_')[0]?.trim();
      const expectedTf = currentCodeRef.current?.split('_')[1]?.trim();

      const isSymbolMatch = !expectedSymbol || symbol === expectedSymbol || symbol.replace(/\.ca$/i, '') === expectedSymbol.replace(/\.ca$/i, '');
      const isTfMatch = !expectedTf || timeframe === expectedTf || String(parseInt(timeframe, 10)) === String(parseInt(expectedTf, 10));

      if (isSymbolMatch && isTfMatch) {
        const time = parseTimestampToSeconds(timestampStr);
        const candleColor = twbClose >= twbOpen ? BULLISH_COLOR : BEARISH_COLOR;

        const liveCandle = {
          time: time,
          open: open,
          high: Math.max(open, close, isNaN(high) ? open : high),
          low: Math.min(open, close, isNaN(low) ? open : low),
          close: close,
          color: candleColor,
          wickColor: candleColor,
          borderColor: candleColor
        };

        if (!rawCandleMapRef.current.size || !latestCandleRef.current) {
          try {
            candleSeriesRef.current.setData([liveCandle]);
            latestCandleRef.current = { ...liveCandle, twbOpen, twbClose };
          } catch (e) {}
        } else {
          try {
            candleSeriesRef.current.update(liveCandle);
            latestCandleRef.current = { ...liveCandle, twbOpen, twbClose };
          } catch (e) {}
        }

        rawCandleMapRef.current.set(time, {
          time,
          open,
          high: liveCandle.high,
          low: liveCandle.low,
          close,
          twbOpen,
          twbClose
        });

        if (isSlotActive) {
          updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
        }

        // Real-time Update for KSI & KCX
        if (parts.length > 45) {
          const ksiGreen = parseFloat(parts[44]);
          const ksiRed = parseFloat(parts[45]);
          let ksiVal = 0;
          let ksiColor = 'rgba(0, 230, 118, 0.9)';

          if (!isNaN(ksiGreen) && ksiGreen > 0) {
            ksiVal = ksiGreen;
            ksiColor = '#00E676';
          } else if (!isNaN(ksiRed) && ksiRed > 0) {
            ksiVal = ksiRed;
            ksiColor = '#FF3B30';
          }
          if (ksiSeriesRef.current) ksiSeriesRef.current.update({ time, value: ksiVal, color: ksiColor });

          const kcxVal = parseFloat(parts[40]);
          if (kcxSeriesRef.current) kcxSeriesRef.current.update({ time, value: isNaN(kcxVal) ? 0 : kcxVal, color: '#00BFFF' });

          const kcxSym = parts.length > 15 ? parts[15] : '0';
          const liveBlinkBack = parts.length > 43 ? parseInt(parts[43], 10) : NaN;
          const hasBlink = (!isNaN(liveBlinkBack) && liveBlinkBack === 0) || (kcxSym && kcxSym !== '0') || (!isNaN(kcxVal) && kcxVal <= -300);

          if (kcxBlinkPrimitiveRef.current) {
            kcxBlinkPrimitiveRef.current.updateLiveBlink(time, hasBlink, isNaN(kcxVal) ? 0 : kcxVal);
          }
        }

        // Horizontal Price Lines
        if (parts.length > 35) {
          const livePriceLineData = {
            op_line: parts[16],
            mlp_line: parts[17],
            ktr_plus_1: parts[18],
            ktr_plus_2: parts[19],
            ktr_plus_3: parts[20],
            ktr_minus_1: parts[21],
            ktr_minus_2: parts[22],
            ktf_minus_3: parts[23],
            pivot_1: parts[24],
            pivot_2: parts[25],
            wma: parts[33],
            ma_200: parts[35]
          };
          renderPriceLines(livePriceLineData);
        }

        // Real-time Update for Diamond Markers
        if (parts.length > 14) {
          const liveBuy1 = parseFloat(parts[13]);
          const liveSell1 = parseFloat(parts[14]);
          const liveBuy2 = parts.length > 48 ? parseFloat(parts[48]) : 0;
          const liveAdd3 = parts.length > 49 ? parseFloat(parts[49]) : 0;

          const liveSignals = [];
          if (!isNaN(liveBuy2) && liveBuy2 > 0) {
            liveSignals.push({ time, price: liveBuy2, low: liveCandle.low, high: liveCandle.high, open, close, type: 'buy_diamond' });
          } else if (!isNaN(liveBuy1) && liveBuy1 > 0) {
            liveSignals.push({ time, price: liveBuy1, low: liveCandle.low, high: liveCandle.high, open, close, type: 'buy_diamond' });
          }

          if (!isNaN(liveAdd3) && liveAdd3 > 0) {
            liveSignals.push({ time, price: liveAdd3, low: liveCandle.low, high: liveCandle.high, open, close, type: 'add_cluster' });
          } else if (!isNaN(liveSell1) && liveSell1 > 0) {
            liveSignals.push({ time, price: liveSell1, low: liveCandle.low, high: liveCandle.high, open, close, type: 'add_cluster' });
          }

          if (diamondSignalsPrimitiveRef.current) {
            diamondSignalsPrimitiveRef.current.updateLiveSignal(time, liveSignals);
          }
        }

        requestAnimationFrame(updateTvBadgePosition);
      }
    },

    updateLiveTickPrice(price, isSlotActive = true) {
      if (!candleSeriesRef.current || !latestCandleRef.current) return;
      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice <= 0) return;

      const prevClose = latestCandleRef.current.close;
      const flash = numPrice > prevClose ? 'flash-up' : numPrice < prevClose ? 'flash-down' : null;

      latestCandleRef.current.close = numPrice;
      latestCandleRef.current.high = Math.max(latestCandleRef.current.high, numPrice);
      latestCandleRef.current.low = Math.min(latestCandleRef.current.low, numPrice);

      const isBull = latestCandleRef.current.twbClose >= latestCandleRef.current.twbOpen;
      latestCandleRef.current.color = isBull ? BULLISH_COLOR : BEARISH_COLOR;
      latestCandleRef.current.wickColor = latestCandleRef.current.color;
      latestCandleRef.current.borderColor = latestCandleRef.current.color;

      try {
        candleSeriesRef.current.update(latestCandleRef.current);
      } catch (e) {}

      if (isSlotActive) {
        updateOhlcHeader({ ...latestCandleRef.current, flash }, decimalsRef.current);
      }
      requestAnimationFrame(updateTvBadgePosition);
    },

    refreshOhlcHeader() {
      if (latestCandleRef.current) {
        updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
      } else {
        updateOhlcHeader(null);
      }
    }
  }));

  function renderPriceLines(item) {
    if (!candleSeriesRef.current || !item) return;

    for (const spec of PRICE_LINE_SPECS) {
      let priceVal = item[spec.key];
      if (priceVal === undefined && spec.altKey) {
        priceVal = item[spec.altKey];
      }

      const price = parseFloat(priceVal);
      if (isNaN(price)) continue;

      let existingLine = activePriceLinesMapRef.current.get(spec.key);
      if (existingLine) {
        try {
          existingLine.applyOptions({ price: price });
        } catch (e) {
          existingLine = null;
        }
      }
      if (!existingLine) {
        try {
          existingLine = candleSeriesRef.current.createPriceLine({
            price: price,
            color: spec.color,
            lineWidth: 1,
            lineStyle: spec.lineStyle !== undefined ? spec.lineStyle : 0,
            axisLabelVisible: true,
            title: spec.title,
          });
          activePriceLinesMapRef.current.set(spec.key, existingLine);
        } catch (err) {}
      }
    }

    const container = leftBadgesContainerRef.current;
    if (container) {
      container.innerHTML = '';
      for (const spec of PRICE_LINE_SPECS) {
        let priceVal = item[spec.key];
        if (priceVal === undefined && spec.altKey) priceVal = item[spec.altKey];
        const price = parseFloat(priceVal);
        if (isNaN(price)) continue;

        const badge = document.createElement('div');
        badge.className = 'left-badge';
        badge.innerText = spec.title;
        badge.style.backgroundColor = spec.bgColor || spec.color;
        badge.style.color = spec.textColor || '#000000';
        badge.dataset.price = price;
        badge.style.display = 'none';
        container.appendChild(badge);
      }
    }

    requestAnimationFrame(updateBadgePositions);
  }

  function updateBadgePositions() {
    if (!candleSeriesRef.current || !leftBadgesContainerRef.current) return;
    const badges = leftBadgesContainerRef.current.querySelectorAll('.left-badge');
    badges.forEach((badge) => {
      const price = parseFloat(badge.dataset.price);
      if (!isNaN(price) && typeof candleSeriesRef.current.priceToCoordinate === 'function') {
        const coord = candleSeriesRef.current.priceToCoordinate(price);
        if (coord !== null && coord !== undefined && coord >= 0) {
          badge.style.top = `${coord}px`;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    });
  }

  function updateTvBadgePosition() {
    if (!candleSeriesRef.current || !latestCandleRef.current || isNaN(latestCandleRef.current.close)) return;

    const badge = tvBadgeRef.current;
    if (!badge) return;

    try {
      const yCoord = candleSeriesRef.current.priceToCoordinate(latestCandleRef.current.close);
      const containerHeight = containerRef.current ? containerRef.current.clientHeight : 600;

      if (yCoord !== null && yCoord !== undefined && !isNaN(yCoord)) {
        const clampedY = Math.max(20, Math.min(containerHeight - 40, yCoord));
        badge.style.top = `${Math.round(clampedY)}px`;
        badge.style.display = 'flex';

        const isBull = latestCandleRef.current.twbClose >= latestCandleRef.current.twbOpen;
        badge.className = `tv-price-scale-badge ${isBull ? 'bullish' : 'bearish'}`;

        if (tvPriceTextRef.current) {
          tvPriceTextRef.current.innerText = Number(latestCandleRef.current.close).toFixed(decimalsRef.current);
        }
        if (tvSymbolTextRef.current) {
          const sym = (currentCodeRef.current || 'XAUUSD').split('.')[0].replace('_', '');
          tvSymbolTextRef.current.innerText = sym;
        }
      }
    } catch (e) {}
  }

  // Initialize Chart on Mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chartInstance = LightweightCharts.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0b0e14' },
        textColor: '#d1d4dc',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#ffffff', width: 1, style: 2, labelBackgroundColor: '#2962FF' },
        horzLine: { color: '#ffffff', width: 1, style: 2, labelBackgroundColor: '#2962FF' },
      },
      localization: {
        timeFormatter: (t) => formatTimeWithOffset(t, timezoneOffsetRef.current),
        dateFormat: 'yyyy-MM-dd',
      },
      timeScale: {
        borderColor: '#1e222d',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time, tickMarkType) => formatTickMark(time, tickMarkType, timezoneOffsetRef.current),
      },
      rightPriceScale: {
        borderColor: '#1e222d',
        autoScale: true,
        scaleMargins: {
          top: 0.05,
          bottom: 0.05,
        },
      },
    });

    chartRef.current = chartInstance;

    // 1. Candlestick Series (Pane 0 - Main Chart)
    const candleOpts = {
      upColor: BULLISH_COLOR,
      downColor: BEARISH_COLOR,
      borderUpColor: BULLISH_COLOR,
      borderDownColor: BEARISH_COLOR,
      wickUpColor: BULLISH_COLOR,
      wickDownColor: BEARISH_COLOR,
    };

    const cSeries = chartInstance.addSeries(LightweightCharts.CandlestickSeries, candleOpts, 0);
    candleSeriesRef.current = cSeries;
    const diamondPrimitive = new DiamondSignalsPrimitive();
    cSeries.attachPrimitive(diamondPrimitive);
    diamondSignalsPrimitiveRef.current = diamondPrimitive;

    const drawingPrimitive = new DrawingToolsPrimitive();
    cSeries.attachPrimitive(drawingPrimitive);
    drawingToolsPrimitiveRef.current = drawingPrimitive;
    drawingPrimitive.setDrawings(
      drawingsRef.current,
      selectedDrawingIdRef.current,
      currentDraftRef.current,
      isDrawingsHiddenRef.current
    );

    // 2. KSI Histogram Series (Pane 1 - Resizable Sub-Pane with Solid Opaque Background)
    const ksiOpts = {
      priceFormat: {
        type: 'custom',
        formatter: (price) => Number(price).toFixed(2),
      },
    };

    const kSeries = chartInstance.addSeries(LightweightCharts.HistogramSeries, ksiOpts, 1);
    ksiSeriesRef.current = kSeries;

    // 3. KCX Histogram Series (Pane 2 - Resizable Sub-Pane with Solid Opaque Background)
    const kcxOpts = {
      priceFormat: {
        type: 'custom',
        formatter: (price) => Number(price).toFixed(2),
      },
    };

    const xSeries = chartInstance.addSeries(LightweightCharts.HistogramSeries, kcxOpts, 2);
    kcxSeriesRef.current = xSeries;
    const kcxBlinkPrimitive = new KcxBlinkPrimitive();
    xSeries.attachPrimitive(kcxBlinkPrimitive);
    kcxBlinkPrimitiveRef.current = kcxBlinkPrimitive;

    // Set Initial Stretch Factors: Main = 700, KSI = 180, KCX = 180
    const panes = chartInstance.panes();
    if (panes && panes.length >= 3) {
      panes[0].setStretchFactor(700);
      panes[1].setStretchFactor(180);
      panes[2].setStretchFactor(180);

      panes[0].priceScale('right').applyOptions({
        autoScale: true,
        borderColor: '#1e222d',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      });

      panes[1].priceScale('right').applyOptions({
        autoScale: true,
        borderColor: '#1e222d',
        scaleMargins: { top: 0.15, bottom: 0.05 },
      });

      panes[2].priceScale('right').applyOptions({
        autoScale: true,
        borderColor: '#1e222d',
        scaleMargins: { top: 0.05, bottom: 0.15 },
      });

      applySolidPaneStyles(panes);
    }

    // Direct Crosshair Move Handler (Zero Re-render at 60fps & Multi-Chart Sync)
    const handleCrosshairMove = (param) => {
      if (!param || !param.time || !cSeries) {
        if (isSlotActiveRef.current && latestCandleRef.current) {
          updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
        }
        if (onSyncCrosshair) {
          onSyncCrosshair(null, null, slotIndex);
        }
        return;
      }

      let candle = null;
      if (param.seriesData && cSeries) {
        candle = param.seriesData.get(cSeries);
      } else if (param.seriesPrices && cSeries) {
        candle = param.seriesPrices.get(cSeries);
      }

      if (candle) {
        const raw = rawCandleMapRef.current.get(param.time);
        const twbOpen = raw ? raw.twbOpen : undefined;
        const twbClose = raw ? raw.twbClose : undefined;

        updateOhlcHeader({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          twbOpen,
          twbClose
        }, decimalsRef.current);
      }

      // Broadcast to other visible charts
      if (onSyncCrosshair) {
        let price = candle?.close;
        if ((price === undefined || isNaN(price)) && param.point) {
          price = cSeries.coordinateToPrice(param.point.y);
        }
        onSyncCrosshair(param.time, price, slotIndex);
      }
    };

    chartInstance.subscribeCrosshairMove(handleCrosshairMove);

    const handleMouseLeave = () => {
      if (onSyncCrosshair) {
        onSyncCrosshair(null, null, slotIndex);
      }
      if (isSlotActiveRef.current && latestCandleRef.current) {
        updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
      }
    };
    const chartContainerEl = containerRef.current;
    chartContainerEl?.addEventListener('mouseleave', handleMouseLeave);

    chartInstance.timeScale().subscribeVisibleTimeRangeChange(() => {
      requestAnimationFrame(() => {
        updateBadgePositions();
        updateTvBadgePosition();
        redrawDrawings();
      });
    });

    chartInstance.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(() => {
        updateBadgePositions();
        updateTvBadgePosition();
        redrawDrawings();
      });
    });

    const handleResize = () => {
      if (chartInstance && containerRef.current) {
        chartInstance.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        requestAnimationFrame(() => {
          updateBadgePositions();
          updateTvBadgePosition();
          updatePaneHeaderPositions();
          applySolidPaneStyles(chartInstance.panes());
          redrawDrawings();
        });
      }
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    setTimeout(() => {
      updatePaneHeaderPositions();
      applySolidPaneStyles(chartInstance.panes());
    }, 100);

    return () => {
      chartContainerEl?.removeEventListener('mouseleave', handleMouseLeave);
      try {
        chartInstance.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch (e) {}
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (diamondSignalsPrimitiveRef.current && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.detachPrimitive(diamondSignalsPrimitiveRef.current);
        } catch (e) {}
      }
      diamondSignalsPrimitiveRef.current = null;

      if (kcxBlinkPrimitiveRef.current && kcxSeriesRef.current) {
        try {
          kcxSeriesRef.current.detachPrimitive(kcxBlinkPrimitiveRef.current);
        } catch (e) {}
      }
      kcxBlinkPrimitiveRef.current = null;

      if (drawingToolsPrimitiveRef.current && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.detachPrimitive(drawingToolsPrimitiveRef.current);
        } catch (e) {}
      }
      drawingToolsPrimitiveRef.current = null;

      candleSeriesRef.current = null;
      ksiSeriesRef.current = null;
      kcxSeriesRef.current = null;
      chartRef.current = null;
      activePriceLinesMapRef.current.clear();
      try {
        chartInstance.remove();
      } catch (e) {}
    };
  }, []);

  return (
    <div id="chart-wrapper" onMouseMove={handleWrapperMouseMove} onMouseDown={onSelectSlot}>
      {/* Watermarks */}
      <div className="watermark-top-right">CRAZII<span>.COM</span></div>
      <div className="watermark-center">CRAZII</div>
      <div className="watermark-bottom-left">CRAZII<span>.COM</span></div>

      {/* Standby / Idle State Overlay */}
      {!currentCode && !hideStandbyOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(11, 14, 20, 0.88)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            gap: 14,
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 42 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FFB300', letterSpacing: 0.5 }}>
            CHỌN TÀI SẢN ĐỂ BẮT ĐẦU STREAMING
          </div>
          <p style={{ maxWidth: 500, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Biểu đồ đang ở trạng thái <strong>Standby (Đứng yên)</strong> để tránh xung đột kết nối với phiên giao dịch Crazii trên trình duyệt chính. Chọn tài sản bên dưới để bắt đầu kết nối.
          </p>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 18px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, marginTop: 4 }}
            onClick={onOpenAssetSelector}
          >
            📊 Mở danh sách tài sản (Watchlist)
          </button>
        </div>
      )}

      {/* Contextual Props Floating Mini-Bar when a drawing is selected */}
      {selectedDrawingId && !isDrawingsHidden && (
        <DrawingPropsBar
          selectedDrawing={drawings.find((d) => d.id === selectedDrawingId)}
          onUpdateDrawing={(updates) => {
            const updated = drawings.map((d) => (d.id === selectedDrawingId ? { ...d, ...updates } : d));
            saveDrawingsWithHistory(updated);
          }}
          onDeleteDrawing={() => {
            const updated = drawings.filter((d) => d.id !== selectedDrawingId);
            saveDrawingsWithHistory(updated);
            setSelectedDrawingId(null);
          }}
          onDeselectDrawing={() => {
            setSelectedDrawingId(null);
          }}
          onDuplicateDrawing={() => {
            const target = drawings.find((d) => d.id === selectedDrawingId);
            if (target) {
              const clone = {
                ...target,
                id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                points: target.points.map((p) => ({ time: p.time + 300, price: p.price * 1.002 })),
              };
              const updated = [...drawings, clone];
              saveDrawingsWithHistory(updated);
              setSelectedDrawingId(clone.id);
            }
          }}
        />
      )}

      {/* Exact TradingView Stacked Price & Countdown Scale Badge (Zero Re-render Direct DOM) */}
      <div
        id="tv-price-scale-badge"
        ref={tvBadgeRef}
        className="tv-price-scale-badge"
        style={{ display: 'none' }}
      >
        <div className="tv-scale-top-row">
          <span className="tv-scale-symbol" ref={tvSymbolTextRef}>XAUUSD</span>
          <span className="tv-scale-price" ref={tvPriceTextRef}>--.--</span>
        </div>
        <div className="tv-scale-bottom-row">
          <span className="tv-scale-countdown-text" ref={tvCountdownTextRef}>--:--</span>
        </div>
      </div>

      {/* Sub-Pane 1 (KSI) Header Bar & Resizer Controls */}
      {panePositions.ksiTop > 0 && (
        <div className="subpane-header-bar" style={{ top: `${panePositions.ksiTop + 6}px` }}>
          <span className="subpane-title-tag">{ksiLabelText || 'BOYS BUYING (KSI)'}</span>
          <div className="pane-resize-actions">
            <span className="pane-height-badge">KSI</span>
            <button className="pane-btn" title="Thu nhỏ KSI" onClick={() => handleAdjustPane(1, -30)}>➖</button>
            <button className="pane-btn" title="Phóng to KSI" onClick={() => handleAdjustPane(1, 30)}>➕</button>
            <div className="pane-presets">
              <button className={`pane-preset-btn ${ksiHeightFactor <= 120 ? 'active' : ''}`} title="Nhỏ (Compact)" onClick={() => handleSetPreset(1, 100)}>S</button>
              <button className={`pane-preset-btn ${ksiHeightFactor > 120 && ksiHeightFactor <= 220 ? 'active' : ''}`} title="Vừa (Medium)" onClick={() => handleSetPreset(1, 180)}>M</button>
              <button className={`pane-preset-btn ${ksiHeightFactor > 220 ? 'active' : ''}`} title="Lớn (Large)" onClick={() => handleSetPreset(1, 280)}>L</button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Pane 2 (KCX) Header Bar & Resizer Controls */}
      {panePositions.kcxTop > 0 && (
        <div className="subpane-header-bar" style={{ top: `${panePositions.kcxTop + 6}px` }}>
          <span className="subpane-title-tag">{kcxLabelText || 'BEARISHNESS (KCX)'}</span>
          <div className="pane-resize-actions">
            <span className="pane-height-badge">KCX</span>
            <button className="pane-btn" title="Thu nhỏ KCX" onClick={() => handleAdjustPane(2, -30)}>➖</button>
            <button className="pane-btn" title="Phóng to KCX" onClick={() => handleAdjustPane(2, 30)}>➕</button>
            <div className="pane-presets">
              <button className={`pane-preset-btn ${kcxHeightFactor <= 120 ? 'active' : ''}`} title="Nhỏ (Compact)" onClick={() => handleSetPreset(2, 100)}>S</button>
              <button className={`pane-preset-btn ${kcxHeightFactor > 120 && kcxHeightFactor <= 220 ? 'active' : ''}`} title="Vừa (Medium)" onClick={() => handleSetPreset(2, 180)}>M</button>
              <button className={`pane-preset-btn ${kcxHeightFactor > 220 ? 'active' : ''}`} title="Lớn (Large)" onClick={() => handleSetPreset(2, 280)}>L</button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable Divider between Main Chart and KSI */}
      {panePositions.ksiTop > 0 && (
        <div
          className="pane-resizer-line"
          style={{ top: `${panePositions.ksiTop}px` }}
          onMouseDown={(e) => handleStartDrag(e, 1)}
          title="Kéo thả chuột để tăng/giảm chiều cao KSI"
        >
          <div className="resizer-handle-grip" />
        </div>
      )}

      {/* Draggable Divider between KSI and KCX */}
      {panePositions.kcxTop > 0 && (
        <div
          className="pane-resizer-line"
          style={{ top: `${panePositions.kcxTop}px` }}
          onMouseDown={(e) => handleStartDrag(e, 2)}
          title="Kéo thả chuột để tăng/giảm chiều cao KCX"
        >
          <div className="resizer-handle-grip" />
        </div>
      )}

      {/* Left Badges Container for Dynamic 12 Price Lines (Direct DOM) */}
      <div id="left-badges-container" ref={leftBadgesContainerRef}></div>

      {/* 60fps Interactive Drawing Canvas Overlay */}
      <canvas
        ref={drawingCanvasRef}
        className="drawing-overlay-canvas"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onDoubleClick={handleCanvasMouseUp}
      />

      {/* Chart Canvas */}
      <div id="chart-container" ref={containerRef}></div>
    </div>
  );
});

export default ChartContainer;
