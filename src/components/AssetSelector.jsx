'use client';

import React, { useState } from 'react';
import { ASSETS_DATA, ALL_SYMBOLS } from '@/lib/assets-data';

export default function AssetSelector({
  isOpen,
  onClose,
  currentSymbolCode,
  currentTimeframeCode,
  targetSlotIndex = 0,
  activeLayout = '1',
  onSelectAsset,
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const categories = ['All', ...ASSETS_DATA.map((c) => c.name)];

  const filteredSymbols = ALL_SYMBOLS.filter((sym) => {
    const matchesCat =
      activeCategory === 'All' ||
      ASSETS_DATA.find((c) => c.name === activeCategory)?.symbols.some((s) => s.code === sym.code);
    const matchesSearch =
      !searchQuery.trim() ||
      sym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sym.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          className="modal-header"
          style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}
        >
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊 Markets & Assets Watchlist</span>
            {activeLayout !== '1' && (
              <span
                style={{
                  fontSize: 11,
                  background: 'rgba(0, 229, 255, 0.15)',
                  color: '#00E5FF',
                  border: '1px solid rgba(0, 229, 255, 0.4)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                }}
              >
                Khung #{targetSlotIndex + 1}
              </span>
            )}
          </h3>
          <button className="btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Search & Categories */}
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            className="input-field"
            style={{ marginBottom: 8 }}
            placeholder="🔍 Tìm kiếm mã tài sản (Vàng, BTC, Dầu, Cổ phiếu...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />

          <div
            style={{
              display: 'flex',
              gap: 4,
              overflowX: 'auto',
              paddingBottom: 6,
              scrollbarWidth: 'none',
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                className={`tf-btn ${activeCategory === cat ? 'active' : ''}`}
                style={{ whiteSpace: 'nowrap', fontSize: 10.5, padding: '3px 8px' }}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Asset List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {filteredSymbols.map((sym) => {
            const isSelected = sym.code === currentSymbolCode;
            return (
              <div
                key={sym.code}
                style={{
                  background: isSelected ? 'rgba(41, 98, 255, 0.15)' : '#0f121a',
                  border: isSelected ? '1px solid #2962FF' : '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const defaultTf = sym.timeframes[0];
                  onSelectAsset(sym.code, defaultTf.code, defaultTf.name, defaultTf.minutes);
                  onClose();
                }}
              >
                {/* Left: Icon & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  {sym.image && (
                    <img
                      src={sym.image.split(';')[0]}
                      alt={sym.name}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        background: '#202533',
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: isSelected ? '#FFEB3B' : '#ffffff',
                      }}
                    >
                      {sym.code}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        maxWidth: 240,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {sym.name}
                    </div>
                  </div>
                </div>

                {/* Right: Price & Timeframe Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontFamily: 'JetBrains Mono',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#00E676',
                      }}
                    >
                      {sym.price}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 3 }}>
                    {sym.timeframes.map((tf) => {
                      const isTfSelected = tf.code === currentTimeframeCode;
                      return (
                        <button
                          key={tf.code}
                          className={`tf-btn ${isTfSelected ? 'active' : ''}`}
                          style={{ fontSize: 9.5, padding: '2px 5px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAsset(sym.code, tf.code, tf.name, tf.minutes);
                            onClose();
                          }}
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
            <div
              style={{
                textAlign: 'center',
                padding: 24,
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              Không tìm thấy tài sản nào phù hợp.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
