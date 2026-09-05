// Timezone definitions & utilities for TradingView-style timezone switching

export const TIMEZONES = [
  { id: 'UTC-12', label: 'UTC-12:00', offset: -720, cities: 'Baker Island, Howland Island' },
  { id: 'UTC-11', label: 'UTC-11:00', offset: -660, cities: 'Samoa, Niue, Pago Pago' },
  { id: 'UTC-10', label: 'UTC-10:00', offset: -600, cities: 'Honolulu, Hawaii, Tahiti' },
  { id: 'UTC-9:30', label: 'UTC-09:30', offset: -570, cities: 'Marquesas Islands' },
  { id: 'UTC-9', label: 'UTC-09:00', offset: -540, cities: 'Anchorage, Alaska' },
  { id: 'UTC-8', label: 'UTC-08:00', offset: -480, cities: 'Los Angeles, San Francisco, Vancouver, Seattle (PT)' },
  { id: 'UTC-7', label: 'UTC-07:00', offset: -420, cities: 'Denver, Phoenix, Calgary, Salt Lake City (MT)' },
  { id: 'UTC-6', label: 'UTC-06:00', offset: -360, cities: 'Chicago, Mexico City, Dallas, Houston (CT)' },
  { id: 'UTC-5', label: 'UTC-05:00', offset: -300, cities: 'New York, Toronto, Miami, Bogota, Lima (ET)' },
  { id: 'UTC-4', label: 'UTC-04:00', offset: -240, cities: 'Santiago, Halifax, Caracas, Santo Domingo' },
  { id: 'UTC-3:30', label: 'UTC-03:30', offset: -210, cities: "St. John's, Newfoundland" },
  { id: 'UTC-3', label: 'UTC-03:00', offset: -180, cities: 'Sao Paulo, Buenos Aires, Montevideo' },
  { id: 'UTC-2', label: 'UTC-02:00', offset: -120, cities: 'Fernando de Noronha, South Georgia' },
  { id: 'UTC-1', label: 'UTC-01:00', offset: -60, cities: 'Azores, Cape Verde' },
  { id: 'UTC', label: 'UTC+00:00', offset: 0, cities: 'UTC, London, Dublin, Lisbon, Reykjavik (GMT)' },
  { id: 'UTC+1', label: 'UTC+01:00', offset: 60, cities: 'Paris, Berlin, Rome, Madrid, Amsterdam, Lagos (CET)' },
  { id: 'UTC+2', label: 'UTC+02:00', offset: 120, cities: 'Athens, Cairo, Johannesburg, Helsinki, Kyiv, Jerusalem' },
  { id: 'UTC+3', label: 'UTC+03:00', offset: 180, cities: 'Moscow, Istanbul, Riyadh, Nairobi, Doha, Dubai (MSK)' },
  { id: 'UTC+3:30', label: 'UTC+03:30', offset: 210, cities: 'Tehran' },
  { id: 'UTC+4', label: 'UTC+04:00', offset: 240, cities: 'Dubai, Abu Dhabi, Baku, Tbilisi, Muscat' },
  { id: 'UTC+4:30', label: 'UTC+04:30', offset: 270, cities: 'Kabul' },
  { id: 'UTC+5', label: 'UTC+05:00', offset: 300, cities: 'Karachi, Tashkent, Islamabad, Yekaterinburg' },
  { id: 'UTC+5:30', label: 'UTC+05:30', offset: 330, cities: 'Mumbai, New Delhi, Kolkata, Bangalore, Colombo (IST)' },
  { id: 'UTC+5:45', label: 'UTC+05:45', offset: 345, cities: 'Kathmandu' },
  { id: 'UTC+6', label: 'UTC+06:00', offset: 360, cities: 'Dhaka, Almaty, Astana' },
  { id: 'UTC+6:30', label: 'UTC+06:30', offset: 390, cities: 'Yangon, Cocos Islands' },
  { id: 'UTC+7', label: 'UTC+07:00', offset: 420, cities: 'Bangkok, Hanoi, Ho Chi Minh, Jakarta, Phnom Penh (ICT)' },
  { id: 'UTC+8', label: 'UTC+08:00', offset: 480, cities: 'Singapore, Hong Kong, Beijing, Shanghai, Taipei, Perth (SGT/CST)' },
  { id: 'UTC+8:45', label: 'UTC+08:45', offset: 525, cities: 'Eucla' },
  { id: 'UTC+9', label: 'UTC+09:00', offset: 540, cities: 'Tokyo, Seoul, Osaka, Pyongyang (JST/KST)' },
  { id: 'UTC+9:30', label: 'UTC+09:30', offset: 570, cities: 'Adelaide, Darwin' },
  { id: 'UTC+10', label: 'UTC+10:00', offset: 600, cities: 'Sydney, Melbourne, Brisbane, Guam, Vladivostok (AEST)' },
  { id: 'UTC+10:30', label: 'UTC+10:30', offset: 630, cities: 'Lord Howe Island' },
  { id: 'UTC+11', label: 'UTC+11:00', offset: 660, cities: 'Noumea, Solomon Islands, Magadan' },
  { id: 'UTC+12', label: 'UTC+12:00', offset: 720, cities: 'Auckland, Wellington, Fiji, Marshall Islands (NZST)' },
  { id: 'UTC+12:45', label: 'UTC+12:45', offset: 765, cities: 'Chatham Islands' },
  { id: 'UTC+13', label: 'UTC+13:00', offset: 780, cities: 'Tonga, Apia, Phoenix Islands' },
  { id: 'UTC+14', label: 'UTC+14:00', offset: 840, cities: 'Kiritimati, Line Islands' },
];

export const POPULAR_TIMEZONE_IDS = [
  'UTC+7',
  'UTC',
  'UTC+8',
  'UTC+9',
  'UTC+1',
  'UTC-5',
  'UTC-4',
  'UTC-8',
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format timestamp into detailed string for Crosshair / Tooltip
 */
export function formatTimeWithOffset(timestampSeconds, offsetMinutes = 420) {
  if (!timestampSeconds) return '';
  const offsetSeconds = (offsetMinutes || 0) * 60;
  const d = new Date((Number(timestampSeconds) + offsetSeconds) * 1000);
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} '${year}  ${hh}:${mm}`;
}

/**
 * Format timestamp into tick marks on chart bottom axis
 */
export function formatTickMark(timeSeconds, tickMarkType, offsetMinutes = 420) {
  if (!timeSeconds) return null;
  const offsetSeconds = (offsetMinutes || 0) * 60;
  const d = new Date((Number(timeSeconds) + offsetSeconds) * 1000);

  // TickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
  if (tickMarkType === 0) {
    return String(d.getUTCFullYear());
  }
  if (tickMarkType === 1) {
    return MONTHS_SHORT[d.getUTCMonth()];
  }
  if (tickMarkType === 2) {
    return String(d.getUTCDate());
  }
  if (tickMarkType === 3) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (tickMarkType === 4) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

/**
 * Get current time string for given offset in minutes (e.g. "14:35:10")
 */
export function getCurrentTimeInOffset(offsetMinutes = 420, includeSeconds = true) {
  const now = Date.now();
  const offsetSeconds = (offsetMinutes || 0) * 60;
  const d = new Date(now + offsetSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  if (!includeSeconds) return `${hh}:${mm}`;
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Detect browser initial timezone or default to UTC+7
 */
export function getDefaultTimezone() {
  if (typeof window === 'undefined') {
    return TIMEZONES.find(t => t.id === 'UTC+7') || TIMEZONES[0];
  }
  try {
    const savedId = localStorage.getItem('crazii_timezone_id');
    if (savedId) {
      const found = TIMEZONES.find(t => t.id === savedId);
      if (found) return found;
    }
    // Try to match browser offset
    const browserOffset = -new Date().getTimezoneOffset(); // in minutes
    const foundByOffset = TIMEZONES.find(t => t.offset === browserOffset);
    if (foundByOffset) return foundByOffset;
  } catch (e) {}

  return TIMEZONES.find(t => t.id === 'UTC+7') || TIMEZONES[0];
}
