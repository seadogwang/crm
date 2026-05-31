package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.RedemptionAllocation;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RedemptionAllocationRepository extends BaseRepository<RedemptionAllocation, Long> {

    /**
     * 按核销流水 ID 查询所有分摊记录（用于退款时还原原始批次生命周期）。
     */
    @Query("SELECT r FROM RedemptionAllocation r WHERE r.programCode = :pc AND r.redemptionTransactionId = :redemptionTxId")
    List<RedemptionAllocation> findByRedemptionTxId(@Param("pc") String programCode,
                                                     @Param("redemptionTxId") Long redemptionTxId);
}