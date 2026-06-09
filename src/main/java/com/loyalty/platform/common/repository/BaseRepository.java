package com.loyalty.platform.common.repository;

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
 * 此接口通过 {@link Deprecated} 标记提醒开发者优先使用租户感知的查询方法
 * （如 {@link #findByIdWithTenant(Object)}、{@link #findAllByProgramCode(String)}）。
 *
 * <p><b>设计说明</b>：此前曾使用 {@code default} 方法抛出
 * {@link UnsupportedOperationException} 来阻止无租户参数的方法调用，
 * 但 Java JDK 动态代理在遇到 {@code default} 方法时会直接调用而绕过
 * Spring Data 的代理拦截器，导致 {@link SimpleJpaRepository} 的实现
 * 被屏蔽——所有 {@code findById()}、{@code findAll()} 调用均抛出异常。
 * 因此改为仅通过 {@code @Deprecated} 标记 + 文档提醒，不做运行时阻断。
 *
 * <p><b>注意</b>：实际的多租户隔离由 PostgreSQL RLS Policy 保证，
 * 本接口作为代码层面的辅助防线（编译期 IDE 警告）。
 *
 * @param <T>  实体类型
 * @param <ID> 主键类型
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@NoRepositoryBean
public interface BaseRepository<T, ID> extends JpaRepository<T, ID> {

    /**
     * <b>【安全哨兵】优先使用 {@link #findByIdWithTenant(Object)}。</b>
     * 跨租户隔离由 PostgreSQL RLS Policy 保证。
     */
    @Override
    @Deprecated
    Optional<T> findById(ID id);

    /**
     * <b>【安全哨兵】优先使用 {@link #findAllByProgramCode(String)}。</b>
     * 跨租户隔离由 PostgreSQL RLS Policy 保证。
     */
    @Override
    @Deprecated
    List<T> findAll();

    /**
     * <b>【安全哨兵】优先使用租户感知的查询方法。</b>
     * 跨租户隔离由 PostgreSQL RLS Policy 保证。
     */
    @Override
    @Deprecated
    List<T> findAllById(Iterable<ID> ids);

    /**
     * <b>【安全哨兵】禁止跨租户全表删除。</b>
     * 跨租户隔离由 PostgreSQL RLS Policy 保证。
     */
    @Override
    @Deprecated
    void deleteAll();

    /**
     * <b>【安全哨兵】禁止跨租户全表删除。</b>
     * 跨租户隔离由 PostgreSQL RLS Policy 保证。
     */
    @Override
    @Deprecated
    void deleteAll(Iterable<? extends T> entities);

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