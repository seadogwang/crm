package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ChannelAdapterConfigRepository extends BaseRepository<ChannelAdapterConfig, Long> {

    @Query("SELECT c FROM ChannelAdapterConfig c WHERE c.programCode = :pc AND c.channel = :ch AND c.status = 'ACTIVE'")
    Optional<ChannelAdapterConfig> findActiveByProgramAndChannel(@Param("pc") String programCode, @Param("ch") String channel);
}