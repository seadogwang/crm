package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.DomainEventHandler;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * 实验曝光事件处理器 — 监听到曝光事件后标记分流记录为已曝光。
 *
 * <p>监听 Topic: {@code campaign.experiment.exposure}
 *
 * <p><b>幂等性</b>: 如果分流记录已标记为 exposed，则跳过。
 */
@Component
public class ExperimentExposureHandler implements DomainEventHandler<ExperimentExposureEvent> {

    private static final Logger log = LoggerFactory.getLogger(ExperimentExposureHandler.class);

    private final ExperimentAssignmentRepository assignmentRepository;

    public ExperimentExposureHandler(ExperimentAssignmentRepository assignmentRepository) {
        this.assignmentRepository = assignmentRepository;
    }

    @Override
    public String getTopic() {
        return ExperimentExposureEvent.TOPIC;
    }

    @Override
    public Class<ExperimentExposureEvent> getEventType() {
        return ExperimentExposureEvent.class;
    }

    @Override
    public void handle(ExperimentExposureEvent event) {
        String experimentId = event.getExperimentId();
        String memberId = event.getMemberId();

        assignmentRepository.findByExperimentIdAndMemberId(experimentId, memberId)
                .ifPresentOrElse(assignment -> {
                    if (assignment.isExposed()) {
                        log.debug("Assignment already exposed: experimentId={}, memberId={}",
                                experimentId, memberId);
                        return;
                    }
                    assignment.setExposed(true);
                    assignment.setExposedAt(Instant.now());
                    assignmentRepository.save(assignment);
                    log.debug("Assignment marked as exposed: experimentId={}, memberId={}, variant={}",
                            experimentId, memberId, event.getVariantCode());
                }, () -> log.warn("No assignment found for exposure event: experimentId={}, memberId={}",
                        experimentId, memberId));
    }
}
