'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  // Clock in VN timezone
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Authentication guard: Cho phép mọi tài khoản đã đăng nhập truy cập quản trị (Bỏ phân cấp role admin)
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = localStorage.getItem('crazii_session_token') || localStorage.getItem('tradewh_session_token');
        if (!token) {
          router.push('/?auth=login');
          return;
        }

        setIsAdmin(true);
        const rawUser = localStorage.getItem('crazii_user');
        if (rawUser) {
          try { setAdminUser(JSON.parse(rawUser)); } catch (e) {}
        } else {
          setAdminUser({ email: 'admin@tradewh.com', name: 'Quản Trị Viên' });
        }
      } catch (err) {
        setIsAdmin(true);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  // Handle Logout
  function handleLogout() {
    localStorage.removeItem('crazii_session_token');
    localStorage.removeItem('tradewh_session_token');
    localStorage.removeItem('crazii_user');
    router.push('/');
  }

  // Navigation Items
  const navItems = [
    {
      label: 'Tổng quan',
      href: '/admin',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      ),
      exact: true
    },
    {
      label: 'Quản trị Users',
      href: '/admin/users',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      label: 'Quản trị Subscriptions',
      href: '/admin/subscriptions',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      )
    },
    {
      label: 'Quản trị Token Crazii',
      href: '/admin/tokens',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
      )
    },
    {
      label: 'Telegram Signal Bot',
      href: '/bot-config',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      )
    },
    {
      label: 'Về Chart Terminal',
      href: '/',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      )
    }
  ];

  function getPageTitle() {
    if (pathname === '/admin') return 'Tổng quan hệ thống';
    if (pathname === '/admin/users') return 'Quản lý người dùng & phiên thiết bị';
    if (pathname === '/admin/subscriptions') return 'Quản lý gói cước & lịch sử thanh toán';
    if (pathname === '/admin/tokens') return 'Quản lý Crazii Token & Upstream Proxy';
    return 'Admin Console';
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#090D16',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#CBB193',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(203, 177, 147, 0.2)',
          borderTopColor: '#CBB193',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '16px'
        }} />
        <p style={{ fontSize: '13px', letterSpacing: '1px', fontWeight: '600' }}>ĐANG XÁC THỰC QUYỀN QUẢN TRỊ...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }



  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090D16',
      color: '#E2E8F0',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      overflowX: 'hidden'
    }}>

      {/* ========================================================================= */}
      {/* SHADCN COLLAPSIBLE SIDEBAR                                                */}
      {/* ========================================================================= */}
      <aside style={{
        width: isSidebarOpen ? '260px' : '76px',
        minHeight: '100vh',
        backgroundColor: '#0D121F',
        borderRight: '1px solid #1A2234',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        flexShrink: 0,
        zIndex: 50,
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '18px 16px',
          borderBottom: '1px solid #1A2234',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarOpen ? 'space-between' : 'center',
          gap: '10px'
        }}>
          {isSidebarOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div style={{
                background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
                color: '#0B0E14',
                fontWeight: '900',
                fontSize: '13px',
                letterSpacing: '1px',
                padding: '4px 8px',
                borderRadius: '4px',
                flexShrink: 0
              }}>
                WH
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#FFFFFF', letterSpacing: '0.5px' }}>
                  TRADEWH
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#CBB193', letterSpacing: '0.5px' }}>
                  ADMIN DASHBOARD
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'linear-gradient(135deg, #CBB193 0%, #AB978C 100%)',
              color: '#0B0E14',
              fontWeight: '900',
              fontSize: '13px',
              padding: '4px 8px',
              borderRadius: '4px'
            }}>
              WH
            </div>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid #222B3D',
              borderRadius: '4px',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8899A6',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {isSidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation Links */}
        <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: isSidebarOpen ? '10px 12px' : '10px',
                  justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? '#0B0E14' : '#94A3B8',
                  background: isActive ? '#CBB193' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.color = '#F1F5F9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#94A3B8';
                  }
                }}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: isActive ? '#0B0E14' : '#CBB193' }}>
                  {item.icon}
                </span>
                {isSidebarOpen && (
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                )}
                {isActive && isSidebarOpen && (
                  <span style={{
                    marginLeft: 'auto',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#0B0E14'
                  }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer (Admin profile & Logout) */}
        <div style={{
          padding: '14px',
          borderTop: '1px solid #1A2234',
          backgroundColor: '#0B0F1A',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {isSidebarOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  flexShrink: 0
                }}>
                  👑
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#F1F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {adminUser?.email || 'Admin'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#F59E0B', fontWeight: '700' }}>
                    QUẢN TRỊ VIÊN
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="Đăng xuất"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  fontSize: '14px',
                  borderRadius: '4px'
                }}
              >
                🚪
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                padding: '6px',
                fontSize: '16px',
                textAlign: 'center'
              }}
            >
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA WITH SHADCN TOPBAR                                      */}
      {/* ========================================================================= */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          height: '56px',
          backgroundColor: '#0D121F',
          borderBottom: '1px solid #1A2234',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          {/* Left: Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Link href="/admin" style={{ color: '#8899A6', textDecoration: 'none', fontWeight: '500' }}>
              Admin
            </Link>
            <span style={{ color: '#334155' }}>/</span>
            <span style={{ color: '#F1F5F9', fontWeight: '700' }}>
              {getPageTitle()}
            </span>
          </div>

          {/* Right: Live System Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Clock */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: '#94A3B8',
              fontFamily: "'JetBrains Mono', monospace",
              background: '#121827',
              border: '1px solid #1E283D',
              padding: '4px 10px',
              borderRadius: '4px'
            }}>
              <span>🕒</span>
              <span>{currentTime || '00:00:00'} (UTC+7)</span>
            </div>

            {/* Server Status Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: '#34D399',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '4px 10px',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
              <span>Proxy Server Online</span>
            </div>

            {/* Link to Chart */}
            <Link
              href="/"
              target="_blank"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '700',
                color: '#CBB193',
                background: 'rgba(203, 177, 147, 0.1)',
                border: '1px solid rgba(203, 177, 147, 0.3)',
                padding: '5px 12px',
                borderRadius: '4px',
                textDecoration: 'none'
              }}
            >
              <span>📈 Mở Chart Terminal</span>
              <span>↗</span>
            </Link>
          </div>
        </header>

        {/* Dynamic Route Body */}
        <main style={{ flex: 1, padding: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
