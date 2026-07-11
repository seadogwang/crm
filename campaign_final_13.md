## 第13章：Content & Compliance Governance（内容与合规治理层）详细设计
Content & Compliance Governance 是 Campaign Tools 的**“内容防火墙与审批闸门”**，介于 **Decision Engine（决策层）** 和 **Channel Adapter（发送层）** 之间，确保所有营销内容在触达用户之前经过完整的合规审批流程，并支持素材的版本管理、个性化变量绑定及审计追溯。
***
## 13.0 模块概述
### 13.0.1 本质定义
Content & Compliance Governance 是 Campaign Tools 的**内容生命周期管理平台**，涵盖：
* **素材管理（Asset Management）**：统一管理邮件、短信、Push 等模板的创建、编辑、版本控制
* **合规审批（Approval Workflow）**：强制所有发送内容经过审批，支持多级审批、超时自动处理
* **个性化渲染（Personalization Rendering）**：基于会员数据动态填充模板变量
* **审计追溯（Audit Trail）**：完整记录素材变更历史和审批决策
### 13.0.2 核心设计原则（与 Loyalty 融合）
| 原则                   | 说明                                                                    |
| -------------------- | --------------------------------------------------------------------- |
| **审批是硬闸门**           | 未经审批的素材**严禁**被任何 Channel Worker 发送，Worker 发送前必须校验 `status = APPROVED` |
| **复用 Loyalty 审批流能力** | 审批记录可与 Loyalty 现有 `operation_log` 或独立审批表关联，但不强制复用                     |
| **个性化变量标准化**         | 定义统一的变量占位符语法 `{{variable_name}}`，支持会员属性、订单属性等                         |
| **版本可追溯**            | 每次修改产生新版本，历史版本可恢复，支持审计                                                |
### 13.0.3 系统架构图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Content & Compliance Governance                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Content Service (素材管理)                       │   │
│  │  · 创建/更新/删除素材                                               │   │
│  │  · 版本管理 (每次修改生成新版本)                                    │   │
│  │  · 变量 Schema 提取与校验                                           │   │
│  │  · 素材搜索与分类                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Approval Service (审批流)                        │   │
│  │  · 提交审批 (PENDING_APPROVAL)                                     │   │
│  │  · 审批通过/拒绝 (APPROVED / REJECTED)                             │   │
│  │  · 超时自动处理 (可配置)                                            │   │
│  │  · 审批历史查询                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Rendering Service (渲染引擎)                    │   │
│  │  · 变量提取与校验                                                    │   │
│  │  · 基于会员数据的动态渲染                                            │   │
│  │  · 渲染结果预览 (供审批人查看)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Audit & Compliance (审计合规)                    │   │
│  │  · 素材变更历史                                                      │   │
│  │  · 审批操作日志                                                      │   │
│  │  · 合规报告生成                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ 调用/集成
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 能力层                                      │
│  · MemberService (会员数据)                                               │
│  · ChannelService (消息发送)                                              │
│  · EventBridge (事件发布)                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 13.1 数据模型设计
### 13.1.1 内容素材表（campaign\_content\_asset）
存储所有素材模板的核心信息。
```sql
CREATE TABLE campaign_content_asset (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,              -- 关联 Loyalty Program
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(32) NOT NULL,                -- EMAIL_HTML / SMS_TEXT / PUSH_JSON / IMAGE
    channel VARCHAR(32) NOT NULL,                   -- EMAIL / SMS / PUSH
    -- 内容字段（根据类型不同使用不同字段）
    subject_line VARCHAR(255),                      -- 邮件主题（EMAIL 专用）
    body_text TEXT,                                 -- 邮件正文 HTML 或短信纯文本
    body_json JSONB,                                -- Push 或复杂结构的 JSON 内容
    -- 变量定义
    variable_schema JSONB NOT NULL,                 -- 变量占位符定义：{"user_name": "string", "product": "string"}
    -- 状态与审批
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',    -- DRAFT / PENDING_APPROVAL / APPROVED / REJECTED / ARCHIVED
    version INT DEFAULT 1,
    -- 元数据
    created_by VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    rejected_by VARCHAR(64),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    -- 时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- 唯一约束
    UNIQUE(program_code, asset_name, version)
);
CREATE INDEX idx_cca_program ON campaign_content_asset(program_code);
CREATE INDEX idx_cca_status ON campaign_content_asset(status);
CREATE INDEX idx_cca_type ON campaign_content_asset(asset_type);
CREATE INDEX idx_cca_channel ON campaign_content_asset(channel);
CREATE INDEX idx_cca_created ON campaign_content_asset(created_at DESC);
```
### 13.1.2 素材版本历史表（campaign\_content\_asset\_history）
记录每一次素材修改的历史快照。
```sql
CREATE TABLE campaign_content_asset_history (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    asset_name VARCHAR(255),
    subject_line VARCHAR(255),
    body_text TEXT,
    body_json JSONB,
    variable_schema JSONB,
    status VARCHAR(32),
    changed_by VARCHAR(64),
    change_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccah_asset ON campaign_content_asset_history(asset_id);
CREATE INDEX idx_ccah_version ON campaign_content_asset_history(asset_id, version);
CREATE INDEX idx_ccah_created ON campaign_content_asset_history(created_at DESC);
```
### 13.1.3 审批记录表（campaign\_approval\_record）
存储每次审批请求的完整生命周期。
```sql
CREATE TABLE campaign_approval_record (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64),                            -- 可选：关联具体的 Campaign Plan
    node_id VARCHAR(64),                            -- 可选：关联 Canvas 节点
    -- 审批人信息
    requester_id VARCHAR(64) NOT NULL,
    approver_id VARCHAR(64),
    -- 审批动作
    action VARCHAR(32) NOT NULL,                    -- SUBMITTED / APPROVED / REJECTED / REVOKED / TIMEOUT
    comment TEXT,
    -- 审批前快照（用于审计）
    snapshot_before JSONB NOT NULL,                 -- 审批前的完整素材内容
    snapshot_after JSONB,                           -- 审批后可能修改的内容
    -- 超时配置
    timeout_hours INT DEFAULT 24,
    -- 时间
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_car_asset ON campaign_approval_record(asset_id);
CREATE INDEX idx_car_plan ON campaign_approval_record(plan_id);
CREATE INDEX idx_car_approver ON campaign_approval_record(approver_id);
CREATE INDEX idx_car_action ON campaign_approval_record(action);
CREATE INDEX idx_car_submitted ON campaign_approval_record(submitted_at DESC);
```
### 13.1.4 变量绑定配置表（campaign\_variable\_binding）
存储针对不同分群或 Campaign 的变量默认值或映射规则。
```sql
CREATE TABLE campaign_variable_binding (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    asset_id VARCHAR(64),                           -- 可选：绑定到具体素材
    plan_id VARCHAR(64),                            -- 可选：绑定到具体 Plan
    segment_code VARCHAR(64),                       -- 可选：绑定到具体分群
    variable_bindings JSONB NOT NULL,               -- 变量默认值或表达式：{"user_name": "Dear Customer"}
    priority INT DEFAULT 100,                       -- 优先级（数字小优先）
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cvb_program ON campaign_variable_binding(program_code);
CREATE INDEX idx_cvb_asset ON campaign_variable_binding(asset_id);
CREATE INDEX idx_cvb_plan ON campaign_variable_binding(plan_id);
CREATE INDEX idx_cvb_segment ON campaign_variable_binding(segment_code);
```
***
## 13.2 后端 Service 详细设计
### 13.2.1 素材管理服务（ContentService）
```java
package com.loyalty.platform.campaign.content.service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.loyalty.platform.campaign.content.model.ContentAsset;
import com.loyalty.platform.campaign.content.model.ContentAssetHistory;
import com.loyalty.platform.campaign.content.repository.ContentAssetRepository;
import com.loyalty.platform.campaign.content.repository.ContentAssetHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
@Slf4j
@Service
@RequiredArgsConstructor
public class ContentService {
    private final ContentAssetRepository assetRepository;
    private final ContentAssetHistoryRepository historyRepository;
    private final ApprovalService approvalService;
    private final ObjectMapper objectMapper;
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{\\s*([a-zA-Z_][a-zA-Z0-9_.]*)\\s*\\}\\}");
    /**
     * 创建素材（DRAFT 状态）
     */
    @Transactional
    public ContentAsset createAsset(CreateAssetRequest request) {
        // 1. 提取变量 Schema
        JsonNode variableSchema = extractVariableSchema(request.getBodyText(), request.getBodyJson());
        // 2. 构建素材实体
        ContentAsset asset = ContentAsset.builder()
                .id(UUID.randomUUID().toString())
                .programCode(request.getProgramCode())
                .assetName(request.getAssetName())
                .assetType(request.getAssetType())
                .channel(request.getChannel())
                .subjectLine(request.getSubjectLine())
                .bodyText(request.getBodyText())
                .bodyJson(request.getBodyJson())
                .variableSchema(variableSchema)
                .status("DRAFT")
                .version(1)
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        asset = assetRepository.save(asset);
        // 3. 记录历史
        saveHistory(asset, "CREATED", null);
        log.info("Content asset created: id={}, name={}, program={}",
                asset.getId(), asset.getAssetName(), asset.getProgramCode());
        return asset;
    }
    /**
     * 更新素材（仅 DRAFT 或 REJECTED 状态可编辑）
     */
    @Transactional
    public ContentAsset updateAsset(String assetId, UpdateAssetRequest request) {
        ContentAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Asset not found: " + assetId));
        if (!"DRAFT".equals(asset.getStatus()) && !"REJECTED".equals(asset.getStatus())) {
            throw new IllegalStateException("Asset cannot be updated in status: " + asset.getStatus());
        }
        // 1. 保存旧版本快照到历史
        saveHistory(asset, "BEFORE_UPDATE", null);
        // 2. 更新字段
        if (request.getAssetName() != null) asset.setAssetName(request.getAssetName());
        if (request.getSubjectLine() != null) asset.setSubjectLine(request.getSubjectLine());
        if (request.getBodyText() != null) asset.setBodyText(request.getBodyText());
        if (request.getBodyJson() != null) asset.setBodyJson(request.getBodyJson());
        // 3. 重新提取变量 Schema
        JsonNode newSchema = extractVariableSchema(asset.getBodyText(), asset.getBodyJson());
        asset.setVariableSchema(newSchema);
        // 4. 版本号 +1
        asset.setVersion(asset.getVersion() + 1);
        asset.setUpdatedAt(Instant.now());
        // 5. 如果之前被拒绝，重置为 DRAFT
        if ("REJECTED".equals(asset.getStatus())) {
            asset.setStatus("DRAFT");
        }
        asset = assetRepository.save(asset);
        // 6. 记录更新后历史
        saveHistory(asset, "AFTER_UPDATE", request.getChangeComment());
        log.info("Content asset updated: id={}, version={}", asset.getId(), asset.getVersion());
        return asset;
    }
    /**
     * 提交审批
     */
    @Transactional
    public void submitForApproval(String assetId, String requesterId) {
        ContentAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Asset not found: " + assetId));
        if (!"DRAFT".equals(asset.getStatus()) && !"REJECTED".equals(asset.getStatus())) {
            throw new IllegalStateException("Only DRAFT or REJECTED asset can be submitted: " + asset.getStatus());
        }
        // 1. 更新素材状态
        asset.setStatus("PENDING_APPROVAL");
        asset.setUpdatedAt(Instant.now());
        assetRepository.save(asset);
        // 2. 创建审批记录
        approvalService.submitForApproval(assetId, requesterId, asset);
        // 3. 记录历史
        saveHistory(asset, "SUBMITTED_FOR_APPROVAL", null);
        log.info("Asset submitted for approval: assetId={}, requester={}", assetId, requesterId);
    }
    /**
     * 审批通过
     */
    @Transactional
    public void approveAsset(String assetId, String approverId, String comment) {
        ContentAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Asset not found: " + assetId));
        if (!"PENDING_APPROVAL".equals(asset.getStatus())) {
            throw new IllegalStateException("Asset is not pending approval: " + asset.getStatus());
        }
        // 1. 更新素材状态
        asset.setStatus("APPROVED");
        asset.setApprovedBy(approverId);
        asset.setApprovedAt(Instant.now());
        asset.setUpdatedAt(Instant.now());
        assetRepository.save(asset);
        // 2. 更新审批记录
        approvalService.processApproval(assetId, approverId, "APPROVED", comment);
        // 3. 记录历史
        saveHistory(asset, "APPROVED", comment);
        log.info("Asset approved: assetId={}, approver={}", assetId, approverId);
    }
    /**
     * 审批拒绝
     */
    @Transactional
    public void rejectAsset(String assetId, String approverId, String reason) {
        ContentAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Asset not found: " + assetId));
        if (!"PENDING_APPROVAL".equals(asset.getStatus())) {
            throw new IllegalStateException("Asset is not pending approval: " + asset.getStatus());
        }
        // 1. 更新素材状态
        asset.setStatus("REJECTED");
        asset.setRejectedBy(approverId);
        asset.setRejectedAt(Instant.now());
        asset.setRejectionReason(reason);
        asset.setUpdatedAt(Instant.now());
        assetRepository.save(asset);
        // 2. 更新审批记录
        approvalService.processApproval(assetId, approverId, "REJECTED", reason);
        // 3. 记录历史
        saveHistory(asset, "REJECTED", reason);
        log.info("Asset rejected: assetId={}, approver={}, reason={}", assetId, approverId, reason);
    }
    /**
     * 渲染内容（基于会员数据）
     */
    public String renderContent(String assetId, String memberId) {
        ContentAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Asset not found: " + assetId));
        // 1. 获取会员数据（调用 Loyalty MemberService）
        Member member = memberService.findByMemberId(memberId);
        if (member == null) {
            throw new RuntimeException("Member not found: " + memberId);
        }
        // 2. 构建变量映射
        Map<String, Object> variables = new HashMap<>();
        variables.put("user_name", member.getName());
        variables.put("member_id", member.getMemberId());
        variables.put("tier_name", member.getTierName());
        variables.put("points_balance", member.getPointsBalance());
        // 可扩展更多属性...
        // 3. 应用变量绑定（如果有）
        Map<String, Object> bindings = getVariableBindings(assetId, member);
        variables.putAll(bindings);
        // 4. 执行渲染
        String rendered = render(asset.getBodyText(), variables);
        return rendered;
    }
    /**
     * 提取变量 Schema（从内容中解析所有 {{variable}} 占位符）
     */
    private JsonNode extractVariableSchema(String bodyText, JsonNode bodyJson) {
        Set<String> variables = new HashSet<>();
        // 从 bodyText 提取
        if (bodyText != null) {
            Matcher matcher = VARIABLE_PATTERN.matcher(bodyText);
            while (matcher.find()) {
                variables.add(matcher.group(1));
            }
        }
        // 从 bodyJson 提取（递归遍历）
        if (bodyJson != null) {
            extractVariablesFromJson(bodyJson, variables);
        }
        // 构建 Schema
        ObjectNode schema = objectMapper.createObjectNode();
        for (String var : variables) {
            schema.put(var, "string"); // 默认类型为 string
        }
        return schema;
    }
    private void extractVariablesFromJson(JsonNode node, Set<String> variables) {
        if (node.isTextual()) {
            Matcher matcher = VARIABLE_PATTERN.matcher(node.asText());
            while (matcher.find()) {
                variables.add(matcher.group(1));
            }
        } else if (node.isObject()) {
            node.fields().forEachRemaining(entry -> extractVariablesFromJson(entry.getValue(), variables));
        } else if (node.isArray()) {
            node.elements().forEachRemaining(e -> extractVariablesFromJson(e, variables));
        }
    }
    /**
     * 渲染模板
     */
    private String render(String template, Map<String, Object> variables) {
        if (template == null) return null;
        String result = template;
        for (Map.Entry<String, Object> entry : variables.entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            String value = entry.getValue() != null ? entry.getValue().toString() : "";
            result = result.replace(placeholder, value);
        }
        return result;
    }
    /**
     * 保存历史记录
     */
    private void saveHistory(ContentAsset asset, String changeType, String comment) {
        ContentAssetHistory history = ContentAssetHistory.builder()
                .id(UUID.randomUUID().toString())
                .assetId(asset.getId())
                .version(asset.getVersion())
                .assetName(asset.getAssetName())
                .subjectLine(asset.getSubjectLine())
                .bodyText(asset.getBodyText())
                .bodyJson(asset.getBodyJson())
                .variableSchema(asset.getVariableSchema())
                .status(asset.getStatus())
                .changedBy(SecurityContext.getCurrentUserId())
                .changeComment(comment != null ? comment : changeType)
                .createdAt(Instant.now())
                .build();
        historyRepository.save(history);
    }
    private Map<String, Object> getVariableBindings(String assetId, Member member) {
        // 从 campaign_variable_binding 表查询
        // 实现略
        return new HashMap<>();
    }
}
```
### 13.2.2 审批服务（ApprovalService）
```java
package com.loyalty.platform.campaign.content.service;
import com.loyalty.platform.campaign.content.model.ApprovalRecord;
import com.loyalty.platform.campaign.content.model.ContentAsset;
import com.loyalty.platform.campaign.content.repository.ApprovalRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalService {
    private final ApprovalRecordRepository approvalRecordRepository;
    private final ContentAssetRepository assetRepository;
    private final CampaignEventPublisher eventPublisher;
    /**
     * 提交审批
     */
    @Transactional
    public void submitForApproval(String assetId, String requesterId, ContentAsset asset) {
        ApprovalRecord record = ApprovalRecord.builder()
                .id(UUID.randomUUID().toString())
                .assetId(assetId)
                .requesterId(requesterId)
                .action("SUBMITTED")
                .snapshotBefore(JsonUtil.toJsonNode(asset))
                .timeoutHours(24)
                .submittedAt(Instant.now())
                .build();
        approvalRecordRepository.save(record);
        // 发布事件
        eventPublisher.publishApprovalSubmitted(assetId, requesterId);
    }
    /**
     * 处理审批（通过/拒绝）
     */
    @Transactional
    public void processApproval(String assetId, String approverId, String action, String comment) {
        // 查找最新的 PENDING 审批记录
        ApprovalRecord record = approvalRecordRepository
                .findLatestPendingByAssetId(assetId)
                .orElseThrow(() -> new RuntimeException("No pending approval found for asset: " + assetId));
        record.setAction(action);
        record.setApproverId(approverId);
        record.setComment(comment);
        record.setProcessedAt(Instant.now());
        record.setUpdatedAt(Instant.now());
        approvalRecordRepository.save(record);
        // 发布事件
        if ("APPROVED".equals(action)) {
            eventPublisher.publishApprovalApproved(assetId, approverId);
        } else {
            eventPublisher.publishApprovalRejected(assetId, approverId, comment);
        }
    }
    /**
     * 获取审批历史
     */
    public List<ApprovalRecord> getApprovalHistory(String assetId) {
        return approvalRecordRepository.findByAssetIdOrderBySubmittedAtDesc(assetId);
    }
    /**
     * 超时审批处理（定时任务）
     */
    @Scheduled(cron = "0 */5 * * * ?")  // 每5分钟执行一次
    @Transactional
    public void processTimeoutApprovals() {
        Instant threshold = Instant.now().minus(24, ChronoUnit.HOURS);
        List<ApprovalRecord> timeoutRecords = approvalRecordRepository
                .findTimeoutPending(threshold);
        for (ApprovalRecord record : timeoutRecords) {
            // 1. 标记审批为超时
            record.setAction("TIMEOUT");
            record.setProcessedAt(Instant.now());
            approvalRecordRepository.save(record);
            // 2. 更新素材状态（可选：自动拒绝）
            ContentAsset asset = assetRepository.findById(record.getAssetId()).orElse(null);
            if (asset != null && "PENDING_APPROVAL".equals(asset.getStatus())) {
                asset.setStatus("DRAFT");  // 退回到草稿，等待重新提交
                asset.setUpdatedAt(Instant.now());
                assetRepository.save(asset);
                log.warn("Approval timeout: assetId={}, recordId={}", asset.getId(), record.getId());
            }
        }
    }
}
```
***
## 13.3 前端界面设计
### 13.3.1 素材管理列表页
```text
┌─ 素材管理 ──────────────────────────────────────────────────────────────────┐
│  [+ 新建素材]  [🔍 搜索...]  [筛选: 全部状态 ▼]  [Program: 全部 ▼]        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 素材列表 ─────────────────────────────────────────────────────────────┐ │
│  │ 名称        │ 类型       │ 渠道  │ 版本 │ 状态              │ 操作    │ │
│  ├─────────────┼────────────┼───────┼──────┼───────────────────┼─────────┤ │
│  │ 618促销邮件 │ EMAIL_HTML │ EMAIL │ v3   │ ✅ APPROVED      │ [编辑]  │ │
│  │ 会员欢迎短信 │ SMS_TEXT   │ SMS   │ v1   │ ⏳ PENDING_APPROVAL│[查看]  │ │
│  │ 新品推送    │ PUSH_JSON  │ PUSH  │ v2   │ ❌ REJECTED      │ [编辑]  │ │
│  │ 清仓通知    │ EMAIL_HTML │ EMAIL │ v1   │ ⚪ DRAFT         │ [编辑]  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  共 24 条  [< 上一页]  1 / 3  [下一页 >]                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 13.3.2 素材编辑/预览页
```text
┌─ 编辑素材: 618促销邮件 ────────────────────────────────────────────────────┐
│  状态: DRAFT  │  版本: v3  │  创建: 2026-06-26                            │
│                                                                             │
│  ┌─ 基本信息 ─────────────────────────────────────────────────────────────┐ │
│  │  名称: [618促销邮件              ]                                    │ │
│  │  类型: [EMAIL_HTML ▼]  渠道: [EMAIL ▼]                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 内容编辑 ─────────────────────────────────────────────────────────────┐ │
│  │  主题: [年中大促，专属优惠等你来！]                                   │ │
│  │                                                                        │ │
│  │  正文 (HTML):                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ <html>                                                         │  │ │
│  │  │ <body>                                                         │  │ │
│  │  │   <h1>亲爱的 {{user_name}}</h1>                                │  │ │
│  │  │   <p>您有专属优惠券 {{coupon_code}} 待领取</p>                 │  │ │
│  │  │ </body>                                                        │  │ │
│  │  │ </html>                                                        │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                        │ │
│  │  📋 检测到变量: {{user_name}}, {{coupon_code}}                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预览（基于样本会员） ─────────────────────────────────────────────────┐ │
│  │  选择会员: [M_12345 (张三) ▼]  [🔍 预览]                             │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  主题: 年中大促，专属优惠等你来！                               │  │ │
│  │  │  正文:                                                         │  │ │
│  │  │  <h1>亲爱的 张三</h1>                                          │  │ │
│  │  │  <p>您有专属优惠券 SAVE20 待领取</p>                           │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [💾 保存草稿] [📤 提交审批] [🔄 重置]                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 13.3.3 审批工作台
```text
┌─ 审批工作台 ────────────────────────────────────────────────────────────────┐
│  待审批 (3)  │  已审批 (12)  │  我提交的 (5)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 待审批列表 ───────────────────────────────────────────────────────────┐ │
│  │  素材名        │ 提交人   │ 提交时间   │ 类型   │ 操作              │ │
│  ├───────────────┼─────────┼────────────┼────────┼───────────────────┤ │
│  │ 会员欢迎短信   │ 李四    │ 10:30      │ SMS    │ [预览] [通过] [拒绝]│ │
│  │ 618促销邮件   │ 王五    │ 09:15      │ EMAIL  │ [预览] [通过] [拒绝]│ │
│  │ 新品推送      │ 赵六    │ 昨天 16:20 │ PUSH   │ [预览] [通过] [拒绝]│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 审批详情（点击预览后展开） ──────────────────────────────────────────┐ │
│  │  素材: 会员欢迎短信                                                    │ │
│  │  提交人: 李四  |  提交时间: 2026-06-26 10:30                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  内容预览:                                                     │  │ │
│  │  │  亲爱的 {{user_name}}，欢迎加入！您有 100 积分奖励。          │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │  审批意见: [________________________]                                 │ │
│  │                                                                        │ │
│  │  [✅ 批准] [❌ 拒绝]                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 13.4 前后端 JSON 交互
### 13.4.1 创建素材
**Request:**
```json
POST /api/campaign/content/asset
{
    "programCode": "BRAND_A",
    "assetName": "618促销邮件",
    "assetType": "EMAIL_HTML",
    "channel": "EMAIL",
    "subjectLine": "年中大促，专属优惠等你来！",
    "bodyText": "<html><body><h1>亲爱的 {{user_name}}</h1><p>您有专属优惠券 {{coupon_code}} 待领取</p></body></html>",
    "bodyJson": null
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "asset_001",
        "programCode": "BRAND_A",
        "assetName": "618促销邮件",
        "assetType": "EMAIL_HTML",
        "channel": "EMAIL",
        "subjectLine": "年中大促，专属优惠等你来！",
        "bodyText": "<html>...",
        "variableSchema": {
            "user_name": "string",
            "coupon_code": "string"
        },
        "status": "DRAFT",
        "version": 1,
        "createdBy": "user_001",
        "createdAt": "2026-06-26T10:00:00Z"
    }
}
```
### 13.4.2 提交审批
**Request:**
```json
POST /api/campaign/content/asset/asset_001/submit
{
    "requesterId": "user_001"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "assetId": "asset_001",
        "status": "PENDING_APPROVAL",
        "submittedAt": "2026-06-26T10:05:00Z",
        "approvalId": "apr_001"
    }
}
```
### 13.4.3 审批通过
**Request:**
```json
POST /api/campaign/content/approval/apr_001/process
{
    "approverId": "user_002",
    "action": "APPROVED",
    "comment": "内容符合规范，批准发送"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "assetId": "asset_001",
        "status": "APPROVED",
        "approvedBy": "user_002",
        "approvedAt": "2026-06-26T10:10:00Z"
    }
}
```
***
## 13.5 前端复杂逻辑伪代码
### 13.5.1 变量提取与高亮
```typescript
// utils/variable-extractor.ts
export const extractVariables = (text: string): string[] => {
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
  const matches = text.matchAll(regex);
  const variables = new Set<string>();
  for (const match of matches) {
    variables.add(match[1]);
  }
  return Array.from(variables);
};
export const highlightVariables = (text: string): React.ReactNode => {
  const parts = text.split(/(\{\{\s*[a-zA-Z_][a-zA-Z0-9_.]*\s*\}\})/g);
  return parts.map((part, index) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      return <span key={index} className="variable-highlight">{part}</span>;
    }
    return <span key={index}>{part}</span>;
  });
};
```
### 13.5.2 素材预览组件
```tsx
// components/content/AssetPreview.tsx
import React, { useState } from 'react';
import { useMemberSearch } from '../../hooks/useMemberSearch';
export const AssetPreview: React.FC<{ assetId: string; bodyText: string; variables: string[] }> = ({
  assetId,
  bodyText,
  variables
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [renderedContent, setRenderedContent] = useState<string>('');
  const { searchMembers, members } = useMemberSearch();
  const handlePreview = async () => {
    if (!selectedMemberId) {
      alert('请选择一个会员进行预览');
      return;
    }
    const result = await api.post(`/api/campaign/content/asset/${assetId}/render`, {
      memberId: selectedMemberId
    });
    setRenderedContent(result.data.renderedContent);
  };
  return (
    <div className="asset-preview">
      <div className="preview-controls">
        <select onChange={(e) => setSelectedMemberId(e.target.value)}>
          <option value="">选择会员</option>
          {members.map(m => (
            <option key={m.memberId} value={m.memberId}>
              {m.name} ({m.memberId})
            </option>
          ))}
        </select>
        <button onClick={handlePreview}>🔍 预览</button>
      </div>
      <div className="preview-content">
        <div className="variable-summary">
          <span>检测到变量: </span>
          {variables.map(v => (
            <span key={v} className="variable-tag">🔹 {v}</span>
          ))}
        </div>
        <div className="rendered-content" dangerouslySetInnerHTML={{ __html: renderedContent || bodyText }} />
      </div>
    </div>
  );
};
```
***
## 13.6 异常处理与业务规则
### 13.6.1 异常枚举
```java
public enum ContentErrorCode {
    ASSET_NOT_FOUND("M001", "Content asset not found"),
    ASSET_INVALID_STATUS("M002", "Asset cannot be modified in current status"),
    ASSET_ALREADY_APPROVED("M003", "Asset is already approved"),
    APPROVAL_NOT_FOUND("M004", "Approval record not found"),
    APPROVAL_ALREADY_PROCESSED("M005", "Approval already processed"),
    APPROVAL_TIMEOUT("M006", "Approval timeout"),
    VARIABLE_MISSING("M007", "Required variable missing: {var}"),
    RENDER_FAILED("M008", "Content rendering failed");
}
```
### 13.6.2 审批前置校验
```java
@Component
public class ApprovalValidator {
    
    public void validateBeforeApproval(String assetId) {
        ContentAsset asset = assetRepository.findById(assetId).orElse(null);
        if (asset == null) {
            throw new BusinessException(ContentErrorCode.ASSET_NOT_FOUND);
        }
        if (!"PENDING_APPROVAL".equals(asset.getStatus())) {
            throw new BusinessException(ContentErrorCode.ASSET_INVALID_STATUS);
        }
        // 检查必要变量是否绑定
        JsonNode schema = asset.getVariableSchema();
        if (schema != null && !schema.isEmpty()) {
            // 检查是否有默认变量绑定
            // 若缺少关键变量，可发出警告但不阻止审批
        }
    }
}
```
***
## 13.7 与 Loyalty 系统的集成点
| 集成点             | Loyalty 能力      | 使用时机              |
| --------------- | --------------- | ----------------- |
| **会员数据**        | `MemberService` | 预览渲染、变量填充         |
| **EventBridge** | 事件发布            | 提交审批、审批完成时发布事件    |
| **审批流**         | 现有审批表（可选）       | 可复用 Loyalty 审批记录表 |
| **操作日志**        | `operation_log` | 素材变更可记录到统一日志      |
***
## 13.8 开发实施检查清单
* 创建 `campaign_content_asset` 表
* 创建 `campaign_content_asset_history` 表
* 创建 `campaign_approval_record` 表
* 创建 `campaign_variable_binding` 表
* 实现 `ContentService`（CRUD + 版本 + 渲染）
* 实现 `ApprovalService`（提交 + 处理 + 超时）
* 实现变量提取与渲染引擎
* 实现前端素材管理列表页
* 实现前端素材编辑/预览页
* 实现前端审批工作台
* 集成 Loyalty MemberService 用于预览
* 配置审批超时定时任务
* 编写单元测试（覆盖率 > 80%）
