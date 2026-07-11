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
const TierRuleConfig = lazy(() => import('../pages/TierRuleConfig'));
const TierActivityEditor = lazy(() => import('../pages/TierActivityEditor'));
const PointTypeManagement = lazy(() => import('../pages/PointTypeManagement'));
const VariableManagement = lazy(() => import('../pages/VariableManagement'));
const RuleEngineEditor = lazy(() => import('../pages/RuleEngineEditor'));
const RuleListPage = lazy(() => import('../pages/RuleListPage'));
const MasterDataManagement = lazy(() => import('../pages/MasterDataManagement'));
const ChannelMemberPass = lazy(() => import('../pages/ChannelMemberPass'));
const OneIdStrategyPage = lazy(() => import('../pages/OneIdStrategyPage'));
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
const UserManage = lazy(() => import('../pages/UserManage'));
const OperationLogs = lazy(() => import('../pages/OperationLogs'));
const SpiLogs = lazy(() => import('../pages/SpiLogs'));
const TenantAudit = lazy(() => import('../pages/TenantAudit'));
const AIRuleAssistant = lazy(() => import('../pages/AIRuleAssistant'));
const LlmConfig = lazy(() => import('../pages/LlmConfig'));
const PageDesigner = lazy(() => import('../pages/DesignerPage'));

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
const OpportunityScoringConfig = lazy(() => import('../pages/campaign/OpportunityScoringConfig'));
const EventTriggerDetailPage = lazy(() => import('../pages/campaign/EventTriggerDetailPage'));
const ConsentManagementPage = lazy(() => import('../pages/campaign/ConsentManagementPage'));
const ExperimentDashboardPage = lazy(() => import('../pages/campaign/ExperimentDashboardPage'));
const BudgetPacingPage = lazy(() => import('../pages/campaign/BudgetPacingPage'));
const CampaignCalendarPage = lazy(() => import('../pages/campaign/CampaignCalendarPage'));
const DlqManagementPage = lazy(() => import('../pages/campaign/DlqManagementPage'));
const WebhookMonitorPage = lazy(() => import('../pages/campaign/WebhookMonitorPage'));
const SharingManagementPage = lazy(() => import('../pages/campaign/SharingManagementPage'));
const RecommendationPage = lazy(() => import('../pages/campaign/RecommendationPage'));
const StrategyBlueprintPage = lazy(() => import('../pages/campaign/StrategyBlueprintPage'));
const TermsManagementPage = lazy(() => import('../pages/campaign/TermsManagementPage'));
const TermsConsentPage = lazy(() => import('../pages/campaign/TermsConsentPage'));

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

  // ====== 条款同意页（独立布局，无菜单 — 未接受章程时重定向至此） ======
  {
    path: '/terms/consent',
    element: <SuspenseWrapper><TermsConsentPage /></SuspenseWrapper>,
  },

  // ====== 主应用（AppShell 布局 — 完成基础设置后才使用） ======
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },

      // 仪表盘（所有已认证用户可访问）
      {
        path: 'dashboard',
        element: <SuspenseWrapper><AuthGuard><Dashboard /></AuthGuard></SuspenseWrapper>,
      },

      // Program 管理
      {
        path: 'programs',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_READ"><ProgramList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'programs/new',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><ProgramEdit /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'programs/:code/edit',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><ProgramEdit /></AuthGuard></SuspenseWrapper>,
      },

      // Schema 编辑器
      {
        path: 'schema-editor',
        element: <SuspenseWrapper><AuthGuard permission="SCHEMA_READ"><SchemaEditor /></AuthGuard></SuspenseWrapper>,
      },

      // 实体设计器
      {
        path: 'entity-designer',
        element: <SuspenseWrapper><AuthGuard permission="SCHEMA_WRITE"><PageDesigner /></AuthGuard></SuspenseWrapper>,
      },

      // ChartDB
      {
        path: 'chartdb',
        element: <SuspenseWrapper><AuthGuard permission="SCHEMA_WRITE"><ChartDBPage /></AuthGuard></SuspenseWrapper>,
      },

      // API 流程设计器
      {
        path: 'api-flow',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_WRITE"><ApiFlowDesigner /></AuthGuard></SuspenseWrapper>,
      },

      // 会员中心
      {
        path: 'members',
        element: <SuspenseWrapper><AuthGuard permission="MEMBER_READ"><MemberService /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'members/:id',
        element: <SuspenseWrapper><AuthGuard permission="MEMBER_READ"><MemberDetail /></AuthGuard></SuspenseWrapper>,
      },

      // 积分管理
      {
        path: 'points/type',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_GRANT"><PointTypeManagement /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/accounts',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_GRANT"><PointsAccounts /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/transactions',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_GRANT"><PointsTransactions /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/grant',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_GRANT"><PointsGrant /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'points/redeem',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_REDEEM"><PointsRedeem /></AuthGuard></SuspenseWrapper>,
      },

      // 等级与规则
      {
        path: 'tiers',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><TierConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier/config',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><TierRuleConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier/activity/new',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><TierActivityEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/tier',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><TierRuleConfig /></AuthGuard></SuspenseWrapper>,
      },
      // 规则配置平台（新）
      // 规则设计器（新 - point_rule_1.md）
      // 规则引擎编辑器（u.md 三栏布局）
      {
        path: 'rules',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><RuleListPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/engine',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><RuleEngineEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/engine/:id/edit',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><RuleEngineEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'variables',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><VariableManagement /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'rules/ai',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><AIRuleAssistant /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'flow-designer',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><FlowDesigner /></AuthGuard></SuspenseWrapper>,
      },

      // ====== Campaign 营销管理 ======
      {
        path: 'campaign/workspaces',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><CampaignWorkspaceList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/workspaces/new',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><CampaignWorkspaceCreate /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/workspace/:workspaceId',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><CampaignWorkspaceDetail /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/decision',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><DecisionEnginePage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/simulation',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><SimulationOptimizationPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/canvas/:planId',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><CampaignCanvasEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/canvas/new',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><CampaignCanvasEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/content',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><ContentManagementPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/intervention',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><InterventionDashboard /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/execution',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><ExecutionMonitor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/feedback',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><FeedbackAnalysisPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/opportunity',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><OpportunityIntelligencePage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/opportunity/config',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><OpportunityScoringConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/event-trigger/:planId',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><EventTriggerDetailPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/consent',
        element: <SuspenseWrapper><AuthGuard permission="MEMBER_WRITE"><ConsentManagementPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/experiment',
        element: <SuspenseWrapper><AuthGuard permission="RULE_WRITE"><ExperimentDashboardPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/budget-pacing',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><BudgetPacingPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/calendar',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><CampaignCalendarPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/dlq',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><DlqManagementPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/webhook',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_READ"><WebhookMonitorPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/sharing',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><SharingManagementPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/recommendation',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><RecommendationPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/strategy-blueprint',
        element: <SuspenseWrapper><AuthGuard permission="RULE_READ"><StrategyBlueprintPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'campaign/terms',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><TermsManagementPage /></AuthGuard></SuspenseWrapper>,
      },

      // API 配置管理
      {
        path: 'api-config',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_WRITE"><ApiConfig /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'api-config/:id/mapping',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_WRITE"><ApiMappingConfig /></AuthGuard></SuspenseWrapper>,
      },

      // 渠道集成
      {
        path: 'channels',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_READ"><ChannelList /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'channels/:id/mapping',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_WRITE"><MappingEditor /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'channels/scripting',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_WRITE"><ScriptingWorkbench defaultChannel="TMALL" /></AuthGuard></SuspenseWrapper>,
      },

      // 运维监控
      {
        path: 'ops/event-inbox',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><EventInbox /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'ops/notifications',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><NotificationPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'ops/redemption-cancel',
        element: <SuspenseWrapper><AuthGuard permission="POINTS_ADJUST"><RedemptionCancellation /></AuthGuard></SuspenseWrapper>,
      },

      // 系统设置
      {
        path: 'system/llm-config',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><LlmConfig /></AuthGuard></SuspenseWrapper>,
      },
      // 主数据管理
      // 渠道会员通
      // One-ID 策略
      {
        path: 'system/oneid-strategy',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_READ"><OneIdStrategyPage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/channel-pass',
        element: <SuspenseWrapper><AuthGuard permission="CHANNEL_READ"><ChannelMemberPass /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/master-data',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_READ"><MasterDataManagement /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/roles',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><RoleManage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/users',
        element: <SuspenseWrapper><AuthGuard permission="TENANT_WRITE"><UserManage /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/logs',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><OperationLogs /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/spi-logs',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><SpiLogs /></AuthGuard></SuspenseWrapper>,
      },
      {
        path: 'system/audit',
        element: <SuspenseWrapper><AuthGuard permission="AUDIT_READ"><TenantAudit /></AuthGuard></SuspenseWrapper>,
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