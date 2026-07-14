package com.loyalty.platform.master;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.MasterDataRecord;
import com.loyalty.platform.domain.entity.ProgramSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 主数据记录管理 — 通用业务实体数据维护。
 * 数据结构由 program_schema.field_schema 动态定义，数据存于 master_data_record 表。
 */
@RestController
@RequestMapping("/api/master-data/records")
public class MasterDataRecordController {

    private static final Logger log = LoggerFactory.getLogger(MasterDataRecordController.class);

    private final MasterDataRecordRepository recordRepo;
    private final com.loyalty.platform.domain.repository.ProgramSchemaRepository schemaRepo;

    public MasterDataRecordController(MasterDataRecordRepository recordRepo,
                                       com.loyalty.platform.domain.repository.ProgramSchemaRepository schemaRepo) {
        this.recordRepo = recordRepo;
        this.schemaRepo = schemaRepo;
    }

    // ==================== 实体类型查询 ====================

    /** 获取所有可用作主数据维护的实体类型定义 */
    @GetMapping("/entity-types")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getEntityTypes() {
        String pc = TenantContext.getRequired();
        // 查询所有 entity_category='BUSINESS' 的实体
        List<ProgramSchema> schemas = schemaRepo.findByProgramCodeAndEntityCategory(pc, "BUSINESS");
        List<Map<String, Object>> result = schemas.stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("entityType", s.getEntityType());
                    m.put("description", s.getDescription());
                    // 从 field_schema 提取字段列表
                    Map<String, Object> fs = s.getFieldSchema();
                    Object props = fs != null ? fs.get("properties") : null;
                    List<Map<String, Object>> fields = new ArrayList<>();
                    if (props instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> propMap = (Map<String, Object>) props;
                        for (Map.Entry<String, Object> e : propMap.entrySet()) {
                            Map<String, Object> fieldInfo = new LinkedHashMap<>();
                            fieldInfo.put("field", e.getKey());
                            @SuppressWarnings("unchecked")
                            Map<String, Object> def = e.getValue() instanceof Map ? (Map<String, Object>) e.getValue() : Map.of();
                            fieldInfo.put("def", def);
                            // 提取 x-ui-metadata
                            Object uiMeta = def.get("x-ui-metadata");
                            if (uiMeta instanceof Map) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> ui = (Map<String, Object>) uiMeta;
                                fieldInfo.put("label", ui.getOrDefault("label", e.getKey()));
                                fieldInfo.put("group", ui.getOrDefault("group", ""));
                                fieldInfo.put("colSpan", ui.getOrDefault("colSpan", 2));
                                fieldInfo.put("showInUI", ui.getOrDefault("showInUI", true));
                            } else {
                                fieldInfo.put("label", e.getKey());
                                fieldInfo.put("showInUI", true);
                            }
                            // master data config
                            Object md = def.get("x-master-data");
                            if (md instanceof Map) {
                                fieldInfo.put("masterData", md);
                            }
                            fields.add(fieldInfo);
                        }
                    }
                    m.put("fields", fields);
                    m.put("fieldSchema", fs);
                    m.put("itemCount", recordRepo.countByProgramCodeAndEntityType(pc, s.getEntityType()));
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 记录 CRUD ====================

    /** 获取某实体的所有记录 */
    @GetMapping("/{entityType}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRecords(
            @PathVariable String entityType,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size) {
        String pc = TenantContext.getRequired();
        List<MasterDataRecord> records = recordRepo.findByProgramCodeAndEntityTypeOrderByCreatedAtDesc(pc, entityType);
        List<Map<String, Object>> result = records.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>(r.getFieldValues());
            m.put("_id", r.getId());
            m.put("_createdAt", r.getCreatedAt());
            m.put("_updatedAt", r.getUpdatedAt());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 创建记录 */
    @PostMapping("/{entityType}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRecord(
            @PathVariable String entityType, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        MasterDataRecord record = MasterDataRecord.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .entityType(entityType)
                .fieldValues(body)
                .status("ACTIVE")
                .build();
        recordRepo.save(record);
        log.info("[MasterDataRecord] 创建: type={}, id={}", entityType, record.getId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", record.getId())));
    }

    /** 更新记录 */
    @PutMapping("/{entityType}/{recordId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRecord(
            @PathVariable String entityType, @PathVariable String recordId,
            @RequestBody Map<String, Object> body) {
        MasterDataRecord record = recordRepo.findById(recordId).orElse(null);
        if (record == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "记录不存在"));
        }
        record.setFieldValues(body);
        record.setUpdatedAt(LocalDateTime.now());
        recordRepo.save(record);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", true)));
    }

    /** 删除记录 */
    @DeleteMapping("/{entityType}/{recordId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteRecord(
            @PathVariable String entityType, @PathVariable String recordId) {
        recordRepo.deleteById(recordId);
        return ResponseEntity.ok(ApiResponse.success(Map.of("deleted", true)));
    }
}
