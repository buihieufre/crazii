'use client';

import React, { useState, useRef, useEffect } from 'react';

export const DRAWING_TOOLS = {
  CURSOR: 'cursor',
  TREND_LINE: 'trendline',
  RAY: 'ray',
  ARROW: 'arrow',
  HORIZONTAL_LINE: 'horizontal',
  VERTICAL_LINE: 'vertical',
  RECTANGLE: 'rectangle',
  FIBONACCI: 'fibonacci',
  LONG_POSITION: 'long',
  SHORT_POSITION: 'short',
  PRICE_TAG: 'price_tag',
  TEXT: 'text',
  POLYLINE: 'polyline',
  CURVE: 'curve',
  GRID: 'grid',
  VOLUME_RANGE: 'volume_range',
};

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

export default function DrawingToolbar({
  activeTool = DRAWING_TOOLS.CURSOR,
  onSelectTool,
  selectedDrawing,
  onUpdateSelectedDrawing,
  onDeleteSelectedDrawing,
  onClearAllDrawings,
  hasDrawings = false,
}) {
  const [position, setPosition] = useState({ x: 300, y: 56 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLineWidthPicker, setShowLineWidthPicker] = useState(false);
  const toolbarRef = useRef(null);

  // Dragging the floating toolbar
  const handleMouseDown = (e) => {
    // Only start drag when clicking the drag handle or empty toolbar area
    if (e.target.closest('button') || e.target.closest('.color-popover')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragOffset.x));
      const newY = Math.max(45, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const currentColor = selectedDrawing?.color || '#2962FF';
  const currentLineWidth = selectedDrawing?.lineWidth || 2;

  return (
    <div
      ref={toolbarRef}
      className={`tv-floating-drawing-toolbar ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* 1. Drag Grip Handle */}
      <div className="drawing-drag-handle" title="Kéo thả để di chuyển thanh công cụ">
        <svg width="10" height="18" viewBox="0 0 10 18" fill="currentColor">
          <circle cx="2.5" cy="3" r="1.2" />
          <circle cx="7.5" cy="3" r="1.2" />
          <circle cx="2.5" cy="9" r="1.2" />
          <circle cx="7.5" cy="9" r="1.2" />
          <circle cx="2.5" cy="15" r="1.2" />
          <circle cx="7.5" cy="15" r="1.2" />
        </svg>
      </div>

      {/* 2. Long Position (⚬—L—⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.LONG_POSITION ? 'active' : ''}`}
        title="Long Position (Vị thế Mua / Quản lý R:R)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.LONG_POSITION ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.LONG_POSITION)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="5" r="2" fill="#00E676" />
          <line x1="6" y1="5" x2="20" y2="5" />
          <text x="12" y="14" fontSize="9" fontWeight="900" textAnchor="middle" fill="#00E676" stroke="none">L</text>
          <line x1="4" y1="19" x2="18" y2="19" />
          <circle cx="20" cy="19" r="2" fill="#FF5252" />
        </svg>
      </button>

      {/* 3. Short Position (⚬—S—⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.SHORT_POSITION ? 'active' : ''}`}
        title="Short Position (Vị thế Bán / Quản lý R:R)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.SHORT_POSITION ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.SHORT_POSITION)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="5" r="2" fill="#FF5252" />
          <line x1="6" y1="5" x2="20" y2="5" />
          <text x="12" y="14" fontSize="9" fontWeight="900" textAnchor="middle" fill="#FF5252" stroke="none">S</text>
          <line x1="4" y1="19" x2="18" y2="19" />
          <circle cx="20" cy="19" r="2" fill="#00E676" />
        </svg>
      </button>

      {/* 4. Arrow (↗) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.ARROW ? 'active' : ''}`}
        title="Arrow (Mũi tên chỉ hướng)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.ARROW ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.ARROW)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="19" x2="18" y2="6" />
          <polyline points="9 6 18 6 18 15" />
        </svg>
      </button>

      {/* 5. Crosshair / Cursor (+) */}
      <button
        className={`drawing-tool-btn cursor-tool ${activeTool === DRAWING_TOOLS.CURSOR ? 'active' : ''}`}
        title="Con trỏ chuột / Chọn & Di chuyển hình vẽ"
        onClick={() => onSelectTool(DRAWING_TOOLS.CURSOR)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2962FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="8" />
          <line x1="12" y1="16" x2="12" y2="21" />
          <line x1="3" y1="12" x2="8" y2="12" />
          <line x1="16" y1="12" x2="21" y2="12" />
          <circle cx="12" cy="12" r="1.5" fill="#2962FF" />
        </svg>
      </button>

      {/* 6. Trend Line (⚬—⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.TREND_LINE ? 'active' : ''}`}
        title="Trend Line (Đường xu hướng 2 điểm)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.TREND_LINE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.TREND_LINE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="19" r="2.5" />
          <line x1="7" y1="17" x2="17" y2="7" />
          <circle cx="19" cy="5" r="2.5" />
        </svg>
      </button>

      {/* 7. Price Tag / Note ([$]) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.PRICE_TAG ? 'active' : ''}`}
        title="Price Tag (Ghim nhãn giá)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.PRICE_TAG ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.PRICE_TAG)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="11" rx="2" />
          <text x="12" y="11.5" fontSize="9.5" fontWeight="900" textAnchor="middle" fill="currentColor" stroke="none">$</text>
          <line x1="12" y1="14" x2="12" y2="18" />
          <circle cx="12" cy="20" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {/* 8. Polyline / Path (⚬-⚬-⚬↗) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.POLYLINE ? 'active' : ''}`}
        title="Path / Polyline (Đường Zigzag đa điểm - Double Click để hoàn tất)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.POLYLINE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.POLYLINE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="18" r="1.8" />
          <line x1="5.5" y1="16.5" x2="10.5" y2="8.5" />
          <circle cx="11.5" cy="7.5" r="1.8" />
          <line x1="12.5" y1="9" x2="15.5" y2="15.5" />
          <circle cx="16.5" cy="16.5" r="1.8" />
          <line x1="17.8" y1="15.2" x2="21" y2="7" />
          <polyline points="18 6 22 6 22 10" />
        </svg>
      </button>

      {/* 9. Curve / Arc (⚬⌒⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.CURVE ? 'active' : ''}`}
        title="Curve (Đường cong 3 điểm)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.CURVE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.CURVE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="18" r="2" />
          <path d="M 6 16 Q 10 4 19 6" />
          <circle cx="11.5" cy="9" r="1.5" />
          <circle cx="20" cy="6" r="2" />
        </svg>
      </button>

      {/* 10. Grid / Fib Box (▦) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.GRID ? 'active' : ''}`}
        title="Grid Box / Hộp lưới Gann"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.GRID ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.GRID)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <line x1="9.3" y1="4" x2="9.3" y2="20" />
          <line x1="14.6" y1="4" x2="14.6" y2="20" />
          <line x1="4" y1="9.3" x2="20" y2="9.3" />
          <line x1="4" y1="14.6" x2="20" y2="14.6" />
          <circle cx="4" cy="20" r="1.5" />
          <circle cx="20" cy="4" r="1.5" />
        </svg>
      </button>

      {/* 11. Fibonacci Retracement (⚬≡⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.FIBONACCI ? 'active' : ''}`}
        title="Fibonacci Retracement (Thoái lui Fibonacci)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.FIBONACCI ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.FIBONACCI)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="19" r="2" fill="#00E676" />
          <line x1="6" y1="19" x2="22" y2="19" />
          <line x1="2" y1="14.5" x2="22" y2="14.5" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="2" y1="5.5" x2="19" y2="5.5" />
          <circle cx="20.5" cy="5.5" r="2" fill="#FF5252" />
        </svg>
      </button>

      {/* 12. Text (T) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.TEXT ? 'active' : ''}`}
        title="Text (Ghi chú văn bản)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.TEXT ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.TEXT)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 4v3h5v12h4V7h5V4H5z" />
        </svg>
      </button>

      {/* 13. Ray / Horizontal Line (⚬—) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.RAY ? 'active' : ''}`}
        title="Ray (Tia ngang / Tia vô cực)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.RAY ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.RAY)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="12" r="2.5" />
          <line x1="8" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* 14. Rectangle (⚬□⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.RECTANGLE ? 'active' : ''}`}
        title="Rectangle (Vùng giá Hỗ trợ / Kháng cự)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.RECTANGLE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.RECTANGLE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="6" width="14" height="12" rx="1.5" />
          <circle cx="5" cy="6" r="1.5" />
          <circle cx="19" cy="6" r="1.5" />
          <circle cx="5" cy="18" r="1.5" />
          <circle cx="19" cy="18" r="1.5" />
        </svg>
      </button>

      {/* 15. Volume Profile / Range (⚬📊⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.VOLUME_RANGE ? 'active' : ''}`}
        title="Volume Range / Vùng khối lượng"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.VOLUME_RANGE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.VOLUME_RANGE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="19" r="1.5" />
          <line x1="4" y1="17.5" x2="4" y2="5" />
          <rect x="4" y="7" width="10" height="2.5" fill="currentColor" opacity="0.6" stroke="none" />
          <rect x="4" y="11" width="14" height="2.5" fill="currentColor" stroke="none" />
          <rect x="4" y="15" width="7" height="2.5" fill="currentColor" opacity="0.6" stroke="none" />
        </svg>
      </button>

      {/* 16. Vertical Line (⚬|⚬) */}
      <button
        className={`drawing-tool-btn ${activeTool === DRAWING_TOOLS.VERTICAL_LINE ? 'active' : ''}`}
        title="Vertical Line (Đường thời gian dọc)"
        onClick={() => onSelectTool(activeTool === DRAWING_TOOLS.VERTICAL_LINE ? DRAWING_TOOLS.CURSOR : DRAWING_TOOLS.VERTICAL_LINE)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="19" />
          <circle cx="12" cy="20.5" r="2" />
        </svg>
      </button>

      {/* Actions: Color Picker, Width, Delete */}
      {selectedDrawing && (
        <>
          <div className="drawing-toolbar-divider" />
          <div className="drawing-active-props">
            {/* Color Selector */}
            <div className="drawing-prop-item">
              <button
                className="drawing-color-preview-btn"
                style={{ backgroundColor: currentColor }}
                title="Chọn màu sắc"
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowLineWidthPicker(false);
                }}
              />
              {showColorPicker && (
                <div className="drawing-popover color-popover">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch ${c === currentColor ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => {
                        onUpdateSelectedDrawing({ color: c });
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Line Width Selector */}
            <div className="drawing-prop-item">
              <button
                className="drawing-linewidth-btn"
                title="Độ dày nét vẽ"
                onClick={() => {
                  setShowLineWidthPicker(!showLineWidthPicker);
                  setShowColorPicker(false);
                }}
              >
                <span>{currentLineWidth}px</span>
              </button>
              {showLineWidthPicker && (
                <div className="drawing-popover width-popover">
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      className={`width-opt ${w === currentLineWidth ? 'selected' : ''}`}
                      onClick={() => {
                        onUpdateSelectedDrawing({ lineWidth: w });
                        setShowLineWidthPicker(false);
                      }}
                    >
                      <div style={{ height: `${w}px`, width: '100%', background: '#fff' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Delete Selected */}
            <button
              className="drawing-tool-btn delete-btn"
              title="Xóa hình vẽ này (Phím Delete)"
              onClick={onDeleteSelectedDrawing}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Clear All Drawings button (shown when there are drawings) */}
      {hasDrawings && !selectedDrawing && (
        <>
          <div className="drawing-toolbar-divider" />
          <button
            className="drawing-tool-btn clear-all-btn"
            title="Xóa tất cả các hình vẽ trên biểu đồ"
            onClick={() => {
              if (window.confirm('Bạn có chắc chắn muốn xóa tất cả hình vẽ trên biểu đồ này?')) {
                onClearAllDrawings();
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffb300" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
