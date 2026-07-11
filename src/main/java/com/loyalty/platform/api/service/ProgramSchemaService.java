package com.loyalty.platform.api.service;

import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import com.loyalty.platform.api.event.SchemaChangedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ProgramSchemaService {

    private static final Logger log = LoggerFactory.getLogger(ProgramSchemaService.class);

    private final ProgramSchemaRepository schemaRepo;
    private final RuleDefinitionRepository ruleRepo;
    private final ApplicationEventPublisher eventPublisher;

    public ProgramSchemaService(ProgramSchemaRepository schemaRepo, RuleDefinitionRepository ruleRepo,
                                ApplicationEventPublisher eventPublisher) {
        this.schemaRepo = schemaRepo;
        this.ruleRepo = ruleRepo;
        this.eventPublisher = eventPublisher;
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
        ProgramSchema saved;
        if (existing != null) {
            int currentVer = parseVersionNumber(existing.getVersion());
            existing.setVersion(String.valueOf(currentVer + 1));
            existing.setFieldSchema(fieldSchema);
            // 保持原有状态不变（PUBLISHED 保持 PUBLISHED，DRAFT 保持 DRAFT）
            existing.setUpdatedAt(java.time.LocalDateTime.now());
            saved = schemaRepo.save(existing);
        } else {
            ProgramSchema ps = ProgramSchema.builder()
                    .programCode(programCode)
                    .entityType(entityType.toUpperCase())
                    .entityCategory("SYSTEM")
                    .version("1")
                    .status("DRAFT")
                    .fieldSchema(fieldSchema)
                    .schemaCode(entityType.toLowerCase())
                    .build();
            saved = schemaRepo.save(ps);
        }
        // 发布 Schema 变更事件
        eventPublisher.publishEvent(new SchemaChangedEvent(this, programCode,
                entityType.toUpperCase(), saved.getVersionTag()));
        return saved;
    }

    public ProgramSchema publishSchema(String programCode, String entityType, Map<String, Object> fieldSchema) {
        ProgramSchema existing = schemaRepo.findByProgramCodeAndEntityType(programCode, entityType.toUpperCase()).orElse(null);
        ProgramSchema published;
        if (existing != null) {
            int currentVer = parseVersionNumber(existing.getVersion());
            existing.setVersion(String.valueOf(currentVer + 1));
            existing.setFieldSchema(fieldSchema);
            existing.setStatus("PUBLISHED");
            existing.setPublishedAt(java.time.LocalDateTime.now());
            existing.setUpdatedAt(java.time.LocalDateTime.now());
            published = schemaRepo.save(existing);
        } else {
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
            published = schemaRepo.save(ps);
        }
        // 发布 Schema 变更事件
        eventPublisher.publishEvent(new SchemaChangedEvent(this, programCode,
                entityType.toUpperCase(), published.getVersionTag()));
        return published;
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