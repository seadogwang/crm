const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output2');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clickByText(page, text, timeout = 3000) {
  try {
    await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('div, span, a, button, li'));
      for (const el of els) {
        if (el.textContent.trim() === t || el.textContent.trim().includes(t)) {
          el.click();
          return true;
        }
      }
      // Try partial match
      for (const el of els) {
        if (el.textContent.trim().includes(t) && el.textContent.trim().length < 50) {
          el.click();
          return true;
        }
      }
      return false;
    }, text);
    await sleep(timeout);
    return true;
  } catch(e) { return false; }
}

async function capturePage(page, name) {
  console.log(`\n ${name}`);
  console.log(`   URL: ${page.url()}`);
  console.log(`   Title: ${await page.title()}`);

  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: false });

  // Extract structured data
  const data = await page.evaluate(() => {
    const result = {};

    // Left nav items
    const leftNavTexts = [];
    document.querySelectorAll('div, span').forEach(el => {
      const t = el.textContent.trim();
      if (['接口管理', '自动化测试', '分享文档', '请求历史', '项目设置', '邀请成员'].includes(t)) {
        leftNavTexts.push({ text: t, classes: el.className });
      }
    });
    result.leftNav = leftNavTexts;

    // Sidebar tree
    const treeTexts = [];
    document.querySelectorAll('.ui-tree-title, [class*="tree-title"]').forEach(el => {
      treeTexts.push(el.textContent.trim());
    });
    result.sidebarTree = treeTexts;

    // Sidebar tree items (all text)
    const allTreeItems = [];
    document.querySelectorAll('[class*="ui-tree"]').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length > 1 && t.length < 100) allTreeItems.push(t);
    });
    result.allTreeItems = [...new Set(allTreeItems)];

    // Main content - all visible text blocks
    const mainTexts = [];
    const mainEl = document.querySelector('main, [role="main"], .main, .content, [class*="main-content"]') || document.body;
    mainEl.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length > 1 && t.length < 200 && !t.includes('{') && !t.includes('function')) {
        mainTexts.push(t);
      }
    });
    result.mainTexts = [...new Set(mainTexts)].slice(0, 100);

    // Buttons
    const btns = [];
    document.querySelectorAll('button, [role="button"], [class*="btn"]').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length < 50) btns.push(t);
    });
    result.buttons = [...new Set(btns)];

    // Table headers and rows
    const tables = [];
    document.querySelectorAll('table').forEach(table => {
      const rows = [];
      table.querySelectorAll('tr').forEach(row => {
        const cells = [];
        row.querySelectorAll('th, td').forEach(cell => cells.push(cell.textContent.trim()));
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) tables.push(rows);
    });
    result.tables = tables;

    // Tabs
    const tabs = [];
    document.querySelectorAll('.tab, [class*="content-tab"], [class*="tab-bar"] .tab, [class*="tabs"] > div').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length < 30) tabs.push({ text: t, active: el.classList.contains('active') || el.style.borderBottomColor !== '' });
    });
    result.tabs = tabs;

    // Right panel
    const rightPanel = [];
    const rightEl = document.querySelector('[class*="right"], [class*="side-panel"], [class*="detail-panel"]');
    if (rightEl) {
      rightEl.querySelectorAll('div, span, label').forEach(el => {
        const t = el.textContent.trim();
        if (t && t.length > 1 && t.length < 100) rightPanel.push(t);
      });
    }
    result.rightPanel = [...new Set(rightPanel)].slice(0, 50);

    return result;
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
  console.log('   结构已保存');
}

async function main() {
  console.log(' 启动浏览器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  // Collect API responses
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('apifox') && url.includes('/api/')) {
      try {
        const body = await response.json();
        apiResponses.push({ url: url.replace('https://api.apifox.com', ''), status: response.status(), data: body });
      } catch(e) {}
    }
  });

  console.log(`\n导航到项目...`);
  await page.goto('https://app.apifox.com/project/8076196', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for login
  console.log('等待登录...');
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const url = page.url();
    if (!url.includes('login') && !(await page.title()).includes('欢迎使用')) {
      console.log('✅ 已登录');
      break;
    }
  }
  await sleep(3000);

  // ============================================================
  // View 1: 接口管理 (default)
  // ============================================================
  console.log('\n========== 1. 接口管理 ==========');
  await capturePage(page, '01-api-management');
  await sleep(1000);

  // ============================================================
  // View 2: 自动化测试
  // ============================================================
  console.log('\n========== 2. 自动化测试 ==========');
  const clicked2 = await clickByText(page, '自动化测试');
  console.log('  点击自动化测试:', clicked2 ? '成功' : '失败');
  await capturePage(page, '02-auto-test');
  await sleep(1000);

  // ============================================================
  // View 3: 场景用例 (click in sidebar)
  // ============================================================
  console.log('\n========== 3. 场景用例 ==========');
  const clicked3 = await clickByText(page, '场景用例');
  console.log('  点击场景用例:', clicked3 ? '成功' : '失败');
  await capturePage(page, '03-scenario-list');
  await sleep(1000);

  // ============================================================
  // View 4: 点击 tesst 用例
  // ============================================================
  console.log('\n========== 4. tesst 用例详情 ==========');
  const clicked4 = await clickByText(page, 'tesst');
  console.log('  点击tesst:', clicked4 ? '成功' : '失败');
  await capturePage(page, '04-testcase-detail');
  await sleep(1000);

  // ============================================================
  // View 5: 单接口用例
  // ============================================================
  console.log('\n========== 5. 单接口用例 ==========');
  const clicked5 = await clickByText(page, '单接口用例');
  console.log('  点击单接口用例:', clicked5 ? '成功' : '失败');
  await capturePage(page, '05-single-api');
  await sleep(1000);

  // ============================================================
  // View 6: 测试套件
  // ============================================================
  console.log('\n========== 6. 测试套件 ==========');
  const clicked6 = await clickByText(page, '测试套件');
  console.log('  点击测试套件:', clicked6 ? '成功' : '失败');
  await capturePage(page, '06-test-suite');
  await sleep(1000);

  // ============================================================
  // View 7: 测试数据
  // ============================================================
  console.log('\n========== 7. 测试数据 ==========');
  const clicked7 = await clickByText(page, '测试数据');
  console.log('  点击测试数据:', clicked7 ? '成功' : '失败');
  await capturePage(page, '07-test-data');
  await sleep(1000);

  // Save API responses
  fs.writeFileSync(path.join(OUTPUT_DIR, 'api-responses.json'), JSON.stringify(apiResponses, null, 2), 'utf-8');
  console.log(`\n📦 ${apiResponses.length} API responses saved`);

  // Summary
  console.log('\n========== 完成 ==========');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('0'));
  for (const f of files) {
    console.log(`  ${f}`);
  }

  console.log('\n保持浏览器打开 30 秒供检查...');
  await sleep(30000);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
