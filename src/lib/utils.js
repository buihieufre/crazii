/**
 * Parse timestamp to Unix timestamp in seconds
 */
export function parseTimestampToSeconds(ts) {
  if (typeof ts === 'number') {
    return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  if (typeof ts === 'string') {
    const trimmed = ts.trim();
    const parts = trimmed.split(/[\sT]+/);
    if (parts.length >= 2) {
      const datePart = parts[0].split(/[.\-/]/).map(Number);
      const timePart = parts[1].split(':').map(Number);
      if (datePart.length === 3 && timePart.length >= 2) {
        const [y, m, d] = datePart;
        const hh = timePart[0] || 0, mm = timePart[1] || 0, ss = timePart[2] || 0;
        return Math.floor(Date.UTC(y, m - 1, d, hh, mm, ss) / 1000);
      }
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

/**
 * Format countdown to bar close (TradingView style MM:SS or HH:MM:SS)
 */
export function calculateBarCountdown(tfMinutes = 5) {
  let remainingSec = 0;
  const now = new Date();
  const currentSeconds = now.getSeconds();
  const currentMinutes = now.getMinutes();

  if (tfMinutes < 60) {
    const elapsedInBar = (currentMinutes % tfMinutes) * 60 + currentSeconds;
    remainingSec = (tfMinutes * 60) - elapsedInBar;
  } else if (tfMinutes === 60) {
    const elapsedInBar = currentMinutes * 60 + currentSeconds;
    remainingSec = 3600 - elapsedInBar;
  } else if (tfMinutes >= 1440) {
    const nowUtc = new Date();
    const utcHours = nowUtc.getUTCHours();
    const utcMins = nowUtc.getUTCMinutes();
    const utcSecs = nowUtc.getUTCSeconds();
    const elapsedInDay = (utcHours * 3600) + (utcMins * 60) + utcSecs;
    remainingSec = 86400 - elapsedInDay;
  } else {
    const totalSec = tfMinutes * 60;
    const epochSec = Math.floor(Date.now() / 1000);
    remainingSec = totalSec - (epochSec % totalSec);
  }

  if (remainingSec <= 0) remainingSec = 0;

  if (tfMinutes >= 1440) {
    const hours = Math.floor(remainingSec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((remainingSec % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  } else {
    const mins = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const secs = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }
}

/**
 * Format remaining token duration (e.g. 2d 14h, 14m 20s, 03:45)
 */
export function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Hết hạn';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
