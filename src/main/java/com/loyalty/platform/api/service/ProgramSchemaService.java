package com.loyalty.platform.api.service;

import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ProgramSchemaService {

    private static final Logger log = LoggerFactory.getLogger(ProgramSchemaService.class);

    private final ProgramSchemaRepository schemaRepo;
    private final RuleDefinitionRepository ruleRepo;

    public ProgramSchemaService(ProgramSchemaRepository schemaRepo, RuleDefinitionRepository ruleRepo) {
        this.schemaRepo = schemaRepo;
        this.ruleRepo = ruleRepo;
    }

    public Map<String, Object> getCurrentSchema(String programCode, String entityType) {
        return schemaRepo.findCurrentByType(programCode, entityType)
                .map(ProgramSchema::getFieldSchema)
                .orElse(Collections.emptyMap());
    }

    public String getCurrentVersion(String programCode, String entityType) {
        return schemaRepo.findCurrentByType(programCode, entityType)
                .map(ProgramSchema::getVersionTag)
                .orElse("v0");
    }

    public List<RuleDefinition> getFieldRuleReferences(String programCode, String fieldName) {
        List<RuleDefinition> activeRules = ruleRepo.findActiveByProgramCode(programCode);
        List<RuleDefinition> referencingRules = new ArrayList<>();
        for (RuleDefinition rule : activeRules) {
            String drl = rule.getDrlContent();
            if (drl != null && drl.contains("\"" + fieldName + "\"")) {
                referencingRules.add(rule);
            }
        }
        return referencingRules;
    }

    public void injectSchemaVersion(Map<String, Object> extAttributes, String programCode, String entityType) {
        if (extAttributes == null) return;
        String version = getCurrentVersion(programCode, entityType);
        try {
            extAttributes.put("_schema_version", version);
        } catch (UnsupportedOperationException e) {
            log.warn("[ProgramSchema] Cannot inject _schema_version into immutable map");
        }
    }

    public ProgramSchema saveSchema(String programCode, String entityType, Map<String, Object> fieldSchema) {
        ProgramSchema existing = schemaRepo.findByProgramCodeAndEntityType(programCode, entityType.toUpperCase()).orElse(null);
        if (existing != null) {
            // 已有记录则更新字段定义，递增版本号，重置状态为 DRAFT
            int currentVer = parseVersionNumber(existing.getVersion());
            existing.setVersion(String.valueOf(currentVer + 1));
            existing.setFieldSchema(fieldSchema);
            existing.setStatus("DRAFT");
            existing.setUpdatedAt(java.time.LocalDateTime.now());
            return schemaRepo.save(existing);
        }
        // 首次创建
        ProgramSchema ps = ProgramSchema.builder()
                .programCode(programCode)
                .entityType(entityType.toUpperCase())
                .entityCategory("SYSTEM")
                .version("1")
                .status("DRAFT")
                .fieldSchema(fieldSchema)
                .schemaCode(entityType.toLowerCase())
                .build();
        return schemaRepo.save(ps);
    }

    public ProgramSchema publishSchema(String programCode, String entityType, Map<String, Object> fieldSchema) {
        ProgramSchema existing = schemaRepo.findByProgramCodeAndEntityType(programCode, entityType.toUpperCase()).orElse(null);
        if (existing != null) {
            // 已有记录：更新字段定义、递增版本号、标记为 PUBLISHED
            int currentVer = parseVersionNumber(existing.getVersion());
            existing.setVersion(String.valueOf(currentVer + 1));
            existing.setFieldSchema(fieldSchema);
            existing.setStatus("PUBLISHED");
            existing.setPublishedAt(java.time.LocalDateTime.now());
            existing.setUpdatedAt(java.time.LocalDateTime.now());
            return schemaRepo.save(existing);
        }
        // 首次创建并发布
        ProgramSchema ps = ProgramSchema.builder()
                .programCode(programCode)
                .entityType(entityType.toUpperCase())
                .entityCategory("SYSTEM")
                .version("1")
                .status("PUBLISHED")
                .fieldSchema(fieldSchema)
                .schemaCode(entityType.toLowerCase())
                .publishedAt(java.time.LocalDateTime.now())
                .build();
        return schemaRepo.save(ps);
    }

    /**
     * 从版本字符串中解析出版本数字。
     * 兼容 "v2"、"2"、"v1" 等格式。
     */
    private int parseVersionNumber(String version) {
        if (version == null) return 0;
        return Integer.parseInt(version.replaceAll("[^0-9]", ""));
    }

    /** 查询所有 Schema */
    public List<ProgramSchema> listSchemas(String programCode, String category) {
        if (category != null && !category.isBlank()) {
            return schemaRepo.findByProgramCodeAndEntityCategory(programCode, category);
        }
        return schemaRepo.findByProgramCodeAndCategory(programCode, null);
    }

    /** 按 entityType 查询 */
    public Optional<ProgramSchema> getByEntityType(String programCode, String entityType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, entityType);
    }

    /** 删除 Schema */
    public void deleteSchema(Long id) {
        schemaRepo.deleteById(id);
    }
}