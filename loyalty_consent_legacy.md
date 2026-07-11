***
## 一、Consent 的本质区别
| 维度                      |  **法律/服务同意（Legal/Terms Consent）**          |
| --------------            |  ----------------------------------------- |
| **典型场景**              | “是否同意俱乐部章程”、“是否同意隐私政策”                    |
| **法律依据**              |  GDPR 第 6(1)(b) 条（合同履行）或 第 6(1)(c) 条（法律义务） |
| **提供商品/服务的前提**    | ✅ **可以**（若不接受，则无法注册或继续使用服务）               |
| **撤销后果**              |  **账户注销或功能受限**（若拒绝章程，需退出俱乐部）               |
| **用户界面位置**           | “注册流程”、“账户设置”底部的强提示框                      |
| **版本控制**              | **必须做版本控制**（必须记录用户接受了哪个版本）                |
## 二、数据模型补充设计
### 2.1 法律/服务同意记录表（`loyalty_terms_acceptance`）
```sql
-- ============================================================
-- 法律/服务同意记录表（Terms & Conditions / Privacy Policy / Club Charter）
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_terms_acceptance (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    
    -- ===== 同意类型（支持多类型） =====
    terms_type VARCHAR(32) NOT NULL,           -- CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING
    terms_version VARCHAR(32) NOT NULL,        -- 版本号，如 "v2.3"
    
    -- ===== 同意状态 =====
    is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- ===== 元数据（审计关键） =====
    accepted_at TIMESTAMPTZ,                   -- 接受时间（NULL 表示未接受）
    accepted_ip INET,                          -- 接受时的 IP（合规关键）
    user_agent TEXT,                           -- 接受时的浏览器/设备
    source VARCHAR(32),                        -- WEB_APP / MOBILE_APP / MINI_PROGRAM / ADMIN
    
    -- ===== 被撤销/失效信息 =====
    revoked_at TIMESTAMPTZ,                    -- 如章程更新，旧版本记录被废止的时间
    revoked_by VARCHAR(64),                    -- 操作人（系统自动或管理员）
    revoked_reason VARCHAR(255),               -- 废止原因（如"新版章程发布"）
    
    -- ===== 元数据 =====
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 约束：一个会员+类型+版本唯一
    UNIQUE(member_id, terms_type, terms_version)
);
CREATE INDEX idx_lta_member ON loyalty_terms_acceptance(member_id);
CREATE INDEX idx_lta_type_version ON loyalty_terms_acceptance(terms_type, terms_version);
CREATE INDEX idx_lta_accepted ON loyalty_terms_acceptance(is_accepted) WHERE is_accepted = TRUE;
```
### 2.2 当前活动章程版本表（`loyalty_terms_master`）
维护当前的“最新版本”，用于登录/注册时判断是否需要弹窗让用户重新同意。
```sql
CREATE TABLE IF NOT EXISTS loyalty_terms_master (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    terms_type VARCHAR(32) NOT NULL,
    terms_version VARCHAR(32) NOT NULL,
    terms_content TEXT,                         -- 可选：存储纯文本或 URL 链接
    effective_date TIMESTAMPTZ NOT NULL,        -- 生效日期
    is_active BOOLEAN DEFAULT TRUE,
    released_by VARCHAR(64),
    released_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, terms_type, terms_version)
);
```
* **`loyalty_terms_acceptance`**（服务同意）：存储“是否同意俱乐部章程”。必须为 `TRUE`，否则会员账户处于受限或不可用状态。
## 三、业务逻辑实现
### 3.1 注册/登录时的检查逻辑
```java
@Service
@RequiredArgsConstructor
public class TermsService {
    private final TermsAcceptanceRepository termsRepo;
    private final TermsMasterRepository masterRepo;
    /**
     * 检查用户是否已接受最新版本的指定条款
     * 若未接受，应引导用户重新同意
     */
    public boolean isLatestTermsAccepted(String memberId, String termsType) {
        // 1. 查询当前生效的版本
        TermsMaster master = masterRepo.findActive(termsType);
        if (master == null) return true; // 无版本要求
        
        // 2. 查询用户是否接受了该版本
        TermsAcceptance acceptance = termsRepo.findByMemberIdAndTypeAndVersion(
                memberId, termsType, master.getTermsVersion()
        );
        return acceptance != null && acceptance.isAccepted();
    }
    /**
     * 执行接受操作（注册或更新章程时调用）
     */
    @Transactional
    public TermsAcceptance acceptTerms(String memberId, String termsType, String source, String ip) {
        TermsMaster master = masterRepo.findActive(termsType);
        if (master == null) {
            throw new BusinessException("无效的条款类型");
        }
        TermsAcceptance acceptance = new TermsAcceptance();
        acceptance.setMemberId(memberId);
        acceptance.setTermsType(termsType);
        acceptance.setTermsVersion(master.getTermsVersion());
        acceptance.setAccepted(true);
        acceptance.setAcceptedAt(Instant.now());
        acceptance.setAcceptedIp(InetAddress.getByName(ip));
        acceptance.setUserAgent(WebUtils.getUserAgent());
        acceptance.setSource(source);
        
        return termsRepo.save(acceptance);
    }
}
```
### 3.2 会员状态与条款挂钩
当用户注册时：
```java
// 注册流程：必须先通过“同意章程”检查，才能创建会员
public Member register(RegisterRequest request) {
    // 1. 检查是否已同意最新章程（通常会随注册请求一起提交）
    if (!request.isTermsAccepted()) {
        throw new BusinessException("必须同意俱乐部章程才能注册");
    }
    
    // 2. 创建会员
    Member member = memberRepo.save(...);
    
    // 3. 记录同意记录（与会员创建在同一事务中）
    termsService.acceptTerms(member.getMemberId(), "CHARTER", "REGISTER", request.getClientIp());
    
    return member;
}
```
### 3.3 章程更新时的处理（版本升级）
当法务更新了俱乐部章程（`terms_version` 升级），旧版本变为非活跃，但历史记录仍然保留（`revoked_at` 标记）。
系统需要为所有活跃会员生成“重新同意”任务（或等待用户下次登录时弹出提示）。
```java
// 登录拦截器：若会员未同意新版本章程，则重定向到章程确认页
@Component
public class TermsInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, ...) {
        String memberId = getCurrentMemberId();
        // 检查是否接受了最新章程
        if (!termsService.isLatestTermsAccepted(memberId, "CHARTER")) {
            response.sendRedirect("/terms/confirm?redirect=" + request.getRequestURI());
            return false;
        }
        return true;
    }
}
```
## 四、前端界面设计（会员端）
### 4.1 注册流程中的强制同意
```text
┌─ 注册会员 ──────────────────────────────────────────────────────────────────┐
│  📱 手机号: [_______________]                                              │
│  🔒 验证码: [____] [获取验证码]                                            │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  ✅ 我已阅读并同意《俱乐部章程》v2.3                             │   │
│  │  点击查看详细内容 >                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [立即注册]                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 账户设置中的版本提示（章程更新时）
```text
┌─ 我的账户 ──────────────────────────────────────────────────────────────────┐
│  🔔 重要通知：《俱乐部章程》已于 2026-06-01 更新                           │
│  请阅读并同意新版本以继续享受会员权益。                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  [查看更新内容]  [我同意新章程 v3.0]                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 五、更新后的 Consent 体系全景图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Loyalty Consent 体系                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │              类型1：服务/法律同意（Terms & Conditions）                │ │
│  │              数据表：loyalty_terms_acceptance                         │ │
│  │              特点：强制 + 版本控制 + 影响账户状态                     │ │
│  │              场景：注册章程、隐私政策、数据处理协议                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 六、总结
| 问题                          | 答案                                              |
| --------------------------- | ----------------------------------------------- |
| **注册时同意俱乐部章程属于 Consent 吗？** | ✅ 属于 Consent，但属于**“服务/法律同意（Legal Consent）”**    |
| **它和我们之前设计的营销偏好有什么区别？**     | 营销偏好看心情开关，法律同意看身份存续（不接受就不能当会员）                  |
| **技术上怎么存？**                 | 存在独立的 `loyalty_terms_acceptance` 表中（记录版本和 IP 等） |
| **为什么不能和营销偏好放一起？**          | 法律要求严格：必须记录用户同意了哪个具体版本（`v2.3`），而营销偏好只需要记录开关状态   |
