'use client';

import React from 'react';

export default function Loading() {
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0B0E14',
      color: '#E9E6E7',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999999,
      userSelect: 'none'
    }}>
      {/* Ambient background glow */}
      <div style={{
        position: 'absolute',
        width: '320px',
        height: '320px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(203, 177, 147, 0.08) 0%, rgba(11, 14, 20, 0) 70%)',
        pointerEvents: 'none'
      }} />

      {/* Brand Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '28px',
        padding: '8px 18px',
        background: '#121620',
        border: '1px solid #222938',
        borderRadius: '4px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
          color: '#0B0E14',
          fontWeight: '900',
          fontSize: '14px',
          letterSpacing: '2px',
          padding: '4px 10px',
          borderRadius: '2px'
        }}>
          TRADEWH
        </div>
        <span style={{ fontSize: '12px', color: '#8899A6', fontWeight: '700', letterSpacing: '1.5px' }}>
          PRO TERMINAL
        </span>
      </div>

      {/* Spinner with Gold Accent */}
      <div style={{
        position: 'relative',
        width: '44px',
        height: '44px',
        marginBottom: '20px'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          border: '3px solid rgba(203, 177, 147, 0.15)',
          borderTopColor: '#CBB193',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>

      {/* Loading Text */}
      <div style={{
        fontSize: '13px',
        color: '#CBB193',
        fontWeight: '600',
        letterSpacing: '0.5px',
        marginBottom: '6px'
      }}>
        Đang tải dữ liệu biểu đồ...
      </div>
      <div style={{
        fontSize: '11px',
        color: '#6B7C98',
        letterSpacing: '0.5px'
      }}>
        Hệ thống phân tích kỹ thuật thời gian thực
      </div>
    </div>
  );
}
