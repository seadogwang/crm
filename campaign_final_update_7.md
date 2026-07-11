## 缺失项 5（P0）：死信队列（DLQ）与失败作业重放（运维能力）详细设计
> **优先级**：P0（必须项）\
> **原因**：生产环境中，第三方服务抖动、配置错误、数据异常是常态。若无 DLQ 机制，失败作业将永久丢失或积压在 Zeebe 中无法处理，运维人员将缺乏有效的故障排查与恢复手段。\
> **对应章节**：第5章（Execution）扩展 + 第11章（Execution Runtime）扩展 + 第12章（生产架构）扩展\
> **设计原则**：**完全复用现有 Zeebe 机制 + 利用现有数据表**，不引入新的消息中间件，通过数据库表实现“死信存储”，通过现有 `InterventionService` 实现“作业重放”，对现有执行链路零侵入。
## 一、设计目标
1. **自动捕获死信（Auto-Capture）**：当 Zeebe 作业重试次数耗尽（retries = 0）时，自动将作业上下文存入死信表，而非永久丢失。
2. **死信管理界面（DLQ Dashboard）**：运维人员可查看所有死信，按时间、Campaign、节点类型筛选，查看错误堆栈和输入变量。
3. **作业重放（Job Replay）**：支持单条或批量重放死信作业，重放时复用原始输入，重新触发 Zeebe 流程执行。
4. **死信归档与清理（Archival）**：自动归档超过 7 天的死信，防止数据库膨胀。
5. **告警集成**：当死信数量超过阈值时触发告警（复用第12章 Prometheus 告警规则）。
## 二、与现有功能的集成点
| 现有功能                           | 如何与 DLQ 集成                                                        |
| ------------------------------ | ----------------------------------------------------------------- |
| **Zeebe Workers（第5章）**         | Worker 中 `handle` 方法捕获异常，当 `retries = 0` 时调用 DLQ 服务存储死信           |
| **campaign\_zeebe\_task（第5章）** | 复用此表记录死信，新增 `is_dlq`、`dlq_reason` 字段，无需新建主表                       |
| **InterventionService（第14章）**  | 新增 `REPLAY_JOB` 命令类型，复用干预服务的审计能力                                  |
| **Event System（第6章）**          | 死信产生时发布 `DLQ_ITEM_CREATED` 事件，触发告警                                |
| **CampaignPlan / Execution**   | 重放时通过 `ZeebeExecutionService.startExecution` 或 `ZeebeClient` 重新触发 |
## 三、数据模型设计（最小化变更）
### 3.1 扩展 `campaign_zeebe_task` 表（新增字段）
```sql
-- ============================================================
-- 扩展 campaign_zeebe_task 表，支持死信标记
-- ============================================================
ALTER TABLE campaign_zeebe_task ADD COLUMN is_dlq BOOLEAN DEFAULT FALSE;
ALTER TABLE campaign_zeebe_task ADD COLUMN dlq_reason TEXT;
ALTER TABLE campaign_zeebe_task ADD COLUMN dlq_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE campaign_zeebe_task ADD COLUMN dlq_archived_at TIMESTAMPTZ;
ALTER TABLE campaign_zeebe_task ADD COLUMN replayed_count INT DEFAULT 0;
ALTER TABLE campaign_zeebe_task ADD COLUMN original_job_key BIGINT;
COMMENT ON COLUMN campaign_zeebe_task.is_dlq IS '是否为死信（重试耗尽后移入死信队列）';
COMMENT ON COLUMN campaign_zeebe_task.dlq_reason IS '死信原因（错误堆栈或超时描述）';
COMMENT ON COLUMN campaign_zeebe_task.dlq_archived IS '是否已归档（软删除，用于清理）';
COMMENT ON COLUMN campaign_zeebe_task.replayed_count IS '重放次数（用于审计）';
-- 新增索引加速死信查询
CREATE INDEX idx_czt_is_dlq ON campaign_zeebe_task(is_dlq) WHERE is_dlq = TRUE;
CREATE INDEX idx_czt_dlq_archived ON campaign_zeebe_task(dlq_archived) WHERE dlq_archived = FALSE;
CREATE INDEX idx_czt_dlq_plan ON campaign_zeebe_task(plan_id, is_dlq);
```
### 3.2 死信重放记录表（campaign\_dlq\_replay\_log）
> 独立记录重放操作，保证审计可追溯。
```sql
-- ============================================================
-- 死信重放操作日志（审计用）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_dlq_replay_log (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,                     -- 关联 campaign_zeebe_task.id
    plan_id VARCHAR(64) NOT NULL,
    -- ===== 重放信息 =====
    replay_type VARCHAR(32) NOT NULL,                 -- SINGLE / BATCH
    new_job_key BIGINT,                               -- 重放后新的 Zeebe Job Key
    new_process_instance_key BIGINT,                  -- 重放后新的流程实例 Key
    status VARCHAR(32) DEFAULT 'SUCCESS',             -- SUCCESS / FAILED / PARTIAL
    -- ===== 操作人 =====
    operator_id VARCHAR(64),
    operator_name VARCHAR(255),
    -- ===== 原因 =====
    reason TEXT,
    -- ===== 时间 =====
    replayed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cdrl_task ON campaign_dlq_replay_log(task_id);
CREATE INDEX idx_cdrl_plan ON campaign_dlq_replay_log(plan_id);
CREATE INDEX idx_cdrl_replayed_at ON campaign_dlq_replay_log(replayed_at DESC);
```
## 四、后端 Service 设计
### 4.1 死信捕获器（DLQCaptor）
> **集成点**：在 BaseCampaignWorker 的异常处理中调用，当 retries = 0 时自动捕获。
```java
package com.loyalty.platform.campaign.execution.dlq;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.execution.model.ZeebeTask;
import com.loyalty.platform.campaign.execution.repository.ZeebeTaskRepository;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;
@Slf4j
@Service
@RequiredArgsConstructor
public class DLQCaptor {
    private final ZeebeTaskRepository taskRepository;
    private final CampaignEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    /**
     * 捕获死信（由 Worker 在重试耗尽时调用）
     * 
     * @param job Zeebe 作业
     * @param error 错误信息
     * @param variables 作业变量
     */
    @Transactional
    public void capture(ActivatedJob job, String error, Map<String, Object> variables) {
        String planId = (String) variables.get("planId");
        String nodeId = (String) variables.get("nodeId");
        String nodeType = (String) variables.get("nodeType");
        log.warn("Capturing DLQ item: planId={}, nodeId={}, jobKey={}, error={}",
                 planId, nodeId, job.getKey(), error);
        // 1. 查找对应的 ZeebeTask 记录
        ZeebeTask task = taskRepository.findByJobKey(job.getKey()).orElse(null);
        if (task == null) {
            // 如果没有记录，创建一个（兜底）
            task = ZeebeTask.builder()
                    .id(UUID.randomUUID().toString())
                    .planId(planId)
                    .jobKey(job.getKey())
                    .taskType(nodeType != null ? nodeType : "UNKNOWN")
                    .taskName(nodeType)
                    .nodeId(nodeId)
                    .status("FAILED")
                    .inputVariables(JsonUtil.toJsonNode(variables))
                    .errorMessage(error)
                    .retryCount(job.getRetries())
                    .maxRetries(3)
                    .startTime(Instant.now())
                    .endTime(Instant.now())
                    .build();
        }
        // 2. 标记为死信
        task.setIsDlq(true);
        task.setDlqReason(error);
        task.setDlqArchived(false);
        task.setStatus("DLQ");
        task.setErrorMessage(error);
        task.setEndTime(Instant.now());
        task.setUpdatedAt(Instant.now());
        taskRepository.save(task);
        // 3. 发布死信事件（触发告警）
        eventPublisher.publishDlqItemCreated(planId, nodeId, error, job.getKey());
        log.info("DLQ item captured: taskId={}, planId={}, jobKey={}",
                 task.getId(), planId, job.getKey());
    }
    /**
     * 批量捕获（用于 Worker 中循环处理失败时）
     */
    @Transactional
    public void captureBatch(List<FailedJobContext> failedJobs) {
        for (FailedJobContext ctx : failedJobs) {
            capture(ctx.getJob(), ctx.getError(), ctx.getVariables());
        }
    }
}
```
### 4.2 BaseCampaignWorker 集成（修改）
```java
// 在 BaseCampaignWorker 的异常处理中集成 DLQ
@Slf4j
public abstract class BaseCampaignWorker {
    @Autowired
    private DLQCaptor dlqCaptor;  // 新增注入
    // 原有 handle 方法修改
    public void handle(JobClient client, ActivatedJob job) {
        // ... 原有逻辑 ...
        } catch (Exception e) {
            log.error("Worker {} failed: jobKey={}, error={}",
                     workerType, jobKey, e.getMessage(), e);
            // 判断是否可重试
            boolean retryable = isRetryable(e);
            int remainingRetries = job.getRetries() - 1;
            if (retryable && remainingRetries > 0) {
                // 自动重试（Zeebe 原生支持）
                client.newFailCommand(jobKey)
                        .retries(remainingRetries)
                        .errorMessage(e.getMessage())
                        .send()
                        .join();
            } else {
                // ===== 重试耗尽 → 移入死信队列 =====
                Map<String, Object> variables = job.getVariablesAsMap();
                dlqCaptor.capture(job, e.getMessage(), variables);
                // 标记为最终失败（不再重试）
                client.newFailCommand(jobKey)
                        .retries(0)
                        .errorMessage("DLQ: " + e.getMessage())
                        .send()
                        .join();
            }
        }
    }
}
```
### 4.3 死信重放服务（DLQReplayService）
```java
package com.loyalty.platform.campaign.execution.dlq;
import com.loyalty.platform.campaign.execution.model.ZeebeTask;
import com.loyalty.platform.campaign.execution.repository.ZeebeTaskRepository;
import com.loyalty.platform.campaign.execution.service.ZeebeExecutionService;
import com.loyalty.platform.campaign.execution.service.ZeebeDeployService;
import com.loyalty.platform.campaign.model.CampaignPlan;
import com.loyalty.platform.campaign.planning.repository.CampaignPlanRepository;
import io.camunda.zeebe.client.ZeebeClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class DLQReplayService {
    private final ZeebeTaskRepository taskRepository;
    private final DLQReplayLogRepository replayLogRepository;
    private final CampaignPlanRepository planRepository;
    private final ZeebeClient zeebeClient;
    private final CampaignEventPublisher eventPublisher;
    /**
     * 单条重放
     * 
     * 策略：
     * 1. 读取死信记录的输入变量
     * 2. 使用 Zeebe 的 PublishMessage 或 CreateInstance 重新触发
     * 3. 更新原记录的重放次数
     * 4. 记录重放日志
     */
    @Transactional
    public ReplayResult replaySingle(String taskId, String operatorId, String reason) {
        ZeebeTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        if (!task.isIsDlq()) {
            throw new RuntimeException("Task is not a DLQ item: " + taskId);
        }
        if (task.isDlqArchived()) {
            throw new RuntimeException("Task is already archived: " + taskId);
        }
        log.info("Replaying DLQ item: taskId={}, planId={}, nodeId={}",
                 taskId, task.getPlanId(), task.getNodeId());
        // 1. 获取原始输入变量
        Map<String, Object> originalVariables = JsonUtil.toMap(task.getInputVariables());
        // 2. 获取 Plan
        CampaignPlan plan = planRepository.findById(task.getPlanId())
                .orElseThrow(() -> new RuntimeException("Plan not found: " + task.getPlanId()));
        // 3. 重新触发执行
        Long newProcessInstanceKey;
        Long newJobKey;
        try {
            // 方案 A：如果 Plan 仍在运行中，使用 Zeebe 重新发布消息触发
            // 方案 B：重新启动整个流程（更简单，但会重复执行上游节点）
            // 这里采用方案 B，因为死信通常需要重新执行，且上游节点已执行过，但为了简单，重新启动流程
            // 更好的做法：通过 Zeebe 的 Modify Process 或者直接调用 Worker 逻辑
            // 简化实现：调用 ExecutionService 重新启动
            if (plan.getZeebeProcessId() != null) {
                // 重新创建流程实例
                Map<String, Object> variables = new HashMap<>(originalVariables);
                variables.put("replayed", true);
                variables.put("replayedFromTaskId", taskId);
                variables.put("replayedAt", Instant.now().toString());
                newProcessInstanceKey = zeebeClient.newCreateInstanceCommand()
                        .bpmnProcessId(plan.getZeebeProcessId())
                        .latestVersion()
                        .variables(variables)
                        .send()
                        .join()
                        .getProcessInstanceKey();
                // 注意：这里拿不到具体的 Job Key，但可以通过 Process Instance Key 追踪
                newJobKey = null;
                log.info("Replayed DLQ by restarting process: planId={}, newProcessInstanceKey={}",
                         task.getPlanId(), newProcessInstanceKey);
            } else {
                throw new RuntimeException("Plan not deployed to Zeebe");
            }
        } catch (Exception e) {
            log.error("Failed to replay DLQ: taskId={}, error={}", taskId, e.getMessage(), e);
            // 记录失败日志
            DLQReplayLog replayLog = DLQReplayLog.builder()
                    .id(UUID.randomUUID().toString())
                    .taskId(taskId)
                    .planId(task.getPlanId())
                    .replayType("SINGLE")
                    .status("FAILED")
                    .operatorId(operatorId)
                    .reason("Replay failed: " + e.getMessage())
                    .replayedAt(Instant.now())
                    .build();
            replayLogRepository.save(replayLog);
            return ReplayResult.failed("Replay failed: " + e.getMessage());
        }
        // 4. 更新原任务
        task.setReplayedCount(task.getReplayedCount() + 1);
        task.setUpdatedAt(Instant.now());
        taskRepository.save(task);
        // 5. 记录重放日志
        DLQReplayLog replayLog = DLQReplayLog.builder()
                .id(UUID.randomUUID().toString())
                .taskId(taskId)
                .planId(task.getPlanId())
                .replayType("SINGLE")
                .newProcessInstanceKey(newProcessInstanceKey)
                .status("SUCCESS")
                .operatorId(operatorId)
                .reason(reason)
                .replayedAt(Instant.now())
                .build();
        replayLogRepository.save(replayLog);
        // 6. 发布事件
        eventPublisher.publishDlqReplayed(taskId, operatorId, newProcessInstanceKey);
        log.info("DLQ replay successful: taskId={}, newProcessInstanceKey={}",
                 taskId, newProcessInstanceKey);
        return ReplayResult.success(newProcessInstanceKey);
    }
    /**
     * 批量重放（按 Plan 或按节点类型）
     */
    @Transactional
    public BatchReplayResult replayBatch(String planId, String nodeType, String operatorId, String reason) {
        log.info("Batch replaying DLQ: planId={}, nodeType={}, operator={}",
                 planId, nodeType, operatorId);
        List<ZeebeTask> tasks = taskRepository.findByIsDlqAndDlqArchivedFalse();
        if (planId != null) {
            tasks = tasks.stream().filter(t -> planId.equals(t.getPlanId())).collect(Collectors.toList());
        }
        if (nodeType != null) {
            tasks = tasks.stream().filter(t -> nodeType.equals(t.getTaskType())).collect(Collectors.toList());
        }
        if (tasks.isEmpty()) {
            return BatchReplayResult.empty();
        }
        int successCount = 0;
        int failCount = 0;
        List<String> failedIds = new ArrayList<>();
        for (ZeebeTask task : tasks) {
            try {
                replaySingle(task.getId(), operatorId, reason);
                successCount++;
            } catch (Exception e) {
                failCount++;
                failedIds.add(task.getId());
                log.error("Batch replay failed for task: {}", task.getId(), e);
            }
        }
        // 记录批量重放日志（简化）
        DLQReplayLog replayLog = DLQReplayLog.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId != null ? planId : "ALL")
                .replayType("BATCH")
                .status(failCount == 0 ? "SUCCESS" : "PARTIAL")
                .operatorId(operatorId)
                .reason(reason)
                .replayedAt(Instant.now())
                .build();
        replayLogRepository.save(replayLog);
        log.info("Batch replay completed: success={}, fail={}", successCount, failCount);
        return BatchReplayResult.builder()
                .total(tasks.size())
                .successCount(successCount)
                .failCount(failCount)
                .failedIds(failedIds)
                .build();
    }
    /**
     * 归档死信（软删除）
     */
    @Transactional
    public int archiveDlqItems(int daysOld) {
        Instant threshold = Instant.now().minus(daysOld, ChronoUnit.DAYS);
        List<ZeebeTask> oldDlq = taskRepository.findByIsDlqAndDlqArchivedFalseAndUpdatedAtBefore(threshold);
        for (ZeebeTask task : oldDlq) {
            task.setDlqArchived(true);
            task.setDlqArchivedAt(Instant.now());
            task.setUpdatedAt(Instant.now());
            taskRepository.save(task);
        }
        log.info("Archived {} DLQ items older than {} days", oldDlq.size(), daysOld);
        return oldDlq.size();
    }
}
```
### 4.4 定时清理任务
```java
@Component
@Slf4j
public class DLQCleanupTask {
    @Autowired
    private DLQReplayService replayService;
    /**
     * 每天凌晨 3 点归档 7 天前的死信
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void archiveOldDlq() {
        int archived = replayService.archiveDlqItems(7);
        if (archived > 0) {
            log.info("DLQ cleanup completed: archived {} items", archived);
        }
    }
    /**
     * 每小时检查死信数量，超过阈值触发告警
     */
    @Scheduled(cron = "0 0 */1 * * ?")
    public void checkDlqThreshold() {
        long count = taskRepository.countByIsDlqAndDlqArchivedFalse();
        if (count > 100) {
            log.warn("DLQ threshold exceeded: {} items in queue", count);
            // 触发告警（通过 EventBridge 或直接调用告警服务）
            eventPublisher.publishDlqThresholdExceeded(count);
        }
    }
}
```
## 五、前端界面设计
### 5.1 死信队列管理页面
```text
┌─ 死信队列 (DLQ) ────────────────────────────────────────────────────────────┐
│  死信总数: 23  │  未归档: 23  │  今日新增: 3  │  重放成功: 12             │
│  [🔍 搜索]  [筛选: 全部状态 ▼]  [时间: 最近7天 ▼]  [🔄 刷新]              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 死信列表 ─────────────────────────────────────────────────────────────┐ │
│  │  时间         │ Plan         │ 节点类型   │ 错误摘要       │ 重放 │ 操作│ │
│  ├──────────────┼──────────────┼────────────┼────────────────┼──────┼─────┤ │
│  │  06-28 10:23 │ 618大促预热  │ SEND_EMAIL │ 邮件服务超时   │ 0次  │ [▶] │ │
│  │  06-28 09:15 │ 会员日促销   │ OFFER_     │ 积分余额不足   │ 1次  │ [▶] │ │
│  │  06-27 16:45 │ 新会员欢迎   │ WEBHOOK    │ 第三方API 500  │ 0次  │ [▶] │ │
│  │  06-27 14:20 │ 购物车挽回   │ SEND_SMS   │ 短信通道限流   │ 2次  │ [▶] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [▶ 批量重放选中]  [📦 归档全部]  [📊 导出报告]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 死信详情面板（点击行展开）
```text
┌─ 死信详情 ──────────────────────────────────────────────────────────────────┐
│  任务 ID: task_001                                                         │
│  Plan: 618大促预热  |  节点: 发送邮件 (SEND_EMAIL)  |  失败时间: 06-28 10:23│
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 错误堆栈 ─────────────────────────────────────────────────────────────┐ │
│  │  java.net.SocketTimeoutException: Read timed out                     │ │
│  │      at com.loyalty.platform.channel.EmailService.send(EmailService) │ │
│  │      at com.loyalty.platform.campaign.worker.SendEmailWorker.doExecut│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 输入变量 ─────────────────────────────────────────────────────────────┐ │
│  │  {                                                                     │ │
│  │    "memberIds": ["M_001", "M_002", ... (共 1,234 个)]                 │ │
│  │    "assetId": "asset_001",                                            │ │
│  │    "planId": "plan_001"                                               │ │
│  │  }                                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 重放历史 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ 操作人  │ 结果   │ 新实例Key        │               │ │
│  │  06-28 10:30   │ admin   │ ✅ 成功 │ 2251799813685250 │               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [▶ 重放此任务]  [🗑️ 归档]  [📋 复制变量]                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 重放确认对话框
```text
┌─ 确认重放 ──────────────────────────────────────────────────────────────────┐
│  ⚠️ 您即将重放 1 个死信任务                                               │
│                                                                             │
│  任务: 发送邮件 (SEND_EMAIL)  |  Plan: 618大促预热                        │
│  重放将创建新的流程实例，使用原始输入变量                                   │
│                                                                             │
│  操作原因: [ 邮件服务已恢复，重新发送  ]                                    │
│                                                                             │
│  [取消]  [确认重放]                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计
### 6.1 获取死信列表
```json
GET /api/campaign/dlq/list?planId=plan_001&status=ACTIVE&page=0&size=20
{
    "code": 0,
    "data": {
        "total": 23,
        "items": [
            {
                "taskId": "task_001",
                "planId": "plan_001",
                "planName": "618大促预热",
                "nodeId": "N4",
                "nodeType": "SEND_EMAIL",
                "errorMessage": "Read timed out",
                "replayedCount": 0,
                "createdAt": "2026-06-28T10:23:00Z",
                "inputVariables": { "memberIds": [...] }
            }
        ]
    }
}
```
### 6.2 单条重放
```json
POST /api/campaign/dlq/task_001/replay
{
    "operatorId": "admin_001",
    "reason": "邮件服务已恢复"
}
{
    "code": 0,
    "data": {
        "taskId": "task_001",
        "status": "SUCCESS",
        "newProcessInstanceKey": 2251799813685250,
        "replayedAt": "2026-06-28T10:30:00Z"
    }
}
```
### 6.3 批量重放
```json
POST /api/campaign/dlq/replay/batch
{
    "planId": "plan_001",
    "nodeType": "SEND_EMAIL",
    "operatorId": "admin_001",
    "reason": "邮件服务已恢复，批量重放"
}
{
    "code": 0,
    "data": {
        "total": 5,
        "successCount": 4,
        "failCount": 1,
        "failedIds": ["task_003"]
    }
}
```
## 七、告警集成（第12章）
yaml
```
# prometheus-rules.yaml 补充
- alert: DLQThresholdExceeded
  expr: campaign_dlq_count > 100
  for: 15m
  labels:
    severity: warning
    team: infrastructure
  annotations:
    summary: "死信队列堆积过多"
    description: "当前死信数量: {{ $value }}，请及时处理"
- alert: DLQReplayFailureRate
  expr: rate(campaign_dlq_replay_failed_total[1h]) > 0.1
  for: 5m
  labels:
    severity: critical
    team: infrastructure
  annotations:
    summary: "死信重放失败率过高"
```
## 八、与现有模块的集成点总结
| 现有模块                           | 集成方式                                                  | 变更点              |
| ------------------------------ | ----------------------------------------------------- | ---------------- |
| **BaseCampaignWorker（第5章）**    | 异常处理中调用 `DLQCaptor.capture()`                         | 新增依赖注入 + 调用      |
| **campaign\_zeebe\_task（第5章）** | 扩展字段 `is_dlq`, `dlq_reason`, `replayed_count`         | ALTER TABLE 新增字段 |
| **ZeebeExecutionService（第5章）** | 重放时调用 `startExecution` 或 `ZeebeClient.createInstance` | 无变更，复用现有方法       |
| **Event System（第6章）**          | 新增 `DLQ_ITEM_CREATED`、`DLQ_REPLAYED` 事件类型             | 扩展枚举             |
| **Intervention（第14章）**         | 重放操作复用干预审计能力                                          | 无需修改，独立服务        |
| **生产监控（第12章）**                 | 新增 Prometheus 告警规则                                    | 补充配置             |
## 九、实施检查清单
* 执行 DDL：扩展 `campaign_zeebe_task` 表（4 个新字段）
* 执行 DDL：创建 `campaign_dlq_replay_log` 表
* 实现 `DLQCaptor` 死信捕获服务
* 修改 `BaseCampaignWorker` 集成 DLQ 捕获
* 实现 `DLQReplayService` 重放服务
* 实现定时清理任务（归档 7 天前死信）
* 实现死信数量监控定时任务
* 前端：死信队列管理页面
* 前端：死信详情面板
* 前端：批量重放功能
* 扩展 EventBridge 事件类型
* 补充 Prometheus 告警规则
* 编写单元测试和集成测试
* 编写运维手册（DLQ 处理 SOP）
## 十、总结
本设计为 Campaign Tools 补齐了**生产环境必备的运维能力**：
| 能力         | 实现方式                            |
| ---------- | ------------------------------- |
| **自动捕获死信** | Worker 重试耗尽后自动调用 `DLQCaptor` 存储 |
| **死信管理界面** | 列表展示、筛选、详情查看                    |
| **单条重放**   | 重新触发 Zeebe 流程实例，复用原始输入          |
| **批量重放**   | 按 Plan 或节点类型批量重放                |
| **自动归档**   | 7 天以上死信自动软删除                    |
| **告警集成**   | 死信数量/重放失败率触发告警                  |
**关键优势**：
1. **零侵入**：仅修改 `BaseCampaignWorker` 的异常处理逻辑，所有现有 Worker 自动获得 DLQ 能力。
2. **最小数据变更**：复用 `campaign_zeebe_task` 表，仅新增 4 个字段，无需新建主表。
3. **完全可追溯**：每次重放记录审计日志，包含操作人、原因、新实例 Key。
