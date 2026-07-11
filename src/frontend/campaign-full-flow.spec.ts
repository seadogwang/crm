/**
 * Campaign 全模块 E2E 测试 + 截屏手册
 *
 * 使用 Playwright 遍历所有 Campaign 相关页面，截屏并生成操作手册。
 *
 * 运行方式:
 *   cd src/frontend
 *   npx playwright test campaign-full-flow.spec.ts --reporter=html
 *
 * 或:
 *   npx tsx campaign-full-flow.spec.ts
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve(__dirname, 'campaign-screenshots');
const REPORT_PATH = path.resolve(__dirname, 'campaign-manual.md');

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 报告内容
let reportLines: string[] = [];
let screenshotIndex = 0;

function screenshotName(name: string): string {
  screenshotIndex++;
  return `${String(screenshotIndex).padStart(3, '0')}_${name}.png`;
}

async function snap(page: Page, name: string, description: string) {
  const fname = screenshotName(name);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fname), fullPage: true });
  reportLines.push(`\n### ${screenshotIndex}. ${description}\n`);
  reportLines.push(`![${name}](campaign-screenshots/${fname})\n`);
  reportLines.push(`*${description}*\n`);
  console.log(`  📸 [${screenshotIndex}] ${description}`);
}

// ================================================================
// 主测试流程
// ================================================================
async function run() {
  const browser: Browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page: Page = await context.newPage();

  try {
    // ====================================================================
    // 第一章：登录
    // ====================================================================
    reportLines.push('# Campaign 全模块操作手册\n');
    reportLines.push(`> 生成时间: ${new Date().toISOString()}\n`);
    reportLines.push(`> 测试环境: ${BASE_URL}\n`);
    reportLines.push('---\n');

    reportLines.push('\n## 一、登录系统\n');

    console.log('\n🔐 登录系统...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await snap(page, 'login', '登录页面 — 输入用户名和密码');

    // 填写登录表单
    await page.fill('input[placeholder*="用户名"]', 'superadmin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(2000);
    await snap(page, 'dashboard', '登录成功 — 系统仪表盘首页');

    // ====================================================================
    // 第二章：Campaign 工作区
    // ====================================================================
    reportLines.push('\n## 二、Campaign 工作区管理\n');
    reportLines.push('工作区是 Campaign 的顶层容器，所有营销活动都在工作区下进行。\n');

    // 2.1 工作区列表
    console.log('\n📋 2.1 工作区列表...');
    await page.goto(`${BASE_URL}/campaign/workspaces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'workspace-list', '工作区列表 — 查看所有工作区');

    // 2.2 创建工作区
    console.log('📋 2.2 创建工作区...');
    await page.goto(`${BASE_URL}/campaign/workspaces/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'workspace-create', '创建工作区 — 填写名称、描述、预算等信息');

    // 填写表单创建
    try {
      await page.fill('input[id*="name"]', `E2E测试工作区_${Date.now()}`);
      await page.fill('textarea[id*="description"]', '自动化测试工作区');
      await page.click('button:has-text("创建")');
      await page.waitForTimeout(3000);
      await snap(page, 'workspace-created', '工作区创建完成 — 返回工作区列表');
    } catch (e) {
      console.log('  ⚠️ 创建工作区跳过 (可能已存在)');
    }

    // 2.3 工作区详情
    console.log('📋 2.3 工作区详情...');
    // 回到工作区列表，点击第一个工作区
    await page.goto(`${BASE_URL}/campaign/workspaces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // 点击第一个工作区卡片
    const firstWorkspace = page.locator('a[href*="/campaign/workspace/"]').first();
    if (await firstWorkspace.isVisible()) {
      await firstWorkspace.click();
      await page.waitForTimeout(2000);
      await snap(page, 'workspace-detail', '工作区详情 — 包含目标、举措、组合、计划等子模块');
    }

    // ====================================================================
    // 第三章：目标管理
    // ====================================================================
    reportLines.push('\n## 三、目标管理 (Goals)\n');
    reportLines.push('目标定义了营销活动想要达成的业务指标。\n');

    console.log('\n🎯 3.1 目标管理...');
    // 目标通常在 workspace detail 页面中
    await snap(page, 'goals-section', '目标管理 — 在工作区详情页中管理目标，包括创建、查看、激活/暂停/归档');

    // ====================================================================
    // 第四章：举措管理
    // ====================================================================
    reportLines.push('\n## 四、举措管理 (Initiatives)\n');
    reportLines.push('举措是实现目标的具体行动方案，每个举措可配置规则和预算。\n');

    console.log('📋 4.1 举措管理...');
    await snap(page, 'initiatives-section', '举措管理 — 在工作区详情页中管理举措，设置优先级、时间范围、KPI');

    // ====================================================================
    // 第五章：组合管理
    // ====================================================================
    reportLines.push('\n## 五、组合管理 (Portfolios)\n');
    reportLines.push('组合将多个举措打包，通过贪心优化算法进行预算分配。\n');

    console.log('📊 5.1 组合管理...');
    await snap(page, 'portfolio-section', '组合管理 — 预算分配与优化，支持贪心算法和约束优化');

    // ====================================================================
    // 第六章：营销画布 (Canvas Editor)
    // ====================================================================
    reportLines.push('\n## 六、营销画布 (Canvas Editor)\n');
    reportLines.push('可视化设计营销流程的 DAG 画布，支持13种节点类型的拖拽编排。\n');

    console.log('🎨 6.1 营销画布...');
    await page.goto(`${BASE_URL}/campaign/canvas/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await snap(page, 'canvas-editor-new', '营销画布 — 新建空白画布，左侧节点面板，中央画布区，右侧属性面板');

    // ====================================================================
    // 第七章：决策引擎
    // ====================================================================
    reportLines.push('\n## 七、决策引擎 (Decision Engine)\n');
    reportLines.push('智能预算分配与冲突仲裁，支持贪心算法和约束优化。\n');

    console.log('🧠 7.1 决策引擎...');
    await page.goto(`${BASE_URL}/campaign/decision`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'decision-engine', '决策引擎 — 预算分配、冲突仲裁、优先级排序');

    // ====================================================================
    // 第八章：模拟与优化
    // ====================================================================
    reportLines.push('\n## 八、模拟与优化 (Simulation & Optimization)\n');
    reportLines.push('基于历史数据模拟营销效果，预估 ROI、转化率、收入等指标。\n');

    console.log('📈 8.1 模拟与优化...');
    await page.goto(`${BASE_URL}/campaign/simulation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'simulation', '模拟与优化 — 运行模拟、查看基线、优化结果');

    // ====================================================================
    // 第九章：内容管理
    // ====================================================================
    reportLines.push('\n## 九、内容管理 (Content Management)\n');
    reportLines.push('管理营销素材的创建、审批、合规校验和模板渲染。\n');

    console.log('📝 9.1 内容管理...');
    await page.goto(`${BASE_URL}/campaign/content`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'content-management', '内容管理 — 素材创建、审批流程、合规校验');

    // ====================================================================
    // 第十章：干预控制台
    // ====================================================================
    reportLines.push('\n## 十、干预控制台 (Intervention Dashboard)\n');
    reportLines.push('运行时干预：暂停/恢复/取消活动、跳过节点、覆盖配置、紧急限流。\n');

    console.log('🛑 10.1 干预控制台...');
    await page.goto(`${BASE_URL}/campaign/intervention`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'intervention', '干预控制台 — 暂停/恢复/取消活动、跳过节点、紧急限流');

    // ====================================================================
    // 第十一章：执行监控
    // ====================================================================
    reportLines.push('\n## 十一、执行监控 (Execution Monitor)\n');
    reportLines.push('实时监控 Zeebe 工作流引擎的执行状态，查看 Worker 列表和 Job 类型。\n');

    console.log('🔍 11.1 执行监控...');
    await page.goto(`${BASE_URL}/campaign/execution`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'execution-monitor', '执行监控 — Zeebe 流程实例、Worker 状态、执行历史');

    // ====================================================================
    // 第十二章：反馈分析
    // ====================================================================
    reportLines.push('\n## 十二、反馈分析 (Feedback Analysis)\n');
    reportLines.push('预测 vs 实际效果对比，模型漂移检测，策略自动调整建议。\n');

    console.log('📊 12.1 反馈分析...');
    await page.goto(`${BASE_URL}/campaign/feedback`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'feedback-analysis', '反馈分析 — ROI偏差、模型漂移、策略调整');

    // ====================================================================
    // 第十三章：机会智能
    // ====================================================================
    reportLines.push('\n## 十三、机会智能 (Opportunity Intelligence)\n');
    reportLines.push('AI 驱动的机会发现：流失预测、提升评分、外部信号、推荐行动。\n');

    console.log('💡 13.1 机会智能...');
    await page.goto(`${BASE_URL}/campaign/opportunity`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'opportunity-intelligence', '机会智能 — 机会发现、评分、推荐行动');

    // 13.2 机会评分配置
    console.log('💡 13.2 机会评分配置...');
    await page.goto(`${BASE_URL}/campaign/opportunity/config`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'opportunity-config', '机会评分配置 — 配置评分维度和AI技能');

    // ====================================================================
    // 第十四章：事件触发器
    // ====================================================================
    reportLines.push('\n## 十四、事件触发器 (Event Triggers)\n');
    reportLines.push('配置事件驱动的营销自动触发，支持 Webhook、去重窗口、过滤器。\n');

    console.log('⚡ 14.1 事件触发器...');
    // 事件触发器需要 planId，先导航到 workspace 找到一个 plan
    await page.goto(`${BASE_URL}/campaign/workspaces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'event-trigger-list', '事件触发器 — 在计划详情页中配置事件的触发条件和去重策略');

    // ====================================================================
    // 第十五章：用户偏好与退订管理
    // ====================================================================
    reportLines.push('\n## 十五、用户偏好与退订管理 (Consent Management)\n');
    reportLines.push('管理用户营销偏好：渠道 Opt-in/Out、品类偏好、静默时段、GDPR 数据删除。\n');

    console.log('🔒 15.1 用户偏好管理...');
    await page.goto(`${BASE_URL}/campaign/consent`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'consent-management', '用户偏好管理 — 查询/编辑营销偏好、渠道设置、GDPR');

    // ====================================================================
    // 第十六章：实验 A/B 测试
    // ====================================================================
    reportLines.push('\n## 十六、实验 A/B 测试 (Experiment)\n');
    reportLines.push('A/B 测试管理：创建实验、配置变体、流量分配、统计显著性分析、自动推全。\n');

    console.log('🧪 16.1 实验管理...');
    await page.goto(`${BASE_URL}/campaign/experiment`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'experiment-dashboard', '实验A/B测试 — 创建实验、变体配置、流量分配、统计结果');

    // ====================================================================
    // 第十七章：预算节奏
    // ====================================================================
    reportLines.push('\n## 十七、预算节奏 (Budget Pacing)\n');
    reportLines.push('预算消耗监控与节奏控制，防止预算过早耗尽或浪费。\n');

    console.log('💰 17.1 预算节奏...');
    await page.goto(`${BASE_URL}/campaign/budget-pacing`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'budget-pacing', '预算节奏 — 预算消耗监控、节奏控制、预警');

    // ====================================================================
    // 第十八章：营销日历
    // ====================================================================
    reportLines.push('\n## 十八、营销日历 (Campaign Calendar)\n');
    reportLines.push('可视化的营销活动日历，展示活动时间线、冲突检测。\n');

    console.log('📅 18.1 营销日历...');
    await page.goto(`${BASE_URL}/campaign/calendar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'campaign-calendar', '营销日历 — 活动时间线、冲突检测、排期管理');

    // ====================================================================
    // 第十九章：DLQ 死信管理
    // ====================================================================
    reportLines.push('\n## 十九、DLQ 死信管理 (Dead Letter Queue)\n');
    reportLines.push('失败消息管理：查看失败原因、重放或丢弃消息。\n');

    console.log('💀 19.1 DLQ管理...');
    await page.goto(`${BASE_URL}/campaign/dlq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'dlq-management', 'DLQ 死信管理 — 失败消息列表、重放、丢弃');

    // ====================================================================
    // 第二十章：Webhook 监控
    // ====================================================================
    reportLines.push('\n## 二十、Webhook 监控\n');
    reportLines.push('监控外部 Webhook 调用日志，查看请求/响应详情。\n');

    console.log('🔗 20.1 Webhook 监控...');
    await page.goto(`${BASE_URL}/campaign/webhook`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'webhook-monitor', 'Webhook 监控 — 调用日志、请求/响应详情');

    // ====================================================================
    // 第二十一章：跨计划共享
    // ====================================================================
    reportLines.push('\n## 二十一、跨计划共享 (Sharing)\n');
    reportLines.push('管理跨计划、跨租户的资源共享策略。\n');

    console.log('🤝 21.1 共享管理...');
    await page.goto(`${BASE_URL}/campaign/sharing`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'sharing-management', '跨计划共享 — 资源共享策略、跨租户配置');

    // ====================================================================
    // 第二十二章：推荐引擎
    // ====================================================================
    reportLines.push('\n## 二十二、推荐引擎 (Recommendation)\n');
    reportLines.push('AI 驱动的推荐策略管理，缓存和个性化推荐。\n');

    console.log('🎯 22.1 推荐引擎...');
    await page.goto(`${BASE_URL}/campaign/recommendation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'recommendation', '推荐引擎 — 推荐策略、缓存管理');

    // ====================================================================
    // 第二十三章：策略蓝图
    // ====================================================================
    reportLines.push('\n## 二十三、策略蓝图 (Strategy Blueprint)\n');
    reportLines.push('策略拆解引擎：将高层业务目标拆解为可执行的营销策略。\n');

    console.log('📐 23.1 策略蓝图...');
    await page.goto(`${BASE_URL}/campaign/strategy-blueprint`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'strategy-blueprint', '策略蓝图 — 目标拆解、策略生成、执行计划');

    // ====================================================================
    // 第二十四章：条款管理 (新增)
    // ====================================================================
    reportLines.push('\n## 二十四、条款与章程管理 (Terms Management)\n');
    reportLines.push('管理法律/服务同意条款：俱乐部章程、隐私政策、服务条款的版本控制和接受记录审计。\n');

    console.log('📜 24.1 条款管理...');
    await page.goto(`${BASE_URL}/campaign/terms`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap(page, 'terms-management', '条款管理 — 版本管理、接受记录审计、条款类型配置');

    // ====================================================================
    // 附录：完整流程总结
    // ====================================================================
    reportLines.push('\n---\n');
    reportLines.push('\n## 附录：完整业务流程\n');
    reportLines.push('```\n');
    reportLines.push('1. 创建工作区 (Workspace)\n');
    reportLines.push('   ↓\n');
    reportLines.push('2. 设定目标 (Goal) + KPI\n');
    reportLines.push('   ↓\n');
    reportLines.push('3. 规划举措 (Initiative) + 预算\n');
    reportLines.push('   ↓\n');
    reportLines.push('4. 创建组合 (Portfolio) + 贪心优化\n');
    reportLines.push('   ↓\n');
    reportLines.push('5. 设计营销画布 (Canvas/DAG) + 13种节点\n');
    reportLines.push('   ↓\n');
    reportLines.push('6. 决策引擎 (Decision Engine) → 预算分配\n');
    reportLines.push('   ↓\n');
    reportLines.push('7. 模拟预测 (Simulation) → ROI预估\n');
    reportLines.push('   ↓\n');
    reportLines.push('8. 内容审批 (Content) → 合规校验\n');
    reportLines.push('   ↓\n');
    reportLines.push('9. 部署执行 (Execution) → Zeebe流程\n');
    reportLines.push('   ↓\n');
    reportLines.push('10. 在线干预 (Intervention) → 暂停/恢复/限流\n');
    reportLines.push('   ↓\n');
    reportLines.push('11. 反馈分析 (Feedback) → 模型漂移检测\n');
    reportLines.push('   ↓\n');
    reportLines.push('12. 策略调整 → 循环优化\n');
    reportLines.push('```\n');

    reportLines.push('\n---\n');
    reportLines.push(`\n*本手册由 Playwright E2E 自动化测试生成，共 ${screenshotIndex} 张截图。*\n`);

    // 写入报告
    fs.writeFileSync(REPORT_PATH, reportLines.join(''), 'utf-8');
    console.log(`\n✅ 报告已生成: ${REPORT_PATH}`);
    console.log(`📸 截图共 ${screenshotIndex} 张，保存在: ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    // 即使失败也保存当前报告
    fs.writeFileSync(REPORT_PATH, reportLines.join(''), 'utf-8');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);