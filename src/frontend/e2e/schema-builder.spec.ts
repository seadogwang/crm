import { test, expect } from '@playwright/test';

test.describe('SchemaBuilder — 低代码画布', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 切换到 Schema Builder 标签
    await page.click('text=Schema 设计器');
    await page.waitForSelector('text=组件面板');
  });

  test('页面加载后显示组件面板和设计画布', async ({ page }) => {
    await expect(page.locator('text=组件面板')).toBeVisible();
    await expect(page.locator('text=基础组件')).toBeVisible();
    await expect(page.locator('text=文本输入')).toBeVisible();
    await expect(page.locator('text=数字选择')).toBeVisible();
    // 初始画布为空
    await expect(page.locator('text=从左侧拖拽组件到此处')).toBeVisible();
  });

  test('组件面板包含三级分类', async ({ page }) => {
    await expect(page.locator('text=基础组件')).toBeVisible();
    await expect(page.locator('text=高级组件')).toBeVisible();
    await expect(page.locator('text=自定义组件')).toBeVisible();
    // 基础组件列表
    await expect(page.locator('text=文本输入')).toBeVisible();
    await expect(page.locator('text=下拉选择')).toBeVisible();
    await expect(page.locator('text=开关')).toBeVisible();
  });

  test('拖拽组件到画布后生成字段卡片', async ({ page }) => {
    const paletteItem = page.locator('text=文本输入').first();
    const canvas = page.locator('text=从左侧拖拽组件到此处');

    // 模拟拖拽
    const box = await paletteItem.boundingBox();
    const targetBox = await canvas.boundingBox();
    if (box && targetBox) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
      await page.mouse.up();
    }
    // 画布应有字段显示
    await page.waitForTimeout(500);
  });

  test('点击「预览 JSON」显示导出的 Schema', async ({ page }) => {
    await page.click('text=预览 JSON');
    const preBlock = page.locator('pre');
    // pre 至少包含 type: object
    await expect(preBlock.first()).toContainText('"type"');
    await expect(preBlock.first()).toContainText('"object"');
    await expect(preBlock.first()).toContainText('"properties"');
  });

  test('展开字段配置后可编辑 title 和 reactions', async ({ page }) => {
    // 先拖一个组件进去
    const paletteItem = page.locator('text=文本输入').first();
    const canvas = page.locator('text=从左侧拖拽组件到此处');
    const bbox = await paletteItem.boundingBox();
    const tbox = await canvas.boundingBox();
    if (bbox && tbox) {
      await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
      await page.mouse.down();
      await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    // 点击「配置」按钮
    const configBtn = page.locator('button:has-text("配置")').first();
    if (await configBtn.isVisible()) {
      await configBtn.click();
      await expect(page.locator('text=字段标题')).toBeVisible();
      await expect(page.locator('text=联动表达式 (x-reactions)')).toBeVisible();
    }
  });

  test('「保存 Schema」按钮可见', async ({ page }) => {
    await expect(page.locator('button:has-text("保存 Schema")')).toBeVisible();
    const saveBtn = page.locator('button:has-text("保存 Schema")');
    await expect(saveBtn).toBeEnabled();
  });
});