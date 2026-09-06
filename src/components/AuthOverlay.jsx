'use client';

import React, { useEffect, useState, useRef } from 'react';

export default function AuthOverlay({ onLoginSuccess, kickoutNotice }) {
  // 'login' | 'register' | 'otp' | 'forgot' | 'magic_link_sent' | 'magic_reset' | 'reset_password'
  const [authMode, setAuthMode] = useState('login');
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // OTP Verification state (15 minutes = 900 seconds) - for registration
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(900); // 15 mins
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const otpInputRefs = useRef([]);

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGisReady, setIsGisReady] = useState(false);

  const googleBtnRef = useRef(null);
  const isGisInitRef = useRef(false);
  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;

  // 0. Detect Magic Link URL params (?reset_token=...&email=...) on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('reset_token');
      const emailParam = urlParams.get('email');
      if (token) {
        setResetToken(token);
        if (emailParam) setEmail(emailParam);
        setAuthMode('magic_reset');
        setErrorMessage('');
        setSuccessMessage('');

        // Verify token with backend
        (async () => {
          setIsLoading(true);
          try {
            const res = await fetch('/api/auth/verify-magic-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              setErrorMessage(data.message || 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.');
            } else if (data.email) {
              setEmail(data.email);
            }
          } catch (e) {
            setErrorMessage('Lỗi kết nối máy chủ khi kiểm tra liên kết.');
          } finally {
            setIsLoading(false);
          }
        })();
      }
    } catch (e) {}
  }, []);

  // 1. Countdown timer for 15-min OTP
  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timeLeft]);

  // Format seconds to mm:ss
  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 2. Load Google Identity Services SDK
  useEffect(() => {
    let checkInterval = null;

    function initGis() {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        setIsGisReady(true);
        if (checkInterval) clearInterval(checkInterval);
        return;
      }

      const existingScript = document.getElementById('google-gis-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-gis-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => setIsGisReady(true);
        document.body.appendChild(script);
      }
    }

    initGis();
    checkInterval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setIsGisReady(true);
        clearInterval(checkInterval);
      }
    }, 200);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  // 3. Render Google Sign-In Button
  useEffect(() => {
    if (!isGisReady || !googleBtnRef.current || authMode === 'otp' || authMode === 'forgot' || authMode === 'magic_link_sent' || authMode === 'magic_reset' || authMode === 'reset_password') return;

    let isMounted = true;

    async function setupGis() {
      try {
        let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '509260068610-ocalrnbk8oc8ieenl3vdcs8cgn2n7hb2.apps.googleusercontent.com';

        if (!isGisInitRef.current && window.google?.accounts?.id) {
          try {
            const cfgRes = await fetch('/api/auth/config');
            if (cfgRes.ok) {
              const cfg = await cfgRes.json();
              if (cfg.clientId) clientId = cfg.clientId;
            }
          } catch (e) {}

          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCallback,
            auto_select: false,
            cancel_on_tap_outside: false,
          });

          isGisInitRef.current = true;
        }

        if (googleBtnRef.current && isMounted && window.google?.accounts?.id) {
          googleBtnRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'rectangular',
            width: 310,
            text: authMode === 'register' ? 'signup_with' : 'signin_with',
            logo_alignment: 'left',
          });
        }
      } catch (err) {
        console.error('GIS Error:', err);
      }
    }

    setupGis();

    return () => {
      isMounted = false;
    };
  }, [isGisReady, authMode]);

  // Google Sign-In Callback
  async function handleGoogleCallback(response) {
    if (!response || !response.credential) return;

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
          mode: authModeRef.current === 'register' ? 'register' : 'login',
        }),
      });

      const data = await res.json();

      if (res.status === 403 && data.code === 'ACCOUNT_NOT_REGISTERED') {
        setErrorMessage('Tài khoản Google này chưa đăng ký. Hãy chuyển sang Đăng ký để tạo tài khoản nhé.');
        setAuthMode('register');
        setIsLoading(false);
        return;
      }

      if (res.ok && data.success) {
        setSuccessMessage('Đăng nhập thành công!');
        if (typeof window !== 'undefined') {
          localStorage.setItem('crazii_session_token', data.sessionToken);
          localStorage.setItem('crazii_user', JSON.stringify(data.user));
        }
        setTimeout(() => {
          onLoginSuccess?.(data.sessionToken, data.user);
        }, 300);
      } else {
        setErrorMessage(data.message || 'Đăng nhập Google không thành công.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 4. Handle Standard Password Login
  async function handleLoginSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('Đăng nhập thành công!');
        if (typeof window !== 'undefined') {
          localStorage.setItem('crazii_session_token', data.sessionToken);
          localStorage.setItem('crazii_user', JSON.stringify(data.user));
        }
        setTimeout(() => {
          onLoginSuccess?.(data.sessionToken, data.user);
        }, 300);
      } else {
        setErrorMessage(data.message || 'Đăng nhập không thành công.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 5. Handle Register Request -> Triggers 15-min OTP Email
  async function handleRegisterSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Vui lòng điền đầy đủ Email và Mật khẩu.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAuthMode('otp');
        setOtpDigits(['', '', '', '', '', '']);
        setTimeLeft(900); // 15 phút
        setIsTimerRunning(true);
        setSuccessMessage('Mã xác thực đã được gửi đến email của bạn!');
        setTimeout(() => {
          otpInputRefs.current[0]?.focus();
        }, 200);
      } else {
        setErrorMessage(data.message || 'Không thể tạo yêu cầu đăng ký.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 6. Handle Forgot Password Request -> Sends Magic Link Email
  async function handleForgotPasswordSubmit(e) {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAuthMode('magic_link_sent');
        setSuccessMessage(data.message || 'Liên kết đặt lại mật khẩu đã được gửi đến email của bạn!');
      } else {
        setErrorMessage(data.message || 'Không thể gửi liên kết đổi mật khẩu.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 7. Handle Magic Link Password Reset Submission
  async function handleMagicResetPasswordSubmit(e) {
    if (e) e.preventDefault();
    if (!resetToken) {
      setErrorMessage('Thiếu mã liên kết xác thực. Vui lòng mở lại liên kết từ email.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/reset-password-magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('Đặt lại mật khẩu thành công! Đang vào ứng dụng...');

        if (typeof window !== 'undefined') {
          localStorage.setItem('crazii_session_token', data.sessionToken);
          localStorage.setItem('crazii_user', JSON.stringify(data.user));

          // Clean URL query parameters
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        setTimeout(() => {
          onLoginSuccess?.(data.sessionToken, data.user);
        }, 400);
      } else {
        setErrorMessage(data.message || 'Không thể đặt lại mật khẩu.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // Legacy OTP Reset Password Submission (Fallback)
  async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã xác thực.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (timeLeft <= 0) {
      setErrorMessage('Mã xác thực đã hết hạn (quá 15 phút). Vui lòng nhấn "Gửi lại mã".');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp: fullOtp,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('Đặt lại mật khẩu thành công! Đang vào ứng dụng...');
        setIsTimerRunning(false);

        if (typeof window !== 'undefined') {
          localStorage.setItem('crazii_session_token', data.sessionToken);
          localStorage.setItem('crazii_user', JSON.stringify(data.user));
        }

        setTimeout(() => {
          onLoginSuccess?.(data.sessionToken, data.user);
        }, 400);
      } else {
        setErrorMessage(data.message || 'Không thể đặt lại mật khẩu.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // Legacy Resend OTP for Forgot Password (Fallback)
  async function handleResendForgotOtp() {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/resend-forgot-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTimeLeft(900);
        setIsTimerRunning(true);
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessMessage('Đã gửi lại mã khôi phục mới! Mã có hiệu lực trong 15 phút.');
        otpInputRefs.current[0]?.focus();
      } else {
        setErrorMessage(data.message || 'Không thể gửi lại mã.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 9. Handle OTP Input Changes (auto-jump between 6 digits)
  function handleOtpChange(index, val) {
    if (!/^\d*$/.test(val)) return;

    const newDigits = [...otpDigits];

    // Handle paste multiple characters
    if (val.length > 1) {
      const pasted = val.slice(0, 6).split('');
      pasted.forEach((char, i) => {
        if (i < 6) newDigits[i] = char;
      });
      setOtpDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }

    newDigits[index] = val;
    setOtpDigits(newDigits);

    if (val && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  // 10. Handle Registration OTP Verification
  async function handleVerifyOtpSubmit(e) {
    if (e) e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã xác thực.');
      return;
    }

    if (timeLeft <= 0) {
      setErrorMessage('Mã xác thực đã hết hạn (quá 15 phút). Vui lòng bấm "Gửi lại mã".');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: fullOtp }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('Xác thực thành công! Đang vào ứng dụng...');
        setIsTimerRunning(false);

        if (typeof window !== 'undefined') {
          localStorage.setItem('crazii_session_token', data.sessionToken);
          localStorage.setItem('crazii_user', JSON.stringify(data.user));
        }

        setTimeout(() => {
          onLoginSuccess?.(data.sessionToken, data.user);
        }, 400);
      } else {
        setErrorMessage(data.message || 'Mã xác thực không đúng.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  // 11. Resend Registration OTP Code
  async function handleResendOtp() {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTimeLeft(900); // Reset 15 mins
        setIsTimerRunning(true);
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessMessage('Đã gửi mã xác thực mới! Mã có hiệu lực trong 15 phút.');
        otpInputRefs.current[0]?.focus();
      } else {
        setErrorMessage(data.message || 'Không thể gửi lại mã.');
      }
    } catch (err) {
      setErrorMessage('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }

  function switchTab(mode) {
    setAuthMode(mode);
    setErrorMessage('');
    setSuccessMessage('');
  }

  return (
    <div className="auth-overlay">
      <div className="auth-container">
        {/* LEFT COLUMN: Hero Card with Selected Color Palette */}
        <div className="brand-hero-card">
          <div className="brand-badge">
            <span className="brand-badge-inner">TRADEWH<sup>®</sup></span>
          </div>
          <h1 className="brand-title">Chào mừng đến với TRADEWH</h1>
          <p className="brand-desc">
            {authMode === 'register'
              ? 'Tạo tài khoản để bắt đầu trải nghiệm và theo dõi danh mục của bạn'
              : (authMode === 'forgot' || authMode === 'magic_link_sent' || authMode === 'magic_reset' || authMode === 'reset_password')
              ? 'Khôi phục quyền truy cập vào tài khoản và tiếp tục phiên làm việc'
              : 'Đăng nhập để tiếp tục phiên làm việc và theo dõi danh mục của bạn'}
          </p>

          <div className="brand-visual-mark">
            <svg width="60" height="60" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="56" height="56" rx="14" fill="#1C212D" stroke="rgba(233, 230, 231, 0.2)" strokeWidth="1.2" />
              <path d="M13 32L21 40L28 24L35 34L42 16" stroke="#CBB193" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="42" cy="16" r="3.5" fill="#FFFFFF" />
            </svg>
          </div>
        </div>

        {/* RIGHT COLUMN: Crisp Authentication Form */}
        <div className="form-column">
          {/* Top Right Language Switcher Flag */}
          <div className="top-actions">
            <div className="lang-flag" title="Tiếng Việt">
              <svg width="22" height="15" viewBox="0 0 22 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="22" height="15" fill="#DA251D" rx="2" />
                <polygon points="11,3 12.2,6.8 16.2,6.8 13,9.1 14.2,12.9 11,10.6 7.8,12.9 9,9.1 5.8,6.8 9.8,6.8" fill="#FF0" />
              </svg>
            </div>
          </div>

          {/* Form Header */}
          <div className="form-header">
            <h2 className="main-title">
              {authMode === 'login' && 'Đăng Nhập Tài Khoản'}
              {authMode === 'register' && 'Đăng Ký Tài Khoản'}
              {authMode === 'otp' && 'Xác Thực Email'}
              {authMode === 'forgot' && 'Khôi Phục Mật Khẩu'}
              {authMode === 'magic_link_sent' && 'Kiểm Tra Hộp Thư'}
              {authMode === 'magic_reset' && 'Đặt Lại Mật Khẩu'}
              {authMode === 'reset_password' && 'Đặt Lại Mật Khẩu'}
            </h2>
            <p className="sub-title">
              {authMode === 'login' && 'Xác thực tài khoản để truy cập hệ thống'}
              {authMode === 'register' && 'Đăng ký tài khoản để bắt đầu theo dõi thị trường'}
              {authMode === 'otp' && `Mã xác thực 6 chữ số đã được gửi đến ${email || 'email của bạn'}.`}
              {authMode === 'forgot' && 'Nhập email của bạn để nhận liên kết Magic Link đặt lại mật khẩu.'}
              {authMode === 'magic_link_sent' && `Chúng tôi đã gửi Magic Link bảo mật đến email của bạn.`}
              {authMode === 'magic_reset' && `Tạo mật khẩu mới cho tài khoản ${email || ''}.`}
              {authMode === 'reset_password' && `Nhập mật khẩu mới cho tài khoản ${email || ''}.`}
            </p>
          </div>

          {/* Alerts */}
          {kickoutNotice && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#fecaca',
              fontSize: '13.5px',
              lineHeight: '1.45',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.12)'
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
              <div>
                <strong style={{ display: 'block', color: '#fff', fontSize: '14px', marginBottom: '2px' }}>
                  Phiên đăng nhập đã kết thúc
                </strong>
                <span>{kickoutNotice}</span>
              </div>
            </div>
          )}
          {errorMessage && <div className="alert-box error">{errorMessage}</div>}
          {successMessage && <div className="alert-box success">{successMessage}</div>}

          {/* VIEW 1: LOGIN FORM */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Email
                </label>
                <input
                  type="email"
                  className="field-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Mật khẩu
                </label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button type="submit" className="primary-btn" disabled={isLoading}>
                {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
              </button>

              {/* Divider & Google 1-Tap Login Option */}
              <div className="or-divider">
                <span>Hoặc</span>
              </div>

              <div className="google-btn-slot">
                <div ref={googleBtnRef} id="g_id_signin_element" />
              </div>

              <div className="form-links">
                <p className="switch-note">
                  Nếu bạn chưa có tài khoản. Vui lòng{' '}
                  <button type="button" className="text-link" onClick={() => switchTab('register')}>
                    Đăng ký
                  </button>
                </p>
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => switchTab('forgot')}
                >
                  Quên mật khẩu?
                </button>
              </div>
            </form>
          )}

          {/* VIEW 2: REGISTER FORM (Only Email & Password) */}
          {authMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="auth-form">
              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Email
                </label>
                <input
                  type="email"
                  className="field-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Mật khẩu
                </label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Tạo mật khẩu (tối thiểu 6 ký tự)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Xác nhận mật khẩu mới
                </label>
                <div className="password-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button type="submit" className="primary-btn" disabled={isLoading}>
                {isLoading ? 'Đang gửi mã...' : 'Tạo tài khoản'}
              </button>

              {/* Divider & Google 1-Tap Option */}
              <div className="or-divider">
                <span>Hoặc</span>
              </div>

              <div className="google-btn-slot">
                <div ref={googleBtnRef} id="g_id_signin_element" />
              </div>

              <div className="form-links">
                <p className="switch-note">
                  Đã có tài khoản?{' '}
                  <button type="button" className="text-link" onClick={() => switchTab('login')}>
                    Đăng nhập
                  </button>
                </p>
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => switchTab('forgot')}
                >
                  Quên mật khẩu?
                </button>
              </div>
            </form>
          )}

          {/* VIEW 3: 15-MINUTE REGISTRATION OTP VERIFICATION */}
          {authMode === 'otp' && (
            <form onSubmit={handleVerifyOtpSubmit} className="auth-form otp-view">
              <div className="otp-boxes-wrapper">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={idx === 0 ? 6 : 1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="otp-digit-box"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {/* 15-Minute Countdown Timer Indicator */}
              <div className={`otp-timer-row ${timeLeft === 0 ? 'expired' : ''}`}>
                {timeLeft > 0 ? (
                  <span>
                    ⏱️ Mã hết hạn sau: <strong>{formatCountdown(timeLeft)}</strong>
                  </span>
                ) : (
                  <span className="expired-text">⚠️ Mã đã hết hạn (quá 15 phút). Vui lòng gửi lại mã!</span>
                )}
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={isLoading || timeLeft === 0 || otpDigits.join('').length < 6}
              >
                {isLoading ? 'Đang xác thực...' : 'Xác nhận & Vào hệ thống'}
              </button>

              <div className="otp-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleResendOtp}
                  disabled={isLoading}
                >
                  🔄 Gửi lại mã xác thực
                </button>
                <button
                  type="button"
                  className="back-link"
                  onClick={() => switchTab('register')}
                >
                  ← Đổi email khác
                </button>
              </div>
            </form>
          )}

          {/* VIEW 4: FORGOT PASSWORD REQUEST FORM (Magic Link) */}
          {authMode === 'forgot' && (
            <form onSubmit={handleForgotPasswordSubmit} className="auth-form">
              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Email đã đăng ký
                </label>
                <input
                  type="email"
                  className="field-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button type="submit" className="primary-btn" disabled={isLoading}>
                {isLoading ? 'Đang gửi liên kết...' : 'Gửi liên kết đổi mật khẩu'}
              </button>

              <div className="form-links">
                <button
                  type="button"
                  className="back-link"
                  onClick={() => switchTab('login')}
                >
                  ← Quay lại Đăng nhập
                </button>
              </div>
            </form>
          )}

          {/* VIEW 4B: MAGIC LINK SENT CONFIRMATION */}
          {authMode === 'magic_link_sent' && (
            <div className="auth-form magic-sent-view">
              <div className="magic-sent-box">
                <div className="magic-icon-wrapper">
                  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="52" height="52" fill="#1C212D" stroke="#6B7C98" strokeWidth="1.5" />
                    <path d="M12 18L26 28L40 18" stroke="#E9E6E7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="10" y="15" width="32" height="22" stroke="#6B7C98" strokeWidth="2" />
                    <circle cx="38" cy="15" r="5" fill="#6B7C98" />
                    <path d="M36 15L37.5 16.5L40.5 13.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="magic-sent-title">Magic Link Đã Được Gửi!</h3>
                <p className="magic-sent-desc">
                  Chúng tôi đã gửi liên kết đặt lại mật khẩu đến:
                </p>
                <div className="magic-email-badge">
                  <span>{email}</span>
                </div>
                <p className="magic-sent-hint">
                  ⏱️ Vui lòng kiểm tra email và bấm vào nút <strong>"ĐẶT LẠI MẬT KHẨU"</strong> (có hiệu lực trong 15 phút).
                </p>
              </div>

              <div className="magic-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleForgotPasswordSubmit}
                  disabled={isLoading}
                >
                  🔄 {isLoading ? 'Đang gửi lại...' : 'Gửi lại liên kết'}
                </button>
                <button
                  type="button"
                  className="back-link"
                  onClick={() => switchTab('login')}
                >
                  ← Quay lại Đăng nhập
                </button>
              </div>
            </div>
          )}

          {/* VIEW 5: MAGIC RESET PASSWORD FORM */}
          {authMode === 'magic_reset' && (
            <form onSubmit={handleMagicResetPasswordSubmit} className="auth-form">
              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Mật khẩu mới
                </label>
                <div className="password-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Xác nhận mật khẩu mới
                </label>
                <div className="password-wrapper">
                  <input
                    type={showConfirmNewPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={isLoading || !newPassword || newPassword.length < 6}
              >
                {isLoading ? 'Đang lưu...' : 'Lưu mật khẩu & Đăng nhập'}
              </button>

              <div className="form-links">
                <button
                  type="button"
                  className="back-link"
                  onClick={() => switchTab('login')}
                >
                  ← Hủy & Về Đăng nhập
                </button>
              </div>
            </form>
          )}

          {/* VIEW 6: LEGACY RESET PASSWORD (FALLBACK OTP) */}
          {authMode === 'reset_password' && (
            <form onSubmit={handleResetPasswordSubmit} className="auth-form">
              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Mã xác thực (6 số)
                </label>
                <div className="otp-boxes-wrapper">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpInputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={idx === 0 ? 6 : 1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="otp-digit-box"
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <div className={`otp-timer-row ${timeLeft === 0 ? 'expired' : ''}`}>
                  {timeLeft > 0 ? (
                    <span>
                      ⏱️ Mã hết hạn sau: <strong>{formatCountdown(timeLeft)}</strong>
                    </span>
                  ) : (
                    <span className="expired-text">⚠️ Mã đã hết hạn. Vui lòng nhấn gửi lại mã!</span>
                  )}
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Mật khẩu mới
                </label>
                <div className="password-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  <span className="req">*</span> Xác nhận mật khẩu mới
                </label>
                <div className="password-wrapper">
                  <input
                    type={showConfirmNewPassword ? 'text' : 'password'}
                    className="field-input with-eye"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={isLoading || timeLeft === 0 || otpDigits.join('').length < 6}
              >
                {isLoading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu & Đăng nhập'}
              </button>

              <div className="otp-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleResendForgotOtp}
                  disabled={isLoading}
                >
                  🔄 Gửi lại mã xác thực
                </button>
                <button
                  type="button"
                  className="back-link"
                  onClick={() => switchTab('login')}
                >
                  ← Quay lại Đăng nhập
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style jsx>{`
        /* Palette Mapping:
           #E9E6E7: Warm Off-White / Surface Light
           #5E5653: Dark Espresso Charcoal / Primary Text & Deep Background
           #6B7C98: Slate Denim Blue / Accent & Primary Focus
           #7B7F8A: Cool Slate Gray / Subtitles & Borders
           #AB978C: Warm Taupe Mocha / Highlights & Secondary Elements
        */

        .auth-overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at center, rgba(94, 86, 83, 0.92) 0%, rgba(35, 32, 36, 0.98) 100%);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .auth-container {
          display: flex;
          background: #FFFFFF;
          border-radius: 0px;
          border: 1px solid rgba(171, 151, 140, 0.4);
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
          max-width: 900px;
          width: 100%;
          min-height: 530px;
          overflow: hidden;
        }

        /* LEFT COLUMN: Hero Card styled with #6B7C98, #7B7F8A, #5E5653, #AB978C */
        .brand-hero-card {
          flex: 1.05;
          background: radial-gradient(circle at 35% 20%, #7B7F8A 0%, #6B7C98 42%, #5E5653 90%, #48413E 100%);
          padding: 48px 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.15);
        }

        .brand-badge {
          background: #5E5653;
          color: #E9E6E7;
          font-weight: 800;
          font-size: 13.5px;
          letter-spacing: 2.5px;
          padding: 8px 26px;
          border-radius: 4px;
          transform: skewX(-18deg);
          margin-bottom: 24px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
          border: 1.5px solid rgba(233, 230, 231, 0.45);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .brand-badge-inner {
          display: inline-flex;
          align-items: center;
          transform: skewX(18deg);
        }

        .brand-badge sup {
          font-size: 9px;
          margin-left: 2px;
          color: #AB978C;
        }

        .brand-title {
          font-size: 28px;
          font-weight: 800;
          color: #E9E6E7;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          line-height: 1.25;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .brand-desc {
          font-size: 14px;
          color: #E9E6E7;
          max-width: 280px;
          margin: 0;
          line-height: 1.5;
          font-weight: 500;
          opacity: 0.9;
        }

        .brand-visual-mark {
          margin-top: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35));
          transition: transform 0.25s ease;
        }

        .brand-visual-mark:hover {
          transform: translateY(-2px) scale(1.03);
        }

        /* RIGHT COLUMN: Form Area */
        .form-column {
          flex: 1.15;
          background: #FFFFFF;
          padding: 36px 42px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
        }

        .top-actions {
          position: absolute;
          top: 24px;
          right: 28px;
        }

        .lang-flag {
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 0px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
        }

        .form-header {
          text-align: center;
          margin-bottom: 22px;
        }

        .main-title {
          font-size: 22px;
          font-weight: 800;
          color: #5E5653;
          margin: 0 0 6px 0;
          letter-spacing: -0.3px;
        }

        .sub-title {
          font-size: 13px;
          color: #7B7F8A;
          margin: 0;
          line-height: 1.45;
        }

        .alert-box {
          font-size: 12.5px;
          padding: 10px 14px;
          border-radius: 0px;
          margin-bottom: 16px;
          text-align: center;
        }

        .alert-box.error {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .alert-box.success {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
          text-align: left;
        }

        .field-label {
          font-size: 13px;
          font-weight: 600;
          color: #5E5653;
        }

        .req {
          color: #6B7C98;
          margin-right: 2px;
          font-weight: bold;
        }

        .field-input {
          background: #F7F6F7;
          border: 1.5px solid #DCD9DA;
          border-radius: 0px;
          padding: 11px 14px;
          font-size: 13.5px;
          color: #5E5653;
          outline: none;
          transition: all 0.2s ease;
          width: 100%;
          box-sizing: border-box;
        }

        .field-input:focus {
          background: #FFFFFF;
          border-color: #6B7C98;
          box-shadow: 0 0 0 3px rgba(107, 124, 152, 0.2);
        }

        .password-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-input.with-eye {
          padding-right: 42px;
        }

        .eye-toggle {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.65;
          color: #7B7F8A;
          transition: opacity 0.2s;
        }

        .eye-toggle:hover {
          opacity: 1;
          color: #5E5653;
        }

        .primary-btn {
          background: linear-gradient(135deg, #5E5653 0%, #463F3C 100%);
          color: #E9E6E7;
          border: 1px solid rgba(171, 151, 140, 0.3);
          border-radius: 0px;
          padding: 13px 20px;
          font-size: 14.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 4px;
          width: 100%;
          box-shadow: 0 4px 12px rgba(94, 86, 83, 0.2);
        }

        .primary-btn:hover:not(:disabled) {
          background: #6B7C98;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(107, 124, 152, 0.35);
          border-color: rgba(107, 124, 152, 0.5);
        }

        .primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .or-divider {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 4px 0;
        }

        .or-divider::before,
        .or-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #E9E6E7;
        }

        .or-divider span {
          padding: 0 10px;
          font-size: 12px;
          color: #7B7F8A;
          font-weight: 500;
        }

        .google-btn-slot {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 42px;
        }

        .form-links {
          text-align: center;
          margin-top: 6px;
        }

        .switch-note {
          font-size: 12.5px;
          color: #7B7F8A;
          margin: 0 0 4px 0;
        }

        .text-link {
          background: none;
          border: none;
          color: #6B7C98;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .text-link:hover {
          color: #5E5653;
        }

        .forgot-link {
          background: none;
          border: none;
          color: #7B7F8A;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }

        .forgot-link:hover {
          color: #5E5653;
        }

        /* OTP 6-Digit Styles */
        .otp-boxes-wrapper {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin: 10px 0 6px;
        }

        .otp-digit-box {
          width: 44px;
          height: 52px;
          font-size: 22px;
          font-weight: 700;
          text-align: center;
          background: #F7F6F7;
          border: 1.5px solid #7B7F8A;
          border-radius: 0px;
          outline: none;
          transition: all 0.2s;
          color: #5E5653;
        }

        .otp-digit-box:focus {
          border-color: #6B7C98;
          background: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(107, 124, 152, 0.25);
        }

        .otp-timer-row {
          font-size: 13px;
          color: #7B7F8A;
          text-align: center;
          margin-bottom: 6px;
        }

        .otp-timer-row strong {
          color: #6B7C98;
        }

        .otp-timer-row.expired {
          color: #dc2626;
        }

        .expired-text {
          font-weight: 600;
        }

        .otp-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          margin-top: 4px;
        }

        .secondary-btn {
          background: #E9E6E7;
          border: 1px solid #AB978C;
          color: #5E5653;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 0px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .secondary-btn:hover:not(:disabled) {
          background: #AB978C;
          color: #FFFFFF;
        }

        .back-link {
          background: none;
          border: none;
          color: #7B7F8A;
          font-size: 12.5px;
          cursor: pointer;
          padding: 2px 6px;
        }

        .back-link:hover {
          color: #5E5653;
          text-decoration: underline;
        }

        /* Magic Link Sent View Styles */
        .magic-sent-view {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .magic-sent-box {
          background: #F7F6F7;
          border: 1.5px solid #DCD9DA;
          padding: 24px 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 10px;
        }

        .magic-icon-wrapper {
          margin-bottom: 4px;
        }

        .magic-sent-title {
          font-size: 16px;
          font-weight: 800;
          color: #5E5653;
          margin: 0;
          letter-spacing: -0.2px;
        }

        .magic-sent-desc {
          font-size: 13px;
          color: #7B7F8A;
          margin: 0;
          line-height: 1.4;
        }

        .magic-email-badge {
          background: #FFFFFF;
          border: 1px solid #6B7C98;
          color: #5E5653;
          padding: 6px 14px;
          font-size: 13.5px;
          font-weight: 700;
          word-break: break-all;
        }

        .magic-sent-hint {
          font-size: 12px;
          color: #7B7F8A;
          margin: 4px 0 0 0;
          line-height: 1.45;
        }

        .magic-sent-hint strong {
          color: #5E5653;
        }

        .magic-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          margin-top: 4px;
        }

        /* Responsive Mobile Layout */
        @media (max-width: 768px) {
          .auth-container {
            flex-direction: column;
            max-width: 420px;
          }

          .brand-hero-card {
            padding: 32px 20px;
          }

          .brand-title {
            font-size: 22px;
          }

          .form-column {
            padding: 28px 20px;
          }

          .otp-digit-box {
            width: 38px;
            height: 46px;
            font-size: 18px;
            gap: 6px;
          }
        }
      `}</style>
    </div>
  );
}
