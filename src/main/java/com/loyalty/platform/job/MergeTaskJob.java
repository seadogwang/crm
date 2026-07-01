package com.loyalty.platform.job;

import com.loyalty.platform.member.MemberMergeService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 会员合并异步执行任务 — 每 30 秒扫描一次。
 *
 * <p>Controller 的 merge() 接口先创建 MergeTask（CREATED），
 * 本 Job 负责异步执行实际合并操作（积分转移、等级合并、唯一键重定向）。
 *
 * <p><b>租户隔离</b>：继承 {@link TenantAwareJob}，通过 {@code forEachTenant}
 * 在每个租户的处理前后严格 {@code set()/clear()} TenantContext。
 *
 * <p>处理流程：
 * <ol>
 *   <li>SELECT … FOR UPDATE SKIP LOCKED 锁定 CREATED 任务</li>
 *   <li>标记为 PROCESSING</li>
 *   <li>调用 {@link MemberMergeService#merge} 执行合并</li>
 *   <li>成功 → COMPLETED，失败 → FAILED（记录错误信息）</li>
 * </ol>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class MergeTaskJob extends TenantAwareJob {

    /** 每批处理上限 */
    private static final int BATCH_SIZE = 20;

    private final MemberMergeService mergeService;

    public MergeTaskJob(MemberMergeService mergeService) {
        this.mergeService = mergeService;
    }

    @Override
    protected String getJobName() {
        return "MergeTaskJob";
    }

    /**
     * 每 30 秒扫描一次 member_merge_task 表。
     */
    @Scheduled(fixedDelay = 30000)
    @Transactional
    public void execute() {
        if (log.isDebugEnabled()) {
            log.debug("[MergeTaskJob] 触发定时扫描");
        }
        forEachTenant(this::processTenant);
    }

    void processTenant(String programCode) {
        // SELECT … FOR UPDATE SKIP LOCKED — 并发安全的 FIFO 出队
        @SuppressWarnings("unchecked")
        List<Object[]> tasks = em.createNativeQuery(
                "SELECT id, main_member_id, duplicate_member_id "
                        + "FROM member_merge_task "
                        + "WHERE program_code = ? AND status = 'CREATED' "
                        + "ORDER BY created_at ASC "
                        + "LIMIT ? "
                        + "FOR UPDATE SKIP LOCKED",
                Object[].class)
                .setParameter(1, programCode)
                .setParameter(2, BATCH_SIZE)
                .getResultList();

        if (tasks.isEmpty()) return;

        log.info("[MergeTaskJob] 租户 [{}] 待处理合并任务: {} 条", programCode, tasks.size());

        int completed = 0;
        int failed = 0;

        for (Object[] row : tasks) {
            Long taskId = ((Number) row[0]).longValue();
            Long mainId = ((Number) row[1]).longValue();
            Long dupId = ((Number) row[2]).longValue();

            // 标记为 PROCESSING
            em.createNativeQuery(
                    "UPDATE member_merge_task SET status = 'PROCESSING', updated_at = ? "
                            + "WHERE id = ? AND program_code = ?")
                    .setParameter(1, LocalDateTime.now())
                    .setParameter(2, taskId)
                    .setParameter(3, programCode)
                    .executeUpdate();

            try {
                mergeService.merge(programCode, mainId, dupId);

                // 标记完成
                em.createNativeQuery(
                        "UPDATE member_merge_task SET status = 'COMPLETED', updated_at = ? "
                                + "WHERE id = ? AND program_code = ?")
                        .setParameter(1, LocalDateTime.now())
                        .setParameter(2, taskId)
                        .setParameter(3, programCode)
                        .executeUpdate();
                completed++;
                log.debug("[MergeTaskJob] 合并完成: taskId={}, main={}, dup={}", taskId, mainId, dupId);
            } catch (Exception e) {
                log.error("[MergeTaskJob] 合并失败: taskId={}, main={}, dup={}", taskId, mainId, dupId, e);

                // 标记失败（截断错误信息到 500 字符）
                String errMsg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                if (errMsg.length() > 500) errMsg = errMsg.substring(0, 500);

                em.createNativeQuery(
                        "UPDATE member_merge_task SET status = 'FAILED', error_message = ?, updated_at = ? "
                                + "WHERE id = ? AND program_code = ?")
                        .setParameter(1, errMsg)
                        .setParameter(2, LocalDateTime.now())
                        .setParameter(3, taskId)
                        .setParameter(4, programCode)
                        .executeUpdate();
                failed++;
            }
        }

        log.info("[MergeTaskJob] 租户 [{}] 处理完成: completed={}, failed={}", programCode, completed, failed);
    }
}