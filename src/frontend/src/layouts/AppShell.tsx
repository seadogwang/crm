import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Typography, Badge, Avatar, Dropdown, Select, Space, Tag, Alert, theme } from 'antd';
import {
  PartitionOutlined, BuildOutlined, TeamOutlined,
  DollarOutlined, CrownOutlined, ApiOutlined,
  CodeOutlined, AuditOutlined, BellOutlined,
  SettingOutlined, UserOutlined, LogoutOutlined,
  SafetyCertificateOutlined, FileTextOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

// ==================== 菜单配置 ====================

interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  path?: string;
  children?: MenuItemType[];
}

const menuItems: MenuItemType[] = [
  {
    key: 'member', icon: <TeamOutlined />, label: '会员服务',
    children: [
      { key: 'member-list', icon: <TeamOutlined />, label: '会员列表', path: '/members' },
    ],
  },
  {
    key: 'tier-rule', icon: <CrownOutlined />, label: '规则引擎',
    children: [
      { key: 'rule-list', icon: <SettingOutlined />, label: '规则列表', path: '/rules' },
    ],
  },
  {
    key: 'settings', icon: <SettingOutlined />, label: '设置',
    children: [
      { key: 'schema-editor', icon: <BuildOutlined />, label: 'Schema 编辑器', path: '/schema-editor' },
      { key: 'mapping-config', icon: <ApiOutlined />, label: '映射配置器', path: '/mapping-config' },
      { key: 'points-grant', icon: <DollarOutlined />, label: '积分类型', path: '/points/grant' },
      { key: 'tier-config', icon: <CrownOutlined />, label: '等级设置', path: '/tiers' },
      { key: 'channel-list', icon: <ApiOutlined />, label: '渠道列表', path: '/channels' },
      { key: 'scripting', icon: <CodeOutlined />, label: '脚本工作台', path: '/channels/scripting' },
      { key: 'roles', icon: <SafetyCertificateOutlined />, label: '角色权限', path: '/system/roles' },
      { key: 'logs', icon: <FileTextOutlined />, label: '操作日志', path: '/system/logs' },
      { key: 'spi-logs', icon: <AuditOutlined />, label: 'SPI 日志', path: '/system/spi-logs' },
      { key: 'audit', icon: <WarningOutlined />, label: '租户审计', path: '/system/audit' },
    ],
  },
];

// 根据路径找菜单 key
function findMenuKey(path: string, items: MenuItemType[]): string {
  for (const item of items) {
    if (item.path === path) return item.key;
    if (item.children) {
      const found = findMenuKey(path, item.children);
      if (found) return found;
    }
  }
  return '';
}

// ==================== AppShell 组件 ====================

const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProgramCode, programs, setCurrentProgram, online, setOnline } = useAppStore();
  const { token } = theme.useToken();

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // 监听路由变化，同步菜单选中
  useEffect(() => {
    const key = findMenuKey(location.pathname, menuItems);
    setSelectedKeys(key ? [key] : []);
  }, [location.pathname]);

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  const handleMenuClick = (info: { key: string }) => {
    const findPath = (key: string, items: MenuItemType[]): string | null => {
      for (const item of items) {
        if (item.key === key) return item.path || null;
        if (item.children) {
          const found = findPath(key, item.children);
          if (found) return found;
        }
      }
      return null;
    };
    const path = findPath(info.key, menuItems);
    if (path) navigate(path);
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenuClick = (info: { key: string }) => {
    if (info.key === 'logout') {
      // 清除用户状态
      useAppStore.getState().setUser(null as any, []);
      navigate('/login');
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1a1a1a',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#fff' }}>
        {/* ====== 顶部导航栏 ====== */}
        <Header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', padding: '0 24px', height: 56, lineHeight: '56px',
          position: 'sticky', top: 0, zIndex: 100,
          borderBottom: '1px solid #f0f0f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {/* 左侧: Logo */}
          <Space style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => navigate('/dashboard')}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
                <circle cx="10" cy="8" r="1" fill="#1a1a1a" />
                <circle cx="14" cy="10" r="1" fill="#1a1a1a" />
                <circle cx="7" cy="13" r="1" fill="#1a1a1a" />
                <circle cx="17" cy="13" r="1" fill="#1a1a1a" />
                <circle cx="12" cy="16" r="1" fill="#1a1a1a" />
              </svg>
            </div>
          </Space>

          {/* 中央: 顶部菜单 */}
          <Menu
            mode="horizontal"
            selectedKeys={selectedKeys}
            onClick={handleMenuClick}
            items={menuItems.map(group => ({
              key: group.key,
              icon: group.icon,
              label: group.label,
              children: group.children?.map(item => ({
                key: item.key,
                icon: item.icon,
                label: item.label,
              })),
            }))}
            style={{
              flex: 1, borderBottom: 'none', justifyContent: 'center',
              background: 'transparent', lineHeight: '54px',
            }}
            triggerSubMenuAction="hover"
          />

          {/* 右侧: 操作区 */}
          <Space size={16} style={{ flexShrink: 0 }}>
            <Select
              value={currentProgramCode}
              onChange={setCurrentProgram}
              style={{ width: 160 }}
              size="small"
              options={[
                { label: 'PROG001', value: 'PROG001' },
                { label: 'BRAND-A', value: 'BRAND-A' },
                ...programs.map(p => ({ label: p.programCode, value: p.programCode })),
              ]}
            />

            <Badge count={3} size="small">
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer', color: '#666' }}
                onClick={() => navigate('/ops/notifications')} />
            </Badge>

            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <Text style={{ fontSize: 13, color: '#666' }}>管理员</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ====== 内容区域 ====== */}
        <Layout style={{ background: '#fff' }}>
          {!online && (
            <Alert type="warning" message="网络连接已断开，正在重连..." banner style={{ borderRadius: 0 }} />
          )}
          <Content style={{ padding: 24, minHeight: 'calc(100vh - 56px - 32px)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
            <Outlet />
          </Content>
          <Footer style={{
            padding: '4px 24px', background: '#fff', borderTop: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#999',
          }}>
            <span>当前俱乐部: <Tag color="blue" style={{ fontSize: 11 }}>{currentProgramCode}</Tag></span>
            <span>环境: DEV | Loyalty SaaS v1.0.0</span>
          </Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default AppShell;