package com.loyalty.platform.system.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.system.entity.SysRole;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SysRoleRepository extends BaseRepository<SysRole, Long> {

    List<SysRole> findAllByProgramCode(String programCode);

    Optional<SysRole> findByProgramCodeAndId(String programCode, Long id);

    Optional<SysRole> findByProgramCodeAndRoleCode(String programCode, String roleCode);

    boolean existsByProgramCodeAndRoleCode(String programCode, String roleCode);
}
