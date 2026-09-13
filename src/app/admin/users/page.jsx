'use client';

import React, { useState, useEffect, useCallback } from 'react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState('all');

  // Modal / Action states
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalAction, setModalAction] = useState(null); // 'grant' | 'confirm_disable' | 'confirm_enable'
  const [grantDays, setGrantDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search,
        role: roleFilter,
        status: statusFilter,
        accountStatus: accountStatusFilter
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUsers(data.users || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, accountStatusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Execute quick action (kick device, toggle role, etc.)
  async function handleQuickAction(userId, action, extra = {}) {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
      const res = await fetch('/api/admin/users/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, action, ...extra })
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', text: data.message });
        await fetchUsers();
      } else {
        setFeedback({ type: 'error', text: data.message || 'Thao tác không thành công.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
    } finally {
      setIsSubmitting(false);
      setSelectedUser(null);
      setModalAction(null);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
            Quản Trị Người Dùng & Thiết Bị
          </h1>
          <p style={{ fontSize: '13px', color: '#8899A6', margin: '4px 0 0 0' }}>
            Xem danh sách {total} tài khoản trong cơ sở dữ liệu, quản lý gói cước và giải phóng thiết bị đăng nhập.
          </p>
        </div>

        <button
          onClick={() => fetchUsers()}
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
          <span>Tải lại</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: feedback.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${feedback.type === 'success' ? '#22C55E' : '#EF4444'}`,
          color: feedback.type === 'success' ? '#4ADE80' : '#F87171'
        }}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div style={{
        background: '#0D121F',
        border: '1px solid #1A2234',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 260px', background: '#121827', border: '1px solid #1E283D', borderRadius: '6px', padding: '0 12px' }}>
          <span style={{ color: '#64748B' }}>🔍</span>
          <input
            type="text"
            placeholder="Tìm theo email hoặc tên..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '9px 0',
              background: 'transparent',
              border: 'none',
              color: '#F1F5F9',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#8899A6', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        {/* Filters Group */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Account Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
            <span style={{ color: '#8899A6' }}>Tài khoản:</span>
            <select
              value={accountStatusFilter}
              onChange={(e) => { setAccountStatusFilter(e.target.value); setPage(1); }}
              style={{
                background: '#121827',
                border: '1px solid #1E283D',
                borderRadius: '6px',
                color: '#E2E8F0',
                padding: '8px 10px',
                fontSize: '12.5px',
                outline: 'none'
              }}
            >
              <option value="all">Tất cả tài khoản</option>
              <option value="active">🟢 Đang hoạt động</option>
              <option value="disabled">🔴 Đã vô hiệu hóa</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
            <span style={{ color: '#8899A6' }}>Gói cước:</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{
                background: '#121827',
                border: '1px solid #1E283D',
                borderRadius: '6px',
                color: '#E2E8F0',
                padding: '8px 10px',
                fontSize: '12.5px',
                outline: 'none'
              }}
            >
              <option value="all">Tất cả gói cước</option>
              <option value="active">Active (Đang hoạt động)</option>
              <option value="expired">Đã hết hạn</option>
              <option value="none">Chưa kích hoạt</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Data Table */}
      <div style={{
        background: '#0D121F',
        border: '1px solid #1A2234',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0B0E18', borderBottom: '1px solid #1A2234', color: '#8899A6' }}>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Tài khoản</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Trạng thái TK</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Gói cước & Hạn dùng</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Thiết bị</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Đăng ký</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#8899A6' }}>
                    <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid rgba(203,177,147,0.2)', borderTopColor: '#CBB193', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: '8px' }} />
                    Đang tải danh sách người dùng...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                    Không tìm thấy người dùng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isUserActive = u.isActive;
                  const hasDevice = Boolean(u.current_device_id);
                  const isUserDisabled = u.isDisabled || u.role === 'disabled';
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                      {/* Email / Name */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isUserDisabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(203, 177, 147, 0.15)',
                            color: isUserDisabled ? '#F87171' : '#CBB193',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            fontWeight: '700',
                            flexShrink: 0
                          }}>
                            {u.email ? u.email[0].toUpperCase() : 'U'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: '600', color: isUserDisabled ? '#94A3B8' : '#F8FAFC', wordBreak: 'break-all' }}>
                              {u.email}
                              {isUserDisabled && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#F87171' }}>(Vô hiệu)</span>}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748B' }}>{u.name || 'Chưa đặt tên'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Account Disabled / Active Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {isUserDisabled ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#F87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)'
                          }}>
                            🔴 BỊ KHÓA
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#4ADE80',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          }}>
                            🟢 HOẠT ĐỘNG
                          </span>
                        )}
                      </td>

                      {/* Subscription Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '700',
                              background: isUserActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                              color: isUserActive ? '#4ADE80' : '#F87171'
                            }}>
                              {u.isAdmin ? 'VĨNH VIỄN (ADMIN)' : isUserActive ? `ACTIVE (CÒN ${u.daysLeft} NGÀY)` : 'CHƯA KÍCH HOẠT'}
                            </span>
                          </div>
                          {u.subscription_expiry && !u.isAdmin && (
                            <span style={{ fontSize: '11px', color: '#64748B' }}>
                              Hết hạn: {formatTime(u.subscription_expiry)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Device Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {hasDevice ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              background: 'rgba(59, 130, 246, 0.1)',
                              color: '#60A5FA',
                              border: '1px solid rgba(59, 130, 246, 0.2)'
                            }} title={`Device ID: ${u.current_device_id}`}>
                              🔒 {u.current_device_id.slice(0, 10)}...
                            </span>
                            <button
                              onClick={() => handleQuickAction(u.id, 'kick_device')}
                              title="Giải phóng thiết bị (Cho phép user đăng nhập máy khác)"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#F87171',
                                cursor: 'pointer',
                                fontSize: '12px',
                                padding: '2px 4px'
                              }}
                            >
                              🔓 Kick
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                            Trống (Chưa khóa máy)
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td style={{ padding: '14px 16px', color: '#8899A6', fontSize: '12px' }}>
                        {formatTime(u.created_at)}
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {/* Grant Subscription Button */}
                          <button
                            onClick={() => { setSelectedUser(u); setModalAction('grant'); }}
                            title="Cấp / Gia hạn gói cước"
                            style={{
                              padding: '5px 10px',
                              background: 'rgba(203, 177, 147, 0.15)',
                              border: '1px solid rgba(203, 177, 147, 0.3)',
                              color: '#CBB193',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            + Cấp Gói
                          </button>

                          {/* Toggle Disable Button (NO DELETE) */}
                          {isUserDisabled ? (
                            <button
                              onClick={() => { setSelectedUser(u); setModalAction('confirm_enable'); }}
                              title="Mở khóa tài khoản (cho phép đăng nhập lại)"
                              style={{
                                padding: '5px 10px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                color: '#4ADE80',
                                borderRadius: '4px',
                                fontSize: '11.5px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              🔓 Mở Khóa
                            </button>
                          ) : (
                            <button
                              onClick={() => { setSelectedUser(u); setModalAction('confirm_disable'); }}
                              title="Vô hiệu hóa tài khoản (chặn không cho đăng nhập)"
                              style={{
                                padding: '5px 10px',
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#F87171',
                                borderRadius: '4px',
                                fontSize: '11.5px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              🔒 Khóa TK
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #1A2234',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12.5px',
          color: '#8899A6'
        }}>
          <div>
            Hiển thị trang {page} / {totalPages} (Tổng {total} tài khoản)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                padding: '5px 12px',
                background: page <= 1 ? '#0F131D' : '#121827',
                border: '1px solid #1E283D',
                borderRadius: '4px',
                color: page <= 1 ? '#475569' : '#CBD5E1',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ← Trang trước
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '5px 12px',
                background: page >= totalPages ? '#0F131D' : '#121827',
                border: '1px solid #1E283D',
                borderRadius: '4px',
                color: page >= totalPages ? '#475569' : '#CBD5E1',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Trang sau →
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: GRANT SUBSCRIPTION                                               */}
      {/* ========================================================================= */}
      {modalAction === 'grant' && selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            background: '#0D121F',
            border: '1px solid #CBB193',
            borderRadius: '8px',
            maxWidth: '460px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                🎁 Cấp Gói Cước Cho User
              </h3>
              <button onClick={() => setModalAction(null)} style={{ background: 'none', border: 'none', color: '#8899A6', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ fontSize: '13px', color: '#CBD5E1', background: '#121827', padding: '10px 14px', borderRadius: '6px', border: '1px solid #1E283D' }}>
              Tài khoản: <strong style={{ color: '#CBB193' }}>{selectedUser.email}</strong>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#8899A6', marginBottom: '8px' }}>
                Chọn số ngày muốn cấp thêm:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {[3, 7, 14, 30, 90, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setGrantDays(d); setCustomDays(''); }}
                    style={{
                      padding: '7px 12px',
                      background: grantDays === d && !customDays ? '#CBB193' : '#121827',
                      color: grantDays === d && !customDays ? '#0B0E14' : '#CBD5E1',
                      border: '1px solid #1E283D',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {d} Ngày
                  </button>
                ))}
              </div>

              <input
                type="number"
                placeholder="Hoặc nhập số ngày khác (VD: 60)"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#F1F5F9',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setModalAction(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#CBD5E1',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  const finalDays = customDays ? parseInt(customDays, 10) : grantDays;
                  handleQuickAction(selectedUser.id, 'grant_subscription', { days: finalDays });
                }}
                style={{
                  flex: 2,
                  padding: '10px',
                  background: '#CBB193',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#0B0E14',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? 'Đang xử lý...' : `Xác nhận cấp ${customDays || grantDays} ngày`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRM DISABLE / ENABLE                                        */}
      {/* ========================================================================= */}
      {(modalAction === 'confirm_disable' || modalAction === 'confirm_enable') && selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            background: '#0D121F',
            border: `1px solid ${modalAction === 'confirm_disable' ? '#EF4444' : '#22C55E'}`,
            borderRadius: '8px',
            maxWidth: '440px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '800',
              color: modalAction === 'confirm_disable' ? '#F87171' : '#4ADE80',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>{modalAction === 'confirm_disable' ? '🔒 Vô Hiệu Hóa Tài Khoản' : '🔓 Mở Khóa Tài Khoản'}</span>
            </h3>

            <p style={{ fontSize: '13.5px', color: '#CBD5E1', lineHeight: '1.5', margin: 0 }}>
              {modalAction === 'confirm_disable' ? (
                <>
                  Bạn có chắc chắn muốn vô hiệu hóa tài khoản <strong style={{ color: '#F87171' }}>{selectedUser.email}</strong>?
                  <br /><br />
                  ⚠️ Người dùng này sẽ bị <strong>ngắt phiên làm việc ngay lập tức</strong> và <strong>không thể đăng nhập</strong> vào hệ thống cho đến khi được mở khóa.
                </>
              ) : (
                <>
                  Mở khóa tài khoản cho <strong style={{ color: '#4ADE80' }}>{selectedUser.email}</strong>?
                  <br /><br />
                  Người dùng sẽ được phép đăng nhập lại bình thường vào hệ thống.
                </>
              )}
            </p>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setModalAction(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#121827',
                  border: '1px solid #1E283D',
                  borderRadius: '6px',
                  color: '#CBD5E1',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleQuickAction(selectedUser.id, 'toggle_disable')}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: modalAction === 'confirm_disable' ? '#EF4444' : '#16A34A',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting
                  ? 'Đang xử lý...'
                  : (modalAction === 'confirm_disable' ? 'Xác Nhận Vô Hiệu Hóa' : 'Xác Nhận Mở Khóa')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
