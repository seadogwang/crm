# API 实体配置管理工具

克隆 Apifox 项目 (https://app.apifox.com/project/8076196) 的功能，为 Loyalty 系统提供独立的 API 实体配置界面。

## 功能

- 📁 **模块管理** — 支持多模块组织 API
- 🔌 **接口管理** — 创建/编辑/删除 API（GET/POST/PUT/DELETE/PATCH）
- 📦 **数据模型** — JSON Schema 定义数据结构
- 🌍 **多环境** — 开发/测试/生产环境切换
- 🔍 **搜索过滤** — 快速查找接口和数据模型
- 📋 **文档生成** — 自动生成 API 文档
- 🎭 **Mock 服务** — 根据 Schema 生成模拟响应
- 🖱️ **右键菜单** — 编辑/复制/删除操作

## 启动

```bash
cd apifox-clone
npm install
npm start
```

访问 http://localhost:3088/index.html

## 项目结构

```
apifox-clone/
├── index.html      # 前端单页应用（API驱动）
├── server.js       # Express 后端 + REST API
├── data.json       # 数据持久化存储
├── package.json
├── output/         # Apifox 爬取数据（仅用于参考）
│   ├── screenshot.png
│   ├── page-structure.json
│   ├── api-responses.json
│   └── page.html
└── fetch-apifox.js # Apifox 页面爬取脚本
```

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/projects/:id | 项目信息 |
| GET | /api/v1/projects/:id/modules | 模块列表 |
| GET | /api/v1/projects/:id/api-detail-folders | 目录列表 |
| GET | /api/v1/projects/:id/api-tree-list | API 树形结构 |
| GET | /api/v1/api-details | 所有接口 |
| POST | /api/v1/api-details | 创建接口 |
| PUT | /api/v1/api-details/:id | 更新接口 |
| DELETE | /api/v1/api-details/:id | 删除接口 |
| GET | /api/v1/projects/:id/data-schemas | 数据模型列表 |
| POST | /api/v1/projects/:id/data-schemas | 创建数据模型 |
| PUT | /api/v1/projects/:id/data-schemas/:id | 更新数据模型 |
| DELETE | /api/v1/projects/:id/data-schemas/:id | 删除数据模型 |
| GET | /api/v1/projects/:id/environments | 环境列表 |
| ALL | /mock/* | Mock 服务 |

## 来源

本项目通过 Playwright 爬取了 Apifox 项目 #8076196 的页面结构和 API 响应数据，分析其功能后从零实现。
