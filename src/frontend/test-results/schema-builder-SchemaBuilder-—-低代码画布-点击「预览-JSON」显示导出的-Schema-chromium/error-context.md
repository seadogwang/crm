# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: schema-builder.spec.ts >> SchemaBuilder — 低代码画布 >> 点击「预览 JSON」显示导出的 Schema
- Location: e2e\schema-builder.spec.ts:47:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=Schema 设计器')

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('SchemaBuilder — 低代码画布', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     // 切换到 Schema Builder 标签
> 7  |     await page.click('text=Schema 设计器');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  8  |     await page.waitForSelector('text=组件面板');
  9  |   });
  10 | 
  11 |   test('页面加载后显示组件面板和设计画布', async ({ page }) => {
  12 |     await expect(page.locator('text=组件面板')).toBeVisible();
  13 |     await expect(page.locator('text=基础组件')).toBeVisible();
  14 |     await expect(page.locator('text=文本输入')).toBeVisible();
  15 |     await expect(page.locator('text=数字选择')).toBeVisible();
  16 |     // 初始画布为空
  17 |     await expect(page.locator('text=从左侧拖拽组件到此处')).toBeVisible();
  18 |   });
  19 | 
  20 |   test('组件面板包含三级分类', async ({ page }) => {
  21 |     await expect(page.locator('text=基础组件')).toBeVisible();
  22 |     await expect(page.locator('text=高级组件')).toBeVisible();
  23 |     await expect(page.locator('text=自定义组件')).toBeVisible();
  24 |     // 基础组件列表
  25 |     await expect(page.locator('text=文本输入')).toBeVisible();
  26 |     await expect(page.locator('text=下拉选择')).toBeVisible();
  27 |     await expect(page.locator('text=开关')).toBeVisible();
  28 |   });
  29 | 
  30 |   test('拖拽组件到画布后生成字段卡片', async ({ page }) => {
  31 |     const paletteItem = page.locator('text=文本输入').first();
  32 |     const canvas = page.locator('text=从左侧拖拽组件到此处');
  33 | 
  34 |     // 模拟拖拽
  35 |     const box = await paletteItem.boundingBox();
  36 |     const targetBox = await canvas.boundingBox();
  37 |     if (box && targetBox) {
  38 |       await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  39 |       await page.mouse.down();
  40 |       await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  41 |       await page.mouse.up();
  42 |     }
  43 |     // 画布应有字段显示
  44 |     await page.waitForTimeout(500);
  45 |   });
  46 | 
  47 |   test('点击「预览 JSON」显示导出的 Schema', async ({ page }) => {
  48 |     await page.click('text=预览 JSON');
  49 |     const preBlock = page.locator('pre');
  50 |     // pre 至少包含 type: object
  51 |     await expect(preBlock.first()).toContainText('"type"');
  52 |     await expect(preBlock.first()).toContainText('"object"');
  53 |     await expect(preBlock.first()).toContainText('"properties"');
  54 |   });
  55 | 
  56 |   test('展开字段配置后可编辑 title 和 reactions', async ({ page }) => {
  57 |     // 先拖一个组件进去
  58 |     const paletteItem = page.locator('text=文本输入').first();
  59 |     const canvas = page.locator('text=从左侧拖拽组件到此处');
  60 |     const bbox = await paletteItem.boundingBox();
  61 |     const tbox = await canvas.boundingBox();
  62 |     if (bbox && tbox) {
  63 |       await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
  64 |       await page.mouse.down();
  65 |       await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2, { steps: 5 });
  66 |       await page.mouse.up();
  67 |       await page.waitForTimeout(300);
  68 |     }
  69 | 
  70 |     // 点击「配置」按钮
  71 |     const configBtn = page.locator('button:has-text("配置")').first();
  72 |     if (await configBtn.isVisible()) {
  73 |       await configBtn.click();
  74 |       await expect(page.locator('text=字段标题')).toBeVisible();
  75 |       await expect(page.locator('text=联动表达式 (x-reactions)')).toBeVisible();
  76 |     }
  77 |   });
  78 | 
  79 |   test('「保存 Schema」按钮可见', async ({ page }) => {
  80 |     await expect(page.locator('button:has-text("保存 Schema")')).toBeVisible();
  81 |     const saveBtn = page.locator('button:has-text("保存 Schema")');
  82 |     await expect(saveBtn).toBeEnabled();
  83 |   });
  84 | });
```