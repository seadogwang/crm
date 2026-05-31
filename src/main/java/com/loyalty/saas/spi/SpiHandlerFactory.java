package com.loyalty.saas.spi;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SPI 处理器工厂，按渠道代码路由到对应的 {@link ChannelSpiHandler}。
 *
 * <p>通过 Spring 自动注入所有 Handler Bean 并建立 {@code channel -> handler} 映射。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class SpiHandlerFactory {

    private static final Logger log = LoggerFactory.getLogger(SpiHandlerFactory.class);

    private final Map<String, ChannelSpiHandler> handlerMap = new ConcurrentHashMap<>();

    public SpiHandlerFactory(List<ChannelSpiHandler> handlers) {
        for (ChannelSpiHandler handler : handlers) {
            handlerMap.put(handler.getChannelCode().toUpperCase(), handler);
            log.info("[SpiHandlerFactory] 注册 SPI Handler: channel={}, class={}",
                    handler.getChannelCode(), handler.getClass().getSimpleName());
        }
    }

    /**
     * 按渠道代码获取处理器。
     *
     * @param channel 渠道代码（不区分大小写）
     * @return 对应处理器
     * @throws IllegalArgumentException 如果未找到对应处理器
     */
    public ChannelSpiHandler getHandler(String channel) {
        ChannelSpiHandler handler = handlerMap.get(channel.toUpperCase());
        if (handler == null) {
            throw new IllegalArgumentException("未找到渠道 SPI 处理器: " + channel
                    + "，已注册: " + handlerMap.keySet());
        }
        return handler;
    }
}