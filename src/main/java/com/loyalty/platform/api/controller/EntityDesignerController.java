package com.loyalty.platform.api.controller;

import com.loyalty.platform.api.service.EntityDesignService;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.ProgramSchema;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 实体设计器 API — 实体 CRUD、字段管理、关系管理、发布、版本历史。
 *
 * @see Loyalty_entity_designer.md §8
 */
@RestController
@RequestMapping("/api/entity-designer")
@RequiredArgsConstructor
public class EntityDesignerController {

    private final EntityDesignService entityService;

    /** 获取实体列表 */
    @GetMapping("/entities")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listEntities() {
        String pc = TenantContext.getRequired();
        List<ProgramSchema> entities = entityService.listEntities(pc);
        List<Map<String, Object>> result = entities.stream()
                .map(this::toEntityVO).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取实体详情 */
    @GetMapping("/entities/{entityType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getEntity(@PathVariable String entityType) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.getEntity(pc, entityType);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 创建实体 */
    @PostMapping("/entities")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createEntity(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String entityType = (String) body.get("entityType");
        String displayName = (String) body.getOrDefault("displayName", entityType);
        String category = (String) body.getOrDefault("category", "BUSINESS");

        if (entityType == null || entityType.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "entityType 不能为空"));
        }

        ProgramSchema entity = entityService.createEntity(pc, entityType, displayName, category);
        return ResponseEntity.ok(ApiResponse.success("创建成功", toEntityVO(entity)));
    }

    /** 更新实体基本信息 */
    @PutMapping("/entities/{entityType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateEntity(
            @PathVariable String entityType, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String description = (String) body.get("description");
        String category = (String) body.get("category");
        String tableName = (String) body.get("tableName");
        @SuppressWarnings("unchecked")
        Map<String, Object> fixedFieldMapping = (Map<String, Object>) body.get("fixedFieldMapping");
        String extColumn = (String) body.get("extColumn");
        ProgramSchema entity = entityService.updateEntity(pc, entityType, description, category,
                tableName, fixedFieldMapping, extColumn);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 添加字段 */
    @PostMapping("/entities/{entityType}/fields")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addField(
            @PathVariable String entityType, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String fieldName = (String) body.get("fieldName");
        if (fieldName == null || fieldName.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "fieldName 不能为空"));
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> fieldDef = (Map<String, Object>) body.getOrDefault("fieldDef", new LinkedHashMap<>());
        ProgramSchema entity = entityService.addField(pc, entityType, fieldName, fieldDef);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 删除字段 */
    @DeleteMapping("/entities/{entityType}/fields/{fieldName}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteField(
            @PathVariable String entityType, @PathVariable String fieldName) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.deleteField(pc, entityType, fieldName);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 更新 field_schema（批量） */
    @PutMapping("/entities/{entityType}/schema")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateFieldSchema(
            @PathVariable String entityType, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, Object> fieldSchema = (Map<String, Object>) body.get("fieldSchema");
        if (fieldSchema == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "fieldSchema 不能为空"));
        }
        ProgramSchema entity = entityService.updateFieldSchema(pc, entityType, fieldSchema);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 添加关系 */
    @PostMapping("/entities/{entityType}/relations")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addRelation(
            @PathVariable String entityType, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.addRelation(pc, entityType, body);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 更新关系类型 */
    @PutMapping("/entities/{entityType}/relations/{sourceEntity}/{relationId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRelation(
            @PathVariable String entityType, @PathVariable String sourceEntity,
            @PathVariable String relationId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String relationType = (String) body.get("relationType");
        ProgramSchema entity = entityService.updateRelation(pc, entityType, sourceEntity, relationId, relationType);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 删除关系 */
    @DeleteMapping("/entities/{entityType}/relations/{sourceEntity}/{relationId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteRelation(
            @PathVariable String entityType, @PathVariable String sourceEntity,
            @PathVariable String relationId) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.deleteRelation(pc, entityType, sourceEntity, relationId);
        return ResponseEntity.ok(ApiResponse.success(toEntityVO(entity)));
    }

    /** 发布实体 */
    @PostMapping("/entities/{entityType}/publish")
    public ResponseEntity<ApiResponse<Map<String, Object>>> publishEntity(@PathVariable String entityType) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.publishEntity(pc, entityType);
        return ResponseEntity.ok(ApiResponse.success("发布成功", toEntityVO(entity)));
    }

    /** 更新实体位置 */
    @PutMapping("/entities/{entityType}/position")
    public ResponseEntity<ApiResponse<Void>> updatePosition(
            @PathVariable String entityType, @RequestBody Map<String, Object> position) {
        String pc = TenantContext.getRequired();
        entityService.updatePosition(pc, entityType, position);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 删除实体 */
    @DeleteMapping("/entities/{entityType}")
    public ResponseEntity<ApiResponse<Void>> deleteEntity(@PathVariable String entityType) {
        String pc = TenantContext.getRequired();
        ProgramSchema entity = entityService.getEntity(pc, entityType);
        entityService.deleteEntity(entity.getId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 获取固定字段列表 */
    @GetMapping("/fixed-fields/{entityType}")
    public ResponseEntity<ApiResponse<Set<String>>> getFixedFields(@PathVariable String entityType) {
        return ResponseEntity.ok(ApiResponse.success(entityService.getFixedFields(entityType.toUpperCase())));
    }

    // ==================== 辅助 ====================

    private Map<String, Object> toEntityVO(ProgramSchema e) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", e.getId());
        vo.put("programCode", e.getProgramCode());
        vo.put("entityType", e.getEntityType());
        vo.put("entityCategory", e.getEntityCategory());
        vo.put("version", e.getVersion());
        vo.put("status", e.getStatus());
        vo.put("description", e.getDescription());
        vo.put("fieldSchema", e.getFieldSchema());
        vo.put("entityRelations", e.getEntityRelations());
        vo.put("apiConfig", e.getApiConfig());
        vo.put("layoutPosition", e.getLayoutPosition());
        vo.put("tableName", e.getTableName());
        vo.put("fixedFieldMapping", e.getFixedFieldMapping());
        vo.put("extColumn", e.getExtColumn());
        vo.put("createdAt", e.getCreatedAt() != null ? e.getCreatedAt().toString() : null);
        vo.put("updatedAt", e.getUpdatedAt() != null ? e.getUpdatedAt().toString() : null);
        vo.put("publishedAt", e.getPublishedAt() != null ? e.getPublishedAt().toString() : null);
        return vo;
    }
}