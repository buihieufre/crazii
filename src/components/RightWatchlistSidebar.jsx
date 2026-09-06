'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ASSETS_DATA, ALL_SYMBOLS, getSymbolByCode } from '@/lib/assets-data';

export default function RightWatchlistSidebar({
  isOpen,
  onToggleOpen,
  targetSlotIndex = 0,
  onSelectSlot,
  activeLayout = '1',
  currentSlotCode,
  currentSymbolCode,
  currentTimeframeCode,
  onSelectAsset,
  visibleSlotCount = 1,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [favorites, setFavorites] = useState([]);
  const [isWrapCategories, setIsWrapCategories] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);

  const searchInputRef = useRef(null);
  const categoriesScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Load favorites & width from localStorage
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem('tradewh_favorite_symbols');
      if (savedFavs) {
        const parsed = JSON.parse(savedFavs);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }
      const savedWidth = localStorage.getItem('tradewh_sidebar_width');
      if (savedWidth) {
        const parsedWidth = parseInt(savedWidth, 10);
        if (parsedWidth >= 300 && parsedWidth <= 600) setSidebarWidth(parsedWidth);
      }
      const savedWrap = localStorage.getItem('tradewh_categories_wrap');
      if (savedWrap !== null) {
        setIsWrapCategories(savedWrap === 'true');
      }
    } catch (e) {}
  }, []);

  // Check categories scroll buttons visibility
  const checkScroll = useCallback(() => {
    const el = categoriesScrollRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, categoriesScrollRef]);

  const scrollCategories = (direction) => {
    const el = categoriesScrollRef.current;
    if (el) {
      const amount = direction === 'left' ? -140 : 140;
      el.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(checkScroll, 250);
    }
  };

  // Toggle favorite symbol
  const toggleFavorite = (code, e) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      let next;
      if (prev.includes(code)) {
        next = prev.filter((c) => c !== code);
      } else {
        next = [...prev, code];
      }
      try {
        localStorage.setItem('tradewh_favorite_symbols', JSON.stringify(next));
      } catch (err) {}
      return next;
    });
  };

  const toggleWrapCategories = () => {
    setIsWrapCategories((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('tradewh_categories_wrap', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Drag to resize sidebar width
  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX - 42; // subtract 42px right strip
      if (newWidth >= 300 && newWidth <= 580) {
        setSidebarWidth(newWidth);
        try {
          localStorage.setItem('tradewh_sidebar_width', String(newWidth));
        } catch (err) {}
      }
    };

    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const categories = useMemo(() => {
    return ['All', '⭐ Yêu thích', ...ASSETS_DATA.map((c) => c.name)];
  }, []);

  // Filter symbols based on category, search, and favorites
  const filteredSymbols = useMemo(() => {
    return ALL_SYMBOLS.filter((sym) => {
      // Category match
      let matchesCat = true;
      if (activeCategory === '⭐ Yêu thích') {
        matchesCat = favorites.includes(sym.code);
      } else if (activeCategory !== 'All') {
        matchesCat = ASSETS_DATA.find((c) => c.name === activeCategory)?.symbols.some(
          (s) => s.code === sym.code
        );
      }

      // Search match
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        sym.code.toLowerCase().includes(q) ||
        sym.name.toLowerCase().includes(q) ||
        (sym.price && sym.price.includes(q));

      return matchesCat && matchesSearch;
    });
  }, [activeCategory, searchQuery, favorites]);

  return (
    <div className={`tv-right-sidebar-container ${isOpen ? 'expanded' : 'collapsed'}`}>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="tv-watchlist-backdrop"
          onClick={onToggleOpen}
          title="Chạm để đóng Market Watch"
        />
      )}

      {/* 1. EXPANDED WATCHLIST DRAWER PANEL */}
      {isOpen && (
        <aside
          className="tv-watchlist-drawer"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Resize Handle on left border of drawer */}
          <div
            className={`drawer-resizer-handle ${isResizing ? 'active' : ''}`}
            onMouseDown={startResizing}
            title="Kéo sang trái/phải để thay đổi độ rộng Sidebar"
          />

          {/* Drawer Header */}
          <div className="watchlist-drawer-header">
            <div className="drawer-title-row">
              <div className="drawer-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18 9l-5 5-4-4-3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Markets & Watchlist</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="drawer-action-icon-btn"
                  onClick={toggleWrapCategories}
                  title={isWrapCategories ? "Chuyển sang dạng cuộn ngang 1 dòng" : "Hiển thị tất cả danh mục (Trải rộng)"}
                >
                  {isWrapCategories ? '⊟ 1 Dòng' : '⊞ Tất cả'}
                </button>
                <button
                  className="drawer-close-btn"
                  onClick={onToggleOpen}
                  title="Thu gọn Watchlist"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Target Slot Selector (Active Chart Target) */}
            <div className="target-slot-card">
              <div className="target-slot-title">
                <span>🎯 Khung mục tiêu:</span>
                <strong className="slot-highlight">Khung #{targetSlotIndex + 1}</strong>
              </div>

              {activeLayout !== '1' && (
                <div className="slot-chips-row">
                  {Array.from({ length: visibleSlotCount }).map((_, idx) => (
                    <button
                      key={idx}
                      className={`slot-chip-btn ${targetSlotIndex === idx ? 'active' : ''}`}
                      onClick={() => onSelectSlot && onSelectSlot(idx)}
                      title={`Chọn Khung #${idx + 1} làm mục tiêu tải tài sản`}
                    >
                      Khung #{idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Box */}
            <div className="watchlist-search-wrapper">
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="watchlist-search-input"
                placeholder="Tìm mã tài sản (BTC, Vàng, Dầu, Cổ phiếu...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="search-clear-btn"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Pills Container */}
            <div className={`categories-outer-box ${isWrapCategories ? 'wrap-mode' : 'scroll-mode'}`}>
              {!isWrapCategories && (
                <button
                  className={`scroll-arrow-btn left ${canScrollLeft ? 'visible' : ''}`}
                  onClick={() => scrollCategories('left')}
                  title="Cuộn sang trái"
                >
                  ‹
                </button>
              )}

              <div
                ref={categoriesScrollRef}
                className={`watchlist-categories-container ${isWrapCategories ? 'wrap' : 'nowrap'}`}
                onScroll={checkScroll}
                onWheel={(e) => {
                  if (!isWrapCategories && e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY * 0.8;
                  }
                }}
              >
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                    title={`Lọc theo danh mục: ${cat}`}
                  >
                    {cat}
                    {cat === '⭐ Yêu thích' && favorites.length > 0 && ` (${favorites.length})`}
                  </button>
                ))}
              </div>

              {!isWrapCategories && (
                <button
                  className={`scroll-arrow-btn right ${canScrollRight ? 'visible' : ''}`}
                  onClick={() => scrollCategories('right')}
                  title="Cuộn sang phải để xem thêm danh mục"
                >
                  ›
                </button>
              )}
            </div>
          </div>

          {/* Asset List Scroll Area */}
          <div className="watchlist-items-list">
            {filteredSymbols.map((sym) => {
              const isSelectedSymbol = sym.code === currentSymbolCode;
              const isFav = favorites.includes(sym.code);
              const availableTfs = sym.timeframes || [];

              return (
                <div
                  key={sym.code}
                  className={`watchlist-item-row ${isSelectedSymbol ? 'selected' : ''}`}
                  onClick={() => {
                    const defaultTf = availableTfs[0] || { code: `${sym.code}_5`, name: '5m', minutes: 5 };
                    onSelectAsset(sym.code, defaultTf.code, defaultTf.name, defaultTf.minutes);
                    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                      onToggleOpen();
                    }
                  }}
                  title={`Click để tải ${sym.name} vào Khung #${targetSlotIndex + 1}`}
                >
                  {/* Favorite Star Button */}
                  <button
                    className={`fav-star-btn ${isFav ? 'starred' : ''}`}
                    onClick={(e) => toggleFavorite(sym.code, e)}
                    title={isFav ? 'Bỏ khỏi yêu thích' : 'Thêm vào danh sách yêu thích'}
                  >
                    ★
                  </button>

                  {/* Asset Icon */}
                  <div className="asset-icon-box">
                    {sym.image ? (
                      <img
                        src={sym.image.split(';')[0]}
                        alt={sym.name}
                        className="asset-icon-img"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="asset-icon-fallback">{sym.code.slice(0, 2)}</div>
                    )}
                  </div>

                  {/* Symbol Details */}
                  <div className="asset-info-col">
                    <div className="symbol-code-row">
                      <span className="symbol-code-text">{sym.code}</span>
                      {isSelectedSymbol && <span className="active-badge">Đang mở</span>}
                    </div>
                    <div className="symbol-name-text" title={sym.name}>
                      {sym.name}
                    </div>
                  </div>

                  {/* Price & Timeframes Quick Pills */}
                  <div className="asset-action-col">
                    {sym.price && (
                      <span className="asset-price-text">{sym.price}</span>
                    )}
                    <div className="item-tf-pills">
                      {availableTfs.map((tf) => {
                        const isThisTfActive = isSelectedSymbol && tf.code === currentTimeframeCode;
                        return (
                          <button
                            key={tf.code}
                            className={`item-tf-btn ${isThisTfActive ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectAsset(sym.code, tf.code, tf.name, tf.minutes);
                              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                                onToggleOpen();
                              }
                            }}
                            title={`Tải khung ${tf.name}`}
                          >
                            {tf.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredSymbols.length === 0 && (
              <div className="watchlist-empty-state">
                <p>Không tìm thấy mã tài sản nào.</p>
                {activeCategory === '⭐ Yêu thích' && (
                  <span className="empty-hint">Bấm vào biểu tượng ngôi sao ★ ở mỗi mã để thêm vào danh sách yêu thích.</span>
                )}
              </div>
            )}
          </div>

          {/* Drawer Footer Bar */}
          <div className="watchlist-drawer-footer">
            <span className="footer-count">
              Hiển thị {filteredSymbols.length}/{ALL_SYMBOLS.length} mã
            </span>
            <button className="footer-collapse-btn" onClick={onToggleOpen}>
              <span>Thu gọn</span>
              <span>⮞</span>
            </button>
          </div>
        </aside>
      )}

      {/* 2. PERSISTENT RIGHT TOOLBAR STRIP (ALWAYS VISIBLE) */}
      <div className="tv-right-toolbar-strip">
        {/* Toggle Watchlist Button */}
        <button
          className={`right-strip-btn ${isOpen ? 'active' : ''}`}
          onClick={onToggleOpen}
          title={isOpen ? 'Đóng Watchlist & Tài sản' : 'Mở Watchlist & Tất cả tài sản'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 9l-5 5-4-4-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="strip-btn-label">Markets</span>
        </button>

        {/* Favorite Filter Shortcut */}
        <button
          className={`right-strip-btn ${isOpen && activeCategory === '⭐ Yêu thích' ? 'active' : ''}`}
          onClick={() => {
            if (!isOpen) onToggleOpen();
            setActiveCategory('⭐ Yêu thích');
          }}
          title="Xem danh sách Yêu thích ⭐"
        >
          <span style={{ fontSize: 16, color: favorites.length > 0 ? '#FFEB3B' : 'inherit' }}>★</span>
          <span className="strip-btn-label">Fav ({favorites.length})</span>
        </button>

        {/* Targeted Slot Quick Indicator Badge */}
        <div
          className="right-strip-slot-badge"
          title={`Đang nhắm tới Khung #${targetSlotIndex + 1}`}
          onClick={() => {
            if (!isOpen) onToggleOpen();
          }}
        >
          <span className="slot-num">#{targetSlotIndex + 1}</span>
          <span className="slot-lbl">Slot</span>
        </div>

        {/* Bottom Expand / Collapse Toggle Chevron */}
        <button
          className="right-strip-toggle-arrow"
          onClick={onToggleOpen}
          title={isOpen ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
        >
          {isOpen ? '⮞' : '⮜'}
        </button>
      </div>

      <style jsx>{`
        .tv-right-sidebar-container {
          display: flex;
          height: 100%;
          flex-shrink: 0;
          z-index: 40;
          user-select: none;
          background: #131722;
          border-left: 1px solid #1e222d;
          box-shadow: -4px 0 16px rgba(0, 0, 0, 0.25);
          position: relative;
        }

        /* 1. Watchlist Drawer Panel */
        .tv-watchlist-drawer {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #131722;
          border-right: 1px solid #1e222d;
          overflow: hidden;
          position: relative;
          transition: width 0.05s ease-out;
        }

        /* Resizer handle on left edge */
        .drawer-resizer-handle {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 5px;
          cursor: ew-resize;
          z-index: 50;
          background: transparent;
          transition: background 0.2s;
        }

        .drawer-resizer-handle:hover,
        .drawer-resizer-handle.active {
          background: #2962FF;
          box-shadow: 0 0 8px rgba(41, 98, 255, 0.6);
        }

        .watchlist-drawer-header {
          padding: 12px 14px 10px;
          border-bottom: 1px solid #1e222d;
          background: #181d2a;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .drawer-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .drawer-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #E9E6E7;
          letter-spacing: 0.2px;
        }

        .drawer-title svg {
          color: #6B7C98;
        }

        .drawer-action-icon-btn {
          background: #202636;
          border: 1px solid #2e374d;
          color: #a0aec0;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 3px 8px;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .drawer-action-icon-btn:hover {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
        }

        .drawer-close-btn {
          background: none;
          border: none;
          color: #787b86;
          font-size: 14px;
          cursor: pointer;
          padding: 3px 6px;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .drawer-close-btn:hover {
          background: #252a38;
          color: #ffffff;
        }

        /* Target Slot Card */
        .target-slot-card {
          background: rgba(107, 124, 152, 0.12);
          border: 1px solid rgba(107, 124, 152, 0.3);
          border-radius: 4px;
          padding: 6px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .target-slot-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          color: #a0aec0;
        }

        .slot-highlight {
          color: #00E5FF;
          font-weight: 700;
          background: rgba(0, 229, 255, 0.12);
          padding: 1px 6px;
          border-radius: 3px;
        }

        .slot-chips-row {
          display: flex;
          gap: 4px;
        }

        .slot-chip-btn {
          flex: 1;
          background: #1e222d;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #787b86;
          font-size: 10px;
          font-weight: 600;
          padding: 3px 0;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .slot-chip-btn:hover {
          background: #262b3a;
          color: #ffffff;
        }

        .slot-chip-btn.active {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
          box-shadow: 0 0 6px rgba(41, 98, 255, 0.4);
        }

        /* Search Input */
        .watchlist-search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 10px;
          color: #787b86;
          pointer-events: none;
        }

        .watchlist-search-input {
          width: 100%;
          background: #0f121a;
          border: 1px solid #252a38;
          border-radius: 4px;
          color: #ffffff;
          font-size: 12px;
          padding: 7px 28px 7px 30px;
          outline: none;
          transition: all 0.15s;
        }

        .watchlist-search-input:focus {
          border-color: #6B7C98;
          background: #131722;
          box-shadow: 0 0 0 2px rgba(107, 124, 152, 0.2);
        }

        .search-clear-btn {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #787b86;
          font-size: 11px;
          cursor: pointer;
          padding: 2px;
        }

        .search-clear-btn:hover {
          color: #ffffff;
        }

        /* Categories Outer Container */
        .categories-outer-box {
          position: relative;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .categories-outer-box.wrap-mode {
          align-items: flex-start;
        }

        .scroll-arrow-btn {
          width: 20px;
          height: 24px;
          background: #181d2a;
          border: 1px solid #252a38;
          color: #787b86;
          font-size: 16px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 3px;
          flex-shrink: 0;
          opacity: 0.3;
          pointer-events: none;
          transition: all 0.15s;
        }

        .scroll-arrow-btn.visible {
          opacity: 1;
          pointer-events: auto;
          color: #d1d4dc;
        }

        .scroll-arrow-btn:hover {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
        }

        .watchlist-categories-container {
          flex: 1;
          display: flex;
          gap: 5px;
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #252a38 transparent;
          padding: 2px 0 4px;
        }

        .watchlist-categories-container.wrap {
          flex-wrap: wrap;
          overflow-x: visible;
          max-height: 90px;
          overflow-y: auto;
        }

        .watchlist-categories-container.nowrap {
          flex-wrap: nowrap;
        }

        .category-pill {
          background: #181d2a;
          border: 1px solid #252a38;
          color: #a0aec0;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .category-pill:hover {
          background: #202636;
          color: #ffffff;
          border-color: #3b445c;
        }

        .category-pill.active {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
          box-shadow: 0 0 6px rgba(41, 98, 255, 0.4);
        }

        /* Items List */
        .watchlist-items-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .watchlist-items-list::-webkit-scrollbar {
          width: 5px;
        }

        .watchlist-items-list::-webkit-scrollbar-thumb {
          background: #252a38;
          border-radius: 3px;
        }

        .watchlist-item-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          background: #151924;
          border: 1px solid #1e222d;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .watchlist-item-row:hover {
          background: #1c2232;
          border-color: #2b3245;
          transform: translateX(-1px);
        }

        .watchlist-item-row.selected {
          background: rgba(41, 98, 255, 0.12);
          border-color: rgba(41, 98, 255, 0.45);
          box-shadow: inset 3px 0 0 #2962FF;
        }

        .fav-star-btn {
          background: none;
          border: none;
          color: #4a5568;
          font-size: 15px;
          cursor: pointer;
          padding: 0;
          transition: transform 0.15s, color 0.15s;
          line-height: 1;
        }

        .fav-star-btn:hover {
          transform: scale(1.2);
          color: #FFEB3B;
        }

        .fav-star-btn.starred {
          color: #FFEB3B;
          text-shadow: 0 0 6px rgba(255, 235, 59, 0.5);
        }

        .asset-icon-box {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          overflow: hidden;
          background: #202533;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .asset-icon-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .asset-icon-fallback {
          font-size: 9px;
          font-weight: 700;
          color: #CBB193;
        }

        .asset-info-col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .symbol-code-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .symbol-code-text {
          font-size: 12.5px;
          font-weight: 700;
          color: #ffffff;
        }

        .watchlist-item-row.selected .symbol-code-text {
          color: #FFEB3B;
        }

        .active-badge {
          font-size: 8.5px;
          background: rgba(0, 230, 118, 0.15);
          color: #00E676;
          padding: 1px 5px;
          border-radius: 2px;
          font-weight: 600;
        }

        .symbol-name-text {
          font-size: 10.5px;
          color: #787b86;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .asset-action-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }

        .asset-price-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          font-weight: 700;
          color: #00E676;
        }

        .item-tf-pills {
          display: flex;
          gap: 3px;
        }

        .item-tf-btn {
          background: #1e222d;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #8c92a4;
          font-size: 9.5px;
          font-weight: 600;
          padding: 2px 5px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .item-tf-btn:hover {
          background: #2b3245;
          color: #ffffff;
        }

        .item-tf-btn.active {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
        }

        .watchlist-empty-state {
          padding: 30px 16px;
          text-align: center;
          color: #787b86;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .empty-hint {
          font-size: 11px;
          color: #555c6d;
        }

        /* Footer */
        .watchlist-drawer-footer {
          padding: 10px 14px;
          background: #181d2a;
          border-top: 1px solid #1e222d;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
        }

        .footer-count {
          color: #787b86;
        }

        .footer-collapse-btn {
          background: none;
          border: none;
          color: #6B7C98;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 3px;
          transition: all 0.15s;
        }

        .footer-collapse-btn:hover {
          background: #202636;
          color: #ffffff;
        }

        /* 2. Persistent Right Toolbar Strip (42px) */
        .tv-right-toolbar-strip {
          width: 42px;
          height: 100%;
          background: #131722;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0;
          gap: 8px;
          flex-shrink: 0;
        }

        .right-strip-btn {
          width: 34px;
          height: 48px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          color: #787b86;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 2px;
        }

        .right-strip-btn:hover {
          color: #d1d4dc;
          background: #1e222d;
        }

        .right-strip-btn.active {
          background: rgba(41, 98, 255, 0.18);
          color: #2962FF;
          border-color: rgba(41, 98, 255, 0.4);
        }

        .strip-btn-label {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: -0.2px;
          text-transform: uppercase;
        }

        .right-strip-slot-badge {
          margin-top: auto;
          margin-bottom: 4px;
          background: #181d2a;
          border: 1px solid #252a38;
          border-radius: 4px;
          padding: 4px 2px;
          width: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: all 0.15s;
        }

        .right-strip-slot-badge:hover {
          border-color: #00E5FF;
        }

        .slot-num {
          font-size: 11px;
          font-weight: 800;
          color: #00E5FF;
          line-height: 1;
        }

        .slot-lbl {
          font-size: 7.5px;
          color: #787b86;
          text-transform: uppercase;
        }

        .right-strip-toggle-arrow {
          width: 32px;
          height: 28px;
          background: #1e222d;
          border: 1px solid #2b3245;
          border-radius: 4px;
          color: #787b86;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }

        .right-strip-toggle-arrow:hover {
          background: #2962FF;
          color: #ffffff;
          border-color: #2962FF;
        }

        /* 3. Mobile Backdrop & Drawer Responsive Mode */
        .tv-watchlist-backdrop {
          display: none;
        }

        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideInDrawer {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @media (max-width: 768px) {
          .tv-watchlist-backdrop {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(3px);
            z-index: 1200;
            animation: fadeInBackdrop 0.2s ease-out;
          }

          .tv-right-sidebar-container {
            position: relative;
            z-index: 40;
          }

          .tv-right-sidebar-container.expanded .tv-watchlist-drawer {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(88vw, 360px) !important;
            max-width: 100vw;
            z-index: 1250;
            box-shadow: -10px 0 35px rgba(0, 0, 0, 0.9);
            animation: slideInDrawer 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            border-left: 1px solid #2e374d;
          }

          .tv-right-toolbar-strip {
            width: 36px;
            padding: 4px 0;
            gap: 6px;
          }

          .right-strip-btn {
            width: 30px;
            height: 42px;
          }

          .strip-btn-label {
            font-size: 7.5px;
          }

          .right-strip-slot-badge {
            width: 28px;
            padding: 3px 1px;
          }

          .right-strip-toggle-arrow {
            width: 28px;
            height: 26px;
          }

          .watchlist-drawer-header {
            padding: 10px 12px 8px;
          }

          .watchlist-item-row {
            padding: 10px 12px;
          }
        }
      `}</style>
    </div>
  );
}
