import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, message, Spin } from 'antd';
import { useAppStore } from '../store';
import api from '../api';

const { Title, Text } = Typography;

// ==================== 纯线条 SVG 图标 ====================

const IconLock = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconKey = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const IconLogo = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
    <circle cx="10" cy="8" r="1" fill="#1a1a1a" />
    <circle cx="14" cy="10" r="1" fill="#1a1a1a" />
    <circle cx="7" cy="13" r="1" fill="#1a1a1a" />
    <circle cx="17" cy="13" r="1" fill="#1a1a1a" />
    <circle cx="12" cy="16" r="1" fill="#1a1a1a" />
  </svg>
);

// ==================== 样式 ====================

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  } as React.CSSProperties,
  card: {
    width: 380,
    padding: 40,
  } as React.CSSProperties,
  logo: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a1a',
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center' as const,
    marginBottom: 36,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    marginBottom: 14,
    transition: 'border-color 0.2s',
    background: '#fff',
  } as React.CSSProperties,
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 14,
    color: '#1a1a1a',
    fontFamily: 'inherit',
    lineHeight: '22px',
  } as React.CSSProperties,
  btn: {
    width: '100%',
    height: 44,
    background: '#1a1a1a',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'opacity 0.2s',
    fontFamily: 'inherit',
    marginTop: 8,
  } as React.CSSProperties,
  error: {
    color: '#ff4d4f',
    fontSize: 13,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
};

// ==================== 组件 ====================

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setUser = useAppStore(s => s.setUser);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', {
        username,
        password,
        programCode: sessionStorage.getItem('current_program_code') || 'PROG001',
      });

      if (data.code !== 'SUCCESS') {
        setError(data.message || '登录失败');
        setLoading(false);
        return;
      }

      const { token, user, permissions } = data.data;
      sessionStorage.setItem('auth_token', token);
      setUser(
        {
          userId: String(user.userId),
          username: user.username,
          displayName: user.displayName || user.username,
        },
        permissions || [],
      );
      message.success('登录成功');
      setLoading(false);

      // 检查是否已有俱乐部配置，有则进仪表盘，无则进引导页
      try {
        const { data: progData } = await api.get('/admin/programs');
        const programs = progData?.data || [];
        if (programs.length > 0) {
          // 设置当前 Program
          const activeProgram = programs.find((p: any) => p.status === 'ACTIVE') || programs[0];
          useAppStore.getState().setCurrentProgram(activeProgram.programCode);
          navigate('/dashboard');
        } else {
          navigate('/onboarding');
        }
      } catch {
        navigate('/onboarding');
      }
    } catch (e: any) {
      const msg = e.response?.data?.message || '登录失败，请检查用户名和密码';
      setError(msg);
      setLoading(false);
    }
  };

  const inputStyle = (name: string): React.CSSProperties => ({
    ...S.inputWrap,
    borderColor: focusedInput === name ? '#1a1a1a' : '#e0e0e0',
    background: focusedInput === name ? '#fff' : '#fff',
  });

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <IconLogo />
        </div>

        {/* 标题 */}
        <div style={S.title}>忠诚度管理平台</div>
        <div style={S.subtitle}>Loyalty SaaS Platform</div>

        {/* 表单 */}
        <form onSubmit={handleLogin}>
          {/* 用户名 */}
          <div style={inputStyle('username')}>
            <IconUser />
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onFocus={() => setFocusedInput('username')}
              onBlur={() => setFocusedInput(null)}
              style={S.input}
              autoComplete="username"
            />
          </div>

          {/* 密码 */}
          <div style={inputStyle('password')}>
            <IconKey />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocusedInput('password')}
              onBlur={() => setFocusedInput(null)}
              style={S.input}
              autoComplete="current-password"
            />
          </div>

          {/* 错误提示 */}
          {error && <div style={S.error}>{error}</div>}

          {/* 登录按钮 */}
          <button
            type="submit"
            style={S.btn}
            disabled={loading}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {loading ? <Spin size="small" /> : <IconLock />}
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text style={{ fontSize: 12, color: '#bbb' }}>
            默认账号: superadmin / admin123
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;