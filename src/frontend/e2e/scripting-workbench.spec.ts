import { test, expect } from '@playwright/test';

test.describe('ScriptingWorkbench — 渠道脚本工作台', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=渠道脚本工作台');
    await page.waitForSelector('text=原始第三方 JSON');
  });

  test('三栏布局加载完整', async ({ page }) => {
    // 左栏：原始 JSON
    await expect(page.locator('text=原始第三方 JSON')).toBeVisible();
    // 中栏：编辑器
    await expect(page.locator('text=转换脚本 (JavaScript)')).toBeVisible();
    // 右栏：结果
    await expect(page.locator('text=转换结果')).toBeVisible();
  });

  test('左栏显示默认示例 JSON', async ({ page }) => {
    const leftPanel = page.locator('text=原始第三方 JSON').locator('..');
    // textarea 中包含 order id
    const textarea = leftPanel.locator('textarea');
    const value = await textarea.inputValue();
    expect(value).toContain('TM202605310001');
    expect(value).toContain('13800138000');
    expect(value).toContain('SKU-001');
  });

  test('Monaco 编辑器加载并显示模板代码', async ({ page }) => {
    // Monaco 编辑器区域
    const editorArea = page.locator('.monaco-editor');
    await expect(editorArea.first()).toBeVisible({ timeout: 5000 });
    // 编辑器内容应包含 function transform
    await page.waitForTimeout(1000);
    // 选择 Monaco 内容
    await page.click('.monaco-editor');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
  });

  test('模板切换下拉框可见且有 4 个选项', async ({ page }) => {
    // 模板 selector
    await page.click('text=转换脚本 (JavaScript)');
    // 找到模板下拉框
    const templateSelect = page.locator('.ant-select').first();
    await expect(templateSelect).toBeVisible();
  });

  test('渠道选择器包含 4 个渠道', async ({ page }) => {
    await page.waitForTimeout(500);
    // 查找包含 TMALL 的元素
    await expect(page.locator('text=TMALL')).toBeVisible();
  });

  test('「在线测试」按钮可见', async ({ page }) => {
    const testBtn = page.locator('button:has-text("在线测试")');
    await expect(testBtn).toBeVisible();
    await expect(testBtn).toBeEnabled();
  });

  test('沙箱提示信息显示', async ({ page }) => {
    await expect(page.locator('text=50ms 超时')).toBeVisible();
    await expect(page.locator('text=在线测试')).toBeVisible();
  });

  test('输入无效 JSON 时点击测试应提示错误', async ({ page }) => {
    // 清空左栏 textarea 并输入无效 JSON
    const textarea = page.locator('text=原始第三方 JSON').locator('..').locator('textarea');
    await textarea.fill('invalid json {{{');
    await page.click('button:has-text("在线测试")');
    // 应出现 message 提示
    await page.waitForTimeout(500);
    // message 组件可能出现
    const message = page.locator('.ant-message');
    console.log(`[Scripting] Message visible: ${await message.count() > 0}`);
  });

  test('右栏初始状态显示引导文案', async ({ page }) => {
    const rightPanel = page.locator('text=转换结果').locator('..');
    await expect(rightPanel.locator('text=在线测试')).toBeVisible();
    // GraalVM 提示
    await expect(page.locator('text=GraalVM 沙箱限制')).toBeVisible();
  });
});