const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'output3');
if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function capturePage(page, name) {
  console.log(`\n ${name}`);

  // Wait for content to stabilize
  await sleep(2000);

  // Screenshot
  await page.screenshot({ path: path.join(OUTPUT, `${name}.png`), fullPage: false });

  // Extract ALL text from the page in a structured way
  const data = await page.evaluate(() => {
    const d = {};

    // Left nav - find by SVG icon parent links
    const leftNavItems = [];
    const navLinks = document.querySelectorAll('a[class*="nav-item"]');
    navLinks.forEach(a => {
      const span = a.querySelector('span.text-center');
      if (span) {
        leftNavItems.push({
          text: span.textContent.trim(),
          active: a.className.includes('active'),
          class: a.className
        });
      }
    });
    d.leftNav = leftNavItems;

    // Sidebar title
    const sidebarTitle = document.querySelector('[class*="projectName"]');
    d.sidebarTitle = sidebarTitle ? sidebarTitle.textContent.trim() : '';

    // Sidebar tree items - find all tree node titles
    const treeItems = [];
    document.querySelectorAll('[class*="ui-tree-treenode"]').forEach(node => {
      const titleEl = node.querySelector('[class*="truncate"], [class*="tree-title"], [title]');
      if (titleEl) {
        const text = titleEl.textContent.trim() || titleEl.getAttribute('title');
        if (text && text.length > 1) treeItems.push(text);
      }
    });
    d.sidebarTree = [...new Set(treeItems)];

    // Sidebar tree - also get all text from tree container
    const treeContainer = document.querySelector('[class*="treeList"], [class*="tree-list"], [class*="sidebar-tree"]');
    if (treeContainer) {
      d.sidebarFullText = treeContainer.textContent.trim().substring(0, 2000);
    }

    // Breadcrumb
    const breadcrumb = document.querySelector('[class*="breadcrumb"], [class*="BreadCrumb"]');
    d.breadcrumb = breadcrumb ? breadcrumb.textContent.trim() : '';

    // Top bar / header area
    const topBar = document.querySelector('header, [class*="header"], [class*="top-bar"]');
    if (topBar) d.topBar = topBar.textContent.trim().substring(0, 500);

    // Content tabs
    const tabs = [];
    document.querySelectorAll('[class*="content-tab"], [class*="ContentTab"], [class*="tab"] [class*="tab"]').forEach(tab => {
      tabs.push({ text: tab.textContent.trim(), active: tab.className.includes('active') });
    });
    d.tabs = tabs;

    // Main content area - everything in main content
    const mainContent = document.querySelector('main, [role="main"], .main, .content, [class*="main-content"], [class*="page-content"], [class*="ApiContent"], [class*="TestContent"]');
    if (mainContent) {
      d.mainContent = mainContent.textContent.trim().substring(0, 5000);
    }

    // Right panel
    const rightPanel = document.querySelector('[class*="right"], [class*="Right"], [class*="detail"], [class*="Detail"], [class*="side-panel"]');
    if (rightPanel) {
      d.rightPanel = rightPanel.textContent.trim().substring(0, 3000);
    }

    // Bottom bar
    const bottomBar = document.querySelector('footer, [class*="bottom"], [class*="Bottom"], [class*="status-bar"], [class*="StatusBar"]');
    if (bottomBar) {
      d.bottomBar = bottomBar.textContent.trim();
    }

    // All buttons
    const buttons = [];
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const t = btn.textContent.trim();
      if (t && t.length < 50 && !t.includes('{')) buttons.push(t);
    });
    d.buttons = [...new Set(buttons)];

    // Table data
    d.tables = [];
    document.querySelectorAll('table').forEach(table => {
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length) rows.push(cells);
      });
      if (rows.length) d.tables.push(rows);
    });

    // Active view indicator - what's currently selected
    d.activeNav = leftNavItems.find(i => i.active)?.text || '';

    return d;
  });

  // Save
  fs.writeFileSync(path.join(OUTPUT, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');

  // Print summary
  console.log('   Active nav:', data.activeNav);
  console.log('   Sidebar:', data.sidebarTree.join(', '));
  console.log('   Main preview:', (data.mainContent || '').substring(0, 150));
  console.log('   Buttons:', data.buttons.slice(0, 10).join(', '));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('apifox') && url.includes('/api/')) {
      try {
        const body = await response.json();
        apiResponses.push({ url: url.replace('https://api.apifox.com', ''), status: response.status(), size: JSON.stringify(body).length });
      } catch(e) {}
    }
  });

  console.log('导航到项目...');
  await page.goto('https://app.apifox.com/project/8076196', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for login
  console.log('等待登录...');
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const url = page.url();
    const title = await page.title();
    if (!url.includes('login') && !title.includes('欢迎使用')) {
      console.log(' 已登录');
      break;
    }
  }
  await sleep(2000);

  // Helper: click nav item by finding the exact <a> with text
  async function clickNavItem(text) {
    return page.evaluate((t) => {
      const links = document.querySelectorAll('a[class*="nav-item"]');
      for (const a of links) {
        const span = a.querySelector('span.text-center');
        if (span && span.textContent.trim() === t) {
          a.click();
          return true;
        }
      }
      return false;
    }, text);
  }

  // Helper: click sidebar tree item by text
  async function clickTreeItem(text) {
    return page.evaluate((t) => {
      // Find tree node by title attribute or text content
      const nodes = document.querySelectorAll('[class*="ui-tree-treenode"], [class*="tree-item"]');
      for (const node of nodes) {
        const titleEl = node.querySelector('[class*="truncate"], [title]');
        const nodeText = (titleEl ? titleEl.textContent.trim() || titleEl.getAttribute('title') : node.textContent.trim());
        if (nodeText && (nodeText === t || nodeText.includes(t))) {
          node.click();
          return true;
        }
      }
      // Fallback: find by text in any div/span
      const allEls = document.querySelectorAll('div, span');
      for (const el of allEls) {
        if (el.textContent.trim() === t && el.className && !el.className.includes('nav-item')) {
          el.click();
          return true;
        }
      }
      return false;
    }, text);
  }

  // ============================================================
  // 1. 接口管理 (default)
  // ============================================================
  console.log('\n=== 1. 接口管理 ===');
  await capturePage(page, '01-api-management');

  // ============================================================
  // 2. 自动化测试
  // ============================================================
  console.log('\n=== 2. 自动化测试 ===');
  const r2 = await clickNavItem('自动化测试');
  console.log('  点击结果:', r2);
  await capturePage(page, '02-auto-test');

  // ============================================================
  // 3. 场景用例
  // ============================================================
  console.log('\n=== 3. 场景用例 ===');
  const r3 = await clickTreeItem('场景用例');
  console.log('  点击结果:', r3);
  await capturePage(page, '03-scenario-list');

  // ============================================================
  // 4. 点击 tesst
  // ============================================================
  console.log('\n=== 4. tesst 详情 ===');
  const r4 = await clickTreeItem('tesst');
  console.log('  点击结果:', r4);
  await capturePage(page, '04-testcase-detail');

  // ============================================================
  // 5. 单接口用例
  // ============================================================
  console.log('\n=== 5. 单接口用例 ===');
  const r5 = await clickTreeItem('单接口用例');
  console.log('  点击结果:', r5);
  await capturePage(page, '05-single-api');

  // ============================================================
  // 6. 测试套件
  // ============================================================
  console.log('\n=== 6. 测试套件 ===');
  const r6 = await clickTreeItem('测试套件');
  console.log('  点击结果:', r6);
  await capturePage(page, '06-test-suite');

  // ============================================================
  // 7. 测试数据
  // ============================================================
  console.log('\n=== 7. 测试数据 ===');
  const r7 = await clickTreeItem('测试数据');
  console.log('  点击结果:', r7);
  await capturePage(page, '07-test-data');

  // ============================================================
  // 8. 回到接口管理
  // ============================================================
  console.log('\n=== 8. 回到接口管理 ===');
  const r8 = await clickNavItem('接口管理');
  console.log('  点击结果:', r8);
  await capturePage(page, '08-api-management');

  // Save API responses summary
  fs.writeFileSync(path.join(OUTPUT, 'api-summary.json'), JSON.stringify(apiResponses, null, 2), 'utf-8');
  console.log(`\n API响应: ${apiResponses.length} 条`);

  console.log('\n 浏览器保持打开供检查...');
  await sleep(60000);
  await browser.close();
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
