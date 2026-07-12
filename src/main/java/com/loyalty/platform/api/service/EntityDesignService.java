package com.loyalty.platform.api.service;

import com.loyalty.platform.api.event.SchemaChangedEvent;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 实体设计服务 — 实体 CRUD、字段管理、关系管理、发布、版本历史。
 *
 * @see Loyalty_entity_designer.md §6.1
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class EntityDesignService {

    private final ProgramSchemaRepository schemaRepo;
    private final ApplicationEventPublisher eventPublisher;

    /** 各实体类型的固定字段 */
    private static final Map<String, Set<String>> FIXED_FIELDS = Map.of(
        "MEMBER", Set.of("memberId", "name", "gender", "birthday", "tierCode", "status", "schemaVersion", "createdAt"),
        "ORDER", Set.of("orderId", "memberId", "totalAmount", "status", "createdAt")
    );

    /** 获取所有业务实体 */
    public List<ProgramSchema> listEntities(String programCode) {
        return schemaRepo.findByProgramCodeAndCategory(programCode, null);
    }

    /** 删除实体 */
    @Transactional
    public void deleteEntity(Long id) {
        schemaRepo.deleteById(id);
        log.info("[EntityDesign] 删除实体: id={}", id);
    }

    /** 获取实体详情 */
    public ProgramSchema getEntity(String programCode, String entityType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, entityType.toUpperCase())
                .orElseThrow(() -> new BusinessException("ERR_ENTITY_NOT_FOUND", "实体不存在: " + entityType));
    }

    /** 获取实体（可编辑模式，DRAFT 或 PUBLISHED 均可） */
    public ProgramSchema getEntityForEdit(String programCode, String entityType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, entityType)
                .or(() -> schemaRepo.findByProgramCodeAndEntityType(programCode, entityType.toUpperCase()))
                .orElseThrow(() -> new BusinessException("ERR_ENTITY_NOT_FOUND", "实体不存在: " + entityType));
    }

    /** 创建实体 */
    @Transactional
    public ProgramSchema createEntity(String programCode, String entityType, String displayName, String category) {
        String et = entityType.toUpperCase();
        if (schemaRepo.findByProgramCodeAndEntityType(programCode, et).isPresent()) {
            throw new BusinessException("ERR_ENTITY_EXISTS", "实体已存在: " + et);
        }

        Map<String, Object> fieldSchema = new LinkedHashMap<>();
        fieldSchema.put("type", "object");
        Map<String, Object> properties = new LinkedHashMap<>();

        // 默认 id 字段
        Map<String, Object> idField = new LinkedHashMap<>();
        idField.put("type", "string");
        idField.put("title", "ID");
        idField.put("x-db-metadata", Map.of("dataType", "VARCHAR", "length", 64, "primaryKey", true, "nullable", false));
        properties.put("id", idField);

        fieldSchema.put("properties", properties);

        ProgramSchema schema = ProgramSchema.builder()
                .programCode(programCode)
                .entityType(et)
                .entityCategory(category != null ? category : "BUSINESS")
                .version("1")
                .status("DRAFT")
                .fieldSchema(fieldSchema)
                .entityRelations(new HashMap<>())
                .description(displayName)
                .schemaCode(et.toLowerCase())
                .build();

        log.info("[EntityDesign] 创建实体: program={}, entity={}, category={}", programCode, et, category);
        return schemaRepo.save(schema);
    }

    /** 添加扩展字段 */
    @Transactional
    @SuppressWarnings("unchecked")
    public ProgramSchema addField(String programCode, String entityType, String fieldName,
                                   Map<String, Object> fieldDef) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);

        if (isFixedField(entityType, fieldName)) {
            throw new BusinessException("ERR_FIXED_FIELD", "固定字段不可修改: " + fieldName);
        }

        Map<String, Object> fieldSchema = schema.getFieldSchema();
        Map<String, Object> properties = (Map<String, Object>) fieldSchema.get("properties");
        if (properties == null) {
            properties = new LinkedHashMap<>();
            fieldSchema.put("properties", properties);
        }

        properties.put(fieldName, fieldDef);

        schema.setFieldSchema(fieldSchema);
        schema.setUpdatedAt(LocalDateTime.now());
        log.info("[EntityDesign] 添加字段: entity={}, field={}", entityType, fieldName);
        return schemaRepo.save(schema);
    }

    /** 删除扩展字段 */
    @Transactional
    @SuppressWarnings("unchecked")
    public ProgramSchema deleteField(String programCode, String entityType, String fieldName) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);

        if (isFixedField(entityType, fieldName)) {
            throw new BusinessException("ERR_FIXED_FIELD", "固定字段不可删除: " + fieldName);
        }

        Map<String, Object> fieldSchema = schema.getFieldSchema();
        Map<String, Object> properties = (Map<String, Object>) fieldSchema.get("properties");
        if (properties == null || !properties.containsKey(fieldName)) {
            throw new BusinessException("ERR_FIELD_NOT_FOUND", "字段不存在: " + fieldName);
        }

        // 检查关系引用
        checkFieldInRelations(schema, fieldName);

        properties.remove(fieldName);
        schema.setFieldSchema(fieldSchema);
        schema.setUpdatedAt(LocalDateTime.now());
        log.info("[EntityDesign] 删除字段: entity={}, field={}", entityType, fieldName);
        return schemaRepo.save(schema);
    }

    /** 更新 field_schema */
    @Transactional
    public ProgramSchema updateFieldSchema(String programCode, String entityType,
                                            Map<String, Object> fieldSchemaUpdate) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);
        schema.setFieldSchema(fieldSchemaUpdate);
        schema.setUpdatedAt(LocalDateTime.now());
        return schemaRepo.save(schema);
    }

    /** 添加关系 */
    @Transactional
    @SuppressWarnings("unchecked")
    public ProgramSchema addRelation(String programCode, String entityType,
                                      Map<String, Object> relation) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);

        Map<String, Object> entityRelations = schema.getEntityRelations();
        if (entityRelations == null) entityRelations = new LinkedHashMap<>();

        String id = "rel_" + UUID.randomUUID().toString().substring(0, 8);
        relation.put("id", id);

        // 存储关系：按源实体分组
        String sourceEntity = (String) relation.get("sourceEntity");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sourceRels = (List<Map<String, Object>>) entityRelations.get(sourceEntity);
        if (sourceRels == null) {
            sourceRels = new ArrayList<>();
            entityRelations.put(sourceEntity, sourceRels);
        }
        sourceRels.add(relation);

        schema.setEntityRelations(entityRelations);

        // 将目标实体的字段嵌套到源实体的 field_schema 中
        String targetEntity = (String) relation.get("targetEntity");
        if (targetEntity != null) {
            String childKey = targetEntity.toLowerCase() + "s";
            Optional<ProgramSchema> targetSchema = schemaRepo.findByProgramCodeAndEntityType(programCode, targetEntity.toUpperCase());
            if (targetSchema.isPresent()) {
                Map<String, Object> targetFieldSchema = targetSchema.get().getFieldSchema();
                Map<String, Object> targetProps = (Map<String, Object>) targetFieldSchema.get("properties");
                if (targetProps != null) {
                    Map<String, Object> sourceSchema = new LinkedHashMap<>(schema.getFieldSchema());
                    Map<String, Object> sourceProps = (Map<String, Object>) sourceSchema.get("properties");
                    if (sourceProps == null) {
                        sourceProps = new LinkedHashMap<>();
                        sourceSchema.put("properties", sourceProps);
                    } else {
                        sourceProps = new LinkedHashMap<>(sourceProps);
                    }
                    Map<String, Object> nestedDef = new LinkedHashMap<>();
                    nestedDef.put("type", "array");
                    Map<String, Object> itemsDef = new LinkedHashMap<>();
                    itemsDef.put("type", "object");
                    itemsDef.put("properties", new LinkedHashMap<>(targetProps));
                    nestedDef.put("items", itemsDef);
                    nestedDef.put("title", targetEntity + " 列表");
                    sourceProps.put(childKey, nestedDef);
                    sourceSchema.put("properties", sourceProps);
                    schema.setFieldSchema(sourceSchema);
                }
            }
        }

        schema.setUpdatedAt(LocalDateTime.now());
        log.info("[EntityDesign] 添加关系: {} -> {}，嵌套字段已同步", sourceEntity, targetEntity);
        return schemaRepo.save(schema);
    }

    /** 删除关系 */
    @Transactional
    @SuppressWarnings("unchecked")
    public ProgramSchema deleteRelation(String programCode, String entityType,
                                         String sourceEntity, String relationId) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);

        Map<String, Object> entityRelations = schema.getEntityRelations();
        if (entityRelations != null) {
            List<Map<String, Object>> sourceRels = (List<Map<String, Object>>) entityRelations.get(sourceEntity);
            if (sourceRels != null) {
                sourceRels.removeIf(r -> relationId.equals(r.get("id")));
                if (sourceRels.isEmpty()) entityRelations.remove(sourceEntity);
            }
        }

        schema.setUpdatedAt(LocalDateTime.now());
        return schemaRepo.save(schema);
    }

    /** 发布实体 */
    @Transactional
    public ProgramSchema publishEntity(String programCode, String entityType) {
        String et = entityType.toUpperCase();
        ProgramSchema schema = getEntityForEdit(programCode, et);

        int currentVer = parseVersionNumber(schema.getVersion());
        schema.setVersion(String.valueOf(currentVer + 1));
        schema.setStatus("PUBLISHED");
        schema.setPublishedAt(LocalDateTime.now());
        schema.setUpdatedAt(LocalDateTime.now());

        ProgramSchema saved = schemaRepo.save(schema);

        // 发布 Schema 变更事件
        eventPublisher.publishEvent(new SchemaChangedEvent(this, programCode, et, saved.getVersionTag()));

        log.info("[EntityDesign] 发布实体: entity={}, version={}", et, saved.getVersionTag());
        return saved;
    }

    /** 更新实体位置 */
    @Transactional
    public void updatePosition(String programCode, String entityType, Map<String, Object> position) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);
        schema.setLayoutPosition(position);
        schemaRepo.save(schema);
    }

    /** 更新实体基本信息 */
    @Transactional
    public ProgramSchema updateEntity(String programCode, String entityType,
                                       String description, String category,
                                       String tableName, Map<String, Object> fixedFieldMapping, String extColumn) {
        ProgramSchema schema = getEntityForEdit(programCode, entityType);
        if (description != null) schema.setDescription(description);
        if (category != null) schema.setEntityCategory(category);
        if (tableName != null) schema.setTableName(tableName);
        if (fixedFieldMapping != null) schema.setFixedFieldMapping(fixedFieldMapping);
        if (extColumn != null) schema.setExtColumn(extColumn);
        schema.setUpdatedAt(LocalDateTime.now());
        return schemaRepo.save(schema);
    }

    /** 判断固定字段 */
    public boolean isFixedField(String entityType, String fieldName) {
        Set<String> fixed = FIXED_FIELDS.get(entityType.toUpperCase());
        return fixed != null && fixed.contains(fieldName);
    }

    public Set<String> getFixedFields(String entityType) {
        return FIXED_FIELDS.getOrDefault(entityType.toUpperCase(), Set.of("id", "createdAt", "updatedAt"));
    }

    // ==================== 私有方法 ====================

    private int parseVersionNumber(String version) {
        if (version == null) return 0;
        return Integer.parseInt(version.replaceAll("[^0-9]", ""));
    }

    @SuppressWarnings("unchecked")
    private void checkFieldInRelations(ProgramSchema schema, String fieldName) {
        Map<String, Object> relations = schema.getEntityRelations();
        if (relations == null || relations.isEmpty()) return;

        for (Map.Entry<String, Object> entry : relations.entrySet()) {
            List<Map<String, Object>> sourceRels = (List<Map<String, Object>>) entry.getValue();
            for (Map<String, Object> rel : sourceRels) {
                if (fieldName.equals(rel.get("sourceField")) || fieldName.equals(rel.get("targetField"))) {
                    throw new BusinessException("ERR_FIELD_IN_RELATION",
                            "字段 " + fieldName + " 被关系引用，请先删除关系");
                }
            }
        }
    }
}