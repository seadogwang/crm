package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.OneIdStrategy;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface OneIdStrategyRepository extends BaseRepository<OneIdStrategy, String> {
    List<OneIdStrategy> findByProgramCode(String programCode);
}