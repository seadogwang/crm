package com.loyalty.platform.master;

import com.loyalty.platform.domain.entity.MasterDataHierarchy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MasterDataHierarchyRepository extends JpaRepository<MasterDataHierarchy, String> {
    List<MasterDataHierarchy> findByProgramCodeAndDataCodeAndNodeLevelOrderBySortOrder(String programCode, String dataCode, Integer nodeLevel);
    List<MasterDataHierarchy> findByProgramCodeAndDataCodeAndNodeLevelAndParentCodeOrderBySortOrder(String programCode, String dataCode, Integer nodeLevel, String parentCode);
    List<MasterDataHierarchy> findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(String programCode, String dataCode, String status);
    List<MasterDataHierarchy> findByProgramCodeAndDataCodeAndParentCodeIsNullOrderBySortOrder(String programCode, String dataCode);
    long countByProgramCodeAndDataCode(String programCode, String dataCode);
}
