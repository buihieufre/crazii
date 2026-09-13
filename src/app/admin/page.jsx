'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  async function fetchStats() {
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/admin/dashboard-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  async function handleForceRefreshToken() {
    setRefreshing(true);
    setActionMsg(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/refresh-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setActionMsg({ type: 'success', text: '⚡ Làm mới Crazii Token thành công! Đã tự động lưu vào Database.' });
        await fetchStats();
      } else {
        setActionMsg({ type: 'error', text: data.message || 'Lỗi khi làm mới token' });
      }
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
    } finally {
      setRefreshing(false);
    }
  }

  function formatTime(isoStr) {
    if (!isoStr) return '--';
    try {
      return new Date(isoStr).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoStr;
    }
  }

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#8899A6' }}>
        <div style={{
          width: '28px',
          height: '28px',
          border: '2px solid rgba(203, 177, 147, 0.2)',
          borderTopColor: '#CBB193',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '12px'
        }} />
        <span style={{ fontSize: '13px' }}>Đang nạp dữ liệu thống kê hệ thống...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#FFFFFF', margin: 0, letterSpacing: '-0.3px' }}>
            Tổng Quan Hệ Thống
          </h1>
          <p style={{ fontSize: '13px', color: '#8899A6', margin: '4px 0 0 0' }}>
            Giám sát thời gian thực người dùng, gói cước, giao dịch và kết nối máy chủ Crazii.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => { setLoading(true); fetchStats(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: '#121827',
              border: '1px solid #1E283D',
              borderRadius: '6px',
              color: '#CBD5E1',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <span>🔄</span>
            <span>Làm mới dữ liệu</span>
          </button>

          <button
            onClick={handleForceRefreshToken}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: '#CBB193',
              border: 'none',
              borderRadius: '6px',
              color: '#0B0E14',
              fontSize: '12.5px',
              fontWeight: '700',
              cursor: refreshing ? 'not-allowed' : 'pointer'
            }}
          >
            <span>{refreshing ? '⏳' : '⚡'}</span>
            <span>{refreshing ? 'Đang làm mới...' : 'Force Refresh Token'}</span>
          </button>
        </div>
      </div>

      {/* Alert Message */}
      {actionMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: actionMsg.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${actionMsg.type === 'success' ? '#22C55E' : '#EF4444'}`,
          color: actionMsg.type === 'success' ? '#4ADE80' : '#F87171'
        }}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 4 Shadcn Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Users */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#8899A6' }}>TỔNG SỐ NGƯỜI DÙNG</span>
            <span style={{ fontSize: '18px' }}>👥</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>
            {stats?.totalUsers || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#8899A6', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#4ADE80', fontWeight: '700' }}>{stats?.activeUsers || 0}</span>
            <span>đang có gói hoạt động</span>
          </div>
        </div>

        {/* Card 2: Active Subscriptions */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#8899A6' }}>GÓI ACTIVE / TRIAL</span>
            <span style={{ fontSize: '18px' }}>💎</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#4ADE80', fontFamily: "'JetBrains Mono', monospace" }}>
            {stats?.activeUsers || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#8899A6', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#CBB193', fontWeight: '700' }}>{stats?.trialUsers || 0}</span>
            <span>tài khoản dùng thử</span>
          </div>
        </div>

        {/* Card 3: Revenue */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#8899A6' }}>DOANH THU ƯỚC TÍNH</span>
            <span style={{ fontSize: '18px' }}>💳</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#CBB193', fontFamily: "'JetBrains Mono', monospace" }}>
            ${stats?.totalRevenue || 0} <span style={{ fontSize: '13px', fontWeight: '700', color: '#8899A6' }}>USDT</span>
          </div>
          <div style={{ fontSize: '12px', color: '#8899A6' }}>
            {stats?.finishedOrders || 0} đơn hoàn tất (finished) / {stats?.totalOrders || 0} tổng đơn
          </div>
        </div>

        {/* Card 4: Token Status */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#8899A6' }}>CRAZII TOKEN & PROXY</span>
            <span style={{ fontSize: '18px' }}>🔑</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: stats?.tokens?.accessValid ? '#10B981' : '#EF4444'
            }} />
            <span style={{ color: stats?.tokens?.accessValid ? '#4ADE80' : '#F87171' }}>
              {stats?.tokens?.accessValid ? 'Access Token Valid' : 'Token Expired'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#8899A6' }}>
            Refresh Token: {stats?.tokens?.refreshSecondsLeft ? `${Math.floor(stats.tokens.refreshSecondsLeft / 3600)}h còn lại` : 'N/A'} • DB Synced 24/7
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        <Link
          href="/admin/users"
          style={{
            background: '#0D121F',
            border: '1px solid #1A2234',
            borderRadius: '8px',
            padding: '16px 18px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#CBB193'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1A2234'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '20px', padding: '8px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
              👥
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9' }}>Quản trị Users</div>
              <div style={{ fontSize: '12px', color: '#8899A6' }}>Tìm kiếm, cấp gói, kick thiết bị, phân quyền</div>
            </div>
          </div>
          <span style={{ color: '#8899A6', fontSize: '16px' }}>→</span>
        </Link>

        <Link
          href="/admin/subscriptions"
          style={{
            background: '#0D121F',
            border: '1px solid #1A2234',
            borderRadius: '8px',
            padding: '16px 18px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#CBB193'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1A2234'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '20px', padding: '8px', borderRadius: '6px', background: 'rgba(203, 177, 147, 0.15)', color: '#CBB193' }}>
              🎲
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9' }}>Tạo Trial 1-Click & Đơn Hàng</div>
              <div style={{ fontSize: '12px', color: '#8899A6' }}>Tạo nhanh tài khoản dùng thử, quản lý đơn USDT</div>
            </div>
          </div>
          <span style={{ color: '#8899A6', fontSize: '16px' }}>→</span>
        </Link>

        <Link
          href="/bot-config"
          style={{
            background: '#0D121F',
            border: '1px solid #1A2234',
            borderRadius: '8px',
            padding: '16px 18px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#CBB193'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1A2234'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '20px', padding: '8px', borderRadius: '6px', background: 'rgba(0, 136, 204, 0.1)', color: '#0088cc' }}>
              🤖
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9' }}>Telegram Signal Bot</div>
              <div style={{ fontSize: '12px', color: '#8899A6' }}>Cấu hình bot báo tín hiệu tự động kênh Telegram</div>
            </div>
          </div>
          <span style={{ color: '#8899A6', fontSize: '16px' }}>→</span>
        </Link>
      </div>

      {/* Two Tables Grid: Recent Users & Recent Orders */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '20px'
      }}>
        {/* Recent Users Table */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#FFFFFF', margin: 0 }}>
                Người Dùng Mới Nhất
              </h3>
              <span style={{ fontSize: '12px', color: '#8899A6' }}>Đăng ký gần đây trong hệ thống</span>
            </div>
            <Link href="/admin/users" style={{ fontSize: '12px', color: '#CBB193', textDecoration: 'none', fontWeight: '700' }}>
              Xem tất cả →
            </Link>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1A2234', color: '#8899A6', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Email / Tên</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Vai trò</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Trạng thái gói</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentUsers || []).map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                    <td style={{ padding: '10px 6px' }}>
                      <div style={{ fontWeight: '600', color: '#F1F5F9' }}>{u.email}</div>
                      <div style={{ fontSize: '11px', color: '#6B7C98' }}>{u.name || '--'}</div>
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: u.isDisabled ? 'rgba(239, 68, 68, 0.15)' : (u.isAdmin ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)'),
                        color: u.isDisabled ? '#F87171' : (u.isAdmin ? '#F59E0B' : '#94A3B8')
                      }}>
                        {u.isDisabled ? 'BỊ KHÓA' : (u.isAdmin ? 'ADMIN' : 'USER')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: u.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                        color: u.isActive ? '#4ADE80' : '#F87171'
                      }}>
                        {u.isActive ? 'ACTIVE' : 'CHƯA KÍCH HOẠT'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 6px', color: '#8899A6', fontSize: '11.5px' }}>
                      {formatTime(u.created_at)}
                    </td>
                  </tr>
                ))}
                {(!stats?.recentUsers || stats.recentUsers.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#6B7C98' }}>
                      Chưa có dữ liệu người dùng.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Orders Table */}
        <div style={{
          background: '#0D121F',
          border: '1px solid #1A2234',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#FFFFFF', margin: 0 }}>
                Đơn Hàng Gần Nhất
              </h3>
              <span style={{ fontSize: '12px', color: '#8899A6' }}>Giao dịch thanh toán NOWPayments</span>
            </div>
            <Link href="/admin/subscriptions" style={{ fontSize: '12px', color: '#CBB193', textDecoration: 'none', fontWeight: '700' }}>
              Xem tất cả →
            </Link>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1A2234', color: '#8899A6', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Mã đơn</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Email</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Số tiền</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Trạng thái</th>
                  <th style={{ padding: '8px 6px', fontWeight: '600' }}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentOrders || []).map((o) => {
                  const statusClean = (o.status || '').toLowerCase().trim();
                  const isFinished = statusClean === 'finished';
                  const isWaiting = statusClean === 'waiting' || statusClean === 'pending';
                  const isConfirming = statusClean === 'confirming' || statusClean === 'confirmed';
                  return (
                    <tr key={o.id || o.order_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                      <td style={{ padding: '10px 6px', fontFamily: "'JetBrains Mono', monospace", color: '#CBB193', fontSize: '11.5px' }}>
                        {o.order_id}
                      </td>
                      <td style={{ padding: '10px 6px', color: '#F1F5F9' }}>
                        {o.email || '--'}
                      </td>
                      <td style={{ padding: '10px 6px', fontWeight: '700', color: '#FFFFFF' }}>
                        ${o.amount || '45.00'} <span style={{ fontSize: '10px', color: '#8899A6' }}>{o.currency || 'USDT'}</span>
                      </td>
                      <td style={{ padding: '10px 6px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: isFinished
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isConfirming
                              ? 'rgba(59, 130, 246, 0.15)'
                              : isWaiting
                                ? 'rgba(234, 179, 8, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                          color: isFinished
                            ? '#4ADE80'
                            : isConfirming
                              ? '#60A5FA'
                              : isWaiting
                                ? '#FACC15'
                                : '#F87171',
                          border: `1px solid ${isFinished
                              ? 'rgba(34, 197, 94, 0.3)'
                              : isConfirming
                                ? 'rgba(59, 130, 246, 0.3)'
                                : isWaiting
                                  ? 'rgba(234, 179, 8, 0.3)'
                                  : 'rgba(239, 68, 68, 0.3)'
                            }`
                        }}>
                          {o.status || 'pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 6px', color: '#8899A6', fontSize: '11.5px' }}>
                        {formatTime(o.created_at)}
                      </td>
                    </tr>
                  );
                })}
                {(!stats?.recentOrders || stats.recentOrders.length === 0) && (
                  <tr>
                    <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#6B7C98' }}>
                      Chưa có đơn hàng nào được ghi nhận.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
