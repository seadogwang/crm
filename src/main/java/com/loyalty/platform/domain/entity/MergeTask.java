package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 会员合并异步任务实体。
 * merge() 接口先创建任务记录（CREATED），再由后台 Job 异步执行实际合并。
 */
@Entity
@Table(name = "member_merge_task")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MergeTask implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "main_member_id", nullable = false)
    private Long mainMemberId;

    @Column(name = "duplicate_member_id", nullable = false)
    private Long duplicateMemberId;

    /** 状态: CREATED / PROCESSING / COMPLETED / FAILED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "CREATED";

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}