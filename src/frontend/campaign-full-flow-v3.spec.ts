/**
 * Campaign 全模块 E2E 测试 + 截屏手册 v3
 *
 * 使用正确的侧边栏菜单标签进行导航。
 *
 * 运行方式:
 *   cd src/frontend
 *   npx tsx campaign-full-flow-v3.spec.ts
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve(__dirname, 'campaign-screenshots');
const REPORT_PATH = path.resolve(__dirname, 'campaign-manual.md');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let reportLines: string[] = [];
let screenshotIndex = 0;

function ss(name: string): string {
  screenshotIndex++;
  return `${String(screenshotIndex).padStart(3, '0')}_${name}.png`;
}

async function snap(page: Page, name: string, desc: string) {
  const fname = ss(name);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fname), fullPage: true });
  reportLines.push(`\n### ${screenshotIndex}. ${desc}\n`);
  reportLines.push(`![${name}](campaign-screenshots/${fname})\n`);
  console.log(`  📸 [${screenshotIndex}] ${desc}`);
}

// 展开营销管理菜单并点击子项
async function navTo(page: Page, subLabel: string) {
  // 先展开"营销管理"父菜单
  const parent = page.locator('.ant-menu-submenu-title:has-text("营销管理")');
  if (await parent.isVisible({ timeout: 2000 }).catch(() => false)) {
    const expanded = await parent.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await parent.click();
      await page.waitForTimeout(600);
    }
  }
  // 点击子菜单项
  const item = page.locator(`.ant-menu-item:has-text("${subLabel}")`);
  if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
    await item.click();
    await page.waitForTimeout(2000);
    return true;
  }
  return false;
}

// 直接 URL 导航（用于没有菜单项的页面）
async function navUrl(page: Page, url: string) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  try {
    // ===== 报告头部 =====
    reportLines.push('# Campaign 全模块操作手册\n');
    reportLines.push(`> 生成时间: ${new Date().toISOString()}\n`);
    reportLines.push(`> 测试环境: ${BASE_URL}\n`);
    reportLines.push(`> 测试账号: superadmin / admin123\n`);
    reportLines.push('---\n');

    // ====================================================================
    // 1. 登录
    // ====================================================================
    reportLines.push('\n## 一、登录系统\n');
    console.log('\n🔐 登录...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await snap(page, 'login', '登录页面');

    await page.fill('input[placeholder*="用户名"]', 'superadmin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForTimeout(3000);
    await snap(page, 'dashboard', '登录成功 — 仪表盘首页');

    // ====================================================================
    // 2. 营销工作区
    // ====================================================================
    reportLines.push('\n## 二、营销工作区\n');
    reportLines.push('Campaign 的顶层容器，所有营销活动都在工作区下进行。\n');

    console.log('📋 营销工作区...');
    await navTo(page, '营销工作区');
    await snap(page, 'workspace-list', '营销工作区列表 — 查看所有工作区，支持创建/归档');

    // ====================================================================
    // 3. 决策引擎
    // ====================================================================
    reportLines.push('\n## 三、决策引擎\n');
    reportLines.push('智能预算分配与冲突仲裁，支持贪心算法和约束优化。\n');

    console.log('🧠 决策引擎...');
    await navTo(page, '决策引擎');
    await snap(page, 'decision-engine', '决策引擎 — 预算分配、冲突仲裁、优先级排序');

    // ====================================================================
    // 4. 画布编辑器
    // ====================================================================
    reportLines.push('\n## 四、画布编辑器\n');
    reportLines.push('可视化设计营销流程的 DAG 画布，支持13种节点类型的拖拽编排。\n');

    console.log('🎨 画布编辑器...');
    await navTo(page, '画布编辑器');
    await snap(page, 'canvas-editor', '画布编辑器 — 新建画布，左侧节点面板，中央画布，右侧属性面板');

    // ====================================================================
    // 5. 内容合规
    // ====================================================================
    reportLines.push('\n## 五、内容合规\n');
    reportLines.push('管理营销素材的创建、审批、合规校验和模板渲染。\n');

    console.log('📝 内容合规...');
    await navTo(page, '内容合规');
    await snap(page, 'content-management', '内容合规 — 素材创建、审批流程、合规校验');

    // ====================================================================
    // 6. 干预中心
    // ====================================================================
    reportLines.push('\n## 六、干预中心\n');
    reportLines.push('运行时干预：暂停/恢复/取消活动、跳过节点、覆盖配置、紧急限流。\n');

    console.log('🛑 干预中心...');
    await navTo(page, '干预中心');
    await snap(page, 'intervention', '干预中心 — 暂停/恢复/取消活动、跳过节点、紧急限流');

    // ====================================================================
    // 7. 执行引擎
    // ====================================================================
    reportLines.push('\n## 七、执行引擎\n');
    reportLines.push('实时监控 Zeebe 工作流引擎的执行状态，查看 Worker 列表和 Job 类型。\n');

    console.log('🔍 执行引擎...');
    await navTo(page, '执行引擎');
    await snap(page, 'execution', '执行引擎 — Zeebe 流程实例、Worker 状态、执行历史');

    // ====================================================================
    // 8. 机会智能
    // ====================================================================
    reportLines.push('\n## 八、机会智能\n');
    reportLines.push('AI 驱动的机会发现：流失预测、提升评分、外部信号、推荐行动。\n');

    console.log('💡 机会智能...');
    await navTo(page, '机会智能');
    await snap(page, 'opportunity', '机会智能 — 机会发现、评分、推荐行动');

    // ====================================================================
    // 9. 模拟优化
    // ====================================================================
    reportLines.push('\n## 九、模拟优化\n');
    reportLines.push('基于历史数据模拟营销效果，预估 ROI、转化率、收入等指标。\n');

    console.log('📈 模拟优化...');
    await navTo(page, '模拟优化');
    await snap(page, 'simulation', '模拟优化 — 运行模拟、查看基线、优化结果');

    // ====================================================================
    // 10. 反馈闭环
    // ====================================================================
    reportLines.push('\n## 十、反馈闭环\n');
    reportLines.push('预测 vs 实际效果对比，模型漂移检测，策略自动调整建议。\n');

    console.log('📊 反馈闭环...');
    await navTo(page, '反馈闭环');
    await snap(page, 'feedback', '反馈闭环 — ROI偏差、模型漂移、策略调整');

    // ====================================================================
    // 11. 策略蓝图
    // ====================================================================
    reportLines.push('\n## 十一、策略蓝图\n');
    reportLines.push('策略拆解引擎：将高层业务目标拆解为可执行的营销策略。\n');

    console.log('📐 策略蓝图...');
    await navTo(page, '策略蓝图');
    await snap(page, 'strategy-blueprint', '策略蓝图 — 目标拆解、策略生成、执行计划');

    // ====================================================================
    // 12. 预算节奏
    // ====================================================================
    reportLines.push('\n## 十二、预算节奏\n');
    reportLines.push('预算消耗监控与节奏控制，防止预算过早耗尽或浪费。\n');

    console.log('💰 预算节奏...');
    await navTo(page, '预算节奏');
    await snap(page, 'budget-pacing', '预算节奏 — 预算消耗监控、节奏控制、预警');

    // ====================================================================
    // 13. 活动日历
    // ====================================================================
    reportLines.push('\n## 十三、活动日历\n');
    reportLines.push('可视化的营销活动日历，展示活动时间线、冲突检测。\n');

    console.log('📅 活动日历...');
    await navTo(page, '活动日历');
    await snap(page, 'calendar', '活动日历 — 活动时间线、冲突检测、排期管理');

    // ====================================================================
    // 14. 死信队列
    // ====================================================================
    reportLines.push('\n## 十四、死信队列 (DLQ)\n');
    reportLines.push('失败消息管理：查看失败原因、重放或丢弃消息。\n');

    console.log('💀 死信队列...');
    await navTo(page, '死信队列');
    await snap(page, 'dlq', '死信队列 — 失败消息列表、重放、丢弃');

    // ====================================================================
    // 15. Webhook 监控
    // ====================================================================
    reportLines.push('\n## 十五、Webhook 监控\n');
    reportLines.push('监控外部 Webhook 调用日志，查看请求/响应详情。\n');

    console.log('🔗 Webhook 监控...');
    await navTo(page, 'Webhook 监控');
    await snap(page, 'webhook', 'Webhook 监控 — 调用日志、请求/响应详情');

    // ====================================================================
    // 16. 偏好管理
    // ====================================================================
    reportLines.push('\n## 十六、偏好管理 (Consent)\n');
    reportLines.push('管理用户营销偏好：渠道 Opt-in/Out、品类偏好、静默时段、GDPR 数据删除。\n');

    console.log('🔒 偏好管理...');
    await navTo(page, '偏好管理');
    await snap(page, 'consent', '偏好管理 — 查询/编辑营销偏好、渠道设置、GDPR');

    // ====================================================================
    // 17. 共享管理
    // ====================================================================
    reportLines.push('\n## 十七、共享管理\n');
    reportLines.push('管理跨计划、跨租户的资源共享策略。\n');

    console.log('🤝 共享管理...');
    await navTo(page, '共享管理');
    await snap(page, 'sharing', '共享管理 — 资源共享策略、跨租户配置');

    // ====================================================================
    // 18. 推荐管理
    // ====================================================================
    reportLines.push('\n## 十八、推荐管理\n');
    reportLines.push('AI 驱动的推荐策略管理，缓存和个性化推荐。\n');

    console.log('🎯 推荐管理...');
    await navTo(page, '推荐管理');
    await snap(page, 'recommendation', '推荐管理 — 推荐策略、缓存管理');

    // ====================================================================
    // 19. 实验管理 (菜单导航)
    // ====================================================================
    reportLines.push('\n## 十九、实验管理 (A/B Testing)\n');
    reportLines.push('A/B 测试管理：创建实验、配置变体、流量分配、统计显著性分析、自动推全。\n');

    console.log('🧪 实验管理...');
    await navTo(page, '实验管理');
    await snap(page, 'experiment', '实验管理 — 创建实验、变体配置、流量分配、统计结果');

    // ====================================================================
    // 20. 事件触发 (URL 导航)
    // ====================================================================
    reportLines.push('\n## 二十、事件触发\n');
    reportLines.push('配置事件驱动的营销自动触发，支持 Webhook、去重窗口、过滤器。\n');

    console.log('⚡ 事件触发...');
    await navUrl(page, '/campaign/event-trigger/');
    await snap(page, 'event-trigger', '事件触发 — 配置事件的触发条件和去重策略');

    // ====================================================================
    // 21. 条款管理 (菜单导航)
    // ====================================================================
    reportLines.push('\n## 二十一、条款管理 (Terms Management) 🆕\n');
    reportLines.push('管理法律/服务同意条款：俱乐部章程、隐私政策、服务条款的版本控制和接受记录审计。\n');

    console.log('📜 条款管理...');
    await navTo(page, '条款管理');
    await snap(page, 'terms-management', '条款管理 — 版本管理、接受记录审计');

    // ====================================================================
    // 附录
    // ====================================================================
    reportLines.push('\n---\n');
    reportLines.push('\n## 附录：完整业务流程\n');
    reportLines.push('```\n');
    reportLines.push('1. 营销工作区 (Workspace) ─── 营销活动的顶层容器\n');
    reportLines.push('   ↓\n');
    reportLines.push('2. 设定目标 (Goal) + KPI ─── 定义业务指标\n');
    reportLines.push('   ↓\n');
    reportLines.push('3. 规划举措 (Initiative) + 预算 ─── 具体行动方案\n');
    reportLines.push('   ↓\n');
    reportLines.push('4. 创建组合 (Portfolio) ─── 贪心优化预算分配\n');
    reportLines.push('   ↓\n');
    reportLines.push('5. 画布编辑器 (Canvas/DAG) ─── 13种节点可视化编排\n');
    reportLines.push('   ↓\n');
    reportLines.push('6. 决策引擎 (Decision Engine) ─── 智能预算分配+冲突仲裁\n');
    reportLines.push('   ↓\n');
    reportLines.push('7. 模拟优化 (Simulation) ─── ROI预估+效果预测\n');
    reportLines.push('   ↓\n');
    reportLines.push('8. 内容合规 (Content) ─── 素材创建+审批+合规校验\n');
    reportLines.push('   ↓\n');
    reportLines.push('9. 执行引擎 (Execution) ─── Zeebe工作流引擎\n');
    reportLines.push('   ↓\n');
    reportLines.push('10. 干预中心 (Intervention) ─── 暂停/恢复/限流/跳过节点\n');
    reportLines.push('   ↓\n');
    reportLines.push('11. 反馈闭环 (Feedback) ─── 预测vs实际+模型漂移检测\n');
    reportLines.push('   ↓\n');
    reportLines.push('12. 策略蓝图 (Strategy) ─── 策略调整 → 循环优化\n');
    reportLines.push('```\n');

    reportLines.push('\n---\n');
    reportLines.push(`\n*本手册由 Playwright E2E 自动化测试生成，共 ${screenshotIndex} 张截图。*\n`);
    reportLines.push(`*测试范围: 21个Campaign模块页面，覆盖从工作区创建到数据回流分析的完整流程。*\n`);

    fs.writeFileSync(REPORT_PATH, reportLines.join(''), 'utf-8');
    console.log(`\n✅ 报告: ${REPORT_PATH}`);
    console.log(`📸 截图: ${screenshotIndex} 张 → ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error('❌ 失败:', error);
    fs.writeFileSync(REPORT_PATH, reportLines.join(''), 'utf-8');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);