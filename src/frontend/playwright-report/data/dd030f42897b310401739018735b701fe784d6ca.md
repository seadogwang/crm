# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dynamic-renderer.spec.ts >> DynamicRenderer — 动态渲染引擎 >> 标签页完整切换
- Location: e2e\dynamic-renderer.spec.ts:5:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByText('Schema 设计器').first()

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('DynamicRenderer — 动态渲染引擎', () => {
  4  | 
  5  |   test('标签页完整切换', async ({ page }) => {
  6  |     await page.goto('/');
  7  |     await page.waitForTimeout(500);
  8  | 
  9  |     // Schema Builder — 用 first() 避免 Card title 冲突
> 10 |     await page.getByText('Schema 设计器').first().click();
     |                                                ^ Error: locator.click: Test timeout of 30000ms exceeded.
  11 |     await page.waitForTimeout(1000);
  12 |     const hasBuilder = await page.getByText('组件面板').first().isVisible({ timeout: 5000 }).catch(() => false);
  13 |     expect(hasBuilder).toBeTruthy();
  14 | 
  15 |     // Scripting Workbench
  16 |     await page.getByText('渠道脚本工作台').first().click();
  17 |     await page.waitForTimeout(1000);
  18 |     const hasScripting = await page.getByText('原始第三方 JSON').first().isVisible({ timeout: 5000 }).catch(() => false);
  19 |     expect(hasScripting).toBeTruthy();
  20 |   });
  21 | 
  22 |   test('Loyalty SaaS Admin 标题始终可见', async ({ page }) => {
  23 |     await page.goto('/');
  24 |     await expect(page.locator('h1:has-text("Loyalty SaaS Admin")')).toBeVisible();
  25 |   });
  26 | });
```