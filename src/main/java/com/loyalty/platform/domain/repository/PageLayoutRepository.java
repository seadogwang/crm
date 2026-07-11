package com.loyalty.platform.domain.repository;

import com.loyalty.platform.domain.entity.PageLayout;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PageLayoutRepository extends JpaRepository<PageLayout, String> {

    /** 按状态查找已发布布局 */
    Optional<PageLayout> findByProgramCodeAndEntityTypeAndPageTypeAndStatus(
            String programCode, String entityType, String pageType, String status);

    /** 获取最新版本（按版本号降序） */
    Optional<PageLayout> findFirstByProgramCodeAndEntityTypeAndPageTypeOrderByVersionDesc(
            String programCode, String entityType, String pageType);

    /** 获取最大版本号 */
    @Query("SELECT COALESCE(MAX(pl.version), 0) FROM PageLayout pl " +
            "WHERE pl.programCode = :programCode AND pl.entityType = :entityType AND pl.pageType = :pageType")
    int findMaxVersion(@Param("programCode") String programCode,
                       @Param("entityType") String entityType,
                       @Param("pageType") String pageType);

    /** 查询所有草稿状态的布局 */
    List<PageLayout> findByProgramCodeAndEntityTypeAndStatus(
            String programCode, String entityType, String status);

    /** 按版本号查询 */
    Optional<PageLayout> findByProgramCodeAndEntityTypeAndPageTypeAndVersion(
            String programCode, String entityType, String pageType, Integer version);

    /** 将指定状态的所有布局更新为另一状态（发布时使用） */
    @Modifying
    @Query("UPDATE PageLayout pl SET pl.status = :newStatus, pl.updatedAt = CURRENT_TIMESTAMP " +
            "WHERE pl.programCode = :programCode AND pl.entityType = :entityType " +
            "AND pl.pageType = :pageType AND pl.status = :oldStatus")
    int updateStatusByProgramCodeAndEntityTypeAndPageType(
            @Param("programCode") String programCode,
            @Param("entityType") String entityType,
            @Param("pageType") String pageType,
            @Param("oldStatus") String oldStatus,
            @Param("newStatus") String newStatus);

    /** 版本历史列表 */
    List<PageLayout> findByProgramCodeAndEntityTypeAndPageTypeOrderByVersionDesc(
            String programCode, String entityType, String pageType);
}