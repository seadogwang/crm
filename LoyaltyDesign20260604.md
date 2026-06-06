# 基于AI的下一代全渠道忠诚度管理SaaS平台
## 完整设计文档 v7.0（金融级·多租户强隔离·全渠道版）
**版本**：7.0
**状态**：团队评审与开发基线版
**日期**：2026-06-04
***
## 第一章：引言与设计哲学
### 1.1 背景与战略愿景
忠诚度管理系统（Loyalty Management）是企业全链路 CRM 体系的核心中台。在当今异构渠道（电商、私域、线下）并存的格局下，传统的积分系统普遍陷入了"规则死锁"与"渠道割裂"的困境。
本项目的战略目标是构建一套"**配置驱动、金融级一致性、AI 原生防御**"的下一代 SaaS 底座。我们不仅要解决"发分与核销"的业务需求，更要构建一套能够支撑企业在未来 3-5 年内，应对高并发交易、复杂合规要求与敏捷运营诉求的技术护城河。
### 1.2 设计哲学
在架构演进过程中，我们遵循以下四项核心设计原则：
* **防御性编程 (Defensive SaaS)**：数据穿透是 SaaS 系统的生死线。我们从基础设施层面（数据库层租户过滤）到应用层（租户上下文强制持有）构建了四重隔离防线，确保租户间逻辑绝对隔离。
* **状态机至上 (State-Machine Driven)**：将积分流转、退款重算、身份合并等复杂逻辑建模为状态转换。一切业务结果通过事件溯源（Event Sourcing）而非仅仅是修改余额，确保"账户余额"在任何时间点都是可溯源、可审计的。
* **性能与一致性的动态平衡**：放弃低效的全局分布式锁，引入"瀑布流冲抵机制"与"异步无锁化补偿"，在保证业务逻辑正确的前提下，最大程度优化接口响应性能。
* **代码与配置的解耦 (Schema-Driven)**：前端界面、规则判定逻辑与持久化模型均由元数据（Metadata/JSON Schema）驱动。系统不仅是功能的容器，更是业务规则配置的执行引擎。
### 1.3 核心专业术语表
| 术语                 | 定义说明                     | 伪代码/语义约束                                     |
| ------------------ | ------------------------ | -------------------------------------------- |
| **Program**        | 业务租户单元，积分计算的原子空间         | `ProgramCode == Tenant_Boundary`             |
| **One-ID**         | 全渠道身份识别后的唯一会员主键          | `One-ID = UniqueKeyMapping(channel, openId)` |
| **EventFact**      | 标准化领域事件，所有入账动作必须先归一化为此格式 | `Fact = Standardize(RawRequest)`             |
| **FIFO-Batch**     | 积分核销遵循严格的先进先出原则          | `Redemption = FIFO(AccrualBatches)`          |
| **Shadow Sandbox** | 规则变更的预验证环境               | `Sandbox = Baseline + Candidate_Rule`        |
### 1.4 架构评审边界
* **重点评审项**：多租户隔离的严密性、逆向级联补偿机制的吞吐量、规则引擎的防错机制。
* **非评审范围**：不涉及底层网络基础设施（Kubernetes 部署细节、CDN 配置）、不涉及 C 端页面渲染的前端样式细节（仅涉及动态 Schema 协议）。
### 1.5 附录：如何阅读这份文档
本技术文档采用了"**伪代码先行**"的叙述风格。每一项核心业务逻辑均配有对应的伪代码。建议评审人重点关注伪代码中对于"**事务边界**"、"**并发处理（锁）**"以及"**租户上下文安全**"的处理方式。这份文档不仅是逻辑说明，更是后续代码开发的**契约规范**。
***
## 第二章：系统总体架构与轻量化环境设计
### 2.1 系统逻辑架构分层
系统自上而下分为三层：
* **API / 接入层 (Gateway & API Layer)**
  * 管理后台 API：面向商户运营人员，基于 JWT 认证的 RESTful API
  * 商户 Open API：面向商户自有前端，基于 HMAC-SHA256 签名
  * Unified SPI Gateway：专为天猫、京东、抖音等二方开放平台设计的反向 Webhook 网关
* **核心业务与领域引擎层 (Core Domain Engines)**
  * 动态实体引擎：结合 JSONB 和动态 Schema，实现多行业会员和交易扩展属性管理
  * 规则引擎与沙箱 (Drools & Sandbox)：无状态的 Drools 8 执行环境
  * 异构映射引擎 (GraalVM Scripting)：将第三方异构 API 数据转换为标准内部事件
  * 核销与冲抵引擎 (Offset Engine)：处理积分的 FIFO 消耗及透支冲抵
* **基础设施与防穿透层 (Infrastructure & Defense Layer)**
  * 数据库层：PostgreSQL 15，依托全局 ORM 拦截器实现 `program_code` 级数据穿透防御
  * 缓存与锁：Redis Cluster，Key 统一强制追加租户前缀隔离
  * 事件总线 (EventBridge)：屏蔽底层消息队列物理实现，提供统一领域事件派发接口
### 2.2 开发轻量化与消息队列环境隔离
**痛点背景**：企业级 SaaS 强依赖 Kafka 集群，开发人员在本地启动全套 Kafka 环境占用大量内存且配置繁琐。
**架构解法**：引入 `EventBridge` 抽象总线，利用 Spring `@Profile` 机制实现环境无缝切换。业务代码禁止直接使用 `KafkaTemplate`。
#### 2.2.1 统一事件总线接口契约
```java
public interface EventBridge {
    void publish(String topic, String partitionKey, BaseDomainEvent event);
}
```
### 2.2.1.1 Kafka/EventBridge 顺序性约束
**背景**：Kafka 保证每个 Partition 内消息有序，但跨 Partition 则无序。**务必将同一会员的所有消息发送至同一分区**。  
- **Partition Key 规则**：固定使用 `member_id` 作为 PartitionKey，确保同会员消息一贯路由。如：`kafkaTemplate.send(topic, memberId, event)`。  
- **消费端并发限制**：每个分区只能由一个线程处理以保证顺序。Spring Kafka 默认对每个分区使用单线程。**禁止开启多个消费者实例同时消费同一Topic的多个分区，否则相当于并行处理单会员消息**。如需提升并发，可增加分区数与消费者实例，但保证每会员的分区Key不变。  
> **示例**：`KafkaEventBus.publish` 中应注释：  
> ```java
> // partitionKey 必须为 memberId，保证单会员消息顺序
> ```
#### 2.2.2 Dev环境：本地内存队列实现
```java
@Component
@Profile("dev")
@Slf4j
public class LocalEventBus implements EventBridge {
    private final int VIRTUAL_PARTITIONS = 8;
    private final ExecutorService[] partitionExecutors;
    public LocalEventBus() {
        this.partitionExecutors = new ExecutorService[VIRTUAL_PARTITIONS];
        for (int i = 0; i < VIRTUAL_PARTITIONS; i++) {
            this.partitionExecutors[i] = Executors.newSingleThreadExecutor(
                new ThreadFactoryBuilder().setNameFormat("local-mq-partition-" + i + "-%d").build()
            );
        }
    }
    @Override
    public void publish(String topic, String partitionKey, BaseDomainEvent event) {
        int partition = Math.abs(partitionKey.hashCode()) % VIRTUAL_PARTITIONS;
        partitionExecutors[partition].submit(() -> {
            try {
                log.info("[LocalMQ] 消费分区 {}: Topic={}, Key={}", partition, topic, partitionKey);
                LocalEventRouter.route(topic, event);
            } catch (Exception e) {
                log.error("[LocalMQ] 消费异常", e);
            }
        });
    }
}
```
#### 2.2.3 Test/Prod环境：Kafka 集群实现
```java
@Component
@Profile({"test", "prod"})
public class KafkaEventBus implements EventBridge {
    private final KafkaTemplate<String, Object> kafkaTemplate;
    public KafkaEventBus(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }
    @Override
    public void publish(String topic, String partitionKey, BaseDomainEvent event) {
        kafkaTemplate.send(topic, partitionKey, event);
    }
}
```
### 2.3 核心技术栈选型
* **核心框架**：Java 17 + Spring Boot 3.x
* **规则计算层**：Drools 8 (KIE API) + GraalVM Polyglot
* **数据持久层**：PostgreSQL 15（深度使用 JSONB + GIN 索引），Spring Data JPA 或 MyBatis-Plus
* **缓存与分布锁**：Redis 6.x + Redisson
* **前端框架**：React 18 + TypeScript + Vite + Ant Design 5 + Formily 2.x
* **画布引擎**：React Flow（节点+连线可视化）
* **Schema 编辑**：JsonSea（树形 JSON Schema 编辑器）
* **状态管理**：Zustand
* **样式方案**：纯白底色 + 黑线条风格，自定义 SVG 图标
***
## 第三章：核心业务领域：Program与会员域
### 3.1 Program 管理与租户边界
**Program（忠诚度计划）** 是本平台的核心业务租户单元。一个企业实体下可以创建多个互相隔离的 Program。
* **隔离原则**：所有会员、积分、规则、渠道配置的生命周期和数据权限绝对从属于唯一的 `program_code`
* **配置存储**：Program 的非结构化配置统一以 JSON 结构存储于 `program.config_json`，支持版本历史追溯
### 3.2 核心实体的静态与动态边界
平台对核心实体采取"**核心强依赖字段 + 动态扩展字段 (JSONB)**"的双轨模型。
**研发与 AI 编码纪律**：严禁随意在数据库表和 Java Entity 中增加业务字段。
#### 3.2.1 会员实体边界 (Member)
#### 3.2.1 会员实体边界 (Member)
* **静态字段**（系统路由和核心引擎强依赖）：
  * `id`：底层自增主键
  * `program_code`：归属计划
  * `member_id`：业务主键，One-ID（雪花算法生成）
  * `name`：姓名（通用属性，非唯一标识）
  * `gender`：性别（字典：MALE / FEMALE / UNKNOWN）
  * `birthday`：生日（通用属性，非唯一标识）
  * `status`：ENROLLED / SUSPENDED / MERGED / DEACTIVATED
  * `tier_code`：当前等级代码
  * `schema_version`：Schema 版本号
  * `created_at`：注册时间
* **动态字段**：`ext_attributes`（JSONB），存储渠道特有属性（如天猫昵称、抖音头像等）
* **设计原则**：明文手机不在 member 表中，所有标识类信息统一通过 member_unique_key 管理
```java
@Entity
@Table(name = "member")
public class Member {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_code", nullable = false)
    private String programCode;
    @Column(name = "member_id", nullable = false, unique = true)
    private String memberId;
    @Column(name = "tier_code")
    private String tierCode;
    @Column(name = "status", nullable = false)
    @Column(name = "name")
    private String name;
    @Column(name = "gender")
    private String gender;
    @Column(name = "birthday")
    private LocalDate birthday;
    private String status;
    @Column(name = "schema_version")
    private String schemaVersion;
    @Type(type = "jsonb")
    @Column(name = "ext_attributes", columnDefinition = "jsonb")
    private Map<String, Object> extAttributes = new HashMap<>();
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
```
#### 3.2.2 交易事件边界 (TransactionEvent)
* **静态字段**：`event_id`, `member_id`, `event_type`, `channel`, `event_time`, `idempotent_key`
* **event_type 枚举**：
  * `ORDER`：订单交易
  * `BEHAVIOR`：行为事件（浏览、分享、签到等）
  * `REDEMPTION`：兑礼交易
  * `CUSTOM`：自定义事件（预留扩展）
* **动态字段**：不同类型交易的差异字段统一存入 `payload` JSONB
#### 3.2.3 动态属性写入规范（Schema 版本下沉）
每次创建或更新会员的 ext_attributes 时，必须同步写入当前生效的 Schema 版本号：
```java
public void saveMemberExtAttributes(String memberId, Map<String, Object> extAttributes) {
    Member member = memberRepo.findByMemberId(memberId);
    @Autowired
    private EventBridge eventBridge;
    String currentSchemaVersion = schemaService.getCurrentVersion(member.getProgramCode(), "MEMBER");
    // 双写：独立字段 + JSON 内部元字段
    extAttributes.put("_schema_version", currentSchemaVersion);
    member.setExtAttributes(extAttributes);
    member.setSchemaVersion(currentSchemaVersion);
    memberRepo.save(member);
    // 检查强标识字段，触发隐式合并检查
    List<String> strongFields = schemaService.getStrongIdentifierFields(member.getProgramCode(), "MEMBER");
    for (String fieldKey : strongFields) {
        if (extAttributes.containsKey(fieldKey)) {
            String newValue = String.valueOf(extAttributes.get(fieldKey));
            eventBridge.publish("loyalty-identity-events", memberId,
                new StrongIdentifierUpdatedEvent(memberId, fieldKey, newValue));
        }
    }
}
```
### 3.3 动态属性与规则引擎的桥接
**解法**：在数据进入 `KieSession` 前，通过**事实包装器 (Fact Wrapper)** 进行转换。
#### 3.3.1 包装器设计规范
```java
public class MemberFact {
    private String memberId;
    private String tierCode;
    private Map<String, Object> extAttributes;
    public String getExtString(String key) {
        return extAttributes.containsKey(key) ? String.valueOf(extAttributes.get(key)) : null;
    }
    public Double getExtNumber(String key) {
        if (!extAttributes.containsKey(key)) return 0.0;
        return Double.valueOf(String.valueOf(extAttributes.get(key)));
    }
}
public class EventFact {
    private String eventType;
    private String memberId;
    private String channel;
    private LocalDateTime eventTime;
    private String idempotentKey;
    private Map<String, Object> payload;
    public Double getPayloadNumber(String key) { /* ... */ }
    public String getPayloadString(String key) { /* ... */ }
}
```
#### 3.3.2 DRL 规则模板规范
```drools
rule "Dynamic_Attribute_Reward_Rule"
when
    $event : EventFact( eventType == "ORDER", getPayloadNumber("order_amount") > 100 )
    $member : MemberFact( memberId == $event.memberId, getExtNumber("shoe_size") > 40 )
then
    ActionCollector.awardPoints($event.getEventId(), 50, "ORDER_REWARD").execute(drools);
end
```
### 3.4 全渠道身份识别与会员合并
#### 3.4.1 标识强度分级
| 标识类型 | 强度 | 说明 |
|----------|------|------|
| 明文手机 MOBILE_PLAIN | ★★★★★ | **跨渠道最强标识**，POS线下或抖音验证后获得 |
| 渠道唯一ID（ouid/pin/openId） | ★★★★ | 渠道内唯一，可自主精确匹配 |
| 密文手机（TMALL_MOBILE_MD5等） | ★★ | 可通过相同算法加密明文后等价匹配 |
| 掩码手机（DOUYIN_MOBILE_MASK） | ☆ | 不可匹配，仅存储备查 |
#### 3.4.2 分层匹配流程
```text
入会请求到达 → 提取所有可用标识
↓
第一层：强标识精确匹配
标识类型：MOBILE_PLAIN / TMALL_OUID / JD_PIN / WECHAT_OPENID / DOUYIN_OPENID
→ 在 member_unique_key 中查询
→ 命中 → 绑定渠道，复用 member_id
→ 未命中 → 进入第二层
↓
第二层：密文等价匹配（仅限自有渠道）
场景：POS 拿到明文手机，用相同算法加密后匹配 TMALL_MOBILE_MD5 / JD_MOBILE_ENCRYPT
→ 命中 → 绑定，写入 MOBILE_PLAIN
→ 未命中 → 进入第三层
↓
第三层：创建新 member_id
→ 写入所有可用标识到 member_unique_key
→ 对于抖音用户，标记为"待验证"状态
↓
异步补充验证（仅限抖音）：
→ 用户下单时抖音返回完整手机号
→ 写入 MOBILE_PLAIN
→ 触发跨渠道匹配检查 → 自动合并
```
#### 3.4.3 One-ID 建立的三个时机
| 时机 | 触发条件 | 行为 |
|------|---------|------|
| 入会时 | 请求包含强标识 | 立即匹配，命中则复用，未命中则创建 |
| 绑定新标识时 | 已有 member_id 的用户新增渠道/手机号 | 写入 member_unique_key，若冲突触发合并 |
| 抖音验证通过时 | 抖音下单返回完整手机号 | 写入 MOBILE_PLAIN，若冲突自动合并 |
#### 3.4.4 辅助唯一键表
```sql
CREATE TABLE member_unique_key (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    key_type VARCHAR(32) NOT NULL,
    key_value VARCHAR(256) NOT NULL,
    target_member_id VARCHAR(64) NOT NULL,
    is_strong BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, key_type, key_value)
) PARTITION BY LIST (key_type);
```
| key_type            | 示例值             | is_strong | 分区  | 匹配方式   |
| -------------------- | --------------- | ---------- | --- | ------ |
| `MOBILE_PLAIN`       | 13812345678     | ✅ true     | 热数据 | 精确匹配   |
| `TMALL_OUID`         | tb123456        | ✅ true     | 温数据 | 精确匹配   |
| `JD_PIN`             | jd_user_001   | ✅ true     | 温数据 | 精确匹配   |
| `WECHAT_OPENID`      | oxc123...       | ✅ true     | 温数据 | 精确匹配   |
| `DOUYIN_OPENID`      | dy123...        | ✅ true     | 温数据 | 精确匹配   |
| `TMALL_MOBILE_MD5`   | md5...          | ❌ false    | 冷数据 | 加密等价匹配 |
| `JD_MOBILE_ENCRYPT`  | enc...          | ❌ false    | 冷数据 | 加密等价匹配 |
| `DOUYIN_MOBILE_MASK` | 138****5678 | ❌ false    | 冷数据 | 不可匹配   |
#### 3.4.5 并发入会与合并策略
```java
public void processEnrollment(EnrollmentRequest request) {
    String programCode = request.getProgramCode();
    String channel = request.getChannel();       // TMALL / JD / WECHAT / DOUYIN / POS
    String openId = request.getOpenId();          // 渠道唯一标识
    String plainMobile = request.getPlainMobile(); // 明文手机（如有）
    // 1. 统一锁 Key：基于 openId 哈希
    String lockKey = "loyalty:" + programCode + ":enroll:" + HashUtil.md5(openId);
    RLock lock = redissonClient.getLock(lockKey);
    try {
        lock.lock(5, TimeUnit.SECONDS);
        // 2. 第一层：强标识精确匹配
        Long existingMemberId = uniqueKeyRepo.findMemberId(programCode, channel, openId);
        if (existingMemberId != null) {
            // 如果有明文手机，补充绑定
            if (plainMobile != null) {
                bindMobilePlain(programCode, existingMemberId, plainMobile);
            }
            return;
        }
        // 3. 第二层：如果有明文手机，尝试密文等价匹配
        if (plainMobile != null) {
            // 尝试匹配天猫密文
            String tmallMd5 = DigestUtils.md5Hex(DigestUtils.md5Hex(plainMobile + tmallSalt));
            Long tmallMemberId = uniqueKeyRepo.findMemberId(programCode, "TMALL_MOBILE_MD5", tmallMd5);
            if (tmallMemberId != null) {
                // 匹配成功，绑定新渠道 + 写入 MOBILE_PLAIN
                bindNewChannel(tmallMemberId, channel, openId);
                bindMobilePlain(programCode, tmallMemberId, plainMobile);
                return;
            }
            // 同理尝试匹配京东密文...
        }
        // 4. 第三层：创建新 member_id
        Long newMemberId = generateSnowflakeId();
        memberRepo.save(new Member(programCode, newMemberId));
        uniqueKeyRepo.save(new UniqueKey(programCode, channel, openId, newMemberId, true));
        // 如果有明文手机，也写入
        if (plainMobile != null) {
            bindMobilePlain(programCode, newMemberId, plainMobile);
        }
    } finally {
        lock.unlock();
    }
}
```
#### 3.4.6 数据库唯一约束兜底
```java
try {
    uniqueKeyRepo.save(new UniqueKey(programCode, "MOBILE_PLAIN", mobile, memberId));
} catch (DataIntegrityViolationException e) {
    Long existingMemberId = uniqueKeyRepo.findMemberId(programCode, "MOBILE_PLAIN", mobile);
    if (!existingMemberId.equals(memberId)) {
        mergeMembers(programCode, existingMemberId, memberId);
    }
}
```
#### 3.4.7 隐式合并触发
| 触发场景           | 检测方式                          | 合并条件                     |
| -------------- | ----------------------------- | ------------------------ |
| 抖音验证返回完整手机号    | 写入 `MOBILE_PLAIN` 时捕获唯一约束冲突   | 已有其他 member_id 绑定了同一手机号 |
| POS 线下注册提供明文手机 | 同上                            | 同上                       |
| 密文等价匹配成功       | 加密明文手机后匹配到 TMALL_MOBILE_MD5 | 匹配到其他 member_id         |
| 用户补充手机号        | 写入 `MOBILE_PLAIN` 时捕获异常       | 同上                       |
自动合并逻辑：
1. 选取主账号（注册早或等级高者）
2. 被合并账号状态置为 `MERGED`
3. 所有 member_unique_key 记录重定向到主账号
4. 积分资产累加，等级取最高
5. 发布 MemberMergedEvent
### 3.4.8 Member Merge Saga（会员合并编排）
**背景**：自动合并需跨多个实体同步积分、等级、优惠券、标识等，涉及长事务。引入 Saga 编排保证安全性。  
> **注意**：自动合并操作**仅**创建合并任务，实际资产迁移通过异步 Saga 执行。禁止在唯一约束冲突捕获或同步入会流程中直接执行会员全量合并，以避免长事务锁表和数据不一致。
**目的与风险说明**：会员合并操作涉及多张表的并发读写，风险极高，一旦处理不当可能导致积分丢失、重复、等级错误等问题。采用 Saga 模式将合并过程分解为多个可补偿步骤，中间状态可持久化，支持失败回滚和审计。并通过账户冻结避免并发消费引发不一致。
### 3.4.8.1 Saga 状态机
```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> FREEZING : 开始合并
    FREEZING --> TRANSFER_POINTS : 冻结账户
    TRANSFER_POINTS --> TRANSFER_TIERS : 转移积分批次
    TRANSFER_TIERS --> TRANSFER_COUPONS : 转移优惠券
    TRANSFER_COUPONS --> TRANSFER_TAGS : 转移标签
    TRANSFER_TAGS --> TRANSFER_IDENTITIES : 转移身份
    TRANSFER_IDENTITIES --> REBUILD_CACHE : 重建缓存
    REBUILD_CACHE --> COMPLETED : 完成
    FREEZING --> FAILED
    TRANSFER_POINTS --> FAILED
    TRANSFER_TIERS --> FAILED
    TRANSFER_COUPONS --> FAILED
    TRANSFER_TAGS --> FAILED
    TRANSFER_IDENTITIES --> FAILED
    REBUILD_CACHE --> FAILED
    FAILED --> ROLLBACK : 触发补偿
    ROLLBACK --> [*]
```
- **CREATED**：收到合并请求，生成合并任务记录 (member_merge_task)，状态 `CREATED`。  
- **FREEZING**：标记合并双方账户为 `MERGING`（冻结），以禁止积分变动。见下文 “冻结机制”。  
- **TRANSFER_POINTS**：按 FIFO 保留顺序将源会员的所有“有效积分流水批次”归属到目标会员（更新 `account_transaction.member_id` 并维护 `remaining_amount`）。见下文“积分迁移”。  
- **TRANSFER_TIERS**：合并等级：取两者最高等级，记录合并前后异动到 `tier_change_log`。  
- **TRANSFER_COUPONS**：迁移所有 **未使用且未过期** 的优惠券，将 `coupon_instance.member_id` 更新为目标会员。  
- **TRANSFER_TAGS**：合并会员标签集（取并集，不重复）。  
- **TRANSFER_IDENTITIES**：合并身份标识（如手机号、第三方账号）。若**强标识冲突**（例如手机号存在于多个账户），则人工干预流程或触发补偿。  
- **REBUILD_CACHE**：清除并重建相关缓存，发布 `MemberMergedEvent`。  
- **COMPLETED**：Saga 成功结束。  
补偿路径：若任一步骤失败，Saga 进入 `FAILED`，然后倒序执行补偿（依次从身份、标签、优惠券、等级、积分逆向恢复），最后回滚冻结（标记账户为正常），并记录失败状态。
### 3.4.8.2 合并任务表
新增表 `member_merge_task` 存储 Saga 状态：
```sql
CREATE TABLE member_merge_task (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    source_member_id BIGINT NOT NULL,
    target_member_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,         -- Saga 状态: CREATED, FREEZING, ..., COMPLETED, FAILED, ROLLBACK
    current_step VARCHAR(64),            -- 当前执行步骤
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, source_member_id) -- 同一会员只能有一个活跃合并任务
);
```
- **program_code**：租户隔离。  
- **Unique 约束**：防止重复创建相同源会员的并发合并任务。  
### 3.4.8.3 冻结机制
新增账户状态字段，禁止冻结期操作：
```sql
ALTER TABLE member_account ADD COLUMN account_status VARCHAR(16) DEFAULT 'ACTIVE';
```
- 状态 `MERGING` 表示冻结中。合并任务开始时，将源和目标会员的所有 `member_account` 行状态更新为 `MERGING`。  
- 在 `MemberAccountService` 等所有修改积分的入口，加校验：  
  ```java
  if (memberAccount.getAccountStatus().equals("MERGING")) {
      throw new BusinessException("ERR_MEMBER_MERGING", "会员正在合并，操作禁止");
  }
  ```  
- 冻结期间禁止积分入账、核销、透支、调整等操作，确保流水稳定。  
合并完成或失败时，将状态改回 `ACTIVE`。
### 3.4.8.4 积分资产迁移
**禁止**直接修改余额字段，应通过转移流水记录来完成。示例：  
```java
@Transactional
public void transferPoints(String programCode, Long sourceId, Long targetId) {
    // 1. 归属转移：解冻模式不允许直接更新余额
    List<AccountTransaction> batches = txRepo.findActiveBatchesForUpdate(sourceId, accountType);
    for (AccountTransaction batch : batches) {
        batch.setMemberId(targetId);
        txRepo.save(batch);
    }
    // 2. 更新账户累计统计（自增）
    MemberAccount srcAcct = accountRepo.findForUpdate(sourceId, accountType);
    MemberAccount tgtAcct = accountRepo.findForUpdate(targetId, accountType);
    tgtAcct.setTotalAccrued(tgtAcct.getTotalAccrued().add(srcAcct.getTotalAccrued()));
    tgtAcct.setTotalRedeemed(tgtAcct.getTotalRedeemed().add(srcAcct.getTotalRedeemed()));
    accountRepo.save(tgtAcct);
}
```
**要点**：每个积分批次（`account_transaction`）保留原始 `expires_at`、`rule_id` 等，审核合并前后的 `remaining_amount` 不变。仅改变 `member_id`，避免重新计算。
### 3.4.8.5 等级迁移
遵循“高等级保留”原则：  
```java
Member src = memberRepo.findById(sourceId);
Member tgt = memberRepo.findById(targetId);
String newTier = maxTier(src.getTierCode(), tgt.getTierCode()); // 取更高等级
if (!newTier.equals(tgt.getTierCode())) {
    // 记录降级/升级日志
    tierLogRepo.save(new TierChangeLog(targetId, tgt.getTierCode(), newTier, "MERGE"));
    tgt.setTierCode(newTier);
    memberRepo.save(tgt);
}
```
保留被合并会员的最高等级，删除冗余等级历史后续可在后台归档或合并。
### 3.4.8.6 优惠券迁移
```sql
UPDATE coupon_instance
SET member_id = :targetId
WHERE member_id = :sourceId
  AND status = 'AVAILABLE' 
  AND expires_at > NOW()
  AND program_code = :programCode;
```
仅迁移 **未使用且未过期** 的券，已使用或已过期的券留在原记录中；若商家需要，可在审核完后启用自定义补发流程。
### 3.4.8.7 标签合并
```java
Set<String> srcTags = tagRepo.findTagsByMember(sourceId);
Set<String> tgtTags = tagRepo.findTagsByMember(targetId);
Set<String> union = new HashSet<>(srcTags);
union.addAll(tgtTags);
tagRepo.saveAll(memberId=targetId, tags=union);
tagRepo.deleteByMember(sourceId);
```
简单并集逻辑，已存在的标签不重复存储。所有标签修改通过事件发送至权限校验和缓存模块。
### 3.4.8.8 身份标识迁移
合并时迁移 `member_unique_key` 表项。按照标识强度：
- **强标识（手机号、邮箱）**：若冲突（两个会员绑定同手机号），仅保留一个账户的记录，另一条标记为无效；冲突需人工介入审查。  
- **弱标识（渠道 openId 等）**：直接附加到目标会员。  
示例伪代码：  
```java
List<UniqueKey> keys = uniqueKeyRepo.findAllByMember(sourceId);
for (UniqueKey key : keys) {
    try {
        uniqueKeyRepo.save(new UniqueKey(programCode, key.getKeyType(), key.getKeyValue(), targetId, key.isStrong(), key.isVerified()));
    } catch (DataIntegrityViolationException ex) {
        // 主键冲突：另一个会员已绑定此标识
        if (key.isStrong()) {
            // 标记冲突日志，需人工解锁
            auditLog.warn("强标识冲突: {} 被同时绑定在 {} 和 {}", key, sourceId, targetId);
        }
        // 对于弱标识，可忽略
    }
}
```
### 3.4.8.9 缓存重建与事件
所有合并数据持久化后，清理缓存并发出合并事件：  
```java
memberCache.evict(sourceId);
memberCache.evict(targetId);
eventBridge.publish("loyalty-member-events", programCode,
    new MemberMergedEvent(sourceId, targetId, programCode, ZonedDateTime.now()));
```
事件 `MemberMergedEvent` 包含 `sourceMemberId` 和 `targetMemberId`，供各业务引擎刷新状态。
### 3.4.8.10 补偿机制
如果 Saga 中某步失败，应逆序补偿前面成功的步骤，并最终失败记录保存：  
```java
@Transactional
public void compensateMerge(long taskId) {
    MergeTask task = taskRepo.findById(taskId);
    task.setStatus("ROLLBACK");
    task.setCurrentStep("COMPENSATING");
    taskRepo.save(task);
    
    // 示例：逆序恢复优惠券归属
    List<Coupon> coupons = couponRepo.findByMember(task.getTargetId());
    for(Coupon c: coupons) {
        if (c.getMergeTaskId() == taskId) {
            c.setMemberId(task.getSourceId());
            couponRepo.save(c);
        }
    }
    // 依次补偿标签、等级、积分流水等
    // 最后恢复冻结状态
    accountRepo.findByMemberId(task.getTargetId())
               .forEach(ac -> { ac.setAccountStatus("ACTIVE"); accountRepo.save(ac); });
    accountRepo.findByMemberId(task.getSourceId())
               .forEach(ac -> { ac.setAccountStatus("ACTIVE"); accountRepo.save(ac); });
    
    task.setStatus("FAILED");
    taskRepo.save(task);
    
    // 审计和告警
    auditLog.error("会员合并任务 {} 失败并补偿", taskId);
}
```
任何自动执行失败导致的残留问题应生成运维告警、人工核查日志。
### 3.4.8.11 审计日志
新增审计表 `member_merge_audit` 记录合并全程关键数据（操作人、时间、合并前后积分和券数量、结果等）。所有合并动作（手动或自动）应写入。示例结构：  
```sql
CREATE TABLE member_merge_audit (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    source_member_id BIGINT,
    target_member_id BIGINT,
    operator VARCHAR(64),
    status VARCHAR(16),
    points_transferred NUMERIC,
    coupons_transferred INTEGER,
    tiers_transferred TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);
```
> **注意：** 如前所述，**自动合并仅在 MemberMergeTask** 中异步执行，禁止在唯一约束异常或注册流程中同步合并，以避免长事务和死锁。  
***
## 第四章：积分、等级与资产隔离域
### 4.1 积分类型字典
系统中严禁硬编码积分名称，所有资产通过 `point_type_definition` 定义。
平台初始化时，默认向每个 Program 注入以下三种隔离的资产类型：
| 类型代码     | 类型名称  | 用途                  | is_redeemable | is_tier_calc | is_transferable | allow_negative |
| -------- | ----- | ------------------- | -------------- | -------------- | ---------------- | --------------- |
| `REWARD` | 消费积分  | 用户交易累积，可兑换礼品        | true           | false          | true             | false           |
| `TIER`   | 等级成长值 | 只用于计算会员等级，不可消费      | false          | true           | false            | false           |
| `CREDIT` | 授信积分  | 系统授予的信用额度，可透支使用，需归还 | true           | false          | false            | true            |
**授信积分的本质**：它是一种"可使用的负债"。用户兑换时若自有积分不足，可动用信用积分，此时 `credit_used` 增加，之后用户获得新积分时优先偿还信用欠款。
#### 4.1.1 核心风控开关
* `is_redeemable`：可否用于兑换
* `is_tier_calc`：是否计入等级计算
* `is_transferable`：可否转赠
* `allow_negative`：是否允许余额为负
#### 4.1.2 积分流水表
```sql
CREATE TABLE account_transaction (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    operation_key VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    remaining_amount NUMERIC(18, 4),
    expires_at TIMESTAMPTZ,
    rule_id VARCHAR(64),
    rule_snapshot_id VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```
* `remaining_amount`：该笔流水还未被消耗或过期的额度
* `status = 'ACTIVE'` 且 `remaining_amount > 0` 且 `expires_at > NOW()` 三条件同时满足，才属于"可用积分"
**积分查询与汇总（实时计算）**：
```sql
SELECT COALESCE(SUM(remaining_amount), 0)
FROM account_transaction
WHERE member_id = ? AND program_code = ? AND account_type = ?
  AND status = 'ACTIVE' AND remaining_amount > 0 AND expires_at > NOW();
```

### 4.2 被动透支与主动信用冲抵引擎
#### 4.2.1 账户数据结构
`member_account` 表不维护实时余额，仅存储风控参数和累计统计：
* `overdraft_limit`：被动透支底线
* `credit_limit`：主动授信总额
* `credit_used`：已使用的信用额度
* `total_accrued`、`total_redeemed`、`total_expired`：累计统计（只增不减）
#### 4.2.2 瀑布流冲抵伪代码（跨账户版）
```java
@Transactional
public void grantPoints(String programCode, String memberId, String accountType,
                         BigDecimal pointsToGrant, String ruleId, String ruleSnapshotId) {
    // 1. 获取当前积分类型的账户
    MemberAccount rewardAccount = accountRepo.findByMemberIdAndTypeForUpdate(memberId, accountType);
    BigDecimal remainingToGrant = pointsToGrant;
    // 2. 补天窗：冲抵该账户的被动透支
    List<AccountTransaction> overdraftBatches = transactionRepo.findOverdraftBatchesForUpdate(memberId, accountType);
    for (AccountTransaction overdraft : overdraftBatches) {
        if (remainingToGrant.compareTo(BigDecimal.ZERO) <= 0) break;
        BigDecimal debt = overdraft.getRemainingAmount().abs();
        BigDecimal offsetAmount = remainingToGrant.min(debt);
        insertTransaction(memberId, accountType, "REPAYMENT", offsetAmount, null);
        overdraft.setRemainingAmount(overdraft.getRemainingAmount().add(offsetAmount));
        if (overdraft.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0) {
            overdraft.setStatus("SETTLED");
        }
        transactionRepo.save(overdraft);
        remainingToGrant = remainingToGrant.subtract(offsetAmount);
    }
    // 3. 跨账户还信用：检查 CREDIT 账户的信用欠款
    if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
        MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(memberId, "CREDIT");
        if (creditAccount != null && creditAccount.getCreditUsed().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal creditDebt = creditAccount.getCreditUsed();
            BigDecimal offsetAmount = remainingToGrant.min(creditDebt);
            insertTransaction(memberId, "CREDIT", "CREDIT_REPAY", offsetAmount, null);
            creditAccount.setCreditUsed(creditAccount.getCreditUsed().subtract(offsetAmount));
            accountRepo.save(creditAccount);
            remainingToGrant = remainingToGrant.subtract(offsetAmount);
        }
    }
    // 4. 真实入账
    if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
        insertTransaction(memberId, accountType, "ACCRUAL", remainingToGrant,
            calculateExpiryDate(), ruleId, ruleSnapshotId);
    }
    // 5. 更新累计统计
    rewardAccount.setTotalAccrued(rewardAccount.getTotalAccrued().add(pointsToGrant));
    accountRepo.save(rewardAccount);
}
```
#### 4.2.3 冲抵引擎约束
所有操作仅修改 `account_transaction` 的 `remaining_amount` 和 `status`，不更新 `member_account` 的任何余额字段。
### 4.3 FIFO 兑换引擎与精准溯源
#### 4.3.1 先进先出核销伪代码（跨账户版）
```java
@Transactional
public void redeemPoints(String programCode, String memberId, String accountType, BigDecimal pointsToRedeem) {
    // 1. 获取本账户和 CREDIT 账户
    MemberAccount account = accountRepo.findByMemberIdAndTypeForUpdate(memberId, accountType);
    MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(memberId, "CREDIT");
    // 2. 计算总可用额度
    BigDecimal ownBalance = transactionRepo.sumAvailableBalance(memberId, accountType);
    BigDecimal creditAvailable = (creditAccount != null)
        ? creditAccount.getCreditLimit().subtract(creditAccount.getCreditUsed())
        : BigDecimal.ZERO;
    BigDecimal totalAvailable = ownBalance.add(creditAvailable);
    if (totalAvailable.compareTo(pointsToRedeem) < 0) {
        throw new BusinessException("ERR_INSUFFICIENT_POINTS", "积分不足（含信用额度）");
    }
    // 3. 生成核销流水
    AccountTransaction redemptionTx = createRedemptionTransaction(memberId, accountType, pointsToRedeem.negate());
    BigDecimal remaining = pointsToRedeem;
    // 4. 先消耗自有积分
    if (ownBalance.compareTo(BigDecimal.ZERO) > 0) {
        List<AccountTransaction> ownBatches = transactionRepo.findActiveBatchesForUpdate(
            memberId, accountType,
            Sort.by("expiresAt").ascending().and(Sort.by("createdAt").ascending())
        );
        for (AccountTransaction batch : ownBatches) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            // 惰性过期检查
            if (batch.getExpiresAt() != null && batch.getExpiresAt().isBefore(LocalDateTime.now())) {
                markAsExpired(batch);
                continue;
            }
            BigDecimal allocateAmount = remaining.min(batch.getRemainingAmount());
            batch.setRemainingAmount(batch.getRemainingAmount().subtract(allocateAmount));
            if (batch.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0) {
                batch.setStatus("EXHAUSTED");
            }
            transactionRepo.save(batch);
            allocationRepo.save(new Allocation(redemptionTx.getId(), batch.getId(), allocateAmount));
            remaining = remaining.subtract(allocateAmount);
        }
    }
    // 5. 不足部分从 CREDIT 账户扣款
    if (remaining.compareTo(BigDecimal.ZERO) > 0 && creditAccount != null) {
        creditAccount.setCreditUsed(creditAccount.getCreditUsed().add(remaining));
        accountRepo.save(creditAccount);
        insertTransaction(memberId, "CREDIT", "CREDIT_DRAWDOWN", remaining.negate(), null);
    }
}
```
#### 4.3.2 积分过期处理（惰性标记 + 事件驱动）
**严禁使用定时任务批量更新**，过期判定在查询时实时完成：
```java
private void markAsExpired(AccountTransaction batch) {
    batch.setStatus("EXPIRED");
    batch.setRemainingAmount(BigDecimal.ZERO);
    transactionRepo.save(batch);
    eventBridge.publish("loyalty-point-events", batch.getMemberId(),
        new PointsExpiredEvent(batch.getMemberId(), batch.getRemainingAmount(), batch.getId()));
}
```
### 4.4 信用额度授予接口
```java
@Transactional
public void setCreditLimit(String programCode, String memberId, BigDecimal newLimit) {
    MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(memberId, "CREDIT");
    if (creditAccount == null) {
        creditAccount = createCreditAccount(memberId);
    }
    creditAccount.setCreditLimit(newLimit);
    accountRepo.save(creditAccount);
}
```
### 4.5 等级评估双轨制
* **实时升级**：`PointGrantService` 成功后发布 `TierPointAccruedEvent`，`TierEvaluationService` 监听后评估是否升级
* **定时保级降级**：每日凌晨扫描到期会员，不满足保级条件则逐级回退
### 4.6 积分碎片整理与核销分摊明细
```sql
CREATE TABLE redemption_allocation (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    redemption_tx_id BIGINT NOT NULL,
    accrual_tx_id BIGINT NOT NULL,
    allocated_amount NUMERIC(18, 4) NOT NULL
);
```
* 当 `ACTIVE` 批次超过 50 条时，低峰期触发合并任务
* 退款时通过 `redemption_allocation` 精准恢复原始批次的 `expires_at`
***
## 第五章：逆向交易与级联重算域
### 5.1 场景挑战
退款导致"级联重算效应"：退单引发降级 → 后续积分获取比例全部失真。
传统架构痛点：强锁阻塞用户新交易（账户假死）。
### 5.2 异步差额补偿机制
1. **触发退款**：回滚原订单积分
2. **判断级联**：历史成长值跌破升级门槛则生成 `cascade_recalc_job`
3. **影子回放**：异步引擎构建虚拟影子账户，按历史规则快照重放
4. **计算差额**：对比影子结果与真实状态
5. **短事务补偿**：最后一步开启极短数据库事务提交差额
### 5.3 级联重算引擎伪代码
```java
@Scheduled(fixedDelay = 60000)
public void recoverStuckJobs() {
    LocalDateTime timeout = LocalDateTime.now().minusMinutes(5);
    List<CascadeRecalcJob> stuckJobs = jobRepo.findStuckJobs("PROCESSING", timeout);
    for (CascadeRecalcJob job : stuckJobs) {
        if (job.getRetryCount() >= job.getMaxRetryCount()) {
            job.setStatus("FAILED");
            alertService.sendAlert("级联重算任务彻底失败: " + job.getId());
        } else {
            job.setStatus("PENDING");
            job.setRetryCount(job.getRetryCount() + 1);
        }
        jobRepo.save(job);
    }
}
public void processCascadeRecalculation(String recalcJobId, String memberId, LocalDateTime reverseTime) {
    List<TransactionEvent> timelineEvents = eventRepo.findEventsAfter(memberId, reverseTime);
    ShadowContext shadowContext = buildShadowContext(memberId, reverseTime);
    for (TransactionEvent event : timelineEvents) {
        shadowContext.advanceToTime(event.getEventTime());
        String ruleSnapshotId = event.getRuleSnapshotId();
        RuleSnapshot snapshot = snapshotRepo.get(ruleSnapshotId);
        shadowContext.apply(ruleEngine.evaluate(shadowContext, event, snapshot));
    }
    AccountDelta delta = calculateDelta(memberId, shadowContext);
    applyCompensationWithShortTransaction(memberId, delta, recalcJobId);
}
@Transactional
protected void applyCompensationWithShortTransaction(String memberId, AccountDelta delta, String jobId) {
    if (compensationLogRepo.existsByJobId(jobId)) return;
    if (delta.getPointsToDeduct().compareTo(BigDecimal.ZERO) > 0) {
        pointRedeemService.forceDeductWithOverdraft(memberId, delta.getPointsToDeduct(), "CASCADE_RECALC_DEDUCT");
    }
    if (delta.getNewTier() != null) {
        Member member = memberRepo.findByMemberIdForUpdate(memberId);
        if (!member.getTierCode().equals(delta.getNewTier())) {
            String oldTier = member.getTierCode();
            member.setTierCode(delta.getNewTier());
            memberRepo.save(member);
            tierChangeLogRepo.save(new TierChangeLog(memberId, oldTier, delta.getNewTier(), "CASCADE_DOWNGRADE"));
        }
    }
    compensationLogRepo.save(new CompensationLog(jobId, memberId, delta));
    jobRepo.markCompleted(jobId);
}
```
#### 5.3.1 ShadowContext 设计规范
```java
public class ShadowContext {
    private String memberId;
    private List<TierChangeEvent> tierTimeline;
    private String currentTier;
    private BigDecimal shadowBalance;
    public void advanceToTime(LocalDateTime eventTime) {
        this.currentTier = tierTimeline.stream()
            .filter(t -> !t.getChangedAt().isAfter(eventTime))
            .max(Comparator.comparing(TierChangeEvent::getChangedAt))
            .map(TierChangeEvent::getNewTier)
            .orElse(getInitialTier());
    }
    private String getInitialTier() {
        return programConfig.getDefaultTier();
    }
}
```
### 5.4 积分退回与生命周期还原
退款时通过 `redemption_allocation` 表找到原始 `ACCRUAL` 批次，精准恢复其 `expires_at`。若原始批次已过期，系统拦截作废，但可配置 `refund_expired_points_grace_days` 给予宽限期。
### 5.5 负资产与死信处理
逆向扣减超过 `overdraft_limit` 时：
* 停止扣减，只扣至透支极限
* 生成追偿工单（`negative_pending` 表）
* 标记用户 `SUSPENDED_REDEMPTION`，禁止兑换直至补齐债务
***
## 第六章：规则引擎、沙箱与自动化回归
### 6.1 规则引擎基础架构
* **无状态会话**：每次推理创建全新 `StatelessKieSession`，执行完毕立刻释放
* **KieBase 缓存热替换**：按 Program 级别缓存，发布新规则时原子替换引用
* **隔离的动作收集器**：DRL 中禁止直接调用 JPA/SQL
#### 6.1.1 动作执行器
```java
@Service
public class RewardExecutor {
    @Autowired private PointGrantService pointGrantService;
    @Autowired private TierEvaluationService tierService;
    @Transactional
    public void executeRewards(String memberId, List<Action> actions) {
        for (Action action : actions) {
            if (action instanceof AwardPointsAction award) {
                pointGrantService.grantPoints(award.getProgramCode(), memberId,
                    award.getAccountType(), award.getPoints(), award.getRuleId(), award.getRuleSnapshotId());
            } else if (action instanceof UpgradeTierAction upgrade) {
                tierService.upgrade(memberId, upgrade.getNewTier(), upgrade.getReason());
            } else if (action instanceof DowngradeTierAction downgrade) {
                tierService.downgrade(memberId, downgrade.getNewTier(), downgrade.getReason());
            }
        }
    }
}
```
#### 6.1.2 KieBase 原子热替换
```java
@Component
@Slf4j
public class KieBaseCacheManager {
    private final ConcurrentHashMap<String, AtomicReference<KieBase>> cache = new ConcurrentHashMap<>();
    public KieBase getKieBase(String programCode) {
        AtomicReference<KieBase> ref = cache.get(programCode);
        if (ref == null) {
            synchronized (this) {
                ref = cache.get(programCode);
                if (ref == null) {
                    KieBase kieBase = buildKieBase(programCode);
                    ref = new AtomicReference<>(kieBase);
                    cache.put(programCode, ref);
                }
            }
        }
        return ref.get();
    }
    public void refreshKieBase(String programCode) {
        KieBase newKieBase = buildKieBase(programCode);
        AtomicReference<KieBase> ref = cache.computeIfAbsent(programCode, k -> new AtomicReference<>());
        KieBase oldKieBase = ref.getAndSet(newKieBase);
        log.info("Program [{}] KieBase 已热更新", programCode);
    }
    private KieBase buildKieBase(String programCode) {
        List<Rule> activeRules = ruleRepo.findActiveByProgramCode(programCode);
        KieServices kieServices = KieServices.Factory.get();
        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();
        for (Rule rule : activeRules) {
            String drlPath = "src/main/resources/rules/" + programCode + "/" + rule.getRuleId() + ".drl";
            kieFileSystem.write(drlPath, rule.getDrlContent());
        }
        KieBuilder kieBuilder = kieServices.newKieBuilder(kieFileSystem);
        kieBuilder.buildAll();
        if (kieBuilder.getResults().hasMessages(Message.Level.ERROR)) {
            throw new RuleCompileException("规则编译失败: " + kieBuilder.getResults().getMessages());
        }
        KieContainer kieContainer = kieServices.newKieContainer(kieServices.getRepository().getDefaultReleaseId());
        return kieContainer.getKieBase();
    }
}
```
**并发安全保证**：
* 严禁将 KieBase 直接存储在普通成员变量中
* 严禁使用 synchronized 包裹推理执行逻辑
* 必须使用 AtomicReference 管理 KieBase 引用
### 6.2 AI 辅助规则生成
系统允许运营人员通过自然语言生成 Drools 规则。后端自动收集当前 Program 的生产环境状态拼接成 System Prompt，要求 LLM 输出标准化 JSON 结构（含 DRL 代码、推荐优先级、测试用例）。
### 6.3 影子沙箱与自动化回归
* **数据源**：AI 模拟用例 + 生产环境历史切片（7 天内 500 条真实流水）
* **双 KieSession 验证**：基线引擎（仅线上老规则） vs 候选引擎（老规则 + 新草稿），对比输出差异
### 6.4 弱阻断与强制放行机制
* **绿色**：通过，常规提交
* **黄色**：轻微规则遮蔽，允许提交
* **红色**：严重冲突，需强制放行（传入 `forceOverride=true` + `overrideReason`），审批流升级为双人会签
***
## 第七章：全渠道会员通 SPI 统一接入与异构映射引擎
### 7.1 SPI 架构的本质与挑战
第三方平台通过 Webhook 调用 SaaS 平台接口，面临三大挑战：激进重试策略、严苛 HTTP 状态码要求、1:N 异构数据转换。
### 7.2 Unified SPI Gateway
标准路径：`POST /api/open/spi/{channel}/{programCode}/{action}`
#### 7.2.1 策略模式接口
```java
public interface ChannelSpiHandler {
    String getChannelCode();
    boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config);
    Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config);
    Object buildErrorResponse(Exception e);
}
```
#### 7.2.2 网关 Controller
```java
@RestController
@RequestMapping("/api/open/spi/{channel}/{programCode}")
@Slf4j
public class SpiGatewayController {
    @Autowired private SpiHandlerFactory handlerFactory;
    @PostMapping("/{action}")
    public ResponseEntity<Object> handleSpi(@PathVariable String channel, @PathVariable String programCode,
                                            @PathVariable String action, HttpServletRequest request) {
        byte[] rawBody = readBody(request);
        ChannelSpiHandler handler = handlerFactory.getHandler(channel);
        ChannelAdapterConfig config = configService.getValidConfig(programCode, channel);
        if (!handler.verifySignature(request, rawBody, config)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Signature Invalid");
        }
        CompletableFuture<Object> future = CompletableFuture.supplyAsync(() ->
            handler.handleAction(action, programCode, rawBody, config), spiThreadPool);
        try {
            Object spiResponse = future.get(2000, TimeUnit.MILLISECONDS);
            return ResponseEntity.ok(spiResponse);
        } catch (TimeoutException te) {
            return ResponseEntity.ok(handler.buildErrorResponse(new BusinessException("TIMEOUT")));
        } catch (Exception e) {
            return ResponseEntity.ok(handler.buildErrorResponse(e));
        }
    }
}
```
#### 7.2.3 抖音会员通特殊处理
抖音会员通基于小程序实现，与天猫/京东的 Webhook 模式不同：
- 用户标识通过小程序授权获取（openId + 掩码手机号）
- 完整手机号需调用抖音验证接口（商家提供明文，抖音返回是否匹配）
- `DouyinSpiHandler` 支持两种 action：
  - `register`：初次注册，传入 openId + 掩码手机号
  - `verify_mobile`：手机号验证，传入 openId + 完整手机号
**DOUYIN_OPENID** 作为渠道内强标识，可直接匹配已有会员。
**DOUYIN_MOBILE_MASK** 仅存储备查，不参与匹配。
验证后的完整手机号以 `MOBILE_PLAIN` 类型写入 `member_unique_key`，作为跨渠道强标识。
写入时若触发唯一约束冲突，自动执行会员合并。
### 7.3 双轨制映射引擎
* **模式一：可视化连线 (VISUAL)**：通过 JSONPath 配置字段映射
* **模式二：高级脚本转换 (SCRIPT)**：利用 GraalVM JS 引擎处理复杂聚合运算
#### 7.3.1 GraalVM 脚本安全沙箱
严格限制：`allowAllAccess(false)`、`allowHostAccess(NONE)`、`allowIO(false)`、`allowNativeAccess(false)`，执行超时 50ms。
#### 7.3.2 FIFO 大规模优化
**背景**：积分批次数量大时，传统逐批扣减消耗陷入性能瓶颈；锁表事务长。
**数据结构**：维护**扫描游标**避免全表扫描：  
```sql
CREATE TABLE member_fifo_cursor (
    tenant_id VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    last_tx_id BIGINT NOT NULL DEFAULT 0,  -- 上次扫描结束的流水ID
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, member_id)
) PARTITION BY LIST (tenant_id);
```
- `last_tx_id` 记录此会员上次使用积分时消费到哪笔流水。
**优化算法**：每次扣减时，分段加载批次：  
1. 使用游标获取上次位置：  
   ```java
   Long lastId = cursorRepo.findLastTxId(tenantId, memberId);
   List<AccountTransaction> batches = transactionRepo.findActiveBatchesAfterId(
       tenantId, memberId, accountType, lastId,
       Sort.by("expires_at").asc().and(Sort.by("created_at").asc()),
       PageRequest.of(0, BATCH_FETCH_SIZE)
   );
   ```
   查询条件：`id > lastId` + `status='ACTIVE'` + `remaining_amount>0` + `expires_at>NOW()`。  
2. 对加载的批次按过期/先进顺序进行扣减。  
3. 扣减后，如果当前批次未用完，更新游标到该批次的ID；否则跳到下一批次继续。  
4. 每次扣减结束后更新`member_fifo_cursor.last_tx_id`。  
5. 通过SQL `SKIP LOCKED` 支持并发：在查询时加`FOR UPDATE SKIP LOCKED`，使多个线程安全并行处理不同会员或同一会员不重叠区域。
**伪代码**：  
```java
@Transactional
public void redeemPoints(String tenantId, String memberId, String accountType, BigDecimal points) {
    MemberAccount account = accountRepo.findForUpdate(tenantId, memberId, accountType);
    BigDecimal remaining = points;
    // 获取上次游标
    Long lastCursor = cursorRepo.findLastTxId(tenantId, memberId);
    // 分批查询
    while (remaining.compareTo(BigDecimal.ZERO) > 0) {
        List<AccountTransaction> batches = transactionRepo.findActiveAfter(
            tenantId, memberId, accountType, lastCursor, 100, Sort.asc("expires_at","created_at")
        );
        if (batches.isEmpty()) break;
        for (AccountTransaction batch : batches) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal deduct = remaining.min(batch.getRemainingAmount());
            batch.setRemainingAmount(batch.getRemainingAmount().subtract(deduct));
            if (batch.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0) {
                batch.setStatus("EXHAUSTED");
                lastCursor = batch.getId();
            }
            transactionRepo.save(batch);
            allocationRepo.save(new Allocation(redemptionTx.getId(), batch.getId(), deduct));
            remaining = remaining.subtract(deduct);
        }
        cursorRepo.saveOrUpdate(tenantId, memberId, lastCursor);
    }
    // ... Credit overdraft logic ...
}
```
- **收益**：不再从0开始扫描，且游标持久化后续可继续，批次索引+分页减少 I/O。  
- **注意**：需对`account_transaction`建索引 `(member_id, account_type, status, expires_at, id)` 以加速分页扫描。
## 运维与监控
- **合并任务监控**：监控 `member_merge_task` 表中新任务速率、失败率、平均完成时长。告警：任务长时间挂起或失败率过高。  
- **快照一致性**：对比定时校准前后余额差异量，若超阈值发告警。  
- **幂等记录命中率**：监控幂等命中vs.新建记录比例，发现重复请求高值需查原因。  
- **Kafka 延迟**：监控同一分区消息处理延迟，保持低于业务SLA。  
- **FIFO 扫描效率**：监控长队任务中游标表增速及批次扫描时长，避免热点会员。
## 测试用例 / 回归验证
- **账户快照**：插入已知积分批次，验证 snapshot 精度与 SUM() 一致；故意删除快照数据后查询余额验证自动重算效果；批量导入流水后校验是否触发正确更新。
- **会员合并**：构造两会员场景：来源有多个分批、等级、优惠券，目标为不同等级。运行合并Saga，验证最终目标余额与来源+目标余额一致，来源会员状态=MERGED，所有相关表记录正确迁移。模拟合并中断（异常抛出）验证执行补偿逻辑能恢复到初始状态。
- **幂等中心**：并发发送同一个 idempotency_key 的请求，验证仅执行一次下游逻辑，并返回相同响应；测试超时重试、失败后重试等场景，保证结果唯一性。
- **消息顺序**：通过多线程模拟并行发送同一会员的多事件，验证消费端按发送顺序序列化处理（使用partitionKey一致）。
- **FIFO 优化**：为单会员生成大批次（如1000+），分别进行一次性和分多次扣减，比较延迟；模拟库存不足错误，验证游标更新和残余金额正确。
### 7.4 事件标准化生命周期与死信处理
`event_inbox` 状态机：`RECEIVED → VALIDATING → VALIDATED → PROCESSING → COMPLETED`（失败则进入 `TRANSFORM_FAILED → RETRYING → DEAD`）。
### 7.5 映射配置器与 Schema 编辑器后端 API
#### 7.5.1 映射配置器相关 API
| API | 方法 | 说明 |
|-----|------|------|
| `/api/admin/channels` | GET | 获取当前 Program 的所有渠道列表及其映射状态 |
| `/api/admin/channels/{channel}` | GET | 获取指定渠道的映射配置（transform_script + field_mappings） |
| `/api/admin/channels/{channel}` | PUT | 保存指定渠道的映射脚本和字段映射配置 |
| `/api/admin/channels/{channel}/test` | POST | 测试映射（输入示例源 JSON，GraalVM 沙箱执行，返回转换结果） |
#### 7.5.2 Schema 编辑器相关 API
| API | 方法 | 说明 |
|-----|------|------|
| `/api/admin/schemas/{entityType}/current` | GET | 获取当前 ACTIVE 版本的最新 Schema |
| `/api/admin/schemas/{entityType}/draft` | POST | 保存草稿（status=DRAFT） |
| `/api/admin/schemas/{entityType}/publish` | POST | 发布新版本 Schema（生成新版本号，旧版本→DEPRECATED） |
| `/api/admin/schemas/{entityType}/versions` | GET | 获取版本历史列表 |
| `/api/admin/schemas/{entityType}/versions/{version}` | GET | 获取指定版本的 Schema |
| `/api/admin/schemas/{entityType}/rollback` | POST | 回滚到指定版本 |
| `/api/admin/schemas/{entityType}/deprecate-field` | POST | 废弃字段（含 DRL 引用检查） |
#### 7.5.3 存储说明
**映射配置存储**：每个渠道的映射配置存储在 `channel_adapter_config` 表：
```sql
UPDATE channel_adapter_config 
SET transform_script = 'function transform(source) { ... }',
    mapping_mode = 'SCRIPT'
WHERE program_code = ? AND channel = ?;
```
Schema 存储：存储在 program_schema 表：
```sql
CREATE TABLE program_schema (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    version VARCHAR(16) NOT NULL,
    field_schema JSONB NOT NULL,
    entity_relations JSONB,
    api_config JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, entity_type, version)
);
```
| 字段                 | 说明                                    |
| ------------------ | ------------------------------------- |
| `field_schema`     | Schema 编辑器产出的 Formily 可消费 JSON Schema |
| `entity_relations` | 业务实体到系统实体的映射关系                        |
| `api_config`       | API 实体的路由和校验配置                        |
#### 7.5.4 系统内部固定流程
以下流程为后端代码固定实现，不在可视化配置范围内：
```text
API 请求 → SpiGatewayController 接收
  → 映射脚本转换（GraalVM 沙箱执行 transform_script）
  → TransactionEvent 标准化
  → One-ID 匹配（member_unique_key 查询）
  → 规则引擎推理（Drools DRL）
  → PointGrantService 发放积分（瀑布流冲抵）
  → TierEvaluationService 评估等级
  → EventBridge 发布事件
```
***
## 第八章：管理界面设计与前端规范
### 8.1 总体思路与前端设计哲学
#### 8.1.1 Schema-Driven UI 架构
运营人员对"活动规则"和"会员属性"的调整频率极高。如果每增加一个会员字段都要经历"后端修改 DB → 前端修改代码 → 打包发版"的周期，将严重降低业务响应速度。本系统采用 **Schema-Driven UI** 架构。
前端界面分为两层：
* **设计器态**：管理员通过 Schema 编辑器定义动态属性的 JSON Schema，通过映射配置器定义 API 字段到系统字段的转换规则。配置结果保存为 JSON Schema 和 GraalVM 脚本。
* **运行态**：前端界面根据后端下发的 JSON Schema 自动渲染表单、列表或详情页。SPI 网关根据映射脚本自动转换外部数据。
#### 8.1.2 两个核心设计工具
| 工具             | 解决的问题                                                 | 技术                 |
| -------------- | ----------------------------------------------------- | ------------------ |
| **Schema 编辑器** | 定义会员扩展属性（`ext_attributes`）和交易扩展数据（`payload`）的 JSON 结构 | JsonSea + 属性面板     |
| **映射配置器**      | 定义 API 实体字段 → 系统实体字段的映射关系                             | Monaco 脚本编辑器 + 映射表 |
两者独立运行，数据流向清晰：
```text
Schema 编辑器 → 定义 ext_attributes/payload 结构 → 会员详情页 Formily 渲染
                                                  → 规则引擎 DRL 引用
映射配置器 → 定义 API→系统字段映射 → SPI 网关接收数据时自动转换
```
> **注意**：系统内部固定流程（One-ID 匹配 → 积分计算 → 等级评估 → 事件发布）不在可视化配置范围内，由后端代码实现。
#### 8.1.3 前端设计哲学
* **纯白底色**：全站统一 `#ffffff` 背景，无灰色背景区
* **黑线条风格**：按钮、图标、边框统一使用 `#1a1a1a`
* **点击编辑**：列表项默认显示文字，点击才出现输入框，减少视觉噪音
* **单行布局**：列表行所有元素在一个 flex 行内，不换行，超出横向滚动
***
### 8.2 全局设计语言
#### 8.2.1 色彩体系
| 用途    | 色值                              | 说明                     |
| ----- | ------------------------------- | ---------------------- |
| 页面背景  | `#ffffff`                       | 纯白底，全站统一               |
| 主文字   | `#1a1a1a`                       | 标题、正文                  |
| 辅助文字  | `#666666`                       | 描述性文字                  |
| 弱化文字  | `#999999`                       | 提示、占位                  |
| 禁用/分隔 | `#bbbbbb` / `#cccccc`           | 不可用状态、浅分隔              |
| 分割线   | `#e0e0e0`                       | 列表行间分割                 |
| 卡片边框  | `#e8e8e8`                       | 内容卡片边框                 |
| 输入框边框 | `#e0e0e0`                       | 默认态；focus 变为 `#1a1a1a` |
| 主按钮   | `#1a1a1a`（黑底白字）                 | 实心操作按钮                 |
| 次按钮   | `#ffffff` + `1px solid #d9d9d9` | 空心操作按钮                 |
#### 8.2.2 字体规范
| 项目    | 值                                                                   |
| ----- | ------------------------------------------------------------------- |
| 字体族   | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| 标题    | 24-28px, weight 700, `#1a1a1a`                                      |
| 卡片标题  | 19px, weight 600                                                    |
| 正文    | 14-15px, `#666666`                                                  |
| 标签/辅助 | 13px, weight 500                                                    |
| 小字    | 11-12px, `#999999`                                                  |
#### 8.2.3 圆角与间距
| 元素         | 圆角           |
| ---------- | ------------ |
| 卡片         | 12px         |
| 按钮         | 10px         |
| 输入框        | 8px          |
| 开关(Toggle) | 12px (44×24) |
| 标签(Tag)    | 4px          |
* 列表行间距：`padding: 10-12px 0` + `border-bottom: 1px solid #e0e0e0`
* 卡片内边距：`24px 28px`
* 组件间 gap：`10px`
#### 8.2.4 按钮规范
```css
/* 主按钮 — 实心黑底白字 */
height: 42px; padding: 0 28px; background: #1a1a1a;
border: none; border-radius: 10px; color: #ffffff;
font-size: 15px; font-weight: 500;
/* 次按钮 — 空心黑框白底 */
height: 42px; padding: 0 28px; background: #ffffff;
border: 1px solid #d9d9d9; border-radius: 10px; color: #1a1a1a;
font-size: 15px; font-weight: 500;
/* hover — 反转 */
主按钮: opacity: 0.85
次按钮: background: #1a1a1a; color: #ffffff
```
#### 8.2.5 输入框规范
```css
height: 42px; padding: 0 14px;
border: 1px solid #e0e0e0; border-radius: 8px;
font-size: 15px; color: #1a1a1a; background: #ffffff;
/* focus: border-color → #1a1a1a */
```
#### 8.2.6 Toggle 开关
```css
width: 44px; height: 24px; border-radius: 12px;
/* ON: background #1a1a1a, dot left 22px */
/* OFF: background #e0e0e0, dot left 2px */
dot: width 20px; height 20px; background #ffffff; border-radius 50%;
```
#### 8.2.7 图标规范
* 全部使用**自定义 SVG 纯线条图标**
* 统一规格：`stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"`
* 尺寸：步进箭头 20×20，步骤图标 24×24，按钮箭头 16×16
#### 8.2.8 前端技术栈
| 层级        | 技术                                                                 |
| --------- | ------------------------------------------------------------------ |
| 核心框架      | React 18 + TypeScript + Vite                                       |
| UI 组件库    | Ant Design 5                                                       |
| 动态表单      | Formily 2.x (`@formily/core` + `@formily/react` + `@formily/antd`) |
| Schema 编辑 | JsonSea（树形 JSON Schema 编辑器）                                        |
| 代码编辑      | Monaco Editor（映射脚本编辑、DRL 编辑）                                       |
| 状态管理      | Zustand                                                            |
| HTTP 客户端  | axios                                                              |
| 路由        | React Router v6                                                    |
> **注意**：已废弃 ChartDB 和 React Flow。Schema 编辑器使用 JsonSea，映射配置器使用 Monaco Editor。
***
### 8.3 布局架构
#### 8.3.1 页面路由结构
```text
/login              → 独立页面（无菜单）
/onboarding         → 独立页面（无菜单，全屏引导）
/                   → AppShell 包裹（顶部菜单 + 内容区 + 底栏）
  /dashboard        → 仪表盘
  /members          → 会员列表
  /members/:id      → 会员详情
  /schema-editor    → Schema 编辑器
  /mapping-config   → 映射配置器
  /rules            → 规则列表
  /rules/new        → 规则编辑器
  /channels         → 渠道列表
  /system/*         → 系统设置各页
```
#### 8.3.2 AppShell 布局
```text
┌──────────────────────────────────────────────────────────┐
│ [Logo] 数据建模  会员服务  规则引擎  设置   PROG001  🔔 👤 │ ← Header 56px
├──────────────────────────────────────────────────────────┤
│                                                          │
│              内容区 (max-width: 1400px)                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 当前俱乐部: PROG001          环境: DEV | v1.0.0           │ ← Footer 32px
└──────────────────────────────────────────────────────────┘
```
* Header：白色底，`border-bottom: 1px solid #f0f0f0`，`box-shadow: 0 1px 4px rgba(0,0,0,0.04)`
* 菜单：`mode="horizontal"`，`triggerSubMenuAction="hover"`
* Footer：白色底，顶部 `1px solid #f0f0f0` 分割
#### 8.3.3 菜单结构
| 一级菜单 | 路由                | 说明                                         |
| ---- | ----------------- | ------------------------------------------ |
| 数据建模 | `/schema-editor`  | Schema 编辑器（会员属性 / 交易数据）                    |
|      | `/mapping-config` | 映射配置器（渠道字段映射）                              |
| 会员服务 | `/members`        | 会员列表                                       |
| 规则引擎 | `/rules`          | 规则列表                                       |
| 设置   | `/system/*`       | 积分类型、等级设置、渠道列表、脚本工作台、角色权限、操作日志、SPI 日志、租户审计 |
#### 8.3.4 前端路由配置
typescript
```
const routes = [
  { path: '/login', element: <Login /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/', element: <AppShell />, children: [
    { path: '/dashboard', element: <Dashboard /> },
    { path: '/members', element: <MemberList /> },
    { path: '/members/:id', element: <MemberDetail /> },
    { path: '/schema-editor', element: <SchemaEditor /> },
    { path: '/mapping-config', element: <MappingConfig /> },
    { path: '/rules', element: <RuleList /> },
    { path: '/rules/new', element: <RuleEditor /> },
    { path: '/channels', element: <ChannelList /> },
    { path: '/system/*', element: <SystemSettings /> },
  ]},
];
```
#### 8.3.5 全局状态管理（Zustand Store）
typescript
```
interface AppStore {
  currentProgramCode: string;
  programs: Program[];
  setCurrentProgram: (code: string) => void;
  user: UserInfo | null;
  permissions: string[];
  setUser: (user: UserInfo, permissions: string[]) => void;
  hasPermission: (perm: string) => boolean;
  online: boolean;
}
```
* 切换 Program 时，清空所有缓存列表数据，触发全局 `key` 变化强制重渲染
* 列表页筛选条件同步到 URL query params，支持浏览器前进/后退和书签
#### 8.3.6 API 层封装
* axios 实例，baseURL: `/api`
* 请求拦截器自动注入 `X-Program-Code`（从 Zustand store 读取）、`X-Trace-Id`（自动生成）、`Authorization`（JWT Token）
* 响应拦截器统一处理 `ApiResponse`，401 跳转登录
***
### 8.4 核心组件模式
#### 8.4.1 ClickToEditText（点击编辑文字）
* **显示态**：文字 + `border-bottom: 1px dashed #d9d9d9` 虚线提示可编辑
* **编辑态**：点击后原地变为 `<input>`，自动聚焦全选
* **确认**：Enter 或 onBlur 退出编辑
* **宽度**：通过 `style.width` 固定列宽，`overflow: hidden; text-overflow: ellipsis`
#### 8.4.2 ClickToEdit（点击编辑数值）
同 ClickToEditText，但输入框为 `type="number"`，可带单位后缀。
#### 8.4.3 ClickToEditSelect（点击编辑下拉）
* **显示态**：文字 + 虚线（显示当前选项的 label）
* **编辑态**：点击后变为 `<select>`，选择后自动退出编辑
#### 8.4.4 PageWrapper（页面容器）
```tsx
<PageWrapper loading={loading} error={error} isEmpty={!data?.length}
  emptyText="暂无数据" onRetry={fetchData}>
  {children}
</PageWrapper>
```
* `loading` → Spin
* `error` → Result + 重试按钮
* `empty` → Empty 组件
* 正常 → 渲染 children
#### 8.4.5 StatCard（统计卡片）
```tsx
<StatCard title="会员总数" value={12345} prefix={<Icon />} trend={12} trendLabel="较昨日" />
```
#### 8.4.6 页面通用规范
**表格行**：
```css
padding: 10px 0;
border-bottom: 1px solid #e0e0e0;
display: flex; align-items: center; gap: 10px;
overflow-x: auto;
```
* 所有列 `flex-shrink: 0` 防止压缩
* 删除按钮 `margin-left: auto` 推到最右
* `×` 按钮：灰色 `#cccccc`，无背景无边框
**卡片容器**：
```css
border: 1px solid #e8e8e8; border-radius: 12px;
padding: 24px 28px; background: #ffffff;
max-height: calc(100vh - 280px); overflow: auto;
```
**标题栏**：
```css
font-size: 19px; font-weight: 600; color: #1a1a1a;
display: flex; align-items: center; gap: 10px;
```
**添加文字链接**：
```css
font-size: 13px; color: #999999; cursor: pointer;
border-bottom: 1px dashed #d9d9d9; padding: 2px 0;
/* hover: color → #1a1a1a */
```
***
### 8.5 登录页面
```text
        [Logo SVG]
    忠诚度管理平台
  Loyalty SaaS Platform
  [👤 用户名        ]
  [🔑 密码          ]
      [🔒 登 录]
    默认账号: admin / admin123
```
* 全屏居中，纯白底
* 自定义 SVG 图标（锁、用户、钥匙）
* 输入框：灰色底 `#fafafa`，focus 白底 + 黑边框
* 按钮：黑底白字 44px 高
* 当前为开发模式，点击直接登录
***
### 8.6 新用户引导流程 (Onboarding)
设计为 **3 步顺序向导**，全屏独立页面，无顶部菜单。
#### 8.6.1 页面布局
```text
        ①         ②         ③
    俱乐部设置 → 积分类型设置 → 等级设置
    ━━━━━━━━
┌─────────────────────────────────────┐
│ 🧩 俱乐部设置                        │
│ 俱乐部是忠诚度计划的基础容器...        │
│                                     │
│ 俱乐部代码 *  [________]             │
│ 显示名称 *    [________]             │
│ 描述          [________]             │
│                                     │
│              [保存并继续 →]          │
└─────────────────────────────────────┘
```
* 步骤编号：40px 圆形，active 黑框白底黑字，done 黑底白勾
* 步骤间：20px 箭头 `────>`
* 步骤标签下方：`40px 宽 2px 深灰线` 标识当前步骤
* 内容卡片：`max-width: 720px 居中`，`max-height: calc(100vh - 280px) overflow: auto`
#### 8.6.2 Step 1 — 俱乐部设置
* 表单字段：俱乐部代码（必填）、显示名称（必填）、描述（可选）
* 按钮：`保存并继续 →`（黑底白字，含箭头图标）
* 保存时调用 `POST /api/admin/programs`
#### 8.6.3 Step 2 — 积分类型设置
**行结构（单行 flex）**：
```text
[名称] [代码] [类型▼] [配置项...] [×删除]
```
**类型下拉选项**：
| 选项 | 配置项                               |
| -- | --------------------------------- |
| 兑换 | 负分（开关 → 单次/上限）+ 可见 + 有效期（数值 + 模式） |
| 等级 | 可见 + 有效期（数值 + 模式）                 |
| 信用 | 仅额度可编辑（其他锁定）                      |
**有效期模式**：固定天数 / 自然月 / 自然年（0 = 永不过期）
**默认预设 3 种**：
| typeCode | 名称    | 类型 | 配置           |
| -------- | ----- | -- | ------------ |
| REWARD   | 消费积分  | 兑换 | 可见，有效期 1 自然年 |
| TIER     | 等级成长值 | 等级 | 可见，有效期 0（永久） |
| CREDIT   | 授信积分  | 信用 | 额度 5000 分    |
**交互**：
* 名称/代码：ClickToEditText
* 类型：`<select>` 下拉
* 有效期值/额度：ClickToEdit
* 有效期模式：ClickToEditSelect
* 负分/可见：Toggle 开关
* 删除：`×` 按钮
* 添加：`+ 添加积分类型` 文字链接
#### 8.6.4 Step 3 — 等级设置
**行结构（单行 flex）**：
```text
[代码] [名称] [关联积分▼] 成长值 [min] — [max] 有效期 [val] [模式] 顺序 N [×]
```
**关联积分下拉**：仅显示 `is_tier_calc = true` 的积分类型
**默认预设 4 个等级**：BASE → SILVER → GOLD → PLATINUM，关联 TIER 类型
**交互**：全部使用 ClickToEdit/ClickToEditSelect
#### 8.6.5 完成页
```text
        ✅ 基础设置完成！
   俱乐部、积分类型、等级已配置完毕
        [进入仪表盘 →]
```
***
### 8.7 映射配置器
映射配置器用于定义 **API 实体字段 → 系统实体字段** 的映射关系。当商户新接入一个渠道（如拼多多），只需在此配置映射规则，无需修改后端代码。系统内部固定流程（One-ID 匹配 → 积分计算 → 等级评估 → 事件发布）不在本工具的可视化配置范围内。
#### 8.7.1 整体布局
```text
┌──────────────────────────────────────────────────────────────┐
│ 映射配置器                                    [保存] [测试映射] │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  渠道列表   │              映射配置区                         │
│            │                                                 │
│  天猫 ●    │  ┌───────────────────────────────────────────┐ │
│  京东 ●    │  │ 渠道: 天猫                                  │ │
│  抖音 ●    │  │ 系统实体: TransactionEvent                 │ │
│  微信 ●    │  │ 映射方式: [等值映射] [路径映射] [脚本映射]   │ │
│  唯品会 ●  │  │                                           │ │
│  POS   ●  │  │ ─────── 路径映射表 ───────                  │ │
│            │  │                                           │ │
│ [+ 新增]   │  │ 源字段(OrderRequest)  目标字段路径          │ │
│            │  │ tradeNo           →  idempotent_key  [自动]│ │
│            │  │ tradeTime         →  event_time      [自动]│ │
│            │  │ channelType       →  channel         [自动]│ │
│            │  │ totalPrice        →  payload.order_info   │ │
│            │  │                     .amounts.total_price   │ │
│            │  │ [+ 添加映射行]                              │ │
│            │  │                                           │ │
│            │  │ ─────── 脚本补充（Monaco Editor）───────    │ │
│            │  │ function transform(source, context) {      │ │
│            │  │   const base = applyFieldMappings(source); │ │
│            │  │   base.event_type = mapOrderType(          │ │
│            │  │     source.orderType);                     │ │
│            │  │   return base;                             │ │
│            │  │ }                                          │ │
│            │  │                                           │ │
│            │  │ ─────── 预览 ───────                       │ │
│            │  │ [输入示例JSON] → [预览转换结果]              │ │
│            │  └───────────────────────────────────────────┘ │ │
│            │                                                 │
│            │  系统流程（固定，仅供参考）:                       │
│            │  API → 映射 → One-ID → Drools → 积分 → 等级      │
└────────────┴─────────────────────────────────────────────────┘
```
#### 8.7.2 渠道列表
左侧展示所有已接入的渠道，点击切换查看对应渠道的映射配置。绿色圆点表示已配置映射，灰色圆点表示未配置。
| 渠道        | 状态    | 映射方式   |
| --------- | ----- | ------ |
| 天猫        | ● 已配置 | SCRIPT |
| 京东        | ● 已配置 | SCRIPT |
| 抖音        | ● 已配置 | SCRIPT |
| 微信        | ● 已配置 | PATH   |
| POS       | ● 已配置 | PATH   |
| [+ 新增渠道] |       |        |
点击 [+ 新增渠道] 弹出渠道配置表单（渠道标识、名称、认证方式、密钥等），保存后在 `channel_adapter_config` 表创建记录。
#### 8.7.3 映射配置
选中渠道后，右侧展示该渠道的映射配置：
**等值映射**：系统自动匹配同名字段（如 `tradeNo` → `idempotent_key`），标记为 [自动]。用户可删除或修改。
**路径映射**：手动配对源字段路径 → 目标字段路径。源字段和路径从系统实体的 Schema 中自动补全。支持嵌套路径（如 `payload.order_info.amounts.total_price`）。
**脚本补充**：Monaco Editor 嵌入，处理等值映射和路径映射无法覆盖的特殊逻辑（如 `orderType` → `event_type` 的枚举转换）。等值映射和路径映射的结果自动生成脚本代码骨架，用户只需补充特殊逻辑。
#### 8.7.4 预览测试
输入示例源 JSON → 点击 [测试映射] → 调用后端 GraalVM 沙箱执行脚本 → 右侧展示转换后的目标 JSON。错误时显示详细错误信息和行号。
#### 8.7.5 存储
每个渠道的映射配置存储在 `channel_adapter_config` 表：
```sql
-- transform_script 存储完整的 GraalVM 映射脚本
-- field_mappings 存储等值映射和路径映射的配置（JSONB）
-- mapping_mode 标识映射方式：VISUAL / SCRIPT
- `transform_script`：完整的 GraalVM 映射脚本
- `field_mappings`（JSONB）：等值映射和路径映射的配置
- `mapping_mode`：映射方式（VISUAL / SCRIPT）
```
***
### 8.8 Schema 编辑器
Schema 编辑器用于定义**会员扩展属性（`ext_attributes`）和交易扩展数据（`payload`）的 JSON 结构**。不同行业的商户可以自定义字段，如美妆行业需要"肤质"、汽车行业需要"车牌号"。定义的 Schema 被 Formily 动态表单消费，实现前端自动渲染。
#### 8.8.1 整体布局
```text
┌──────────────────────────────────────────────────────────────┐
│ Schema 编辑器                          [保存草稿] [发布] [版本] │
├──────────────────────┬───────────────────────────────────────┤
│                      │                                       │
│  实体选择器           │  Schema 编辑区（JsonSea）               │
│                      │                                       │
│ [会员ext_attributes] │  ▼ amounts (object)                   │
│ [交易payload]        │    ├─ total_price (number) > 0       │
│ [+ 新建业务实体]      │    └─ trade_price (number) > 0       │
│                      │  ▼ products (array)                   │
│                      │    └─ [item]                          │
│                      │        ├─ commodity_code (string) ✅  │
│                      │        ├─ price (number)      > 0    │
│                      │        └─ quant (number)      ≥ 1   │
│                      │                                       │
│                      │  [+ 添加字段]                          │
│                      │                                       │
│                      │  右侧面板（选中字段时）:                 │
│                      │  ┌─────────────────────────────┐     │
│                      │  │ 字段名: total_price          │     │
│                      │  │ 类型:    [number ▼]          │     │
│                      │  │ 标题:    订单总金额           │     │
│                      │  │ 必填:    [开关]              │     │
│                      │  │ 最小值:  0.01                │     │
│                      │  │ x-component: [NumberPicker]  │     │
│                      │  │ x-reactions: [联动构建器]    │     │
│                      │  │ deprecated: [开关]           │     │
│                      │  └─────────────────────────────┘     │
└──────────────────────┴───────────────────────────────────────┘
```
#### 8.8.2 实体选择器
顶部 Tab 切换：
```text
实体: [会员(ext_attributes)] [交易(payload)] [+ 新建业务实体]
```
* **会员**：编辑 `Member.ext_attributes` 的 JSON Schema。直接影响会员详情页"属性扩展" Tab 的表单渲染。
* **交易**：编辑 `TransactionEvent.payload` 的 JSON Schema。直接影响交易数据的存储结构。
* **新建业务实体**：创建独立的业务实体（如 PetInfo、OrderInfo），映射到系统实体的 JSONB 容器字段。创建后出现在实体列表中。
#### 8.8.3 Formily 属性配置
选中字段时，右侧面板配置：
| 属性            | 控件      | 说明                                                                      |
| ------------- | ------- | ----------------------------------------------------------------------- |
| `x-component` | Select  | Input / NumberPicker / Select / DatePicker / Switch / Upload / Cascader |
| `x-reactions` | 联动构建器   | 可视化选择依赖字段、条件（===、!==、>、<、includes）、效果（显示/隐藏/必填）                         |
| `x-validator` | JSON 编辑 | 校验规则（required/min/max/pattern）                                          |
| `deprecated`  | Switch  | 开启时触发后端 DRL 引用检查，有引用则弹窗告警                                               |
#### 8.8.4 联动规则可视化构建器
```text
┌─────────────────────────────────────────────┐
│ 联动规则                                      │
│ ○ 可视化  ○ 手写表达式                        │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 当 [pet_type ▼] [等于 ▼] [狗         ]  │ │
│ │ 时 [显示 ▼] [dog_breed              ▼]  │ │
│ │                              [删除]      │ │
│ └─────────────────────────────────────────┘ │
│ [+ 添加联动]                                 │
└─────────────────────────────────────────────┘
```
自动生成 `x-reactions` 表达式，也可切换到"手写表达式"模式直接编辑。
#### 8.8.5 版本管理
* **保存草稿**：`status=DRAFT`，不生成新版本号
* **发布**：生成新版本号（如 `v1.3.0`），旧版本状态变更为 `DEPRECATED`
* **版本历史**：抽屉展示版本列表，支持预览（加载对应版本数据到编辑器）和回滚
* 发布时后端执行 DRL 引用检查（若有字段被标记为废弃）
#### 8.8.6 存储
Schema 存储在 `program_schema` 表：
```sql
-- field_schema 字段存储 Formily 可消费的 JSON Schema
-- entity_relations 字段存储业务实体到系统实体的映射关系
-- api_config 字段存储 API 实体的路由和校验配置
| 字段 | 说明 |
|------|------|
| `field_schema` | Schema 编辑器产出的 Formily 可消费 JSON Schema |
| `entity_relations` | 业务实体到系统实体的映射关系 |
| `api_config` | API 实体的路由和校验配置 |
| `status` | DRAFT / ACTIVE / DEPRECATED |
> 已删除 `chartdb_data` 字段，不再需要 React Flow 的画布状态。
```
#### 8.8.7 与业务模块的衔接
* **会员详情页**：`GET /api/admin/schemas/MEMBER/current` → `DynamicFormRenderer` 渲染动态表单
* **保存时**：`MemberExtService.saveMemberExtAttributes`（双写 `_schema_version` + 强标识检查）
* **规则引擎**：Schema 中的字段自动成为 DRL 可引用的 Fact 属性
* **废弃检查**：废弃字段前检查所有 ACTIVE 规则的 DRL 内容，若引用则抛出 `ERR_FIELD_IN_USE`
#### 8.8.8 与映射配置器的关系
```text
Schema 编辑器                           映射配置器
─────────────────                      ─────────────────
定义 ext_attributes 结构               定义 API 字段 → 系统字段
定义 payload 结构                      每个渠道独立配置
输出: JSON Schema                      输出: GraalVM 映射脚本
存储: program_schema 表                存储: channel_adapter_config 表
```
两者独立运行，不放在同一个页面。新接渠道时，先在映射配置器中定义字段映射，如需在 payload 中增加新字段，再在 Schema 编辑器中定义新字段的结构。
***
### 8.9 动态渲染实现流程
#### 8.9.1 后端元数据存储
```json
{
  "program_code": "BRAND-A",
  "field_schema": {
    "type": "object",
    "properties": {
      "pet_name": { "title": "宠物名称", "type": "string", "x-component": "Input" }
    }
  }
}
```
#### 8.9.2 运行态渲染（React + Formily）
```javascript
const DynamicMemberEditor = ({ programCode, memberId }) => {
  const [schema, setSchema] = useState(null);
  const form = useMemo(() => createForm(), []);
  useEffect(() => {
    api.getMemberSchema(programCode).then(res => setSchema(res.data.field_schema));
  }, [programCode]);
  if (!schema) return <Loading />;
  return (
    <FormProvider form={form}>
      <SchemaField schema={schema} />
      <Button onClick={async () => {
        const values = await form.submit();
        api.saveMemberExt(memberId, values);
      }}>保存</Button>
    </FormProvider>
  );
};
```
#### 8.9.3 历史数据与 Schema 版本兼容渲染
```javascript
const DynamicMemberDetail = ({ memberData, currentSchema, schemaVersions }) => {
  const dataVersion = memberData.ext_attributes?._schema_version || memberData.schema_version;
  const effectiveSchema = schemaVersions[dataVersion] || currentSchema;
  return (
    <FormProvider form={form}>
      <SchemaField schema={effectiveSchema} />
      {renderDeprecatedFields(memberData, dataVersion, currentSchema)}
    </FormProvider>
  );
};
```
#### 8.9.4 复杂联动逻辑
```json
{
  "pet_type": { "title": "宠物类型", "x-component": "Select" },
  "dog_breed": {
    "title": "犬种明细",
    "x-component": "Input",
    "x-reactions": "{{ $self.visible = ($deps[0] === 'dog') }}",
    "x-dependencies": ["pet_type"]
  }
}
```
***
### 8.10 兼容性策略：字段废弃处理
#### 8.10.1 废弃标记
不物理删除字段，标记 `deprecated: true`。
#### 8.10.2 向下兼容
* 编辑模式隐藏废弃字段，详情模式折叠在「历史遗留字段」区域
* 版本不一致时显示 Alert，提供"升级到最新版本"按钮
#### 8.10.3 DRL 引用检查
```java
@Transactional
public void deprecateField(String programCode, String entityType, String fieldKey) {
    List<Rule> activeRules = ruleRepo.findActiveByProgramCode(programCode);
    for (Rule rule : activeRules) {
        if (rule.getDrlContent().contains("extAttributes["" + fieldKey + ""]") ||
            rule.getDrlContent().contains("getExtString("" + fieldKey + "")") ||
            rule.getDrlContent().contains("getExtNumber("" + fieldKey + "")") ||
            rule.getDrlContent().contains("getPayloadString("" + fieldKey + "")") ||
            rule.getDrlContent().contains("getPayloadNumber("" + fieldKey + "")")) {
            throw new BusinessException("ERR_FIELD_IN_USE",
                "字段 [" + fieldKey + "] 被规则 [" + rule.getRuleId() + "] 引用，请先修改规则");
        }
    }
    schemaService.markFieldDeprecated(programCode, entityType, fieldKey);
}
```
***
### 8.11 全局交互规范
#### 8.11.1 加载状态
| 状态   | UI 表现          | 触发条件                                            |
| ---- | -------------- | ----------------------------------------------- |
| 首次加载 | 页面级 Spin + 骨架屏 | 页面初次进入                                          |
| 刷新加载 | 表格上方细进度条       | 筛选/翻页/手动刷新                                      |
| 局部加载 | 按钮 loading     | 提交/行内操作                                         |
| 空数据  | Empty + 引导文案   | 列表无数据                                           |
| 错误   | Result + 重试按钮  | 网络异常/5xx                                        |
| 网络断开 | 全局顶部 Banner    | [navigator.onLine](https://navigator.onLine) 监听 |
#### 8.11.2 表单交互规范
* 必填字段标签旁红色星号
* onBlur 触发实时校验
* 提交按钮 loading + 2 秒防抖
* 表单 dirty 时 beforeunload 拦截
***
### 8.12 仪表盘
* 四张 StatCard：会员总数、今日新增、积分发放、积分核销，点击跳转
* 积分趋势折线图（日/周/月切换）
* 待处理告警列表，按类型跳转处理页
***
### 8.13 各功能页面设计
#### 8.13.1 会员列表页
* 搜索栏：静态字段 + 动态属性搜索（根据当前 Schema 动态生成输入框）
* 表格：会员ID（可复制）、手机号（脱敏）、等级、状态、渠道、注册时间
* 批量导入：多步骤 Modal（下载模板 → 上传 → 预览 → 进度条 → 结果报告）
* 行右键菜单、列排序、列宽拖拽
#### 8.13.2 会员详情页
* 顶部：会员信息卡片 + [停用] [合并]
* Tab：基本信息 / 积分账户 / 交易流水 / 渠道关联 / 属性扩展
* 积分账户 Tab：按类型分组卡片，可用余额、信用进度条、[查看流水] [调整积分]
* 交易流水 Tab：筛选表格 + 核销溯源 Drawer（redemption_allocation 明细）
* 渠道关联 Tab：渠道列表 + 手动绑定/解绑
* 属性扩展 Tab：DynamicFormRenderer + 版本不一致 Alert
#### 8.13.3 规则引擎
* 规则列表：左侧规则树 + 右侧表格
* 规则编辑器：AI 辅助 + Monaco 编辑器 + 属性面板- 发布流程：沙箱测试 → 绿/黄/红分级 → 强制放行
#### 8.13.4 渠道配置
* 渠道列表 + 渠道编辑（基本信息 + 映射配置 + 验签配置）
* 映射配置器：可视模式（映射表）/ 脚本模式（Monaco + 测试）
#### 8.13.5 系统设置
* 角色权限管理、操作日志、SPI 调用日志、租户污染审计
***
### 8.14 设计器与业务模块的衔接
#### 8.14.1 会员详情页
* `GET /api/admin/schemas/MEMBER/current` → Formily 渲染 → 保存时双写 + 强标识检查
#### 8.14.2 SPI 网关
* API 实体 → JSON Schema 校验 → GraalVM 映射脚本（映射配置器产出）→ TransactionEvent → EventBridge
* 系统内部固定流程：One-ID 匹配 → Drools 积分计算 → PointGrantService 发分 → TierEvaluationService 评估等级
#### 8.14.3 规则引擎
* Schema 编辑器定义的字段自动成为 DRL 可引用的 Fact 属性
* 映射配置器的脚本在规则引擎之前执行，确保数据已标准化
***
本章规定了系统的前端设计语言、布局架构、核心组件、Schema 编辑器、映射配置器、所有功能页面的交互设计、以及设计器与业务模块的衔接方式。前端开发时需严格遵循本章的色彩、字体、组件和交互规范。**已废弃 ChartDB 和 React Flow，Schema 编辑器使用 JsonSea，映射配置器使用 Monaco Editor。**
## 第九章：多租户数据穿透与绝对防御体系
### 9.1 全局上下文持有器
```java
public class TenantContext {
    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();
    public static void set(String programCode) { CURRENT_TENANT.set(programCode); }
    public static String get() { return CURRENT_TENANT.get(); }
    public static void clear() { CURRENT_TENANT.remove(); }
}
```
**强制纪律**：每个请求进入时设置，处理完毕 `finally` 块中 clear。
### 9.2 四层绝对防御体系
**第一层：入口防御**：`TenantFilter` 强制要求所有请求携带 `program_code`。
**第二层：ORM 语法树拦截器**：自动为多租户表追加 `AND program_code = ?`。
**第三层：中间件沙箱**：
* Redis Key 格式：`tenant:{program_code}:member:{id}`
* EventBridge 消费前校验 `event.getProgramCode()` 一致性
**第四层：查询校验哨兵**：禁止 `repo.findById(id)`，必须 `repo.findByIdAndProgramCode(id, tenant)`。
### 9.3 异常处理与租户污染监控
* 防御审计：`TenantContext.clear()` 前检查线程残留
* 越权访问追踪：跨租户 404 记录异步审计日志
***
## 第十章：前后端 API 与技术规范
### 10.1 统一请求响应协议
```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "trace_id": "REQ-123",
  "data": { }
}
```
### 10.2 通用 Header 约束
* `X-Program-Code`：租户 Program 代码
* `X-Trace-Id`：链路追踪 ID
* `Authorization`：Bearer JWT Token
### 10.3 API 幂等性规范
前端传入 `X-Idempotency-Key`（UUID），后端 Redis 缓存处理结果 24 小时。
### 10.3.1 幂等中心 (Idempotent Center)
**背景**：仅靠 Redis 缓存易丢失，需持久化记录所有幂等操作。
**数据结构**：  
```sql
CREATE TABLE idempotent_record (
    tenant_id VARCHAR(32) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64),       -- 请求内容哈希（可选）
    response_data JSONB,
    status VARCHAR(16) NOT NULL,    -- IN_PROGRESS, COMPLETED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, idempotency_key)
) PARTITION BY LIST (tenant_id);
```
- `status` 初始插入为 `IN_PROGRESS`，完成后更新为 `COMPLETED` 并保存结果。  
- 业务处理失败时删除记录或置失败标志，允许重试。  
- `expires_at` 设置过期时间（如24小时），过期后可清理记录。  
**处理流程**（伪码）：  
```java
public ApiResponse handleRequest(String tenant, String idemKey, byte[] payload) {
    Optional<IdempotentRecord> recOpt = repo.findByTenantAndKey(tenant, idemKey);
    if (recOpt.isPresent()) {
        IdempotentRecord rec = recOpt.get();
        if (rec.status == COMPLETED) {
            return rec.responseData; // 直接返回上次结果
        } else {
            throw new BusinessException("IDEMPOTENCY_IN_PROGRESS", "请求正在处理中");
        }
    }
    // 插入新记录
    IdempotentRecord rec = new IdempotentRecord(tenant, idemKey, hash(payload), IN_PROGRESS, now());
    repo.save(rec);
    try {
        ApiResponse result = processBusiness(payload);
        rec.setResponseData(result);
        rec.setStatus(COMPLETED);
        rec.setUpdatedAt(now());
        repo.save(rec);
        return result;
    } catch (Exception ex) {
        repo.delete(rec);
        throw ex;
    }
}
```
- 关键点：利用唯一主键约束保证幂等键全局唯一；插入失败则直接认定为重复请求。  
**Redis加速**：  
- 可选：将幂等键缓存在 Redis，减少 DB 命中。命中后直接返回结果。  
- **注意**：Redis 丢失时仍能依赖 DB 保证一致。  
### 10.4 错误处理规范
禁止返回 HTTP 500。业务失败返回 HTTP 200，Body 中包含业务错误码。

***
## 第十一章：数据库物理模型设计
```sql
-- 1. 核心租户计划表
CREATE TABLE program (
    id SERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL UNIQUE,
    config_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 2. 会员主表 (双轨模型)
CREATE TABLE member (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL UNIQUE,          -- One-ID，雪花算法生成
    name VARCHAR(100),                               -- 姓名（通用属性）
    gender VARCHAR(10),                              -- MALE / FEMALE / UNKNOWN
    birthday DATE,                                   -- 生日（通用属性）
    tier_code VARCHAR(16),                           -- 当前等级代码
    status VARCHAR(16) NOT NULL DEFAULT 'ENROLLED',  -- ENROLLED / SUSPENDED / MERGED / DEACTIVATED
    schema_version VARCHAR(16),                      -- 写入该数据时的 Schema 版本号
    ext_attributes JSONB,                             -- 动态扩展属性（渠道特有属性如天猫昵称）
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_member_program ON member(program_code);
CREATE INDEX idx_member_status ON member(program_code, status);
CREATE INDEX idx_member_tier ON member(program_code, tier_code);
CREATE INDEX idx_member_ext ON member USING GIN (ext_attributes);
-- 3. 全渠道唯一键表 (One-ID 核心)
CREATE TABLE member_unique_key (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    key_type VARCHAR(32) NOT NULL,                   -- 标识类型
    key_value VARCHAR(256) NOT NULL,                 -- 标识值
    target_member_id VARCHAR(64) NOT NULL,           -- 关联会员ID
    is_strong BOOLEAN DEFAULT true,                  -- 是否可用于跨渠道 One-ID 匹配
    is_verified BOOLEAN DEFAULT false,               -- 是否已验证（如手机号已验证）
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, key_type, key_value)
) PARTITION BY LIST (key_type);
-- 热数据分区：明文手机（最频繁的跨渠道匹配查询）
CREATE TABLE member_unique_key_mobile 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('MOBILE_PLAIN');
-- 温数据分区：各渠道强标识
CREATE TABLE member_unique_key_wechat 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('WECHAT_OPENID', 'WECHAT_UNIONID');
CREATE TABLE member_unique_key_tmall 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('TMALL_OUID');
CREATE TABLE member_unique_key_jd 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('JD_PIN');
CREATE TABLE member_unique_key_douyin 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('DOUYIN_OPENID');
-- 冷数据分区：密文手机和掩码（几乎不用于查询，仅存储备查）
CREATE TABLE member_unique_key_cold 
    PARTITION OF member_unique_key 
    FOR VALUES IN ('TMALL_MOBILE_MD5', 'JD_MOBILE_ENCRYPT', 'DOUYIN_MOBILE_MASK');
-- 默认分区
CREATE TABLE member_unique_key_other 
    PARTITION OF member_unique_key DEFAULT;
-- 反向查询索引：查某个会员的所有标识
CREATE INDEX idx_muk_member ON member_unique_key(program_code, target_member_id);
-- 4. 积分流水表 (分区表)
CREATE TABLE account_transaction (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    operation_key VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    remaining_amount NUMERIC(18, 4),
    expires_at TIMESTAMPTZ,
    rule_id VARCHAR(64),
    rule_snapshot_id VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE UNIQUE INDEX uk_at_idempotent_operation ON account_transaction(program_code, operation_key, created_at);
-- 5. 核销分摊明细
CREATE TABLE redemption_allocation (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    redemption_tx_id BIGINT NOT NULL,
    accrual_tx_id BIGINT NOT NULL,
    allocated_amount NUMERIC(18, 4) NOT NULL
);
-- 6. 会员账户表
CREATE TABLE member_account (
    account_id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(100) NOT NULL,
    member_id BIGINT NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    overdraft_limit DECIMAL(20,4) DEFAULT 0,
    credit_limit DECIMAL(20,4) DEFAULT 0,
    credit_used DECIMAL(20,4) DEFAULT 0,
    total_accrued DECIMAL(20,4) DEFAULT 0,
    total_redeemed DECIMAL(20,4) DEFAULT 0,
    total_expired DECIMAL(20,4) DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, member_id, account_type)
);
-- 7. 渠道适配器配置
CREATE TABLE channel_adapter_config (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(100) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    mapping_mode VARCHAR(20) NOT NULL DEFAULT 'VISUAL' CHECK (mapping_mode IN ('VISUAL', 'SCRIPT')),
    transform_script TEXT,
    spi_webhook_url VARCHAR(500),
    auth_config JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, channel)
);
-- mapping_mode	VISUAL（映射表）/ SCRIPT（脚本）
-- transform_script	映射配置器产出的 GraalVM 映射脚本
-- spi_webhook_url	渠道回调地址
-- auth_config	认证配置（AppKey、Secret 等）
-- 8. SPI 调用审计日志
CREATE TABLE channel_spi_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    request_id VARCHAR(100),
    http_headers JSONB,
    request_payload JSONB,
    response_payload JSONB,
    status VARCHAR(20) NOT NULL,
    execution_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 9. 事件收件箱
CREATE TABLE event_inbox (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(300) NOT NULL,
    payload JSONB NOT NULL,
    transform_logs JSONB,
    retry_count INT DEFAULT 0,
    max_retry INT DEFAULT 3,
    last_error TEXT,
    reject_reason VARCHAR(50),
    next_retry_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 10. 等级变更历史表
CREATE TABLE tier_change_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    old_tier VARCHAR(16),
    new_tier VARCHAR(16) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tier_log_member_time ON tier_change_log(member_id, changed_at);
-- 11. 规则版本快照表
CREATE TABLE rule_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    rule_id VARCHAR(64) NOT NULL,
    drl_content TEXT NOT NULL,
    salience INT,
    activation_group VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 12. Schema 版本管理表
CREATE TABLE program_schema (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,         -- MEMBER / TRANSACTION_EVENT / API_ORDER_REQUEST
    version VARCHAR(16) NOT NULL,
    field_schema JSONB NOT NULL,              -- Formily 可消费的 JSON Schema
    entity_relations JSONB,                   -- 业务实体到系统实体的映射关系
    api_config JSONB,                         -- API 实体的路由和校验配置
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT / ACTIVE / DEPRECATED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, entity_type, version)
);
-- 索引
CREATE INDEX idx_all_tables_program_code ON member(program_code);
CREATE INDEX idx_all_tables_program_code_tx ON account_transaction(program_code, member_id);
```
## 附录：系统字典与枚举值汇总
### A.1 会员相关
#### A.1.1 会员状态 (member.status)
| 值             | 说明         |
| ------------- | ---------- |
| `ENROLLED`    | 正常注册       |
| `SUSPENDED`   | 已停用        |
| `MERGED`      | 已合并（被合并账号） |
| `DEACTIVATED` | 已注销        |
#### A.1.2 性别 (member.gender)
| 值         | 说明 |
| --------- | -- |
| `MALE`    | 男  |
| `FEMALE`  | 女  |
| `UNKNOWN` | 未知 |
***
### A.2 渠道相关
#### A.2.1 渠道类型 (channel / channelType)
| 值        | 说明   |
| -------- | ---- |
| `TMALL`  | 天猫   |
| `JD`     | 京东   |
| `WECHAT` | 微信   |
| `DOUYIN` | 抖音   |
| `VIP`    | 唯品会  |
| `POS`    | 线下门店 |
#### A.2.2 渠道标识类型 (member\_unique\_key.key\_type)
| 值                    | 说明          | is\_strong |
| -------------------- | ----------- | ---------- |
| `MOBILE_PLAIN`       | 明文手机        | true       |
| `TMALL_OUID`         | 天猫唯一ID      | true       |
| `JD_PIN`             | 京东唯一ID      | true       |
| `WECHAT_OPENID`      | 微信openId    | true       |
| `WECHAT_UNIONID`     | 微信unionId   | true       |
| `DOUYIN_OPENID`      | 抖音用户ID      | true       |
| `TMALL_MOBILE_MD5`   | 天猫双重MD5密文手机 | false      |
| `JD_MOBILE_ENCRYPT`  | 京东密文手机      | false      |
| `DOUYIN_MOBILE_MASK` | 抖音掩码手机      | false      |
#### A.2.3 映射模式 (channel\_adapter\_config.mapping\_mode)
| 值        | 说明              |
| -------- | --------------- |
| `VISUAL` | 可视化连线映射         |
| `SCRIPT` | GraalVM JS 脚本映射 |
#### A.2.4 渠道适配器状态 (channel\_adapter\_config.status)
| 值        | 说明  |
| -------- | --- |
| `DRAFT`  | 草稿  |
| `ACTIVE` | 已启用 |
***
### A.3 交易相关
#### A.3.1 事件类型 (TransactionEvent.event\_type)
| 值               | 说明    |
| --------------- | ----- |
| `ORDER`         | 正单交易  |
| `ORDER_REFUND`  | 退单交易  |
| `BEHAVIOR`      | 行为事件  |
| `REDEMPTION`    | 兑礼交易  |
| `SAMPLE_REDEEM` | 领小样   |
| `SAMPLE_REFUND` | 退小样   |
| `CUSTOM`        | 自定义事件 |
#### A.3.2 订单类型 (orderType)
| 值   | 说明  |
| --- | --- |
| `1` | 正单  |
| `2` | 退单  |
| `4` | 领小样 |
| `5` | 退小样 |
#### A.3.3 订单销售类型 (orderSellType)
| 值         | 说明   |
| --------- | ---- |
| `fixed`   | 现货订单 |
| `presale` | 预售订单 |
| `step`    | 预售尾单 |
#### A.3.4 付款方式 (payCode)
| 值        | 说明   |
| -------- | ---- |
| `alipay` | 支付宝  |
| `wechat` | 微信支付 |
***
### A.4 积分相关
#### A.4.1 积分类型代码 (account\_type)
| 值        | 名称    | 说明                 |
| -------- | ----- | ------------------ |
| `REWARD` | 消费积分  | 用户交易累积，可兑换礼品       |
| `TIER`   | 等级成长值 | 只用于计算会员等级，不可消费     |
| `CREDIT` | 授信积分  | 系统授予的信用额度，可透支使用需归还 |
#### A.4.2 交易流水类型 (account\_transaction.transaction\_type)
| 值                 | 说明            |
| ----------------- | ------------- |
| `ACCRUAL`         | 积分发放（正向入账）    |
| `REDEMPTION`      | 积分核销（兑换扣除）    |
| `EXPIRATION`      | 积分过期          |
| `REPAYMENT`       | 透支还款          |
| `CREDIT_REPAY`    | 信用还款          |
| `CREDIT_DRAWDOWN` | 信用提取（使用信用额度）  |
| `OVERDRAFT`       | 被动透支（退款导致的负数） |
#### A.4.3 流水状态 (account\_transaction.status)
| 值           | 说明        |
| ----------- | --------- |
| `ACTIVE`    | 有效（有剩余额度） |
| `EXHAUSTED` | 已耗尽       |
| `EXPIRED`   | 已过期       |
| `SETTLED`   | 已还清（透支）   |
| `OVERDRAFT` | 透支中（负数余额） |
#### A.4.4 积分类型配置开关
| 配置项               | 类型      | 说明       |
| ----------------- | ------- | -------- |
| `is_redeemable`   | Boolean | 可否用于兑换   |
| `is_tier_calc`    | Boolean | 是否计入等级计算 |
| `is_transferable` | Boolean | 可否转赠     |
| `allow_negative`  | Boolean | 是否允许余额为负 |
#### A.4.5 有效期模式
| 值               | 说明   |
| --------------- | ---- |
| `FIXED_DAYS`    | 固定天数 |
| `NATURAL_MONTH` | 自然月  |
| `NATURAL_YEAR`  | 自然年  |
| `0`             | 永不过期 |
***
### A.5 等级相关
#### A.5.1 等级变更原因 (tier\_change\_log.change\_reason)
| 值                   | 说明             |
| ------------------- | -------------- |
| `UPGRADE`           | 升级             |
| `DOWNGRADE`         | 降级（定时保级降级）     |
| `CASCADE_DOWNGRADE` | 级联降级（退款引发的降级）  |
| `MERGE`             | 合并（会员合并时取最高等级） |
***
### A.6 事件处理相关
#### A.6.1 event\_inbox 状态 (event\_inbox.status)
| 值                  | 说明                 |
| ------------------ | ------------------ |
| `RECEIVED`         | 原始报文已入库，等待处理       |
| `VALIDATING`       | 验签、幂等检查、基础字段校验     |
| `VALIDATED`        | 校验通过，等待映射          |
| `PROCESSING`       | 执行映射引擎转换           |
| `COMPLETED`        | 处理完成               |
| `REJECTED`         | 验签失败 / 幂等重复 / 字段缺失 |
| `TRANSFORM_FAILED` | 映射/转换失败            |
| `RETRYING`         | 自动重试中              |
| `DEAD`             | 重试耗尽，转入死信队列        |
#### A.6.2 拒绝原因 (event\_inbox.reject\_reason)
| 值                | 说明     |
| ---------------- | ------ |
| `DUPLICATE`      | 幂等重复   |
| `MISSING_FIELDS` | 必填字段缺失 |
| `SIGN_FAILED`    | 验签失败   |
***
### A.7 规则相关
#### A.7.1 规则状态
| 值          | 说明  |
| ---------- | --- |
| `DRAFT`    | 草稿  |
| `ACTIVE`   | 已启用 |
| `INACTIVE` | 已停用 |
#### A.7.2 沙箱回归测试警告级别
| 值          | 说明        |
| ---------- | --------- |
| `PASS`     | 绿色，通过     |
| `WARNING`  | 黄色，轻微规则遮蔽 |
| `CRITICAL` | 红色，严重冲突   |
***
### A.8 Schema 相关
#### A.8.1 Schema 状态 (program\_schema.status)
| 值            | 说明          |
| ------------ | ----------- |
| `DRAFT`      | 草稿          |
| `ACTIVE`     | 已发布生效       |
| `DEPRECATED` | 已废弃（被新版本替代） |
#### A.8.2 实体类型 (dataflow 设计器)
| 值          | 说明     |
| ---------- | ------ |
| `SYSTEM`   | 系统实体   |
| `BUSINESS` | 业务实体   |
| `API`      | API 实体 |
#### A.8.3 实体映射存储方式
| 值        | 说明   |
| -------- | ---- |
| `object` | 单个对象 |
| `array`  | 数组   |
#### A.8.4 数据流映射方式
| 值           | 说明                  |
| ----------- | ------------------- |
| `AUTO`      | 等值映射                |
| `PATH`      | 路径映射                |
| `SCRIPT`    | 脚本映射                |
| `CONTAINER` | 容器映射（业务实体存入JSONB容器） |
#### A.8.5 字段类型 (FieldType)
| 值         | 说明         |
| --------- | ---------- |
| `String`  | 字符串        |
| `Number`  | 数字         |
| `Boolean` | 布尔         |
| `Date`    | 日期         |
| `Enum`    | 枚举         |
| `Object`  | 对象         |
| `Array`   | 数组         |
| `Ref`     | 引用（引用其他实体） |
#### A.8.6 Formily 组件类型 (x-component)
| 值              | 说明    |
| -------------- | ----- |
| `Input`        | 输入框   |
| `NumberPicker` | 数字选择器 |
| `Select`       | 下拉选择  |
| `DatePicker`   | 日期选择器 |
| `Switch`       | 开关    |
| `Upload`       | 上传    |
| `Cascader`     | 级联选择  |
| `TextArea`     | 文本域   |
| `Radio`        | 单选框   |
| `Checkbox`     | 复选框   |
***
### A.9 认证相关
#### A.9.1 API 认证方式
| 值             | 说明             |
| ------------- | -------------- |
| `HMAC_SHA256` | HMAC-SHA256 签名 |
| `JWT`         | JWT Token      |
| `API_KEY`     | API Key        |
***
### A.10 级联重算相关
#### A.10.1 级联重算任务状态 (cascade\_recalc\_job.status)
| 值            | 说明           |
| ------------ | ------------ |
| `PENDING`    | 待处理          |
| `PROCESSING` | 正在执行         |
| `COMPLETED`  | 已完成          |
| `FAILED`     | 失败（超过最大重试次数） |
***
### A.11 SPI 日志相关
#### A.11.1 SPI 日志状态
| 值         | 说明 |
| --------- | -- |
| `SUCCESS` | 成功 |
| `TIMEOUT` | 超时 |
| `FAILED`  | 失败 |
| `DEAD`    | 死信 |
***
### A.12 实体间关系类型
| 值     | 说明  |
| ----- | --- |
| `1:1` | 一对一 |
| `1:N` | 一对多 |
| `N:M` | 多对多 |
***
### A.13 级联策略
| 值          | 说明       |
| ---------- | -------- |
| `CASCADE`  | 级联删除/更新  |
| `SET_NULL` | 设为空      |
| `RESTRICT` | 限制（禁止删除） |
***
### A.14 节点状态（数据流设计器）
| 值          | 说明  |
| ---------- | --- |
| `ACTIVE`   | 正常  |
| `PENDING`  | 待修改 |
| `UNMAPPED` | 未映射 |
| `LOCKED`   | 锁定  |
***
### A.15 实体类型（画布节点）
| 值                 | 说明   |
| ----------------- | ---- |
| `ENTITY`          | 实体对象 |
| `BUSINESS_OBJECT` | 业务对象 |
***
## 附录：系统错误码汇总
### B.1 通用错误码
| 错误码                | 说明     |
| ------------------ | ------ |
| `SUCCESS`          | 操作成功   |
| `ERR_BAD_REQUEST`  | 参数校验错误 |
| `ERR_UNAUTHORIZED` | 认证失效   |
| `ERR_FORBIDDEN`    | 权限不足   |
| `ERR_RATE_LIMITED` | 请求频率过高 |
### B.2 业务错误码
| 错误码                               | 说明           |
| --------------------------------- | ------------ |
| `ERR_INSUFFICIENT_POINTS`         | 积分不足         |
| `ERR_FIELD_IN_USE`                | 字段被规则引用，无法废弃 |
| `ERR_INVALID_STATUS`              | 状态不合法        |
| `ERR_UNKNOWN_ACTION`              | 未知操作         |
| `ERR_MOBILE_NOT_MATCHED`          | 手机号验证失败      |
| `ERR_VALIDATION`                  | 联合校验失败       |
| `RULE_CONFLICT_REQUIRES_OVERRIDE` | 规则冲突需强制放行    |
| `ERR_TIMEOUT`                     | SPI 处理超时     |
***
帮我完整的review这份设计文档，并告知我这份设计文档是否合理，哪里需要再次修改