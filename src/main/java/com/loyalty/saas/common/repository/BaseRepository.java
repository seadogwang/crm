package com.loyalty.saas.common.repository;

import com.loyalty.saas.common.context.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

import java.util.List;
import java.util.Optional;

/**
 * 安全查询哨兵 —— 四层防御体系的第四层：查询校验哨兵。
 *
 * <p>所有业务 Repository 接口必须继承此接口而非直接继承 {@link JpaRepository}。
 * 此接口强制禁用无租户感知的默认查询方法（findById, findAll, deleteAll），
 * 从代码层面杜绝跨租户数据访问（IDOR 漏洞）。
 *
 * <p><b>注意</b>：实际的多租户隔离由 PostgreSQL RLS Policy 保证，
 * 本接口作为代码层面的辅助防线。
 *
 * @param <T>  实体类型
 * @param <ID> 主键类型
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@NoRepositoryBean
public interface BaseRepository<T, ID> extends JpaRepository<T, ID> {

    /**
     * <b>【安全哨兵】禁止使用无租户参数的 findById！</b>
     * 请使用 {@link #findByIdWithTenant(Object)}。
     */
    @Override
    @Deprecated
    default Optional<T> findById(ID id) {
        throw new UnsupportedOperationException(
                "[Query Sentinel] findById(id) 已被禁用！请使用 findByIdWithTenant(id)。"
                        + " 当前租户: " + TenantContext.get());
    }

    /** <b>【安全哨兵】禁止跨租户查询全表。</b> */
    @Override
    @Deprecated
    default List<T> findAll() {
        throw new UnsupportedOperationException("[Query Sentinel] findAll() 已被禁用！");
    }

    /** <b>【安全哨兵】禁止跨租户批量查询。</b> */
    @Override
    @Deprecated
    default List<T> findAllById(Iterable<ID> ids) {
        throw new UnsupportedOperationException("[Query Sentinel] findAllById(ids) 已被禁用！");
    }

    /** <b>【安全哨兵】禁止跨租户全表删除。</b> */
    @Override
    @Deprecated
    default void deleteAll() {
        throw new UnsupportedOperationException("[Query Sentinel] deleteAll() 已被禁用！");
    }

    /** <b>【安全哨兵】禁止跨租户全表删除。</b> */
    @Override
    @Deprecated
    default void deleteAll(Iterable<? extends T> entities) {
        throw new UnsupportedOperationException("[Query Sentinel] deleteAll(entities) 已被禁用！");
    }

    // ---- 安全查询方法 ----

    /** 按租户查找所有实体（需子接口用 @Query 实现） */
    List<T> findAllByProgramCode(String programCode);
    Page<T> findAllByProgramCode(String programCode, Pageable pageable);
    List<T> findAllByProgramCode(String programCode, Sort sort);
    long countByProgramCode(String programCode);

    /**
     * 通过主键 + 当前租户上下文查找实体。
     * 先从 DB 查出，再用反射校验 programCode 匹配（RLS 已保证，此处为双重保险）。
     */
    default Optional<T> findByIdWithTenant(ID id) {
        throw new UnsupportedOperationException(
                "findByIdWithTenant 需要子接口通过 @Query 实现。"
                        + " 示例: @Query(\"SELECT e FROM #{#entityName} e WHERE e.id = :id AND e.programCode = :pc\")");
    }
}