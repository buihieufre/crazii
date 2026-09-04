// Color Constants
export const BULLISH_COLOR = '#FFEB3B'; // Yellow (Crazii Bullish)
export const BEARISH_COLOR = '#FF0000'; // Red (Crazii Bearish)
export const NEUTRAL_COLOR = '#FFEB3B';

/**
 * Exact Price Line Mapping Specs
 */
export const PRICE_LINE_SPECS = [
  { key: 'op_line', title: 'OP', color: '#ECEFF1', bgColor: '#ECEFF1', textColor: '#000000', lineStyle: 2 },
  { key: 'ma_200', title: '200MA', color: '#FFA726', bgColor: '#FFA726', textColor: '#000000', lineStyle: 0 },
  { key: 'wma', title: '30MA', color: '#00E676', bgColor: '#00E676', textColor: '#000000', lineStyle: 0 },
  { key: 'mlp_line', title: 'MLP', color: '#D7CCC8', bgColor: '#D7CCC8', textColor: '#000000', lineStyle: 0 },
  { key: 'ktr_plus_3', title: 'KTR+3', color: '#FFEB3B', bgColor: '#FFEB3B', textColor: '#000000', lineStyle: 0 },
  { key: 'ktr_plus_2', title: 'KTR+2', color: '#FFEB3B', bgColor: '#FFEB3B', textColor: '#000000', lineStyle: 2 },
  { key: 'ktr_plus_1', title: 'KTR+1', color: '#00E676', bgColor: '#00E676', textColor: '#000000', lineStyle: 2 },
  { key: 'ktr_minus_1', title: 'KTR-1', color: '#00E676', bgColor: '#00E676', textColor: '#000000', lineStyle: 0 },
  { key: 'ktr_minus_2', title: 'KTR-2', color: '#FFEB3B', bgColor: '#FFEB3B', textColor: '#000000', lineStyle: 0 },
  { key: 'ktf_minus_3', altKey: 'ktr_minus_3', title: 'KTR-3', color: '#FF9800', bgColor: '#FFB74D', textColor: '#000000', lineStyle: 1 },
  { key: 'pivot_2', altKey: 'pivot_02', title: 'Pivot 02', color: '#E040FB', bgColor: '#FF007F', textColor: '#FFFFFF', lineStyle: 0 },
  { key: 'pivot_1', title: 'Pivot 01', color: '#00E5FF', bgColor: '#80DEEA', textColor: '#000000', lineStyle: 0 }
];

export const TIMEFRAMES = [
  { code: 'XAUUSD.ca_5', label: '5m', minutes: 5 },
  { code: 'XAUUSD.ca_15', label: '15m', minutes: 15 },
  { code: 'XAUUSD.ca_1440', label: '1D', minutes: 1440 }
];
