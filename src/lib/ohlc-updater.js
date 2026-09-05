/**
 * Zero-react-render Direct DOM updater for Header OHLC bar
 * Guarantees smooth 60fps without layout thrashing, text superposition, or re-render storms.
 */

let flashTimeout = null;

export function updateOhlcHeader(data, decimals = 2) {
  const oEl = document.getElementById('ohlc-val-o');
  const hEl = document.getElementById('ohlc-val-h');
  const lEl = document.getElementById('ohlc-val-l');
  const cEl = document.getElementById('ohlc-val-c');
  const twbOEl = document.getElementById('ohlc-val-twb-o');
  const twbCEl = document.getElementById('ohlc-val-twb-c');
  const tagEl = document.getElementById('ohlc-twb-tag');

  if (!data) {
    if (oEl) oEl.innerText = '-';
    if (hEl) hEl.innerText = '-';
    if (lEl) lEl.innerText = '-';
    if (cEl) {
      cEl.innerText = '-';
      cEl.className = 'ohlc-val';
    }
    if (twbOEl) twbOEl.innerText = '-';
    if (twbCEl) twbCEl.innerText = '-';
    if (tagEl) tagEl.style.display = 'none';
    return;
  }

  const dec = typeof decimals === 'number' ? decimals : 2;

  if (oEl && data.open !== undefined && !isNaN(data.open)) {
    oEl.innerText = Number(data.open).toFixed(dec);
  }
  if (hEl && data.high !== undefined && !isNaN(data.high)) {
    hEl.innerText = Number(data.high).toFixed(dec);
  }
  if (lEl && data.low !== undefined && !isNaN(data.low)) {
    lEl.innerText = Number(data.low).toFixed(dec);
  }
  if (cEl && data.close !== undefined && !isNaN(data.close)) {
    cEl.innerText = Number(data.close).toFixed(dec);
    if (data.flash) {
      cEl.className = `ohlc-val ${data.flash}`;
      clearTimeout(flashTimeout);
      flashTimeout = setTimeout(() => {
        if (cEl) cEl.className = 'ohlc-val';
      }, 350);
    }
  }
  if (twbOEl && data.twbOpen !== undefined && !isNaN(data.twbOpen)) {
    twbOEl.innerText = Number(data.twbOpen).toFixed(dec);
  }
  if (twbCEl && data.twbClose !== undefined && !isNaN(data.twbClose)) {
    twbCEl.innerText = Number(data.twbClose).toFixed(dec);
  }

  if (tagEl && data.twbOpen !== undefined && data.twbClose !== undefined && !isNaN(data.twbOpen) && !isNaN(data.twbClose)) {
    tagEl.style.display = 'inline-block';
    if (data.twbClose > data.twbOpen) {
      tagEl.className = 'twb-tag twb-bullish';
      tagEl.innerText = '🟡 BULLISH';
    } else if (data.twbClose < data.twbOpen) {
      tagEl.className = 'twb-tag twb-bearish';
      tagEl.innerText = '🔴 BEARISH';
    } else {
      tagEl.className = 'twb-tag';
      tagEl.innerText = '⚪ NEUTRAL';
    }
  }
}

export function updateHeaderCountdown(text) {
  const el = document.getElementById('header-countdown-text');
  if (el) {
    el.innerText = text ? `(${text})` : '';
  }
}
