package com.loyalty.platform.campaign.sharing;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Service
@Transactional
public class SharingPolicyService {

    private static final Logger log = LoggerFactory.getLogger(SharingPolicyService.class);

    private final SharingPolicyRepository policyRepository;
    private final GlobalBlacklistRepository blacklistRepository;
    private final CrossProgramRelationRepository relationRepository;

    public SharingPolicyService(SharingPolicyRepository policyRepository,
                                 GlobalBlacklistRepository blacklistRepository,
                                 CrossProgramRelationRepository relationRepository) {
        this.policyRepository = policyRepository;
        this.blacklistRepository = blacklistRepository;
        this.relationRepository = relationRepository;
    }

    /** 获取可访问的Program列表 */
    public Set<String> getAccessiblePrograms(String sourceProgram, String resourceType) {
        Set<String> result = new LinkedHashSet<>();
        result.add(sourceProgram);
        List<SharingPolicy> policies = policyRepository.findByEnabledTrue();
        for (SharingPolicy p : policies) {
            if (isProgramInScope(p, sourceProgram)) {
                result.add(p.getProgramCode());
            }
        }
        return result;
    }

    /** 检查是否可访问 */
    public boolean canAccess(String sourceProgram, String targetProgram) {
        if (sourceProgram.equals(targetProgram)) return true;
        List<SharingPolicy> policies = policyRepository.findByProgramCodeAndEnabledTrue(targetProgram);
        return policies.stream().anyMatch(p -> isProgramInScope(p, sourceProgram));
    }

    /** 保存共享策略 */
    public SharingPolicy savePolicy(SharingPolicy policy) {
        if (policy.getId() == null) policy.setId(UUID.randomUUID().toString());
        return policyRepository.save(policy);
    }

    /** 获取Program的所有策略 */
    public List<SharingPolicy> getPolicies(String programCode) {
        return policyRepository.findByProgramCodeAndEnabledTrue(programCode);
    }

    /** 全局黑名单检查 */
    public boolean isGloballyBlacklisted(String memberId) {
        return blacklistRepository.existsByMemberIdAndIsActiveTrue(memberId);
    }

    /** 添加全局黑名单 */
    public GlobalBlacklist addBlacklist(String memberId, String sourceProgram, String reason) {
        GlobalBlacklist entry = GlobalBlacklist.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId).sourceProgram(sourceProgram)
                .sourceType("MANUAL").reason(reason)
                .sharingScope("GLOBAL").isActive(true).build();
        return blacklistRepository.save(entry);
    }

    /** 跨Program Campaign关联 */
    public CrossProgramRelation addRelation(String planId, String programCode, String role, BigDecimal budget) {
        CrossProgramRelation r = CrossProgramRelation.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId).programCode(programCode)
                .role(role).budgetAllocation(budget).build();
        return relationRepository.save(r);
    }

    /** 获取Campaign关联的Program列表 */
    public List<CrossProgramRelation> getRelations(String planId) {
        return relationRepository.findByPlanId(planId);
    }

    private boolean isProgramInScope(SharingPolicy policy, String targetProgram) {
        return switch (policy.getSharingScope()) {
            case "GLOBAL" -> true;
            case "SELECTIVE" -> policy.getTargetPrograms() != null &&
                    Arrays.asList(policy.getTargetPrograms()).contains(targetProgram);
            default -> false;
        };
    }
}
