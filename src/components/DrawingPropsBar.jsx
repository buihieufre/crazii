'use client';

import React, { useState } from 'react';

const COLOR_PALETTE = [
  '#2962FF', // TradingView Blue
  '#00E5FF', // Cyan
  '#00E676', // Green
  '#FF5252', // Red
  '#FFD600', // Yellow
  '#FFA726', // Orange
  '#E040FB', // Magenta
  '#FFFFFF', // White
  '#787B86', // Gray
];

const LINE_STYLES = [
  { id: 'solid', label: '―', title: 'Nét liền (Solid)' },
  { id: 'dashed', label: '- -', title: 'Nét đứt (Dashed)' },
  { id: 'dotted', label: '···', title: 'Nét chấm (Dotted)' },
];

function getToolLabel(type) {
  switch (type) {
    case 'trendline': return 'TREND LINE';
    case 'ray': return 'RAY';
    case 'arrow': return 'ARROW';
    case 'horizontal': return 'HORIZ LINE';
    case 'vertical': return 'VERT LINE';
    case 'rectangle': return 'RECTANGLE';
    case 'fibonacci': return 'FIB RETRACE';
    case 'grid': return 'GRID 2x2';
    case 'polyline': return 'POLYLINE';
    case 'text': return 'TEXT NOTE';
    case 'price_tag': return 'PRICE TAG';
    case 'long': return 'LONG POS';
    case 'short': return 'SHORT POS';
    case 'volume_range': return 'VOL PROFILE';
    default: return type?.toUpperCase() || 'DRAWING';
  }
}

export default function DrawingPropsBar({
  selectedDrawing,
  onUpdateDrawing,
  onDeleteDrawing,
  onDuplicateDrawing,
  onDeselectDrawing,
}) {
  const [showColors, setShowColors] = useState(false);
  const [showWidths, setShowWidths] = useState(false);
  const [showStyles, setShowStyles] = useState(false);

  if (!selectedDrawing) return null;

  const currentColor = selectedDrawing.color || '#2962FF';
  const currentLineWidth = selectedDrawing.lineWidth || 2;
  const currentLineStyle = selectedDrawing.lineStyle || 'solid';
  const isLocked = !!selectedDrawing.isLocked;

  return (
    <div className="tv-drawing-props-bar" onClick={(e) => e.stopPropagation()}>
      {/* Type Tag */}
      <span className="props-type-badge">{getToolLabel(selectedDrawing.type)}</span>

      {/* Color Selector */}
      <div className="props-item-wrapper">
        <button
          className="props-color-circle"
          style={{ backgroundColor: currentColor }}
          title="Đổi màu sắc"
          onClick={() => {
            setShowColors(!showColors);
            setShowWidths(false);
            setShowStyles(false);
          }}
        />
        {showColors && (
          <div className="props-popover color-popover">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                className={`color-swatch ${c === currentColor ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => {
                  onUpdateDrawing({ color: c });
                  setShowColors(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Line Width Selector */}
      <div className="props-item-wrapper">
        <button
          className="props-width-btn"
          title="Độ dày nét vẽ"
          onClick={() => {
            setShowWidths(!showWidths);
            setShowColors(false);
            setShowStyles(false);
          }}
        >
          <span>{currentLineWidth}px</span>
        </button>
        {showWidths && (
          <div className="props-popover width-popover">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                className={`width-opt ${w === currentLineWidth ? 'selected' : ''}`}
                onClick={() => {
                  onUpdateDrawing({ lineWidth: w });
                  setShowWidths(false);
                }}
              >
                <div style={{ height: `${w}px`, width: '100%', background: '#fff' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line Style Selector (Solid, Dashed, Dotted) */}
      {selectedDrawing.type !== 'text' && selectedDrawing.type !== 'price_tag' && (
        <div className="props-item-wrapper">
          <button
            className="props-style-btn"
            title="Kiểu đường nét (Solid / Dashed / Dotted)"
            onClick={() => {
              setShowStyles(!showStyles);
              setShowColors(false);
              setShowWidths(false);
            }}
          >
            <span>{currentLineStyle === 'dashed' ? '- -' : currentLineStyle === 'dotted' ? '···' : '―'}</span>
          </button>
          {showStyles && (
            <div className="props-popover style-popover">
              {LINE_STYLES.map((st) => (
                <button
                  key={st.id}
                  className={`style-opt ${currentLineStyle === st.id ? 'selected' : ''}`}
                  title={st.title}
                  onClick={() => {
                    onUpdateDrawing({ lineStyle: st.id });
                    setShowStyles(false);
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{st.label}</span>
                  <span style={{ fontSize: 10.5, color: '#d1d4dc' }}>{st.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text Input if Text Annotation */}
      {selectedDrawing.type === 'text' && (
        <input
          type="text"
          className="props-text-input"
          value={selectedDrawing.text || ''}
          placeholder="Nhập nội dung..."
          onChange={(e) => onUpdateDrawing({ text: e.target.value })}
        />
      )}

      {/* Lock / Unlock Toggle */}
      <button
        className={`props-btn ${isLocked ? 'active-locked' : ''}`}
        title={isLocked ? 'Mở khóa hình vẽ này' : 'Khóa hình vẽ này (tránh kéo nhầm)'}
        onClick={() => onUpdateDrawing({ isLocked: !isLocked })}
      >
        {isLocked ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        )}
      </button>

      {/* Duplicate / Clone */}
      {onDuplicateDrawing && (
        <button
          className="props-btn duplicate-btn"
          title="Nhân bản hình vẽ (Duplicate)"
          onClick={onDuplicateDrawing}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}

      {/* Delete Button */}
      <button
        className="props-btn delete-btn"
        title="Xóa hình vẽ này (Delete / Backspace)"
        onClick={onDeleteDrawing}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>

      <div className="props-divider" />

      {/* Deselect / Untarget Button */}
      <button
        className="props-btn untarget-btn"
        title="Bỏ chọn hình vẽ (Untarget / Escape)"
        onClick={onDeselectDrawing}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
