const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

app.use(express.static(__dirname));
app.use(express.json());

function loadStore() {
  const file = path.join(__dirname, 'data.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return getDefaultData();
}

function saveStore(data) {
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2));
}

function getDefaultData() {
  return {
    project: { id: 8076196, name: '测试' },
    // 单接口用例 (API列表)
    singleApiCases: [
      { id: 1, name: '创建新用户', method: 'POST', path: '/api/v1/users', status: 'todo' },
      { id: 2, name: '创建积分活动', method: 'POST', path: '/api/v1/campaigns', status: 'todo' },
      { id: 3, name: '查询用户列表', method: 'GET', path: '/api/v1/users', status: 'todo' },
      { id: 4, name: '查询积分活动列表', method: 'GET', path: '/api/v1/campaigns', status: 'todo' },
      { id: 5, name: '积分兑换', method: 'POST', path: '/api/v1/exchange', status: 'todo' },
      { id: 6, name: '查看用户详情', method: 'GET', path: '/api/v1/users/:id', status: 'todo' },
      { id: 7, name: '查询用户积分余额', method: 'GET', path: '/api/v1/users/:id/points', status: 'todo' }
    ],
    // 场景用例
    scenarioCases: [
      {
        id: 1,
        name: 'tesst',
        priority: 'P2',
        description: '',
        author: '狐友9VJQ',
        steps: [
          { id: 1, type: 'http', name: '未命名', method: 'GET', enabled: true, config: { url: '', headers: {}, body: {} } },
          { id: 2, type: 'if', name: 'If a 等于 b', enabled: true, condition: 'a == b', children: [
            { id: 3, type: 'foreach', name: 'ForEach 循环中的元素', enabled: true, variable: 'item', collection: '', children: [
              { id: 4, type: 'database', name: '未命名', enabled: true, config: { query: '', connection: '' } }
            ], warning: true },
          ]},
          { id: 5, type: 'else', name: 'Else', enabled: true, children: [
            { id: 6, type: 'group', name: 'Group 分组', enabled: true, children: [] }
          ]},
          { id: 7, type: 'delay', name: 'Delay 等待 1000 毫秒', enabled: true, config: { duration: 1000 } }
        ],
        settings: {
          environment: '测试环境',
          testData: '不使用测试数据',
          loopCount: 1,
          threadCount: 1,
          runOn: '本机',
          notify: false,
          shared: false
        },
        createdAt: new Date(Date.now() - 5*3600000).toISOString(),
        updatedAt: new Date(Date.now() - 5*3600000).toISOString()
      }
    ],
    // 测试套件
    testSuites: [
      { id: 1, name: "y'y", cases: [] }
    ],
    // 测试数据
    testData: [],
    // 环境
    environments: [
      { id: 1, name: '开发环境', url: 'http://localhost:8080' },
      { id: 2, name: '测试环境', url: 'http://test.example.com' },
      { id: 3, name: '生产环境', url: 'https://api.example.com' }
    ],
    nextId: 100
  };
}

let store = loadStore();

// Project
app.get('/api/v1/projects/:id', (req, res) => {
  res.json({ success: true, data: { id: store.project.id, name: store.project.name } });
});

// Single API cases
app.get('/api/v1/auto-test/single-cases', (req, res) => {
  res.json({ success: true, data: store.singleApiCases });
});

// Scenario cases
app.get('/api/v1/auto-test/scenario-cases', (req, res) => {
  res.json({ success: true, data: store.scenarioCases });
});

app.get('/api/v1/auto-test/scenario-cases/:id', (req, res) => {
  const tc = store.scenarioCases.find(c => c.id === parseInt(req.params.id));
  res.json({ success: true, data: tc || null });
});

app.post('/api/v1/auto-test/scenario-cases', (req, res) => {
  const tc = { id: store.nextId++, name: req.body.name || '新用例', priority: 'P2', description: '', author: '当前用户', steps: [], settings: { environment: '测试环境', testData: '不使用测试数据', loopCount: 1, threadCount: 1, runOn: '本机', notify: false, shared: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.scenarioCases.push(tc);
  saveStore(store);
  res.json({ success: true, data: tc });
});

app.put('/api/v1/auto-test/scenario-cases/:id', (req, res) => {
  const idx = store.scenarioCases.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.json({ success: false });
  store.scenarioCases[idx] = { ...store.scenarioCases[idx], ...req.body, updatedAt: new Date().toISOString() };
  saveStore(store);
  res.json({ success: true, data: store.scenarioCases[idx] });
});

app.delete('/api/v1/auto-test/scenario-cases/:id', (req, res) => {
  store.scenarioCases = store.scenarioCases.filter(c => c.id !== parseInt(req.params.id));
  saveStore(store);
  res.json({ success: true });
});

// Test suites
app.get('/api/v1/auto-test/test-suites', (req, res) => {
  res.json({ success: true, data: store.testSuites });
});

app.post('/api/v1/auto-test/test-suites', (req, res) => {
  const suite = { id: store.nextId++, name: req.body.name || '新套件', cases: [] };
  store.testSuites.push(suite);
  saveStore(store);
  res.json({ success: true, data: suite });
});

// Test data
app.get('/api/v1/auto-test/test-data', (req, res) => {
  res.json({ success: true, data: store.testData });
});

app.post('/api/v1/auto-test/test-data', (req, res) => {
  const td = { id: store.nextId++, ...req.body };
  store.testData.push(td);
  saveStore(store);
  res.json({ success: true, data: td });
});

// Environments
app.get('/api/v1/projects/:id/environments', (req, res) => {
  res.json({ success: true, data: store.environments });
});

// Run test (mock)
app.post('/api/v1/auto-test/run', (req, res) => {
  res.json({ success: true, data: { runId: Date.now(), status: 'running' } });
});

app.listen(PORT, () => {
  console.log(`\n Apifox 自动化测试克隆`);
  console.log(`   http://localhost:${PORT}/index.html`);
  console.log(`   Press Ctrl+C to stop\n`);
});
