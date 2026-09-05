'use client';

import React, { useState } from 'react';

export const DRAWING_TOOLS = {
  CROSSHAIR: 'crosshair',
  CURSOR: 'cursor',
  TREND_LINE: 'trendline',
  RAY: 'ray',
  ARROW: 'arrow',
  HORIZONTAL_LINE: 'horizontal',
  VERTICAL_LINE: 'vertical',
  FIBONACCI: 'fibonacci',
  GRID: 'grid',
  RECTANGLE: 'rectangle',
  POLYLINE: 'polyline',
  CURVE: 'curve',
  TEXT: 'text',
  PRICE_TAG: 'price_tag',
  LONG_POSITION: 'long',
  SHORT_POSITION: 'short',
  VOLUME_RANGE: 'volume_range',
};

const toolGroups = [
  {
    id: 'group-cursor',
    title: 'Con trỏ & Chọn',
    items: [
      {
        id: DRAWING_TOOLS.CROSSHAIR,
        name: 'Con trỏ chữ thập (Crosshair)',
        desc: 'Con trỏ đối chiếu đồng bộ giữa các khung biểu đồ',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="3" x2="12" y2="21" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.CURSOR,
        name: 'Mũi tên chọn (Pointer)',
        desc: 'Chọn, di chuyển hoặc điều chỉnh các hình vẽ trên chart',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7 18 3-7 7-3L3 3z" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'group-lines',
    title: 'Đường xu hướng & Kẻ vẽ',
    items: [
      {
        id: DRAWING_TOOLS.TREND_LINE,
        name: 'Đường xu hướng (Trend Line)',
        desc: 'Kẻ đường thẳng nối 2 điểm giá bất kỳ',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="20" x2="20" y2="4" />
            <circle cx="4" cy="20" r="2" fill="currentColor" />
            <circle cx="20" cy="4" r="2" fill="currentColor" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.RAY,
        name: 'Tia xu hướng (Ray)',
        desc: 'Tia thẳng bắt đầu từ 1 điểm kéo dài vô tận sang phải',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="18" x2="20" y2="6" />
            <circle cx="4" cy="18" r="2" fill="currentColor" />
            <polyline points="15 6 20 6 20 11" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.ARROW,
        name: 'Mũi tên chỉ hướng',
        desc: 'Vẽ mũi tên định hướng xu hướng thị trường',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="19" x2="19" y2="5" />
            <polyline points="12 5 19 5 19 12" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.HORIZONTAL_LINE,
        name: 'Đường ngang (Horizontal Line)',
        desc: 'Kẻ mức hỗ trợ / kháng cự ngang toàn màn hình',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.VERTICAL_LINE,
        name: 'Đường dọc (Vertical Line)',
        desc: 'Kẻ mốc thời gian / phiên giao dịch',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'group-fibonacci',
    title: 'Fibonacci & Lưới',
    items: [
      {
        id: DRAWING_TOOLS.FIBONACCI,
        name: 'Fibonacci thoái lui',
        desc: 'Tỷ lệ vàng 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="5" x2="21" y2="5" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="3" y1="20" x2="21" y2="20" />
            <line x1="5" y1="20" x2="19" y2="5" strokeDasharray="2 2" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.GRID,
        name: 'Lưới đo lường (Grid)',
        desc: 'Lưới tọa độ phân tích chu kỳ giá & thời gian',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'group-shapes',
    title: 'Hình học & Vùng giá',
    items: [
      {
        id: DRAWING_TOOLS.RECTANGLE,
        name: 'Khung chữ nhật (Vùng giá/Zone)',
        desc: 'Vùng Order Block, Supply / Demand, Khối lượng',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.POLYLINE,
        name: 'Đường gấp khúc (Polyline)',
        desc: 'Vẽ chuỗi bước sóng liên tục nhiều điểm',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 17 8 7 15 15 21 6" />
            <circle cx="3" cy="17" r="1.5" fill="currentColor" />
            <circle cx="8" cy="7" r="1.5" fill="currentColor" />
            <circle cx="15" cy="15" r="1.5" fill="currentColor" />
            <circle cx="21" cy="6" r="1.5" fill="currentColor" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.CURVE,
        name: 'Đường cong (Curve)',
        desc: 'Đường cong Bezier 3 điểm uốn lượn mềm mại',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19 C 8 7, 16 7, 21 19" />
            <circle cx="3" cy="19" r="1.5" fill="currentColor" />
            <circle cx="12" cy="10" r="1.5" fill="currentColor" />
            <circle cx="21" cy="19" r="1.5" fill="currentColor" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'group-text',
    title: 'Ghi chú & Nhãn',
    items: [
      {
        id: DRAWING_TOOLS.TEXT,
        name: 'Ghi chú chữ (Text Box)',
        desc: 'Ghi chú nhận định trực tiếp lên biểu đồ',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="8" y1="20" x2="16" y2="20" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.PRICE_TAG,
        name: 'Nhãn giá (Price Tag)',
        desc: 'Đánh dấu mức giá cụ thể kèm callout chỉ dẫn',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'group-position',
    title: 'Dự báo & Đo lường R:R',
    items: [
      {
        id: DRAWING_TOOLS.LONG_POSITION,
        name: 'Vị thế Mua (Long Position)',
        desc: 'Tính tỷ lệ Risk/Reward Lãi:Lỗ vị thế Long',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="7" fill="rgba(38,166,154,0.35)" stroke="#26A69A" />
            <rect x="4" y="11" width="16" height="9" fill="rgba(239,83,80,0.35)" stroke="#EF5350" />
            <line x1="4" y1="11" x2="20" y2="11" stroke="#2962FF" strokeWidth="2" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.SHORT_POSITION,
        name: 'Vị thế Bán (Short Position)',
        desc: 'Tính tỷ lệ Risk/Reward Lãi:Lỗ vị thế Short',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="9" fill="rgba(239,83,80,0.35)" stroke="#EF5350" />
            <rect x="4" y="13" width="16" height="7" fill="rgba(38,166,154,0.35)" stroke="#26A69A" />
            <line x1="4" y1="13" x2="20" y2="13" stroke="#2962FF" strokeWidth="2" />
          </svg>
        ),
      },
      {
        id: DRAWING_TOOLS.VOLUME_RANGE,
        name: 'Vùng đo khoảng giá (Range)',
        desc: 'Đo % biến động giá và số nến thời gian',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="1" strokeDasharray="3 2" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <polyline points="9 4 12 2 15 4" />
            <polyline points="9 20 12 22 15 20" />
          </svg>
        ),
      },
    ],
  },
];

export default function LeftDrawingPanel({
  activeTool = DRAWING_TOOLS.CROSSHAIR,
  onSelectTool,
  onClearAllDrawings,
  isDrawingsHidden = false,
  onToggleHideDrawings,
  isDrawingsLocked = false,
  onToggleLockDrawings,
  hasDrawings = false,
  onUndo,
  onRedo,
}) {
  // Remember the last chosen item per group so the toolbar button stays updated
  const [selectedToolsMap, setSelectedToolsMap] = useState({});

  const handleToolClick = (group, toolId) => {
    setSelectedToolsMap((prev) => ({ ...prev, [group.id]: toolId }));
    onSelectTool(toolId);
  };

  return (
    <aside className="tv-left-drawing-panel">
      <div className="tv-drawing-tools-list">
        {toolGroups.map((group) => {
          const isGroupActive = group.items.some((item) => item.id === activeTool);
          const hasSubItems = group.items.length > 1;

          // Find current active item in this group or user's chosen item or fallback to first
          const chosenToolId = selectedToolsMap[group.id];
          const currentItem =
            group.items.find((it) => it.id === activeTool) ||
            group.items.find((it) => it.id === chosenToolId) ||
            group.items[0];

          return (
            <div
              key={group.id}
              className="tv-drawing-group-wrapper"
              tabIndex={0}
            >
              <button
                className={`tv-left-tool-btn ${isGroupActive ? 'active' : ''}`}
                onClick={() => handleToolClick(group, currentItem.id)}
              >
                {currentItem.icon}
                {hasSubItems && (
                  <span className="tv-flyout-arrow">▶</span>
                )}
              </button>

              {/* Flyout Submenu - Pure CSS Driven with Smooth Compositor Transitions */}
              {hasSubItems && (
                <div className="tv-drawing-flyout-menu">
                  <div className="tv-flyout-header">{group.title}</div>
                  {group.items.map((item) => {
                    const isItemActive = activeTool === item.id;
                    return (
                      <button
                        key={item.id}
                        className={`tv-flyout-item ${isItemActive ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToolClick(group, item.id);
                        }}
                      >
                        <div className="tv-flyout-item-icon">{item.icon}</div>
                        <div className="tv-flyout-item-content">
                          <div className="tv-flyout-item-name">{item.name}</div>
                          <div className="tv-flyout-item-desc">{item.desc}</div>
                        </div>
                        {isItemActive && <span className="tv-flyout-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Action Utilities: Undo, Redo, Hide, Lock, Clear */}
      <div className="tv-left-panel-bottom">
        {/* Undo (Ctrl+Z) */}
        <button
          className="tv-left-tool-btn util-btn"
          title="Hoàn tác hình vẽ (Ctrl + Z)"
          onClick={onUndo}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        {/* Redo (Ctrl+Y / Ctrl+Shift+Z) */}
        <button
          className="tv-left-tool-btn util-btn"
          title="Làm lại hình vẽ (Ctrl + Y / Ctrl + Shift + Z)"
          onClick={onRedo}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 14 20 9 15 4" />
            <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
          </svg>
        </button>

        {/* Hide/Show Drawings */}
        <button
          className={`tv-left-tool-btn util-btn ${isDrawingsHidden ? 'active-warning' : ''}`}
          title={isDrawingsHidden ? 'Hiện tất cả hình vẽ (Đang ẩn)' : 'Ẩn tất cả hình vẽ'}
          onClick={onToggleHideDrawings}
        >
          {isDrawingsHidden ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>

        {/* Lock/Unlock Drawings */}
        <button
          className={`tv-left-tool-btn util-btn ${isDrawingsLocked ? 'active-warning' : ''}`}
          title={isDrawingsLocked ? 'Mở khóa hình vẽ (Đang khóa)' : 'Khóa tất cả hình vẽ'}
          onClick={onToggleLockDrawings}
        >
          {isDrawingsLocked ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
        </button>

        {/* Clear All Drawings */}
        {hasDrawings && (
          <button
            className="tv-left-tool-btn util-btn delete-all-btn"
            title="Xóa toàn bộ hình vẽ trên biểu đồ"
            onClick={() => {
              if (window.confirm('Bạn có chắc chắn muốn xóa tất cả hình vẽ trên biểu đồ này?')) {
                onClearAllDrawings();
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
