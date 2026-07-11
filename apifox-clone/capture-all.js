const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const TARGET_URL = 'https://app.apifox.com/project/8076196';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function capturePage(page, name) {
  console.log(`\n📸 捕获: ${name}`);
  console.log(`   URL: ${page.url()}`);

  // Screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: false });

  // HTML
  const html = await page.content();
  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.html`), html, 'utf-8');

  // Structure
  const structure = await page.evaluate(() => {
    // Get all visible text content by sections
    const sections = {};

    // Sidebar nav items
    const leftNav = document.querySelector('.left-nav, .side-nav, [class*="left-nav"], [class*="side-nav"]');
    if (leftNav) {
      sections.leftNav = Array.from(leftNav.querySelectorAll('[class*="nav-item"], [class*="menu-item"], a'))
        .map(el => ({ text: el.textContent?.trim(), class: el.className }))
        .filter(el => el.text && el.text.length < 100);
    }

    // Sidebar tree
    const sidebar = document.querySelector('.sidebar, .side-bar, [class*="sidebar"], [class*="side-bar"]');
    if (sidebar) {
      sections.sidebarTree = Array.from(sidebar.querySelectorAll('.tree-item, [class*="tree-item"], [class*="menu"]'))
        .map(el => ({ text: el.textContent?.trim(), class: el.className }))
        .filter(el => el.text && el.text.length < 200);
    }

    // Main content tabs
    const tabs = document.querySelector('.tabs, [class*="content-tab"], [class*="tab-bar"]');
    if (tabs) {
      sections.tabs = Array.from(tabs.querySelectorAll('.tab, [class*="tab"]'))
        .map(el => ({ text: el.textContent?.trim(), active: el.classList.contains('active') }))
        .filter(el => el.text);
    }

    // Main content area
    const main = document.querySelector('main, [role="main"], .main, .content, [class*="main-content"], [class*="page-content"]');
    if (main) {
      sections.mainContent = main.textContent?.substring(0, 3000);
    }

    // Right panel
    const right = document.querySelector('.right-panel, .side-panel, [class*="right-panel"], [class*="side-panel"]');
    if (right) {
      sections.rightPanel = right.textContent?.substring(0, 2000);
    }

    // Bottom bar
    const bottom = document.querySelector('.bottom-bar, .footer, [class*="bottom-bar"], [class*="status-bar"]');
    if (bottom) {
      sections.bottomBar = bottom.textContent?.trim();
    }

    // Table data
    const tables = document.querySelectorAll('table');
    sections.tables = Array.from(tables).map(table => {
      const rows = Array.from(table.querySelectorAll('tr')).map(row =>
        Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent?.trim())
      );
      return rows;
    });

    // All buttons
    sections.buttons = Array.from(document.querySelectorAll('button, [role="button"], [class*="btn"]'))
      .map(el => ({ text: el.textContent?.trim(), class: el.className }))
      .filter(el => el.text && el.text.length < 50);

    return sections;
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}-structure.json`), JSON.stringify(structure, null, 2), 'utf-8');

  // API responses captured during this page
  const apiData = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('apifox') && url.includes('/api/')) {
      try {
        const body = await response.json();
        apiData.push({ url: url.substring(url.indexOf('/api/')), status: response.status(), data: body });
      } catch(e) {}
    }
  });

  console.log(`   结构已保存`);
}

async function main() {
  console.log(' 启动浏览器，访问 Apifox 项目...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Collect all API responses
  const allApiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('apifox') && url.includes('/api/')) {
      try {
        const body = await response.json();
        allApiResponses.push({ url, status: response.status(), data: body });
      } catch(e) {}
    }
  });

  // Navigate to project
  console.log(`\n导航到 ${TARGET_URL}...`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for login if needed
  console.log('\n检查登录状态...');
  let loggedIn = false;
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const url = page.url();
    const title = await page.title();
    if (!url.includes('login') && !title.includes('欢迎使用')) {
      loggedIn = true;
      console.log(`✅ 已登录: ${url}`);
      break;
    }
    if (i % 10 === 0 && i > 0) console.log(`  等待登录中... (${i*3}s)`);
  }

  if (!loggedIn) {
    console.log('❌ 需要登录，请扫码后继续...');
    // Wait more for user to login
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      const url = page.url();
      const title = await page.title();
      if (!url.includes('login') && !title.includes('欢迎使用')) {
        loggedIn = true;
        console.log(`✅ 登录成功: ${url}`);
        break;
      }
    }
    if (!loggedIn) {
      console.log('❌ 超时');
      await browser.close();
      return;
    }
  }

  await sleep(3000);

  // ============================================================
  // Capture each view
  // ============================================================

  // 1. Default view (接口管理)
  console.log('\n========== 1. 接口管理 ==========');
  await capturePage(page, '01-api-management');
  await sleep(1000);

  // 2. Click 自动化测试 in left nav
  console.log('\n========== 2. 自动化测试 ==========');
  try {
    const autoTestBtn = await page.$('[class*="nav-item"]:has-text("自动化"), [class*="nav-item"]:has-text("auto"), text="自动化测试"');
    if (autoTestBtn) {
      await autoTestBtn.click();
      await sleep(2000);
    } else {
      // Try to find by text
      const navItems = await page.$$('div');
      for (const item of navItems) {
        const text = await item.textContent();
        if (text && text.includes('自动化')) {
          await item.click();
          await sleep(2000);
          break;
        }
      }
    }
  } catch(e) { console.log('  点击自动化测试失败:', e.message); }
  await capturePage(page, '02-auto-test');
  await sleep(1000);

  // 3. Click 场景用例 in sidebar
  console.log('\n========== 3. 场景用例列表 ==========');
  try {
    const scenarioBtn = await page.$('text="场景用例"');
    if (scenarioBtn) {
      await scenarioBtn.click();
      await sleep(2000);
    }
  } catch(e) { console.log('  点击场景用例失败:', e.message); }
  await capturePage(page, '03-scenario-list');
  await sleep(1000);

  // 4. Click the test case "tesst" to open detail
  console.log('\n========== 4. 场景用例详情 (tesst) ==========');
  try {
    const testCase = await page.$('text="tesst"');
    if (testCase) {
      await testCase.click();
      await sleep(3000);
    }
  } catch(e) { console.log('  点击tesst失败:', e.message); }
  await capturePage(page, '04-testcase-detail');
  await sleep(1000);

  // 5. Go back and click single API case
  console.log('\n========== 5. 单接口用例 ==========');
  try {
    const singleBtn = await page.$('text="单接口用例"');
    if (singleBtn) {
      await singleBtn.click();
      await sleep(2000);
    }
  } catch(e) { console.log('  点击单接口用例失败:', e.message); }
  await capturePage(page, '05-single-api');
  await sleep(1000);

  // 6. Click 测试套件
  console.log('\n========== 6. 测试套件 ==========');
  try {
    const suiteBtn = await page.$('text="测试套件"');
    if (suiteBtn) {
      await suiteBtn.click();
      await sleep(2000);
    }
  } catch(e) { console.log('  点击测试套件失败:', e.message); }
  await capturePage(page, '06-test-suite');
  await sleep(1000);

  // 7. Click 测试数据
  console.log('\n========== 7. 测试数据 ==========');
  try {
    const dataBtn = await page.$('text="测试数据"');
    if (dataBtn) {
      await dataBtn.click();
      await sleep(2000);
    }
  } catch(e) { console.log('  点击测试数据失败:', e.message); }
  await capturePage(page, '07-test-data');
  await sleep(1000);

  // 8. Go back to 接口管理
  console.log('\n========== 8. 回到接口管理 ==========');
  try {
    const apiBtn = await page.$('[class*="nav-item"]:has-text("接口")');
    if (apiBtn) {
      await apiBtn.click();
      await sleep(2000);
    }
  } catch(e) { console.log('  点击接口管理失败:', e.message); }
  await capturePage(page, '08-api-management-back');

  // ============================================================
  // Save all API responses
  // ============================================================
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'all-api-responses.json'),
    JSON.stringify(allApiResponses, null, 2),
    'utf-8'
  );
  console.log(`\n📦 已保存 ${allApiResponses.length} 条 API 响应`);

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n========== 捕获完成 ==========');
  console.log('文件列表:');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('0') || f.endsWith('-structure.json'));
  for (const f of files) {
    const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
    console.log(`  ${f} (${(size/1024).toFixed(1)}KB)`);
  }

  console.log('\n浏览器将保持打开，你可以手动检查。');
  console.log('按 Ctrl+C 关闭浏览器。');

  // Keep browser open
  await sleep(60000);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
