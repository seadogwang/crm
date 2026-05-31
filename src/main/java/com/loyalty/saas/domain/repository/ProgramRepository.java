package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.Program;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Program 实体 Repository。
 *
 * <p>注意：Program 表使用 {@code code} 作为 program_code 的角色，
 * 没有独立的 program_code 列。因此所有 BaseRepository 的抽象方法
 * 都需要通过 @Query 显式实现。
 */
@Repository
public interface ProgramRepository extends BaseRepository<Program, String> {

    @Query("SELECT p FROM Program p WHERE p.code = :code")
    Optional<Program> findByCode(@Param("code") String code);

    // ---- 覆盖 BaseRepository 抽象方法（Program 使用 code 而非独立的 program_code） ----

    @Override
    @Query("SELECT p FROM Program p WHERE p.code = :pc")
    List<Program> findAllByProgramCode(@Param("pc") String programCode);

    @Override
    @Query("SELECT p FROM Program p WHERE p.code = :pc")
    Page<Program> findAllByProgramCode(@Param("pc") String programCode, Pageable pageable);

    @Override
    @Query("SELECT p FROM Program p WHERE p.code = :pc")
    List<Program> findAllByProgramCode(@Param("pc") String programCode, Sort sort);

    @Override
    @Query("SELECT COUNT(p) FROM Program p WHERE p.code = :pc")
    long countByProgramCode(@Param("pc") String programCode);

    @Override
    @Query("SELECT p FROM Program p WHERE p.code = :id")
    Optional<Program> findByIdWithTenant(@Param("id") String id);
}