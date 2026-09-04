'use client';

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { BULLISH_COLOR, BEARISH_COLOR, NEUTRAL_COLOR, PRICE_LINE_SPECS } from '@/lib/chart-constants';
import { parseTimestampToSeconds } from '@/lib/utils';
import FloatingLegend from './FloatingLegend';

const ChartContainer = forwardRef(function ChartContainer(
  {
    currentCode,
    countdownText,
    onCrosshairOHLC,
    ksiLabelText,
    kcxLabelText
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

  const [leftBadges, setLeftBadges] = useState([]);
  const [tvBadgeState, setTvBadgeState] = useState({
    visible: false,
    top: 150,
    price: '--.--',
    isBullish: true,
    symbol: 'XAUUSD'
  });

  const latestCandleRef = useRef(null);

  // Expose API for real-time updates and dataset loading
  useImperativeHandle(ref, () => ({
    renderDataset(dataArray) {
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

        let candleColor = NEUTRAL_COLOR;
        if (!isNaN(twbOpen) && !isNaN(twbClose)) {
          if (twbClose > twbOpen) candleColor = BULLISH_COLOR;
          else if (twbClose < twbOpen) candleColor = BEARISH_COLOR;
        }

        rawCandleMapRef.current.set(time, item);

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

        latestCandleRef.current = {
          time: lastTime,
          open: parseFloat(lastItem.open),
          high: parseFloat(lastItem.high),
          low: parseFloat(lastItem.low),
          close: parseFloat(lastItem.close),
          twbOpen: twbOpen,
          twbClose: twbClose,
          color: twbClose > twbOpen ? BULLISH_COLOR : BEARISH_COLOR,
        };

        if (onCrosshairOHLC) {
          onCrosshairOHLC({
            open: parseFloat(lastItem.open),
            high: parseFloat(lastItem.high),
            low: parseFloat(lastItem.low),
            close: parseFloat(lastItem.close),
            twbOpen: twbOpen,
            twbClose: twbClose
          });
        }
      }

      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      setTimeout(() => {
        updateBadgePositions();
        updateTvBadgePosition();
      }, 50);
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

      const expectedSymbol = currentCode.split('_')[0];
      const expectedTf = currentCode.split('_')[1];

      if (symbol === expectedSymbol && timeframe === expectedTf) {
        const time = parseTimestampToSeconds(timestampStr);
        const candleColor = twbClose > twbOpen ? BULLISH_COLOR : BEARISH_COLOR;

        const liveCandle = {
          time: time,
          open: open,
          high: Math.max(open, close, high),
          low: Math.min(open, close, low),
          close: close,
          color: candleColor,
          wickColor: candleColor,
          borderColor: candleColor
        };

        candleSeriesRef.current.update(liveCandle);

        latestCandleRef.current = { ...liveCandle, twbOpen, twbClose };

        if (onCrosshairOHLC) {
          onCrosshairOHLC({ open, high, low, close, twbOpen, twbClose });
        }

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

        updateTvBadgePosition();
      }
    },

    updateLiveTickPrice(price) {
      if (!candleSeriesRef.current || !latestCandleRef.current) return;
      const numPrice = parseFloat(price);
      if (isNaN(numPrice)) return;

      latestCandleRef.current.close = numPrice;
      latestCandleRef.current.high = Math.max(latestCandleRef.current.high, numPrice);
      latestCandleRef.current.low = Math.min(latestCandleRef.current.low, numPrice);

      const isBull = latestCandleRef.current.twbClose >= latestCandleRef.current.twbOpen;
      latestCandleRef.current.color = isBull ? BULLISH_COLOR : BEARISH_COLOR;
      latestCandleRef.current.wickColor = latestCandleRef.current.color;
      latestCandleRef.current.borderColor = latestCandleRef.current.color;

      candleSeriesRef.current.update(latestCandleRef.current);
      updateTvBadgePosition();
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

    const newBadges = [];

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

        newBadges.push({
          title: spec.title,
          price: price,
          color: spec.textColor || '#000000',
          bgColor: spec.bgColor || spec.color,
          top: 0,
          visible: false
        });
      } catch (err) {}
    }

    setLeftBadges(newBadges);
    setTimeout(updateBadgePositions, 50);
  }

  function updateBadgePositions() {
    if (!candleSeriesRef.current) return;
    setLeftBadges((prevBadges) =>
      prevBadges.map((badge) => {
        try {
          const coord = candleSeriesRef.current.priceToCoordinate(badge.price);
          if (coord !== null && coord !== undefined && coord >= 0) {
            return { ...badge, top: coord, visible: true };
          }
        } catch (e) {}
        return { ...badge, visible: false };
      })
    );
  }

  function updateTvBadgePosition() {
    if (!candleSeriesRef.current || !latestCandleRef.current || isNaN(latestCandleRef.current.close)) return;

    try {
      const yCoord = candleSeriesRef.current.priceToCoordinate(latestCandleRef.current.close);
      const containerHeight = containerRef.current ? containerRef.current.clientHeight : 600;

      if (yCoord !== null && yCoord !== undefined && !isNaN(yCoord)) {
        const clampedY = Math.max(20, Math.min(containerHeight - 40, yCoord));
        const isBull = latestCandleRef.current.twbClose >= latestCandleRef.current.twbOpen;
        const sym = (currentCode || 'XAUUSD').split('.')[0].replace('_', '');

        setTvBadgeState({
          visible: true,
          top: Math.round(clampedY),
          price: Number(latestCandleRef.current.close).toFixed(2),
          isBullish: isBull,
          symbol: sym
        });
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

      // Crosshair Move Handler
      chartInstance.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !cSeries) return;

        let candle = null;
        if (param.seriesData && cSeries) {
          candle = param.seriesData.get(cSeries);
        } else if (param.seriesPrices && cSeries) {
          candle = param.seriesPrices.get(cSeries);
        }

        if (candle && onCrosshairOHLC) {
          const raw = rawCandleMapRef.current.get(param.time);
          const twbOpen = raw ? parseFloat(raw.twb_open) : undefined;
          const twbClose = raw ? parseFloat(raw.twb_close) : undefined;

          onCrosshairOHLC({
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            twbOpen,
            twbClose
          });
        }
      });

      chartInstance.timeScale().subscribeVisibleTimeRangeChange(() => {
        updateBadgePositions();
        updateTvBadgePosition();
      });

      chartInstance.timeScale().subscribeVisibleLogicalRangeChange(() => {
        updateBadgePositions();
        updateTvBadgePosition();
      });

      const handleResize = () => {
        if (chartInstance && containerRef.current) {
          chartInstance.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
          updateBadgePositions();
          updateTvBadgePosition();
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

      {/* Exact TradingView Stacked Price & Countdown Scale Badge */}
      {tvBadgeState.visible && (
        <div
          id="tv-price-scale-badge"
          className={`tv-price-scale-badge ${tvBadgeState.isBullish ? 'bullish' : 'bearish'}`}
          style={{ top: `${tvBadgeState.top}px` }}
        >
          <div className="tv-scale-top-row">
            <span className="tv-scale-symbol">{tvBadgeState.symbol}</span>
            <span className="tv-scale-price">{tvBadgeState.price}</span>
          </div>
          <div className="tv-scale-bottom-row">
            <span className="tv-scale-countdown-text">{countdownText || '--:--'}</span>
          </div>
        </div>
      )}

      {/* Floating Legend */}
      <FloatingLegend />

      {/* Sub-Pane Floating Titles */}
      <div className="pane-label-ksi">{ksiLabelText || 'BOYS BUYING (KSI)'}</div>
      <div className="pane-label-kcx">{kcxLabelText || 'BEARISHNESS (KCX)'}</div>

      {/* Left Badges for Dynamic 12 Price Lines */}
      <div id="left-badges-container">
        {leftBadges.map(
          (badge, idx) =>
            badge.visible && (
              <div
                key={idx}
                className="left-badge"
                style={{
                  top: `${badge.top}px`,
                  backgroundColor: badge.bgColor,
                  color: badge.color
                }}
              >
                {badge.title}
              </div>
            )
        )}
      </div>

      {/* Chart Canvas */}
      <div id="chart-container" ref={containerRef}></div>
    </div>
  );
});

export default ChartContainer;
