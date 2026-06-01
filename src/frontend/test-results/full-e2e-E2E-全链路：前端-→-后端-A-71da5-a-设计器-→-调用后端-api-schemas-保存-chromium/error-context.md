# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-e2e.spec.ts >> E2E 全链路：前端 → 后端 API → 数据库 >> 前端 Schema 设计器 → 调用后端 /api/schemas 保存
- Location: e2e\full-e2e.spec.ts:83:7

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * 端到端全链路测试：前端 UI → Vite 代理 → 后端 API → PostgreSQL
  5   |  *
  6   |  * 要求后端运行在 localhost:8090，前端 Vite 运行在 localhost:6173
  7   |  */
  8   | test.describe('E2E 全链路：前端 → 后端 API → 数据库', () => {
  9   | 
  10  |   const BACKEND = 'http://localhost:8090';
  11  | 
  12  |   // ==================== 后端 API 直连测试 ====================
  13  | 
  14  |   test('GET /api/schemas/MEMBER 返回 JSON Schema', async ({ request }) => {
  15  |     const resp = await request.get(`${BACKEND}/api/schemas/MEMBER`, {
  16  |       headers: { 'X-Program-Code': 'PROG001' },
  17  |     });
  18  |     expect(resp.status()).toBe(200);
  19  |     const body = await resp.json();
  20  |     console.log('[E2E-API] Schema response:', JSON.stringify(body).substring(0, 200));
  21  |     expect(body.code).toBe('SUCCESS');
  22  |   });
  23  | 
  24  |   test('GET /api/members/{id} 查询会员 — 租户隔离', async ({ request }) => {
  25  |     const resp = await request.get(`${BACKEND}/api/members/8821`, {
  26  |       headers: { 'X-Program-Code': 'PROG001' },
  27  |     });
  28  |     // 200 SUCCESS 或业务错误码均可（取决于 DB 中有无该会员）
  29  |     expect(resp.status()).toBe(200);
  30  |     const body = await resp.json();
  31  |     console.log('[E2E-API] Member query:', body.code, body.message);
  32  |   });
  33  | 
  34  |   test('POST /api/members 创建会员 → GET 验证', async ({ request }) => {
  35  |     const testMemberId = Date.now();
  36  |     const createResp = await request.post(`${BACKEND}/api/members`, {
  37  |       headers: {
  38  |         'X-Program-Code': 'PROG001',
  39  |         'X-Idempotency-Key': 'e2e-test-' + testMemberId,
  40  |         'Content-Type': 'application/json',
  41  |       },
  42  |       data: {
  43  |         member_id: testMemberId,
  44  |         tier_code: 'BASE',
  45  |         ext_attributes: { pet_name: 'E2E测试猫', age: 3 },
  46  |       },
  47  |     });
  48  |     expect(createResp.status()).toBe(200);
  49  |     const createBody = await createResp.json();
  50  |     console.log('[E2E-API] Create member:', createBody.code, createBody.message);
  51  | 
  52  |     // 现在查询刚创建的会员
  53  |     const getResp = await request.get(`${BACKEND}/api/members/${testMemberId}`, {
  54  |       headers: { 'X-Program-Code': 'PROG001' },
  55  |     });
  56  |     expect(getResp.status()).toBe(200);
  57  |     const getBody = await getResp.json();
  58  |     console.log('[E2E-API] Verify member:', getBody.code);
  59  | 
  60  |     // 清理
  61  |     await request.delete(`${BACKEND}/api/members/${testMemberId}`, {
  62  |       headers: { 'X-Program-Code': 'PROG001' },
  63  |     }).catch(() => {});
  64  |   });
  65  | 
  66  |   test('缺少 X-Program-Code 返回 403', async ({ request }) => {
  67  |     const resp = await request.get(`${BACKEND}/api/members/8821`);
  68  |     expect(resp.status()).toBe(403);
  69  |   });
  70  | 
  71  |   test('GET /api/schemas/MEMBER/deprecation-check 检查字段引用', async ({ request }) => {
  72  |     const resp = await request.get(
  73  |       `${BACKEND}/api/schemas/MEMBER/deprecation-check?field=pet_name`,
  74  |       { headers: { 'X-Program-Code': 'PROG001' } }
  75  |     );
  76  |     expect(resp.status()).toBe(200);
  77  |     const body = await resp.json();
  78  |     console.log('[E2E-API] Deprecation check:', JSON.stringify(body));
  79  |   });
  80  | 
  81  |   // ==================== 前端 → 后端代理测试 ====================
  82  | 
  83  |   test('前端 Schema 设计器 → 调用后端 /api/schemas 保存', async ({ page }) => {
  84  |     await page.goto('http://localhost:6173');
> 85  |     await page.getByText('Schema 设计器').first().click();
      |                                                ^ Error: locator.click: Test timeout of 30000ms exceeded.
  86  |     await page.waitForSelector('text=组件面板');
  87  | 
  88  |     // 点击保存 Schema 按钮（触发 POST/PUT /api/schemas/MEMBER）
  89  |     const saveBtn = page.getByRole('button', { name: /保存 Schema/ }).first();
  90  |     await expect(saveBtn).toBeVisible();
  91  | 
  92  |     // 监听网络请求
  93  |     const apiCall = page.waitForResponse(
  94  |       resp => resp.url().includes('/api/schemas/') && resp.status() === 200,
  95  |       { timeout: 10000 }
  96  |     ).catch(() => null);
  97  | 
  98  |     // 由于后端 /api/schemas 的 PUT 可能不存在，验证至少 UI 能操作
  99  |     await saveBtn.click();
  100 |     await page.waitForTimeout(2000);
  101 | 
  102 |     // 检查是否有 antd message 反馈（成功或失败都算有反馈）
  103 |     const hasFeedback = await page.locator('.ant-message-notice, .ant-alert').first()
  104 |       .isVisible({ timeout: 3000 }).catch(() => false);
  105 |     console.log('[E2E-UI] Schema save feedback visible:', hasFeedback);
  106 |   });
  107 | 
  108 |   test('前端渠道脚本工作台 → 在线测试 → 后端沙箱', async ({ page }) => {
  109 |     await page.goto('http://localhost:6173');
  110 |     await page.getByText('渠道脚本工作台').first().click();
  111 |     await page.waitForSelector('text=原始第三方 JSON', { timeout: 5000 });
  112 | 
  113 |     // 点击「在线测试」按钮
  114 |     const testBtn = page.getByRole('button', { name: /在线测试/ }).first();
  115 |     await expect(testBtn).toBeVisible();
  116 |     await testBtn.click();
  117 | 
  118 |     // 等待结果（成功或失败都有反馈）
  119 |     await page.waitForTimeout(3000);
  120 |     const resultPanel = page.getByText('转换结果').first();
  121 |     await expect(resultPanel).toBeVisible();
  122 |   });
  123 | 
  124 |   test('前端动态渲染器 → 调用后端 /api/schemas + /api/members', async ({ page }) => {
  125 |     // 直接调用后端 API 验证会员数据可查询
  126 |     const apiResp = await page.request.get(`${BACKEND}/api/members/8821`, {
  127 |       headers: { 'X-Program-Code': 'PROG001' },
  128 |     });
  129 |     expect(apiResp.status()).toBe(200);
  130 |     const apiBody = await apiResp.json();
  131 |     console.log('[E2E-API] Member 8821 via backend:', apiBody.code);
  132 | 
  133 |     // 也验证 Schema API
  134 |     const schemaResp = await page.request.get(`${BACKEND}/api/schemas/MEMBER`, {
  135 |       headers: { 'X-Program-Code': 'PROG001' },
  136 |     });
  137 |     expect(schemaResp.status()).toBe(200);
  138 |     expect((await schemaResp.json()).code).toBe('SUCCESS');
  139 |   });
  140 | });
```