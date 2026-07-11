package com.loyalty.platform.event;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class SchemaMappingResolver {

    private static final Logger log = LoggerFactory.getLogger(SchemaMappingResolver.class);

    private final ProgramSchemaRepository schemaRepo;

    private static final Map<String, String> EVENT_TO_SCHEMA = new HashMap<>();
    static {
        EVENT_TO_SCHEMA.put("ORDER_PAID", "ORDER");
        EVENT_TO_SCHEMA.put("ORDER_REFUND_FULL", "ORDER");
        EVENT_TO_SCHEMA.put("ORDER_REFUND_PARTIAL", "ORDER");
        EVENT_TO_SCHEMA.put("CHECK_IN", "BEHAVIOR");
        EVENT_TO_SCHEMA.put("SHARE", "BEHAVIOR");
        EVENT_TO_SCHEMA.put("REGISTER", "BEHAVIOR");
        EVENT_TO_SCHEMA.put("SIGN_IN", "BEHAVIOR");
        EVENT_TO_SCHEMA.put("ENROLLMENT", "MEMBER");
        EVENT_TO_SCHEMA.put("TIER_CHANGE", "MEMBER");
        EVENT_TO_SCHEMA.put("REDEMPTION", "TRANSACTION");
        EVENT_TO_SCHEMA.put("ADJUSTMENT", "TRANSACTION");
        EVENT_TO_SCHEMA.put("MERGE", "TRANSACTION");
    }

    public SchemaMappingResolver(ProgramSchemaRepository schemaRepo) {
        this.schemaRepo = schemaRepo;
    }

    public String resolveSchemaType(String eventType) {
        if (eventType == null) return "TRANSACTION";

        // 从映射表查找（映射表由 program_schema 的 entity_type 定义驱动）
        String mapped = EVENT_TO_SCHEMA.get(eventType);
        if (mapped != null) return mapped;

        // 动态匹配：提取事件类型前缀，查找 program_schema 中是否存在对应 entity_type
        String prefix = eventType.split("_")[0];
        if (!prefix.equals(eventType)) {
            String pc = TenantContext.get();
            if (pc != null && schemaRepo.findByProgramCodeAndEntityType(pc, prefix).isPresent()) {
                return prefix;
            }
        }

        return "TRANSACTION";
    }

    public String resolveSchemaVersion(String programCode, String schemaType) {
        return schemaRepo.findCurrentByType(programCode, schemaType)
                .map(ps -> ps.getVersionTag())
                .orElse(null);
    }

    public Map<String, Object> resolveSchema(String programCode, String schemaType) {
        return schemaRepo.findCurrentByType(programCode, schemaType)
                .map(ps -> ps.getFieldSchema())
                .orElse(null);
    }

    /** 获取固定字段映射 */
    public Map<String, Object> resolveFixedFieldMapping(String programCode, String schemaType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, schemaType)
                .map(ps -> ps.getFixedFieldMapping())
                .orElse(null);
    }

    /** 获取扩展属性列名 */
    public String resolveExtColumn(String programCode, String schemaType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, schemaType)
                .map(ps -> ps.getExtColumn())
                .orElse("ext_attributes");
    }

    /** 获取实体表名 */
    public String resolveTableName(String programCode, String schemaType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, schemaType)
                .map(ps -> ps.getTableName())
                .orElse(null);
    }
}