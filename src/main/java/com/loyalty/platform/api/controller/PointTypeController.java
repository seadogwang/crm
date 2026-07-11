package com.loyalty.platform.api.controller;

import com.loyalty.platform.api.service.PointTypeService;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 积分类型管理 API 控制器。
 *
 * <p>设计文档 point_design_update.md §7.1：
 * 提供积分类型的 CRUD 及属性驱动查询接口。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@RestController
@RequestMapping("/api/point-types")
public class PointTypeController {

    private static final Logger log = LoggerFactory.getLogger(PointTypeController.class);

    private final PointTypeService pointTypeService;

    public PointTypeController(PointTypeService pointTypeService) {
        this.pointTypeService = pointTypeService;
    }

    /** 获取积分类型列表 */
    @GetMapping
    public ApiResponse<List<PointTypeDefinition>> list(@RequestParam String programCode) {
        log.debug("[PointType] 查询积分类型列表: program={}", programCode);
        List<PointTypeDefinition> types = pointTypeService.getActiveTypes(programCode);
        return ApiResponse.success(types);
    }

    /** 获取单个类型详情 */
    @GetMapping("/{typeCode}")
    public ApiResponse<PointTypeDefinition> getDetail(@RequestParam String programCode,
                                                       @PathVariable String typeCode) {
        return pointTypeService.getByTypeCode(programCode, typeCode)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("NOT_FOUND", "积分类型不存在: " + typeCode));
    }

    /** 获取可兑换的积分类型 */
    @GetMapping("/redeemable")
    public ApiResponse<List<PointTypeDefinition>> getRedeemable(@RequestParam String programCode) {
        return ApiResponse.success(pointTypeService.getRedeemableTypes(programCode));
    }

    /** 获取计入等级的积分类型 */
    @GetMapping("/tier-calc")
    public ApiResponse<List<PointTypeDefinition>> getTierCalc(@RequestParam String programCode) {
        return ApiResponse.success(pointTypeService.getTierCalcTypes(programCode));
    }

    /** 获取可冲抵的积分类型 */
    @GetMapping("/repayable")
    public ApiResponse<List<PointTypeDefinition>> getRepayable(@RequestParam String programCode) {
        return ApiResponse.success(pointTypeService.getRepayableTypes(programCode));
    }

    /** 创建积分类型 */
    @PostMapping
    public ApiResponse<PointTypeDefinition> create(@RequestBody PointTypeDefinition type) {
        log.info("[PointType] 创建积分类型: program={}, typeCode={}", type.getProgramCode(), type.getTypeCode());
        PointTypeDefinition created = pointTypeService.create(type);
        return ApiResponse.success(created);
    }

    /** 更新积分类型 */
    @PutMapping("/{typeCode}")
    public ApiResponse<PointTypeDefinition> update(@RequestParam String programCode,
                                                    @PathVariable String typeCode,
                                                    @RequestBody PointTypeDefinition updated) {
        log.info("[PointType] 更新积分类型: program={}, typeCode={}", programCode, typeCode);
        return ApiResponse.success(pointTypeService.update(programCode, typeCode, updated));
    }

    /** 删除积分类型（软删除） */
    @DeleteMapping("/{typeCode}")
    public ApiResponse<Void> delete(@RequestParam String programCode,
                                     @PathVariable String typeCode) {
        log.info("[PointType] 删除积分类型: program={}, typeCode={}", programCode, typeCode);
        pointTypeService.delete(programCode, typeCode);
        return ApiResponse.success(null);
    }
}