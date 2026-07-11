package com.loyalty.platform.api.service;

import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * 积分类型服务 — 属性驱动查询。
 *
 * <p>设计文档 point_design_update.md §6.1：
 * 所有积分类型行为由属性驱动（is_redeemable/is_tier_calc/allow_repay），
 * 消除硬编码的 REWARD/TIER/CREDIT 依赖。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Service
public class PointTypeService {

    private static final Logger log = LoggerFactory.getLogger(PointTypeService.class);

    private final PointTypeDefinitionRepository typeRepo;

    public PointTypeService(PointTypeDefinitionRepository typeRepo) {
        this.typeRepo = typeRepo;
    }

    // ===== 属性驱动查询 =====

    /**
     * 获取所有可兑换的积分类型（兑换引擎使用）。
     */
    public List<PointTypeDefinition> getRedeemableTypes(String programCode) {
        List<PointTypeDefinition> types = typeRepo.findByProgramCodeAndIsRedeemableTrue(programCode);
        log.debug("[PointType] 可兑换积分类型: program={}, count={}", programCode, types.size());
        return types;
    }

    /**
     * 获取所有可冲抵的积分类型（冲抵引擎使用）。
     */
    public List<PointTypeDefinition> getRepayableTypes(String programCode) {
        List<PointTypeDefinition> types = typeRepo.findByProgramCodeAndAllowRepayTrue(programCode);
        log.debug("[PointType] 可冲抵积分类型: program={}, count={}", programCode, types.size());
        return types;
    }

    /**
     * 获取所有计入等级的积分类型（等级引擎使用）。
     */
    public List<PointTypeDefinition> getTierCalcTypes(String programCode) {
        List<PointTypeDefinition> types = typeRepo.findByProgramCodeAndIsTierCalcTrue(programCode);
        log.debug("[PointType] 等级计算积分类型: program={}, count={}", programCode, types.size());
        return types;
    }

    /**
     * 获取所有对用户可见的积分类型。
     */
    public List<PointTypeDefinition> getVisibleTypes(String programCode) {
        return typeRepo.findByProgramCodeAndIsVisibleTrue(programCode);
    }

    // ===== 通用查询 =====

    public List<PointTypeDefinition> getActiveTypes(String programCode) {
        return typeRepo.findActiveByProgramCode(programCode);
    }

    public Optional<PointTypeDefinition> getByTypeCode(String programCode, String typeCode) {
        return typeRepo.findByProgramCodeAndTypeCode(programCode, typeCode);
    }

    // ===== CRUD =====

    @Transactional
    public PointTypeDefinition create(PointTypeDefinition type) {
        log.info("[PointType] 创建积分类型: program={}, typeCode={}", type.getProgramCode(), type.getTypeCode());
        return typeRepo.save(type);
    }

    @Transactional
    public PointTypeDefinition update(String programCode, String typeCode, PointTypeDefinition updated) {
        PointTypeDefinition existing = typeRepo.findByProgramCodeAndTypeCode(programCode, typeCode)
                .orElseThrow(() -> new IllegalArgumentException("积分类型不存在: " + typeCode));
        existing.setTypeName(updated.getTypeName());
        existing.setDescription(updated.getDescription());
        existing.setPointCategory(updated.getPointCategory());
        existing.setIsRedeemable(updated.getIsRedeemable());
        existing.setIsTierCalc(updated.getIsTierCalc());
        existing.setIsTransferable(updated.getIsTransferable());
        existing.setAllowNegative(updated.getAllowNegative());
        existing.setAllowRepay(updated.getAllowRepay());
        existing.setExpiryMode(updated.getExpiryMode());
        existing.setExpiryValue(updated.getExpiryValue());
        existing.setIsVisible(updated.getIsVisible());
        existing.setSortOrder(updated.getSortOrder());
        existing.setOverdraftLimit(updated.getOverdraftLimit());
        existing.setCreditLimit(updated.getCreditLimit());
        existing.setConfigJson(updated.getConfigJson());
        log.info("[PointType] 更新积分类型: program={}, typeCode={}", programCode, typeCode);
        return typeRepo.save(existing);
    }

    @Transactional
    public void delete(String programCode, String typeCode) {
        // 检查是否被变量引用
        if (typeRepo.isReferencedByVariable(programCode, typeCode)) {
            throw new IllegalStateException("积分类型被变量引用，无法删除: " + typeCode);
        }
        PointTypeDefinition existing = typeRepo.findByProgramCodeAndTypeCode(programCode, typeCode)
                .orElseThrow(() -> new IllegalArgumentException("积分类型不存在: " + typeCode));
        existing.setStatus("INACTIVE");
        typeRepo.save(existing);
        log.info("[PointType] 删除积分类型（软删除）: program={}, typeCode={}", programCode, typeCode);
    }
}