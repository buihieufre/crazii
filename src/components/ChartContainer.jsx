'use client';

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { BULLISH_COLOR, BEARISH_COLOR, NEUTRAL_COLOR, PRICE_LINE_SPECS } from '@/lib/chart-constants';
import { parseTimestampToSeconds } from '@/lib/utils';
import { updateOhlcHeader } from '@/lib/ohlc-updater';
import FloatingLegend from './FloatingLegend';

const ChartContainer = forwardRef(function ChartContainer(
  {
    currentCode,
    activeSymbolObj,
    ksiLabelText,
    kcxLabelText,
    onOpenAssetSelector
  },
  ref
) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const ksiSeriesRef = useRef(null);
  const kcxSeriesRef = useRef(null);
  const activePriceLinesRef = useRef([]);
  const rawCandleMapRef = useRef(new Map());

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

  // Reset forming candle when symbol changes to prevent stray spikes
  useEffect(() => {
    latestCandleRef.current = null;
    rawCandleMapRef.current.clear();
  }, [currentCode]);

  // Expose API for real-time updates and dataset loading
  useImperativeHandle(ref, () => ({
    renderDataset(dataArray, isInitial = false) {
      if (!Array.isArray(dataArray) || dataArray.length === 0) return;
      if (!candleSeriesRef.current) return;

      rawCandleMapRef.current.clear();
      const candleData = [];
      const ksiData = [];
      const kcxData = [];
      const markers = [];

      const sortedArray = [...dataArray].sort((a, b) => {
        const tA = parseTimestampToSeconds(a.timestamp || a.time);
        const tB = parseTimestampToSeconds(b.timestamp || b.time);
        return tA - tB;
      });

      const seenTimestamps = new Set();

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
          twbClose
        });

        candleData.push({
          time: time,
          open: open,
          high: Math.max(open, close, high),
          low: Math.min(open, close, low),
          close: close,
          color: candleColor,
          wickColor: candleColor,
          borderColor: candleColor,
        });

        // Signal Markers
        const buySignal = parseFloat(item.pivots_buy_strategy_1);
        const sellSignal = parseFloat(item.pivots_sell_strategy_1);

        if (!isNaN(buySignal) && buySignal > 0) {
          markers.push({
            time: time,
            position: 'belowBar',
            color: 'cyan',
            shape: 'diamond',
            size: 1,
          });
        }

        if (!isNaN(sellSignal) && sellSignal > 0) {
          markers.push({
            time: time,
            position: 'aboveBar',
            color: 'orange',
            shape: 'diamond',
            size: 1,
          });
        }

        // Histograms (KSI & KCX)
        const ksiGreen = parseFloat(item.ksi_green);
        const ksiRed = parseFloat(item.ksi_red);
        let ksiVal = 0;
        let ksiColor = 'rgba(0, 255, 0, 0.8)';

        if (!isNaN(ksiGreen) && ksiGreen > 0) {
          ksiVal = ksiGreen;
          ksiColor = 'rgba(0, 255, 0, 0.8)';
        } else if (!isNaN(ksiRed) && ksiRed > 0) {
          ksiVal = ksiRed;
          ksiColor = 'rgba(255, 0, 0, 0.8)';
        }

        ksiData.push({
          time: time,
          value: ksiVal,
          color: ksiColor,
        });

        const kcxVal = parseFloat(item.kcx);
        kcxData.push({
          time: time,
          value: isNaN(kcxVal) ? 0 : kcxVal,
          color: '#00BFFF',
        });
      }

      if (candleSeriesRef.current) candleSeriesRef.current.setData(candleData);
      if (ksiSeriesRef.current) ksiSeriesRef.current.setData(ksiData);
      if (kcxSeriesRef.current) kcxSeriesRef.current.setData(kcxData);

      applyMarkers(markers);

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

        updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
      }

      // ONLY fitContent on initial load/switch, NEVER on background polling
      if (isInitial && chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      requestAnimationFrame(() => {
        updateBadgePositions();
        updateTvBadgePosition();
      });
    },

    updateLiveCsv(parts) {
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

      const expectedSymbol = currentCodeRef.current?.split('_')[0];
      const expectedTf = currentCodeRef.current?.split('_')[1];

      if (symbol === expectedSymbol && timeframe === expectedTf) {
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

        candleSeriesRef.current.update(liveCandle);
        latestCandleRef.current = { ...liveCandle, twbOpen, twbClose };

        rawCandleMapRef.current.set(time, {
          time,
          open,
          high: liveCandle.high,
          low: liveCandle.low,
          close,
          twbOpen,
          twbClose
        });

        updateOhlcHeader(latestCandleRef.current, decimalsRef.current);

        // Real-time Update for KSI & KCX
        if (parts.length > 45) {
          const ksiGreen = parseFloat(parts[44]);
          const ksiRed = parseFloat(parts[45]);
          let ksiVal = 0;
          let ksiColor = 'rgba(0, 255, 0, 0.8)';

          if (!isNaN(ksiGreen) && ksiGreen > 0) {
            ksiVal = ksiGreen;
            ksiColor = 'rgba(0, 255, 0, 0.8)';
          } else if (!isNaN(ksiRed) && ksiRed > 0) {
            ksiVal = ksiRed;
            ksiColor = 'rgba(255, 0, 0, 0.8)';
          }
          if (ksiSeriesRef.current) ksiSeriesRef.current.update({ time, value: ksiVal, color: ksiColor });

          const kcxVal = parseFloat(parts[40]);
          if (kcxSeriesRef.current) kcxSeriesRef.current.update({ time, value: isNaN(kcxVal) ? 0 : kcxVal, color: '#00BFFF' });
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

        requestAnimationFrame(updateTvBadgePosition);
      }
    },

    updateLiveTickPrice(price) {
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

      candleSeriesRef.current.update(latestCandleRef.current);

      updateOhlcHeader({ ...latestCandleRef.current, flash }, decimalsRef.current);
      requestAnimationFrame(updateTvBadgePosition);
    }
  }));

  function applyMarkers(markers) {
    if (!candleSeriesRef.current) return;
    try {
      import('lightweight-charts').then((lc) => {
        if (typeof lc.createSeriesMarkers === 'function') {
          lc.createSeriesMarkers(candleSeriesRef.current, markers);
        } else if (typeof candleSeriesRef.current.setMarkers === 'function') {
          candleSeriesRef.current.setMarkers(markers);
        }
      });
    } catch (e) {}
  }

  function renderPriceLines(item) {
    if (!candleSeriesRef.current || !item) return;

    for (const line of activePriceLinesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch (e) {}
    }
    activePriceLinesRef.current = [];

    const container = leftBadgesContainerRef.current;
    if (container) container.innerHTML = '';

    for (const spec of PRICE_LINE_SPECS) {
      let priceVal = item[spec.key];
      if (priceVal === undefined && spec.altKey) {
        priceVal = item[spec.altKey];
      }

      const price = parseFloat(priceVal);
      if (isNaN(price)) continue;

      try {
        const line = candleSeriesRef.current.createPriceLine({
          price: price,
          color: spec.color,
          lineWidth: 1,
          lineStyle: spec.lineStyle !== undefined ? spec.lineStyle : 0,
          axisLabelVisible: true,
          title: spec.title,
        });
        activePriceLinesRef.current.push(line);

        if (container) {
          const badge = document.createElement('div');
          badge.className = 'left-badge';
          badge.innerText = spec.title;
          badge.style.backgroundColor = spec.bgColor || spec.color;
          badge.style.color = spec.textColor || '#000000';
          badge.dataset.price = price;
          badge.style.display = 'none';
          container.appendChild(badge);
        }
      } catch (err) {}
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
    let isMounted = true;
    let chartInstance = null;

    async function init() {
      if (!containerRef.current) return;

      const lc = await import('lightweight-charts');
      if (!isMounted || !containerRef.current) return;

      chartInstance = lc.createChart(containerRef.current, {
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
        timeScale: {
          borderColor: '#1e222d',
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: '#1e222d',
          autoScale: true,
          scaleMargins: {
            top: 0.05,
            bottom: 0.40,
          },
        },
      });

      chartRef.current = chartInstance;

      // 1. Candlestick Series
      const candleOpts = {
        upColor: BULLISH_COLOR,
        downColor: BEARISH_COLOR,
        borderUpColor: BULLISH_COLOR,
        borderDownColor: BEARISH_COLOR,
        wickUpColor: BULLISH_COLOR,
        wickDownColor: BEARISH_COLOR,
      };

      let cSeries = null;
      if (typeof chartInstance.addCandlestickSeries === 'function') {
        cSeries = chartInstance.addCandlestickSeries(candleOpts);
      } else if (typeof chartInstance.addSeries === 'function') {
        cSeries = chartInstance.addSeries(lc.CandlestickSeries, candleOpts);
      }
      candleSeriesRef.current = cSeries;

      // 2. KSI Histogram Series (Middle Pane)
      const ksiOpts = {
        priceScaleId: 'ksi_scale',
        priceFormat: { type: 'volume' },
      };

      let kSeries = null;
      if (typeof chartInstance.addHistogramSeries === 'function') {
        kSeries = chartInstance.addHistogramSeries(ksiOpts);
      } else if (typeof chartInstance.addSeries === 'function') {
        kSeries = chartInstance.addSeries(lc.HistogramSeries, ksiOpts);
      }
      ksiSeriesRef.current = kSeries;

      chartInstance.priceScale('ksi_scale').applyOptions({
        scaleMargins: {
          top: 0.65,
          bottom: 0.20,
        },
        visible: false,
      });

      // 3. KCX Histogram Series (Bottom Pane)
      const kcxOpts = {
        priceScaleId: 'kcx_scale',
        priceFormat: { type: 'volume' },
      };

      let xSeries = null;
      if (typeof chartInstance.addHistogramSeries === 'function') {
        xSeries = chartInstance.addHistogramSeries(kcxOpts);
      } else if (typeof chartInstance.addSeries === 'function') {
        xSeries = chartInstance.addSeries(lc.HistogramSeries, kcxOpts);
      }
      kcxSeriesRef.current = xSeries;

      chartInstance.priceScale('kcx_scale').applyOptions({
        scaleMargins: {
          top: 0.85,
          bottom: 0.00,
        },
        visible: false,
      });

      // Direct Crosshair Move Handler (Zero Re-render at 60fps)
      chartInstance.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !cSeries) {
          // Revert to latest live forming bar when mouse leaves chart
          if (latestCandleRef.current) {
            updateOhlcHeader(latestCandleRef.current, decimalsRef.current);
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
      });

      chartInstance.timeScale().subscribeVisibleTimeRangeChange(() => {
        requestAnimationFrame(() => {
          updateBadgePositions();
          updateTvBadgePosition();
        });
      });

      chartInstance.timeScale().subscribeVisibleLogicalRangeChange(() => {
        requestAnimationFrame(() => {
          updateBadgePositions();
          updateTvBadgePosition();
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
          });
        }
      };

      window.addEventListener('resize', handleResize);
    }

    init();

    return () => {
      isMounted = false;
      if (chartInstance) {
        try {
          chartInstance.remove();
        } catch (e) {}
      }
    };
  }, []);

  return (
    <div id="chart-wrapper">
      {/* Watermarks */}
      <div className="watermark-top-right">CRAZII<span>.COM</span></div>
      <div className="watermark-center">CRAZII</div>
      <div className="watermark-bottom-left">CRAZII<span>.COM</span></div>

      {/* Standby / Idle State Overlay */}
      {!currentCode && (
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

      {/* Floating Legend */}
      <FloatingLegend />

      {/* Sub-Pane Floating Titles */}
      <div className="pane-label-ksi">{ksiLabelText || 'BOYS BUYING (KSI)'}</div>
      <div className="pane-label-kcx">{kcxLabelText || 'BEARISHNESS (KCX)'}</div>

      {/* Left Badges Container for Dynamic 12 Price Lines (Direct DOM) */}
      <div id="left-badges-container" ref={leftBadgesContainerRef}></div>

      {/* Chart Canvas */}
      <div id="chart-container" ref={containerRef}></div>
    </div>
  );
});

export default ChartContainer;
