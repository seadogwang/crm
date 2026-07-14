package com.loyalty.platform.master;

import com.loyalty.platform.domain.entity.MasterDataEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MasterDataEnumRepository extends JpaRepository<MasterDataEnum, String> {
    List<MasterDataEnum> findByProgramCodeAndDataCodeOrderBySortOrder(String programCode, String dataCode);
    List<MasterDataEnum> findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(String programCode, String dataCode, String status);
    long countByProgramCodeAndDataCode(String programCode, String dataCode);
}
