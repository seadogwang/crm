package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.common.repository.BaseRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.NoRepositoryBean;

import java.util.List;

/**
 * Campaign 模块的仓库基类。
 * Campaign 表通过 workspace_id 或 program_code 进行租户隔离，
 * 非所有表都有 programCode 字段。本基类用 @Query 覆盖
 * BaseRepository 中的 findAllByProgramCode 方法，
 * 避免 Spring Data 方法名推导报 NoPropertyException。
 *
 * @param <T>  实体类型
 * @param <ID> 主键类型
 */
@NoRepositoryBean
public interface CampaignBaseRepository<T, ID> extends BaseRepository<T, ID> {

    /** 不需要按 programCode 过滤时返回全部 */
    @Override
    @Query("SELECT e FROM #{#entityName} e")
    List<T> findAllByProgramCode(String programCode);

    @Override
    @Query("SELECT e FROM #{#entityName} e")
    Page<T> findAllByProgramCode(String programCode, Pageable pageable);

    @Override
    @Query("SELECT e FROM #{#entityName} e")
    List<T> findAllByProgramCode(String programCode, Sort sort);

    @Override
    @Query("SELECT COUNT(e) FROM #{#entityName} e")
    long countByProgramCode(String programCode);
}
