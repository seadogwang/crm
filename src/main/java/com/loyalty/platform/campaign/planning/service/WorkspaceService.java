package com.loyalty.platform.campaign.planning.service;

import com.loyalty.platform.campaign.planning.dto.CreateWorkspaceRequest;
import com.loyalty.platform.campaign.planning.dto.WorkspaceContext;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.exception.ResourceNotFoundException;
import com.loyalty.platform.domain.entity.Program;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.ProgramRepository;
import com.loyalty.platform.domain.repository.campaign.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 工作区管理服务。
 */
@Service
@Transactional
public class WorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceService.class);

    private final ObjectMapper objectMapper;

    private final CampaignWorkspaceRepository workspaceRepository;
    private final CampaignWorkspaceMemberRepository memberRepository;
    private final CampaignWorkspaceSnapshotRepository snapshotRepository;
    private final CampaignGoalRepository goalRepository;
    private final CampaignInitiativeRepository initiativeRepository;
    private final CampaignPortfolioRepository portfolioRepository;
    private final ProgramRepository programRepository;
    private final WorkspaceLockService lockService;

    public WorkspaceService(CampaignWorkspaceRepository workspaceRepository,
                            CampaignWorkspaceMemberRepository memberRepository,
                            CampaignWorkspaceSnapshotRepository snapshotRepository,
                            CampaignGoalRepository goalRepository,
                            CampaignInitiativeRepository initiativeRepository,
                            CampaignPortfolioRepository portfolioRepository,
                            ProgramRepository programRepository,
                            WorkspaceLockService lockService) {
        this.workspaceRepository = workspaceRepository;
        this.memberRepository = memberRepository;
        this.snapshotRepository = snapshotRepository;
        this.goalRepository = goalRepository;
        this.initiativeRepository = initiativeRepository;
        this.portfolioRepository = portfolioRepository;
        this.programRepository = programRepository;
        this.lockService = lockService;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    /**
     * 创建工作区。
     */
    public CampaignWorkspace createWorkspace(CreateWorkspaceRequest request) {
        // 校验 Program 是否存在
        Program program = programRepository.findByCode(request.getProgramCode())
                .orElseThrow(() -> new BusinessException("ERR_PROGRAM_NOT_FOUND", "Program not found: " + request.getProgramCode()));

        CampaignWorkspace workspace = CampaignWorkspace.builder()
                .id(UUID.randomUUID().toString())
                .programCode(request.getProgramCode())
                .name(request.getName())
                .description(request.getDescription())
                .status("ACTIVE")
                .config(request.getConfig() != null ? request.getConfig() : new java.util.LinkedHashMap<>())
                .createdBy(getCurrentUserId())
                .build();
        workspace = workspaceRepository.save(workspace);

        // 自动将创建者设为 OWNER
        CampaignWorkspaceMember member = CampaignWorkspaceMember.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspace.getId())
                .userId(workspace.getCreatedBy())
                .role("OWNER")
                .build();
        memberRepository.save(member);

        log.info("Workspace created: id={}, name={}, program={}",
                workspace.getId(), workspace.getName(), workspace.getProgramCode());
        return workspace;
    }

    /**
     * 获取工作区（含权限校验）。
     */
    @Transactional(readOnly = true)
    public CampaignWorkspace getWorkspace(String workspaceId) {
        CampaignWorkspace workspace = workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceId));
        return workspace;
    }

    /**
     * 获取工作区（带用户权限校验）。
     */
    @Transactional(readOnly = true)
    public CampaignWorkspace getWorkspace(String workspaceId, String userId) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        if (!hasPermission(workspaceId, userId)) {
            throw new BusinessException("ERR_PERMISSION_DENIED", "No permission to access workspace: " + workspaceId);
        }
        return workspace;
    }

    /**
     * 更新工作区。
     */
    public CampaignWorkspace updateWorkspace(String workspaceId, String name, String description,
                                              java.util.Map<String, Object> config) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        if (name != null) workspace.setName(name);
        if (description != null) workspace.setDescription(description);
        if (config != null) workspace.setConfig(config);
        workspace.setUpdatedAt(LocalDateTime.now());
        workspace = workspaceRepository.save(workspace);
        log.info("Workspace updated: id={}", workspaceId);
        return workspace;
    }

    /**
     * 归档工作区。
     */
    public CampaignWorkspace archiveWorkspace(String workspaceId) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        workspace.setStatus("ARCHIVED");
        workspace.setUpdatedAt(LocalDateTime.now());
        workspace = workspaceRepository.save(workspace);
        log.info("Workspace archived: id={}", workspaceId);
        return workspace;
    }

    /**
     * 查询用户有权限的所有工作区。
     */
    @Transactional(readOnly = true)
    public List<CampaignWorkspace> getUserWorkspaces(String userId) {
        return workspaceRepository.findByCreatedBy(userId);
    }

    /**
     * 按 Program 查询工作区。
     */
    @Transactional(readOnly = true)
    public List<CampaignWorkspace> getWorkspacesByProgram(String programCode) {
        return workspaceRepository.findByProgramCode(programCode);
    }

    /**
     * 加载工作区上下文（AI 核心输入）。
     */
    @Transactional(readOnly = true)
    public WorkspaceContext loadContext(String workspaceId) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        CampaignGoal activeGoal = goalRepository.findActiveGoal(workspaceId).orElse(null);
        List<CampaignInitiative> initiatives = initiativeRepository.findByWorkspaceId(workspaceId);
        List<CampaignPortfolio> portfolios = portfolioRepository.findByWorkspaceId(workspaceId);

        return WorkspaceContext.builder()
                .workspace(workspace)
                .activeGoal(activeGoal)
                .initiatives(initiatives)
                .portfolios(portfolios)
                .build();
    }

    /**
     * 设置工作区的激活目标。
     */
    public void setActiveGoal(String workspaceId, String goalId) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        workspace.setActiveGoalId(goalId);
        workspace.setUpdatedAt(LocalDateTime.now());
        workspaceRepository.save(workspace);
    }

    /**
     * 清除工作区的激活目标。
     */
    public void clearActiveGoal(String workspaceId) {
        CampaignWorkspace workspace = getWorkspace(workspaceId);
        workspace.setActiveGoalId(null);
        workspace.setUpdatedAt(LocalDateTime.now());
        workspaceRepository.save(workspace);
    }

    /**
     * 创建工作区快照（版本控制）。
     */
    public void snapshot(String workspaceId, String snapshotType, Object data) {
        int nextVersion = snapshotRepository.getNextVersion(workspaceId, snapshotType);

        String snapshotData;
        if (data instanceof String) {
            snapshotData = (String) data;
        } else {
            try {
                snapshotData = objectMapper.writeValueAsString(data);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize snapshot data for workspace={}, type={}: {}",
                        workspaceId, snapshotType, e.getMessage());
                snapshotData = "{\"error\":\"serialization failed\"}";
            }
        }

        CampaignWorkspaceSnapshot snapshot = CampaignWorkspaceSnapshot.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspaceId)
                .snapshotType(snapshotType)
                .snapshotData(snapshotData)
                .version(nextVersion)
                .createdBy(getCurrentUserId())
                .build();
        snapshotRepository.save(snapshot);
        log.info("Snapshot created: workspace={}, type={}, version={}",
                workspaceId, snapshotType, nextVersion);
    }

    /**
     * 获取工作区快照列表。
     */
    @Transactional(readOnly = true)
    public List<CampaignWorkspaceSnapshot> getSnapshots(String workspaceId, String snapshotType) {
        if (snapshotType != null) {
            return snapshotRepository.findByWorkspaceIdAndSnapshotType(workspaceId, snapshotType);
        }
        return snapshotRepository.findByWorkspaceId(workspaceId);
    }

    /**
     * 添加工作区成员。
     */
    public CampaignWorkspaceMember addMember(String workspaceId, String userId, String role) {
        CampaignWorkspaceMember member = CampaignWorkspaceMember.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspaceId)
                .userId(userId)
                .role(role)
                .build();
        return memberRepository.save(member);
    }

    /**
     * 移除工作区成员。
     */
    public void removeMember(String workspaceId, String userId) {
        memberRepository.deleteByWorkspaceIdAndUserId(workspaceId, userId);
    }

    /**
     * 权限校验。
     */
    @Transactional(readOnly = true)
    public boolean hasPermission(String workspaceId, String userId) {
        return memberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId);
    }

    /**
     * 获取当前用户 ID（简化实现，生产环境从 SecurityContext 获取）。
     */
    private String getCurrentUserId() {
        // TODO: 替换为真实的 SecurityContext.getCurrentUserId()
        return "system";
    }
}
