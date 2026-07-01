import api from './index';
import type { ApiResponse } from '../types';

// ==================== Types ====================

export interface CampaignWorkspace {
  id: string;
  programCode: string;
  name: string;
  description: string;
  status: string;
  activeGoalId: string | null;
  config: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignGoal {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  goalType: string;
  status: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  startTime: string;
  endTime: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kpis?: CampaignKpi[];
  progress?: number;
}

export interface CampaignKpi {
  id: string;
  kpiType: string;
  targetValue: number;
  currentValue: number;
  weight: number;
}

export interface CampaignInitiative {
  id: string;
  workspaceId: string;
  goalId: string;
  name: string;
  description: string;
  initiativeType: string;
  status: string;
  priority: number;
  startTime: string;
  endTime: string;
  ruleConfig: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  kpis?: CampaignKpi[];
}

export interface CampaignPortfolio {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: string;
  optimizationMode: string;
  totalBudget: number;
  startTime: string;
  endTime: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  allocations?: PortfolioAllocation[];
}

export interface PortfolioAllocation {
  initiativeId: string;
  initiativeName: string;
  allocatedBudget: number;
  expectedROI: number;
  priorityWeight: number;
  percentage: number;
}

export interface WorkspaceContext {
  workspace: CampaignWorkspace;
  activeGoal: CampaignGoal | null;
  initiatives: CampaignInitiative[];
  portfolios: CampaignPortfolio[];
}

// ==================== Workspace API ====================

export async function createWorkspace(data: {
  name: string;
  programCode: string;
  description?: string;
  config?: Record<string, any>;
}) {
  const res = await api.post<ApiResponse<CampaignWorkspace>>('/campaign/workspace', data);
  return res.data.data;
}

export async function getWorkspace(workspaceId: string) {
  const res = await api.get<ApiResponse<CampaignWorkspace>>(`/campaign/workspace/${workspaceId}`);
  return res.data.data;
}

export async function updateWorkspace(workspaceId: string, data: Partial<CampaignWorkspace>) {
  const res = await api.put<ApiResponse<CampaignWorkspace>>(`/campaign/workspace/${workspaceId}`, data);
  return res.data.data;
}

export async function archiveWorkspace(workspaceId: string) {
  const res = await api.post<ApiResponse<CampaignWorkspace>>(`/campaign/workspace/${workspaceId}/archive`);
  return res.data.data;
}

export async function listWorkspaces(params?: { programCode?: string; userId?: string }) {
  const res = await api.get<ApiResponse<CampaignWorkspace[]>>('/campaign/workspace', { params });
  return res.data.data;
}

export async function loadWorkspaceContext(workspaceId: string) {
  const res = await api.get<ApiResponse<WorkspaceContext>>(`/campaign/workspace/${workspaceId}/context`);
  return res.data.data;
}

// ==================== Goal API ====================

export async function createGoal(data: {
  workspaceId: string;
  name: string;
  description?: string;
  goalType: string;
  targetMetric?: string;
  targetValue: number;
  startTime?: string;
  endTime?: string;
  kpis?: { kpiType: string; targetValue: number; weight?: number }[];
}) {
  const res = await api.post<ApiResponse<CampaignGoal>>('/campaign/goal', data);
  return res.data.data;
}

export async function getGoal(goalId: string) {
  const res = await api.get<ApiResponse<CampaignGoal>>(`/campaign/goal/${goalId}`);
  return res.data.data;
}

export async function getGoalsByWorkspace(workspaceId: string) {
  const res = await api.get<ApiResponse<CampaignGoal[]>>(`/campaign/goal/workspace/${workspaceId}`);
  return res.data.data;
}

export async function activateGoal(goalId: string) {
  const res = await api.post<ApiResponse<CampaignGoal>>(`/campaign/goal/${goalId}/activate`);
  return res.data.data;
}

export async function pauseGoal(goalId: string) {
  const res = await api.post<ApiResponse<CampaignGoal>>(`/campaign/goal/${goalId}/pause`);
  return res.data.data;
}

export async function completeGoal(goalId: string) {
  const res = await api.post<ApiResponse<CampaignGoal>>(`/campaign/goal/${goalId}/complete`);
  return res.data.data;
}

export async function archiveGoal(goalId: string) {
  const res = await api.post<ApiResponse<CampaignGoal>>(`/campaign/goal/${goalId}/archive`);
  return res.data.data;
}

// ==================== Initiative API ====================

export async function createInitiative(data: {
  goalId: string;
  name: string;
  description?: string;
  initiativeType: string;
  priority?: number;
  startTime?: string;
  endTime?: string;
  ruleConfig?: Record<string, any>;
  kpis?: { kpiType: string; targetValue: number; weight?: number }[];
}) {
  const res = await api.post<ApiResponse<CampaignInitiative>>('/campaign/initiative', data);
  return res.data.data;
}

export async function getInitiativesByGoal(goalId: string) {
  const res = await api.get<ApiResponse<CampaignInitiative[]>>(`/campaign/initiative/goal/${goalId}`);
  return res.data.data;
}

export async function getInitiativesByWorkspace(workspaceId: string) {
  const res = await api.get<ApiResponse<CampaignInitiative[]>>(`/campaign/initiative/workspace/${workspaceId}`);
  return res.data.data;
}

export async function activateInitiative(initiativeId: string) {
  const res = await api.post<ApiResponse<CampaignInitiative>>(`/campaign/initiative/${initiativeId}/activate`);
  return res.data.data;
}

export async function pauseInitiative(initiativeId: string) {
  const res = await api.post<ApiResponse<CampaignInitiative>>(`/campaign/initiative/${initiativeId}/pause`);
  return res.data.data;
}

// ==================== Portfolio API ====================

export async function createPortfolio(data: {
  workspaceId: string;
  name: string;
  description?: string;
  optimizationMode?: string;
  totalBudget: number;
  startTime?: string;
  endTime?: string;
}) {
  const res = await api.post<ApiResponse<CampaignPortfolio>>('/campaign/portfolio', data);
  return res.data.data;
}

export async function getPortfoliosByWorkspace(workspaceId: string) {
  const res = await api.get<ApiResponse<CampaignPortfolio[]>>(`/campaign/portfolio/workspace/${workspaceId}`);
  return res.data.data;
}

export async function optimizePortfolio(portfolioId: string) {
  const res = await api.post<ApiResponse<CampaignPortfolio>>(`/campaign/portfolio/${portfolioId}/optimize`);
  return res.data.data;
}

export async function lockPortfolio(portfolioId: string) {
  const res = await api.post<ApiResponse<CampaignPortfolio>>(`/campaign/portfolio/${portfolioId}/lock`);
  return res.data.data;
}

// ==================== Decision Engine API ====================

export interface CampaignCandidate {
  id: string;
  name: string;
  initiativeId: string;
  recommendedBudget: number;
  minBudget: number;
  maxBudget: number;
  expectedROI: number;
  opportunityScore: number;
  strategicWeight: number;
  recencyBoost: number;
  channel: string;
  segment: string;
}

export interface AllocationItem {
  candidateId: string;
  candidateName: string;
  initiativeId: string;
  allocatedBudget: number;
  expectedROI: number;
  priorityScore: number;
  percentage: number;
}

export interface AllocationResult {
  portfolioId: string;
  totalBudget: number;
  totalExpectedROI: number;
  allocations: AllocationItem[];
}

export interface SimulationResult {
  candidateId: string;
  exposureRate: number;
  behaviorRate: number;
  conversionRate: number;
  expectedRevenue: number;
  expectedROI: number;
  estimatedReach: number;
  estimatedConversions: number;
  modelDetails: Record<string, any>;
}

/** 预算分配 */
export async function allocateBudget(candidates: CampaignCandidate[], totalBudget: number) {
  const res = await api.post<ApiResponse<AllocationResult>>('/campaign/decision/allocate', { candidates, totalBudget });
  return res.data.data;
}

/** 带约束分配 */
export async function allocateWithConstraints(
  candidates: CampaignCandidate[], totalBudget: number, channelCapacity: Record<string, number>
) {
  const res = await api.post<ApiResponse<AllocationResult>>('/campaign/decision/allocate/constrained', {
    candidates, totalBudget, channelCapacity,
  });
  return res.data.data;
}

/** 冲突仲裁排序 */
export async function prioritizeCandidates(candidates: CampaignCandidate[]) {
  const res = await api.post<ApiResponse<CampaignCandidate[]>>('/campaign/decision/prioritize', candidates);
  return res.data.data;
}

/** 模拟预测 */
export async function simulateCampaign(candidate: CampaignCandidate, audienceSize: number) {
  const res = await api.post<ApiResponse<SimulationResult>>('/campaign/decision/simulate', { candidate, audienceSize });
  return res.data.data;
}

/** 批量模拟 */
export async function simulateBatch(candidates: CampaignCandidate[], audienceSize: number) {
  const res = await api.post<ApiResponse<SimulationResult[]>>('/campaign/decision/simulate/batch', { candidates, audienceSize });
  return res.data.data;
}

/** 注意力预算检查 */
export async function checkAttentionBudget(userId: string, channel: string) {
  const res = await api.get(`/campaign/decision/attention/${userId}/${channel}`);
  return res.data.data;
}

// ==================== Decision Engine v2 API ====================

export interface DecisionConstraints {
  channelCapacity?: Record<string, number>;
  maxFrequencyPerUser?: number;
  minROIThreshold?: number;
  blacklistSegments?: string[];
}

export interface DecisionRequest {
  workspaceId: string;
  portfolioId: string;
  goalId: string;
  constraints?: DecisionConstraints;
}

export interface AllocationDetail {
  initiativeId: string;
  initiativeName: string;
  allocatedBudget: number;
  expectedRoi: number;
  percentage: number;
  executionOrder: number;
  priorityScore: number;
  opportunityCount: number;
  targetUserCount: number | null;
  status: string;
}

export interface ArbitrationSummary {
  userConflicts: number;
  budgetConflicts: number;
  channelConflicts: number;
  resolved: number;
}

export interface DecisionResultResponse {
  decisionId: string;
  workspaceId: string;
  portfolioId: string;
  goalId: string;
  decisionType: string;
  status: string;
  totalBudget: number;
  totalAllocated: number;
  expectedTotalRoi: number;
  conflictsResolved: number;
  rejectedCandidates: number;
  allocations: AllocationDetail[];
  arbitrationSummary: ArbitrationSummary;
  createdBy: string;
  createdAt: string;
  appliedAt: string;
}

export interface DecisionSummary {
  decisionId: string;
  workspaceId: string;
  portfolioId: string;
  decisionType: string;
  status: string;
  totalBudget: number;
  totalAllocated: number;
  expectedTotalRoi: number;
  allocationCount: number;
  conflictsResolved: number;
  createdBy: string;
  createdAt: string;
  appliedAt: string;
}

/** 执行完整决策 */
export async function executeDecision(request: DecisionRequest) {
  const res = await api.post<ApiResponse<DecisionResultResponse>>('/campaign/decision/execute', request);
  return res.data.data;
}

/** 应用决策 */
export async function applyDecision(decisionId: string) {
  const res = await api.post<ApiResponse<DecisionResultResponse>>(`/campaign/decision/${decisionId}/apply`);
  return res.data.data;
}

/** 获取最新决策 */
export async function getLatestDecision(portfolioId: string) {
  const res = await api.get<ApiResponse<DecisionResultResponse>>('/campaign/decision/latest', { params: { portfolioId } });
  return res.data.data;
}

/** 获取决策详情 */
export async function getDecisionDetail(decisionId: string) {
  const res = await api.get<ApiResponse<DecisionResultResponse>>(`/campaign/decision/${decisionId}`);
  return res.data.data;
}

/** 获取历史决策 */
export async function getDecisionHistory(workspaceId: string, page = 0, size = 20) {
  const res = await api.get('/campaign/decision/history', { params: { workspaceId, page, size } });
  return res.data.data;
}

/** 回滚决策 */
export async function rollbackDecision(decisionId: string, reason?: string) {
  const res = await api.post(`/campaign/decision/${decisionId}/rollback`, { reason: reason || 'Manual rollback' });
  return res.data.data;
}

// ==================== Canvas DAG API ====================

export interface CampaignPlan {
  id: string;
  workspaceId: string;
  goalId: string;
  initiativeId: string;
  name: string;
  description: string;
  status: string;
  totalBudget: number;
  expectedRoi: number;
  strategyJson: string;
  allocationJson: string;
  graphJson: string;
  forecastJson: string;
  zeebeProcessId: string;
  zeebeVersion: number;
  zeebeInstanceKey: number;
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  /** MANUAL / EVENT_TRIGGERED / SCHEDULED / HYBRID */
  triggerType: string;
  triggerConfigId: string;
  estimatedTriggerCount: number;
  costPerTrigger: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, any>;
  x?: number;
  y?: number;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
}

export interface CanvasDag {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AIRequest {
  goal: string;
  description?: string;
  budget?: string;
  audience?: string;
  channel?: string;
  additionalInstructions?: string;
}

export interface NodeTypeInfo {
  type: string;
  label: string;
  category: string;
  description: string;
  configFields: string[];
}

/** 创建计划 */
export async function createPlan(plan: Partial<CampaignPlan>) {
  const res = await api.post<ApiResponse<CampaignPlan>>('/campaign/canvas/plan', plan);
  return res.data.data;
}

/** 获取计划 */
export async function getPlan(planId: string) {
  const res = await api.get<ApiResponse<CampaignPlan>>(`/campaign/canvas/plan/${planId}`);
  return res.data.data;
}

/** 保存 DAG */
export async function saveDag(planId: string, dag: CanvasDag) {
  const res = await api.put<ApiResponse<CampaignPlan>>(`/campaign/canvas/plan/${planId}/dag`, dag);
  return res.data.data;
}

/** 校验 DAG */
export async function validateDag(dag: CanvasDag) {
  const res = await api.post<ApiResponse<GraphValidationResult>>('/campaign/canvas/validate', dag);
  return res.data.data;
}

/** 编译 BPMN */
export async function compileToBpmn(planId: string) {
  const res = await api.get<ApiResponse<string>>(`/campaign/canvas/plan/${planId}/compile`);
  return res.data.data;
}

/** AI 生成 DAG */
export async function aiGenerate(request: AIRequest) {
  const res = await api.post<ApiResponse<CanvasDag>>('/campaign/canvas/ai-generate', request);
  return res.data.data;
}

/** 获取节点类型 */
export async function getNodeTypes() {
  const res = await api.get<ApiResponse<NodeTypeInfo[]>>('/campaign/canvas/node-types');
  return res.data.data;
}

// ==================== Content & Approval API ====================

export interface CampaignContentAsset {
  id: string;
  programCode: string;
  assetName: string;
  assetType: string;
  channel: string;
  subjectLine: string;
  bodyText: string;
  variableSchema: string;
  status: string;
  createdBy: string;
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignApprovalRecord {
  id: string;
  assetId: string;
  planId: string;
  requesterId: string;
  approverId: string;
  action: string;
  comment: string;
  createdAt: string;
}

/** 创建素材 */
export async function createAsset(asset: Partial<CampaignContentAsset>) {
  const res = await api.post<ApiResponse<CampaignContentAsset>>('/campaign/content/assets', asset);
  return res.data.data;
}

/** 获取素材 */
export async function getAsset(assetId: string) {
  const res = await api.get<ApiResponse<CampaignContentAsset>>(`/campaign/content/assets/${assetId}`);
  return res.data.data;
}

/** 更新素材 */
export async function updateAsset(assetId: string, asset: Partial<CampaignContentAsset>) {
  const res = await api.put<ApiResponse<CampaignContentAsset>>(`/campaign/content/assets/${assetId}`, asset);
  return res.data.data;
}

/** 查询素材列表 */
export async function listAssets(programCode: string, type?: string) {
  const params: any = { programCode };
  if (type) params.type = type;
  const res = await api.get<ApiResponse<CampaignContentAsset[]>>('/campaign/content/assets', { params });
  return res.data.data;
}

/** 提交审批 */
export async function submitForApproval(assetId: string, requesterId: string, comment?: string) {
  const res = await api.post(`/campaign/content/assets/${assetId}/submit`, { requesterId, comment });
  return res.data.data;
}

/** 审批通过 */
export async function approveAsset(assetId: string, approverId: string, comment?: string) {
  const res = await api.post(`/campaign/content/assets/${assetId}/approve`, { approverId, comment });
  return res.data.data;
}

/** 驳回 */
export async function rejectAsset(assetId: string, approverId: string, reason: string) {
  const res = await api.post(`/campaign/content/assets/${assetId}/reject`, { approverId, reason });
  return res.data.data;
}

/** 待审批列表 */
export async function getPendingAssets(programCode: string) {
  const res = await api.get<ApiResponse<CampaignContentAsset[]>>('/campaign/content/assets/pending', { params: { programCode } });
  return res.data.data;
}

/** 审批历史 */
export async function getApprovalHistory(assetId: string) {
  const res = await api.get(`/campaign/content/assets/${assetId}/history`);
  return res.data.data;
}

/** 渲染模板 */
export async function renderTemplate(assetId: string, variables: Record<string, string>) {
  const res = await api.post<ApiResponse<string>>(`/campaign/content/assets/${assetId}/render`, variables);
  return res.data.data;
}

/** 合规校验 */
export async function validateContent(assetId: string) {
  const res = await api.post(`/campaign/content/assets/${assetId}/validate`);
  return res.data.data;
}

// ==================== Intervention API ====================

export interface CampaignInterventionCommand {
  id: string;
  programCode: string;
  planId: string;
  targetNodeId: string;
  commandType: string;
  reason: string;
  operatorId: string;
  createdAt: string;
  executedAt: string;
}

/** 暂停活动 */
export async function pauseCampaign(planId: string, body: { operatorId: string; reason?: string }) {
  const res = await api.post(`/campaign/intervention/${planId}/pause`, body);
  return res.data.data;
}

/** 恢复活动 */
export async function resumeCampaign(planId: string, body: { operatorId: string; reason?: string }) {
  const res = await api.post(`/campaign/intervention/${planId}/resume`, body);
  return res.data.data;
}

/** 取消活动 */
export async function cancelCampaign(planId: string, body: { operatorId: string; reason?: string }) {
  const res = await api.post(`/campaign/intervention/${planId}/cancel`, body);
  return res.data.data;
}

/** 跳过节点 */
export async function skipNode(planId: string, nodeId: string, body: { operatorId: string; reason?: string }) {
  const res = await api.post(`/campaign/intervention/${planId}/skip/${nodeId}`, body);
  return res.data.data;
}

/** 覆盖节点配置 */
export async function overrideConfig(planId: string, nodeId: string, body: any) {
  const res = await api.put(`/campaign/intervention/${planId}/config/${nodeId}`, body);
  return res.data.data;
}

/** 获取干预历史 */
export async function getInterventions(planId: string) {
  const res = await api.get(`/campaign/intervention/${planId}/interventions`);
  return res.data.data;
}

/** 获取运行状态 */
export async function getPlanStatus(planId: string) {
  const res = await api.get(`/campaign/intervention/${planId}/status`);
  return res.data.data;
}

/** 紧急限流 */
export async function emergencyThrottle(tenantId: string, factor: number) {
  const res = await api.post(`/campaign/intervention/throttle/${tenantId}`, { factor });
  return res.data;
}

/** 取消限流 */
export async function removeThrottle(tenantId: string) {
  const res = await api.delete(`/campaign/intervention/throttle/${tenantId}`);
  return res.data;
}

/** Worker 执行前检查 */
export async function checkBeforeExecution(planId: string, nodeId: string, tenantId: string) {
  const res = await api.post(`/campaign/intervention/${planId}/check/${nodeId}?tenantId=${tenantId}`);
  return res.data.data;
}

// ==================== Execution Engine API ====================

/** 部署流程 */
export async function deployPlan(planId: string) {
  const res = await api.post(`/campaign/execution/${planId}/deploy`);
  return res.data.data;
}

/** 启动流程 */
export async function startExecution(planId: string) {
  const res = await api.post(`/campaign/execution/${planId}/start`);
  return res.data.data;
}

/** 执行节点 */
export async function executeNode(instanceKey: number, jobType: string, variables?: Record<string, any>) {
  const res = await api.post(`/campaign/execution/instance/${instanceKey}/execute/${jobType}`, variables || {});
  return res.data.data;
}

/** 完成流程 */
export async function completeInstance(instanceKey: number) {
  const res = await api.post(`/campaign/execution/instance/${instanceKey}/complete`);
  return res.data.data;
}

/** 获取实例 */
export async function getInstance(instanceKey: number) {
  const res = await api.get(`/campaign/execution/instance/${instanceKey}`);
  return res.data.data;
}

/** 获取 Plan 的流程实例 */
export async function getInstanceByPlan(planId: string) {
  const res = await api.get(`/campaign/execution/${planId}/instance`);
  return res.data.data;
}

/** 获取 Worker 列表 */
export async function getWorkers() {
  const res = await api.get('/campaign/execution/workers');
  return res.data.data;
}

/** 获取 Job 类型 */
export async function getJobTypes() {
  const res = await api.get('/campaign/execution/job-types');
  return res.data.data;
}

/** 获取执行状态 */
export async function getExecutionStatus(planId: string) {
  const res = await api.get(`/campaign/execution/status/${planId}`);
  return res.data.data;
}

/** 暂停执行 */
export async function pauseExecution(planId: string) {
  const res = await api.post(`/campaign/execution/${planId}/pause`);
  return res.data.data;
}

/** 恢复执行 */
export async function resumeExecution(planId: string) {
  const res = await api.post(`/campaign/execution/${planId}/resume`);
  return res.data.data;
}

// ==================== Feedback & Events API ====================

export interface FeedbackMetrics {
  id: string; planId: string;
  predictedRoi: number; predictedConversion: number; predictedRevenue: number;
  actualRoi: number; actualConversion: number; actualRevenue: number; actualCost: number;
  roiDeviation: number; conversionDeviation: number;
  totalExposures: number; totalConversions: number; uniqueUsers: number;
  calculatedAt: string;
}

export interface ModelDrift {
  id: string; modelName: string; modelVersion: string;
  driftDetected: boolean; driftScore: number; threshold: number;
  sampleSize: number; meanPredicted: number; meanActual: number;
  mae: number; rmse: number; detectedAt: string; status: string;
}

export interface StrategyAdjustment {
  id: string; planId: string; workspaceId: string;
  adjustmentType: string; triggerEvent: string;
  reason: string; expectedImprovement: number;
  status: string; createdBy: string; createdAt: string; appliedAt: string;
}

/** 获取反馈指标 */
export async function getFeedbackMetrics(planId: string) {
  const res = await api.get(`/campaign/feedback/${planId}`);
  return res.data.data;
}

/** 触发反馈计算 */
export async function triggerFeedbackCalculation(planId: string) {
  const res = await api.post(`/campaign/feedback/${planId}/calculate`);
  return res.data.data;
}

/** 获取漂移记录 */
export async function getDriftHistory(modelName = 'roi_prediction') {
  const res = await api.get('/campaign/feedback/drift', { params: { modelName } });
  return res.data.data;
}

/** 获取策略调整 */
export async function getStrategyAdjustments(workspaceId: string) {
  const res = await api.get('/campaign/feedback/adjustments', { params: { workspaceId } });
  return res.data.data;
}

/** 应用策略调整 */
export async function applyAdjustment(id: string) {
  const res = await api.post(`/campaign/feedback/adjustments/${id}/apply`);
  return res.data.data;
}

// ==================== Opportunity Intelligence API ====================

export interface Opportunity {
  id: string;
  memberId: string;
  segmentCode: string;
  opportunityType: string;
  score: number;
  churnProbability: number;
  upliftScore: number;
  conversionProbability: number;
  rfmScore: number;
  externalInfluence: number;
  externalSignalIds: string[];
  recommendedAction: string;
  recommendedChannel: string;
  confidence: number;
  status: string;
  source: string;
  detectedAt: string;
  expiresAt: string;
}

export interface ExternalSignalItem {
  id: string;
  signalType: string;
  severity: string;
  sourceSkill: string;
  targetEntity: string;
  title: string;
  description: string;
  impactFactor: number;
  affectedSegments: string;
  recommendedAction: string;
  expiresAt: string;
  createdAt: string;
}

/** 发现机会 */
export async function discoverOpportunities(workspaceId: string, goalId: string, maxResults?: number) {
  const res = await api.post('/campaign/opportunity/discover', { workspaceId, goalId, maxResults: maxResults || 10000 });
  return res.data.data;
}

/** 查询机会列表 */
export async function queryOpportunities(workspaceId: string, goalId: string, params?: {
  types?: string[]; minScore?: number; status?: string; limit?: number; offset?: number;
}) {
  const queryParams: any = { workspaceId, goalId, limit: params?.limit || 100, offset: params?.offset || 0 };
  if (params?.types?.length) queryParams.types = params.types.join(',');
  if (params?.minScore !== undefined) queryParams.minScore = params.minScore;
  if (params?.status) queryParams.status = params.status;
  const res = await api.get('/campaign/opportunity', { params: queryParams });
  return res.data.data;
}

/** 消费机会 */
export async function consumeOpportunity(opportunityId: string) {
  const res = await api.post(`/campaign/opportunity/${opportunityId}/consume`);
  return res.data.data;
}

/** 获取外部信号 */
export async function getExternalSignals(programCode: string, severity?: string) {
  const params: any = { programCode };
  if (severity) params.severity = severity;
  const res = await api.get('/campaign/opportunity/external-signal', { params });
  return res.data.data;
}

/** 手动触发技能 */
export async function executeSkill(skillName: string, context?: Record<string, any>) {
  const res = await api.post('/campaign/opportunity/external-signal/execute', { skillName, context: context || {} });
  return res.data.data;
}

/** 获取外部信号影响系数 */
export async function calculateExternalWeight(programCode: string, segmentCode: string) {
  const res = await api.post('/campaign/opportunity/external-signal/weight', { programCode, segmentCode });
  return res.data.data;
}

// ==================== Simulation & Optimization API ====================

export interface BaselineResult {
  segmentCode: string;
  totalMembers: number;
  convertedMembers: number;
  conversionRate: number;
  avgOrderValue: number;
  estimatedRevenue: number;
  periodDays: number;
  segmentBreakdown: Record<string, number>;
  calculatedAt: string;
}

export interface SimulationFullResult {
  id: string;
  workspaceId: string;
  goalId: string;
  simulationType: string;
  name: string;
  baselineConversion: number;
  predictedConversion: number;
  predictedRevenue: number;
  predictedRoi: number;
  upliftPct: number;
  confidence: number;
  exposureCount: number;
  behaviorCount: number;
  conversionCount: number;
  segmentBreakdown: string;
  channelBreakdown: string;
  status: string;
  createdAt: string;
}

export interface OptimizationAllocationDetail {
  initiativeId: string;
  initiativeName: string;
  allocatedBudget: number;
  expectedRoi: number;
  percentage: number;
}

export interface OptimizationResultResponse {
  optimizationId: string;
  optimizationType: string;
  status: string;
  expectedRoi: number;
  expectedRevenue: number;
  improvementPct: number;
  iterationCount: number;
  convergenceTimeMs: number;
  baselineRoi: number;
  allocationDetails: OptimizationAllocationDetail[];
  createdAt: string;
}

/** 运行模拟 */
export async function runSimulation(params: {
  workspaceId: string; goalId: string; name?: string;
  segmentCode: string; channel?: string; offerStrength?: number; offerMatch?: number; budget?: number;
}) {
  const res = await api.post<ApiResponse<SimulationFullResult>>('/campaign/simulation/run', params);
  return res.data.data;
}

/** 计算基线 */
export async function calculateBaseline(goalId: string, segmentCode: string) {
  const res = await api.post<ApiResponse<BaselineResult>>('/campaign/simulation/baseline', { goalId, segmentCode });
  return res.data.data;
}

/** 获取模拟结果 */
export async function getSimulationResult(id: string) {
  const res = await api.get<ApiResponse<SimulationFullResult>>(`/campaign/simulation/${id}`);
  return res.data.data;
}

/** 获取模拟历史 */
export async function getSimulationHistory(workspaceId: string, page = 0, size = 20) {
  const res = await api.get('/campaign/simulation/history', { params: { workspaceId, page, size } });
  return res.data.data;
}

/** 运行优化 */
export async function runOptimization(params: {
  portfolioId: string; optimizationType?: string;
  constraints?: { maxBudget?: number; maxGenerations?: number; populationSize?: number; channelCapacity?: Record<string, number> };
}) {
  const res = await api.post<ApiResponse<OptimizationResultResponse>>('/campaign/optimization/run', params);
  return res.data.data;
}

/** 获取优化结果 */
export async function getOptimizationResult(id: string) {
  const res = await api.get<ApiResponse<OptimizationResultResponse>>(`/campaign/optimization/${id}`);
  return res.data.data;
}

/** 获取优化历史 */
export async function getOptimizationHistory(portfolioId: string, page = 0, size = 20) {
  const res = await api.get('/campaign/optimization/history', { params: { portfolioId, page, size } });
  return res.data.data;
}

// ==================== Event Trigger API ====================

export interface CampaignEventTrigger {
  id: string;
  planId: string;
  workspaceId: string;
  programCode: string;
  eventType: string;
  eventSource: string;
  eventTopic: string;
  eventFilter: string;
  dedupWindowMinutes: number;
  dedupKeyFields: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventTriggerLog {
  id: string;
  planId: string;
  triggerId: string;
  eventId: string;
  eventType: string;
  memberId: string;
  triggered: boolean;
  skipReason: string;
  processInstanceKey: number;
  dedupKey: string;
  eventTime: string;
  triggerTime: string;
  createdAt: string;
}

export interface TriggerStats {
  planId: string;
  totalLogs: number;
  triggered: number;
  deduped: number;
  filterNotMatch: number;
  successRate: number;
}

export interface TriggerResult {
  eventType: string;
  matchedTriggers: number;
  details: TriggerDetail[];
}

export interface TriggerDetail {
  triggerId: string;
  status: string;
  skipReason: string;
  processInstanceKey: number;
  errorMessage: string;
}

/** 创建事件触发器 */
export async function createEventTrigger(data: Partial<CampaignEventTrigger>) {
  const res = await api.post<ApiResponse<CampaignEventTrigger>>('/campaign/event/triggers', data);
  return res.data.data;
}

/** 查询计划下的触发器列表 */
export async function getPlanTriggers(planId: string) {
  const res = await api.get<ApiResponse<CampaignEventTrigger[]>>(`/campaign/event/triggers/plan/${planId}`);
  return res.data.data;
}

/** 更新触发器配置 */
export async function updateEventTrigger(triggerId: string, data: Partial<CampaignEventTrigger>) {
  const res = await api.put<ApiResponse<CampaignEventTrigger>>(`/campaign/event/triggers/${triggerId}`, data);
  return res.data.data;
}

/** 暂停触发器 */
export async function pauseEventTrigger(triggerId: string) {
  const res = await api.post<ApiResponse<CampaignEventTrigger>>(`/campaign/event/triggers/${triggerId}/pause`);
  return res.data.data;
}

/** 恢复触发器 */
export async function resumeEventTrigger(triggerId: string) {
  const res = await api.post<ApiResponse<CampaignEventTrigger>>(`/campaign/event/triggers/${triggerId}/resume`);
  return res.data.data;
}

/** 删除触发器 */
export async function deleteEventTrigger(triggerId: string) {
  const res = await api.delete(`/campaign/event/triggers/${triggerId}`);
  return res.data.data;
}

/** 获取触发器执行日志 */
export async function getTriggerLogs(triggerId: string) {
  const res = await api.get<ApiResponse<EventTriggerLog[]>>(`/campaign/event/triggers/${triggerId}/logs`);
  return res.data.data;
}

/** 获取计划下所有触发日志 */
export async function getPlanTriggerLogs(planId: string) {
  const res = await api.get<ApiResponse<EventTriggerLog[]>>(`/campaign/event/triggers/logs/plan/${planId}`);
  return res.data.data;
}

/** 获取触发统计 */
export async function getTriggerStats(planId: string) {
  const res = await api.get<ApiResponse<TriggerStats>>(`/campaign/event/triggers/stats/${planId}`);
  return res.data.data;
}

/** 发送 Webhook 事件 */
export async function sendWebhookEvent(programCode: string, eventType: string, payload: Record<string, any>) {
  const res = await api.post(`/campaign/event/webhook/${programCode}/${eventType}`, payload);
  return res.data.data;
}

/** 手动触发测试事件（开发调试） */
export async function testTrigger(eventType: string, memberId: string, payload: Record<string, any>) {
  const res = await api.post<ApiResponse<TriggerResult>>('/campaign/event/test/trigger', { eventType, memberId, payload });
  return res.data.data;
}

// ==================== Consent & Preference API ====================

export interface UserConsent {
  memberId: string;
  programCode: string;
  globalUnsubscribe: boolean;
  unsubscribeReason: string;
  unsubscribeChannel: string;
  unsubscribeAt: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  pushOptIn: boolean;
  emailOptOutAt: string;
  smsOptOutAt: string;
  pushOptOutAt: string;
  categoryPreferences: string;
  categoryPreferencesUpdatedAt: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  preferenceSource: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  createdAt: string;
}

export interface ConsentChangeLog {
  id: number;
  memberId: string;
  programCode: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  source: string;
  sourceDetail: string;
  operatedBy: string;
  createdAt: string;
}

export interface SendCheckResult {
  allowed: boolean;
  code: string;
  message: string;
}

export interface GdprRequestEntity {
  id: string;
  memberId: string;
  programCode: string;
  requestType: string;
  requestSource: string;
  requestReason: string;
  status: string;
  processedAt: string;
  completionSummary: string;
}

export interface UpdatePreferenceRequest {
  channelOptIns?: Record<string, boolean>;
  categoryPreferences?: { included: string[]; excluded: string[] };
  quietHours?: { enabled: boolean; start: string; end: string; timezone: string };
  globalUnsubscribe?: boolean;
  unsubscribeReason?: string;
  unsubscribeChannel?: string;
  source?: string;
}

/** 获取用户偏好 */
export async function getUserConsent(memberId: string) {
  const res = await api.get<ApiResponse<UserConsent>>(`/campaign/consent/${memberId}`);
  return res.data.data;
}

/** 更新用户偏好 */
export async function updateUserConsent(memberId: string, data: UpdatePreferenceRequest) {
  const res = await api.put<ApiResponse<UserConsent>>(`/campaign/consent/${memberId}`, data);
  return res.data.data;
}

/** 获取用户偏好变更日志 */
export async function getConsentChangeLogs(memberId: string) {
  const res = await api.get<ApiResponse<ConsentChangeLog[]>>(`/campaign/consent/${memberId}/logs`);
  return res.data.data;
}

/** 检查是否可发送 */
export async function checkCanSend(memberId: string, channel: string, category?: string) {
  const res = await api.get<ApiResponse<SendCheckResult>>('/campaign/consent/check', {
    params: { memberId, channel, category },
  });
  return res.data.data;
}

/** 提交 GDPR 删除请求 */
export async function submitGdprDelete(memberId: string, programCode: string, reason: string) {
  const res = await api.post('/campaign/consent/gdpr/delete', { memberId, programCode, reason });
  return res.data.data;
}

/** 获取 GDPR 请求列表 */
export async function getGdprRequests(memberId: string) {
  const res = await api.get<ApiResponse<GdprRequestEntity[]>>(`/campaign/consent/gdpr/requests/${memberId}`);
  return res.data.data;
}

// ==================== Terms & Legal Consent API ====================

export interface TermsMaster {
  id?: string;
  programCode: string;
  termsType: string;
  termsVersion: string;
  termsContent?: string;
  effectiveDate: string;
  isActive: boolean;
  releasedBy?: string;
  releasedAt?: string;
  createdAt?: string;
}

export interface TermsAcceptance {
  id?: string;
  memberId: string;
  programCode: string;
  termsType: string;
  termsVersion: string;
  isAccepted: boolean;
  acceptedAt?: string;
  acceptedIp?: string;
  userAgent?: string;
  source?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
  createdAt?: string;
}

/** 检查会员是否已接受最新条款 */
export async function checkTermsAccepted(memberId: string, termsType?: string) {
  const res = await api.get<ApiResponse<{ accepted: boolean; latestVersion: string; termsType: string }>>(
    '/campaign/terms/check', { params: { memberId, termsType } }
  );
  return res.data.data;
}

/** 接受条款 */
export async function acceptTerms(data: {
  memberId: string; termsType?: string; source?: string;
}) {
  const res = await api.post<ApiResponse<TermsAcceptance>>('/campaign/terms/accept', data);
  return res.data.data;
}

/** 获取当前生效的条款内容 */
export async function getActiveTerms(termsType?: string) {
  const res = await api.get<ApiResponse<TermsMaster>>('/campaign/terms/active', { params: { termsType } });
  return res.data.data;
}

/** 获取会员的接受历史 */
export async function getAcceptanceHistory(memberId: string) {
  const res = await api.get<ApiResponse<TermsAcceptance[]>>(`/campaign/terms/history/${memberId}`);
  return res.data.data;
}

/** 管理员：查询条款版本列表 */
export async function getTermsVersions(termsType?: string) {
  const res = await api.get<ApiResponse<TermsMaster[]>>('/campaign/terms/admin/versions', { params: { termsType } });
  return res.data.data;
}

/** 管理员：创建条款版本 */
export async function createTermsVersion(data: Partial<TermsMaster>) {
  const res = await api.post<ApiResponse<TermsMaster>>('/campaign/terms/admin/versions', data);
  return res.data.data;
}

/** 管理员：停用条款版本 */
export async function deactivateTermsVersion(id: string) {
  const res = await api.post(`/campaign/terms/admin/versions/${id}/deactivate`);
  return res.data.data;
}

/** 管理员：查询接受记录（审计） */
export async function getTermsAcceptances(termsType: string, termsVersion: string) {
  const res = await api.get<ApiResponse<TermsAcceptance[]>>('/campaign/terms/admin/acceptances', {
    params: { termsType, termsVersion },
  });
  return res.data.data;
}

// ==================== Experiment A/B Testing API ====================

export interface ExperimentEntity {
  id: string;
  planId: string;
  workspaceId: string;
  programCode: string;
  name: string;
  description: string;
  status: string;
  trafficAllocationPct: number;
  totalSampleSize: number;
  objectiveMetric: string;
  objectiveDirection: string;
  minimumDetectableEffect: number;
  statisticalSignificance: number;
  autoPromoteWinner: boolean;
  autoPromoteDelayMinutes: number;
  startedAt: string;
  completedAt: string;
  winningVariantId: string;
  promoted: boolean;
  promotedAt: string;
  createdBy: string;
  createdAt: string;
}

export interface ExperimentVariantEntity {
  id: string;
  experimentId: string;
  variantName: string;
  variantCode: string;
  trafficPercentage: number;
  nodeOverrides: string;
  exposureCount: number;
  eventCount: number;
  metricValue: number;
  totalRevenue: number;
  pValue: number;
  relativeImprovement: number;
  confidenceInterval: string;
  isWinner: boolean;
}

export interface ExperimentStats {
  experimentId: string;
  totalAssignments: number;
  winnerId: string;
  overallImprovement: number;
  significantVariants: string[];
  metricValues: Record<string, number>;
  variants: ExperimentVariantEntity[];
}

/** 创建实验 */
export async function createExperiment(data: Partial<ExperimentEntity>) {
  const res = await api.post<ApiResponse<ExperimentEntity>>('/campaign/experiment', data);
  return res.data.data;
}

/** 查询计划下的实验 */
export async function getPlanExperiments(planId: string) {
  const res = await api.get<ApiResponse<ExperimentEntity[]>>(`/campaign/experiment/plan/${planId}`);
  return res.data.data;
}

/** 查询实验详情 */
export async function getExperimentDetail(id: string) {
  const res = await api.get<ApiResponse<{ experiment: ExperimentEntity; variants: ExperimentVariantEntity[] }>>(`/campaign/experiment/${id}`);
  return res.data.data;
}

/** 启动实验 */
export async function startExperiment(id: string) {
  const res = await api.post<ApiResponse<ExperimentEntity>>(`/campaign/experiment/${id}/start`);
  return res.data.data;
}

/** 暂停实验 */
export async function pauseExperiment(id: string) {
  const res = await api.post<ApiResponse<ExperimentEntity>>(`/campaign/experiment/${id}/pause`);
  return res.data.data;
}

/** 完成实验 */
export async function completeExperiment(id: string) {
  const res = await api.post<ApiResponse<ExperimentEntity>>(`/campaign/experiment/${id}/complete`);
  return res.data.data;
}

/** 获取变体列表 */
export async function getExperimentVariants(experimentId: string) {
  const res = await api.get<ApiResponse<ExperimentVariantEntity[]>>(`/campaign/experiment/${experimentId}/variants`);
  return res.data.data;
}

/** 添加变体 */
export async function addExperimentVariant(experimentId: string, data: Partial<ExperimentVariantEntity>) {
  const res = await api.post<ApiResponse<ExperimentVariantEntity>>(`/campaign/experiment/${experimentId}/variants`, data);
  return res.data.data;
}

/** 获取实验统计 */
export async function getExperimentStats(id: string) {
  const res = await api.get<ApiResponse<ExperimentStats>>(`/campaign/experiment/${id}/stats`);
  return res.data.data;
}

/** 推全胜者（将胜者变体标记为已推全） */
export async function promoteExperimentWinner(id: string) {
  const res = await api.post<ApiResponse<ExperimentEntity>>(`/campaign/experiment/${id}/promote`);
  return res.data.data;
}

// ==================== 样本量估算 API ====================

export interface SampleSizeRequest {
  objectiveMetric: string;
  baselineRate: number;
  minimumDetectableEffect: number;
  statisticalSignificance?: number;
  statisticalPower?: number;
  variantCount?: number;
  stdDevEstimate?: number;
  dailyTraffic?: number;
}

export interface SampleSizeResponse {
  sampleSizePerGroup: number;
  totalSampleSize: number;
  baselineRate: number;
  expectedRate: number;
  absoluteEffect: number;
  statisticalSignificance: number;
  statisticalPower: number;
  variantCount: number;
  estimatedDays: number | null;
  objectiveMetric: string;
  formula: string;
}

/** 估算实验所需样本量 */
export async function estimateSampleSize(data: SampleSizeRequest) {
  const res = await api.post<ApiResponse<SampleSizeResponse>>('/campaign/experiment/estimate-sample-size', data);
  return res.data.data;
}

// ==================== Budget Pacing API ====================

export interface BudgetPacingEntity {
  id: string;
  planId: string;
  workspaceId: string;
  programCode: string;
  totalBudget: number;
  totalBudgetCurrency: string;
  pacingMode: string;
  dailyCapEnabled: boolean;
  dailyCapAmount: number;
  dailyCapType: string;
  dynamicPacingConfig: string;
  alertThresholds: string;
  totalConsumed: number;
  todayConsumed: number;
  yesterdayConsumed: number;
  pausedByBudget: boolean;
  createdAt: string;
}

export interface BudgetConsumptionEntity {
  id: string;
  planId: string;
  nodeId: string;
  memberId: string;
  amount: number;
  unitCost: number;
  quantity: number;
  consumptionType: string;
  channel: string;
  consumedAt: string;
}

export interface BudgetAlertEntity {
  id: string;
  planId: string;
  alertType: string;
  alertMessage: string;
  threshold: number;
  currentConsumption: number;
  totalBudget: number;
  status: string;
  triggeredAt: string;
}

export interface BudgetStatus {
  planId: string;
  totalBudget: number;
  totalConsumed: number;
  totalRemaining: number;
  consumptionRatio: number;
  pacingMode: string;
  dailyCapEnabled: boolean;
  dailyCapAmount: number;
  todayConsumed: number;
  todayRemaining: number;
  isPausedByBudget: boolean;
  alerts: BudgetAlertEntity[];
}

/** 获取预算节奏状态 */
export async function getBudgetStatus(planId: string) {
  const res = await api.get<ApiResponse<BudgetStatus>>(`/campaign/budget/pacing/${planId}`);
  return res.data.data;
}

/** 保存预算节奏配置 */
export async function saveBudgetPacing(planId: string, data: Partial<BudgetPacingEntity>) {
  const res = await api.put<ApiResponse<BudgetPacingEntity>>(`/campaign/budget/pacing/${planId}`, data);
  return res.data.data;
}

/** 获取消耗明细 */
export async function getBudgetConsumptions(planId: string) {
  const res = await api.get<ApiResponse<BudgetConsumptionEntity[]>>(`/campaign/budget/pacing/${planId}/consumptions`);
  return res.data.data;
}

/** 获取告警 */
export async function getBudgetAlerts(planId: string, status?: string) {
  const res = await api.get<ApiResponse<BudgetAlertEntity[]>>(`/campaign/budget/pacing/${planId}/alerts`, { params: { status } });
  return res.data.data;
}

// ==================== Campaign Calendar API ====================

export interface CalendarDay {
  date: string;
  campaigns: { planId: string; name: string; triggerType: string; status: string; estimatedVolume: number }[];
  conflicts: { conflictId: string; type: string; severity: string; message: string }[];
}

export interface CalendarData {
  year: number;
  month: number;
  days: CalendarDay[];
  totalConflicts: number;
}

export interface ConflictRecordEntity {
  id: string;
  workspaceId: string;
  planId1: string;
  planId2: string;
  planName1: string;
  planName2: string;
  conflictType: string;
  severity: string;
  overlapAudienceCount: number;
  overlapPercentage: number;
  affectedChannel: string;
  overloadRatio: number;
  conflictDetail: string;
  conflictStartDate: string;
  conflictEndDate: string;
  status: string;
  detectedAt: string;
}

/** 获取日历数据 */
export async function getCalendarData(workspaceId: string, year = 2026, month = 6) {
  const res = await api.get<ApiResponse<CalendarData>>(`/campaign/calendar/workspace/${workspaceId}`, { params: { year, month } });
  return res.data.data;
}

/** 获取冲突列表 */
export async function getCalendarConflicts(workspaceId: string) {
  const res = await api.get<ApiResponse<ConflictRecordEntity[]>>('/campaign/calendar/conflicts', { params: { workspaceId } });
  return res.data.data;
}

/** 手动触发冲突检测 */
export async function triggerConflictDetection(workspaceId: string) {
  const res = await api.post<ApiResponse<ConflictRecordEntity[]>>(`/campaign/calendar/detect/${workspaceId}`);
  return res.data.data;
}

/** 解决/忽略冲突 */
export async function resolveConflict(conflictId: string, action: string, note?: string) {
  const res = await api.post(`/campaign/calendar/conflicts/${conflictId}/resolve`, { action, note });
  return res.data.data;
}

// ==================== DLQ API ====================

export interface DlqTask {
  id: string;
  instanceId: string;
  planId: string;
  jobKey: number;
  taskType: string;
  taskName: string;
  nodeId: string;
  status: string;
  inputVariables: Record<string, any>;
  errorMessage: string;
  retryCount: number;
  isDlq: boolean;
  dlqReason: string;
  dlqArchived: boolean;
  replayedCount: number;
  originalJobKey: number;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface DlqReplayLogEntry {
  id: string;
  taskId: string;
  planId: string;
  replayType: string;
  newJobKey: number;
  newProcessInstanceKey: number;
  status: string;
  operatorId: string;
  reason: string;
  replayedAt: string;
}

/** 获取死信列表 */
export async function getDlqList(planId?: string) {
  const res = await api.get<ApiResponse<{ total: number; items: DlqTask[] }>>('/campaign/dlq/list', { params: { planId } });
  return res.data.data;
}

/** 获取死信数量 */
export async function getDlqCount() {
  const res = await api.get<ApiResponse<{ dlqCount: number }>>('/campaign/dlq/count');
  return res.data.data;
}

/** 单条重放 */
export async function replayDlqTask(taskId: string, operatorId: string, reason: string) {
  const res = await api.post(`/campaign/dlq/${taskId}/replay`, { operatorId, reason });
  return res.data.data;
}

/** 批量重放 */
export async function replayDlqBatch(params: { planId?: string; nodeType?: string; operatorId?: string; reason?: string }) {
  const res = await api.post('/campaign/dlq/replay/batch', params);
  return res.data.data;
}

/** 获取重放日志 */
export async function getDlqReplayLogs(taskId: string) {
  const res = await api.get<ApiResponse<DlqReplayLogEntry[]>>(`/campaign/dlq/${taskId}/replay-logs`);
  return res.data.data;
}

/** 归档死信 */
export async function archiveDlq(daysOld = 7) {
  const res = await api.post('/campaign/dlq/archive', null, { params: { daysOld } });
  return res.data.data;
}

// ==================== Webhook API ====================

export interface WebhookLogEntry {
  id: string;
  programCode: string;
  triggerId: string;
  requestPath: string;
  requestMethod: string;
  requestHeaders: string;
  requestBody: string;
  requestIp: string;
  authStatus: string;
  authError: string;
  mappedEventType: string;
  mappedMemberId: string;
  triggerCampaign: boolean;
  skipReason: string;
  responseStatus: number;
  processingTimeMs: number;
  receivedAt: string;
}

/** 查询 Webhook 日志 */
export async function getWebhookLogs(programCode: string) {
  const res = await api.get<ApiResponse<WebhookLogEntry[]>>('/campaign/webhook/logs', { params: { programCode } });
  return res.data.data;
}

// ==================== Multi-Program Sharing API ====================

export interface SharingPolicyEntity {
  id: string;
  programCode: string;
  sharingScope: string;
  targetPrograms: string[];
  sharedResourceTypes: string[];
  permissionType: string;
  enabled: boolean;
}

export interface CrossProgramRelationEntity {
  id: string;
  planId: string;
  programCode: string;
  role: string;
  canEdit: boolean;
  canTrigger: boolean;
  canViewResults: boolean;
  budgetAllocation: number;
}

/** 获取可访问Program列表 */
export async function getAccessiblePrograms(programCode: string, resourceType = 'ASSET') {
  const res = await api.get('/campaign/sharing/accessible-programs', { params: { programCode, resourceType } });
  return res.data.data;
}

/** 获取共享策略 */
export async function getSharingPolicies(programCode: string) {
  const res = await api.get<ApiResponse<SharingPolicyEntity[]>>(`/campaign/sharing/policies/${programCode}`);
  return res.data.data;
}

/** 创建共享策略 */
export async function createSharingPolicy(data: Partial<SharingPolicyEntity>) {
  const res = await api.post<ApiResponse<SharingPolicyEntity>>('/campaign/sharing/policy', data);
  return res.data.data;
}

/** 检查全局黑名单 */
export async function checkGlobalBlacklist(memberId: string) {
  const res = await api.get('/campaign/sharing/blacklist/check', { params: { memberId } });
  return res.data.data;
}

/** 添加全局黑名单 */
export async function addGlobalBlacklist(memberId: string, programCode: string, reason: string) {
  const res = await api.post('/campaign/sharing/blacklist', { memberId, programCode, reason });
  return res.data.data;
}

/** 获取跨Program关联 */
export async function getCrossProgramRelations(planId: string) {
  const res = await api.get<ApiResponse<CrossProgramRelationEntity[]>>(`/campaign/sharing/relations/${planId}`);
  return res.data.data;
}

// ==================== Recommendation API ====================

export interface RecommendationItemType {
  productId: string;
  productName: string;
  price: number;
  imageUrl: string;
  detailUrl: string;
  score: number;
  reason: string;
}

export interface RecommendationStrategyEntity {
  id: string;
  programCode: string;
  strategyName: string;
  strategyType: string;
  description: string;
  recommendationConfig: string;
  fallbackStrategyId: string;
  fallbackContent: string;
  cacheTtlSeconds: number;
  enabled: boolean;
  isDefault: boolean;
}

/** 获取推荐预览 */
export async function getRecommendationPreview(memberId: string, strategyId: string, maxItems = 3) {
  const res = await api.get('/campaign/recommendation/preview', { params: { memberId, strategyId, maxItems } });
  return res.data.data;
}

/** 获取策略列表 */
export async function getRecommendationStrategies(programCode: string) {
  const res = await api.get<ApiResponse<RecommendationStrategyEntity[]>>('/campaign/recommendation/strategies', { params: { programCode } });
  return res.data.data;
}

/** 创建策略 */
export async function createRecommendationStrategy(data: Partial<RecommendationStrategyEntity>) {
  const res = await api.post<ApiResponse<RecommendationStrategyEntity>>('/campaign/recommendation/strategy', data);
  return res.data.data;
}

/** 更新策略 */
export async function updateRecommendationStrategy(id: string, data: Partial<RecommendationStrategyEntity>) {
  const res = await api.put<ApiResponse<RecommendationStrategyEntity>>(`/campaign/recommendation/strategy/${id}`, data);
  return res.data.data;
}

// ==================== Strategy Blueprint API ====================

export interface StrategyBlueprintEntity {
  id?: string; blueprintName: string; industryType: string; description?: string;
  formulaJson?: string; leversJson?: string; initiativeMappingJson?: string;
  version?: number; isActive?: boolean; isSystemDefault?: boolean;
  fallbackMode?: string; createdAt?: string;
}

export interface GoalDecompositionEntity {
  id: string; goalId: string; blueprintId?: string; workspaceId: string;
  targetValue: number; baselineValue: number; totalGap: number;
  decompositionMode: string; leverGaps?: string; initiativeSuggestions?: string;
  adoptedPlanId?: string;
}

export async function createGoalWithBlueprint(goal: any) {
  const res = await api.post<ApiResponse<any>>('/campaign/strategy/goal', goal);
  return res.data.data;
}

export async function analyzeGoalGap(goalId: string) {
  const res = await api.post<ApiResponse<GoalDecompositionEntity>>(`/campaign/strategy/goal/${goalId}/analyze-gap`);
  return res.data.data;
}

export async function createInitiativesFromStrategy(goalId: string) {
  const res = await api.post<ApiResponse<any[]>>(`/campaign/strategy/goal/${goalId}/create-initiatives`);
  return res.data.data;
}

export async function getGoalDecomposition(goalId: string) {
  const res = await api.get<ApiResponse<GoalDecompositionEntity>>(`/campaign/strategy/goal/${goalId}/decomposition`);
  return res.data.data;
}

export async function getStrategyBlueprints(industryType?: string) {
  const params = industryType ? { industryType } : {};
  const res = await api.get<ApiResponse<StrategyBlueprintEntity[]>>('/campaign/strategy/blueprints', { params });
  return res.data.data;
}

export async function saveStrategyBlueprint(data: Partial<StrategyBlueprintEntity>) {
  const res = await api.post<ApiResponse<StrategyBlueprintEntity>>('/campaign/strategy/blueprint', data);
  return res.data.data;
}

// ==================== System RBAC API ====================

export interface SystemUserEntity {
  id?: string; username: string; realName?: string; email?: string; phone?: string;
  userType?: string; status?: string; programCode?: string; roleId?: string;
  createdAt?: string;
}
export interface SystemRoleEntity {
  id?: string; roleName: string; roleCode: string; description?: string;
  permissionIds?: string[]; dataScope?: string; isSystem?: boolean;
}
export interface SystemPermissionEntity {
  id?: string; permName: string; permCode: string; module?: string;
  permType?: string; resourcePath?: string; sortOrder?: number;
}

export async function listSystemUsers(programCode?: string) {
  const res = await api.get<ApiResponse<SystemUserEntity[]>>('/admin/system/users', { params: programCode ? { programCode } : {} });
  return res.data.data;
}
export async function createSystemUser(data: any) {
  const res = await api.post<ApiResponse<SystemUserEntity>>('/admin/system/user', data);
  return res.data.data;
}
export async function updateSystemUser(id: string, data: Partial<SystemUserEntity>) {
  const res = await api.put<ApiResponse<SystemUserEntity>>(`/admin/system/user/${id}`, data);
  return res.data.data;
}
export async function resetUserPassword(id: string, password: string) {
  const res = await api.post<ApiResponse<any>>(`/admin/system/user/${id}/reset-password`, { password });
  return res.data.data;
}
export async function listSystemRoles(programCode?: string) {
  const res = await api.get<ApiResponse<SystemRoleEntity[]>>('/admin/system/roles', { params: programCode ? { programCode } : {} });
  return res.data.data;
}
export async function createSystemRole(data: Partial<SystemRoleEntity>) {
  const res = await api.post<ApiResponse<SystemRoleEntity>>('/admin/system/role', data);
  return res.data.data;
}
export async function updateSystemRole(id: string, data: Partial<SystemRoleEntity>) {
  const res = await api.put<ApiResponse<SystemRoleEntity>>(`/admin/system/role/${id}`, data);
  return res.data.data;
}
export async function listSystemPermissions(module?: string) {
  const res = await api.get<ApiResponse<SystemPermissionEntity[]>>('/admin/system/permissions', { params: module ? { module } : {} });
  return res.data.data;
}
export async function deleteSystemRole(id: string) {
  const res = await api.delete<ApiResponse<any>>(`/admin/system/role/${id}`);
  return res.data.data;
}


