# 多渠道会员通与 One-ID 统一身份识别系统设计文档
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：2.0
> **设计目标**：
>
> * 构建**独立可插拔**的多渠道会员通模块，支持天猫、京东等平台会员身份打通
>
> * 建立**可配置**的 One-ID 统一身份识别体系，支持手机号优先、邮箱优先等多种策略
>
> * 重构渠道标识存储从列存储（`member_unique_key`）迁移到行存储（`member_channel_binding`），解决查询效率、元数据存储、多渠道扩展等问题
>
> * 提供完整的配置界面与运营工具，支持开通/关闭渠道、配置匹配策略、查看渠道绑定详情
## 一、整体架构
### 1.1 模块关系图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Loyalty 平台                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │               会员通模块（Multi-Channel Member Pass）                │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │   │
│  │  │  天猫会员通   │  │  京东会员通   │  │  微信会员通   │  (可插拔) │   │
│  │  │  (TMALL)     │  │  (JD)        │  │  (WECHAT)    │          │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘          │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              One-ID 身份匹配引擎                             │   │   │
│  │  │  · 策略驱动（手机号优先 / 邮箱优先 / 混合）                  │   │   │
│  │  │  · 分层匹配（OMID → 双因素 → OUID → 密文 → 加密等价）       │   │   │
│  │  │  · 冲突检测与二次验证                                        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │           渠道绑定存储（member_channel_binding）             │   │   │
│  │  │  · 行存储：每个渠道一条记录                                  │   │   │
│  │  │  · 完整元数据：昵称、头像、授权时间、加密手机等              │   │   │
│  │  │  · 软删除支持解绑追溯                                       │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 核心流程
```text
外部渠道请求（天猫/京东/微信）
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  1. 渠道适配层（Channel Adapter）                                         │
│     · 验签 · 解析请求 · 提取身份标识（OUID/PIN/OpenID）                   │
│     · 提取加密手机号（mix_mobile/encrypt_mobile）                         │
└───────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  2. One-ID 匹配引擎                                                       │
│     · 按策略优先级匹配（手机号/邮箱/OUID/...）                            │
│     · 双因素验证（OUID + 密文手机）                                       │
│     · 加密等价匹配（密文 vs 明文）                                        │
│     · 冲突检测与二次验证                                                  │
└───────────────────────────────────────────────────────────────────────────┘
        │
        ├── 匹配成功 ──┐
        │              ▼
        │   ┌─────────────────────────────────────────────────────────────┐
        │   │  3. 渠道绑定                                                │
        │   │     · 存储/更新 member_channel_binding                      │
        │   │     · 补充存储密文手机号                                    │
        │   │     · 更新会员信息（昵称、头像等）                          │
        │   └─────────────────────────────────────────────────────────────┘
        │              │
        └── 匹配失败 ──┘
                       ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  4. 创建新会员                                               │
        │     · 生成 One-ID（雪花算法）                                │
        │     · 创建 member 记录                                       │
        │     · 创建 member_channel_binding 记录                       │
        └─────────────────────────────────────────────────────────────┘
```
## 二、数据模型设计
### 2.1 渠道绑定主表（`member_channel_binding`）- 新增
将原来的列存储（`member_unique_key`）重构为行存储，每个渠道一条记录。
```sql
-- ============================================================
-- 会员渠道绑定主表（重构）
-- ============================================================
CREATE TABLE member_channel_binding (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    channel VARCHAR(32) NOT NULL,              -- TMALL / JD / WECHAT / DOUYIN / POS
    
    -- ===== 渠道身份标识 =====
    channel_user_id VARCHAR(128),              -- 渠道用户ID（OUID/PIN/OpenID）
    channel_union_id VARCHAR(128),             -- 渠道跨域ID（OMID/UnionID）
    
    -- ===== 渠道元数据 =====
    channel_nickname VARCHAR(200),             -- 渠道昵称
    channel_avatar VARCHAR(500),               -- 渠道头像
    channel_mobile_plain VARCHAR(32),          -- 明文手机号（如有）
    channel_mobile_encrypted VARCHAR(128),     -- 加密手机号
    encrypt_type VARCHAR(32),                  -- 加密类型：TMALL_MD5 / JD_ENCRYPT
    
    -- ===== 授权与状态 =====
    authorized_at TIMESTAMPTZ,
    authorized_scopes JSONB,
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',      -- ACTIVE / INACTIVE / REVOKED
    
    -- ===== 扩展与审计 =====
    channel_ext_data JSONB,
    last_verified_at TIMESTAMPTZ,
    unbind_at TIMESTAMPTZ,
    unbind_by VARCHAR(64),
    unbind_reason VARCHAR(255),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, channel, channel_user_id)
);
-- 索引
CREATE INDEX idx_mcb_member ON member_channel_binding(program_code, member_id);
CREATE INDEX idx_mcb_channel ON member_channel_binding(program_code, channel);
CREATE INDEX idx_mcb_user_id ON member_channel_binding(program_code, channel, channel_user_id);
CREATE INDEX idx_mcb_mobile ON member_channel_binding(channel_mobile_encrypted);
CREATE INDEX idx_mcb_status ON member_channel_binding(program_code, status);
```
### 2.2 会员主表（`member`）- 扩展
```sql
-- ============================================================
-- 会员主表（增加 One-ID 相关字段）
-- ============================================================
-- 已有字段保持不变，新增以下字段
ALTER TABLE member ADD COLUMN email VARCHAR(128);
ALTER TABLE member ADD COLUMN email_verified BOOLEAN DEFAULT false;
ALTER TABLE member ADD COLUMN phone_verified BOOLEAN DEFAULT false;
ALTER TABLE member ADD COLUMN primary_identity_type VARCHAR(20) DEFAULT 'PHONE';  -- PHONE / EMAIL
-- 索引
CREATE INDEX idx_member_email ON member(email);
CREATE INDEX idx_member_phone ON member(phone);
```
### 2.3 One-ID 策略配置表（`one_id_strategy`）- 新增
```sql
-- ============================================================
-- One-ID 策略配置表
-- ============================================================
CREATE TABLE one_id_strategy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    strategy_code VARCHAR(64) NOT NULL,        -- PHONE_PRIMARY / EMAIL_PRIMARY / HYBRID
    strategy_name VARCHAR(128) NOT NULL,
    
    -- ===== 优先级配置 =====
    priority_fields JSONB NOT NULL,            -- [{"field": "email", "weight": 10}, {"field": "phone", "weight": 5}]
    
    -- ===== 匹配规则 =====
    matching_rules JSONB,
    
    -- ===== 状态 =====
    status VARCHAR(20) DEFAULT 'ACTIVE',
    is_default BOOLEAN DEFAULT false,
    description TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, strategy_code)
);
```
### 2.4 渠道加密配置表（`channel_crypto_config`）- 新增
```sql
-- ============================================================
-- 渠道加密配置表
-- ============================================================
CREATE TABLE channel_crypto_config (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    encrypt_type VARCHAR(32) NOT NULL,         -- TMALL_MD5 / JD_ENCRYPT
    encrypt_algorithm VARCHAR(64),             -- MD5 / SHA256
    salt VARCHAR(128),                         -- 加密盐值（加密存储）
    algorithm_config JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel)
);
```
### 2.5 会员通渠道配置表（`channel_member_pass_config`）- 新增
```sql
-- ============================================================
-- 会员通渠道配置表（控制开通/关闭）
-- ============================================================
CREATE TABLE channel_member_pass_config (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,              -- TMALL / JD
    enabled BOOLEAN DEFAULT false,
    channel_config JSONB,
    
    -- 渠道特有配置
    tmall_salt VARCHAR(64),
    jd_salt VARCHAR(64),
    
    -- 默认值配置
    default_points INT DEFAULT 0,
    default_tier VARCHAR(32) DEFAULT 'BASE',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel)
);
```
### 2.6 冲突日志表（`member_identity_conflict_log`）- 新增
```sql
-- ============================================================
-- 身份冲突日志表
-- ============================================================
CREATE TABLE member_identity_conflict_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    conflict_type VARCHAR(32),                 -- OUID_MOBILE_MISMATCH / EMAIL_MISMATCH
    field_a VARCHAR(64),                       -- 冲突字段名
    value_a VARCHAR(256),                      -- 冲突字段值A
    value_b VARCHAR(256),                      -- 冲突字段值B
    member_a_id VARCHAR(64),
    member_b_id VARCHAR(64),
    status VARCHAR(20) DEFAULT 'PENDING',      -- PENDING / RESOLVED / IGNORED
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    resolution VARCHAR(32),                    -- MERGED / KEEP_SEPARATE
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 2.7 表结构变更清单（`member_unique_key` 迁移）
```sql
-- ============================================================
-- 数据迁移：从 member_unique_key 到 member_channel_binding
-- ============================================================
-- Step 1: 先创建新表（见 2.1）
-- Step 2: 迁移数据（按渠道分组，聚合到一条记录）
INSERT INTO member_channel_binding (
    id, program_code, member_id, channel, 
    channel_user_id, channel_union_id, status,
    created_at, updated_at
)
SELECT 
    gen_random_uuid()::text,
    program_code,
    target_member_id,
    CASE 
        WHEN key_type = 'TMALL_OUID' THEN 'TMALL'
        WHEN key_type = 'TMALL_OMID' THEN 'TMALL'
        WHEN key_type = 'JD_PIN' THEN 'JD'
        WHEN key_type = 'WECHAT_OPENID' THEN 'WECHAT'
        WHEN key_type = 'DOUYIN_OPENID' THEN 'DOUYIN'
        ELSE 'UNKNOWN'
    END,
    key_value,
    CASE WHEN key_type IN ('TMALL_OMID') THEN key_value ELSE NULL END,
    status,
    created_at,
    updated_at
FROM member_unique_key
WHERE key_type IN ('TMALL_OUID', 'TMALL_OMID', 'JD_PIN', 'WECHAT_OPENID', 'DOUYIN_OPENID');
-- Step 3: 处理同一会员多行聚合（OMID 放入 channel_union_id）
-- 此步骤根据实际数据情况调整
-- Step 4: 验证数据完整性后，可逐步废弃 member_unique_key 表
```
### 2.8 数据模型关系图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              member 表                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  member_id: M_001    │  phone: 13811111111   │  email: user@...   │   │
│  │  primary_identity_type: PHONE  │  status: ENROLLED                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │ 1:N                                         │
│                              ▼                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                      member_channel_binding 表                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  channel: TMALL   │  channel_user_id: tb_123   │  status: ACTIVE   │   │
│  │  channel_nickname: 天猫用户张三   │  channel_mobile_encrypted: xxx │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  channel: JD      │  channel_user_id: jd_456   │  status: ACTIVE   │   │
│  │  channel_nickname: 京东用户张三   │  channel_mobile_encrypted: yyy │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  channel: WECHAT  │  channel_user_id: oxc_789  │  status: INACTIVE │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      one_id_strategy 表                              │   │
│  │  strategy_code: PHONE_PRIMARY                                        │   │
│  │  priority_fields: [{"field":"phone","weight":10},{"field":"email",5}]│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 三、One-ID 策略设计
### 3.1 策略类型
| 策略代码            | 名称    | 匹配优先级                | 适用场景     |
| --------------- | ----- | -------------------- | -------- |
| `PHONE_PRIMARY` | 手机号优先 | 手机号 → 邮箱 → 渠道ID → 其他 | 中国市场（默认） |
| `EMAIL_PRIMARY` | 邮箱优先  | 邮箱 → 手机号 → 渠道ID → 其他 | 欧美市场、B2B |
| `HYBRID`        | 混合策略  | 根据渠道来源动态决定           | 多区域运营    |
### 3.2 优先级配置示例
```json
// 手机号优先
{
  "priority_fields": [
    { "field": "phone", "weight": 10, "required": true },
    { "field": "email", "weight": 5, "required": false },
    { "field": "channel_user_id", "weight": 3, "required": false }
  ],
  "matching_rules": {
    "phone": { "exact_match": true, "normalize": true },
    "email": { "case_insensitive": true }
  }
}
// 邮箱优先
{
  "priority_fields": [
    { "field": "email", "weight": 10, "required": true },
    { "field": "phone", "weight": 5, "required": false },
    { "field": "channel_user_id", "weight": 3, "required": false }
  ],
  "matching_rules": {
    "email": { "case_insensitive": true },
    "phone": { "exact_match": true }
  }
}
```
### 3.3 匹配优先级（完整版）
```text
第零层：OMID/UnionID 匹配（品牌级跨店铺标识）—— 最高优先级
   ↓ 未命中
第一层：双因素匹配（渠道ID + 加密手机同时匹配）—— 最安全
   ↓ 未命中
第二层：策略主字段匹配（手机号或邮箱，按策略配置）
   ↓ 未命中
第三层：渠道ID匹配（OUID/PIN/OpenID）—— 高优先级
   ↓ 未命中
第四层：加密手机直接匹配（已存储的密文）—— 中优先级
   ↓ 未命中
第五层：加密等价匹配（密文 vs 明文）—— 中优先级（兜底）
   ↓ 未命中
第六层：创建新的 One-ID
```
## 四、会员通模块设计
### 4.1 模块架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         会员通模块（可插拔）                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  渠道适配器接口 (ChannelAdapter)                                    │   │
│  │  · 验签 · 参数转换 · 响应封装                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│          ┌───────────────┼───────────────┐                                 │
│          ▼               ▼               ▼                                 │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                    │
│  │ TmallAdapter  │ │  JdAdapter    │ │ WechatAdapter │                    │
│  │ · bind/query  │ │ · bind/query  │ │ · bind/query  │                    │
│  │ · bind        │ │ · bind        │ │ · bind        │                    │
│  │ · register    │ │ · register    │ │ · register    │                    │
│  │ · query       │ │ · query       │ │ · query       │                    │
│  └───────────────┘ └───────────────┘ └───────────────┘                    │
│                          │                                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  会员通核心服务 (MemberPassService)                                  │   │
│  │  · 匹配引擎调用 · 绑定/解绑 · 注册 · 查询                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 渠道适配器接口
```java
public interface ChannelAdapter {
    /**
     * 渠道代码
     */
    String getChannel();
    
    /**
     * 验签
     */
    boolean verifySignature(HttpServletRequest request, byte[] body, ChannelMemberPassConfig config);
    
    /**
     * 绑定查询
     */
    BindQueryResponse bindQuery(BindQueryRequest request);
    
    /**
     * 绑定（含解绑）
     */
    BindResponse bind(BindRequest request);
    
    /**
     * 注册
     */
    RegisterResponse register(RegisterRequest request);
    
    /**
     * 会员查询
     */
    QueryResponse query(QueryRequest request);
}
```
### 4.3 会员通核心服务
```java
@Service
public class MemberPassService {
    
    @Autowired
    private OneIdMatcher oneIdMatcher;
    @Autowired
    private ChannelBindingService bindingService;
    @Autowired
    private ChannelCryptoService cryptoService;
    
    /**
     * 绑定查询
     */
    public BindQueryResponse bindQuery(String programCode, String channel, BindQueryRequest request) {
        // 1. 构建匹配请求
        MatchRequest matchRequest = MatchRequest.builder()
            .programCode(programCode)
            .channel(channel)
            .channelUserId(request.getChannelUserId())
            .channelUnionId(request.getChannelUnionId())
            .encryptedMobile(request.getEncryptedMobile())
            .plainMobile(request.getPlainMobile())
            .email(request.getEmail())
            .build();
        
        // 2. 执行身份匹配
        MatchResult result = oneIdMatcher.match(matchRequest);
        
        // 3. 构建响应
        BindQueryResponse response = new BindQueryResponse();
        if (result.isFound()) {
            Member member = memberRepo.findByMemberId(result.getMemberId());
            response.setBindable(true);
            response.setBindCode("SUC");
            response.setMember(MemberInfo.from(member));
        } else if (result.isConflict()) {
            response.setBindable(false);
            response.setBindCode("E02");  // 已被绑定
        } else {
            response.setBindable(false);
            response.setBindCode("E04");  // 可注册
        }
        return response;
    }
    
    /**
     * 绑定
     */
    @Transactional
    public BindResponse bind(String programCode, String channel, BindRequest request) {
        // 1. 解绑处理
        if ("2".equals(request.getType())) {
            return unbind(programCode, channel, request);
        }
        
        // 2. 身份匹配
        MatchResult result = oneIdMatcher.match(buildMatchRequest(request));
        if (!result.isFound()) {
            return BindResponse.error("E02", "会员不存在");
        }
        
        // 3. 执行绑定
        bindingService.bindChannel(programCode, result.getMemberId(), channel, request);
        
        return BindResponse.success(result.getMemberId());
    }
}
```
## 五、核心逻辑伪代码
### 5.1 One-ID 匹配引擎
```java
@Service
public class OneIdMatcher {
    
    @Autowired
    private OneIdStrategyService strategyService;
    @Autowired
    private ChannelBindingRepository bindingRepo;
    @Autowired
    private MemberRepository memberRepo;
    @Autowired
    private ConflictLogRepository conflictRepo;
    @Autowired
    private ChannelCryptoService cryptoService;
    
    /**
     * 核心匹配方法
     */
    public MatchResult match(MatchRequest request) {
        String programCode = request.getProgramCode();
        String channel = request.getChannel();
        
        // 1. 第零层：OMID/UnionID 匹配
        if (request.getChannelUnionId() != null) {
            ChannelBinding binding = bindingRepo.findByProgramCodeAndChannelAndUnionId(
                programCode, channel, request.getChannelUnionId()
            );
            if (binding != null && "ACTIVE".equals(binding.getStatus())) {
                return MatchResult.found(binding.getMemberId(), "UNION_ID");
            }
        }
        
        // 2. 加载策略
        OneIdStrategy strategy = strategyService.getStrategy(programCode);
        JSONArray priorityFields = strategy.getPriorityFields();
        
        // 3. 按策略优先级匹配
        for (Object obj : priorityFields) {
            JSONObject fieldConfig = (JSONObject) obj;
            String field = fieldConfig.getString("field");
            String value = getFieldValue(request, field);
            
            if (value == null || value.isEmpty()) {
                continue;
            }
            
            // 双因素匹配（渠道ID + 加密手机同时匹配）
            if ("channel_user_id".equals(field) && request.getEncryptedMobile() != null) {
                ChannelBinding byId = bindingRepo.findByProgramCodeAndChannelAndUserId(
                    programCode, channel, value
                );
                if (byId != null && "ACTIVE".equals(byId.getStatus())) {
                    // OUID 匹配 → 检查密文是否一致
                    if (byId.getChannelMobileEncrypted() != null &&
                        byId.getChannelMobileEncrypted().equals(request.getEncryptedMobile())) {
                        return MatchResult.found(byId.getMemberId(), "DUAL_FACTOR");
                    }
                    // OUID 匹配但密文不匹配 → 二次验证
                    return MatchResult.needVerification(byId.getMemberId(), "MOBILE_MISMATCH");
                }
            }
            
            // 普通字段匹配
            ChannelBinding binding = bindingRepo.findByProgramCodeAndFieldAndValue(
                programCode, field, value
            );
            if (binding != null && "ACTIVE".equals(binding.getStatus())) {
                return MatchResult.found(binding.getMemberId(), field);
            }
        }
        
        // 4. 加密等价匹配（兜底）
        if (request.getEncryptedMobile() != null) {
            // 查询所有有明文手机号的会员
            List<Member> members = memberRepo.findByProgramCodeAndPhoneIsNotNull(programCode);
            for (Member member : members) {
                if (cryptoService.verifyEncryptedMobile(
                    programCode, channel, member.getPhone(), 
                    request.getEncryptedMobile(), request.getEncryptType()
                )) {
                    // 匹配成功 → 补充存储密文
                    bindingService.saveEncryptedMobile(member.getMemberId(), channel, 
                        request.getEncryptedMobile(), request.getEncryptType());
                    return MatchResult.found(member.getMemberId(), "ENCRYPTED_EQUIVALENCE");
                }
            }
        }
        
        // 5. 未匹配 → 创建新会员（标记为待创建，由调用方决定）
        return MatchResult.notFound();
    }
}
```
### 5.2 渠道绑定服务
```java
@Service
public class ChannelBindingService {
    
    @Autowired
    private ChannelBindingRepository bindingRepo;
    @Autowired
    private MemberRepository memberRepo;
    
    @Transactional
    public void bindChannel(String programCode, String memberId, 
                            String channel, BindRequest request) {
        // 1. 检查是否已存在绑定
        ChannelBinding existing = bindingRepo.findByProgramCodeAndChannelAndUserId(
            programCode, channel, request.getChannelUserId()
        );
        
        if (existing == null) {
            // 2. 新建绑定
            ChannelBinding binding = new ChannelBinding();
            binding.setProgramCode(programCode);
            binding.setMemberId(memberId);
            binding.setChannel(channel);
            binding.setChannelUserId(request.getChannelUserId());
            binding.setChannelUnionId(request.getChannelUnionId());
            binding.setChannelNickname(request.getNickname());
            binding.setChannelAvatar(request.getAvatar());
            binding.setChannelMobileEncrypted(request.getEncryptedMobile());
            binding.setEncryptType(request.getEncryptType());
            binding.setAuthorizedAt(LocalDateTime.now());
            binding.setStatus("ACTIVE");
            bindingRepo.save(binding);
            return;
        }
        
        // 3. 存在绑定
        if ("INACTIVE".equals(existing.getStatus())) {
            // 重新激活
            existing.setStatus("ACTIVE");
            existing.setMemberId(memberId);
            existing.setChannelNickname(request.getNickname());
            existing.setChannelAvatar(request.getAvatar());
            existing.setAuthorizedAt(LocalDateTime.now());
            bindingRepo.save(existing);
            return;
        }
        
        // 4. ACTIVE 状态 → 更新信息
        existing.setChannelNickname(request.getNickname());
        existing.setChannelAvatar(request.getAvatar());
        existing.setChannelMobileEncrypted(request.getEncryptedMobile());
        existing.setUpdatedAt(LocalDateTime.now());
        bindingRepo.save(existing);
    }
}
```
### 5.3 加密等价匹配服务
```java
@Service
public class ChannelCryptoService {
    
    @Autowired
    private ChannelCryptoConfigRepository configRepo;
    
    public String generateEncryptedMobile(String programCode, String channel, 
                                           String plainMobile, String encryptType) {
        ChannelCryptoConfig config = configRepo.findByProgramCodeAndChannelAndEncryptType(
            programCode, channel, encryptType
        );
        if (config == null) {
            throw new BusinessException("未找到加密配置");
        }
        
        String normalized = normalizePhoneNumber(plainMobile);
        String algorithm = config.getEncryptAlgorithm();
        String salt = config.getSalt();
        
        if ("MD5".equals(algorithm)) {
            return DigestUtils.md5Hex(normalized + salt);
        } else if ("SHA256".equals(algorithm)) {
            return DigestUtils.sha256Hex(normalized + salt);
        }
        throw new BusinessException("不支持的加密算法");
    }
    
    public boolean verifyEncryptedMobile(String programCode, String channel,
                                          String plainMobile, String encryptedMobile,
                                          String encryptType) {
        String generated = generateEncryptedMobile(programCode, channel, plainMobile, encryptType);
        return MessageDigest.isEqual(
            generated.getBytes(StandardCharsets.UTF_8),
            encryptedMobile.getBytes(StandardCharsets.UTF_8)
        );
    }
}
```
## 六、界面设计
### 6.1 会员通开关配置（系统设置 → 渠道会员通）
```text
┌─ 渠道会员通配置 ────────────────────────────────────────────────────────────┐
│  Program: [BRAND_A ▼]                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────┬──────────┬──────────┬──────────────┬──────────────────────────────┐│
│  │   │ 渠道     │ 状态     │ 配置         │ 操作                         ││
│  ├────┼──────────┼──────────┼──────────────┼──────────────────────────────┤│
│  │ 1  │ 天猫     │ ● 已开通 │ 加密Salt: ***│ [编辑] [关闭]                ││
│  │ 2  │ 京东     │ ○ 未开通 │ -            │ [开通]                       ││
│  │ 3  │ 微信     │ ○ 未开通 │ -            │ [开通]                       ││
│  └────┴──────────┴──────────┴──────────────┴──────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```
### 6.2 One-ID 策略配置
```text
┌─ One-ID 策略配置 ──────────────────────────────────────────────────────────┐
│  Program: [BRAND_A ▼]                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────┬────────────┬──────────────┬──────────────────────┬─────────────────┐│
│  │   │ 策略名称   │ 策略代码     │ 优先级               │ 操作            ││
│  ├────┼────────────┼──────────────┼──────────────────────┼─────────────────┤│
│  │ 1  │ 手机号优先 │ PHONE_PRIMARY│ 手机号 → 邮箱 → OUID │ [编辑] [设为默认]││
│  │ 2  │ 邮箱优先   │ EMAIL_PRIMARY│ 邮箱 → 手机号 → OUID │ [编辑]          ││
│  └────┴────────────┴──────────────┴──────────────────────┴─────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```
### 6.3 会员详情页 - 渠道绑定展示
```text
┌─ 会员渠道关联 ──────────────────────────────────────────────────────────────┐
│  会员：张三  |  M_12345                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┬────────────┬────────────┬──────────┬────────────────────────┐│
│  │ 渠道     │ 用户ID     │ 昵称       │ 状态     │ 授权时间              ││
│  ├──────────┼────────────┼────────────┼──────────┼────────────────────────┤│
│  │ 天猫     │ tb_123     │ 张三       │ ● 已绑定 │ 2026-01-01 10:00:00   ││
│  │ 京东     │ jd_456     │ 张三       │ ● 已绑定 │ 2026-02-01 10:00:00   ││
│  │ 微信     │ oxc_789    │ 张三       │ ○ 已解绑 │ 2026-03-01 10:00:00   ││
│  └──────────┴────────────┴────────────┴──────────┴────────────────────────┘│
│                                                                             │
│  主要身份标识：手机号 (138****5678)                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 七、API 设计
### 7.1 会员通 SPI 接口（渠道调用）
| 方法   | 路径                                   | 说明    |
| ---- | ------------------------------------ | ----- |
| POST | `/api/spi/{channel}/bind/query`      | 绑定查询  |
| POST | `/api/spi/{channel}/bind`            | 绑定/解绑 |
| POST | `/api/spi/{channel}/member/register` | 注册    |
| POST | `/api/spi/{channel}/query`           | 会员查询  |
### 7.2 管理 API
| 方法   | 路径                                          | 说明       |
| ---- | ------------------------------------------- | -------- |
| GET  | `/api/admin/channel-pass/config`            | 获取渠道配置   |
| PUT  | `/api/admin/channel-pass/config`            | 更新渠道配置   |
| POST | `/api/admin/channel-pass/{channel}/enable`  | 开通渠道     |
| POST | `/api/admin/channel-pass/{channel}/disable` | 关闭渠道     |
| GET  | `/api/admin/one-id/strategy`                | 获取策略配置   |
| PUT  | `/api/admin/one-id/strategy`                | 更新策略配置   |
| GET  | `/api/admin/channel-binding/{memberId}`     | 获取会员渠道绑定 |
## 八、实施步骤
| 阶段          | 任务             | 说明                                                                                                 |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------- |
| **Phase 1** | 创建新表           | `member_channel_binding`, `one_id_strategy`, `channel_crypto_config`, `channel_member_pass_config` |
| **Phase 2** | 数据迁移           | 从 `member_unique_key` 迁移数据到 `member_channel_binding`                                               |
| **Phase 3** | 实现 One-ID 匹配引擎 | `OneIdMatcher` + 策略加载                                                                              |
| **Phase 4** | 实现会员通核心服务      | `MemberPassService` + 渠道适配器                                                                        |
| **Phase 5** | 实现天猫适配器        | 绑定查询、绑定、注册、查询 SPI                                                                                  |
| **Phase 6** | 实现京东适配器        | 同上                                                                                                 |
| **Phase 7** | 前端界面           | 渠道开通、策略配置、渠道绑定展示                                                                                   |
| **Phase 8** | 测试与发布          | 单元测试 + 集成测试                                                                                        |
## 九、总结
| 核心能力            | 实现方式                                          |
| --------------- | --------------------------------------------- |
| **会员通可插拔**      | `channel_member_pass_config` 表 + 路由拦截器控制开通/关闭 |
| **One-ID 策略配置** | `one_id_strategy` 表 + 策略加载服务                  |
| **身份匹配**        | 分层匹配（OMID → 双因素 → OUID → 密文 → 加密等价）           |
| **渠道绑定存储**      | `member_channel_binding` 行存储，每渠道一条记录          |
| **加密等价匹配**      | `channel_crypto_config` 配置加密算法 + 盐值           |
| **冲突检测与处理**     | `member_identity_conflict_log` 记录冲突，人工处理      |
| **双因素验证**       | OUID + 密文手机同时匹配才通过                            |
