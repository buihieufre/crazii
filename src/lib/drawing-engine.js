/**
 * TradingView-Style Drawing Engine for Lightweight Charts (Native ISeriesPrimitive)
 * Zero-lag, 60fps synchronous rendering on chart canvas
 */

export function getCanvasCoordinates(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

export function pointToPixel(point, chart, series) {
  if (!point || !chart || !series) return null;
  const timeScale = chart.timeScale();
  let x = timeScale.timeToCoordinate(point.time);
  const y = series.priceToCoordinate(point.price);

  if (y === null || y === undefined || isNaN(y)) {
    return null;
  }

  // If time is outside visible bars (e.g. in future blank space), extrapolate smoothly
  if (x === null || x === undefined || isNaN(x)) {
    try {
      const visibleRange = timeScale.getVisibleLogicalRange();
      const visibleTimeRange = timeScale.getVisibleRange();
      if (visibleTimeRange && visibleRange && visibleTimeRange.to !== visibleTimeRange.from) {
        const tFrom = visibleTimeRange.from;
        const tTo = visibleTimeRange.to;
        const xFrom = timeScale.timeToCoordinate(tFrom);
        const xTo = timeScale.timeToCoordinate(tTo);
        if (xFrom !== null && xTo !== null && !isNaN(xFrom) && !isNaN(xTo)) {
          x = xFrom + ((point.time - tFrom) / (tTo - tFrom)) * (xTo - xFrom);
        }
      }
    } catch (e) {}
  }

  if (x === null || x === undefined || isNaN(x)) return null;

  return { x, y };
}

export function pixelToPoint(x, y, chart, series, lastKnownCandles = []) {
  if (!chart || !series) return null;
  const timeScale = chart.timeScale();
  let time = timeScale.coordinateToTime(x);
  const price = series.coordinateToPrice(y);

  if (price === null || isNaN(price)) return null;

  if (time === null || time === undefined) {
    // Extrapolate time when clicking in future space
    try {
      const visibleTimeRange = timeScale.getVisibleRange();
      if (visibleTimeRange && visibleTimeRange.to !== visibleTimeRange.from) {
        const tFrom = visibleTimeRange.from;
        const tTo = visibleTimeRange.to;
        const xFrom = timeScale.timeToCoordinate(tFrom);
        const xTo = timeScale.timeToCoordinate(tTo);
        if (xFrom !== null && xTo !== null && xTo !== xFrom) {
          time = Math.round(tFrom + ((x - xFrom) / (xTo - xFrom)) * (tTo - tFrom));
        }
      }
    } catch (e) {}

    if (!time) {
      if (lastKnownCandles.length > 0) {
        const lastCandle = lastKnownCandles[lastKnownCandles.length - 1];
        time = lastCandle.time || Math.floor(Date.now() / 1000);
      } else {
        time = Math.floor(Date.now() / 1000);
      }
    }
  }

  if (typeof time === 'object' && time !== null) {
    time = Math.floor(new Date(time.year, time.month - 1, time.day).getTime() / 1000);
  }

  return { time, price };
}

// Distance from point P to line segment AB
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Hit Testing
export function hitTestDrawing(x, y, drawings, chart, series) {
  const HANDLE_RADIUS = 12;
  const LINE_THRESHOLD = 8;

  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    const pixels = d.points.map((p) => pointToPixel(p, chart, series)).filter(Boolean);
    if (pixels.length === 0) continue;

    // Check handles first
    for (let h = 0; h < pixels.length; h++) {
      const p = pixels[h];
      if (Math.hypot(x - p.x, y - p.y) <= HANDLE_RADIUS) {
        return { drawing: d, handleIndex: h, type: 'handle' };
      }
    }

    // Long & Short Position special handles
    if ((d.type === 'long' || d.type === 'short') && pixels.length >= 2) {
      const isLong = d.type === 'long';
      const p0 = pixels[0]; // entry
      const p1 = pixels[1]; // tp
      const entryPrice = d.points[0].price;
      const tpPrice = d.points[1].price;
      const slPrice = d.slPrice || (isLong ? entryPrice - Math.abs(tpPrice - entryPrice) * 0.5 : entryPrice + Math.abs(tpPrice - entryPrice) * 0.5);
      const slPixel = series.priceToCoordinate(slPrice) || p0.y + (isLong ? 60 : -60);
      const rw = Math.max(60, Math.abs(p1.x - p0.x));
      const minX = Math.min(p0.x, p1.x);

      // TP handle
      if (Math.hypot(x - (minX + rw / 2), y - p1.y) <= HANDLE_RADIUS) {
        return { drawing: d, handleIndex: 1, type: 'handle' };
      }
      // SL handle
      if (Math.hypot(x - (minX + rw / 2), y - slPixel) <= HANDLE_RADIUS) {
        return { drawing: d, handleIndex: 2, type: 'handle_sl' };
      }
      // Width handle
      if (Math.hypot(x - (minX + rw), y - p0.y) <= HANDLE_RADIUS) {
        return { drawing: d, handleIndex: 3, type: 'handle_width' };
      }
    }

    // Check bodies
    if (d.type === 'trendline' || d.type === 'arrow' || d.type === 'ray') {
      if (pixels.length >= 2) {
        let isHit = false;
        if (d.type === 'ray') {
          const dx = pixels[1].x - pixels[0].x;
          const dy = pixels[1].y - pixels[0].y;
          const len = Math.hypot(dx, dy) || 1;
          const extX = pixels[0].x + (dx / len) * 3000;
          const extY = pixels[0].y + (dy / len) * 3000;
          isHit = distToSegment(x, y, pixels[0].x, pixels[0].y, extX, extY) <= LINE_THRESHOLD;
        } else {
          isHit = distToSegment(x, y, pixels[0].x, pixels[0].y, pixels[1].x, pixels[1].y) <= LINE_THRESHOLD;
        }
        if (isHit) return { drawing: d, handleIndex: -1, type: 'body' };
      }
    } else if (d.type === 'horizontal') {
      if (pixels.length >= 1 && Math.abs(y - pixels[0].y) <= LINE_THRESHOLD) {
        return { drawing: d, handleIndex: -1, type: 'body' };
      }
    } else if (d.type === 'vertical') {
      if (pixels.length >= 1 && Math.abs(x - pixels[0].x) <= LINE_THRESHOLD) {
        return { drawing: d, handleIndex: -1, type: 'body' };
      }
    } else if (d.type === 'rectangle' || d.type === 'grid' || d.type === 'volume_range') {
      if (pixels.length >= 2) {
        const minX = Math.min(pixels[0].x, pixels[1].x);
        const maxX = Math.max(pixels[0].x, pixels[1].x);
        const minY = Math.min(pixels[0].y, pixels[1].y);
        const maxY = Math.max(pixels[0].y, pixels[1].y);
        if (x >= minX - 4 && x <= maxX + 4 && y >= minY - 4 && y <= maxY + 4) {
          return { drawing: d, handleIndex: -1, type: 'body' };
        }
      }
    } else if (d.type === 'long' || d.type === 'short') {
      if (pixels.length >= 2) {
        const minX = Math.min(pixels[0].x, pixels[1].x);
        const rw = Math.max(60, Math.abs(pixels[1].x - pixels[0].x));
        const entryY = pixels[0].y;
        const tpY = pixels[1].y;
        const slPrice = d.slPrice || (d.type === 'long' ? d.points[0].price * 0.98 : d.points[0].price * 1.02);
        const slCoord = series.priceToCoordinate(slPrice) || entryY + (d.type === 'long' ? 60 : -60);
        const minY = Math.min(entryY, tpY, slCoord);
        const maxY = Math.max(entryY, tpY, slCoord);
        if (x >= minX - 4 && x <= minX + rw + 4 && y >= minY - 4 && y <= maxY + 4) {
          return { drawing: d, handleIndex: -1, type: 'body' };
        }
      }
    } else if (d.type === 'fibonacci') {
      if (pixels.length >= 2) {
        const minX = Math.min(pixels[0].x, pixels[1].x);
        const maxX = Math.max(pixels[0].x, pixels[1].x) + 120;
        const minY = Math.min(pixels[0].y, pixels[1].y);
        const maxY = Math.max(pixels[0].y, pixels[1].y);
        if (x >= minX - 10 && x <= maxX + 10 && y >= minY - 10 && y <= maxY + 10) {
          return { drawing: d, handleIndex: -1, type: 'body' };
        }
      }
    } else if (d.type === 'polyline') {
      for (let j = 0; j < pixels.length - 1; j++) {
        if (distToSegment(x, y, pixels[j].x, pixels[j].y, pixels[j + 1].x, pixels[j + 1].y) <= LINE_THRESHOLD) {
          return { drawing: d, handleIndex: -1, type: 'body' };
        }
      }
    } else if (d.type === 'price_tag' || d.type === 'text') {
      if (pixels.length >= 1 && Math.hypot(x - pixels[0].x, y - pixels[0].y) <= 35) {
        return { drawing: d, handleIndex: -1, type: 'body' };
      }
    }
  }

  return null;
}

// Draw Handle Circle (TradingView Style: White center with vibrant blue or cyan ring)
function drawHandle(ctx, x, y, isSelected = true, isLocked = false) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isLocked ? '#00E5FF' : '#2962FF';
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

// 60FPS Synchronous Drawing Renderer
export function renderDrawings(ctx, drawings, selectedDrawingId, chart, series, width, height) {
  if (!chart || !series) return;
  const w = width || ctx.canvas.width;
  const h = height || ctx.canvas.height;

  for (const d of drawings) {
    if (!d || !Array.isArray(d.points)) continue;
    const isSelected = d.id === selectedDrawingId;
    const isLocked = !!d.isLocked;
    const pixels = d.points.map((p) => pointToPixel(p, chart, series)).filter(Boolean);

    ctx.save();
    ctx.strokeStyle = d.color || '#2962FF';
    ctx.fillStyle = d.fillColor || 'rgba(41, 98, 255, 0.16)';
    ctx.lineWidth = d.lineWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (d.lineStyle === 'dashed') {
      ctx.setLineDash([7, 5]);
    } else if (d.lineStyle === 'dotted') {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    switch (d.type) {
      case 'trendline': {
        if (pixels.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pixels[0].x, pixels[0].y);
          ctx.lineTo(pixels[1].x, pixels[1].y);
          ctx.stroke();

          if (isSelected) {
            drawHandle(ctx, pixels[0].x, pixels[0].y, true);
            drawHandle(ctx, pixels[1].x, pixels[1].y, true);
            // Midpoint handle
            drawHandle(ctx, (pixels[0].x + pixels[1].x) / 2, (pixels[0].y + pixels[1].y) / 2, true);
          }
        }
        break;
      }

      case 'ray': {
        if (pixels.length >= 2) {
          const dx = pixels[1].x - pixels[0].x;
          const dy = pixels[1].y - pixels[0].y;
          const len = Math.hypot(dx, dy) || 1;
          const extX = pixels[0].x + (dx / len) * 3500;
          const extY = pixels[0].y + (dy / len) * 3500;

          ctx.beginPath();
          ctx.moveTo(pixels[0].x, pixels[0].y);
          ctx.lineTo(extX, extY);
          ctx.stroke();

          if (isSelected) {
            drawHandle(ctx, pixels[0].x, pixels[0].y, true);
            drawHandle(ctx, pixels[1].x, pixels[1].y, true);
          }
        }
        break;
      }

      case 'arrow': {
        if (pixels.length >= 2) {
          const fromX = pixels[0].x;
          const fromY = pixels[0].y;
          const toX = pixels[1].x;
          const toY = pixels[1].y;

          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();

          // Arrowhead
          const headlen = 13;
          const angle = Math.atan2(toY - fromY, toX - fromX);
          ctx.beginPath();
          ctx.moveTo(toX, toY);
          ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = d.color || '#2962FF';
          ctx.fill();

          if (isSelected) {
            drawHandle(ctx, fromX, fromY, true);
            drawHandle(ctx, toX, toY, true);
          }
        }
        break;
      }

      case 'horizontal': {
        if (pixels.length >= 1) {
          const y = pixels[0].y;
          ctx.beginPath();
          ctx.setLineDash([5, 4]);
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Price Pill badge on right
          const priceText = Number(d.points[0].price).toFixed(2);
          ctx.fillStyle = d.color || '#2962FF';
          ctx.fillRect(w - 74, y - 10, 70, 20);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(priceText, w - 39, y);

          if (isSelected) {
            drawHandle(ctx, w / 2, y, true);
          }
        }
        break;
      }

      case 'vertical': {
        if (pixels.length >= 1) {
          const x = pixels[0].x;
          ctx.beginPath();
          ctx.setLineDash([5, 4]);
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
          ctx.setLineDash([]);

          if (isSelected) {
            drawHandle(ctx, x, h / 2, true);
          }
        }
        break;
      }

      case 'rectangle': {
        if (pixels.length >= 2) {
          const rx = Math.min(pixels[0].x, pixels[1].x);
          const ry = Math.min(pixels[0].y, pixels[1].y);
          const rw = Math.abs(pixels[1].x - pixels[0].x);
          const rh = Math.abs(pixels[1].y - pixels[0].y);

          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);

          if (isSelected) {
            drawHandle(ctx, rx, ry, true);
            drawHandle(ctx, rx + rw, ry, true);
            drawHandle(ctx, rx, ry + rh, true);
            drawHandle(ctx, rx + rw, ry + rh, true);
            // Edge centers
            drawHandle(ctx, rx + rw / 2, ry, true);
            drawHandle(ctx, rx + rw / 2, ry + rh, true);
            drawHandle(ctx, rx, ry + rh / 2, true);
            drawHandle(ctx, rx + rw, ry + rh / 2, true);
          }
        }
        break;
      }

      case 'fibonacci': {
        if (pixels.length >= 2) {
          const p0 = pixels[0];
          const p1 = pixels[1];
          const x1 = Math.min(p0.x, p1.x);
          const x2 = Math.max(p0.x, p1.x) + 140;
          const y0 = p0.y;
          const y1 = p1.y;
          const dy = y1 - y0;

          const fibLevels = [
            { level: 0, color: '#787B86', bg: 'rgba(120, 123, 134, 0.1)' },
            { level: 0.236, color: '#F23645', bg: 'rgba(242, 54, 69, 0.12)' },
            { level: 0.382, color: '#FF9800', bg: 'rgba(255, 152, 0, 0.12)' },
            { level: 0.5, color: '#4CAF50', bg: 'rgba(76, 175, 80, 0.12)' },
            { level: 0.618, color: '#089981', bg: 'rgba(8, 153, 129, 0.16)' },
            { level: 0.786, color: '#2962FF', bg: 'rgba(41, 98, 255, 0.15)' },
            { level: 1.0, color: '#787B86', bg: 'rgba(120, 123, 134, 0.1)' },
          ];

          // Trend dotted line
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Fib horizontal levels
          for (let f = 0; f < fibLevels.length; f++) {
            const fib = fibLevels[f];
            const curY = y0 + dy * fib.level;
            const priceVal = d.points[0].price + (d.points[1].price - d.points[0].price) * fib.level;

            if (f < fibLevels.length - 1) {
              const nextY = y0 + dy * fibLevels[f + 1].level;
              ctx.fillStyle = fib.bg;
              ctx.fillRect(x1, Math.min(curY, nextY), x2 - x1, Math.abs(nextY - curY));
            }

            ctx.strokeStyle = fib.color;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x1, curY);
            ctx.lineTo(x2, curY);
            ctx.stroke();

            ctx.fillStyle = fib.color;
            ctx.font = 'bold 10px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${fib.level} (${priceVal.toFixed(2)})`, x1 + 6, curY - 2);
          }

          if (isSelected) {
            drawHandle(ctx, p0.x, p0.y, true);
            drawHandle(ctx, p1.x, p1.y, true);
          }
        }
        break;
      }

      case 'long':
      case 'short': {
        if (pixels.length >= 2) {
          const isLong = d.type === 'long';
          const p0 = pixels[0]; // Entry
          const p1 = pixels[1]; // TP
          const x1 = Math.min(p0.x, p1.x);
          const entryPrice = d.points[0].price;
          const tpPrice = d.points[1].price;
          const entryY = p0.y;
          const tpY = p1.y;

          const slPrice = d.slPrice || (isLong ? entryPrice - Math.abs(tpPrice - entryPrice) * 0.5 : entryPrice + Math.abs(tpPrice - entryPrice) * 0.5);
          const slCoord = series.priceToCoordinate(slPrice);
          const slY = slCoord !== null && !isNaN(slCoord) ? slCoord : entryY + (isLong ? 60 : -60);

          const rw = Math.max(70, Math.abs(p1.x - p0.x));

          // TP Zone (Green)
          ctx.fillStyle = 'rgba(8, 153, 129, 0.2)';
          ctx.fillRect(x1, Math.min(entryY, tpY), rw, Math.abs(tpY - entryY));
          ctx.strokeStyle = '#089981';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x1, Math.min(entryY, tpY), rw, Math.abs(tpY - entryY));

          // SL Zone (Red)
          ctx.fillStyle = 'rgba(242, 54, 69, 0.2)';
          ctx.fillRect(x1, Math.min(entryY, slY), rw, Math.abs(slY - entryY));
          ctx.strokeStyle = '#F23645';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x1, Math.min(entryY, slY), rw, Math.abs(slY - entryY));

          // Center Entry Line
          ctx.strokeStyle = '#E0E3EB';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, entryY);
          ctx.lineTo(x1 + rw, entryY);
          ctx.stroke();

          // Risk / Reward Ratio Math
          const risk = Math.abs(entryPrice - slPrice);
          const reward = Math.abs(tpPrice - entryPrice);
          const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : '1.00';
          const targetPct = ((reward / entryPrice) * 100).toFixed(2);
          const stopPct = ((risk / entryPrice) * 100).toFixed(2);

          // Center Info Badge (TradingView Style)
          const badgeW = 145;
          const badgeH = 24;
          const badgeX = x1 + (rw - badgeW) / 2;
          const badgeY = entryY - badgeH / 2;

          ctx.fillStyle = 'rgba(19, 23, 34, 0.92)';
          ctx.strokeStyle = '#2a2e39';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Plus Jakarta Sans, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`Risk / Reward Ratio: ${rrRatio}`, badgeX + badgeW / 2, badgeY + badgeH / 2);

          // Top & Bottom Targets info
          ctx.fillStyle = '#089981';
          ctx.font = 'bold 9.5px JetBrains Mono, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`Target: ${tpPrice.toFixed(2)} (+${targetPct}%)`, x1 + 6, tpY + (isLong ? -6 : 14));

          ctx.fillStyle = '#F23645';
          ctx.fillText(`Stop: ${slPrice.toFixed(2)} (-${stopPct}%)`, x1 + 6, slY + (isLong ? 14 : -6));

          if (isSelected) {
            drawHandle(ctx, x1, entryY, true);
            drawHandle(ctx, x1 + rw, entryY, true);
            drawHandle(ctx, x1 + rw / 2, tpY, true);
            drawHandle(ctx, x1 + rw / 2, slY, true);
          }
        }
        break;
      }

      case 'price_tag': {
        if (pixels.length >= 1) {
          const p = pixels[0];
          const priceText = Number(d.points[0].price).toFixed(2) + ' $';

          ctx.fillStyle = d.color || '#00E5FF';
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(p.x + 8, p.y - 12, 76, 24, 4) : ctx.rect(p.x + 8, p.y - 12, 76, 24);
          ctx.fill();

          // Arrow pointer to anchor
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 8, p.y - 5);
          ctx.lineTo(p.x + 8, p.y + 5);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10.5px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(priceText, p.x + 46, p.y);

          if (isSelected) {
            drawHandle(ctx, p.x, p.y, true);
          }
        }
        break;
      }

      case 'text': {
        if (pixels.length >= 1) {
          const p = pixels[0];
          const text = d.text || 'Ghi chú phân tích';

          ctx.font = '12px Plus Jakarta Sans, sans-serif';
          const metrics = ctx.measureText(text);
          const tw = metrics.width + 18;
          const th = 26;

          ctx.fillStyle = 'rgba(19, 23, 34, 0.9)';
          ctx.strokeStyle = d.color || '#2962FF';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(p.x, p.y - th / 2, tw, th, 4) : ctx.rect(p.x, p.y - th / 2, tw, th);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, p.x + 9, p.y);

          if (isSelected) {
            drawHandle(ctx, p.x, p.y, true);
          }
        }
        break;
      }

      case 'polyline': {
        if (pixels.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pixels[0].x, pixels[0].y);
          for (let j = 1; j < pixels.length; j++) {
            ctx.lineTo(pixels[j].x, pixels[j].y);
          }
          ctx.stroke();

          if (isSelected) {
            pixels.forEach((p) => drawHandle(ctx, p.x, p.y, true));
          }
        }
        break;
      }

      case 'curve': {
        if (pixels.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pixels[0].x, pixels[0].y);
          ctx.quadraticCurveTo(pixels[1].x, pixels[1].y, pixels[2].x, pixels[2].y);
          ctx.stroke();

          if (isSelected) {
            drawHandle(ctx, pixels[0].x, pixels[0].y, true);
            drawHandle(ctx, pixels[1].x, pixels[1].y, true);
            drawHandle(ctx, pixels[2].x, pixels[2].y, true);
          }
        }
        break;
      }

      case 'grid': {
        if (pixels.length >= 2) {
          const minX = Math.min(pixels[0].x, pixels[1].x);
          const maxX = Math.max(pixels[0].x, pixels[1].x);
          const minY = Math.min(pixels[0].y, pixels[1].y);
          const maxY = Math.max(pixels[0].y, pixels[1].y);
          const w = maxX - minX;
          const h = maxY - minY;

          ctx.strokeRect(minX, minY, w, h);

          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(minX + w / 3, minY);
          ctx.lineTo(minX + w / 3, maxY);
          ctx.moveTo(minX + (2 * w) / 3, minY);
          ctx.lineTo(minX + (2 * w) / 3, maxY);
          ctx.moveTo(minX, minY + h / 3);
          ctx.lineTo(maxX, minY + h / 3);
          ctx.moveTo(minX, minY + (2 * h) / 3);
          ctx.lineTo(maxX, minY + (2 * h) / 3);
          ctx.stroke();
          ctx.setLineDash([]);

          if (isSelected) {
            drawHandle(ctx, minX, minY, true);
            drawHandle(ctx, maxX, maxY, true);
          }
        }
        break;
      }

      case 'volume_range': {
        if (pixels.length >= 2) {
          const minX = Math.min(pixels[0].x, pixels[1].x);
          const maxX = Math.max(pixels[0].x, pixels[1].x);
          const minY = Math.min(pixels[0].y, pixels[1].y);
          const maxY = Math.max(pixels[0].y, pixels[1].y);
          const w = maxX - minX;
          const h = maxY - minY;

          ctx.fillStyle = 'rgba(41, 98, 255, 0.08)';
          ctx.fillRect(minX, minY, w, h);
          ctx.strokeRect(minX, minY, w, h);

          const barCount = 7;
          const barH = h / barCount;
          for (let b = 0; b < barCount; b++) {
            const barW = (w * (0.35 + 0.55 * Math.sin(b * 0.9 + 1))) % w;
            ctx.fillStyle = b % 2 === 0 ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)';
            ctx.fillRect(minX, minY + b * barH + 2, barW, barH - 4);
          }

          if (isSelected) {
            drawHandle(ctx, minX, minY, true);
            drawHandle(ctx, maxX, maxY, true);
          }
        }
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }
}

// Custom 60fps Native Chart Primitive for Zero-Lag TradingView Drawings
class DrawingToolsPaneView {
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

export class DrawingToolsPrimitive {
  constructor() {
    this._paneViews = [new DrawingToolsPaneView(this)];
    this._drawings = [];
    this._selectedDrawingId = null;
    this._currentDraft = null;
    this._isDrawingsHidden = false;
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

  setDrawings(drawings, selectedDrawingId, currentDraft, isHidden) {
    this._drawings = Array.isArray(drawings) ? drawings : [];
    this._selectedDrawingId = selectedDrawingId;
    this._currentDraft = currentDraft;
    this._isDrawingsHidden = !!isHidden;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  draw(ctx) {
    if (!this._chart || !this._series || this._isDrawingsHidden) return;
    const list = [...this._drawings];
    if (this._currentDraft) {
      list.push(this._currentDraft);
    }
    renderDrawings(ctx, list, this._selectedDrawingId, this._chart, this._series, ctx.canvas.width, ctx.canvas.height);
  }
}
