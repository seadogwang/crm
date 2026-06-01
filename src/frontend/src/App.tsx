import React, { useState } from 'react';
import { ConfigProvider, Layout, Menu, theme, Typography } from 'antd';
import {
  PartitionOutlined, BuildOutlined, FormOutlined, CodeOutlined,
  TeamOutlined, DollarOutlined, CrownOutlined, ThunderboltOutlined,
  ApiOutlined, InboxOutlined, AuditOutlined, DashboardOutlined,
  SettingOutlined, BellOutlined, HistoryOutlined,
} from '@ant-design/icons';
import EntityModeler from './components/EntityModeler/EntityModeler';
import SchemaBuilder from './components/SchemaBuilder/SchemaBuilder';
import DynamicRenderer from './components/DynamicRenderer/DynamicRenderer';
import ScriptingWorkbench from './components/ScriptingWorkbench/ScriptingWorkbench';
import MemberList from './pages/MemberList';
import PointsGrant from './pages/PointsGrant';
import PointsRedeem from './pages/PointsRedeem';
import PointsHistory from './pages/PointsHistory';
import TierConfig from './pages/TierConfig';
import RuleManagement from './pages/RuleManagement';
import ChannelConfig from './pages/ChannelConfig';
import EventInbox from './pages/EventInbox';
import AuditLogs from './pages/AuditLogs';
import NotificationPage from './pages/NotificationPage';

const { Sider, Content } = Layout;
const { Text } = Typography;

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  {
    key: 'modeling', icon: <DashboardOutlined />, label: '数据建模',
    children: [
      { key: 'entity-modeler', icon: <PartitionOutlined />, label: '实体建模器' },
      { key: 'form-designer', icon: <BuildOutlined />, label: '表单设计器' },
    ],
  },
  {
    key: 'member', icon: <TeamOutlined />, label: '会员管理',
    children: [
      { key: 'member-list', icon: <TeamOutlined />, label: '会员列表' },
      { key: 'dynamic-renderer', icon: <FormOutlined />, label: '会员详情/编辑' },
    ],
  },
  {
    key: 'points', icon: <DollarOutlined />, label: '积分管理',
    children: [
      { key: 'points-grant', icon: <DollarOutlined />, label: '积分发放' },
      { key: 'points-redeem', icon: <ThunderboltOutlined />, label: '积分核销' },
      { key: 'points-history', icon: <HistoryOutlined />, label: '流水查询' },
    ],
  },
  {
    key: 'tier-rule', icon: <CrownOutlined />, label: '等级与规则',
    children: [
      { key: 'tier-config', icon: <CrownOutlined />, label: '等级阶梯配置' },
      { key: 'rule-management', icon: <SettingOutlined />, label: '规则管理' },
    ],
  },
  {
    key: 'channel', icon: <ApiOutlined />, label: '渠道集成',
    children: [
      { key: 'channel-config', icon: <ApiOutlined />, label: '渠道配置' },
      { key: 'scripting', icon: <CodeOutlined />, label: '脚本工作台' },
    ],
  },
  {
    key: 'ops', icon: <InboxOutlined />, label: '运维监控',
    children: [
      { key: 'event-inbox', icon: <InboxOutlined />, label: '事件收件箱' },
      { key: 'audit-logs', icon: <AuditOutlined />, label: '审计日志' },
      { key: 'notification', icon: <BellOutlined />, label: '通知管理' },
    ],
  },
];

type PageKey = 'entity-modeler' | 'form-designer' | 'member-list' | 'dynamic-renderer' |
  'points-grant' | 'points-redeem' | 'points-history' | 'tier-config' | 'rule-management' |
  'channel-config' | 'scripting' | 'event-inbox' | 'audit-logs' | 'notification';

const PAGE_TITLES: Record<PageKey, string> = {
  'entity-modeler': '实体建模器', 'form-designer': '表单设计器',
  'member-list': '会员管理', 'dynamic-renderer': '会员详情',
  'points-grant': '积分发放', 'points-redeem': '积分核销', 'points-history': '流水查询',
  'tier-config': '等级阶梯配置', 'rule-management': '规则管理',
  'channel-config': '渠道配置', 'scripting': '脚本工作台',
  'event-inbox': '事件收件箱', 'audit-logs': '审计日志', 'notification': '通知管理',
};

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageKey>('member-list');
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  const renderPage = () => {
    switch (activePage) {
      case 'entity-modeler': return <EntityModeler />;
      case 'form-designer': return <SchemaBuilder entityType="MEMBER" />;
      case 'member-list': return <MemberList />;
      case 'dynamic-renderer': return <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}><DynamicRenderer programCode="PROG001" memberId={8821} /></div>;
      case 'points-grant': return <PointsGrant />;
      case 'points-redeem': return <PointsRedeem />;
      case 'points-history': return <PointsHistory />;
      case 'tier-config': return <TierConfig />;
      case 'rule-management': return <RuleManagement />;
      case 'channel-config': return <ChannelConfig />;
      case 'scripting': return <ScriptingWorkbench defaultChannel="TMALL" />;
      case 'event-inbox': return <EventInbox />;
      case 'audit-logs': return <AuditLogs />;
      case 'notification': return <NotificationPage />;
      default: return null;
    }
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}
          style={{ background: token.colorBgContainer }} width={220}>
          <div style={{ padding: '16px', textAlign: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <Text strong style={{ fontSize: collapsed ? 12 : 15 }}>Loyalty SaaS</Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activePage]}
            defaultOpenKeys={['member', 'points', 'ops']}
            onClick={({ key }) => setActivePage(key as PageKey)}
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
            style={{ borderRight: 0 }}
          />
        </Sider>
        <Layout>
          <Content style={{ padding: 24, background: token.colorBgLayout, minHeight: '100vh' }}>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 20, fontWeight: 600 }}>
                {PAGE_TITLES[activePage]}
              </Text>
            </div>
            {renderPage()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;