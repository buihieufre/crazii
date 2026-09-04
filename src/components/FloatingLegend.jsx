'use client';

import React from 'react';

export default function FloatingLegend() {
  return (
    <div className="legend-floating">
      <div className="legend-item">
        <div className="swatch swatch-yellow"></div>
        <span>Bullish (twb_close &gt; twb_open)</span>
      </div>
      <div className="legend-item">
        <div className="swatch swatch-red"></div>
        <span>Bearish (twb_close &lt; twb_open)</span>
      </div>
      <div className="legend-item">
        <span style={{ color: '#00E5FF', fontWeight: 'bold' }}>🔹</span>
        <span>Buy (pivots_buy_strategy_1)</span>
      </div>
      <div className="legend-item">
        <span style={{ color: '#FFA726', fontWeight: 'bold' }}>🔶</span>
        <span>Sell (pivots_sell_strategy_1)</span>
      </div>
    </div>
  );
}
