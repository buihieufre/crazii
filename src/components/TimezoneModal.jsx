'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TIMEZONES, POPULAR_TIMEZONE_IDS, getCurrentTimeInOffset } from '@/lib/timezones';

export default function TimezoneModal({ isOpen, onClose, activeTimezone, onSelectTimezone }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());

  // Update clock every second when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTimeTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered Timezones
  const filteredTimezones = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return TIMEZONES;
    return TIMEZONES.filter((tz) => {
      return (
        tz.id.toLowerCase().includes(q) ||
        tz.label.toLowerCase().includes(q) ||
        tz.cities.toLowerCase().includes(q) ||
        tz.offset.toString().includes(q)
      );
    });
  }, [searchQuery]);

  const popularTimezones = useMemo(() => {
    return POPULAR_TIMEZONE_IDS.map((id) => TIMEZONES.find((t) => t.id === id)).filter(Boolean);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 580, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌐</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: 0.3 }}>
                Chọn Múi Giờ (Timezone)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Đang dùng: <strong style={{ color: '#00E5FF' }}>{activeTimezone?.label || 'UTC+07:00'}</strong> ({getCurrentTimeInOffset(activeTimezone?.offset || 420)})
              </div>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} title="Đóng (Esc)">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden', padding: '16px 20px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: 14 }}>
              🔍
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Tìm theo UTC (VD: +7, -5) hoặc thành phố (Hanoi, New York, Tokyo)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                background: '#151821',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Popular Chips */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ⭐ Múi giờ phổ biến
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {popularTimezones.map((tz) => {
                const isActive = activeTimezone?.id === tz.id;
                return (
                  <button
                    key={tz.id}
                    onClick={() => {
                      onSelectTimezone(tz);
                      onClose();
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11.5,
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: 4,
                      background: isActive ? 'rgba(0, 229, 255, 0.18)' : '#1e222d',
                      color: isActive ? '#00E5FF' : 'var(--text-main)',
                      border: isActive ? '1px solid #00E5FF' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{tz.id}</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>({getCurrentTimeInOffset(tz.offset, false)})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full List */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              🌐 Tất cả múi giờ ({filteredTimezones.length})
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingRight: 4,
                maxHeight: '340px',
              }}
            >
              {filteredTimezones.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Không tìm thấy múi giờ phù hợp với &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredTimezones.map((tz) => {
                  const isActive = activeTimezone?.id === tz.id;
                  const liveTime = getCurrentTimeInOffset(tz.offset);
                  return (
                    <div
                      key={tz.id}
                      onClick={() => {
                        onSelectTimezone(tz);
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: isActive ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        border: isActive ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      className="tz-row-item"
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, marginRight: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 12,
                              fontWeight: 700,
                              color: isActive ? '#00E5FF' : '#ffffff',
                              background: '#151821',
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            {tz.label}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#00E5FF' : 'var(--text-main)' }}>
                            {tz.id}
                          </span>
                          {isActive && (
                            <span style={{ fontSize: 10, background: '#00E5FF', color: '#0b0e14', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>
                              ĐANG CHỌN
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tz.cities}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 12.5,
                            color: isActive ? '#00E5FF' : 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {liveTime}
                        </span>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            border: isActive ? '5px solid #00E5FF' : '1px solid var(--border-color)',
                            background: isActive ? '#0b0e14' : 'transparent',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            💡 Múi giờ sẽ tự động áp dụng lên trục thời gian và crosshair của biểu đồ.
          </span>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '6px 14px', fontSize: 12 }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
