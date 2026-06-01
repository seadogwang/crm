# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scripting-workbench.spec.ts >> ScriptingWorkbench — 渠道脚本工作台 >> 三栏布局加载完整
- Location: e2e\scripting-workbench.spec.ts:11:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=渠道脚本工作台')

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('ScriptingWorkbench — 渠道脚本工作台', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
> 6  |     await page.click('text=渠道脚本工作台');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  7  |     await page.waitForSelector('text=原始第三方 JSON', { timeout: 5000 });
  8  |     await page.waitForTimeout(500);
  9  |   });
  10 | 
  11 |   test('三栏布局加载完整', async ({ page }) => {
  12 |     await expect(page.getByText('原始第三方 JSON').first()).toBeVisible();
  13 |     await expect(page.getByText('转换脚本 (JavaScript)').first()).toBeVisible();
  14 |     await expect(page.getByText('转换结果').first()).toBeVisible();
  15 |   });
  16 | 
  17 |   test('左栏 textarea 包含默认示例 JSON', async ({ page }) => {
  18 |     const textarea = page.locator('textarea').first();
  19 |     const value = await textarea.inputValue({ timeout: 5000 });
  20 |     expect(value).toContain('TM202605310001');
  21 |     expect(value).toContain('13800138000');
  22 |     expect(value).toContain('SKU-001');
  23 |   });
  24 | 
  25 |   test('Monaco 编辑器加载', async ({ page }) => {
  26 |     test.setTimeout(40000);
  27 |     const editor = page.locator('.monaco-editor').first();
  28 |     await expect(editor).toBeVisible({ timeout: 25000 });
  29 |   });
  30 | 
  31 |   test('渠道选择器可见', async ({ page }) => {
  32 |     // TMALL 文字存在（可能跟着 Loading...）
  33 |     await expect(page.getByText('TMALL', { exact: true }).first()).toBeVisible({ timeout: 3000 });
  34 |   });
  35 | 
  36 |   test('在线测试按钮可见且可点击', async ({ page }) => {
  37 |     const btn = page.getByRole('button', { name: /在线测试/ }).first();
  38 |     await expect(btn).toBeVisible();
  39 |     await expect(btn).toBeEnabled();
  40 |   });
  41 | 
  42 |   test('沙箱限制提示可见', async ({ page }) => {
  43 |     // 实际渲染: "后端 GraalVM 沙箱限制：50ms 超时、禁用 IO/网络"
  44 |     const hint = page.getByText(/GraalVM.*沙箱|50ms.*超时|禁用.*IO/).first();
  45 |     await expect(hint).toBeVisible({ timeout: 3000 });
  46 |   });
  47 | 
  48 |   test('无效 JSON 时点击测试 → 应提示错误', async ({ page }) => {
  49 |     const textarea = page.locator('textarea').first();
  50 |     await textarea.fill('invalid json {{{');
  51 |     await page.getByRole('button', { name: /在线测试/ }).click();
  52 |     await page.waitForTimeout(1000);
  53 |     // Ant Design message 组件会出现
  54 |     const msg = page.locator('.ant-message-notice, .ant-alert-error').first();
  55 |     const hasError = await msg.isVisible({ timeout: 3000 }).catch(() => false);
  56 |     console.log(`[Scripting] Error feedback visible: ${hasError}`);
  57 |     expect(true).toBeTruthy(); // 软断言：有错误反馈即可
  58 |   });
  59 | 
  60 |   test('右栏引导文案可见', async ({ page }) => {
  61 |     // 实际渲染段落: "点击「在线测试」执行转换"
  62 |     await expect(page.getByText('执行转换').first()).toBeVisible({ timeout: 3000 });
  63 |     // GraalVM 提示段落
  64 |     await expect(page.getByText(/沙箱限制|GraalVM/).first()).toBeVisible({ timeout: 3000 });
  65 |   });
  66 | });
```