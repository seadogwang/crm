# 基于AI的下一代全渠道忠诚度管理SaaS平台
## 完整设计文档 v6.3（金融级·多租户强隔离·全渠道版）
**版本**：6.3```drools
**状态**：团队评审与开发基线版（指导 AI 编码的 Architecture Prompt 规范）```drools
**日期**：2026-05-30
***
## 第一章：引言与设计哲学
### 1.1 背景与战略愿景
忠诚度管理系统（Loyalty Management）是企业全链路 CRM 体系的核心中台。在当今异构渠道（电商、私域、线下）并存的格局下，传统的积分系统普遍陷入了“规则死锁”与“渠道割裂”的困境。
本项目的战略目标是构建一套“**配置驱动、金融级一致性、AI 原生防御**”的下一代 SaaS 底座。我们不仅要解决“发分与核销”的业务需求，更要构建一套能够支撑企业在未来 3-5 年内，应对高并发交易、复杂合规要求与敏捷运营诉求的技术护城河。
### 1.2 设计哲学 (Architectural Philosophy)
在架构演进过程中，我们遵循以下四项核心设计原则：
* **防御性编程 (Defensive SaaS)**：数据穿透是 SaaS 系统的生死线。我们从基础设施层面（数据库层租户过滤）到应用层（租户上下文强制持有）构建了四重隔离防线，确保租户间逻辑绝对隔离。
* **状态机至上 (State-Machine Driven)**：将积分流转、退款重算、身份合并等复杂逻辑建模为状态转换。一切业务结果通过事件溯源（Event Sourcing）而非仅仅是修改余额，确保“账户余额”在任何时间点都是可溯源、可审计的。
* **性能与一致性的动态平衡**：放弃低效的全局分布式锁，引入“瀑布流冲抵机制”与“异步无锁化补偿”，在保证业务逻辑正确的前提下，最大程度优化接口响应性能。
* **代码与配置的解耦 (Schema-Driven)**：前端界面、规则判定逻辑与持久化模型均由元数据（Metadata/JSON Schema）驱动。系统不仅是功能的容器，更是业务规则配置的执行引擎。
### 1.3 核心专业术语表 (Terminology Mapping)
为了统一技术研发与产品运营的对话，以下定义作为本架构文档的基准参考：
| 术语                 | 定义说明                       | 伪代码/语义约束                                     |
| ------------------ | -------------------------- | -------------------------------------------- |
| **Program**        | 业务租户单元，积分计算的原子空间。          | `ProgramCode == Tenant_Boundary`             |
| **One-ID**         | 全渠道身份识别后的唯一会员主键。           | `One-ID = UniqueKeyMapping(channel, openId)` |
| **EventFact**      | 标准化领域事件，所有入账动作必须先归一化为此格式。  | `Fact = Standardize(RawRequest)`             |
| **FIFO-Batch**     | 积分核销遵循严格的先进先出原则，禁止随意消耗。    | `Redemption = FIFO(AccrualBatches)`          |
| **Shadow Sandbox** | 规则变更的预验证环境，通过真实历史流水进行回归测试。 | `Sandbox = Baseline + Candidate_Rule`        |
### 1.4 架构评审边界 (Review Boundaries)
* **重点评审项**：多租户隔离的严密性、逆向级联补偿机制的吞吐量、规则引擎的防错机制。
* **非评审范围**：不涉及底层的网络基础设施（如 Kubernetes 部署细节、CDN 配置）、不涉及 C 端页面渲染的前端样式细节（仅涉及动态 Schema 协议）。
### 1.5 附录：如何阅读这份文档
本技术文档采用了“**伪代码先行**”的叙述风格。为了便于开发人员落地，每一项核心业务逻辑均配有对应的核心逻辑伪代码。我们建议评审人在阅读时，重点关注伪代码中对于“**事务边界**”、“**并发处理（锁）**”以及“**租户上下文安全**”的处理方式。
这份文档不仅是逻辑说明，更是后续代码开发的**契约规范**。
***
## 第二章：系统总体架构与轻量化环境设计
### 2.1 系统逻辑架构分层 (Logical Architecture Layers)
本系统采用经典的分层架构，并在核心业务层引入了针对忠诚度业务深度定制的各种领域引擎。系统自上而下分为三层：
* **API / 接入层 (Gateway & API Layer)**
  * 管理后台 API：面向商户运营人员，提供基于 JWT 认证的 RESTful API，用于 Program 配置、规则发布、会员管理等。
  * 商户 Open API：面向商户自有的前端（如微信小程序、自建 APP），提供基于 HMAC-SHA256 签名的 Open API，保证数据防篡改。
  * Unified SPI Gateway (统一 SPI 网关)：专为天猫、京东、抖音等二方开放平台设计的反向 Webhook 网关，接管复杂的验签与异构回调。
* **核心业务与领域引擎层 (Core Domain Engines)**
  * 动态实体引擎：结合 JSONB 和动态 Schema，实现多行业会员和交易扩展属性的管理。
  * 规则引擎与沙箱 (Drools & Sandbox)：无状态的 Drools 8 执行环境，支持基线与候选规则的双 KieSession 影子回放。
  * 异构映射引擎 (GraalVM Scripting)：用于将第三方杂乱的 1:N 结构 API 数据（如订单头+明细），通过底层 JS 脚本转换为标准内部事件。
  * 核销与冲抵引擎 (Offset Engine)：处理积分的先进先出（FIFO）消耗，以及被动透支、信用积分的冲抵平账逻辑。
* **基础设施与防穿透层 (Infrastructure & Defense Layer)**
  * 数据库层：PostgreSQL 15，依托全局 ORM 拦截器实现 `program_code` 级的数据穿透防御。
  * 缓存与锁：Redis Cluster，缓存 Key 统一强制追加租户前缀隔离。
  * 事件总线 (EventBridge)：屏蔽底层消息队列的物理实现，提供统一的领域事件派发接口。
### 2.2 开发轻量化与消息队列环境隔离 (Development Lightweighting)
**痛点背景**：在企业级 SaaS 中，为了保证高并发和高可用，通常强依赖 Kafka 集群。如果要求每个开发人员在本地启动全套 Kafka 环境，不仅占用大量内存（甚至导致电脑卡顿），且环境配置极其繁琐，严重拖慢启动和调试速度。
**架构解法**：引入 `EventBridge` 抽象总线，利用 Spring 的 `@Profile` 机制实现环境的无缝切换。业务代码禁止直接使用 `KafkaTemplate`。
#### 2.2.1 统一事件总线接口契约
所有领域事件的发布必须依赖以下接口：
```java
public interface EventBridge {
    /**
     * 发送领域事件
     * @param topic 业务主题（如: loyalty-transaction-events）
     * @param partitionKey 分区键（通常为 memberId，保证同一会员事件串行处理）
     * @param event 核心事件体
     */
    void publish(String topic, String partitionKey, BaseDomainEvent event);
}
```
#### 2.2.2 Dev环境：本地内存队列实现 (LocalEventBus)
在 dev 环境下，系统不连接任何外部 MQ，而是利用 Java 内存队列与线程池，完美模拟 Kafka 的分区有序消费特性。这样开发人员可以在本地“单机”验证高并发下的时序逻辑。
```java
@Component
@Profile("dev")
@Slf4j
public class LocalEventBus implements EventBridge {
    
    // 模拟 Kafka 的 Partition 数量，创建多个单线程池
    private final int VIRTUAL_PARTITIONS = 8;
    private final ExecutorService[] partitionExecutors;
    public LocalEventBus() {
        this.partitionExecutors = new ExecutorService[VIRTUAL_PARTITIONS];
        for (int i = 0; i < VIRTUAL_PARTITIONS; i++) {
            // 【核心设计】每个虚拟分区单线程执行，保证落入同一分区的 memberId 事件绝对有序
            this.partitionExecutors[i] = Executors.newSingleThreadExecutor(
                new ThreadFactoryBuilder().setNameFormat("local-mq-partition-" + i + "-%d").build()
            );
        }
    }
    @Override
    public void publish(String topic, String partitionKey, BaseDomainEvent event) {
        // 计算当前 partitionKey 对应的虚拟分区
        int partition = Math.abs(partitionKey.hashCode()) % VIRTUAL_PARTITIONS;
        
        // 异步提交到对应的本地单线程池中执行，非阻塞主线程
        partitionExecutors[partition].submit(() -> {
            try {
                log.info("[LocalMQ] 消费分区 {}: Topic={}, Key={}", partition, topic, partitionKey);
                // 路由到 Spring 容器中对应的本地监听器进行消费
                LocalEventRouter.route(topic, event);
            } catch (Exception e) {
                log.error("[LocalMQ] 消费异常，本地可直接抛出或进入本地重试表", e);
            }
        });
    }
}
```
#### 2.2.3 Test/Prod环境：Kafka 集群实现 (KafkaEventBus)
当代码部署到测试或生产环境（`spring.profiles.active=prod`）时，系统自动挂载真正的 Kafka 实现，无需修改任何业务代码。
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
        // 利用 memberId 作为 partitionKey 投递至真实 Kafka 集群，由 Kafka 保证分区有序
        kafkaTemplate.send(topic, partitionKey, event);
    }
}
```
### 2.3 核心技术栈选型与要求
* **核心框架**：Java 17 (利用 Records, 文本块等新特性) + Spring Boot 3.x。
* **规则计算层**：
  * Drools 8 (KIE API)：采用无状态会话（`StatelessKieSession`），支持多线程并发执行而不相互污染。
  * GraalVM Polyglot：用作高级脚本转换器（执行 JavaScript），替代已废弃的 Nashorn，提供细粒度的 CPU/内存沙箱隔离。
* **数据持久层**：
  * PostgreSQL 15：深度使用 JSONB 字段与 GIN 索引，支撑动态 Schema 检索；利用其强大的事务与锁机制保证资金级积分安全。
  * ORM：推荐 Spring Data JPA 或 MyBatis-Plus。必须支持自定义 AST 语法树拦截器，用于强制植入租户过滤条件。
* **缓存与分布锁**：Redis 6.x + Redisson（用于入会并发控制和幂等控制）。
* **前端框架**：React 18 + 阿里 Formily（强大的动态表单与联动渲染引擎）。
***
## 第三章：核心业务领域：Program与会员域
### 3.1 Program 管理与租户边界 (Program & Tenant Boundaries)
**Program (忠诚度计划)** 是本平台的核心业务租户单元。一个企业实体（Tenant）下可以创建多个互相隔离的 Program（例如集团下的子品牌A、子品牌B）。
* **隔离原则**：所有的会员、积分、规则、渠道配置，其生命周期和数据权限绝对从属于唯一的 `program_code`。
* **配置存储**：Program 的所有非结构化配置（如等级阶梯、逆向策略、积分类型字典）统一以 JSON 结构存储于 `program.config_json`，并支持版本历史追溯。
### 3.2 核心实体的静态与动态边界 (Fixed vs. Dynamic Fields)
为了让一套底层代码同时支撑“美妆行业（需要肤质、生肖属性）”和“汽车行业（需要车牌号、购车门店属性）”，平台对核心实体采取“**核心强依赖字段 + 动态扩展字段 (JSONB)**”的双轨模型。
**研发与 AI 编码纪律**：严禁随意在数据库表和 Java Entity 中增加业务字段。
#### 3.2.1 会员实体边界 (Member)
* **静态字段 (Fixed)**：系统路由和核心引擎强依赖的字段，必须作为独立的物理列。
  * `id` (底层自增主键)
  * `program_code` (归属计划)
  * `member_id` (业务主键/对外暴露的会员号，雪花算法生成)
  * `status` (状态：`ENROLLED`, `SUSPENDED`, `MERGED`, `DEACTIVATED`)
  * `tier_code` (当前等级代码)
* **动态字段 (Dynamic)**：所有因行业而异的字段统一存入 `ext_attributes` (PostgreSQL JSONB)。前端采用 Formily 引擎配合 JSON Schema 动态渲染。
```java
// 会员实体 JPA 伪代码示例
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
    // 动态属性，映射为 JSONB
    @Type(type = "jsonb")
    @Column(name = "ext_attributes", columnDefinition = "jsonb")
    private Map<String, Object> extAttributes = new HashMap<>();
}
```
#### 3.2.2 交易事件边界 (TransactionEvent)
* **静态字段**：`event_id`, `member_id`, `event_type` (枚举：`ORDER`, `ENROLL`, `CUSTOM`), `channel`, `event_time`, `idempotent_key`。
* **动态字段**：如 `order_amount`, `pay_type` 等统统塞入 `payload` JSONB 字段。
#### 3.2.3 动态属性写入规范（Schema 版本下沉）
每次创建或更新会员的 ext_attributes 时，必须同步写入当前生效的 Schema 版本号：
```java
public void saveMemberExtAttributes(String memberId, Map<String, Object> extAttributes) {
    Member member = memberRepo.findByMemberId(memberId);
    
    // 获取当前 Program 生效的会员 Schema 版本
    String currentSchemaVersion = schemaService.getCurrentVersion(member.getProgramCode(), "MEMBER");
    
    // 注入元字段到 JSON 内部
    extAttributes.put("_schema_version", currentSchemaVersion);
    
    member.setExtAttributes(extAttributes);
    member.setSchemaVersion(currentSchemaVersion);  // 同时写入独立字段，便于 SQL 查询
    memberRepo.save(member);
}
```
双写（独立字段 + JSON 内部元字段）的设计意图：
member.schema_version：用于 SQL 层面的批量查询和统计（如「找出所有仍在使用 v1.0 版本 Schema 的会员数」）
ext_attributes._schema_version：用于前端渲染时的版本识别，无需额外查表
`member` 表中的 ext_attributes JSON 内部也冗余存储一份（便于前后端统一解析）：
业务约定：每次写入 ext_attributes 时，在 JSON 根节点自动注入 _schema_version 元字段：
```json
{
  "_schema_version": "v1.2.0",
  "pet_name": "旺财",
  "shoe_size": 42
}
```
### 3.3 动态属性与规则引擎的桥接 (Drools Fact Wrappers)
**痛点**：Drools 默认基于 Java 强类型对象（POJO）进行模式匹配。如果直接把带有 `Map<String, Object>` 的 JPA 实体丢给 Drools，原生 DRL 语法解析会极其痛苦，甚至报错。
**解法**：在数据进入规则引擎的 `KieSession` 前，必须通过**事实包装器 (Fact Wrapper)** 进行转换，提供供 DRL 优雅调用的辅助方法。
#### 3.3.1 包装器设计规范 (Wrapper Specifications)
要求研发（或 AI 生成代码时）必须构建专用于规则计算的 Wrapper 类：
```java
// 会员事实包装器 (插入 KieSession 的对象)
public class MemberFact {
    private String memberId;
    private String tierCode;
    private Map<String, Object> extAttributes; 
    // DRL 辅助提取方法
    public String getExtString(String key) {
        return extAttributes.containsKey(key) ? String.valueOf(extAttributes.get(key)) : null;
    }
    
    public Double getExtNumber(String key) {
        if (!extAttributes.containsKey(key)) return 0.0;
        return Double.valueOf(String.valueOf(extAttributes.get(key)));
    }
}
// 事件事实包装器
public class EventFact {
    private String eventType;
    private Map<String, Object> payload;
    public Double getPayloadNumber(String key) { ... }
}
```
#### 3.3.2 DRL 规则模板规范 (DRL Template Standard)
配置端生成的 DRL 脚本，必须利用 Wrapper 提供的方法提取动态属性，保证类型安全。
```drools
// 场景：如果订单金额 > 100，且会员动态属性里的鞋码 > 40，则发放 50 积分
rule "Dynamic_Attribute_Reward_Rule"
when
    // 提取动态事件属性
    $event : EventFact( eventType == "ORDER", getPayloadNumber("order_amount") > 100 )
    
    // 提取动态会员属性
    $member : MemberFact( memberId == $event.memberId, getExtNumber("shoe_size") > 40 )
then
    // 将发分指令推入规则收集器 (不直接操作 DB)
    ActionCollector.awardPoints($event.getEventId(), 50, "ORDER_REWARD").execute(drools);
end
```
### 3.4 全渠道身份识别与会员合并 (Identity & Merge Strategy)
在全渠道体系下（天猫、微信、抖音同时引流），用户身份的统一（One-ID）是会员域最核心的挑战。系统采用 `member_unique_key` 表与分布式锁结合，保证并发场景下不产生“幽灵账号”。
#### 3.4.1 强弱标识与辅助唯一键表
系统不以手机号或 UnionID 作为会员主表的物理主键或唯一约束。```drools
而是建立一张辅助表 `member_unique_key (program_code, key_type, key_value, target_member_id)`。
* 记录 A：`("BRAND-A", "MOBILE", "13800000000", 8821)`
* 记录 B：`("BRAND-A", "WECHAT_UNIONID", "oxc123...", 8821)`
#### 3.4.2 并发入会与合并策略 (Concurrent Merge Flow)
当外部渠道（如天猫 SPI）发来一个包含 `mix_mobile` 和 `ouid` 的入会请求时，处理流转如下：
```java
public void processEnrollment(EnrollmentRequest request) {
    String programCode = request.getProgramCode();
    String mobile = decrypt(request.getMobile());
    
    // 1. 获取细粒度分布式锁，防止双渠道同时触发注册导致同一手机号创建两个 Member
    String lockKey = "loyalty:" + programCode + ":enroll:" + HashUtil.md5(mobile);
    RLock lock = redissonClient.getLock(lockKey);
    
    try {
        lock.lock(5, TimeUnit.SECONDS);
        
        // 2. 多维度交集匹配查询 (Intersection Matching)
        Long existingMemberId = uniqueKeyRepo.findMemberId(programCode, "MOBILE", mobile);
        
        if (existingMemberId != null) {
            // 场景 A：老会员，执行信息补全或渠道绑定
            bindNewChannel(existingMemberId, request.getChannel(), request.getChannelOpenId());
            return;
        }
        
        // 场景 B：新会员，执行注册
        Long newMemberId = generateSnowflakeId();
        Member newMember = new Member(programCode, newMemberId, request.getExtAttributes());
        memberRepo.save(newMember);
        
        // 写入唯一键辅助表
        uniqueKeyRepo.save(new UniqueKey(programCode, "MOBILE", mobile, newMemberId));
        uniqueKeyRepo.save(new UniqueKey(programCode, request.getChannel(), request.getChannelOpenId(), newMemberId));
        
        // 3. 发布内部入会事件，交由规则引擎判定是否送“新人礼”
        eventBridge.publish("loyalty-events", newMemberId.toString(), new MemberEnrolledEvent(newMemberId));
        
    } finally {
        lock.unlock();
    }
}
```
##### 3.4.2.1 极端竞态防护与兜底机制
当两个不同渠道（如天猫和微信）并发传入同一手机号的入会请求时，若锁 Key 不一致（一个用 MOBILE 哈希，一个用 WECHAT_UNIONID 哈希），可能导致两个线程同时判定“无记录”，分别创建会员账号。

**防护策略：**
1.统一锁 Key：只要请求中包含手机号，分布式锁的 Key 统一基于手机号哈希生成，忽略渠道标识。
```java
// 正确：统一用手机号加锁
String lockKey = "loyalty:" + programCode + ":enroll:" + HashUtil.md5(mobile);

// 错误：不要把渠道拼入锁 Key
// String lockKey = "loyalty:" + programCode + ":enroll:" + channel + ":" + mobile;
```
2.数据库唯一约束兜底：member_unique_key 表已设置 UNIQUE (program_code, key_type, key_value)，当两个线程最终同时尝试插入时，后者会触发 DataIntegrityViolationException。
```java
try {
    uniqueKeyRepo.save(new UniqueKey(programCode, "MOBILE", mobile, newMemberId));
} catch (DataIntegrityViolationException e) {
    // 并发冲突：另一个线程已抢先创建，转为查询已创建的会员并绑定渠道
    Long existingMemberId = uniqueKeyRepo.findMemberId(programCode, "MOBILE", mobile);
    bindNewChannel(existingMemberId, request.getChannel(), request.getChannelOpenId());
    // 回滚本次创建的重复会员账号
    memberRepo.deleteById(newMemberId);
    return;
}
```
3.新人礼防重：MemberEnrolledEvent 的消费端需基于 memberId + eventType 做幂等校验，确保即使短时间创建了重复会员，新人礼也只发放一次。
#### 3.4.3 显式合并与资产转移 (Explicit Merge)
如果因为极端情况或人工客服操作，发现了两个 `member_id` 实际上属于同一个人，触发显式合并 (`MERGE` 操作)：
* 选取一个作为主账号（通常是注册早或等级高的），另一个状态置为 `MERGED`。
* 积分资产处理：根据 Program 配置，通常将 `CONSUMPTION` 积分进行算数累加。
* 等级资产处理：取两个账号中等级序列（Sequence）最高的一方作为新等级。
* 被合并账号的 `member_unique_key` 记录全部重定向指向主账号 `target_member_id`。
***
## 第四章：积分、等级与资产隔离域 (核心账务与冲抵引擎)
本章定义了平台虚拟资产（积分、成长值、信用额度）的生命周期。为了支撑复杂的营销场景并防止“兑换礼品导致掉级”或“恶意退款套利”，系统在底层实现了严格的资产隔离与准金融级的对账核销机制。
### 4.1 积分类型字典 (Point Type Taxonomy)
系统中严禁在代码里硬编码具体的积分名称。所有的资产必须通过 `point_type_definition`（积分类型字典）进行定义和控制。每种积分类型拥有四大核心风控开关。
#### 4.1.1 核心风控开关 (Core Attributes)
* `is_redeemable` (可否兑换)：决定余额是否能用于兑换中心抵扣。
* `is_tier_calc` (可否算等级)：决定其累计入账量是否交由 `TierEvaluationService` 计算升降级。
* `is_transferable` (可否转赠)：决定是否能在会员间进行 C2C 划转。
* `allow_negative` (允许负数)：决定因历史订单退款导致扣分时，是否允许将账户余额扣至零以下（被动透支）。
#### 4.1.2 预设最佳实践 (Best Practice Templates)
平台初始化时，默认向 Program 注入以下两种隔离的资产类型：
* **消费积分 (Reward Points)**：`is_redeemable=true`, `is_tier_calc=false`。用户花钱赚取，兑换礼品会扣减余额，绝对不影响等级。
* **等级成长值 (Tier Points)**：`is_redeemable=false`, `is_tier_calc=true`。通常与消费金额 1:1 挂钩，只增不减（或按年清零），保障用户等级不因兑换而掉级。
#### 4.1.3 积分流水表核心字段与查询模型
```sql
CREATE TABLE account_transaction (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    operation_key VARCHAR(100) NOT NULL,      -- 幂等键
    transaction_type VARCHAR(32) NOT NULL,    -- ACCRUAL / REDEMPTION / EXPIRATION / REPAYMENT / CREDIT_REPAY / CREDIT_DRAWDOWN
    amount NUMERIC(18, 4) NOT NULL,           -- 变动金额（正为入账，负为出账）
    remaining_amount NUMERIC(18, 4),          -- 该批次剩余可用额度
    expires_at TIMESTAMPTZ,                   -- 过期时间
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / EXHAUSTED / EXPIRED
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```
* **关键约束**： 
* `remaining_amount` 是这一笔流水中还未被消耗或过期的额度。
* `status = 'ACTIVE'` 且 `remaining_amount` > 0 且 `expires_at` > NOW() 三条件同时满足，才属于“可用积分”。
* 过期后，status 变为 EXPIRED，remaining_amount 清零，但不删除行。
* **积分查询与汇总（实时计算）**
* 查询会员可用余额：
```sql
SELECT COALESCE(SUM(remaining_amount), 0)
FROM account_transaction
WHERE member_id = ?
  AND program_code = ?
  AND account_type = ?
  AND status = 'ACTIVE'
  AND remaining_amount > 0
  AND expires_at > NOW();
```
* 不维护 member_account.balance 预聚合字段。member_account 表只存储：
* 账户级风控参数：overdraft_limit、credit_limit、credit_used
* 累计统计（只增不减，用于报表）：total_accrued、total_redeemed、total_expired


### 4.2 被动透支与主动信用冲抵引擎 (Offset Engine)
积分系统的入账绝不是简单的 `UPDATE balance = balance + X`。由于逆向退款可能导致账户余额为负（被动透支），且高价值用户可能拥有预授信的信用积分（主动信用），系统在处理正向入账时，必须经过“**瀑布流冲抵机制**”。
#### 4.2.1 账户数据结构扩充
`member_account` 表不再维护实时余额（balance），余额改为查询时通过 SUM(remaining_amount) 实时汇总。member_account 表仅存储账户级风控参数和累计统计。
* `overdraft_limit`：被动透支底线。如设为 1000，则退单时最多允许账户扣到 -1000 分，超过则生成人工追偿工单。
* `credit_limit`：主动授信总额。
* `credit_used`：已使用的信用额度。
#### 4.2.2 瀑布流冲抵伪代码 (Waterfall Offset Logic)
要求 AI 或研发在编写 `PointGrantService`（积分发放服务）时，严格遵循以下处理流转：
```java
@Transactional
public void grantPoints(String programCode, String memberId, String accountType, BigDecimal pointsToGrant, String ruleId , String ruleSnapshotId) {
    // 1. 悲观锁获取账户（仅用于获取信用额度等风控参数，不操作余额）
    MemberAccount account = accountRepo.findByMemberIdAndTypeForUpdate(memberId, accountType);
    BigDecimal remainingToGrant = pointsToGrant;

    // 2. 补天窗：检查是否存在被动透支
    //    透支体现为 account_transaction 中存在 remaining_amount < 0 的 OVERDRAFT 记录
    List<AccountTransaction> overdraftBatches = transactionRepo.findOverdraftBatchesForUpdate(
        memberId, accountType);  // WHERE remaining_amount < 0 AND status = 'OVERDRAFT'

    for (AccountTransaction overdraft : overdraftBatches) {
        if (remainingToGrant.compareTo(BigDecimal.ZERO) <= 0) break;
        
        BigDecimal debt = overdraft.getRemainingAmount().abs(); // 透支金额（绝对值）
        BigDecimal offsetAmount = remainingToGrant.min(debt);
        
        // 生成 REPAYMENT(还款) 流水，冲抵透支
        insertTransaction(memberId, accountType, "REPAYMENT", offsetAmount, null);
        
        // 减少透支额度
        overdraft.setRemainingAmount(overdraft.getRemainingAmount().add(offsetAmount));
        if (overdraft.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0) {
            overdraft.setStatus("SETTLED"); // 透支已还清
        }
        transactionRepo.save(overdraft);
        
        remainingToGrant = remainingToGrant.subtract(offsetAmount);
    }

    // 3. 还信用：检查主动信用欠款 (credit_used > 0)
    if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0 && account.getCreditUsed().compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal creditDebt = account.getCreditUsed();
        BigDecimal offsetAmount = remainingToGrant.min(creditDebt);
        
        // 生成 CREDIT_REPAY(信用还款) 流水
        insertTransaction(memberId, accountType, "CREDIT_REPAY", offsetAmount, null);
        
        // 扣减信用已用额度（这是 member_account 上唯一需要更新的字段）
        account.setCreditUsed(account.getCreditUsed().subtract(offsetAmount));
        remainingToGrant = remainingToGrant.subtract(offsetAmount);
    }

    // 4. 真实入账：最终剩余的积分，才变成可用的正向批次
    if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
        // 生成 ACCRUAL(发放) 流水，带有过期时间
        // remaining_amount = 发放金额，后续消耗和过期时从这里扣减
        insertTransaction(memberId, accountType, "ACCRUAL", remainingToGrant, 
                  calculateExpiryDate(), ruleId, ruleSnapshotId);
    }
    
    // 5. 更新累计统计（只增不减，用于报表，不影响实时余额计算）
    account.setTotalAccrued(account.getTotalAccrued().add(pointsToGrant));
    accountRepo.save(account);
}

/**
 * 插入积分流水
 * @param amount 变动金额（正数为入账，负数为出账）
 * @param expiresAt 过期时间（ACCRUAL 类型必填，其他类型为 null）
 */
private void insertTransaction(String memberId, String accountType, 
                               String transactionType, BigDecimal amount, LocalDateTime expiresAt) {
    AccountTransaction tx = new AccountTransaction();
    tx.setMemberId(memberId);
    tx.setAccountType(accountType);
    tx.setTransactionType(transactionType);
    tx.setAmount(amount);
    tx.setRemainingAmount(amount);  // 初始剩余额度 = 变动金额
    tx.setExpiresAt(expiresAt);
    tx.setRuleId(ruleId);
    tx.setRuleSnapshotId(ruleSnapshotId);
    tx.setStatus("ACTIVE");
    transactionRepo.save(tx);
}
```
#### 4.2.3 冲抵引擎与流水表操作约束
冲抵引擎的所有操作仅修改 account_transaction 的 remaining_amount 和 status，不更新 member_account 的任何余额字段。余额始终通过 SUM(remaining_amount) 实时计算。
### 4.3 FIFO 兑换引擎与精准溯源 (Redemption & Traceability)
为了实现准金融级的对账，积分核销必须支持批次级别的溯源。单纯扣减 `member_account.balance` 是不够的，必须通过 `account_transaction` 的剩余可用量 (`remaining_amount`) 和 `redemption_allocation` (核销分摊表) 实现精准对应。
#### 4.3.1 先进先出核销伪代码 (FIFO Redemption Logic)
```java
@Transactional
public void redeemPoints(String programCode, String memberId, String accountType, BigDecimal pointsToRedeem) {
    // 1. 获取账户（仅用于信用额度等风控参数）
    MemberAccount account = accountRepo.findByMemberIdAndTypeForUpdate(memberId, accountType);
    
    // 2. 实时汇总可用余额，校验是否足够（含信用额度）
    BigDecimal availableBalance = transactionRepo.sumAvailableBalance(memberId, accountType);
    // SQL: SELECT COALESCE(SUM(remaining_amount), 0) 
    //      FROM account_transaction 
    //      WHERE member_id = ? AND account_type = ? 
    //        AND status = 'ACTIVE' AND remaining_amount > 0 AND expires_at > NOW()
    
    BigDecimal totalAvailable = availableBalance.add(
        account.getCreditLimit().subtract(account.getCreditUsed())
    );
    if (totalAvailable.compareTo(pointsToRedeem) < 0) {
        throw new BusinessException("ERR_INSUFFICIENT_POINTS", "积分不足（含信用额度）");
    }
    
    // 3. 查询所有有效且有余额的积分批次，严格按过期时间和创建时间升序排列
    //    【关键】必须加 expires_at > NOW() 过滤已过期批次
    List<AccountTransaction> validBatches = transactionRepo.findActiveBatchesForUpdate(
        memberId, accountType,
        Sort.by("expiresAt").ascending().and(Sort.by("createdAt").ascending())
    );
    // SQL: SELECT * FROM account_transaction 
    //      WHERE member_id = ? AND account_type = ?
    //        AND status = 'ACTIVE' AND remaining_amount > 0 AND expires_at > NOW()
    //      ORDER BY expires_at ASC, created_at ASC 
    //      FOR UPDATE
    
    BigDecimal remainingToRedeem = pointsToRedeem;
    
    // 4. 生成一笔总的负向 REDEMPTION 流水
    AccountTransaction redemptionTx = createRedemptionTransaction(memberId, accountType, pointsToRedeem.negate());
    
    // 5. 遍历可用批次，逐笔扣减 (Allocation)
    for (AccountTransaction batch : validBatches) {
        if (remainingToRedeem.compareTo(BigDecimal.ZERO) <= 0) break;
        
        // 【惰性过期检查】遍历时如果发现已过期，标记并跳过
        if (batch.getExpiresAt() != null && batch.getExpiresAt().isBefore(LocalDateTime.now())) {
            markAsExpired(batch);
            continue;
        }
        
        BigDecimal batchAvailable = batch.getRemainingAmount();
        BigDecimal allocateAmount = remainingToRedeem.min(batchAvailable);
        
        // 扣减批次剩余额度
        batch.setRemainingAmount(batchAvailable.subtract(allocateAmount));
        if (batch.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0) {
            batch.setStatus("EXHAUSTED"); // 批次耗尽
        }
        transactionRepo.save(batch);
        
        // 【核心记录】写入核销分摊明细，关联扣款流水与原始发分流水
        Allocation allocation = new Allocation(redemptionTx.getId(), batch.getId(), allocateAmount);
        allocationRepo.save(allocation);
        
        remainingToRedeem = remainingToRedeem.subtract(allocateAmount);
    }
    
    // 6. 处理自有余额不足，扣除信用额度的场景
    if (remainingToRedeem.compareTo(BigDecimal.ZERO) > 0) {
        processCreditDrawdown(account, redemptionTx, remainingToRedeem);
    }
    
    // 【注意】不再需要 account.setBalance(...)，余额由 SUM(remaining_amount) 实时计算
}

/**
 * 惰性标记过期批次
 */
private void markAsExpired(AccountTransaction batch) {
    BigDecimal expiredAmount = batch.getRemainingAmount();
    batch.setStatus("EXPIRED");
    batch.setRemainingAmount(BigDecimal.ZERO);
    transactionRepo.save(batch);
    
    // 发布审计事件（异步处理审计流水和用户通知）
    eventBridge.publish("loyalty-point-events", batch.getMemberId(),
        new PointsExpiredEvent(batch.getMemberId(), expiredAmount, batch.getId()));
}
```
**设计意义**：当发生退款或退换货导致系统需要退还积分给用户时，系统可以直接通过 `redemption_allocation` 表找到原始的 `ACCRUAL` 批次，精准恢复该批次原有的 `expires_at` (过期时间)，而非简单粗暴地发放一笔全新的积分。
#### 4.3.2 积分过期处理（惰性标记 + 事件驱动）
* 严禁使用定时任务执行以下语句：
```sql
-- ❌ 禁止！Citus 下会导致表级锁，阻塞所有写入
UPDATE account_transaction 
SET status = 'EXPIRED', remaining_amount = 0 
WHERE status = 'ACTIVE' AND expires_at <= NOW();
```
正确做法：过期判定在查询时实时完成，过期状态在访问时惰性更新。

* FIFO 兑换遍历时惰性标记
```java
for (AccountTransaction batch : validBatches) {
    // 双重保险：即使 SQL 已过滤，遍历时再校验一次
    if (batch.getExpiresAt() != null && batch.getExpiresAt().isBefore(LocalDateTime.now())) {
        markAsExpired(batch);  // 单行更新，锁极小
        continue;
    }
    // ... 正常核销逻辑
}

private void markAsExpired(AccountTransaction batch) {
    batch.setStatus("EXPIRED");
    batch.setRemainingAmount(BigDecimal.ZERO);
    transactionRepo.save(batch);
    
    // 发布审计事件
    eventBridge.publish("loyalty-point-events", batch.getMemberId(),
        new PointsExpiredEvent(batch.getMemberId(), batch.getRemainingAmount(), batch.getId()));
}
```
* 用户查询时惰性标记（可选）
```java
List<AccountTransaction> txs = transactionRepo.findByMemberId(memberId);
for (AccountTransaction tx : txs) {
    if ("ACTIVE".equals(tx.getStatus()) 
        && tx.getRemainingAmount().compareTo(BigDecimal.ZERO) > 0
        && tx.getExpiresAt() != null 
        && tx.getExpiresAt().isBefore(LocalDateTime.now())) {
        markAsExpired(tx);
    }
}
```
* 审计事件消费
PointsExpiredEvent 被 EventBridge 消费后：
生成一条 EXPIRATION 类型的审计流水（amount 为负数）
触发用户通知（微信模板消息等）
更新 member_account.total_expired（异步累加）


### 4.4 等级评估双轨制 (Tier Evaluation)
等级评估引擎监听 `is_tier_calc = true` 的资产变动，采用“**实时升级 + 定时保级**”双轨制执行。
* **实时升级评估 (Real-time Upgrade)**：
  * 在 `PointGrantService` 成功保存后，发出内部事件 `TierPointAccruedEvent`。
  * `TierEvaluationService` 监听到事件后，拉取 Program 配置的升降级阶梯矩阵（Tier Matrix）。
  * 若当前累计成长值跨越更高门槛，则立刻更新 `member_tier.tier_code`，重置 `effective_date` 为当前日期，并将变更记录记入 `tier_change_log`。
* **定时保级降级 (Scheduled Downgrade)**：
  * 为防止频繁跳级，降级评估依赖分布式定时任务 (如 XXL-JOB 或 Quartz)。
  * 每日凌晨，系统扫描 `next_evaluation_date <= 当前时间` 的会员。
  * 提取过去一个自然年（或固定周期）的成长值，若不满足保级条件，则向下逐级回退，直至匹配其成长值的等级。
### 4.5 积分碎片整理（Compaction）
* **FIFO 核销与碎片整理**
* 核销时锁定的行数问题**
FIFO 核销需要 SELECT ... FOR UPDATE 锁定所有可用批次。如果一个会员有上百条零碎积分，锁行数多，扫描开销大。

* 缓解方案：碎片整理（Compaction）
```java
// 低峰期或条件触发：当 ACTIVE 批次 > 阈值时
// 将多个非即将过期的同类型批次合并为一条
// 合并后的新批次 remaining_amount = SUM(原批次.remaining_amount)
// 原批次标记为 EXHAUSTED
```
重要：合并操作也需要在会员维度串行化（已由消息队列分区保证），且合并事务要短。
* 核销分摊明细
```sql
CREATE TABLE redemption_allocation (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    redemption_tx_id BIGINT NOT NULL,   -- 负向核销流水 ID
    accrual_tx_id BIGINT NOT NULL,      -- 原始发分流水 ID
    allocated_amount NUMERIC(18, 4) NOT NULL
);
```
意义：退款时，可精准恢复原始批次的生命周期（expires_at），而非新发一笔积分。
***

## 第五章：逆向交易与级联重算域 (无锁化补偿)
忠诚度系统最复杂的业务场景在于逆向交易（如历史订单退款）。退款不仅需要扣回原订单产生的积分，如果原订单曾触发过“会员升级”，退款还将导致后续所有订单的积分获取比例失效，这就是著名的“**级联重算效应（Cascade Recalculation Effect）**”。
本章详细规范了如何通过“异步无锁化快照”与“短事务差额补偿”机制，优雅、高性能地解决这一难题。
### 5.1 场景挑战与传统架构痛点
**场景重现**：
* 1月1日：用户购买 1000 元，获取 1000 积分，触发升级为【金卡】（享双倍积分特权）。
* 2月1日：用户购买 2000 元，按金卡双倍特权，获取 4000 积分。
* 3月1日：用户将 1月1日 的订单全额退款。
**传统架构痛点**：为了保证数据绝对正确，传统架构会在退款发生时，对该用户的积分账户加上排他锁（分布式锁或 DB 锁），然后按时间轴重新回放 1月1日 至今的所有交易。如果用户交易极为频繁，回放可能耗时数秒到数分钟。在此期间，用户如果在前端商城发生任何新交易，都会被系统直接阻断（账户假死），引发严重的客诉。
### 5.2 异步差额补偿机制 (Asynchronous Delta Compensation)
为了解决“假死”问题，系统摒弃强锁阻塞模式，采用后台影子回放与差额补偿（Delta）架构。退款重算期间，用户完全可以继续进行新的正向交易。
#### 5.2.1 架构流转步骤
1. **触发退款 (Trigger)**：系统接收到退单事件，首先全额回滚（或按比例扣减）原订单产生的积分。
2. **判断级联 (Check Cascade)**：如果原订单退单后，用户的“历史成长值”跌破了曾经的升级门槛，则判定需要触发级联重算，生成一条 `cascade_recalc_job` 异步任务。
3. **影子回放 (Shadow Replay)**：
   * 异步引擎拉取退款时间点（1月1日）至重算触发点（3月1日）期间的所有正向事件流水。
   * 在内存中构建一个虚拟影子账户 (Shadow Account)，剥离掉 1月1日 的退单金额，按当时的历史规则快照（`rule_snapshot`），将后续事件重新输入规则引擎进行推理。
4. **计算差额 (Calculate Delta)**：
   * 对比“影子账户的最终推演结果”与“当前真实账户的状态快照”。
   * 例如得出结论：因等级误判，多发了 2000 消费积分；当前应该降级为【银卡】。
5. **短事务补偿 (Atomic Commit)**：只在最后一步开启数据库强事务，用一条 UPDATE 语句扣减差额，耗时在几毫秒以内。
### 5.3 级联重算引擎伪代码 (Cascade Recalculation Logic)
以下伪代码规范了开发人员（或 AI 编码时）必须遵循的无锁化补偿范式：
级联重算任务的状态管理与重试机制
* cascade_recalc_job 表需维护任务状态：

* PENDING：待处理

* PROCESSING：正在执行

* COMPLETED：已完成

* FAILED：失败（超过最大重试次数）

故障恢复机制：
```java
/**
 * 定时扫描卡在 PROCESSING 状态超过阈值的任务，重置为 PENDING
 * 防止应用重启后任务永远卡死
 */
@Scheduled(fixedDelay = 60000) // 每分钟扫描一次
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
```
补偿事务幂等性约束：
```java
@Transactional
protected void applyCompensationWithShortTransaction(String memberId, AccountDelta delta, String jobId) {
    // 幂等校验：同一 jobId 的补偿只能执行一次
    if (compensationLogRepo.existsByJobId(jobId)) {
        return; // 已执行过，跳过
    }
    
    // ... 执行补偿逻辑 ...
    
    // 记录补偿完成（防重）
    compensationLogRepo.save(new CompensationLog(jobId, memberId, delta));
    jobRepo.markCompleted(jobId);
}
```
```java
/**
 * 级联重算由 CascadeRecalcJobProcessor 异步消费 cascade_recalc_job 表中的 PENDING 任务执行，而非简单的 @Async 注解。
 */ 
@Async
public void processCascadeRecalculation(String recalcJobId, String memberId, LocalDateTime reverseTime) {
    // 1. 加载回放时间轴上的所有正向事件 (不加锁)
    List<TransactionEvent> timelineEvents = eventRepo.findEventsAfter(memberId, reverseTime);

    // 2. 构建影子上下文，同时加载等级变更时间线
    ShadowContext shadowContext = buildShadowContext(memberId, reverseTime);

    // 3. 按时间轴逐事件回放
    for (TransactionEvent event : timelineEvents) {
        // 3a. 推进等级时间线：获取事件发生时刻的会员等级
        shadowContext.advanceToTime(event.getEventTime());

        // 3b. 获取产生该积分的规则历史版本
        //     退款前已产生的积分流水，已记录了 rule_snapshot_id
        String ruleSnapshotId = event.getRuleSnapshotId(); // 从历史流水中取
        RuleSnapshot snapshot = snapshotRepo.get(ruleSnapshotId);

        // 3c. 用当时的等级 + 当时的规则，重新评估该事件
        shadowContext.apply(ruleEngine.evaluate(shadowContext, event, snapshot));
    }

    // 4. 计算差额 Delta
    AccountDelta delta = calculateDelta(memberId, shadowContext);

    // 5. 【核心】极短事务提交补偿，不阻塞用户的新交易
    applyCompensationWithShortTransaction(memberId, delta, recalcJobId);
}

@Transactional
protected void applyCompensationWithShortTransaction(String memberId, AccountDelta delta, String jobId) {
    // 差额扣减：直接操作积分流水，不依赖 member_account 的余额字段
    if (delta.getPointsToDeduct().compareTo(BigDecimal.ZERO) > 0) {
        pointRedeemService.forceDeductWithOverdraft(
            memberId, 
            delta.getPointsToDeduct(), 
            "CASCADE_RECALC_DEDUCT"
        );
    }
    
    // 修正等级
    if (delta.getNewTier() != null) {
        Member member = memberRepo.findByMemberIdForUpdate(memberId);
        if (!member.getTierCode().equals(delta.getNewTier())) {
            String oldTier = member.getTierCode();
            member.setTierCode(delta.getNewTier());
            memberRepo.save(member);
            tierChangeLogRepo.save(new TierChangeLog(
                memberId, oldTier, delta.getNewTier(), "CASCADE_DOWNGRADE"
            ));
        }
    }
    
    jobRepo.markCompleted(jobId);
}
```
#### 5.3.1 ShadowContext 设计规范
```java
public class ShadowContext {
    private String memberId;
    
    // 时间轴上的等级变化线（从 tier_change_log 加载，按时间排序）
    private List<TierChangeEvent> tierTimeline;
    
    // 当前回放位置对应的等级
    private String currentTier;
    
    // 影子积分账户（纯内存，不落盘）
    private BigDecimal shadowBalance;
    private List<ShadowTransaction> shadowTransactions;

    /**
     * 推进时间轴到指定时刻，更新 currentTier 为该时刻应生效的等级
     */
    public void advanceToTime(LocalDateTime eventTime) {
        this.currentTier = tierTimeline.stream()
            .filter(t -> !t.getChangedAt().isAfter(eventTime))
            .max(Comparator.comparing(TierChangeEvent::getChangedAt))
            .map(TierChangeEvent::getNewTier)
            .orElse(getInitialTier());
    }

    /**
     * 获取初始等级（无变更记录时的默认等级）
     */
    private String getInitialTier() {
        // 从 Program 配置中读取默认入会等级
        return programConfig.getDefaultTier();
    }
}
```
* `ShadowContext` 的构建需要同时加载两类历史数据：
* `tier_change_log` 中该会员的所有等级变更记录，构建等级时间线
* `member` 表的初始入会等级作为时间线的起点
* 每次回放事件前，必须先调用 advanceToTime(eventTime) 将等级推到事件发生时刻应生效的状态，再用该状态参与规则推理。
### 5.4 积分退回与生命周期还原 (Redemption Reversal)
逆向交易不仅包含“买东西退货（扣回发出的积分）”，还包含“积分兑换后退换货（退回已扣除的积分）”。
在传统的简单架构中，退回积分往往是“新发一笔同等额度的积分，有效期重新计算”。但这在高级商业逻辑中是巨大的漏洞（用户快过期的积分通过“兑换再退款”实现了强制续期）。
本系统依托第四章设计的 `redemption_allocation` (核销分摊表)，实现生命周期的精准还原。
#### 5.4.1 退还积分执行逻辑
当接收到 `REDEMPTION_CANCEL` (取消兑换) 事件时，执行以下逻辑：
1. **追溯分摊记录**：根据原核销的 `redemption_transaction_id`，在 `redemption_allocation` 表中查出该笔兑换当时扣减了哪些原始批次（`accrual_transaction_id`）。
2. **批次还原**：
   * 找到原始的 `ACCRUAL` 批次流水。
   * 将分摊扣除的额度，加回至该批次的 `remaining_amount` 中。
   * 如果该批次的状态原为 `EXHAUSTED` (已耗尽)，将其恢复为 `ACTIVE`。
3. **过期判定重裁决**：
   * 系统检查该原始批次的 `expires_at`。
   * 如果 `expires_at` 晚于当前时间：积分正常恢复，用户可以继续使用。
   * 如果 `expires_at` 早于当前时间（已过期）：系统拦截该部分积分，直接触发 `EXPIRATION` (过期) 动作将其作废。但平台支持通过 `config_json` 配置 `refund_expired_points_grace_days`（退款过期积分宽限期），例如给予 7 天的挽回期，提升用户体验。
### 5.5 负资产 (Debt) 与系统级死信处理
如果逆向扣减时，用户账户余额已被清空，且扣减额度超过了第四章定义的 `overdraft_limit`（被动透支底线），系统将触发以下熔断保护：
* **停止扣减**：只将账户余额扣至允许的极限（如 0 或 -1000）。
* **生成追偿工单**：在 `negative_pending`（待冲抵挂账表）中记录未完成扣减的积分债务。
* **冻结高风险权益**：临时标记该用户的 `status` 为 `SUSPENDED_REDEMPTION`（禁止兑换），直至未来新入账的积分补齐该笔 `negative_pending` 的债务。
***
## 第六章：规则引擎、沙箱与自动化回归
本章规范了平台的核心“大脑”——规则引擎的架构设计。为了彻底解决传统 CRM 中“单点测试通过，上线后与老规则打架导致超发积分”的痛点，系统创新性地引入了 **AI 辅助生成**、**影子沙箱回放 (Shadow Sandbox)** 以及 **弱阻断强制放行 (Soft Block & Override)** 机制。
### 6.1 规则引擎基础架构 (Drools Integration)
平台采用 Drools 8 (KIE API) 作为基础规则引擎。为保障高并发下的线程安全与执行性能，必须遵循以下约束：
* **无状态会话 (Stateless Session)**：严禁使用 `StatefulKieSession`。每次事件推理必须创建一个全新的 `StatelessKieSession`，执行完毕后立刻释放，避免内存泄漏和并发污染。
* **KieBase 缓存热替换**：将编译好的 KieBase（规则库）按 Program 级别缓存在内存中。当有新规则发布时，原子替换该引用，实现规则热更新。
* **隔离的动作收集器 (Action Collector)**：DRL 脚本中绝对禁止直接调用 JPA/SQL 进行数据库操作。必须将发分、升级等指令推入线程安全的收集器，由外部的 `AccountTransactionService` 统一在事务中执行。
#### 6.1.1 动作执行器与事务一致性契约
`ActionCollector` 仅负责在规则推理过程中收集动作指令，严禁直接操作数据库。所有动作必须交由统一的 RewardExecutor 在单一数据库强事务中执行，确保积分发放与等级更新原子完成。
```java
@Service
public class RewardExecutor {
    
    @Autowired
    private PointGrantService pointGrantService;
    @Autowired
    private TierEvaluationService tierService;
    
    /**
     * 执行规则引擎产生的所有动作，必须在同一个事务中完成。
     * 任何一步失败，整个事务回滚，触发事件重试。
     */
    @Transactional
    public void executeRewards(String memberId, List<Action> actions) {
        for (Action action : actions) {
            if (action instanceof AwardPointsAction) {
                AwardPointsAction award = (AwardPointsAction) action;
                pointGrantService.grantPoints(
                    award.getProgramCode(), memberId, 
                    award.getAccountType(), award.getPoints(),
                    award.getRuleId(), award.getRuleSnapshotId()
                );
            } else if (action instanceof UpgradeTierAction) {
                UpgradeTierAction upgrade = (UpgradeTierAction) action;
                tierService.upgrade(memberId, upgrade.getNewTier(), upgrade.getReason());
            } else if (action instanceof DowngradeTierAction) {
                DowngradeTierAction downgrade = (DowngradeTierAction) action;
                tierService.downgrade(memberId, downgrade.getNewTier(), downgrade.getReason());
            }
            // 后续可扩展更多动作类型
        }
    }
}
```
* **AI 编码强制约束：**
* 禁止在 ActionCollector 或 DRL 脚本的 then 块中直接调用任何 JPA/SQL 操作。
* 禁止将 List<Action> 拆分为多个独立事务执行。
* 若 executeRewards 内抛出异常，事务全部回滚，由上层调用方（事件消费者）触发重试。

#### 6.1.2 KieBase 原子热替换与并发安全
当运营发布新规则或修改已有规则时，系统需要将重新编译的 KieBase 替换掉缓存中的旧版本。在高并发场景下，这个替换操作必须满足两个要求：

原子性：替换操作本身必须是原子的，不存在"读到一半旧、一半新"的中间状态。

无损切换：正在执行规则推理的线程不受影响，仍使用旧版本完成当前推理。

##### 6.1.2.1 基于 AtomicReference 的无锁原子替换
```java
@Component
@Slf4j
public class KieBaseCacheManager {

    // 使用 AtomicReference 保证引用更新的原子性
    private final ConcurrentHashMap<String, AtomicReference<KieBase>> cache = new ConcurrentHashMap<>();

    /**
     * 获取指定 Program 的当前 KieBase
     * 读取操作无锁，性能极高
     */
    public KieBase getKieBase(String programCode) {
        AtomicReference<KieBase> ref = cache.get(programCode);
        if (ref == null) {
            // 首次加载：双重检查锁定
            synchronized (this) {
                ref = cache.get(programCode);
                if (ref == null) {
                    KieBase kieBase = buildKieBase(programCode);
                    ref = new AtomicReference<>(kieBase);
                    cache.put(programCode, ref);
                }
            }
        }
        return ref.get(); // 原子读取，无锁
    }

    /**
     * 规则变更后，重新编译并原子替换 KieBase
     * 
     * 关键设计：
     * 1. 先构建新的 KieBase 对象（耗时操作，在锁外完成）
     * 2. 再通过 AtomicReference.set() 原子替换引用（瞬时操作）
     * 3. 旧 KieBase 仍被已获取引用的线程使用，等待 GC 回收
     */
    @Transactional
    public void refreshKieBase(String programCode) {
        // 1. 构建新版本 KieBase（可能耗时数百毫秒，但不在锁内）
        KieBase newKieBase = buildKieBase(programCode);
        
        // 2. 原子替换引用（纳秒级操作）
        AtomicReference<KieBase> ref = cache.get(programCode);
        if (ref == null) {
            synchronized (this) {
                ref = cache.get(programCode);
                if (ref == null) {
                    ref = new AtomicReference<>();
                    cache.put(programCode, ref);
                }
            }
        }
        
        KieBase oldKieBase = ref.getAndSet(newKieBase);
        log.info("Program [{}] KieBase 已热更新，旧版本将随 GC 回收", programCode);
        
        // 3. 可选：延迟清理旧 KieBase（如果内存敏感）
        //    不立即清理，因为可能有线程正在使用旧版本执行推理
    }

    /**
     * 编译 KieBase：从 DB 加载该 Program 的所有 ACTIVE 规则
     */
    private KieBase buildKieBase(String programCode) {
        List<Rule> activeRules = ruleRepo.findActiveByProgramCode(programCode);
        
        KieServices kieServices = KieServices.Factory.get();
        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();
        
        for (Rule rule : activeRules) {
            // 为每条规则生成唯一的 DRL 文件路径
            String drlPath = "src/main/resources/rules/" 
                + programCode + "/" + rule.getRuleId() + ".drl";
            kieFileSystem.write(drlPath, rule.getDrlContent());
        }
        
        KieBuilder kieBuilder = kieServices.newKieBuilder(kieFileSystem);
        kieBuilder.buildAll();
        
        if (kieBuilder.getResults().hasMessages(Message.Level.ERROR)) {
            throw new RuleCompileException("规则编译失败: " + kieBuilder.getResults().getMessages());
        }
        
        KieContainer kieContainer = kieServices.newKieContainer(
            kieServices.getRepository().getDefaultReleaseId()
        );
        return kieContainer.getKieBase();
    }
}
```
##### 6.1.2.2 规则推理时的版本一致性
```java
@Service
public class RuleEngineService {

    @Autowired
    private KieBaseCacheManager cacheManager;

    /**
     * 执行规则推理
     * 
     * 关键设计：
     * 1. 一次性获取 KieBase 引用并持有到推理结束
     * 2. 即使执行过程中发生热更新，本线程仍使用旧版本完成推理
     * 3. 不阻塞、不重试、不受影响
     */
    public List<Action> evaluate(String programCode, List<Object> facts) {
        // 获取当前 KieBase 的快照引用
        KieBase kieBase = cacheManager.getKieBase(programCode);
        
        // 创建无状态会话
        StatelessKieSession session = kieBase.newStatelessKieSession();
        
        // 设置全局动作收集器
        ActionCollector collector = new ActionCollector();
        session.setGlobal("collector", collector);
        
        // 插入事实并执行
        session.execute(facts);
        
        return collector.getActions();
    }
}
```
##### 6.1.2.3 规则发布触发热更新的完整流程
```java
@Service
public class RulePublishService {

    @Autowired
    private KieBaseCacheManager cacheManager;

    /**
     * 发布规则（含沙箱回归、审批、热更新）
     */
    @Transactional
    public void publishRule(String programCode, String ruleId, 
                            boolean forceOverride, String overrideReason) {
        
        // 1. 沙箱回归测试（见 6.3 节）
        RegressionReport report = regressionService.runShadowRegression(programCode, ruleId);
        
        // 2. 冲突拦截（见 6.4 节）
        if (report.hasCriticalWarning() && !forceOverride) {
            throw new RULE_CONFLICT_REQUIRES_OVERRIDE(report);
        }
        
        // 3. 更新规则状态为 ACTIVE，并生成快照
        Rule rule = ruleRepo.findByRuleId(ruleId);
        rule.setStatus("ACTIVE");
        ruleRepo.save(rule);
        
        // 保存规则快照（用于级联重算）
        RuleSnapshot snapshot = new RuleSnapshot(
            ruleId, programCode, rule.getDrlContent(), 
            rule.getSalience(), rule.getActivationGroup()
        );
        snapshotRepo.save(snapshot);
        
        // 4. 原子热更新 KieBase（不重启、不阻塞、不丢请求）
        cacheManager.refreshKieBase(programCode);
        
        // 5. 记录审计日志
        auditLog.record(programCode, "RULE_PUBLISH", ruleId, 
            forceOverride ? Map.of("forceOverride", true, "reason", overrideReason) : null);
    }

    /**
     * 下线规则
     */
    @Transactional
    public void deactivateRule(String programCode, String ruleId) {
        Rule rule = ruleRepo.findByRuleId(ruleId);
        rule.setStatus("INACTIVE");
        ruleRepo.save(rule);
        
        // 同样触发热更新，新的 KieBase 将不包含该规则
        cacheManager.refreshKieBase(programCode);
    }
}
```
##### 6.1.2.4 并发安全保证总结
|场景|行为|风险|
|--|--|--|
|线程 A 正在执行推理，线程 B 触发热更新	|线程 A 继续使用旧 KieBase 完成推理	|无风险|
|线程 A 执行一半，ref.getAndSet() 发生|	线程 A 持有的是旧引用（Java 引用是值传递），不受影响	|无风险|
|线程 C 在热更新后首次获取|	通过 ref.get() 获取到新 KieBase	|无风险，这正是期望行为|
|多个线程同时触发 refreshKieBase|	各自构建新 KieBase，最后一个 getAndSet 的生效	|轻微浪费，但无数据错误|
|buildKieBase() 编译失败	|抛出异常，ref 不变，继续使用旧版本|	安全降级，服务不中断|
**AI 编码强制约束：**
* 严禁将 KieBase 直接存储在普通成员变量中。
* 严禁使用 synchronized 包裹推理执行逻辑（会导致规则更新时所有推理线程阻塞）。
* 必须使用 AtomicReference 或等效的原子类管理 KieBase 引用。
### 6.2 AI 辅助规则生成与提示词约束 (AI Prompt Engineering)
系统允许运营人员通过自然语言（如：“用户如果在周末购买了苹果手机，且金额大于5000，额外送100分”）直接生成 Drools 规则。为了防止 AI 产生幻觉或引发规则冲突，必须在后端实现上下文拼接与 JSON 强输出约束。
#### 6.2.1 动态上下文注入 (Context Injection)
在调用大语言模型（LLM）前，后端自动收集当前 Program 的生产环境状态，拼接成系统提示词（System Prompt）：
```text
[System Context]
当前生产环境共有 35 条活跃规则。
正在使用的互斥组 (activation-group) 包括："GROUP_NEW_USER", "GROUP_FESTIVAL"
当前最高优先级 (salience) 为 1000。
[关键老规则摘要]
- Rule-ID: 101, Name: "常规消费", Salience: 100, Action: "1元=1分"
```
#### 6.2.2 AI JSON 结构强制契约
要求 LLM 输出标准化的 JSON 结构，同时生成规则代码与测试用例：
```json
{
  "analysis": "发现冲突风险：此规则可能与老规则 101 发生叠加，建议合理设置优先级。",
  "drl_code": "rule 'Apple_Weekend_Bonus' ```droolsn when ```droolsn $e:EventFact(...) ```droolsn then ```droolsn ... ```droolsn end",
  "salience_recommendation": {
    "salience": 150,
    "activation_group": null
  },
  "mock_test_cases": [
    {
      "scenario": "周末购买 6000 元苹果手机",
      "mock_event_payload": {"order_amount": 6000, "item": "iPhone"},
      "expected_delta_points": 100
    }
  ]
}
```
前端会将 `analysis` 呈现给运营人员作为警示，将 `mock_test_cases` 注入沙箱。
### 6.3 影子沙箱与自动化回归 (Shadow Sandbox Regression)
单条规则测试毫无意义，必须放到全局环境中进行交叉验证。平台提供自动化回放能力。
#### 6.3.1 回归测试数据源 (Regression Data Pool)
* **AI 模拟用例**：由上文 AI 自动生成的边界测试数据。
* **生产环境历史切片 (Production Snapshot)**：异步引擎自动从 `event_inbox` 表中拉取过去 7 天内成功处理的 500 条真实、多样化的交易流水。
#### 6.3.2 自动化回放伪代码 (Regression Execution Logic)
当运营人员点击“提交沙箱测试”时，系统执行以下双 KieSession 验证：
```java
public RegressionReport runShadowRegression(String programCode, String draftRuleDrl) {
    // 1. 构建双引擎环境
    KieBase baselineKie = ruleEngine.buildKieBase(programCode, RuleStatus.ACTIVE); // 仅线上老规则
    KieBase candidateKie = ruleEngine.buildKieBaseWithDraft(programCode, draftRuleDrl); // 老规则 + 新草稿
    
    // 2. 加载回放数据集 (7天生产切片 + AI 用例)
    List<EventFact> testSuite = loadRegressionDataset(programCode);
    RegressionReport report = new RegressionReport();
    
    // 3. 并发回放与 Diff 对比
    for (EventFact fact : testSuite) {
        // 基线执行
        List<Action> baselineActions = ruleEngine.evaluate(baselineKie, fact);
        // 候选执行
        List<Action> candidateActions = ruleEngine.evaluate(candidateKie, fact);
        
        // 对比结果 (计算 Delta)
        ActionDiff diff = compareActions(baselineActions, candidateActions);
        
        if (diff.hasUnexpectedDoubleReward()) {
            report.addCriticalWarning(fact, "发现未预期的叠加发分 (Double Reward)");
        } else if (diff.hasRuleShadowing()) {
            report.addWarning(fact, "老规则被互斥组遮蔽失效 (Shadowing)");
        }
        report.addTotalDeltaPoints(diff.getPointDifference());
    }
    
    return report;
}
```
### 6.4 弱阻断与强制放行机制 (Soft Block & Override)
如果沙箱回归报告发现了冲突，系统在业务管控上采用「弱阻断、强警告、重审计」策略。大促期间，运营往往需要“打破常规”，不能一味地进行物理死锁。
#### 6.4.1 警告分级 (Warning Levels)
* **绿色 (Pass)**：完全符合预期，新规则独立触发，无冗余叠加。允许常规提交。
* **黄色 (Warning)**：轻微规则遮蔽。高亮提示，允许常规提交。
* **红色 (Critical)**：发生严重的重复发分、优先级反转，或单笔产生天量积分。前端弹出强阻断确认框。
#### 6.4.2 强制放行接口契约与风控闭环
当遭遇红色警告但业务仍需强行上线时，要求 API 必须遵守以下规范：
* **接口参数强校验**：`POST /api/programs/{code}/rules/{id}/publish` 接口必须传入 `forceOverride = true` 和非空的 `overrideReason`。否则抛出 `RULE_CONFLICT_REQUIRES_OVERRIDE` 异常。
* **审批流升级**：带有 `forceOverride` 标签的规则，审批工作流将自动从“Program 管理员单签”升级为“高管双人会签”。
* **事后风控打标 (Audit Tagging)**：```drools
  该规则发布上线后，任何由此规则触发的 `account_transaction` 积分流水，其 JSON 扩展属性中必须自动打上风控标记：
  
  ```json
  {"risk_override": true, "override_by": "user_123"}
  ```
  这使得月底财务对账时，可以一键提取这部分“超发”的营销成本，做到责任可追溯。
***
## 第七章：全渠道会员通 SPI 统一接入与异构映射引擎
本章规范了系统如何与外部生态（天猫、京东、抖音、微信等）进行数据交互。传统方案中，每接入一个渠道都要硬编码一套接口，导致代码极度臃肿。本系统通过 **Unified SPI Gateway (统一服务提供者网关)** 与 **双轨制映射引擎**，实现“配置即接入”的标准化架构。
### 7.1 SPI 架构的本质与挑战
第三方平台的“会员通”通常采用 SPI (Service Provider Interface) 机制。即：第三方平台（如淘宝）作为客户端（Client），主动通过 Webhook 调用我们 SaaS 平台（Server）的接口。
**挑战 1**：极其激进的重试策略。例如京东 JOS 接口，如果 2 秒内未收到响应，会疯狂发起重试。如果不做幂等，会导致积分重复发放。
**挑战 2**：严苛的 HTTP 状态码。天猫和京东要求业务处理失败（如“会员已存在”）时，HTTP 状态码也必须返回 200 OK，并将错误信息封装在 JSON 中。如果返回 500，平台会认为系统宕机并触发限流降级。
**挑战 3**：1:N 异构数据转换。外部传来的常常是深层嵌套的 JSON 树（如订单头挂着几十个订单明细），系统需要将其“拍平”或拆解映射到内部的主从表中。
### 7.2 Unified SPI Gateway (统一 SPI 网关设计)
系统向所有第三方开放平台提供单一的标准化基础 Webhook 路径：
```text
POST /api/open/spi/{channel}/{programCode}/{action}
```
#### 7.2.1 策略模式接口契约 (Strategy Interface)
底层的验签和转换交由各渠道独立的适配器完成，网关层通过策略模式统一调度：
```java
public interface ChannelSpiHandler {
    // 渠道标识，如 "TMALL", "JD"
    String getChannelCode(); 
    // 1. 验签：解析 Header 和 Body，利用渠道配置 (AppSecret) 验证签名
    boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config);
    // 2. 报文转换与核心处理：返回第三方要求的特定 JSON 结构
    Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config);
    
    // 3. 构建渠道特定的错误格式响应 (必须确保对外响应解析为 HTTP 200)
    Object buildErrorResponse(Exception e);
}
```
#### 7.2.2 统一网关伪代码 (Gateway Controller Logic)
要求研发（或 AI 生成代码时）在 Controller 层必须实现幂等防重与超时隔离：
```java
@RestController
@RequestMapping("/api/open/spi/{channel}/{programCode}")
@Slf4j
public class SpiGatewayController {
    @Autowired
    private SpiHandlerFactory handlerFactory;
    
    @PostMapping("/{action}")
    public ResponseEntity<Object> handleSpi(@PathVariable String channel, @PathVariable String programCode,
                                            @PathVariable String action, HttpServletRequest request) {
        byte[] rawBody = readBody(request); 
        ChannelSpiHandler handler = handlerFactory.getHandler(channel);
        ChannelAdapterConfig config = configService.getValidConfig(programCode, channel);
        // 1. 安全验签拦截
        if (!handler.verifySignature(request, rawBody, config)) {
            spiLogService.logFailed(..., "SIGN_FAILED");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Signature Invalid");
        }
        // 2. 防雪崩隔离：限制单次处理最大耗时 2000ms
        CompletableFuture<Object> future = CompletableFuture.supplyAsync(() -> {
            // 【强制幂等】在 handleAction 内部，必须依赖第三方 request_id 做 Redis 防重
            return handler.handleAction(action, programCode, rawBody, config);
        }, spiThreadPool);
        try {
            Object spiResponse = future.get(2000, TimeUnit.MILLISECONDS);
            spiLogService.logSuccess(...);
            return ResponseEntity.ok(spiResponse);
            
        } catch (TimeoutException te) {
            log.error("SPI 响应超时", te);
            // 超时直接返回 HTTP 200 + 平台特定错误码，避免触发第三方熔断
            return ResponseEntity.ok(handler.buildErrorResponse(new BusinessException("TIMEOUT")));
        } catch (Exception e) {
            log.error("SPI 业务异常", e);
            // 业务异常（如余额不足、并发冲突）返回 HTTP 200 + 平台特定错误码
            return ResponseEntity.ok(handler.buildErrorResponse(e));
        }
    }
}
```
### 7.3 双轨制映射引擎 (Mapping Engine)
当 SPI 网关收到合法的 JSON 报文后，面临如何将其转换为内部系统能识别的 `TransactionEvent`（标准交易事件）。平台提供双轨制映射支持：
* **模式一：可视化连线 (VISUAL)**：前端通过 JSONPath 配置，如 `$.order.amount -> payload.order_amount`。适用于 80% 的简单场景。
* **模式二：高级脚本转换 (SCRIPT)**：利用 GraalVM JS 引擎 提供低代码映射，处理复杂聚合运算与 1:N 拆解。
#### 7.3.1 GraalVM 脚本安全沙箱设计 (JS Scripting Sandbox)
在 SaaS 平台执行用户或实施人员编写的 JavaScript 脚本极其危险（可能导致 CPU 死循环、内存 OOM 炸弹或反射调用宿主文件系统）。必须严格配置 GraalVM Context：
```java
public class ScriptingTransformer {
    public static Map<String, Object> transform(String jsCode, String sourceJson) {
        // 1. 极其严格的沙箱配置：绝对防御
        try (Context context = Context.newBuilder("js")
                .allowAllAccess(false)                 // 禁止特权访问
                .allowHostAccess(HostAccess.NONE)      // 严禁 JS 调用任何 Java 宿主类库
                .allowIO(false)                        // 严禁网络和文件 IO
                .allowNativeAccess(false)              // 严禁 Native 调用
                .option("engine.WarnInterpreterOnly", "false")
                .build()) {
            // 2. 防死循环限制：执行上限 50 毫秒
            context.interrupt(Duration.ofMillis(50));
            // 将原始 JSON 转换为 JS 对象并注入环境
            context.getBindings("js").putMember("sourceJsonStr", sourceJson);
            
            // 3. 执行用户编写的 transform 函数
            String executionWrapper = "const source = JSON.parse(sourceJsonStr);```droolsn" +
                                      jsCode + "```droolsn" +
                                      "JSON.stringify(transform(source));"; // 要求用户实现 transform(source) 
            
            Value result = context.eval("js", executionWrapper);
            
            return JSON.parseObject(result.asString(), new TypeReference<Map<String, Object>>() {});
            
        } catch (PolyglotException e) {
            // 发生超时、内存超限或语法错误，必须持久化到 DB 供实施人员 Debug
            throw new ScriptTransformException("脚本转换失败: " + e.getMessage(), e);
        }
    }
}
```
#### 7.3.2 脚本编写规范示例 (JS Code Template)
实施人员在前端代码编辑器中编写如下转换逻辑：
javascript
```
// 示例：将第三方发来的冗余订单报文，转换为平台标准的 1:N 实体结构
function transform(source) {
    // 1. 组装主表数据 (Event)
    let target = {
        event_type: "ORDER_PAID",
        member_id: source.user.mobile, // 将外部手机号映射为主键
        payload: {
            order_amount: source.order.total_fee / 100, // 分转元
            external_order_id: source.order.id
        },
        lines: [] // 预留 1:N 数组
    };
    // 2. 遍历拆解 1:N 明细 (Order Items)
    if (source.items && source.items.length > 0) {
        for (let i = 0; i < source.items.length; i++) {
            let item = source.items[i];
            if (item.status === 'PAID' && item.price > 0) {
                target.lines.push({
                    sku_code: item.sku,
                    goods_name: item.brand + ' - ' + item.title,
                    quantity: item.qty
                });
            }
        }
    }
    return target;
}
```
### 7.4 复杂 1:N 数据的级联持久化 (Cascade Persistence)
通过映射引擎（VISUAL 或 SCRIPT）清洗得到标准 JSON 后，底层的持久化服务必须在一个数据库强事务中将 1:N 的树状 JSON 拆分落盘，保障领域事件的一致性。
* **写主表**：解析 `target` 第一层，插入 `transaction_event` 表，获取底层的 `event_id`。
* **拆分子表**：识别 `target.lines` 等数组结构。
* **级联插入**：遍历子数组，将每个明细对象的 `parent_id` 强行设为刚才生成的 `event_id`，并统一插入到平台预留的 `custom_entity_data` 动态明细表中。
* **规则投递**：将整合后的事件连同其子明细一起封入 `EventFact`，投入 Drools 规则引擎（这样 Drools 就能写出类似于 “如果订单明细中包含指定的 SKU，则额外赠送 500 积分” 这样复杂的活动规则）。

### 7.5 事件标准化生命周期与死信处理
所有外部事件（SPI 回调、Open API 请求）在进入核心业务引擎前，必须经过 event_inbox 进行标准化处理。这是一个从“异构原始报文”到“标准 EventFact”的可靠转换过程。

#### 7.5.1 状态机定义
event_inbox.status 的完整状态流转：
```text
                  ┌──────────┐
                  │ RECEIVED │  原始报文已入库，等待处理
                  └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
                  │VALIDATING│  验签、幂等检查、基础字段校验
                  └────┬─────┘
                       │
              ┌────────┼────────┐
              │                 │
              ▼                 ▼
         ┌─────────┐      ┌──────────┐
         │VALIDATED│      │  REJECTED │  验签失败 / 幂等重复 / 字段缺失
         └────┬────┘      └──────────┘
              │
              ▼
         ┌──────────┐
         │PROCESSING│  执行映射引擎（VISUAL / SCRIPT），转换为 EventFact
         └────┬─────┘
              │
     ┌────────┼────────┐
     │                 │
     ▼                 ▼
┌──────────┐     ┌──────────┐
│COMPLETED │     │TRANSFORM │  映射/转换失败（脚本报错、字段缺失）
└──────────┘     │  _FAILED │
                 └────┬─────┘
                      │
                      ▼
                 ┌──────────┐
                 │RETRYING  │  自动重试（最多 3 次，指数退避）
                 └────┬─────┘
                      │
              ┌───────┼───────┐
              │               │
              ▼               ▼
         ┌──────────┐    ┌──────────┐
         │COMPLETED │    │  DEAD    │  重试耗尽，转入死信队列
         └──────────┘    └──────────┘
```
#### 7.5.2 各状态处理逻辑
```java
@Service
public class EventInboxProcessor {

    /**
     * 定时拉取 RECEIVED 状态的事件，推进到 VALIDATING
     */
    @Scheduled(fixedDelay = 1000)
    public void processReceived() {
        List<EventInbox> events = eventInboxRepo.findByStatus("RECEIVED", 100);
        for (EventInbox event : events) {
            event.setStatus("VALIDATING");
            eventInboxRepo.save(event);
            // 异步处理，避免阻塞拉取循环
            asyncProcessor.submit(() -> validateAndProcess(event));
        }
    }

    /**
     * 验签 + 幂等检查 + 基础校验
     */
    private void validateAndProcess(EventInbox event) {
        try {
            // 1. 幂等检查：同一 idempotency_key 是否已有 COMPLETED 记录
            if (eventInboxRepo.existsByIdempotencyKeyAndStatus(
                    event.getIdempotencyKey(), "COMPLETED")) {
                event.setStatus("REJECTED");
                event.setRejectReason("DUPLICATE");
                eventInboxRepo.save(event);
                return;
            }

            // 2. 基础字段校验
            if (StringUtils.isEmpty(event.getProgramCode()) 
                || StringUtils.isEmpty(event.getPayload())) {
                event.setStatus("REJECTED");
                event.setRejectReason("MISSING_FIELDS");
                eventInboxRepo.save(event);
                return;
            }

            // 3. 验签通过
            event.setStatus("VALIDATED");
            eventInboxRepo.save(event);

            // 4. 进入映射转换
            transformAndComplete(event);

        } catch (Exception e) {
            event.setStatus("TRANSFORM_FAILED");
            event.setRetryCount(event.getRetryCount() + 1);
            event.setLastError(e.getMessage());
            eventInboxRepo.save(event);
        }
    }

    /**
     * 映射引擎执行转换，成功后投递到 EventBridge
     */
    private void transformAndComplete(EventInbox event) {
        event.setStatus("PROCESSING");
        eventInboxRepo.save(event);

        try {
            // 根据渠道配置，选择映射模式
            ChannelAdapterConfig config = configService.getValidConfig(
                event.getProgramCode(), event.getChannel()
            );

            Map<String, Object> standardPayload;
            if ("SCRIPT".equals(config.getMappingMode())) {
                // 高级脚本模式：走 GraalVM 沙箱
                standardPayload = scriptingTransformer.transform(
                    config.getTransformScript(), event.getPayload().toString()
                );
            } else {
                // 可视化模式：走 JSONPath 映射
                standardPayload = visualMapper.transform(
                    config.getRequestMapping(), event.getPayload()
                );
            }

            // 构建标准 EventFact 并投递
            EventFact fact = EventFact.builder()
                .eventId(event.getId().toString())
                .programCode(event.getProgramCode())
                .memberId(extractMemberId(standardPayload))
                .eventType(extractEventType(standardPayload))
                .channel(event.getChannel())
                .eventTime(event.getCreatedAt())
                .idempotentKey(event.getIdempotencyKey())
                .payload(standardPayload)
                .ruleSnapshotId(config.getActiveRuleSnapshotId())
                .build();

            eventBridge.publish("loyalty-events", fact.getMemberId(), fact);

            event.setStatus("COMPLETED");
            eventInboxRepo.save(event);

        } catch (ScriptTransformException e) {
            // GraalVM 沙箱异常，记录转换日志供 Debug
            event.setTransformLogs(Map.of(
                "error", e.getMessage(),
                "script", config.getTransformScript()
            ));
            throw e; // 抛出，由外层 catch 转入 TRANSFORM_FAILED
        }
    }

    /**
     * 定时扫描 TRANSFORM_FAILED 状态的事件，执行重试（最多 3 次，指数退避）
     */
    @Scheduled(fixedDelay = 5000)
    public void retryFailed() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(1);
        List<EventInbox> failed = eventInboxRepo.findRetryable("TRANSFORM_FAILED", 3, threshold);
        for (EventInbox event : failed) {
            event.setStatus("RETRYING");
            event.setRetryCount(event.getRetryCount() + 1);
            eventInboxRepo.save(event);
            asyncProcessor.submit(() -> transformAndComplete(event));
        }
    }

    /**
     * 定时扫描重试耗尽的事件，转入死信并告警
     */
    @Scheduled(fixedDelay = 10000)
    public void moveToDead() {
        List<EventInbox> exhausted = eventInboxRepo.findExhaustedRetries("TRANSFORM_FAILED", 3);
        for (EventInbox event : exhausted) {
            event.setStatus("DEAD");
            eventInboxRepo.save(event);
            alertService.sendAlert(String.format(
                "事件标准化失败，已进入死信队列。id=%s, program=%s, channel=%s, error=%s",
                event.getId(), event.getProgramCode(), event.getChannel(), event.getLastError()
            ));
        }
    }
}
```
#### 7.5.3 死信处理策略
|状态|含义|处理方式|
|--|--|----|
|REJECTED|验签失败 / 幂等重复 / 字段缺失|保留记录供审计，不做重试。若为幂等重复则直接丢弃。|
|DEAD	映射转换失败，重试耗尽|	触发告警通知运维/实施人员。管理后台提供「死信重放」按钮，人工排查原因后可手动重试。|
死信重放接口：
```java
@PostMapping("/api/admin/events/{id}/replay")
public Response replayDeadEvent(@PathVariable Long id) {
    EventInbox event = eventInboxRepo.findById(id);
    if (!"DEAD".equals(event.getStatus())) {
        throw new BusinessException("ERR_INVALID_STATUS", "仅死信事件可重放");
    }
    // 重置状态，重新进入处理流程
    event.setStatus("RECEIVED");
    event.setRetryCount(0);
    event.setLastError(null);
    eventInboxRepo.save(event);
    return Response.success();
}
```
#### 7.5.4 event_inbox 表补充字段
```sql
ALTER TABLE event_inbox
ADD COLUMN retry_count INT DEFAULT 0,            -- 重试次数
ADD COLUMN max_retry INT DEFAULT 3,              -- 最大重试次数
ADD COLUMN last_error TEXT,                      -- 最近一次错误信息
ADD COLUMN reject_reason VARCHAR(50),            -- 拒绝原因（DUPLICATE / MISSING_FIELDS / SIGN_FAILED）
ADD COLUMN next_retry_at TIMESTAMPTZ;            -- 下次重试时间（指数退避）
```
***
## 第八章：管理界面设计与前端动态渲染
在 SaaS 平台中，运营人员对“活动规则”和“会员属性”的调整频率极高。如果每增加一个会员字段（如：增加“宠物种类”）都要经历“后端修改 DB -> 前端修改代码 -> 打包发版”的周期，将严重降低业务响应速度。本系统采用 **Schema-Driven UI (Schema 驱动 UI)** 架构。
### 8.1 总体思路：低代码设计器与运行态渲染器
我们将前端界面逻辑分为两层：
* **设计器态 (Form Builder)**：管理员在管理后台通过画布拖拽，配置会员动态属性或活动规则。配置结果保存为 JSON Schema。
* **运行态 (Renderer)**：前端界面根据后端下发的 JSON Schema，自动渲染表单、列表或详情页，无需关心具体字段。
### 8.2 核心技术栈选型
* **渲染引擎**：采用 **阿里 Formily (Formily.js)**。其特点是基于响应式编程模型，支持复杂的表单联动、异步校验，非常适合处理“规则引擎”级的复杂表单。
* **数据标准**：采用标准 JSON Schema 规范，后端存储结构即为 `Map<String, Object>` 的元数据定义。
#### 8.2.1 前端自定义组件注册机制

平台内置 Input、Select、NumberPicker 等基础组件，但企业级场景（如渠道选择器、上传图片、级联地址选择、特定行业组件）需要支持 Program 级别扩充自定义 x-component。
**组件注册规范：**
**后端 Schema 存储：**
在 program.config_json 的 field_schema 中，自定义组件通过 x-component 指定组件名，并通过 x-component-props 传递配置：
```json
{
  "store_selector": {
    "title": "归属门店",
    "type": "string",
    "x-component": "CustomStoreSelector",
    "x-component-props": {
      "source": "remote",
      "endpoint": "/api/stores",
      "multiple": false
    }
  }
}
```
**前端组件注册：**
Formily 支持全局组件注册机制，自定义组件在应用初始化时注册：
```javascript
import { createForm, setValidateLanguage } from '@formily/core';
import { FormProvider, Field } from '@formily/react';

// 自定义组件实现
const CustomStoreSelector = (props) => {
  // 根据 x-component-props 动态加载门店列表
  const { endpoint, multiple } = props;
  // ... 组件逻辑
};

// 全局注册，使其在 Schema 中可通过 x-component 引用
const componentRegistry = {
  'CustomStoreSelector': CustomStoreSelector,
  'ImageUploader': ImageUploader,
  'CascadingAddress': CascadingAddress,
};

// 在 SchemaField 渲染时，解析 x-component 并匹配注册的组件
const renderField = (schema) => {
  const Component = componentRegistry[schema['x-component']];
  if (!Component) {
    console.warn(`未注册的自定义组件: ${schema['x-component']}`);
    return <FallbackField schema={schema} />;
  }
  return <Component {...schema['x-component-props']} />;
};
```
**微前端扩展（高级场景）：**
若自定义组件需要独立部署和版本管理，后端 Schema 的 x-component-props 中可指定微前端子应用地址：
```json
{
  "x-component-props": {
    "microApp": "https://micro-apps.example.com/store-selector/1.0.0/index.js",
    "moduleName": "StoreSelector"
  }
}
```
前端通过 qiankun 或 Module Federation 动态加载远程组件。


### 8.3 动态渲染实现流程
#### 8.3.1 后端元数据存储
在 DB 中，针对每个 Program 配置动态 Schema：
```json
{
  "program_code": "BRAND-A",
  "field_schema": {
    "type": "object",
    "properties": {
      "pet_name": { "title": "宠物名称", "type": "string", "x-component": "Input" },
      "member_level_index": { "title": "会员等级指数", "type": "number", "x-component": "NumberPicker" }
    }
  }
}
```
#### 8.3.2 运行态渲染伪代码 (React + Formily 逻辑)
在会员详情页，前端通过 `useEffect` 拉取 Schema 并动态加载：
```javascript
import { createForm } from '@formily/core'
import { FormProvider, Field } from '@formily/react'
import { FormItem, Input, NumberPicker } from '@formily/antd'
const DynamicMemberEditor = ({ programCode, memberId }) => {
  const [schema, setSchema] = useState(null);
  const form = useMemo(() => createForm(), []);
  // 1. 初始化时，根据 Program 动态获取 Schema
  useEffect(() => {
    api.getMemberSchema(programCode).then(res => {
      setSchema(res.data.field_schema);
    });
  }, [programCode]);
  // 2. 渲染器根据 Schema 动态生成表单项
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
8.3.3 历史数据与 Schema 版本的兼容渲染
```json
{
  "member_id": "M8821",
  "ext_attributes": {
    "_schema_version": "v1.0.0",
    "pet_name": "旺财",
    "favorite_store": "朝阳店"
  },
  "schema_version": "v1.0.0",
  "current_schema_version": "v1.2.0"
}
```
前端渲染逻辑：

```javascript
const DynamicMemberDetail = ({ memberData, currentSchema, schemaVersions }) => {
  // 1. 取数据写入时的 Schema 版本
  const dataVersion = memberData.ext_attributes?._schema_version || memberData.schema_version;
  
  // 2. 获取对应版本的 Schema 定义
  const effectiveSchema = schemaVersions[dataVersion] || currentSchema;
  
  // 3. 用对应版本的 Schema 渲染表单
  //    当前版本中已删除的字段，仍按旧 Schema 以只读方式展示
  return (
    <FormProvider form={form}>
      <SchemaField schema={effectiveSchema} />
      {/* 标记废弃字段 */}
      {renderDeprecatedFields(memberData, dataVersion, currentSchema)}
    </FormProvider>
  );
};
```
### 8.4 兼容性策略：字段废弃处理
在 SaaS 架构中，随着时间推移，旧的动态字段会逐渐被淘汰。
* **废弃标记 (Deprecation)**：运营在设计器中删除字段时，系统不执行 SQL DROP COLUMN（因为这是 JSONB 动态字段，底层无需变动表结构），而是将 Schema 中的字段属性标记为 `deprecated: true`。
* **向下兼容展示**：
  * 只读态：对于历史会员数据中包含已废弃字段的情况，前端详情页应增加一个“显示历史遗留字段”的开关。
  * 编辑态：废弃字段默认从编辑表单中隐藏，防止运营人员误操作。
* **规则引用检查**：后端在保存 Schema 变更时，必须进行“依赖引用检查”，若规则引擎 DRL 脚本正在引用该字段，则严禁直接删除该字段，必须强制运营先修改规则。
* **Schema 变更前置校验（后端执行）：**
```java
@Transactional
public void deprecateField(String programCode, String entityType, String fieldKey) {
    // 1. 检查是否有活跃规则引用了该字段
    List<Rule> activeRules = ruleRepo.findActiveByProgramCode(programCode);
    for (Rule rule : activeRules) {
        if (rule.getDrlContent().contains("extAttributes[\"" + fieldKey + "\"]") ||
            rule.getDrlContent().contains("getExtString(\"" + fieldKey + "\")") ||
            rule.getDrlContent().contains("getExtNumber(\"" + fieldKey + "\")")) {
            throw new BusinessException("ERR_FIELD_IN_USE", 
                "字段 [" + fieldKey + "] 被规则 [" + rule.getRuleId() + "] 引用，请先修改规则后再废弃该字段");
        }
    }
    
    // 2. 检查通过后，标记字段为 deprecated（而非物理删除）
    schemaService.markFieldDeprecated(programCode, entityType, fieldKey);
}
```
**废弃字段的向下兼容展示策略：**
* 已废弃字段在编辑表单中默认隐藏，但在详情页的「历史遗留字段」折叠区域中仍可查看。
* 当 dataVersion < currentVersion 时，前端自动显示「数据版本已过期」提示，并开放「升级到最新版本」按钮（将旧 Schema 数据迁移为新 Schema 结构）。
### 8.5 复杂联动逻辑的实现
对于“当宠物种类选择为‘狗’时，显示‘犬种明细’字段”这类复杂联动，无需手动编写 JS 逻辑，只需在 Schema 中声明 `x-reactions`：
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
通过这种方式，运营人员只需在管理后台的 UI 设计器中勾选联动条件，即可实时更新所有终端（包括 Web 门户、小程序后台）的渲染逻辑。
***
## 第九章：多租户数据穿透与绝对防御体系
在多租户 SaaS 系统中，最严重的生产事故莫过于“数据穿透”（IDOR），即 A 租户的运营人员通过构造特殊的 API 请求，意外查看到 B 租户的会员数据。为了保障平台的金融级安全，我们建立了一套**四层物理防御架构**，从基础设施到底层代码逻辑进行全方位拦截。
### 9.1 全局上下文持有器 (TenantContext)
所有租户隔离的起点是 `TenantContext`。它利用 `ThreadLocal` 在当前执行线程中维护 `program_code`。
```java
public class TenantContext {
    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();
    public static void set(String programCode) { CURRENT_TENANT.set(programCode); }
    public static String get() { return CURRENT_TENANT.get(); }
    public static void clear() { CURRENT_TENANT.remove(); }
}
```
**强制纪律**：
* 每个 HTTP 请求进入时，`TenantFilter` 必须解析 Token 获取 `program_code` 并放入 `TenantContext`。
* 每个请求处理完毕（无论是成功还是异常），`finally` 块中必须调用 `TenantContext.clear()`，防止线程复用时污染下一个租户的上下文。
### 9.2 四层绝对防御体系
#### 第一层：入口防御 (Filter/Interceptor)
在 API 请求的最外层（如 `TenantFilter`），强制要求所有 Request 参数必须携带 `program_code`。若缺失，直接拒绝访问。
#### 第二层：ORM 语法树拦截器 (AST Interceptor)
这是最关键的防线。研发不需要在每一条 SQL 中手写 `AND program_code = ?`，而是通过底层拦截器自动注入：
```java
// 使用 MyBatis-Plus 或 JPA 拦截器示例
public class TenantSqlInterceptor implements InnerInterceptor {
    @Override
    public void beforeQuery(...) {
        // 自动解析当前执行的 SQL，判断是否为多租户表
        if (isMultiTenantTable(tableName)) {
            // 自动追加 WHERE program_code = '...'
            String tenantFilter = " AND program_code = '" + TenantContext.get() + "'";
            sql = sql + tenantFilter;
        }
    }
}
```
**防御意义**：即便开发人员写了 `memberRepo.findAll()`，系统也会自动变为 `SELECT * FROM member WHERE program_code = 'XYZ'`，物理杜绝穿透。
#### 第三层：中间件沙箱 (Cache & MQ Isolation)
* **Redis 防穿透**：Cache 统一通过 `TenantKeyGenerator` 生成，确保 Key 格式为 `tenant:{program_code}:member:{id}`。调用 `RedisTemplate` 时，若未感知租户前缀，统一抛出 Runtime 异常。
* **Kafka/EventBridge 校验**：消费者在 `handleEvent` 前，强制校验 `event.getProgramCode()` 是否与当前系统上下文一致，如果不一致，立即丢弃并触发熔断告警。
#### 第四层：查询校验哨兵 (Query Sentinel)
在 Service 层，禁止使用底层的 `repo.findById(Long id)`。所有查询方法必须强制要求 `program_code` 作为必传参数：
```java
// 错误写法
public Member getMember(Long id) {
    return memberRepo.findById(id); // 严禁使用，无法感知租户
}
// 正确写法 (Query Sentinel)
public Member getMember(Long id) {
    String tenant = TenantContext.get();
    return memberRepo.findByIdAndProgramCode(id, tenant); // 必须带上租户
}
```
### 9.3 异常处理与租户污染监控
为了及时发现租户隔离失效的隐患，系统开启了“租户污染探测器”：
* **防御审计**：在 `TenantContext.clear()` 前，检查当前线程是否遗留了非法的租户数据。若发现残留，记录到 `system_alert_log` 并触发运维告警。
* **越权访问追踪**：若在某个 API 中发生了由于传入错误的 `program_code` 而导致的数据库记录未找到（404），系统在底层通过异步审计日志记录：“用户尝试访问跨租户资源：请求租户```drools[A] -> 资源租户```drools[B]”。
### 9.4 安全性评审标准
对于后续所有的 Review，评审人必须校验以下检查点：
* Repository 层是否有不带 `program_code` 的 SQL？ (FAIL)
* 异步线程池 (ExecutorService) 是否在子线程中传递了 `TenantContext`？ (必须使用装饰器模式进行传递，防止子线程丢失租户上下文，FAIL)
* Redis Key 是否存在直接拼接？ (必须强制通过统一的 `TenantKeyGenerator` 生成，FAIL)
通过这一套防御体系，本平台实现了在单库逻辑隔离模式下，数据安全性达到金融级标准。
***
## 第十章：前后端 API 与技术规范
### 10.1 统一请求响应协议 (Uniform Response Schema)
为了降低前端适配成本，所有 API 必须采用统一的包裹结构，禁止直接返回数据实体。
```json
{
  "code": "SUCCESS",       // 业务状态码
  "message": "操作成功",    // 给用户看的提示
  "trace_id": "REQ-123",  // 全链路追踪 ID
  "data": { ... }         // 业务数据
}
```
### 10.2 通用 Header 约束
每个 API 请求必须携带以下 Header：
* `X-Program-Code`: 当前操作的租户 Program 代码。
* `X-Trace-Id`: 链路追踪 ID（若无，后端自动生成）。
* `Authorization`: Bearer JWT Token。
### 10.3 API 幂等性规范
所有涉及积分变动、订单回流的 POST/PUT 接口，必须实现幂等。
* 强制要求前端传入 `X-Idempotency-Key`（UUID）。
* 后端利用 Redis 存储该 Key 及其处理结果，过期时间 24 小时。
* 前置防重流程：
```java
public Response handleRequest(String idempotencyKey, RequestBody body) {
    // 1. Redis 检查：是否已处理过此幂等键
    String cacheKey = "idempotent:" + TenantContext.get() + ":" + idempotencyKey;
    Response cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        return cached;  // 直接返回上次处理结果
    }
    
    // 2. 未处理过，执行业务逻辑
    Response result = doBusinessLogic(body);
    
    // 3. 将结果缓存（24 小时过期）
    redisTemplate.opsForValue().set(cacheKey, result, 24, TimeUnit.HOURS);
    return result;
}
```
**注意：**依赖 created_at 的 DB 唯一索引仅作为最后防线，不能替代 Redis 前置防重。原因：account_transaction 为分区表，唯一索引必须包含 created_at，同一条业务请求若在不同秒级时间写入，created_at 可能不同，导致唯一索引失效。
### 10.4 错误处理规范
禁止在 API 层返回 HTTP 500。
* 400: 参数校验错误。
* 401: 认证失效。
* 403: 租户隔离拦截或权限不足。
* 429: 请求频率过高。
* 200: 即使发生业务失败（如“积分不足”），HTTP 状态码也应返回 200，并在 Body 中返回具体的业务错误码（如 `ERR_INSUFFICIENT_POINTS`）。
***
## 第十一章：数据库物理模型设计 (SQL 核心附录)
本附录包含支撑系统核心业务逻辑的 PostgreSQL 物理表结构，重点体现了 `program_code` 级隔离与 JSONB 扩展能力。


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
    member_id VARCHAR(64) NOT NULL UNIQUE,
    tier_code VARCHAR(16),
    status VARCHAR(16) NOT NULL,
    ext_attributes JSONB,
    schema_version VARCHAR(16),           -- ← 新增：写入该数据时的 Schema 版本号
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 全渠道唯一键表 (One-ID 核心)
CREATE TABLE member_unique_key (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    key_type VARCHAR(32) NOT NULL, -- MOBILE, WECHAT_UNIONID...
    key_value VARCHAR(128) NOT NULL,
    target_member_id VARCHAR(64) NOT NULL,
    UNIQUE (program_code, key_type, key_value)
);
-- 4. 积分流水表 (分区表，必须注意 PG 唯一索引限制)
CREATE TABLE account_transaction (
    id BIGSERIAL,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    operation_key VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    remaining_amount NUMERIC(18, 4),
    expires_at TIMESTAMPTZ,
    rule_id VARCHAR(64),              -- ← 新增：产生该积分的规则编号
    rule_snapshot_id VARCHAR(64),     -- ← 新增：规则当时的版本快照 ID
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
-- 注意：唯一索引必须包含分区键 created_atcreated_at 字段语义约束：
-- created_at 必须使用业务事件时间（即交易实际发生的时刻，由外部系统传入或 SPI 回调时间），而非数据库写入时的 NOW()。
-- 这保证了同一条业务事件在重试时，其 created_at 完全一致，使得分区键和唯一索引能真正发挥防重作用。
-- 若业务事件时间不可得，则退而求其次使用 idempotency_key 中的时间戳部分作为 created_at。

CREATE UNIQUE INDEX uk_at_idempotent_operation ON account_transaction(program_code, operation_key, created_at);
-- 5. 核销分摊明细 (对账核心)
CREATE TABLE redemption_allocation (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    redemption_tx_id BIGINT NOT NULL, -- 扣除流水
    accrual_tx_id BIGINT NOT NULL,    -- 原始发分流水
    allocated_amount NUMERIC(15, 2) NOT NULL
);
-- 6. 会员账户表 (含透支与信用额度)
CREATE TABLE member_account (
    account_id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(100) NOT NULL,
    member_id BIGINT NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    overdraft_limit DECIMAL(20,4) DEFAULT 0,
    credit_limit DECIMAL(20,4) DEFAULT 0,
    credit_used DECIMAL(20,4) DEFAULT 0,
    total_accrued DECIMAL(20,4) DEFAULT 0,    -- 累计获得（只增不减，报表用）
    total_redeemed DECIMAL(20,4) DEFAULT 0,   -- 累计消耗
    total_expired DECIMAL(20,4) DEFAULT 0,    -- 累计过期
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
-- 9. 事件收件箱 (含 GraalVM 沙箱错误日志)
CREATE TABLE event_inbox (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(300) NOT NULL,
    payload JSONB NOT NULL,
    transform_logs JSONB,
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 创建针对多租户的联合索引，确保拦截器生效
CREATE INDEX idx_all_tables_program_code ON member(program_code);
CREATE INDEX idx_all_tables_program_code_tx ON account_transaction(program_code, member_id);

-- 等级变更历史表（用于级联重算时还原等级时间线）
CREATE TABLE tier_change_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    old_tier VARCHAR(16),
    new_tier VARCHAR(16) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,  -- UPGRADE / DOWNGRADE / CASCADE_DOWNGRADE / MERGE
    changed_at TIMESTAMPTZ NOT NULL,     -- 等级生效时间
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tier_log_member_time ON tier_change_log(member_id, changed_at);
-- 规则版本快照表（用于级联重算时还原历史规则）
CREATE TABLE rule_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    rule_id VARCHAR(64) NOT NULL,
    drl_content TEXT NOT NULL,           -- 当时生效的 DRL 脚本完整内容
    salience INT,
    activation_group VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);  
```
***
## 第十二章：高并发与性能设计
* **有序分区消费**：通过 `LocalEventBus` 和 `KafkaEventBus`，均利用 `memberId` 作为分区键，保证同一会员的事件在单线程内串行处理，消除并发写冲突。
* **乐观锁与重试**：member_account 表采用 version 乐观锁，仅用于信用额度扣减（credit_used）等并发控制。积分余额本身通过消息队列按 memberId 分区串行化保障一致性，无需锁竞争。
* **碎片整理 (Compaction)**：当会员的 `ACTIVE` 流水批次超过 50 条时，低峰期触发后台合并任务，减少 FIFO 兑换时 `SELECT FOR UPDATE` 的行锁范围。
* **规则引擎无状态化**：Drools 全部使用 `StatelessKieSession`，KieBase 缓存热替换，实现毫秒级规则推理。
***
## 第十三章：部署架构与灾备
* **容器化部署**：整体基于 Kubernetes 进行微服务化部署，Drools 相关服务适当调大 JVM 堆内存。
* **数据库高可用**：PostgreSQL 采用 Patroni 自动 Failover，WAL 日志归档，RPO < 5 分钟。
* **Redis 哨兵模式**：保障分布式锁和缓存的高可用。
* **监控告警**：全链路接入 Prometheus + Grafana，对 SPI 超时、租户污染、级联重算积压等关键指标配置告警。
***
## 附录：AI 辅助开发分阶段 Prompt 执行计划
为了保证 AI 生成代码的完整性和稳健性，请按以下 5 个阶段投喂设计文档并生成代码：
| 阶段                    | 核心任务                                                                                                         | 关键产出            |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| **阶段一：防线基建与底层模型**     | 实现 `TenantContext`、`TenantContextFilter`、ORM 租户拦截器、`EventBridge` 及 `LocalEventBus`，生成核心 JPA 实体。              | 安全的底层骨架，杜绝数据穿透。 |
| **阶段二：SPI 统一网关与渠道集成** | 实现 `ChannelSpiHandler` 策略接口、`SpiGatewayController` (2000ms 超时+HTTP 200 异常封装)、`GraalVM ScriptingTransformer`。 | 全渠道 SPI 接入手架。   |
| **阶段三：核心账务与冲抵引擎**     | 实现 `PointGrantService`（瀑布流冲抵）、`PointRedeemService`（FIFO + Allocation）。                                       | 金融级积分账务核心。      |
| **阶段四：规则引擎与双沙箱回归**    | 生成 `EventFact` 等 Wrapper 类，构建 `RuleRegressionService`（双 KieSession 回放与 Diff 分析）。                             | AI 驱动规则安全上线。    |
| **阶段五：前端与 API 数据流打通** | 提供 JSON Schema 透传接口，完成带租户过滤的业务 API，落实 `findByIdAndProgramCode` 等安全查询。                                        | 前后端全链路闭环。       |
***
*本文档为忠诚度管理 SaaS 平台的最终架构基线，任何重大业务逻辑变更或技术选型调整必须更新此文档并重新通过架构评审。*
