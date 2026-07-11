package com.loyalty.platform.api.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * Schema 变更事件 — 当 program_schema 被修改时发布。
 * 监听器自动同步受影响的页面布局（新增/删除字段）。
 *
 * @see Loyalty_member_page_config.md §7.1
 */
@Getter
public class SchemaChangedEvent extends ApplicationEvent {

    private final String programCode;
    private final String entityType;
    private final String newVersion;

    public SchemaChangedEvent(Object source, String programCode, String entityType, String newVersion) {
        super(source);
        this.programCode = programCode;
        this.entityType = entityType;
        this.newVersion = newVersion;
    }
}