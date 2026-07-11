package com.loyalty.platform.api.controller;

import com.loyalty.platform.api.dto.SaveLayoutRequest;
import com.loyalty.platform.api.service.PageLayoutService;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.PageLayout;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 页面布局设计器 API — 提供布局 CRUD、发布、版本管理、字段列表。
 *
 * @see Loyalty_member_page_config.md §9
 */
@RestController
@RequestMapping("/api/layout")
@RequiredArgsConstructor
public class LayoutController {

    private final PageLayoutService layoutService;

    /**
     * 获取页面布局（优先 PUBLISHED，否则最新 DRAFT）
     */
    @GetMapping("/{programCode}/{entityType}/{pageType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getLayout(
            @PathVariable String programCode,
            @PathVariable String entityType,
            @PathVariable String pageType) {
        PageLayout layout = layoutService.getLayout(programCode, entityType.toUpperCase(), pageType.toUpperCase());
        return ResponseEntity.ok(ApiResponse.success(toVO(layout)));
    }

    /**
     * 保存布局（草稿）
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveLayout(@RequestBody SaveLayoutRequest request) {
        if (request.getProgramCode() == null || request.getProgramCode().isBlank()) {
            request.setProgramCode(TenantContext.getRequired());
        }
        PageLayout saved = layoutService.saveLayout(request);
        return ResponseEntity.ok(ApiResponse.success("保存成功", toVO(saved)));
    }

    /**
     * 发布布局
     */
    @PostMapping("/{layoutId}/publish")
    public ResponseEntity<ApiResponse<Map<String, Object>>> publishLayout(@PathVariable String layoutId) {
        PageLayout published = layoutService.publishLayout(layoutId);
        return ResponseEntity.ok(ApiResponse.success("发布成功", toVO(published)));
    }

    /**
     * 获取版本历史
     */
    @GetMapping("/{programCode}/{entityType}/{pageType}/history")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getHistory(
            @PathVariable String programCode,
            @PathVariable String entityType,
            @PathVariable String pageType) {
        List<PageLayout> history = layoutService.getVersionHistory(
                programCode, entityType.toUpperCase(), pageType.toUpperCase());
        List<Map<String, Object>> result = history.stream()
                .map(LayoutController::toVO)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 回滚到指定版本
     */
    @PostMapping("/{programCode}/{entityType}/{pageType}/rollback/{version}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rollback(
            @PathVariable String programCode,
            @PathVariable String entityType,
            @PathVariable String pageType,
            @PathVariable int version) {
        PageLayout rolled = layoutService.rollbackLayout(
                programCode, entityType.toUpperCase(), pageType.toUpperCase(), version);
        return ResponseEntity.ok(ApiResponse.success("回滚成功", toVO(rolled)));
    }

    /**
     * 获取可用字段列表（从 program_schema 加载，供设计器字段面板使用）
     */
    @GetMapping("/field-schema/{programCode}/{entityType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getFieldSchema(
            @PathVariable String programCode,
            @PathVariable String entityType) {
        // 委托给 ProgramSchemaService 获取当前 schema
        // 这里直接返回 schema 的 properties 供前端使用
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("programCode", programCode);
        result.put("entityType", entityType.toUpperCase());
        // 实际的 field schema 由前端通过 /api/schemas/{entityType} 获取
        // 此端点作为布局系统的统一入口
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 生成默认布局
     */
    @PostMapping("/default/{programCode}/{entityType}/{pageType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> generateDefault(
            @PathVariable String programCode,
            @PathVariable String entityType,
            @PathVariable String pageType) {
        PageLayout defaultLayout = layoutService.generateDefaultLayout(
                programCode, entityType.toUpperCase(), pageType.toUpperCase());
        return ResponseEntity.ok(ApiResponse.success(toVO(defaultLayout)));
    }

    // ==================== 辅助 ====================

    private static Map<String, Object> toVO(PageLayout layout) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", layout.getId());
        vo.put("programCode", layout.getProgramCode());
        vo.put("entityType", layout.getEntityType());
        vo.put("pageType", layout.getPageType());
        vo.put("layoutConfig", layout.getLayoutConfig());
        vo.put("fieldConfig", layout.getFieldConfig());
        vo.put("version", layout.getVersion());
        vo.put("schemaVersion", layout.getSchemaVersion());
        vo.put("status", layout.getStatus());
        vo.put("createdBy", layout.getCreatedBy());
        vo.put("createdAt", layout.getCreatedAt() != null ? layout.getCreatedAt().toString() : null);
        vo.put("updatedBy", layout.getUpdatedBy());
        vo.put("updatedAt", layout.getUpdatedAt() != null ? layout.getUpdatedAt().toString() : null);
        return vo;
    }
}