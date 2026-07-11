# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: campaign-canvas-full-test.spec.ts >> 3. 节点配置面板测试 >> [CONFIG] SEND_SMS 配置字段
- Location: e2e\campaign-canvas-full-test.spec.ts:233:9

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.react-flow') to be visible

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img [ref=e8] [cursor=pointer]
    - menu
    - generic [ref=e16]:
      - generic [ref=e18] [cursor=pointer]:
        - generic [ref=e20]:
          - combobox [ref=e22]
          - generic "PROG001" [ref=e23]
        - generic:
          - img:
            - img
      - generic [ref=e25]:
        - img "bell" [ref=e26] [cursor=pointer]:
          - img [ref=e27]
        - superscript [ref=e29]:
          - generic [ref=e31]: "3"
      - generic [ref=e33] [cursor=pointer]:
        - img "user" [ref=e36]:
          - img [ref=e37]
        - generic [ref=e39]: 用户
  - generic [ref=e40]:
    - main [ref=e41]:
      - generic [ref=e42]:
        - img "Unauthorized" [ref=e44]
        - generic [ref=e98]: "403"
        - generic [ref=e99]: 抱歉，您没有权限访问此页面
        - button "返回首页" [ref=e101] [cursor=pointer]:
          - generic [ref=e102]: 返回首页
    - contentinfo [ref=e103]:
      - generic [ref=e104]:
        - text: "当前俱乐部:"
        - generic [ref=e105]: PROG001
      - generic [ref=e106]: "环境: DEV | Loyalty SaaS v1.0.0"
```

# Test source

```ts
  1   | /**
  2   |  * 画布编辑器完整功能测试
  3   |  *
  4   |  * 覆盖:
  5   |  * 1. 节点面板 (所有13种节点类型)
  6   |  * 2. 拖拽/点击添加节点
  7   |  * 3. 节点配置面板 (每个节点类型的配置字段)
  8   |  * 4. 人群筛选 (DYNAMIC_STAT + STATIC_ATTR)
  9   |  * 5. 节点连线 (普通 + CONDITION/APPROVAL多端口)
  10  |  * 6. 连线条件编辑
  11  |  * 7. 保存/校验/编译/AI生成
  12  |  * 8. 面板拖拽/折叠
  13  |  * 9. 节点删除
  14  |  * 10. 完整流程编排
  15  |  */
  16  | import { test, expect } from '@playwright/test';
  17  | 
  18  | const FRONTEND = 'http://localhost:5173';
  19  | 
  20  | async function openCanvasEditor(page: any) {
  21  |   await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  22  |   await page.waitForTimeout(3000);
> 23  |   await page.waitForSelector('.react-flow', { timeout: 10000 });
      |              ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  24  | }
  25  | 
  26  | async function addNodeByClick(page: any, nodeLabel: string) {
  27  |   // 节点在浮动面板中，通过 draggable div 定位
  28  |   const paletteNode = page.locator('[draggable="true"]').filter({ hasText: nodeLabel }).first();
  29  |   await paletteNode.click();
  30  |   await page.waitForTimeout(500);
  31  | }
  32  | 
  33  | async function addNodeByDrag(page: any, nodeLabel: string, x: number, y: number) {
  34  |   const paletteNode = page.locator('[draggable="true"]').filter({ hasText: nodeLabel }).first();
  35  |   const canvas = page.locator('.react-flow');
  36  |   const canvasBox = await canvas.boundingBox();
  37  |   const sourceBox = await paletteNode.boundingBox();
  38  |   if (!canvasBox || !sourceBox) return false;
  39  | 
  40  |   await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  41  |   await page.mouse.down();
  42  |   await page.mouse.move(canvasBox.x + x, canvasBox.y + y, { steps: 10 });
  43  |   await page.mouse.up();
  44  |   await page.waitForTimeout(500);
  45  |   return true;
  46  | }
  47  | 
  48  | async function clickNodeByIndex(page: any, index: number) {
  49  |   const nodes = page.locator('.campaign-node');
  50  |   if (await nodes.count() > index) {
  51  |     await nodes.nth(index).click();
  52  |     await page.waitForTimeout(800);
  53  |   }
  54  | }
  55  | 
  56  | async function getDrawerText(page: any): Promise<string> {
  57  |   const drawer = page.locator('.ant-drawer');
  58  |   if (await drawer.isVisible().catch(() => false)) {
  59  |     return await drawer.textContent() || '';
  60  |   }
  61  |   return '';
  62  | }
  63  | 
  64  | test.describe('1. 节点面板测试', () => {
  65  | 
  66  |   test('[PALETTE] 所有节点类型存在', async ({ page }) => {
  67  |     await openCanvasEditor(page);
  68  |     const pageText = await page.locator('body').textContent();
  69  | 
  70  |     const expectedNodes = [
  71  |       '人群筛选', '事件触发', '条件分支', '并行分支', '合并节点',
  72  |       'AI 评分', 'AI 规划', '发送邮件', '发送短信', '发送推送',
  73  |       '发放积分', '发放优惠券', '等级直升', '外部调用',
  74  |       '延迟等待', '事件等待', '人工审批',
  75  |     ];
  76  | 
  77  |     let found = 0;
  78  |     for (const label of expectedNodes) {
  79  |       if (pageText.includes(label)) found++;
  80  |       console.log(`  ${label}: ${pageText.includes(label) ? 'OK' : 'MISSING'}`);
  81  |     }
  82  |     console.log(`  Total: ${found}/${expectedNodes.length}`);
  83  |     expect(found).toBeGreaterThanOrEqual(13);
  84  |   });
  85  | 
  86  |   test('[PALETTE] 面板折叠/展开', async ({ page }) => {
  87  |     await openCanvasEditor(page);
  88  |     const palette = page.locator('text=节点面板').first();
  89  |     const visible = await palette.isVisible().catch(() => false);
  90  |     console.log(`  Palette visible: ${visible}`);
  91  | 
  92  |     // 点 × 关闭
  93  |     const closeBtn = page.locator('button').filter({ hasText: '×' }).first();
  94  |     if (await closeBtn.isVisible()) {
  95  |       await closeBtn.click();
  96  |       await page.waitForTimeout(500);
  97  |       const hidden = !(await page.locator('text=节点面板').first().isVisible().catch(() => false));
  98  |       console.log(`  [${hidden ? 'OK' : 'WARN'}] Palette collapsed`);
  99  |     }
  100 |   });
  101 | 
  102 |   test('[PALETTE] 面板可拖动', async ({ page }) => {
  103 |     await openCanvasEditor(page);
  104 | 
  105 |     const titleBar = page.locator('text=节点面板').first();
  106 |     const box = await titleBar.boundingBox();
  107 |     if (!box) { test.skip(); return; }
  108 | 
  109 |     await page.mouse.move(box.x + box.width / 2, box.y + 5);
  110 |     await page.mouse.down();
  111 |     await page.mouse.move(box.x + 100, box.y + 50, { steps: 5 });
  112 |     await page.mouse.up();
  113 |     await page.waitForTimeout(300);
  114 |     console.log('  [OK] Palette dragged');
  115 |   });
  116 | });
  117 | 
  118 | test.describe('2. 节点添加与渲染', () => {
  119 | 
  120 |   test('[NODE] 点击添加节点', async ({ page }) => {
  121 |     await openCanvasEditor(page);
  122 | 
  123 |     await addNodeByClick(page, '人群筛选');
```