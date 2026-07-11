const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://app.apifox.com/project/8076196';
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Intercept API responses
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('apifox') && (url.includes('/api/') || url.includes('interface') || url.includes('project'))) {
      try {
        const body = await response.json();
        apiResponses.push({ url, status: response.status(), data: body });
        console.log(`  [API] ${response.status()} ${url.substring(0, 120)}`);
      } catch (e) {
        // not JSON
      }
    }
  });

  console.log(`Navigating to ${TARGET_URL}...`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('\n========================================');
  console.log('请扫码登录 Apifox！');
  console.log('登录成功后，页面会自动跳转到项目页。');
  console.log('脚本会每 3 秒检测一次登录状态...');
  console.log('========================================\n');

  // Wait for login - check every 3 seconds, max 5 minutes
  let loggedIn = false;
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    const title = await page.title();

    // Check if we're no longer on the login page
    if (!currentUrl.includes('login') && !title.includes('欢迎使用')) {
      loggedIn = true;
      console.log(`\n✅ 登录成功！当前页面: ${currentUrl}`);
      console.log(`   页面标题: ${title}`);
      break;
    }

    if (i % 10 === 0 && i > 0) {
      console.log(`  等待登录中... (${i * 3}s)`);
    }
  }

  if (!loggedIn) {
    console.log('\n❌ 超时，5 分钟内未完成登录');
    await browser.close();
    return;
  }

  // Wait for page to fully load
  console.log('\n等待页面数据加载...');
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot.png'), fullPage: false });
  console.log('📸 截图已保存: output/screenshot.png');

  // Capture page structure
  const pageStructure = await page.evaluate(() => {
    // Get sidebar navigation
    const sidebarNav = Array.from(document.querySelectorAll('aside nav a, .side-nav a, [class*="nav"] a, [class*="menu"] a'))
      .map(el => ({ text: el.textContent?.trim(), href: el.getAttribute('href') }))
      .filter(Boolean);

    // Get all headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map(el => ({ level: el.tagName, text: el.textContent?.trim() }));

    // Get main content text
    const mainContent = document.querySelector('main, [role="main"], .main-content, .content, #app')
      ?.textContent?.substring(0, 5000);

    // Get API/interface list items
    const apiItems = Array.from(document.querySelectorAll('[class*="api"], [class*="interface"], [class*="request"]'))
      .filter(el => {
        const text = el.textContent?.trim();
        return text && text.length > 3 && text.length < 300;
      })
      .map(el => ({ text: el.textContent?.trim(), class: el.className }))
      .slice(0, 100);

    // Get tree/list data structures
    const treeItems = Array.from(document.querySelectorAll('[class*="tree"], [class*="list"], [class*="folder"]'))
      .filter(el => el.textContent?.trim() && el.textContent.trim().length < 500)
      .map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.trim()?.substring(0, 200) }))
      .slice(0, 50);

    // Try to get Vuex/Pinia/React state
    let appState = null;
    try {
      const el = document.querySelector('#__APP_DATA__, #__NUXT_DATA__, [data-state]');
      if (el) {
        appState = el.textContent?.substring(0, 5000);
      }
    } catch(e) {}

    return {
      url: window.location.href,
      title: document.title,
      sidebarNav,
      headings,
      mainContentPreview: mainContent?.substring(0, 2000),
      apiItems,
      treeItems,
      appStatePreview: appState?.substring(0, 2000),
    };
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'page-structure.json'),
    JSON.stringify(pageStructure, null, 2),
    'utf-8'
  );
  console.log('📋 页面结构已保存: output/page-structure.json');

  // Save captured API responses
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'api-responses.json'),
    JSON.stringify(apiResponses, null, 2),
    'utf-8'
  );
  console.log(`🔌 API 响应已保存: ${apiResponses.length} 条`);

  // Save full HTML
  const html = await page.content();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'page.html'), html, 'utf-8');
  console.log('📄 完整 HTML 已保存: output/page.html');

  // Print summary
  console.log('\n========== 页面结构摘要 ==========');
  console.log(`标题: ${pageStructure.title}`);
  console.log(`URL: ${pageStructure.url}`);
  console.log(`侧边栏导航: ${pageStructure.sidebarNav.length} 项`);
  pageStructure.sidebarNav.forEach(item => {
    console.log(`  → ${item.text} (${item.href})`);
  });
  console.log(`\n标题: ${pageStructure.headings.map(h => `[${h.level}] ${h.text}`).join(' | ')}`);
  console.log(`\nAPI/接口项: ${pageStructure.apiItems.length} 项`);
  if (pageStructure.apiItems.length > 0) {
    pageStructure.apiItems.slice(0, 20).forEach(item => {
      console.log(`  • ${item.text.substring(0, 100)}`);
    });
  }

  // Try to fetch project data via internal APIs
  console.log('\n========== 尝试获取项目 API 数据 ==========');
  const apiEndpoints = [
    'https://api.apifox.cn/api/v1/projects/8076196',
    'https://api.apifox.cn/api/v1/projects/8076196/interfaces?limit=100&page=1',
    'https://api.apifox.cn/api/v1/projects/8076196/tags',
    'https://api.apifox.cn/api/v1/projects/8076196/modules',
    'https://api.apifox.cn/api/v1/projects/8076196/members',
    'https://api.apifox.cn/api/v1/projects/8076196/settings',
  ];

  const apiData = {};
  for (const endpoint of apiEndpoints) {
    try {
      const resp = await page.evaluate(async (url) => {
        try {
          const r = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
          const text = await r.text();
          try {
            return { status: r.status, data: JSON.parse(text) };
          } catch(e) {
            return { status: r.status, data: text.substring(0, 500) };
          }
        } catch(e) {
          return { error: e.message };
        }
      }, endpoint);

      if (resp.data && !resp.error) {
        const summary = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data).substring(0, 200);
        console.log(`✅ ${endpoint}`);
        console.log(`   → ${summary}`);
        apiData[endpoint] = resp.data;
      } else {
        console.log(`❌ ${endpoint} → ${resp.error || resp.status}`);
      }
    } catch(e) {
      console.log(`❌ ${endpoint} → ERROR: ${e.message}`);
    }
  }

  if (Object.keys(apiData).length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'project-api-data.json'),
      JSON.stringify(apiData, null, 2),
      'utf-8'
    );
    console.log(`\n📦 项目 API 数据已保存: ${Object.keys(apiData).length} 个端点`);
  }

  console.log('\n========== 全部完成！==========');
  console.log('检查 output/ 目录查看所有捕获的数据。\n');

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
