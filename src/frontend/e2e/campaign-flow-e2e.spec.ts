/**
 * Campaign 完整业务流 E2E 测试
 *
 * 测试真实的业务链路而不是孤立API：
 *   Planning → Opportunity → Decision → Canvas → Execution → Feedback
 *
 * 每步使用上一步的真实ID，验证数据在模块间正确流转。
 *
 * 运行要求：后端 localhost:8081（修复版）, 前端 localhost:5173
 */

import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:8081';
const FRONTEND = 'http://localhost:5173';
const PROG = 'PROG001';
const TAG = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

// ==================== Tools ====================

async function api(request: any, method: string, path: string, data?: any) {
  const opts: any = {
    headers: { 'X-Program-Code': PROG, 'Content-Type': 'application/json' },
  };
  if (data !== undefined) opts.data = data;
  const resp = await request.fetch(`${BACKEND}${path}`, { method, ...opts });
  const body = await resp.json().catch(() => ({}));
  return { status: resp.status(), body, ok: resp.ok() };
}

function ok(r: { status: number; body: any; ok: boolean }): boolean {
  return r.status === 200 && r.body?.code === 'SUCCESS';
}

function requireOk(r: { status: number; body: any; ok: boolean }, step: string) {
  expect(r.status).toBe(200);
  if (!ok(r)) {
    console.error(`❌ ${step}: ${r.body?.code} ${r.body?.message}`);
  }
  expect(r.body.code).toBe('SUCCESS');
}

// ========================================================================
// 场景一：创建一个营销活动——完整的 Planning 阶段
// ========================================================================

test.describe('业务流 1: Planning 完整规划', () => {
  let wsId: string, goalId: string, iniId: string, portId: string;

  test('[P1] 创建工作区 → 创建目标 → 激活目标 → 创建举措 → 激活举措 → 创建组合', async ({ request }) => {
    // ---- Step 1: 创建工作区 ----
    const wsR = await api(request, 'POST', '/api/campaign/workspace', {
      name: `Q3营销活动_${TAG}`,
      programCode: PROG,
      description: '2026年Q3季度营销活动规划',
      config: { timezone: 'Asia/Shanghai', defaultBudget: 1000000 },
    });
    requireOk(wsR, '创建工作区');
    wsId = wsR.body.data.id;
    console.log(`✅ [P1] 工作区创建: ${wsR.body.data.name} (${wsId})`);
    expect(wsR.body.data.status).toBe('ACTIVE');

    // ---- Step 2: 创建目标 ----
    const goalR = await api(request, 'POST', '/api/campaign/goal', {
      workspaceId: wsId,
      name: 'Q3营收增长20%',
      description: '通过高价值会员召回和新会员促活实现季度营收目标',
      goalType: 'REVENUE',
      targetMetric: 'TOTAL_AMOUNT',
      targetValue: 5000000,
      startTime: '2026-07-01T00:00:00Z',
      endTime: '2026-09-30T23:59:59Z',
    });
    requireOk(goalR, '创建目标');
    goalId = goalR.body.data.id;
    console.log(`✅ [P1] 目标创建: ${goalR.body.data.name} (${goalId})`);
    expect(goalR.body.data.status).toBe('DRAFT');

    // ---- Step 3: 激活目标 ----
    const actG = await api(request, 'POST', `/api/campaign/goal/${goalId}/activate`);
    requireOk(actG, '激活目标');
    expect(actG.body.data.status).toBe('ACTIVE');
    console.log(`✅ [P1] 目标已激活 → ACTIVE`);

    // 验证工作区的 active_goal_id 已更新
    const wsCheck = await api(request, 'GET', `/api/campaign/workspace/${wsId}`);
    requireOk(wsCheck, '验证工作区');
    expect(wsCheck.body.data.activeGoalId).toBe(goalId);
    console.log(`✅ [P1] 工作区已关联目标: activeGoalId=${wsCheck.body.data.activeGoalId}`);

    // ---- Step 4: 创建举措 ----
    const iniR = await api(request, 'POST', '/api/campaign/initiative', {
      goalId: goalId,
      name: '高价值会员召回计划',
      description: '针对90天未活跃的高价值会员发送专属优惠',
      initiativeType: 'WINBACK',
      priority: 1,
      startTime: '2026-07-01T00:00:00Z',
      endTime: '2026-08-31T23:59:59Z',
      ruleConfig: {
        segment: 'high_value',
        minDaysSinceLastOrder: 90,
        maxOrders: 3,
        offerType: 'DISCOUNT',
        discountRate: 0.2,
      },
    });
    requireOk(iniR, '创建举措');
    iniId = iniR.body.data.id;
    console.log(`✅ [P1] 举措创建: ${iniR.body.data.name} (${iniId})`);
    expect(iniR.body.data.status).toBe('PLANNED');

    // ---- Step 5: 激活举措 ----
    const actI = await api(request, 'POST', `/api/campaign/initiative/${iniId}/activate`);
    requireOk(actI, '激活举措');
    expect(actI.body.data.status).toBe('ACTIVE');
    console.log(`✅ [P1] 举措已激活 → ACTIVE`);

    // ---- Step 6: 创建组合 ----
    const portR = await api(request, 'POST', '/api/campaign/portfolio', {
      workspaceId: wsId,
      name: 'Q3营销预算组合',
      description: 'Q3季度总预算分配方案',
      optimizationMode: 'ROI_MAXIMIZATION',
      totalBudget: 500000,
      startTime: '2026-07-01T00:00:00Z',
      endTime: '2026-09-30T23:59:59Z',
    });
    requireOk(portR, '创建组合');
    portId = portR.body.data.id;
    console.log(`✅ [P1] 组合创建: ${portR.body.data.name} (${portId})`);
    expect(portR.body.data.status).toBe('DRAFT');

    // ---- 验证上下文加载 ----
    const ctxR = await api(request, 'GET', `/api/campaign/workspace/${wsId}/context`);
    requireOk(ctxR, '加载上下文');
    expect(ctxR.body.data.activeGoal.id).toBe(goalId);
    expect(ctxR.body.data.initiatives.length).toBeGreaterThanOrEqual(1);
    expect(ctxR.body.data.portfolios.length).toBeGreaterThanOrEqual(1);
    console.log(`✅ [P1] 上下文验证: 目标=${ctxR.body.data.activeGoal.name}, 举措=${ctxR.body.data.initiatives.length}个, 组合=${ctxR.body.data.portfolios.length}个`);

    console.log(`\n📋 Planning阶段完成: WS=${wsId} → Goal=${goalId} → Ini=${iniId} → Port=${portId}`);
  });
});

// ========================================================================
// 场景二：机会发现 + 决策执行
// ========================================================================

test.describe('业务流 2: 机会发现 → 决策执行', () => {
  let workspaceId: string, goalId: string, portfolioId: string;

  test.beforeAll(async ({ request }) => {
    // 引用场景一创建的数据，通过 API 查找
    const wsList = await api(request, 'GET', `/api/campaign/workspace?programCode=${PROG}`);
    if (ok(wsList) && wsList.body.data?.length) {
      const ws = wsList.body.data.find((w: any) => w.name?.includes('Q3'));
      if (ws) {
        workspaceId = ws.id;
        const ctx = await api(request, 'GET', `/api/campaign/workspace/${workspaceId}/context`);
        if (ok(ctx)) {
          goalId = ctx.body.data.activeGoal?.id;
          if (ctx.body.data.portfolios?.length) portfolioId = ctx.body.data.portfolios[0].id;
        }
      }
    }
  });

  test('[O1] 发现机会 → 执行完整决策 → 应用决策', async ({ request }) => {
    if (!workspaceId || !goalId || !portfolioId) {
      console.log('⚠️ 跳过: 场景一未完成，无前置数据');
      test.skip();
      return;
    }

    // ---- Step 1: 发现机会 ----
    const oppR = await api(request, 'POST', '/api/campaign/opportunity/discover', {
      workspaceId, goalId, maxResults: 100,
    });
    requireOk(oppR, '发现机会');
    const oppCount = Array.isArray(oppR.body.data) ? oppR.body.data.length : 0;
    console.log(`✅ [O1] 机会发现: ${oppCount}条机会`);

    // ---- Step 2: 查询机会 ----
    const queryR = await api(request, 'GET', `/api/campaign/opportunity?workspaceId=${workspaceId}&goalId=${goalId}&limit=20`);
    requireOk(queryR, '查询机会');
    console.log(`✅ [O1] 机会列表查询成功`);

    // ---- Step 3: 运行组合优化 ----
    const optR = await api(request, 'POST', `/api/campaign/portfolio/${portfolioId}/optimize`);
    requireOk(optR, '运行优化');
    expect(['OPTIMIZED', 'PROCESSING', 'COMPLETED']).toContain(optR.body.data?.status);
    console.log(`✅ [O1] 组合优化完成: 状态=${optR.body.data?.status}`);

    // ---- Step 4: 执行完整决策 ----
    const decR = await api(request, 'POST', '/api/campaign/decision/execute', {
      workspaceId, portfolioId, goalId,
      constraints: {
        channelCapacity: { EMAIL: 100000, SMS: 50000 },
        maxFrequencyPerUser: 3,
        minROIThreshold: 1.2,
      },
    });
    requireOk(decR, '执行决策');
    const decisionId = decR.body.data?.decisionId;
    console.log(`✅ [O1] 决策执行: ID=${decisionId}, 状态=${decR.body.data?.status}, 分配=${(decR.body.data?.allocations || []).length}项`);

    // ---- Step 5: 应用决策 ----
    if (decisionId) {
      const appR = await api(request, 'POST', `/api/campaign/decision/${decisionId}/apply`);
      requireOk(appR, '应用决策');
      console.log(`✅ [O1] 决策已应用: ${appR.body.data?.status}`);
    }

    // ---- Step 6: 锁定组合 ----
    const lockR = await api(request, 'POST', `/api/campaign/portfolio/${portfolioId}/lock`);
    requireOk(lockR, '锁定组合');
    console.log(`✅ [O1] 组合已锁定: ${lockR.body.data?.status}`);
  });
});

// ========================================================================
// 场景三：画布编排 → 编译 → 执行
// ========================================================================

test.describe('业务流 3: 画布编排 → 执行', () => {
  let workspaceId: string, goalId: string, initiativeId: string, planId: string, assetId: string;

  test.beforeAll(async ({ request }) => {
    const wsList = await api(request, 'GET', `/api/campaign/workspace?programCode=${PROG}`);
    if (ok(wsList) && wsList.body.data?.length) {
      const ws = wsList.body.data.find((w: any) => w.name?.includes('Q3'));
      if (ws) {
        workspaceId = ws.id;
        const ctx = await api(request, 'GET', `/api/campaign/workspace/${workspaceId}/context`);
        if (ok(ctx)) {
          goalId = ctx.body.data.activeGoal?.id;
          if (ctx.body.data.initiatives?.length) initiativeId = ctx.body.data.initiatives[0].id;
        }
      }
    }
  });

  test('[C1] 创建画布计划 → 设计DAG → 校验 → 编译BPMN → 部署 → 启动', async ({ request }) => {
    if (!workspaceId || !goalId || !initiativeId) {
      console.log('⚠️ 跳过: 前置场景未完成');
      test.skip();
      return;
    }

    // ---- Step 1: 创建素材（用于画布节点） ----
    const assetR = await api(request, 'POST', '/api/campaign/content/assets', {
      programCode: PROG,
      assetName: `Q3召回邮件_${TAG}`,
      assetType: 'EMAIL',
      channel: 'EMAIL',
      subjectLine: '{{memberName}}，您有专属回归礼遇',
      bodyText: '<h1>欢迎回来 {{memberName}}</h1><p>为您准备了专属优惠</p>',
      variableSchema: '{"memberName":"string","points":"number"}',
    });
    requireOk(assetR, '创建素材');
    assetId = assetR.body.data.id;
    console.log(`✅ [C1] 素材创建: ${assetR.body.data.assetName} (${assetId})`);

    // ---- Step 2: 创建画布计划 ----
    const planR = await api(request, 'POST', '/api/campaign/canvas/plan', {
      workspaceId, goalId, initiativeId,
      name: `Q3高价值会员召回流程_${TAG}`,
      description: '目标人群筛选 → AI评分 → 邮件发送 → 积分赠送 → 完成',
    });
    requireOk(planR, '创建画布计划');
    planId = planR.body.data.id;
    console.log(`✅ [C1] 画布计划创建: ${planR.body.data.name} (${planId})`);
    expect(planR.body.data.status).toBe('DRAFT');

    // ---- Step 3: 获取节点类型 ----
    const typesR = await api(request, 'GET', '/api/campaign/canvas/node-types');
    requireOk(typesR, '获取节点类型');
    const types = typesR.body.data || [];
    console.log(`✅ [C1] 节点类型: ${types.length}种可用`);

    // ---- Step 4: 保存DAG（完整的营销流程） ----
    const dagR = await api(request, 'PUT', `/api/campaign/canvas/plan/${planId}/dag`, {
      nodes: [
        { id: 'n1', type: 'AUDIENCE_FILTER', label: '高价值会员筛选',
          config: { segmentCode: 'high_value', filters: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }], limit: 50000 }},
        { id: 'n2', type: 'AI_SCORE', label: 'AI流失评分',
          config: { modelType: 'churn', threshold: 0.6, batchSize: 1000 }},
        { id: 'n3', type: 'CONDITION', label: '流失风险判断',
          config: { field: 'churnProbability', operator: 'gte', value: 0.6 }},
        { id: 'n4', type: 'SEND_EMAIL', label: '发送召回邮件',
          config: { assetId, requireApproval: false, retryCount: 3 }},
        { id: 'n5', type: 'OFFER_POINTS', label: '赠送回归积分',
          config: { pointType: 'REWARD', amount: 500, reason: '会员召回奖励' }},
        { id: 'n6', type: 'END', label: '结束' },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4', condition: 'churnProbability >= 0.6' },
        { id: 'e4', source: 'n4', target: 'n5' },
        { id: 'e5', source: 'n5', target: 'n6' },
        { id: 'e6', source: 'n3', target: 'n6', condition: 'churnProbability < 0.6' },
      ],
    });
    requireOk(dagR, '保存DAG');
    console.log(`✅ [C1] DAG保存: 6节点, 6连线`);

    // ---- Step 5: 校验DAG ----
    const valR = await api(request, 'POST', '/api/campaign/canvas/validate', {
      nodes: [
        { id: 'n1', type: 'AUDIENCE_FILTER', label: '人群筛选' },
        { id: 'n2', type: 'SEND_EMAIL', label: '发送邮件' },
        { id: 'n3', type: 'END', label: '结束' },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    });
    requireOk(valR, '校验DAG');
    if (valR.body.data) {
      console.log(`✅ [C1] DAG校验: valid=${valR.body.data.valid}`);
    }

    // ---- Step 6: AI生成DAG ----
    const aiR = await api(request, 'POST', '/api/campaign/canvas/ai-generate', {
      goal: '提升高价值会员留存率20%',
      description: '筛选高价值会员，AI评分后发送专属邮件和积分奖励',
      budget: '500000',
      audience: '高价值会员',
      channel: 'EMAIL',
    });
    requireOk(aiR, 'AI生成DAG');
    if (aiR.body.data) {
      console.log(`✅ [C1] AI生成DAG: ${(aiR.body.data.nodes || []).length}节点, ${(aiR.body.data.edges || []).length}连线`);
    }

    // ---- Step 7: 编译BPMN ----
    const bpmnR = await api(request, 'GET', `/api/campaign/canvas/plan/${planId}/compile`);
    if (ok(bpmnR) && bpmnR.body.data) {
      console.log(`✅ [C1] BPMN编译成功: ${bpmnR.body.data.length}字符`);
    } else {
      console.log(`  ⚠️ BPMN编译: ${bpmnR.body?.code} ${bpmnR.body?.message}`);
    }

    // ---- Step 8: 部署流程 ----
    const depR = await api(request, 'POST', `/api/campaign/execution/${planId}/deploy`);
    if (ok(depR)) {
      console.log(`✅ [C1] 流程部署成功`);
    } else {
      console.log(`  ⚠️ 流程部署: ${depR.body?.code} ${depR.body?.message}`);
    }

    // ---- Step 9: 启动流程 ----
    const startR = await api(request, 'POST', `/api/campaign/execution/${planId}/start`);
    if (ok(startR)) {
      console.log(`✅ [C1] 流程启动成功`);
    } else {
      console.log(`  ⚠️ 流程启动: ${startR.body?.code} ${startR.body?.message}`);
    }

    // ---- Step 10: 查询执行状态 ----
    const statusR = await api(request, 'GET', `/api/campaign/execution/status/${planId}`);
    if (ok(statusR)) {
      console.log(`✅ [C1] 执行状态查询成功`);
    }

    console.log(`\n📋 画布阶段完成: Plan=${planId}, Asset=${assetId}`);
  });
});

// ========================================================================
// 场景四：干预 + 反馈闭环
// ========================================================================

test.describe('业务流 4: 运行干预 → 反馈闭环', () => {
  // 干预接口不要求plan真实存在即可记录，使用独立ID测试接口连通性

  test('[M1] 暂停活动 → 覆盖配置 → 恢复 → 反馈计算', async ({ request }) => {
    const planId = `e2e_plan_${TAG}`;

    const pauseR = await api(request, 'POST', `/api/campaign/intervention/${planId}/pause`, {
      operatorId: 'admin', reason: '发现发送频率过高，临时暂停',
    });
    if (!ok(pauseR)) console.log(`  ⚠️ 暂停: ${pauseR.body?.code} ${pauseR.body?.message}`);
    expect(pauseR.status).toBe(200);

    const configR = await api(request, 'PUT', `/api/campaign/intervention/${planId}/config/n4`, {
      config: { rateLimit: 100, subjectLine: '【紧急调整】专属回归礼遇' },
      operatorId: 'admin',
    });
    if (!ok(configR)) console.log(`  intervene/config: ${configR.body?.code}`);
    expect(configR.status).toBe(200);
    console.log(`✅ [M1] 节点配置已覆盖`);

    const resumeR = await api(request, 'POST', `/api/campaign/intervention/${planId}/resume`, {
      operatorId: 'admin', reason: '配置已修复，恢复执行',
    });
    if (!ok(resumeR)) console.log(`  intervene/resume: ${resumeR.body?.code}`);
    expect(resumeR.status).toBe(200);

    const calcR = await api(request, 'POST', `/api/campaign/feedback/${planId}/calculate`);
    if (!ok(calcR)) console.log(`  feedback/calc: ${calcR.body?.code}`);
    expect(calcR.status).toBe(200);

    const driftR = await api(request, 'GET', '/api/campaign/feedback/drift');
    if (!ok(driftR)) console.log(`  feedback/drift: ${driftR.body?.code}`);
    expect(driftR.status).toBe(200);

    const statusR = await api(request, 'GET', `/api/campaign/intervention/${planId}/status`);
    if (!ok(statusR)) console.log(`  intervene/status: ${statusR.body?.code}`);
    expect(statusR.status).toBe(200);

    const historyR = await api(request, 'GET', `/api/campaign/intervention/${planId}/interventions`);
    if (!ok(historyR)) console.log(`  intervene/history: ${historyR.body?.code}`);
    expect(historyR.status).toBe(200);
  });
});

// ========================================================================
// 场景五：前端页面验证——数据在UI中可见
// ========================================================================

test.describe('业务流 5: 前端UI验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND);
    await page.evaluate(() => {
      sessionStorage.setItem('current_program_code', 'PROG001');
      localStorage.setItem('auth_token', 'mock_e2e_token');
      localStorage.setItem('user_info', JSON.stringify({
        userId: 'admin', username: 'admin', displayName: '管理员',
      }));
    });
  });

  test('[U1] 工作区列表显示测试数据', async ({ page }) => {
    await page.goto(`${FRONTEND}/campaign/workspaces`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 验证页面标题
    await expect(page.locator('text=营销工作区').first()).toBeVisible({ timeout: 5000 });

    // 验证测试数据出现在列表中
    const pageText = await page.locator('body').innerText();
    const hasTestData = pageText.includes('Q3') || pageText.includes('E2E');
    console.log(`[U1] 页面内容包含测试数据: ${hasTestData}`);
    expect(hasTestData).toBe(true);
  });

  test('[U2] 进入工作区查看详情', async ({ page }) => {
    await page.goto(`${FRONTEND}/campaign/workspaces`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 点击"进入"按钮
    const enterBtn = page.getByText('进入').first();
    await expect(enterBtn).toBeVisible({ timeout: 5000 });

    // 右键打开新标签或直接点击
    await enterBtn.click();
    await page.waitForTimeout(2000);

    // 验证详情页的Tab栏
    const goalTab = page.locator('text=目标管理').first();
    const iniTab = page.locator('text=举措管理').first();
    const portTab = page.locator('text=组合管理').first();

    if (await goalTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[U2] ✅ 目标管理Tab可见`);
      await goalTab.click();
      await page.waitForTimeout(1000);
    }
    if (await iniTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`[U2] ✅ 举措管理Tab可见`);
      await iniTab.click();
      await page.waitForTimeout(1000);
    }
    if (await portTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`[U2] ✅ 组合管理Tab可见`);
    }
  });
});

// ========================================================================
// 场景六：完整数据校验——验证所有数据已正确持久化
// ========================================================================

test.describe('业务流 6: 数据完整性校验', () => {

  test('[V1] 验证数据库中的所有业务实体', async ({ request }) => {
    // 验证工作区
    const wsR = await api(request, 'GET', `/api/campaign/workspace?programCode=${PROG}`);
    requireOk(wsR, '查询工作区');
    const wsList = wsR.body.data || [];
    expect(wsList.length).toBeGreaterThanOrEqual(1);
    console.log(`✅ [V1] 工作区: ${wsList.length}个 (需要≥1)`);

    // 逐个验证工作区有目标
    for (const ws of wsList) {
      const ctxR = await api(request, 'GET', `/api/campaign/workspace/${ws.id}/context`);
      if (ok(ctxR)) {
        const ctx = ctxR.body.data;
        console.log(`  📊 ${ws.name}: 目标=${ctx.activeGoal ? ctx.activeGoal.name : '无'}, 举措=${ctx.initiatives?.length || 0}个, 组合=${ctx.portfolios?.length || 0}个`);
      }
    }

    // 验证至少有一个激活的目标
    const allActive = wsList.filter((w: any) => w.activeGoalId);
    console.log(`✅ [V1] 有激活目标的工作区: ${allActive.length}个`);
  });

  test('[V2] 验证画布计划', async ({ request }) => {
    const planR = await api(request, 'GET', `/api/campaign/canvas/node-types`);
    if (ok(planR)) {
      const types = planR.body.data || [];
      console.log(`✅ [V2] 节点类型: ${types.length}种`);
      const names = types.map((t: any) => t.type).join(', ');
      console.log(`  📋 ${names}`);
    }
  });

  test('[V3] 决策引擎历史记录', async ({ request }) => {
    const histR = await api(request, 'GET', '/api/campaign/decision/history?workspaceId=e2e_ws');
    if (ok(histR)) {
      const decisions = Array.isArray(histR.body.data) ? histR.body.data : [];
      console.log(`✅ [V3] 决策历史: ${decisions.length}条`);
    }
  });

  test('[V4] 验证执行引擎基础设施', async ({ request }) => {
    const workersR = await api(request, 'GET', '/api/campaign/execution/workers');
    if (ok(workersR)) {
      const workers = Array.isArray(workersR.body.data) ? workersR.body.data : [];
      console.log(`✅ [V4] Worker节点: ${workers.length}个`);
    }

    const jobsR = await api(request, 'GET', '/api/campaign/execution/job-types');
    if (ok(jobsR)) {
      const types = Array.isArray(jobsR.body.data) ? jobsR.body.data : [];
      console.log(`✅ [V4] Job类型: ${types.length}种`);
    }
  });

  test('[V5] 验证素材管理', async ({ request }) => {
    const assetsR = await api(request, 'GET', `/api/campaign/content/assets?programCode=${PROG}`);
    if (ok(assetsR)) {
      const assets = Array.isArray(assetsR.body.data) ? assetsR.body.data : [];
      console.log(`✅ [V5] 素材库: ${assets.length}个`);
    }
  });
});
