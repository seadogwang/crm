package com.loyalty.platform.master;

import com.loyalty.platform.domain.entity.MasterDataRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MasterDataRecordRepository extends JpaRepository<MasterDataRecord, String> {
    List<MasterDataRecord> findByProgramCodeAndEntityTypeOrderByCreatedAtDesc(String programCode, String entityType);
    long countByProgramCodeAndEntityType(String programCode, String entityType);
    void deleteByProgramCodeAndEntityType(String programCode, String entityType);
}
