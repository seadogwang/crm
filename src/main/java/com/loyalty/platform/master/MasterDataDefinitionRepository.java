package com.loyalty.platform.master;

import com.loyalty.platform.domain.entity.MasterDataDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface MasterDataDefinitionRepository extends JpaRepository<MasterDataDefinition, String> {
    List<MasterDataDefinition> findByProgramCodeOrderByDataCode(String programCode);
    Optional<MasterDataDefinition> findByProgramCodeAndDataCode(String programCode, String dataCode);
    boolean existsByProgramCodeAndDataCode(String programCode, String dataCode);
}
