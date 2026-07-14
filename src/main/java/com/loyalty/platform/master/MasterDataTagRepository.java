package com.loyalty.platform.master;

import com.loyalty.platform.domain.entity.MasterDataTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MasterDataTagRepository extends JpaRepository<MasterDataTag, String> {
    List<MasterDataTag> findByProgramCodeOrderByTagGroup(String programCode);
    boolean existsByProgramCodeAndTagCode(String programCode, String tagCode);
}
