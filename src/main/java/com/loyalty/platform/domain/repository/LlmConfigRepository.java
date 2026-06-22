package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.LlmConfig;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LlmConfigRepository extends BaseRepository<LlmConfig, Long> {

    @Query("SELECT l FROM LlmConfig l WHERE l.programCode = :pc")
    Optional<LlmConfig> findByProgramCode(@Param("pc") String programCode);
}
