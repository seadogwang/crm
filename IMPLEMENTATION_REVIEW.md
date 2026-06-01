# LoyaltyDesign v6.3 — 实现状态全局对照

> 日期: 2026-06-01 | 代码行数: ~8000 Java + ~1200 TS | 测试: 131 全通过

---

## 第一章：引言与设计哲学

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 防御性编程四层防御 | ✅ | TenantContextFilter + ORM拦截器 + RLS + BaseRepository |
| 状态机至上 | ✅ | EventInbox 状态机 + account_transaction 状态机 |
| 性能一致性平衡 | ✅ | 瀑布流冲抵 + 异步级联重算 |
| Schema-Driven 解耦 | ✅ | JSONB 动态属性 + Formily 前端渲染 |
| One-ID 全渠道 | ❌ | `member_unique_key` 表已存在，但入会流程未完整实现 |
| FIFO-Batch 溯源 | ✅ | PointRedeemService + RedemptionAllocation |
| Shadow Sandbox | ✅ | RuleRegressionService + ActionDiff |

---

## 第二章：系统总体架构与轻量化环境设计

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 管理后台 JWT API | ✅ | MemberController, SchemaController (+ RBAC 拦截器) |
| 商户 Open API HMAC-SHA256 | ✅ | OpenApiSignatureFilter (Ch9 Phase) |
| SPI 统一网关 | ✅ | SpiGatewayController + SpiHandlerFactory |
| 动态实体引擎 JSONB | ✅ | JSONB 映射 + JsonbConverter + SchemaService |
| 规则引擎 Drools | ⚠️ | KieBaseCacheManager + RuleEngineService — Drools JS 运行时未安装 |
| GraalVM 异构映射 | ⚠️ | ScriptingTransformer 骨架已写，GraalVM JS engine 本地不可用 |
| FIFO 冲抵引擎 | ✅ | PointGrantService + PointRedeemService |
| ORM 自动拦截 | ✅ | TenantHibernateInterceptor + TenantMybatisPlusInterceptor |
| Redis 缓存租户隔离 | ⚠️ | Redis 配置已就绪，本地无 Redis 实例运行 |
| EventBridge 接口 | ✅ | EventBridge + LocalEventBus (dev) |
| **KafkaEventBus (test/prod)** | ❌ | 设计文档 2.2.3 — **未实现** |

---

## 第三章：核心业务领域：Program 与会员域

| 功能点 | 状态 | 说明 |
|--------|------|------|
| Program 实体 + config_json | ✅ | JPA 匹配 loyalty_dev schema |
| 会员双轨模型 (静态+动态) | ✅ | Member 实体 + ext_attributes JSONB |
| 动态属性 Schema 版本双写 | ✅ | MemberService: schema_version 独立字段 + _schema_version 注入 |
| DRL 事实包装器 | ✅ | MemberFact + EventFact (Drools) |
| **One-ID 并发入会流程** | ❌ | Ch3.4.2 — 分布式锁 + 多维度交集匹配 + 雪花 ID 生成 — **未实现** |
| **极端竞态防护** | ❌ | Ch3.4.2.1 — DataIntegrityViolationException 兜底 — **未实现** |
| **显式合并与资产转移** | ❌ | Ch3.4.3 — MERGE 操作 + 积分/等级转移 — **未实现** |

---

## 第四章：积分、等级与资产隔离域

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 积分类型字典 | ⚠️ | DB 有 tier_definition 表，但 PointTypeDefinition 实体未建 |
| 积分流水表 | ✅ | AccountTransaction 实体 + Repository |
| **瀑布流冲抵引擎** | ✅ | PointGrantService: 补天窗→还信用→ACCRUAL |
| **FIFO 核销引擎** | ✅ | PointRedeemService: SUM余额→FOR UPDATE→惰性过期→Allocation |
| 实时余额 SUM 计算 | ✅ | sumAvailableBalance 查询 |
| **信用额度透支** | ✅ | creditUsed + CREDIT_DRAWDOWN |
| 碎片整理 Compaction | ✅ | PointsCompactionJob + CompactionService |
| 惰性过期标记 | ✅ | markAsExpired 单行更新 + PointsExpiredEvent |
| 等级评估双轨制 | ⚠️ | TierEvaluationJob 已实现，但"实时升级"事件监听未完全对接 |
| 等级变更历史 | ✅ | tier_change_log 写入 |

---

## 第五章：逆向交易与级联重算域

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 异步差额补偿机制 | ✅ | 设计文档 5.2 核心流程已实现 |
| **ShadowContext** | ✅ | 等级时间轴 + advanceToTime |
| **processCascadeRecalculation** | ⚠️ | 骨架已实现，loadTimelineTransactions 返回空列表 |
| **applyCompensationWithShortTransaction** | ✅ | 极短事务补偿 + 幂等防重 |
| **级联重算任务恢复** | ✅ | recoverStuckJobs (卡死→PENDING) |
| **退换货积分还原** | ✅ | RedemptionReversalService: 追溯→批次还原→过期重裁决 |
| 宽限期配置 | ✅ | graceDays 可配置 |
| 负资产挂账 negative_pending | ❌ | Ch5.5 — **未实现** |
| 高风险权益冻结 SUSPENDED_REDEMPTION | ❌ | Ch5.5 — **未实现** |

---

## 第六章：规则引擎、沙箱与自动化回归

| 功能点 | 状态 | 说明 |
|--------|------|------|
| **KieBase 原子热替换** | ✅ | AtomicReference<KieBase> + getAndSet 无锁 |
| **无状态会话** | ✅ | StatelessKieSession 每次新建 |
| **ActionCollector 隔离** | ✅ | 线程安全收集器 + 禁止DB操作 |
| **RewardExecutor 事务统管** | ✅ | 单一 @Transactional 执行所有 Action |
| **影子沙箱回归** | ✅ | RuleRegressionService 双 KieSession |
| **ActionDiff 冲突检测** | ✅ | Double Reward + Shadowing + Tier Diff |
| **AI 辅助规则生成** | ❌ | Ch6.2 — LLM 上下文注入 + JSON 强输出 — **未实现** |
| **弱阻断与强制放行** | ⚠️ | RegressionReport WARNING/CRITICAL 已实现，审批流升级未实现 |
| 规则快照 rule_snapshot | ✅ | 实体 + Repository |

---

## 第七章：全渠道 SPI 接入与异构映射

| 功能点 | 状态 | 说明 |
|--------|------|------|
| **SPI 统一网关** | ✅ | SpiGatewayController: 2000ms 超时 + HTTP 200 异常 |
| **策略模式 Handler** | ✅ | ChannelSpiHandler 接口 + SpiHandlerFactory |
| **TMALL Handler** | ✅ | 完整 HMAC-SHA256 验签 + event_inbox 入库 |
| **JD Handler** | ❌ | **未实现** |
| **DOUYIN Handler** | ❌ | **未实现** |
| **WECHAT Handler** | ❌ | **未实现** |
| **GraalVM JS 沙箱** | ✅ | ScriptingTransformer: allowAllAccess(false) + 50ms + IO false |
| **EventInbox 状态机** | ✅ | RECEIVED→VALIDATING→VALIDATED→PROCESSING→SUCCEEDED/FAILED |
| **死信队列重试** | ✅ | EventInboxRetryJob: 指数退避 + 死信 |
| **1:N 级联持久化** | ❌ | Ch7.4 — EventFact → transaction_event + custom_entity_data — **未实现** |
| **死信重放接口** | ❌ | POST /api/admin/events/{id}/replay — **未实现** |

---

## 第八章：管理界面设计与前端动态渲染

| 功能点 | 状态 | 说明 |
|--------|------|------|
| **Schema 设计器** | ✅ | SchemaBuilder: 拖拽画布 + JSON导出 |
| **Formily 动态渲染** | ✅ | DynamicRenderer: SchemaField + 只读/编辑 |
| **自定义组件注册** | ⚠️ | BUILTIN_COMPONENTS 已建，微前端扩展未实现 |
| **向下兼容策略** | ✅ | 废弃字段折叠面板 + 版本过期提示 |
| **联动表达式 x-reactions** | ✅ | Schema 配置中支持 |
| **渠道脚本工作台** | ✅ | ScriptingWorkbench: Monaco + 三栏布局 + 模板 |
| **设计器态/运行态分离** | ✅ | SchemaBuilder vs DynamicRenderer 两个独立组件 |
| 微前端动态加载 | ❌ | Ch8.2.1 — qiankun / Module Federation — **未实现** |
| 生命周期还原前端 | ❌ | redemption_allocation 取消兑换 UI — **未实现** |

---

## 第九章：多租户数据穿透与绝对防御体系

| 功能点 | 状态 | 说明 |
|--------|------|------|
| **TenantContext** | ✅ | ThreadLocal + capture/restore 快照 |
| **第一层：入口防御** | ✅ | TenantContextFilter: X-Program-Code 强制校验 |
| **第二层：ORM 拦截** | ✅ | Hibernate + MyBatis-Plus 双拦截器 |
| **第三层：中间件沙箱** | ✅ | EventBridge 消费前校验 + RLS 上下文注入 |
| **第四层：查询哨兵** | ✅ | BaseRepository: findById/findAll 禁用 |
| **定时任务租户隔离** | ✅ | TenantAwareJob: forEachTenant + finally clear |
| 防御审计与越权追踪 | ❌ | Ch9.3 — 租户污染监控 + 越权访问审计 — **未实现** |

---

## 第十章：前后端 API 与技术规范

| 功能点 | 状态 | 说明 |
|--------|------|------|
| **统一响应协议** | ✅ | ApiResponse: code/message/traceId/data |
| **通用 Header 约束** | ✅ | X-Program-Code, X-Trace-Id, Authorization |
| **@Idempotent 幂等** | ✅ | AOP 拦截器 + Redis 24h 缓存 |
| **禁止 HTTP 500** | ✅ | GlobalExceptionHandler: 全部→200 |
| **HMAC-SHA256 Open API** | ✅ | OpenApiSignatureFilter |

---

## 第十一章：数据库物理模型设计

| 表 | 状态 | 说明 |
|----|------|------|
| program | ✅ | JPA 实体已映射 |
| member | ✅ | + tier_code + schema_version |
| member_unique_key | ✅ | 实体已映射 |
| account_transaction | ✅ | 实体已映射 (CK 已扩展) |
| redemption_allocation | ✅ | 实体已映射 |
| member_account | ✅ | + overdraft_limit/credit_limit/credit_used |
| channel_adapter_config | ✅ | 实体已映射 |
| event_inbox | ✅ | + max_retry/reject_reason/next_retry_at |
| tier_change_log | ✅ | 实体已映射 |
| rule_snapshot | ✅ | 实体已映射 |
| rule_definition | ✅ | 实体已映射 |
| member_tier | ✅ | 实体已映射 |
| cascade_recalc_job | ✅ | 实体已映射 |
| cascade_recalc_log | ✅ | 实体已映射 |
| notification_outbox | ✅ | Phase 10 新建 |
| **custom_entity_data** | ❌ | 1:N 明细表 — **未建实体** |
| **custom_entity_definition** | ❌ | 动态实体定义 — **未建实体** |
| **event_outbox** | ❌ | 事件发件箱 — **未建实体** |
| **negative_pending** | ❌ | Ch5.5 待冲抵挂账 — **未建实体** |
| transaction_event | ✅ | Phase 2 实体已有 |
| **point_type_definition** | ❌ | Ch4.1 积分类型字典 — **未建实体** |
| **tier_definition** | ❌ | 等级阶梯定义 — **未建实体** |

---

## 第十二章：高并发与性能设计

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 有序分区消费 | ✅ | LocalEventBus 虚拟分区 |
| 乐观锁 version | ✅ | MemberAccount.version |
| 碎片整理 | ✅ | PointsCompactionJob |
| Krools KieBase 无状态 | ✅ | StatelessKieSession |

---

## 第十三章：部署架构与灾备

| 功能点 | 状态 | 说明 |
|--------|------|------|
| K8s 部署 | ❌ | 非评审范围 — **未实现** |
| PostgreSQL Patroni | ❌ | 非评审范围 — **未实现** |
| Redis 哨兵 | ❌ | 非评审范围 — **未实现** |
| Prometheus + Grafana | ❌ | 非评审范围 — **未实现** |

---

## 总结：已实现 vs 未实现

| 分类 | 已实现 | 骨架 | 未实现 |
|------|--------|------|--------|
| 核心引擎 | 23 | 2 | 0 |
| API/网关 | 12 | 1 | 4 |
| 安全/防御 | 13 | 1 | 1 |
| 数据模型 | 16 | 0 | 6 |
| 前端 UI | 9 | 1 | 2 |
| 基础设施 | 0 | 1 | 4 |
| **总计** | **73** | **6** | **17** |

### 立即需要补齐的 5 个关键缺口

1. **KafkaEventBus (2.2.3)** — 生产环境事件总线
2. **One-ID 并发入会 (3.4)** — Redisson 分布式锁 + 雪花 ID
3. **JD/DOUYIN/WECHAT SPI Handler (7.2)** — 三个渠道 Handler
4. **1:N 级联持久化 (7.4)** — custom_entity_data 明细落库
5. **negative_pending 挂账 (5.5)** — 退款超额熔断