import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Typography, Badge, Avatar, Dropdown, Select, Space, Tag, Alert, theme } from 'antd';
import {
  TeamOutlined,
  DollarOutlined, CrownOutlined, ApiOutlined,
  CodeOutlined, AuditOutlined, BellOutlined,
  SettingOutlined, UserOutlined, LogoutOutlined, ApartmentOutlined,
  SafetyCertificateOutlined, FileTextOutlined, WarningOutlined, RobotOutlined,
  BarChartOutlined, ProjectOutlined, ThunderboltOutlined, BranchesOutlined,
  ExperimentOutlined, FormOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

// ==================== 菜单配置 ====================

interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  path?: string;
  requiredPermission?: string;
  children?: MenuItemType[];
}

/** 根据用户权限过滤菜单（含 '*' 通配符显示全部） */
function filterMenuByPermissions(items: MenuItemType[], permissions: string[]): MenuItemType[] {
  if (permissions.includes('*')) return items;
  return items
    .filter(item => !item.requiredPermission || permissions.includes(item.requiredPermission))
    .map(item => ({
      ...item,
      children: item.children ? filterMenuByPermissions(item.children, permissions) : undefined,
    }))
    .filter(item => item.children === undefined || item.children.length > 0);
}

const menuItems: MenuItemType[] = [
  {
    key: 'member', icon: <TeamOutlined />, label: '会员服务', path: '/members', requiredPermission: 'MEMBER_READ',
  },
  {
    key: 'tier-rule', icon: <CrownOutlined />, label: '忠诚度', requiredPermission: 'RULE_READ',
    children: [
      { key: 'point-type', icon: <DollarOutlined />, label: '积分类型', path: '/points/type', requiredPermission: 'POINTS_GRANT' },
      { key: 'tier-config', icon: <SettingOutlined />, label: '等级设置', path: '/tiers', requiredPermission: 'RULE_READ' },
      { key: 'variable-mgmt', icon: <CodeOutlined />, label: '变量配置', path: '/variables', requiredPermission: 'RULE_READ' },
      { key: 'rule-engine', icon: <ThunderboltOutlined />, label: '累积规则配置', path: '/rules', requiredPermission: 'RULE_READ' },
      { key: 'tier-rule-list', icon: <CrownOutlined />, label: '等级评估配置', path: '/rules/tier', requiredPermission: 'RULE_READ' },
      { key: 'flow-designer', icon: <ApartmentOutlined />, label: '计算流程配置', path: '/flow-designer', requiredPermission: 'RULE_WRITE' },
      { key: 'oneid-strategy', icon: <SafetyCertificateOutlined />, label: 'One-ID 策略', path: '/system/oneid-strategy', requiredPermission: 'CHANNEL_READ' },
      { key: 'campaign-terms', icon: <FileTextOutlined />, label: '条款管理', path: '/campaign/terms', requiredPermission: 'TENANT_WRITE' },
    ],
  },
  {
    key: 'campaign', icon: <BarChartOutlined />, label: '营销管理', requiredPermission: 'RULE_READ',
    children: [
      { key: 'campaign-workspace-list', icon: <ProjectOutlined />, label: '营销工作区', path: '/campaign/workspaces', requiredPermission: 'RULE_READ' },
      { key: 'campaign-decision', icon: <ThunderboltOutlined />, label: '决策引擎', path: '/campaign/decision', requiredPermission: 'RULE_READ' },
      { key: 'campaign-canvas', icon: <BranchesOutlined />, label: '画布编辑器', path: '/campaign/canvas/new', requiredPermission: 'RULE_WRITE' },
      { key: 'campaign-content', icon: <SafetyCertificateOutlined />, label: '内容合规', path: '/campaign/content', requiredPermission: 'RULE_READ' },
      { key: 'campaign-intervention', icon: <WarningOutlined />, label: '干预中心', path: '/campaign/intervention', requiredPermission: 'RULE_WRITE' },
      { key: 'campaign-execution', icon: <ApartmentOutlined />, label: '执行引擎', path: '/campaign/execution', requiredPermission: 'RULE_READ' },
      { key: 'campaign-opportunity', icon: <ThunderboltOutlined />, label: '机会智能', path: '/campaign/opportunity', requiredPermission: 'RULE_READ' },
      { key: 'campaign-simulation', icon: <BarChartOutlined />, label: '模拟优化', path: '/campaign/simulation', requiredPermission: 'RULE_READ' },
      { key: 'campaign-feedback', icon: <BellOutlined />, label: '反馈闭环', path: '/campaign/feedback', requiredPermission: 'AUDIT_READ' },
      { key: 'campaign-calendar', icon: <BarChartOutlined />, label: '活动日历', path: '/campaign/calendar', requiredPermission: 'RULE_READ' },
      { key: 'campaign-consent', icon: <SafetyCertificateOutlined />, label: '偏好管理', path: '/campaign/consent', requiredPermission: 'MEMBER_WRITE' },
      { key: 'campaign-strategy', icon: <ThunderboltOutlined />, label: '策略蓝图', path: '/campaign/strategy-blueprint', requiredPermission: 'RULE_READ' },
      { key: 'campaign-budget', icon: <DollarOutlined />, label: '预算节奏', path: '/campaign/budget-pacing', requiredPermission: 'RULE_READ' },
      { key: 'campaign-sharing', icon: <ApartmentOutlined />, label: '共享管理', path: '/campaign/sharing', requiredPermission: 'TENANT_WRITE' },
      { key: 'campaign-recommendation', icon: <RobotOutlined />, label: '推荐管理', path: '/campaign/recommendation', requiredPermission: 'RULE_READ' },
      { key: 'campaign-experiment', icon: <ExperimentOutlined />, label: '实验管理', path: '/campaign/experiment', requiredPermission: 'RULE_WRITE' },
    ],
  },
  {
    key: 'system-mgmt', icon: <SafetyCertificateOutlined />, label: '系统设置', requiredPermission: 'TENANT_READ',
    children: [
      { key: 'channel-pass', icon: <ApiOutlined />, label: '渠道会员通', path: '/system/channel-pass', requiredPermission: 'CHANNEL_READ' },
      { key: 'master-data', icon: <SettingOutlined />, label: '主数据管理', path: '/system/master-data', requiredPermission: 'TENANT_READ' },
      { key: 'page-designer', icon: <SettingOutlined />, label: '实体模型配置', path: '/entity-designer', requiredPermission: 'SCHEMA_WRITE' },
      { key: 'roles', icon: <SafetyCertificateOutlined />, label: '角色权限', path: '/system/roles', requiredPermission: 'TENANT_WRITE' },
      { key: 'users', icon: <UserOutlined />, label: '用户管理', path: '/system/users', requiredPermission: 'TENANT_WRITE' },
      { key: 'logs', icon: <FileTextOutlined />, label: '操作日志', path: '/system/logs', requiredPermission: 'AUDIT_READ' },
      { key: 'spi-logs', icon: <AuditOutlined />, label: 'SPI 日志', path: '/system/spi-logs', requiredPermission: 'AUDIT_READ' },
      { key: 'llm-config', icon: <RobotOutlined />, label: '大模型配置', path: '/system/llm-config', requiredPermission: 'TENANT_WRITE' },
      { key: 'campaign-dlq', icon: <WarningOutlined />, label: '死信队列', path: '/campaign/dlq', requiredPermission: 'AUDIT_READ' },
      { key: 'campaign-webhook', icon: <ApiOutlined />, label: 'Webhook 监控', path: '/campaign/webhook', requiredPermission: 'CHANNEL_READ' },
      { key: 'channel-list', icon: <ApiOutlined />, label: '渠道列表', path: '/channels', requiredPermission: 'CHANNEL_READ' },
      { key: 'audit', icon: <WarningOutlined />, label: '租户审计', path: '/system/audit', requiredPermission: 'AUDIT_READ' },
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
  const { currentProgramCode, programs, setCurrentProgram, online, setOnline, user, permissions, setUser } = useAppStore();
  const { token } = theme.useToken();

  // 根据用户权限过滤菜单
  const filteredMenuItems = filterMenuByPermissions(menuItems, permissions);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // 页面刷新/首次加载时从 token 恢复用户状态
  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    if (token && !user) {
      api.get('/auth/me').then(({ data }) => {
        if (data.code === 'SUCCESS' && data.data?.user) {
          const u = data.data.user;
          setUser(
            { userId: String(u.userId), username: u.username, displayName: u.displayName || u.username },
            data.data.permissions || [],
          );
        }
      }).catch(() => {
        // token 无效，清除
        sessionStorage.removeItem('auth_token');
      });
    }
  }, []);

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
    <>
      <style>{`
        :root {
          --campaign-title-size: 24px;
          --campaign-subtitle-size: 16px;
          --campaign-body-size: 14px;
          --campaign-caption-size: 12px;
          --campaign-label-size: 13px;
          --campaign-page-padding: 4px 24px 24px;
          --campaign-card-gap: 12px;
          --campaign-section-gap: 16px;
          --campaign-element-gap: 8px;
          --campaign-card-radius: 8px;
          --campaign-card-shadow: 0 1px 3px rgba(0,0,0,0.08);
          --campaign-input-sm: 120px;
          --campaign-input-md: 200px;
          --campaign-input-lg: 320px;
          --campaign-table-row-height: 48px;
          --campaign-table-font-size: 14px;
          --campaign-table-header-bg: #fafafa;
          --campaign-btn-radius: 6px;
          --campaign-primary: #1890ff;
          --campaign-text-primary: #262626;
          --campaign-text-secondary: #8c8c8c;
          --campaign-bg-light: #fafafa;
          --campaign-border: #f0f0f0;
        }
        .campaign-page { padding: var(--campaign-page-padding); }
        .campaign-page .campaign-page-title {
          font-size: var(--campaign-title-size); font-weight: 600; margin-bottom: 4px; line-height: 1.3;
        }
        .campaign-page .campaign-page-subtitle {
          font-size: var(--campaign-body-size); color: var(--campaign-text-secondary); margin-bottom: var(--campaign-section-gap);
        }
        .campaign-table .ant-table-thead > tr > th {
          font-size: var(--campaign-label-size); font-weight: 600; background: var(--campaign-table-header-bg);
          white-space: nowrap; padding: 10px 12px;
        }
        .campaign-table .ant-table-tbody > tr > td {
          font-size: var(--campaign-table-font-size); padding: 10px 12px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .campaign-toolbar {
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: var(--campaign-element-gap); margin-bottom: var(--campaign-card-gap);
        }
        .campaign-filter-bar {
          display: flex; align-items: center; flex-wrap: wrap;
          gap: var(--campaign-element-gap); padding: 8px 12px;
        }
        .campaign-filter-bar .ant-select { min-width: var(--campaign-input-sm); }
      `}</style>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1a1a1a',
            borderRadius: 6,
          },
          components: {
            Menu: {
            colorBgElevated: '#fff',
          },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#fff' }}>
        <style>{`
          /* 顶部菜单：禁用hover背景色 */
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu-title:hover,
          .app-shell-menu.ant-menu-horizontal .ant-menu-item:hover {
            background: transparent !important;
          }
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu-selected > .ant-menu-submenu-title:hover,
          .app-shell-menu.ant-menu-horizontal .ant-menu-item-selected:hover {
            background: transparent !important;
          }
          /* 选中项：无背景色 */
          .app-shell-menu.ant-menu-horizontal .ant-menu-item-selected,
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu-selected > .ant-menu-submenu-title {
            background: transparent !important;
          }
          /* 选中和hover下划线：完全统一 */
          .app-shell-menu.ant-menu-horizontal .ant-menu-item-selected,
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu-selected > .ant-menu-submenu-title,
          .app-shell-menu.ant-menu-horizontal .ant-menu-item:hover,
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu-title:hover {
            border-bottom: 3px solid #1a1a1a !important;
            border-radius: 0 !important;
          }
          /* 隐藏默认的 ::after 下划线 */
          .app-shell-menu.ant-menu-horizontal .ant-menu-item::after,
          .app-shell-menu.ant-menu-horizontal .ant-menu-submenu::after {
            display: none !important;
          }
          /* 顶部菜单下拉弹出层 */
          .ant-menu-submenu-popup > .ant-menu {
            background: #fff !important;
          }
          .ant-menu-submenu-popup .ant-menu-item {
            background: #fff !important;
          }
          .ant-menu-submenu-popup .ant-menu-item:hover {
            background: rgba(0, 0, 0, 0.04) !important;
          }
        `}</style>
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
            items={filteredMenuItems.map(group => ({
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
            className="app-shell-menu"
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
                <Text style={{ fontSize: 13, color: '#666' }}>{user?.displayName || '用户'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ====== 内容区域 ====== */}
        <Layout style={{ background: '#fff' }}>
          {!online && (
            <Alert type="warning" message="网络连接已断开，正在重连..." banner style={{ borderRadius: 0 }} />
          )}
          <Content style={{
            padding: 24,
            minHeight: 'calc(100vh - 56px - 32px)',
            height: 'auto',
            width: '100%',
            background: '#fff',
            display: 'block',
            flexDirection: 'column',
            overflow: 'visible',
          }}>
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
    </>
  );
};

export default AppShell;