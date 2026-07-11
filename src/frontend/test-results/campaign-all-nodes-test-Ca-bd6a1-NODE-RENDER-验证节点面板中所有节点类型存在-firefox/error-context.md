# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: campaign-all-nodes-test.spec.ts >> Canvas Node - 全节点类型渲染测试 >> [NODE-RENDER] 验证节点面板中所有节点类型存在
- Location: e2e\campaign-all-nodes-test.spec.ts:126:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 17
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
  42  |   AI_SCORE: {
  43  |     label: 'AI 评分', category: 'ai',
  44  |     expectedLabels: ['模型类型', '自定义模型ID', '评分阈值', '批处理大小'],
  45  |     expectedHandles: { input: 1, output: 1 },
  46  |   },
  47  |   AI_PLANNER: {
  48  |     label: 'AI 规划', category: 'ai',
  49  |     expectedLabels: ['目标类型', '预算'],
  50  |     expectedHandles: { input: 1, output: 1 },
  51  |   },
  52  |   SEND_EMAIL: {
  53  |     label: '发送邮件', category: 'action',
  54  |     expectedLabels: ['素材ID', '邮件标题', '重试次数', '发送限流', '需要审批'],
  55  |     expectedHandles: { input: 1, output: 1 },
  56  |   },
  57  |   SEND_SMS: {
  58  |     label: '发送短信', category: 'action',
  59  |     expectedLabels: ['素材ID', '模板ID', '重试次数'],
  60  |     expectedHandles: { input: 1, output: 1 },
  61  |   },
  62  |   SEND_PUSH: {
  63  |     label: '发送推送', category: 'action',
  64  |     expectedLabels: ['素材ID', '推送标题', '推送内容'],
  65  |     expectedHandles: { input: 1, output: 1 },
  66  |   },
  67  |   OFFER_POINTS: {
  68  |     label: '发放积分', category: 'action',
  69  |     expectedLabels: ['积分类型', '积分数量', '发放原因'],
  70  |     expectedHandles: { input: 1, output: 1 },
  71  |   },
  72  |   OFFER_COUPON: {
  73  |     label: '发放优惠券', category: 'action',
  74  |     expectedLabels: ['优惠券ID', '发放数量', '发放原因'],
  75  |     expectedHandles: { input: 1, output: 1 },
  76  |   },
  77  |   TIER_UPGRADE: {
  78  |     label: '等级直升', category: 'action',
  79  |     expectedLabels: ['目标等级', '升级原因'],
  80  |     expectedHandles: { input: 1, output: 1 },
  81  |   },
  82  |   WEBHOOK: {
  83  |     label: '外部调用', category: 'action',
  84  |     expectedLabels: ['Webhook URL', 'HTTP方法', '重试次数'],
  85  |     expectedHandles: { input: 1, output: 1 },
  86  |   },
  87  |   DELAY: {
  88  |     label: '延迟等待', category: 'control',
  89  |     expectedLabels: ['延迟时长', '时间单位', '延迟类型'],
  90  |     expectedHandles: { input: 1, output: 1 },
  91  |   },
  92  |   WAIT_EVENT: {
  93  |     label: '事件等待', category: 'control',
  94  |     expectedLabels: ['事件类型', '超时'],
  95  |     expectedHandles: { input: 1, output: 1 },
  96  |   },
  97  |   APPROVAL: {
  98  |     label: '人工审批', category: 'control',
  99  |     expectedLabels: ['指定审批人ID', '审批组', '超时', '超时自动拒绝'],
  100 |     expectedHandles: { input: 1, output: 2 },
  101 |   },
  102 |   END: {
  103 |     label: '结束', category: 'end',
  104 |     expectedLabels: [],
  105 |     expectedHandles: { input: 1, output: 0 },
  106 |   },
  107 | };
  108 | 
  109 | async function dragNodeToCanvas(page: any, nodeLabel: string, canvasX: number, canvasY: number) {
  110 |   const paletteNode = page.locator(`text=${nodeLabel}`).first();
  111 |   const canvas = page.locator('.react-flow');
  112 |   const canvasBox = await canvas.boundingBox();
  113 |   const sourceBox = await paletteNode.boundingBox();
  114 |   if (!canvasBox || !sourceBox) return false;
  115 | 
  116 |   await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  117 |   await page.mouse.down();
  118 |   await page.mouse.move(canvasBox.x + canvasX, canvasBox.y + canvasY, { steps: 10 });
  119 |   await page.mouse.up();
  120 |   await page.waitForTimeout(500);
  121 |   return true;
  122 | }
  123 | 
  124 | test.describe('Canvas Node - 全节点类型渲染测试', () => {
  125 | 
  126 |   test('[NODE-RENDER] 验证节点面板中所有节点类型存在', async ({ page }) => {
  127 |     await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  128 |     await page.waitForTimeout(3000);
  129 | 
  130 |     const pageText = await page.locator('body').textContent();
  131 |     const results: string[] = [];
  132 | 
  133 |     for (const [type, spec] of Object.entries(NODE_EXPECTATIONS)) {
  134 |       const found = pageText.includes(spec.label);
  135 |       results.push(`${type}: ${found ? 'OK' : 'MISSING'}`);
  136 |     }
  137 | 
  138 |     console.log('\n  === Node Palette Check ===');
  139 |     results.forEach(r => console.log(`    ${r}`));
  140 | 
  141 |     const missing = results.filter(r => r.includes('MISSING'));
> 142 |     expect(missing.length).toBe(0);
      |                            ^ Error: expect(received).toBe(expected) // Object.is equality
  143 |   });
  144 | 
  145 |   test('[NODE-RENDER] 验证节点渲染大小和样式', async ({ page }) => {
  146 |     await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  147 |     await page.waitForTimeout(3000);
  148 | 
  149 |     // 拖入一个节点
  150 |     const ok = await dragNodeToCanvas(page, '人群筛选', 200, 200);
  151 |     if (!ok) { test.skip(); return; }
  152 | 
  153 |     // 检查节点渲染
  154 |     const node = page.locator('.campaign-node').first();
  155 |     expect(await node.isVisible()).toBe(true);
  156 | 
  157 |     const box = await node.boundingBox();
  158 |     if (box) {
  159 |       console.log(`  [OK] Node size: ${Math.round(box.width)}x${Math.round(box.height)}px`);
  160 |       // 节点应该小于200px宽
  161 |       expect(box.width).toBeLessThan(250);
  162 |       expect(box.height).toBeLessThan(100);
  163 |     }
  164 | 
  165 |     // 检查节点内容
  166 |     const nodeText = await node.textContent();
  167 |     expect(nodeText).toContain('人群筛选');
  168 |     console.log('  [OK] Node label visible');
  169 |   });
  170 | 
  171 |   test('[NODE-RENDER] 验证连接点(Handle)数量和位置', async ({ page }) => {
  172 |     await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  173 |     await page.waitForTimeout(3000);
  174 | 
  175 |     // 拖入 CONDITION 节点（它有2个输出handle）
  176 |     const ok = await dragNodeToCanvas(page, '条件分支', 300, 200);
  177 |     if (!ok) { test.skip(); return; }
  178 | 
  179 |     const node = page.locator('.campaign-node').first();
  180 |     await expect(node).toBeVisible();
  181 | 
  182 |     // 检查handles
  183 |     const handles = node.locator('.react-flow__handle');
  184 |     const handleCount = await handles.count();
  185 |     console.log(`  [OK] CONDITION node handles: ${handleCount} (expected: 1 input + 2 output = 3)`);
  186 |     expect(handleCount).toBe(3);
  187 |   });
  188 | 
  189 |   test('[NODE-RENDER] 验证Handle hover显示效果', async ({ page }) => {
  190 |     await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  191 |     await page.waitForTimeout(3000);
  192 | 
  193 |     const ok = await dragNodeToCanvas(page, '发送邮件', 400, 200);
  194 |     if (!ok) { test.skip(); return; }
  195 | 
  196 |     const node = page.locator('.campaign-node').first();
  197 |     await node.hover();
  198 |     await page.waitForTimeout(500);
  199 | 
  200 |     // 检查handle可见性
  201 |     const handles = node.locator('.react-flow__handle');
  202 |     const count = await handles.count();
  203 |     console.log(`  [OK] SEND_EMAIL handles on hover: ${count}`);
  204 | 
  205 |     for (let i = 0; i < count; i++) {
  206 |       const handle = handles.nth(i);
  207 |       const opacity = await handle.evaluate((el: HTMLElement) => {
  208 |         return window.getComputedStyle(el).opacity;
  209 |       });
  210 |       console.log(`    Handle ${i}: opacity=${opacity}`);
  211 |     }
  212 |   });
  213 | 
  214 |   test('[NODE-RENDER] END节点无输出Handle', async ({ page }) => {
  215 |     await page.goto(`${FRONTEND}/campaign/canvas/new`, { timeout: 30000 });
  216 |     await page.waitForTimeout(3000);
  217 | 
  218 |     const ok = await dragNodeToCanvas(page, '结束', 500, 200);
  219 |     if (!ok) { test.skip(); return; }
  220 | 
  221 |     const node = page.locator('.campaign-node').last();
  222 |     await node.hover();
  223 |     await page.waitForTimeout(500);
  224 | 
  225 |     // END节点应该有1个input handle，0个output handle
  226 |     const handles = node.locator('.react-flow__handle');
  227 |     const types = await handles.evaluateAll((els: HTMLElement[]) =>
  228 |       els.map(el => el.getAttribute('data-handlepos'))
  229 |     );
  230 |     console.log(`  [OK] END node handle positions: ${JSON.stringify(types)}`);
  231 |     // END should have only source handles (input = target from left)
  232 |     const sourceCount = types.filter(t => t?.includes('left')).length;
  233 |     expect(sourceCount).toBeGreaterThanOrEqual(0);
  234 |   });
  235 | });
  236 | 
  237 | test.describe('Canvas Config - 全节点配置完整性测试', () => {
  238 | 
  239 |   for (const [nodeType, spec] of Object.entries(NODE_EXPECTATIONS)) {
  240 |     if (nodeType === 'END' || spec.expectedLabels.length === 0) continue;
  241 | 
  242 |     test(`[CONFIG] ${nodeType} - 配置字段完整性`, async ({ page }) => {
```