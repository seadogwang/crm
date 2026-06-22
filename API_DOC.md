# Loyalty Platform API 接口文档

> 总计 **78 个 API 端点** | 更新日期：2026-06-22

## 目录

1. [Admin — 管理后台](#1-admin--管理后台)
2. [AI 规则助手](#2-ai-规则助手)
3. [LLM 大模型配置](#3-llm-大模型配置)
4. [会员服务](#4-会员服务)
5. [渠道映射](#5-渠道映射)
6. [事件数据](#6-事件数据)
7. [Schema 管理](#7-schema-管理)
8. [API 操作配置](#8-api-操作配置)
9. [事件处理](#9-事件处理)
10. [SPI 网关](#10-spi-网关)

---

## 1. Admin — 管理后台

**Base URL:** `/api/admin`

### 缓存管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/cache/enums` | 获取枚举缓存 |
| `GET` | `/cache/program-defs` | 获取 Program 定义缓存 |
| `POST` | `/cache/refresh` | 刷新缓存 |

### Program 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/programs` | 获取所有 Program |
| `POST` | `/programs` | 创建 Program |
| `GET` | `/programs/{code}` | 获取 Program 详情 |
| `PUT` | `/programs/{code}` | 更新 Program |
| `DELETE` | `/programs/{code}` | 删除 Program |
| `POST` | `/programs/{code}/copy` | 复制 Program |

### Tier 等级管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/tiers` | 获取等级列表 |
| `PUT` | `/tiers` | 更新等级配置 |

### Member 会员管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/members/{memberId}/credit-limit` | 设置会员授信额度 |

### Event 事件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/events/{id}/replay` | 重放事件 |

### Rule 规则管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/rules` | 规则列表 |
| `GET` | `/rules/{id}` | 规则详情 |
| `POST` | `/rules` | 创建规则（草稿） |
| `PUT` | `/rules/{id}` | 更新规则 |
| `DELETE` | `/rules/{id}` | 删除规则 |
| `POST` | `/rules/{id}/publish` | 发布规则（回归测试 + 热更新） |
| `POST` | `/rules/{id}/activate` | 激活规则 |
| `POST` | `/rules/{id}/deactivate` | 停用规则 |
| `POST` | `/rules/{id}/validate` | 验证规则 |
| `POST` | `/rules/validate-drl` | 验证 DRL 语法 |
| `POST` | `/rules/generate` | AI 辅助生成规则 |
| `POST` | `/rules/preview` | 预览规则效果 |
| `POST` | `/rules/{ruleId}/force-publish` | 强制发布规则 |

### Schema 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/schemas` | 创建 Schema |
| `POST` | `/schemas/publish` | 发布 Schema |

### Flow 流程管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/flows` | 流程列表 |
| `POST` | `/flows` | 创建流程 |
| `PUT` | `/flows/{id}` | 更新流程 |
| `POST` | `/flows/{id}/publish` | 发布流程（LiteFlow 热更新） |

### Audit 审计

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/audit/unauthorized-access` | 未授权访问记录 |

---

## 2. AI 规则助手

**Base URL:** `/api/rules/ai`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/start` | 启动 AI 会话，返回 sessionId |
| `POST` | `/chat` | 非流式对话 |
| `POST` | `/chat/stream` | 流式 SSE 对话 |
| `POST` | `/clarify` | **V4 流式 SSE 澄清** — `text` + `question` 事件 |
| `POST` | `/clarify/submit` | 提交澄清答案，返回 `formSchema` |
| `POST` | `/submit-form` | 提交表单，生成最终规则（`READY`） |
| `POST` | `/save` | 保存规则（草稿或发布） |

### SSE 事件格式

```
event:text
data:文字内容

event:done
data:{"status":"CLARIFYING","question":{"id":"q1","text":"...","options":[...]}}

event:done
data:{"status":"CLARIFIED","formSchema":{...}}

event:done
data:{"status":"READY","rulePreview":{...}}
```

---

## 3. LLM 大模型配置

**Base URL:** `/api/admin/llm-config`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | 获取 LLM 配置（Key 掩码） |
| `PUT` | `/` | 保存 LLM 配置（掩码 Key 跳过更新） |
| `GET` | `/providers` | 获取支持的提供商 |
| `POST` | `/test` | 测试 LLM 连接（掩码 Key 自动查 DB） |

---

## 4. 会员服务

**Base URL:** `/api/members`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/search` | 搜索会员 |
| `GET` | `/{memberId}` | 会员详情 |
| `POST` | `/` | 创建会员 |
| `PUT` | `/{memberId}` | 更新会员 |
| `GET` | `/{memberId}/orders` | 会员订单列表 |
| `GET` | `/{memberId}/orders/detail` | 订单详情 |
| `GET` | `/{memberId}/transactions` | 积分交易记录 |
| `GET` | `/{memberId}/transactions/{txId}/allocation` | 交易冲抵明细 |
| `GET` | `/{memberId}/tier-logs` | 等级变更日志 |
| `GET` | `/{memberId}/channel-bindings` | 渠道绑定信息 |
| `POST` | `/{memberId}/points/adjust` | 积分调整 |
| `POST` | `/{memberId}/tier/adjust` | 等级调整 |
| `POST` | `/{memberId}/freeze` | 冻结会员 |
| `POST` | `/{memberId}/unfreeze` | 解冻会员 |
| `POST` | `/merge` | 创建会员合并任务 |

---

## 5. 渠道映射

**Base URL:** `/api/channels`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/{channel}/inbound-mappings/{operationCode}` | 获取入站映射 |
| `PUT` | `/{channel}/inbound-mappings/{operationCode}` | 保存入站映射 |
| `GET` | `/{channel}/outbound-mappings/{operationCode}` | 获取出站映射 |
| `PUT` | `/{channel}/outbound-mappings/{operationCode}` | 保存出站映射 |

---

## 6. 事件数据

**Base URL:** `/api/event-data`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/orders` | 订单事件列表 |
| `GET` | `/orders/{eventId}` | 订单事件详情 |
| `GET` | `/behaviors` | 行为事件列表 |
| `GET` | `/transactions` | 交易事件列表 |
| `GET` | `/{schemaType}` | 按 Schema 类型查询事件 |

---

## 7. Schema 管理

**Base URL:** `/api/schemas`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/{entityType}` | 获取实体 Schema |
| `GET` | `/{entityType}/deprecation-check` | 字段废弃检查 |

---

## 8. API 操作配置

**Base URL:** `/api/admin/api-operations`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | API 操作列表 |
| `GET` | `/{id}` | API 操作详情 |
| `POST` | `/` | 创建 API 操作 |
| `PUT` | `/{id}` | 更新 API 操作 |
| `DELETE` | `/{id}` | 删除 API 操作 |
| `GET` | `/entity-types` | 获取实体类型列表 |
| `GET` | `/channels` | 获取渠道列表 |

---

## 9. 事件处理

**Base URL:** `/api/events`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/{chainName}/{programCode}` | 执行 LiteFlow 事件链 |

---

## 10. SPI 网关

**Base URL:** `/api/open/spi/{channel}/{programCode}`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/{action}` | 第三方渠道 SPI Webhook |

---

## 通用说明

### 请求头

| Header | 说明 |
|--------|------|
| `X-Program-Code` | 租户标识（必填） |
| `X-Trace-Id` | 链路追踪 ID |
| `Authorization` | Bearer Token |
| `Content-Type` | `application/json` |

### 响应格式

```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "traceId": "uuid",
  "data": { },
  "timestamp": "ISO8601"
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| `SUCCESS` | 成功 |
| `ERR_INTERNAL` | 系统内部错误 |
| `ERR_INVALID` | 参数无效 |
| `ERR_SESSION_NOT_FOUND` | AI 会话已过期 |
| `ERR_NO_RULE` | 无可保存的规则 |
| `ERR_GENERATE` | 规则生成失败 |