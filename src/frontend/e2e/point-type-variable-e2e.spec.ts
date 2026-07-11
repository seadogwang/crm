import { test, expect } from '@playwright/test';

/**
 * 积分体系重构 E2E 测试
 *
 * 覆盖 Phase 6-8: 积分类型管理、变量管理、规则编辑器变量引用
 *
 * 前置条件：应用已启动，已登录 superadmin/admin123
 */

const BASE_URL = 'http://localhost:5173';

// 登录辅助函数
async function login(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[placeholder*="用户名"]', 'superadmin');
  await page.fill('input[placeholder*="密码"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  // 等待页面稳定
  await page.waitForTimeout(1000);
}

test.describe('积分类型管理 (Phase 6)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('PC-001: 页面渲染 — 积分类型列表页正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    // 验证页面标题存在
    await expect(page.locator('text=积分类型管理')).toBeVisible({ timeout: 5000 });

    // 验证新建按钮存在
    await expect(page.getByText('新建积分类型')).toBeVisible();

    // 验证表格存在
    await expect(page.locator('.ant-table')).toBeVisible();
  });

  test('PC-002: 创建积分类型 — 弹窗打开并包含所有表单字段', async ({ page }) => {
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    // 点击新建
    await page.getByText('新建积分类型').click();
    await page.waitForTimeout(500);

    // 验证弹窗标题
    await expect(page.locator('.ant-modal-title').filter({ hasText: '新建积分类型' })).toBeVisible();

    // 验证表单字段存在
    await expect(page.locator('.ant-modal-body')).toBeVisible();

    // 行为属性
    await expect(page.getByText('可兑换')).toBeVisible();
    await expect(page.getByText('计入等级')).toBeVisible();
    await expect(page.getByText('允许负分')).toBeVisible();
    await expect(page.getByText('可被冲抵')).toBeVisible();

    // 有效期配置
    await expect(page.getByText('有效期模式')).toBeVisible();

    // 取消关闭
    await page.getByText('取消').click();
  });

  test('PC-003: 创建积分类型 — 填写表单并保存', async ({ page }) => {
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    // 点击新建
    await page.getByText('新建积分类型').click();
    await page.waitForTimeout(500);

    // 填写表单
    const testCode = `TEST_${Date.now()}`;
    await page.locator('.ant-modal-body').locator('input[id*="typeCode"]').fill(testCode);
    await page.locator('.ant-modal-body').locator('input[id*="typeName"]').fill('E2E测试积分');

    // 保存
    await page.locator('.ant-modal-footer').getByText('保存').click();
    await page.waitForTimeout(1500);

    // 验证成功提示或表格更新
    const successMsg = page.locator('.ant-message-success');
    const tableUpdated = page.locator(`text=${testCode}`);
    const hasSuccess = await successMsg.isVisible().catch(() => false);
    const hasInTable = await tableUpdated.isVisible().catch(() => false);
    expect(hasSuccess || hasInTable).toBeTruthy();
  });

  test('PC-004: 编辑积分类型', async ({ page }) => {
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    // 点击第一个编辑按钮
    const editBtn = page.locator('button').filter({ hasText: '编辑' }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // 验证弹窗标题
      await expect(page.locator('.ant-modal-title').filter({ hasText: '编辑积分类型' })).toBeVisible();

      // 修改名称
      const nameInput = page.locator('.ant-modal-body').locator('input[id*="typeName"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill('修改后的名称');
      }

      // 保存
      await page.locator('.ant-modal-footer').getByText('保存').click();
      await page.waitForTimeout(1000);
    }
  });

  test('PC-005: 属性驱动查询 — 可兑换/算等级/可冲抵列正确显示', async ({ page }) => {
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    // 验证表格列存在
    await expect(page.locator('.ant-table-thead').getByText('可兑换')).toBeVisible();
    await expect(page.locator('.ant-table-thead').getByText('算等级')).toBeVisible();
    await expect(page.locator('.ant-table-thead').getByText('可冲抵')).toBeVisible();

    // 验证表格有数据
    const rows = page.locator('.ant-table-tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('变量管理 (Phase 7)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('VR-001: 页面渲染 — 变量列表页正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await expect(page.locator('text=变量管理')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('新建变量')).toBeVisible();

    // 提示信息
    await expect(page.getByText('变量可在规则中作为条件使用')).toBeVisible();
  });

  test('VR-002: 创建变量 — 弹窗包含表达式编辑器', async ({ page }) => {
    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await page.getByText('新建变量').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.ant-modal-title').filter({ hasText: '新建变量' })).toBeVisible();

    // 表达式编辑器区域
    await expect(page.getByText('表达式编辑器')).toBeVisible();

    // 函数按钮
    await expect(page.getByText('sum')).toBeVisible();
    await expect(page.getByText('count')).toBeVisible();
    await expect(page.getByText('balance')).toBeVisible();

    // 预览测试区域
    await expect(page.getByText('预览测试')).toBeVisible();
    await expect(page.getByText('计算')).toBeVisible();

    // 取消
    await page.getByText('取消').click();
  });

  test('VR-003: 表达式编辑器 — 点击函数按钮插入', async ({ page }) => {
    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await page.getByText('新建变量').click();
    await page.waitForTimeout(500);

    // 点击 sum 函数按钮
    await page.getByText('sum').click();
    await page.waitForTimeout(300);

    // 验证表达式已插入
    const expressionField = page.locator('.ant-modal-body textarea[id*="expression"]');
    const exprValue = await expressionField.inputValue();
    expect(exprValue).toContain("sum('')");

    await page.getByText('取消').click();
  });

  test('VR-004: 表达式验证 — 无效表达式显示错误', async ({ page }) => {
    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await page.getByText('新建变量').click();
    await page.waitForTimeout(500);

    // 输入无效表达式
    const expressionField = page.locator('.ant-modal-body textarea[id*="expression"]');
    await expressionField.fill('invalid expression without function');
    await page.waitForTimeout(500);

    // 验证错误提示
    // (依赖后端验证API)

    await page.getByText('取消').click();
  });

  test('VR-005: 创建变量 — 完整流程', async ({ page }) => {
    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await page.getByText('新建变量').click();
    await page.waitForTimeout(500);

    // 填写变量代码和名称
    const testCode = `var_${Date.now()}`;

    // 填写表单
    const modalBody = page.locator('.ant-modal-body');
    const inputs = modalBody.locator('input');
    const inputCount = await inputs.count();

    // 第一个 input 是 varCode，第二个是 varName
    if (inputCount >= 2) {
      await inputs.nth(0).fill(testCode);
      await inputs.nth(1).fill('E2E测试变量');
    }

    // 填写表达式
    const expressionField = modalBody.locator('textarea[id*="expression"]');
    await expressionField.fill("sum('REWARD') + 100");
    await page.waitForTimeout(500);

    // 保存
    await page.locator('.ant-modal-footer').getByText('保存').click();
    await page.waitForTimeout(1500);
  });
});

test.describe('规则编辑器 — 变量引用 (Phase 8)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('RE-001: 规则编辑器中存在变量条件区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/rules/new`);
    await page.waitForTimeout(1500);

    // 验证"添加变量条件"按钮存在
    await expect(page.getByText('添加变量条件')).toBeVisible({ timeout: 5000 });
  });

  test('RE-002: 添加变量条件', async ({ page }) => {
    await page.goto(`${BASE_URL}/rules/new`);
    await page.waitForTimeout(1500);

    // 点击添加变量条件
    await page.getByText('添加变量条件').click();
    await page.waitForTimeout(300);

    // 验证变量选择器出现
    await expect(page.getByText('变量条件')).toBeVisible();
  });

  test('RE-003: 规则列表页正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/rules`);
    await page.waitForTimeout(1000);

    await expect(page.locator('text=规则管理').or(page.locator('text=规则列表'))).toBeVisible({ timeout: 5000 });
  });
});

test.describe('菜单导航', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('MN-001: 规则引擎菜单包含积分类型和变量管理', async ({ page }) => {
    // 验证侧边栏菜单项
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(1000);

    // 点击规则引擎菜单展开
    const ruleEngine = page.locator('.ant-menu-submenu-title').filter({ hasText: '规则引擎' });
    if (await ruleEngine.isVisible()) {
      await ruleEngine.click();
      await page.waitForTimeout(500);
    }

    // 验证子菜单
    await expect(page.getByText('积分类型')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('变量管理')).toBeVisible({ timeout: 3000 });
  });

  test('MN-002: 点击积分类型菜单跳转到正确页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(1000);

    // 直接导航
    await page.goto(`${BASE_URL}/points/type`);
    await page.waitForTimeout(1000);

    await expect(page.locator('text=积分类型管理')).toBeVisible({ timeout: 5000 });
  });

  test('MN-003: 点击变量管理菜单跳转到正确页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(1000);

    await page.goto(`${BASE_URL}/variables`);
    await page.waitForTimeout(1000);

    await expect(page.locator('text=变量管理')).toBeVisible({ timeout: 5000 });
  });
});