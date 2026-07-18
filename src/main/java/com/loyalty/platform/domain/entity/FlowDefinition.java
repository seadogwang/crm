package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 流程定义实体 — 存储 React Flow 画布编排的 LiteFlow 流程。
 *
 * <p>前端流程设计器生成的节点/边 JSON 和 EL 表达式全部存于此表。
 * 发布时通过 LiteFlow FlowExecutor.reloadRule() 热更新。
 */
@Entity
@Table(name = "flow_definition")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FlowDefinition {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "chain_name", nullable = false, length = 64)
    private String chainName;

    @Column(name = "chain_type", nullable = false, length = 32)
    private String chainType;

    /** 完整画布状态: { nodes: [], edges: [] } */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "flow_graph", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> flowGraph;

    /** 生成的 LiteFlow EL 表达式 */
    @Column(name = "el_expression", nullable = false, columnDefinition = "TEXT")
    private String elExpression;

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "version")
    @Builder.Default
    private Integer version = 1;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}