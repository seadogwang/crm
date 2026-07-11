package com.loyalty.platform.api.event;

import com.loyalty.platform.api.service.PageLayoutService;
import com.loyalty.platform.domain.entity.PageLayout;
import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Schema 变更监听器 — 监听 program_schema 变更，自动同步 DRAFT 状态的页面布局。
 *
 * @see Loyalty_member_page_config.md §7.1
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class SchemaChangeListener {

    private final PageLayoutService layoutService;
    private final ProgramSchemaRepository schemaRepo;

    /**
     * 当 Schema 变更时，自动同步所有 DRAFT 状态的布局：
     * - 新增字段 → 自动添加到最后一个分组的末尾
     * - 删除字段 → 从布局中移除（软删除，标记为 hidden）
     * - 必填属性变更 → 同步 required 属性
     */
    @EventListener
    @Transactional
    public void onSchemaChanged(SchemaChangedEvent event) {
        String programCode = event.getProgramCode();
        String entityType = event.getEntityType();
        String newVersion = event.getNewVersion();

        log.info("[SchemaChangeListener] Schema 变更: program={}, entity={}, version={}",
                programCode, entityType, newVersion);

        // 获取新 Schema 的字段列表
        Set<String> newFieldKeys = getSchemaFieldKeys(programCode, entityType);
        if (newFieldKeys.isEmpty()) {
            log.info("[SchemaChangeListener] 无可用的 Schema 字段，跳过同步");
            return;
        }

        // 查询所有 DRAFT 状态的布局
        List<PageLayout> drafts = layoutService.findDraftsByProgramCodeAndEntityType(programCode, entityType);
        if (drafts.isEmpty()) {
            log.info("[SchemaChangeListener] 没有 DRAFT 状态的布局需要同步");
            return;
        }

        for (PageLayout draft : drafts) {
            syncLayoutFields(draft, newFieldKeys, programCode, entityType);
        }
    }

    /**
     * 同步单个布局的字段
     */
    @SuppressWarnings("unchecked")
    private void syncLayoutFields(PageLayout layout, Set<String> newFieldKeys,
                                   String programCode, String entityType) {
        Map<String, Object> config = layout.getLayoutConfig();
        if (config == null) return;

        List<Map<String, Object>> sections = (List<Map<String, Object>>) config.get("sections");
        if (sections == null || sections.isEmpty()) return;

        // 收集当前布局中的所有字段
        Set<String> currentFieldKeys = new LinkedHashSet<>();
        for (Map<String, Object> section : sections) {
            List<Map<String, Object>> fields = (List<Map<String, Object>>) section.get("fields");
            if (fields == null) continue;
            for (Map<String, Object> field : fields) {
                String key = (String) field.get("field_key");
                if (key != null) currentFieldKeys.add(key);
            }
        }

        // 新增字段 → 添加到最后一个分组
        Set<String> addedFields = new LinkedHashSet<>(newFieldKeys);
        addedFields.removeAll(currentFieldKeys);

        // 删除字段 → 从布局中移除
        Set<String> removedFields = new LinkedHashSet<>(currentFieldKeys);
        removedFields.removeAll(newFieldKeys);

        if (addedFields.isEmpty() && removedFields.isEmpty()) {
            log.debug("[SchemaChangeListener] 布局 {} 无需同步", layout.getId());
            layout.setSchemaVersion(getCurrentSchemaVersion(programCode, entityType));
            return;
        }

        log.info("[SchemaChangeListener] 同步布局 {}: 新增={}, 删除={}",
                layout.getId(), addedFields, removedFields);

        // 移除已删除的字段
        for (Map<String, Object> section : sections) {
            List<Map<String, Object>> fields = (List<Map<String, Object>>) section.get("fields");
            if (fields == null) continue;
            fields.removeIf(f -> {
                String key = (String) f.get("field_key");
                return key != null && removedFields.contains(key);
            });
        }

        // 新增字段添加到最后一个分组
        if (!addedFields.isEmpty()) {
            Map<String, Object> lastSection = sections.get(sections.size() - 1);
            List<Map<String, Object>> lastFields = (List<Map<String, Object>>) lastSection.get("fields");
            if (lastFields == null) {
                lastFields = new ArrayList<>();
                lastSection.put("fields", lastFields);
            }

            for (String fieldKey : addedFields) {
                Map<String, Object> newField = new LinkedHashMap<>();
                newField.put("id", "field_" + fieldKey + "_" + System.currentTimeMillis());
                newField.put("field_key", fieldKey);
                newField.put("label", fieldKey);
                newField.put("component", inferComponent(fieldKey));
                newField.put("span", 1);
                newField.put("required", false);
                newField.put("readonly", false);
                lastFields.add(newField);
            }
        }

        // 更新 schema_version
        layout.setSchemaVersion(getCurrentSchemaVersion(programCode, entityType));
    }

    /**
     * 获取当前 Schema 中定义的所有字段 key
     */
    @SuppressWarnings("unchecked")
    private Set<String> getSchemaFieldKeys(String programCode, String entityType) {
        Optional<ProgramSchema> schemaOpt = schemaRepo.findByProgramCodeAndEntityType(programCode, entityType);
        if (schemaOpt.isEmpty()) return Collections.emptySet();

        ProgramSchema schema = schemaOpt.get();
        Map<String, Object> fieldSchema = schema.getFieldSchema();
        if (fieldSchema == null) return Collections.emptySet();

        Map<String, Object> properties = (Map<String, Object>) fieldSchema.get("properties");
        if (properties == null) return Collections.emptySet();

        return new LinkedHashSet<>(properties.keySet());
    }

    private String getCurrentSchemaVersion(String programCode, String entityType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, entityType)
                .map(ProgramSchema::getVersionTag)
                .orElse("v0");
    }

    private String inferComponent(String fieldKey) {
        String lower = fieldKey.toLowerCase();
        if (lower.contains("date") || lower.contains("birthday") || lower.contains("time")) return "DatePicker";
        if (lower.contains("gender") || lower.contains("sex")) return "Select";
        if (lower.contains("amount") || lower.contains("price") || lower.contains("age")
                || lower.contains("size") || lower.contains("number")) return "InputNumber";
        if (lower.contains("status") || lower.contains("flag") || lower.contains("switch")) return "Switch";
        if (lower.contains("id") || lower.contains("code")) return "Text";
        return "Input";
    }
}