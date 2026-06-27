package com.loyalty.platform.campaign.planning.service;

import com.loyalty.platform.campaign.planning.dto.CreateGoalRequest;
import com.loyalty.platform.campaign.planning.dto.CreateKpiRequest;
import com.loyalty.platform.campaign.planning.dto.GoalContext;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.exception.ResourceNotFoundException;
import com.loyalty.platform.domain.entity.campaign.CampaignGoal;
import com.loyalty.platform.domain.entity.campaign.CampaignGoalKpi;
import com.loyalty.platform.domain.repository.campaign.CampaignGoalKpiRepository;
import com.loyalty.platform.domain.repository.campaign.CampaignGoalRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 目标管理服务。
 */
@Service
@Transactional
public class GoalService {

    private static final Logger log = LoggerFactory.getLogger(GoalService.class);

    private final CampaignGoalRepository goalRepository;
    private final CampaignGoalKpiRepository kpiRepository;
    private final WorkspaceService workspaceService;
    private final WorkspaceLockService lockService;

    public GoalService(CampaignGoalRepository goalRepository,
                       CampaignGoalKpiRepository kpiRepository,
                       WorkspaceService workspaceService,
                       WorkspaceLockService lockService) {
        this.goalRepository = goalRepository;
        this.kpiRepository = kpiRepository;
        this.workspaceService = workspaceService;
        this.lockService = lockService;
    }

    /**
     * 创建目标（DRAFT 状态）。
     */
    public CampaignGoal createGoal(CreateGoalRequest request) {
        // 校验 Workspace 存在
        workspaceService.getWorkspace(request.getWorkspaceId());

        CampaignGoal goal = CampaignGoal.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .name(request.getName())
                .description(request.getDescription())
                .goalType(request.getGoalType())
                .status("DRAFT")
                .targetMetric(request.getTargetMetric())
                .targetValue(request.getTargetValue())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .createdBy(getCurrentUserId())
                .build();
        goal = goalRepository.save(goal);

        // 创建 KPI
        if (request.getKpis() != null) {
            for (CreateKpiRequest kpiReq : request.getKpis()) {
                CampaignGoalKpi kpi = CampaignGoalKpi.builder()
                        .id(UUID.randomUUID().toString())
                        .goalId(goal.getId())
                        .kpiType(kpiReq.getKpiType())
                        .targetValue(kpiReq.getTargetValue())
                        .weight(kpiReq.getWeight() != null ? kpiReq.getWeight() : BigDecimal.ONE)
                        .build();
                kpiRepository.save(kpi);
            }
        }

        // 创建版本快照
        workspaceService.snapshot(request.getWorkspaceId(), "GOAL", goal);

        log.info("Goal created: id={}, name={}, workspace={}",
                goal.getId(), goal.getName(), goal.getWorkspaceId());
        return goal;
    }

    /**
     * 获取目标。
     */
    @Transactional(readOnly = true)
    public CampaignGoal getGoal(String goalId) {
        return goalRepository.findById(goalId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found: " + goalId));
    }

    /**
     * 获取 Workspace 下的所有目标。
     */
    @Transactional(readOnly = true)
    public List<CampaignGoal> getGoalsByWorkspace(String workspaceId) {
        return goalRepository.findByWorkspaceId(workspaceId);
    }

    /**
     * 激活目标（核心逻辑：自动停用其他 ACTIVE Goal）。
     */
    public CampaignGoal activateGoal(String goalId) {
        CampaignGoal goal = getGoal(goalId);
        if (!"DRAFT".equals(goal.getStatus()) && !"PAUSED".equals(goal.getStatus())) {
            throw new BusinessException("ERR_GOAL_CANNOT_ACTIVATE", "Only DRAFT or PAUSED goal can be activated");
        }

        // 使用分布式锁防止并发激活冲突
        final CampaignGoal lockedGoal = goal;
        return lockService.executeWithLock(lockedGoal.getWorkspaceId(), () -> {
            // 1. 停用该 Workspace 下所有其他 ACTIVE Goal
            goalRepository.deactivateAllByWorkspace(lockedGoal.getWorkspaceId());
            // 2. 激活当前 Goal
            lockedGoal.setStatus("ACTIVE");
            lockedGoal.setUpdatedAt(LocalDateTime.now());
            CampaignGoal saved = goalRepository.save(lockedGoal);
            // 3. 更新 Workspace 的 active_goal_id
            workspaceService.setActiveGoal(saved.getWorkspaceId(), saved.getId());
            // 4. 创建版本快照
            workspaceService.snapshot(saved.getWorkspaceId(), "GOAL", saved);
            log.info("Goal activated: id={}, workspace={}", saved.getId(), saved.getWorkspaceId());
            return saved;
        });
    }

    /**
     * 暂停目标。
     */
    public CampaignGoal pauseGoal(String goalId) {
        CampaignGoal goal = getGoal(goalId);
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException("ERR_GOAL_CANNOT_PAUSE", "Only ACTIVE goal can be paused");
        }
        goal.setStatus("PAUSED");
        goal.setUpdatedAt(LocalDateTime.now());
        goal = goalRepository.save(goal);
        // 清除 Workspace 的 active_goal_id
        workspaceService.clearActiveGoal(goal.getWorkspaceId());
        log.info("Goal paused: id={}", goal.getId());
        return goal;
    }

    /**
     * 完成目标。
     */
    public CampaignGoal completeGoal(String goalId) {
        CampaignGoal goal = getGoal(goalId);
        if (!"ACTIVE".equals(goal.getStatus()) && !"PAUSED".equals(goal.getStatus())) {
            throw new BusinessException("ERR_GOAL_CANNOT_COMPLETE", "Only ACTIVE or PAUSED goal can be completed");
        }
        goal.setStatus("COMPLETED");
        goal.setUpdatedAt(LocalDateTime.now());
        goal = goalRepository.save(goal);
        workspaceService.clearActiveGoal(goal.getWorkspaceId());
        log.info("Goal completed: id={}", goal.getId());
        return goal;
    }

    /**
     * 归档目标。
     */
    public CampaignGoal archiveGoal(String goalId) {
        CampaignGoal goal = getGoal(goalId);
        if (!"COMPLETED".equals(goal.getStatus())) {
            throw new BusinessException("ERR_GOAL_CANNOT_ARCHIVE", "Only COMPLETED goal can be archived");
        }
        goal.setStatus("ARCHIVED");
        goal.setUpdatedAt(LocalDateTime.now());
        goal = goalRepository.save(goal);
        log.info("Goal archived: id={}", goal.getId());
        return goal;
    }

    /**
     * 更新 KPI 当前值（可由事件触发或定时任务调用）。
     */
    public void updateKpiValue(String goalId, String kpiType, BigDecimal value) {
        CampaignGoalKpi kpi = kpiRepository.findByGoalIdAndKpiType(goalId, kpiType)
                .orElseThrow(() -> new ResourceNotFoundException("KPI not found for goal: " + goalId));
        kpi.setCurrentValue(value);
        kpi.setUpdatedAt(LocalDateTime.now());
        kpiRepository.save(kpi);

        // 更新 Goal 的 current_value（汇总）
        CampaignGoal goal = getGoal(goalId);
        BigDecimal total = kpiRepository.sumCurrentValuesByGoalId(goalId);
        goal.setCurrentValue(total);
        goal.setUpdatedAt(LocalDateTime.now());
        goalRepository.save(goal);
    }

    /**
     * 获取 Goal 上下文（含 KPI 和进度）。
     */
    @Transactional(readOnly = true)
    public GoalContext loadContext(String goalId) {
        CampaignGoal goal = getGoal(goalId);
        List<CampaignGoalKpi> kpis = kpiRepository.findByGoalId(goalId);
        Double progress = calculateProgress(goal);

        return GoalContext.builder()
                .goal(goal)
                .kpis(kpis)
                .progress(progress)
                .build();
    }

    /**
     * 计算目标进度。
     */
    @Transactional(readOnly = true)
    public Double calculateProgress(String goalId) {
        CampaignGoal goal = goalRepository.findById(goalId).orElse(null);
        return calculateProgress(goal);
    }

    private Double calculateProgress(CampaignGoal goal) {
        if (goal == null || goal.getTargetValue() == null
                || goal.getTargetValue().compareTo(BigDecimal.ZERO) == 0) {
            return 0.0;
        }
        return goal.getCurrentValue()
                .divide(goal.getTargetValue(), 4, RoundingMode.HALF_UP)
                .doubleValue() * 100;
    }

    /** 获取当前用户 ID */
    private String getCurrentUserId() {
        // TODO: 替换为真实的 SecurityContext.getCurrentUserId()
        return "system";
    }
}
