import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { useAppStore } from '../store';
import AppShell from '../layouts/AppShell';

// ==================== 懒加载页面 ====================

// 登录（独立页面，无 AppShell）
const LoginPage = lazy(() => import('../pages/LoginPage'));

// 引导页（独立页面，无 AppShell — 基础信息未配置前不应看到菜单）
const Onboarding = lazy(() => import('../pages/Onboarding'));

// 业务页面（AppShell 包裹）
const Dashboard = lazy(() => import('../pages/Dashboard'));
const ProgramList = lazy(() => import('../pages/ProgramList'));
const ProgramEdit = lazy(() => import('../pages/ProgramEdit'));
const MemberList = lazy(() => import('../pages/MemberList'));
const MemberService = lazy(() => import('../pages/MemberService'));
const MemberDetail = lazy(() => import('../pages/MemberDetail'));
const PointsAccounts = lazy(() => import('../pages/PointsAccounts'));
const PointsTransactions = lazy(() => import('../pages/PointsTransactions'));
const PointsGrant = lazy(() => import('../pages/PointsGrant'));
const PointsRedeem = lazy(() => import('../pages/PointsRedeem'));
const TierConfig = lazy(() => import('../pages/TierConfig'));
const RuleList = lazy(() => import('../pages/RuleList'));
const TierRuleConfig = lazy(() => import('../pages/TierRuleConfig'));
const TierRuleList = lazy(() => import('../pages/TierRuleList'));
const TierActivityEditor = lazy(() => import('../pages/TierActivityEditor'));
const RuleEditor = lazy(() => import('../pages/RuleEditor'));
const PromoEditor = lazy(() => import('../pages/PromoEditor'));
const SandboxTest = lazy(() => import('../pages/SandboxTest'));
const FlowDesigner = lazy(() => import('../pages/FlowDesigner'));
const ChannelList = lazy(() => import('../pages/ChannelList'));
const MappingEditor = lazy(() => import('../pages/MappingEditor'));
const ScriptingWorkbench = lazy(() => import('../components/ScriptingWorkbench/ScriptingWorkbench'));
const SchemaEditor = lazy(() => import('../pages/SchemaEditor'));
const ChartDBPage = lazy(() => import('../pages/ChartDBPage'));
const ApiFlowDesigner = lazy(() => import('../pages/ApiFlowDesigner'));
const DynamicRenderer = lazy(() => import('../components/DynamicRenderer/DynamicRenderer'));
const ApiConfig = lazy(() => import('../pages/ApiConfig'));
const ApiMappingConfig = lazy(() => import('../pages/ApiMappingConfig'));
const RedemptionCancellation = lazy(() => import('../components/RedemptionCancellation'));
const EventInbox = lazy(() => import('../pages/EventInbox'));
const NotificationPage = lazy(() => import('../pages/NotificationPage'));
const RoleManage = lazy(() => import('../pages/RoleManage'));
const OperationLogs = lazy(() => import('../pages/OperationLogs'));
const SpiLogs = lazy(() => import('../pages/SpiLogs'));
const TenantAudit = lazy(() => import('../pages/TenantAudit'));
const AIRuleAssistant = lazy(() => import('../pages/AIRuleAssistant'));
const LlmConfig = lazy(() => import('../pages/LlmConfig'));

// Campaign 营销管理
const CampaignWorkspaceList = lazy(() => import('../pages/campaign/CampaignWorkspaceList'));
const CampaignWorkspaceCreate = lazy(() => import('../pages/campaign/CampaignWorkspaceCreate'));
const CampaignWorkspaceDetail = lazy(() => import('../pages/campaign/CampaignWorkspaceDetail'));
const DecisionEnginePage = lazy(() => import('../pages/campaign/DecisionEnginePage'));
const SimulationOptimizationPage = lazy(() => import('../pages/campaign/SimulationOptimizationPage'));
const CampaignCanvasEditor = lazy(() => import('../pages/campaign/CampaignCanvasEditor'));
const ContentManagementPage = lazy(() => import('../pages/campaign/ContentManagementPage'));
const InterventionDashboard = lazy(() => import('../pages/campaign/InterventionDashboard'));
const ExecutionMonitor = lazy(() => import('../pages/campaign/ExecutionMonitor'));
const FeedbackAnalysisPage = lazy(() => import('../pages/campaign/FeedbackAnalysisPage'));
const OpportunityIntelligencePage = lazy(() => import('../pages/campaign/OpportunityIntelligencePage'));

// ==================== 加载占位 ====================

const PageLoading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoading />}>{children}</Suspense>
);

// ==================== 权限守卫 ====================

const AuthGuard: React.FC<{ permission?: string; children: React.ReactNode }> = ({ permission, children }) => {
  const { permissions } = useAppStore();
  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/403" />;
  }
  return <>{children}</>;
};

// ==================== 路由配置 ====================

export const router = createBrowserRouter([
  // ====== 登录页（独立布局） ======
  {
    path: '/login',
    element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
  },

  // ====== 引导页（独立布局，无菜单 — 新用户必须完成基础设置） ======
  {
    path: '/onboarding',
    element: <SuspenseWrapper><Onboarding /></SuspenseWrapper>,
  },

  // ====== 主应用（AppShell 布局 — 完成基础设置后才使用） ======
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },

      // 仪表盘
      {
        path: 'dashboard',
        element: <SuspenseWrapper><AuthGuard><Dashboard /></AuthGuard></SuspenseWrapper>,
      },

      // Program 管理
      {
        path: 'programs',
        element: <SuspenseWrapper><AuthGuard><ProgramList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'programs/new',
        element: <SuspenseWrapper><AuthGuard><ProgramEdit /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'programs/:code/edit',
        element: <SuspenseWrapper><AuthGuard><ProgramEdit /></AuthGuard></SuspenseWrapper>,
      },

      // Schema 编辑器
      {
        path: 'schema-editor',
        element: <SuspenseWrapper><AuthGuard><SchemaEditor /></AuthGuard></SuspenseWrapper>,
      },

      // ChartDB
      {
        path: 'chartdb',
        element: <SuspenseWrapper><AuthGuard><ChartDBPage /></AuthGuard></SuspenseWrapper>,
      },

      // API 流程设计器
      {
        path: 'api-flow',
        element: <SuspenseWrapper><AuthGuard><ApiFlowDesigner /></AuthGuard></SuspenseWrapper>,
      },

      // 会员中心
      {
        path: 'members',
        element: <SuspenseWrapper><AuthGuard><MemberService /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'members/:id',
        element: <SuspenseWrapper><AuthGuard><MemberDetail /></AuthGuard></SuspenseWrapper>,
      },

      // 积分管理
      {
        path: 'points/accounts',
        element: <SuspenseWrapper><AuthGuard><PointsAccounts /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/transactions',
        element: <SuspenseWrapper><AuthGuard><PointsTransactions /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/grant',
        element: <SuspenseWrapper><AuthGuard><PointsGrant /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/redeem',
        element: <SuspenseWrapper><AuthGuard><PointsRedeem /></AuthGuard></SuspenseWrapper>,
      },

      // 等级与规则
      {
        path: 'tiers',
        element: <SuspenseWrapper><AuthGuard><TierConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier/config',
        element: <SuspenseWrapper><AuthGuard><TierRuleConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier/activity/new',
        element: <SuspenseWrapper><AuthGuard><TierActivityEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier',
        element: <SuspenseWrapper><AuthGuard><TierRuleList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules',
        element: <SuspenseWrapper><AuthGuard><RuleList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/promo/new',
        element: <SuspenseWrapper><AuthGuard><PromoEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/promo/:id/edit',
        element: <SuspenseWrapper><AuthGuard><PromoEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/new',
        element: <SuspenseWrapper><AuthGuard><RuleEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/:id/edit',
        element: <SuspenseWrapper><AuthGuard><RuleEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/:id/test',
        element: <SuspenseWrapper><AuthGuard><SandboxTest /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/ai',
        element: <SuspenseWrapper><AuthGuard><AIRuleAssistant /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'flow-designer',
        element: <SuspenseWrapper><AuthGuard><FlowDesigner /></AuthGuard></SuspenseWrapper>,
      },

      // ====== Campaign 营销管理 ======
      {
        path: 'campaign/workspaces',
        element: <SuspenseWrapper><AuthGuard><CampaignWorkspaceList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/workspaces/new',
        element: <SuspenseWrapper><AuthGuard><CampaignWorkspaceCreate /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/workspace/:workspaceId',
        element: <SuspenseWrapper><AuthGuard><CampaignWorkspaceDetail /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/decision',
        element: <SuspenseWrapper><AuthGuard><DecisionEnginePage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/simulation',
        element: <SuspenseWrapper><AuthGuard><SimulationOptimizationPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/canvas/:planId',
        element: <SuspenseWrapper><AuthGuard><CampaignCanvasEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/canvas/new',
        element: <SuspenseWrapper><AuthGuard><CampaignCanvasEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/content',
        element: <SuspenseWrapper><AuthGuard><ContentManagementPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/intervention',
        element: <SuspenseWrapper><AuthGuard><InterventionDashboard /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/execution',
        element: <SuspenseWrapper><AuthGuard><ExecutionMonitor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/feedback',
        element: <SuspenseWrapper><AuthGuard><FeedbackAnalysisPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/opportunity',
        element: <SuspenseWrapper><AuthGuard><OpportunityIntelligencePage /></AuthGuard></SuspenseWrapper>,
      },

      // API 配置管理
      {
        path: 'api-config',
        element: <SuspenseWrapper><AuthGuard><ApiConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'api-config/:id/mapping',
        element: <SuspenseWrapper><AuthGuard><ApiMappingConfig /></AuthGuard></SuspenseWrapper>,
      },

      // 渠道集成
      {
        path: 'channels',
        element: <SuspenseWrapper><AuthGuard><ChannelList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'channels/:id/mapping',
        element: <SuspenseWrapper><AuthGuard><MappingEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'channels/scripting',
        element: <SuspenseWrapper><AuthGuard><ScriptingWorkbench defaultChannel="TMALL" /></AuthGuard></SuspenseWrapper>,
      },

      // 运维监控
      {
        path: 'ops/event-inbox',
        element: <SuspenseWrapper><AuthGuard><EventInbox /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'ops/notifications',
        element: <SuspenseWrapper><AuthGuard><NotificationPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'ops/redemption-cancel',
        element: <SuspenseWrapper><AuthGuard><RedemptionCancellation /></AuthGuard></SuspenseWrapper>,
      },

      // 系统设置
      {
        path: 'system/llm-config',
        element: <SuspenseWrapper><AuthGuard><LlmConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/roles',
        element: <SuspenseWrapper><AuthGuard><RoleManage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/logs',
        element: <SuspenseWrapper><AuthGuard><OperationLogs /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/spi-logs',
        element: <SuspenseWrapper><AuthGuard><SpiLogs /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/audit',
        element: <SuspenseWrapper><AuthGuard><TenantAudit /></AuthGuard></SuspenseWrapper>,
      },

      // 403
      {
        path: '403',
        element: (
          <Result
            status="403"
            title="403"
            subTitle="抱歉，您没有权限访问此页面"
            extra={<Button type="primary" onClick={() => window.location.href = '/dashboard'}>返回首页</Button>}
          />
        ),
      },

      // 404
      {
        path: '*',
        element: (
          <Result
            status="404"
            title="404"
            subTitle="抱歉，页面不存在"
            extra={<Button type="primary" onClick={() => window.location.href = '/dashboard'}>返回首页</Button>}
          />
        ),
      },
    ],
  },
]);

export default router;