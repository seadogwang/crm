package com.loyalty.platform.system.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.system.entity.SysUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SysUserRepository extends BaseRepository<SysUser, Long> {

    Optional<SysUser> findByProgramCodeAndUsername(String programCode, String username);

    Optional<SysUser> findByProgramCodeAndId(String programCode, Long id);

    List<SysUser> findAllByProgramCode(String programCode);

    Page<SysUser> findAllByProgramCode(String programCode, Pageable pageable);

    boolean existsByProgramCodeAndUsername(String programCode, String username);
}
