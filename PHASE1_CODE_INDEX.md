# 阶段一产物代码索引

## 项目结构总览（33 个文件）

```
loyalty-saas/
├── pom.xml                                              # Maven 构建配置
├── src/main/resources/
│   └── application.yml                                  # 应用配置
└── src/main/java/com/loyalty/saas/
    ├── LoyaltySaasApplication.java                      # Spring Boot 启动入口
    ├── common/
    │   ├── context/
    │   │   └── TenantContext.java                       # 租户上下文 ThreadLocal 持有器
    │   ├── event/
    │   │   ├── EventBridge.java                         # 统一事件总线接口
    │   │   ├── BaseDomainEvent.java                     # 领域事件基类
    │   │   ├── DomainEventHandler.java                  # 事件处理器接口
    │   │   ├── LocalEventBus.java                       # 本地事件总线 (dev profile)
    │   │   └── LocalEventRouter.java                    # 本地事件路由器
    │   ├── filter/
    │   │   └── TenantContextFilter.java                 # 租户上下文过滤器 (第一层防线)
    │   ├── interceptor/
    │   │   ├── TenantHibernateInterceptor.java          # Hibernate 租户 SQL 拦截器 (第二层防线)
    │   │   └── TenantMybatisPlusInterceptor.java        # MyBatis-Plus 租户 SQL 拦截器 (第二层防线)
    │   └── repository/
    │       └── BaseRepository.java                      # 安全查询哨兵 (第四层防线)
    ├── domain/
    │   ├── entity/
    │   │   ├── Program.java                             # 核心租户计划表
    │   │   ├── Member.java                              # 会员主表 (双轨模型/JSONB)
    │   │   ├── MemberUniqueKey.java                     # 全渠道唯一键表 (One-ID)
    │   │   ├── AccountTransaction.java                  # 积分流水表 (分区表/复合主键)
    │   │   ├── RedemptionAllocation.java                # 核销分摊明细表
    │   │   ├── MemberAccount.java                       # 会员账户表 (乐观锁/风控参数)
    │   │   ├── ChannelAdapterConfig.java                # 渠道适配器配置表
    │   │   ├── ChannelSpiLog.java                       # SPI 调用审计日志表
    │   │   ├── EventInbox.java                          # 事件收件箱表
    │   │   ├── TierChangeLog.java                       # 等级变更历史表
    │   │   └── RuleSnapshot.java                        # 规则版本快照表
    │   ├── enums/
    │   │   ├── MemberStatus.java                        # 会员状态
    │   │   ├── TransactionType.java                     # 交易类型
    │   │   ├── TransactionStatus.java                   # 流水状态
    │   │   ├── MappingMode.java                         # 渠道映射模式
    │   │   ├── AdapterStatus.java                       # 适配器状态
    │   │   ├── InboxStatus.java                         # 收件箱状态
    │   │   └── TierChangeReason.java                    # 等级变更原因
    │   └── converter/
    │       └── JsonbConverter.java                      # PostgreSQL JSONB ↔ Map 转换器
    └── config/
        ├── HibernateInterceptorConfig.java              # Hibernate 拦截器注册
        └── MybatisPlusConfig.java                       # MyBatis-Plus 拦截器注册
```

## 四层防御体系对照

| 层级 | 组件 | 设计文档参考 |
|------|------|------------|
| **第一层：入口防御** | `TenantContextFilter` — 强制校验 `X-Program-Code` 请求头，缺失直接 403 | 第九章 9.2 节 |
| **第二层：ORM 拦截** | `TenantHibernateInterceptor` + `TenantMybatisPlusInterceptor` — 自动注入 `AND program_code = ?` | 第九章 9.2 节 |
| **第三层：中间件沙箱** | `TenantContext` 的 `capture()`/`restore()` 机制 + `LocalEventBus` 消费时恢复租户上下文 | 第九章 9.2 节 |
| **第四层：查询哨兵** | `BaseRepository` — 禁用 `findById(id)`，强制要求 `programCode` 参数 | 第九章 9.2 节 |

## 关键设计决策

1. **AccountTransaction 复合主键**: 使用 `@IdClass(AccountTransactionId.class)` 建模分区表 `PRIMARY KEY (id, created_at)`，`created_at` 必须使用业务事件时间
2. **MemberAccount 乐观锁**: `@Version` 字段仅用于 `credit_used` 的并发控制，积分余额通过 `SUM(remaining_amount)` 实时计算
3. **LocalEventBus 虚拟分区**: 8 个单线程池模拟 Kafka 分区，`partitionKey.hashCode() % 8` 保证同一 memberId 事件串行
4. **BaseRepository 安全哨兵**: 通过 `@Deprecated` + `default` 方法抛出异常禁用危险方法，编译期即可发现违规调用
5. **TenantContext 快照机制**: `TenantSnapshot` record 用于跨线程传递租户上下文，异步线程必须在 finally 清理