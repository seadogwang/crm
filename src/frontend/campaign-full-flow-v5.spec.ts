/**
 * Campaign 全模块 E2E 详细测试 + 截屏手册 v5
 *
 * 使用侧边栏导航（避免直接 URL 跳转触发 AuthGuard 403），
 * 每个功能包含列表页 + 新增/创建页，表单填写真实数据。
 *
 * 运行: cd src/frontend && npx tsx campaign-full-flow-v5.spec.ts
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve(__dirname, 'campaign-screenshots');
const REPORT_PATH = path.resolve(__dirname, 'campaign-manual.md');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let report: string[] = [];
let idx = 0;
function ss(n: string) { idx++; return `${String(idx).padStart(3, '0')}_${n}.png`; }
async function snap(page: Page, name: string, desc: string) {
  const f = ss(name);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true });
  report.push(`\n### ${idx}. ${desc}\n![${name}](${f})\n`);
  console.log(`  📸 [${idx}] ${desc}`);
}

// 展开营销管理菜单
async function ensureCampaignMenu(page: Page) {
  const parent = page.locator('.ant-menu-submenu-title:has-text("营销管理")');
  if (await parent.isVisible({ timeout: 3000 }).catch(() => false)) {
    const aria = await parent.getAttribute('aria-expanded');
    if (aria !== 'true') { await parent.click(); await page.waitForTimeout(600); }
  }
}

// 点击侧边栏子菜单项
async function navTo(page: Page, subLabel: string) {
  await ensureCampaignMenu(page);
  const item = page.locator(`.ant-menu-item:has-text("${subLabel}")`);
  if (await item.isVisible({ timeout: 3000 }).catch(() => false)) {
    await item.click(); await page.waitForTimeout(2500);
  }
}

// 点击页面中的按钮 (支持多种匹配方式)
async function clickBtn(page: Page, text: string) {
  const btn = page.locator(`button:has-text("${text}")`).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click(); await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

// 在 Modal 中填写 Input
async function fillModalInput(page: Page, placeholder: string, value: string) {
  const inp = page.locator(`.ant-modal-body input[placeholder*="${placeholder}"]`);
  if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
    await inp.fill(value); return true;
  }
  // fallback: 通过 label 找
  const label = page.locator(`.ant-modal-body .ant-form-item:has-text("${placeholder}") input`);
  if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
    await label.fill(value); return true;
  }
  return false;
}

// 在 Modal 中填写 Textarea
async function fillModalTextarea(page: Page, value: string) {
  const ta = page.locator('.ant-modal-body textarea').first();
  if (await ta.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ta.fill(value); return true;
  }
  return false;
}

// 在 Modal 中选择下拉框 (Ant Design Select 下拉菜单渲染在 body 级别)
async function selectModalOption(page: Page, labelText: string, optionText: string) {
  const sel = page.locator(`.ant-modal-body .ant-form-item:has-text("${labelText}") .ant-select`).first();
  if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sel.click(); await page.waitForTimeout(500);
    // 下拉菜单在 body 级别，不在 modal 内
    const option = page.locator(`.ant-select-item-option:has-text("${optionText}")`).last();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click(); await page.waitForTimeout(300);
      return true;
    }
    // fallback: 用键盘选择
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

// 填写 Modal 中的 InputNumber
async function fillModalNumber(page: Page, labelText: string, value: string) {
  const inp = page.locator(`.ant-modal-body .ant-form-item:has-text("${labelText}") .ant-input-number-input`).first();
  if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
    await inp.fill(value); return true;
  }
  return false;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  try {
    report.push('# Campaign 全模块操作手册\n');
    report.push(`> 生成时间: ${new Date().toISOString()}\n`);
    report.push(`> 测试环境: ${BASE_URL} | 账号: superadmin / admin123\n`);
    report.push('---\n');

    // ====================================================================
    // 一、登录
    // ====================================================================
    report.push('\n## 一、登录系统\n');
    console.log('🔐 登录...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    await snap(page, 'login', '登录页面');

    await page.fill('input[placeholder*="用户名"]', 'superadmin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 }); await page.waitForTimeout(4000);
    await snap(page, 'dashboard', '登录成功 — 仪表盘首页');

    // ====================================================================
    // 二、营销工作区
    // ====================================================================
    report.push('\n## 二、营销工作区管理\n');
    report.push('工作区是 Campaign 的顶层容器，所有营销活动都在工作区下进行。\n');

    // 2.1 工作区列表
    console.log('📋 2.1 工作区列表...');
    await navTo(page, '营销工作区');
    await snap(page, 'workspace-list', '工作区列表 — 展示所有已创建的工作区');

    // 2.2 新建工作区 (通过列表页的"新建工作区"按钮)
    console.log('📋 2.2 新建工作区...');
    await clickBtn(page, '新建工作区');
    await page.waitForTimeout(2000);

    // 工作区创建页是独立页面，不是 Modal，使用页面级选择器
    const wsNameInput = page.locator('input[placeholder*="618大促"]');
    if (await wsNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const wsName = '618年中大促活动_' + Date.now();
      await wsNameInput.fill(wsName);
      await page.locator('textarea').first().fill('针对618大促的全渠道营销活动，包含会员召回、促活、GMV增长三大目标');
      // 默认预算
      const budgetInput = page.locator('.ant-input-number-input').first();
      if (await budgetInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await budgetInput.fill('500000');
      }
      await snap(page, 'workspace-create-form', '新建工作区 — 填写"618年中大促活动"、预算¥500,000');

      // 提交
      await page.locator('button:has-text("创建工作区")').first().click();
      await page.waitForTimeout(4000);
    }

    // 检查是否跳转到详情页
    const currentUrl = page.url();
    console.log(`  当前URL: ${currentUrl}`);
    if (currentUrl.includes('/campaign/workspace/')) {
      await snap(page, 'workspace-detail', '工作区详情 — 创建成功后自动跳转，包含目标/举措/组合三个Tab');
    } else {
      // 可能创建失败，回到列表点击已有工作区
      console.log('  ⚠️ 工作区创建可能失败，尝试从列表进入');
      await navTo(page, '营销工作区');
      await page.waitForTimeout(1500);
      const wsLink = page.locator('a[href*="/campaign/workspace/"]').first();
      if (await wsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await wsLink.click(); await page.waitForTimeout(3000);
        await snap(page, 'workspace-detail', '工作区详情 — 包含目标管理、举措管理、组合管理三个Tab');
      }
    }

    // ====================================================================
    // 三、目标管理
    // ====================================================================
    report.push('\n## 三、目标管理 (Goals)\n');
    report.push('在工作区中设定业务目标，关联KPI指标。\n');

    if (page.url().includes('/campaign/workspace/')) {
      // 3.1 目标列表
      await page.waitForTimeout(1000);
      await snap(page, 'goal-list', '目标列表 — 当前工作区的所有目标');

      // 3.2 新建目标
      console.log('🎯 新建目标...');
      await clickBtn(page, '新建目标');
      await page.waitForTimeout(800);

      await fillModalInput(page, 'GMV提升', 'GMV提升20%');
      await fillModalTextarea(page, '目标：618期间GMV环比增长20%');
      await selectModalOption(page, '目标类型', '营收');
      await fillModalNumber(page, '目标值', '2000000');
      await snap(page, 'goal-create-form', '新建目标 — 填写"GMV提升20%"、目标值¥2,000,000、类型"营收"');

      await clickBtn(page, '创建');
      await page.waitForTimeout(3000);
      // 关闭可能残留的 modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      // 确保 modal 完全消失
      const mask = page.locator('.ant-modal-mask');
      if (await mask.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
      await snap(page, 'goal-after-create', '目标创建完成 — 列表展示新创建的目标');

      // 激活目标
      await page.waitForTimeout(1000);
      const activateBtn = page.locator('button:has-text("激活")').first();
      if (await activateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await activateBtn.click(); await page.waitForTimeout(2000);
        await snap(page, 'goal-activated', '目标已激活 — 状态变为 ACTIVE，显示进度条');
      }
    }

    // ====================================================================
    // 四、举措管理
    // ====================================================================
    report.push('\n## 四、举措管理 (Initiatives)\n');
    report.push('举措是实现目标的具体行动方案。\n');

    if (page.url().includes('/campaign/workspace/')) {
      await page.click('.ant-tabs-tab:has-text("举措管理")'); await page.waitForTimeout(800);
      await snap(page, 'initiative-list', '举措列表 — 当前工作区的所有举措');

      console.log('📋 新建举措...');
      await clickBtn(page, '新建举措');
      await page.waitForTimeout(800);

      await fillModalInput(page, '高价值', '高价值会员专属折扣');
      await fillModalTextarea(page, '针对近90天消费>¥5000的会员，发送专属折扣券');
      await selectModalOption(page, '举措类型', '促活');
      await fillModalNumber(page, '优先级', '85');
      await snap(page, 'initiative-create-form', '新建举措 — 填写"高价值会员专属折扣"、类型"促活"、优先级85');

      await clickBtn(page, '创建');
      await page.waitForTimeout(3000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      const mask2 = page.locator('.ant-modal-mask');
      if (await mask2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
      await snap(page, 'initiative-after-create', '举措创建完成 — 列表展示新举措');
    }

    // ====================================================================
    // 五、组合管理
    // ====================================================================
    report.push('\n## 五、组合管理 (Portfolios)\n');
    report.push('组合将多个举措打包，通过贪心优化算法进行预算分配。\n');

    if (page.url().includes('/campaign/workspace/')) {
      await page.click('.ant-tabs-tab:has-text("组合管理")'); await page.waitForTimeout(800);
      await snap(page, 'portfolio-list', '组合列表 — 当前工作区的所有组合');

      console.log('📊 新建组合...');
      await clickBtn(page, '新建组合');
      await page.waitForTimeout(800);

      await fillModalInput(page, 'Q2', '618营销组合包');
      await fillModalTextarea(page, '包含会员召回、促活、GMV增长三大举措的预算组合');
      await selectModalOption(page, '优化模式', 'ROI');
      await fillModalNumber(page, '总预算', '500000');
      await snap(page, 'portfolio-create-form', '新建组合 — 填写"618营销组合包"、预算¥500,000、优化模式"ROI最大化"');

      await clickBtn(page, '创建');
      await page.waitForTimeout(3000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      const mask3 = page.locator('.ant-modal-mask');
      if (await mask3.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
      await snap(page, 'portfolio-after-create', '组合创建完成 — 列表展示新组合');

      // 运行优化
      const optBtn = page.locator('button:has-text("运行优化")').first();
      if (await optBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await optBtn.click(); await page.waitForTimeout(3000);
        await snap(page, 'portfolio-optimized', '组合优化完成 — 贪心算法已分配预算到各举措');
      }
    }

    // ====================================================================
    // 六 ~ 二十四：其他模块页面
    // ====================================================================
    const pages = [
      { ch: '六', label: '决策引擎', route: '决策引擎', desc: '智能预算分配与冲突仲裁' },
      { ch: '七', label: '画布编辑器', route: '画布编辑器', desc: '可视化设计营销流程的 DAG 画布' },
      { ch: '八', label: '内容合规', route: '内容合规', desc: '管理营销素材的创建、审批、合规校验' },
      { ch: '九', label: '干预中心', route: '干预中心', desc: '运行时干预：暂停/恢复/取消活动' },
      { ch: '十', label: '执行引擎', route: '执行引擎', desc: '实时监控 Zeebe 工作流执行状态' },
      { ch: '十一', label: '机会智能', route: '机会智能', desc: 'AI 驱动的机会发现' },
      { ch: '十二', label: '模拟优化', route: '模拟优化', desc: '基于历史数据模拟营销效果' },
      { ch: '十三', label: '反馈闭环', route: '反馈闭环', desc: '预测 vs 实际效果对比' },
      { ch: '十四', label: '策略蓝图', route: '策略蓝图', desc: '策略拆解引擎' },
      { ch: '十五', label: '预算节奏', route: '预算节奏', desc: '预算消耗监控与节奏控制' },
      { ch: '十六', label: '活动日历', route: '活动日历', desc: '可视化的营销活动日历' },
      { ch: '十七', label: '死信队列', route: '死信队列', desc: '失败消息管理' },
      { ch: '十八', label: 'Webhook 监控', route: 'Webhook 监控', desc: '监控外部 Webhook 调用日志' },
      { ch: '十九', label: '偏好管理', route: '偏好管理', desc: '用户营销偏好管理' },
      { ch: '二十', label: '共享管理', route: '共享管理', desc: '跨计划、跨租户的资源共享' },
      { ch: '二十一', label: '推荐管理', route: '推荐管理', desc: 'AI 驱动的推荐策略管理' },
      { ch: '二十二', label: '实验管理', route: '实验管理', desc: 'A/B 测试管理' },
      { ch: '二十三', label: '事件触发', route: '事件触发', desc: '事件驱动的营销自动触发' },
      { ch: '二十四', label: '条款管理', route: '条款管理', desc: '法律/服务同意条款版本管理 🆕' },
    ];

    for (const p of pages) {
      report.push(`\n## ${p.ch}、${p.label}\n`);
      report.push(`${p.desc}。\n`);
      console.log(`${p.ch} ${p.label}...`);

      if (p.route === '事件触发') {
        // 事件触发需要 planId，导航到工作区列表
        await navTo(page, '营销工作区');
        await snap(page, `event-trigger`, '事件触发 — 需要在计划详情页中配置');
      } else {
        await navTo(page, p.route);
        await snap(page, p.route.replace(/\s+/g, '-').toLowerCase(), `${p.label} — ${p.desc}`);
      }
    }

    // ====================================================================
    // 附录
    // ====================================================================
    report.push('\n---\n');
    report.push('\n## 附录：完整业务流程\n');
    report.push('```\n');
    report.push('1. 创建工作区 (Workspace) ─── 填写名称、预算、时区\n');
    report.push('   ↓\n');
    report.push('2. 设定目标 (Goal) ─── 填写目标名称、类型、目标值、KPI\n');
    report.push('   ↓\n');
    report.push('3. 规划举措 (Initiative) ─── 填写举措名称、类型、优先级\n');
    report.push('   ↓\n');
    report.push('4. 创建组合 (Portfolio) ─── 填写预算、优化模式 → 运行优化\n');
    report.push('   ↓\n');
    report.push('5. 画布编辑器 (Canvas) ─── 13种节点拖拽编排\n');
    report.push('   ↓\n');
    report.push('6. 决策引擎 (Decision) ─── 智能预算分配+冲突仲裁\n');
    report.push('   ↓\n');
    report.push('7. 模拟优化 (Simulation) ─── ROI预估\n');
    report.push('   ↓\n');
    report.push('8. 内容合规 (Content) ─── 素材创建+审批\n');
    report.push('   ↓\n');
    report.push('9. 执行引擎 (Execution) ─── Zeebe 工作流\n');
    report.push('   ↓\n');
    report.push('10. 干预中心 (Intervention) ─── 暂停/恢复/限流\n');
    report.push('   ↓\n');
    report.push('11. 反馈闭环 (Feedback) ─── 预测vs实际+漂移检测\n');
    report.push('   ↓\n');
    report.push('12. 策略蓝图 (Strategy) ─── 策略调整 → 循环优化\n');
    report.push('```\n');

    report.push(`\n---\n*本手册由 Playwright E2E 自动化测试生成，共 ${idx} 张截图。*\n`);
    report.push(`*覆盖范围: 24个功能模块，核心模块（工作区/目标/举措/组合）包含新建表单填写。*\n`);

    fs.writeFileSync(REPORT_PATH, report.join(''), 'utf-8');
    console.log(`\n✅ 报告: ${REPORT_PATH}`);
    console.log(`📸 截图: ${idx} 张 → ${SCREENSHOT_DIR}`);

  } catch (e) {
    console.error('❌ 失败:', e);
    fs.writeFileSync(REPORT_PATH, report.join(''), 'utf-8');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);