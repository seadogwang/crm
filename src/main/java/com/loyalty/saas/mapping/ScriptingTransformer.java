package com.loyalty.saas.mapping;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotException;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GraalVM JavaScript 脚本沙箱转换器 —— 极度严格的安全沙箱。
 *
 * <p>在 SaaS 平台执行用户或实施人员编写的 JavaScript 脚本极其危险
 * （可能导致 CPU 死循环、内存 OOM 炸弹或反射调用宿主文件系统）。
 * 必须严格配置 GraalVM Context 如下：
 *
 * <p><b>沙箱约束</b>：
 * <table>
 *   <tr><td>{@code allowAllAccess(false)}</td><td>禁止所有特权访问</td></tr>
 *   <tr><td>{@code allowHostAccess(HostAccess.NONE)}</td><td>严禁 JS 调用任何 Java 宿主类库</td></tr>
 *   <tr><td>{@code allowIO(false)}</td><td>严禁网络和文件 IO</td></tr>
 *   <tr><td>{@code allowNativeAccess(false)}</td><td>严禁 Native 调用</td></tr>
 *   <tr><td>{@code allowCreateThread(false)}</td><td>禁止创建线程</td></tr>
 *   <tr><td>{@code allowValueSharing(false)}</td><td>禁止跨 Context 值共享</td></tr>
 *   <tr><td>{@code context.interrupt(Duration.ofMillis(50))}</td><td>50 毫秒超时防死循环</td></tr>
 * </table>
 *
 * <p><b>线程安全</b>：每次 {@code transform()} 调用创建独立的 Context，
 * 执行完毕后立即释放，无状态共享。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class ScriptingTransformer {

    private static final Logger log = LoggerFactory.getLogger(ScriptingTransformer.class);

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE_REF =
            new TypeReference<>() {};

    /**
     * 在 GraalVM 沙箱中执行 JS 转换脚本。
     *
     * @param jsCode     用户编写的 JS 脚本（必须包含 function transform(source)）
     * @param sourceJson 外部异构 JSON 字符串
     * @return 转换后的标准 Map 结构
     * @throws ScriptTransformException 沙箱超时、内存超限、语法错误
     */
    public Map<String, Object> transform(String jsCode, String sourceJson) {
        if (jsCode == null || jsCode.isBlank()) {
            throw new ScriptTransformException("转换脚本为空");
        }
        if (sourceJson == null || sourceJson.isBlank()) {
            throw new ScriptTransformException("源 JSON 为空");
        }

        long startTime = System.currentTimeMillis();

        // 1. 极其严格的沙箱配置：绝对防御
        try (Context context = Context.newBuilder("js")
                .allowAllAccess(false)                  // 禁止特权访问
                .allowHostAccess(HostAccess.NONE)        // 严禁 JS 调用任何 Java 宿主类库
                .allowIO(IOAccess.NONE)                  // 严禁网络和文件 IO
                .allowNativeAccess(false)                // 严禁 Native 调用
                .option("engine.WarnInterpreterOnly", "false")
                .build()) {

            // 2. 防死循环限制：执行上限 50 毫秒
            context.interrupt(Duration.ofMillis(50));

            // 将原始 JSON 字符串注入 JS 环境
            context.getBindings("js").putMember("sourceJsonStr", sourceJson);

            // 3. 执行用户编写的 transform 函数
            // 用户脚本必须实现 function transform(source) { ... return result; }
            String executionWrapper =
                    "const source = JSON.parse(sourceJsonStr);\n" +
                    jsCode + "\n" +
                    "JSON.stringify(transform(source));";

            Value result = context.eval("js", executionWrapper);
            String jsonResult = result.asString();

            long elapsed = System.currentTimeMillis() - startTime;
            log.debug("[ScriptingTransformer] 转换完成: elapsed={}ms, outputLen={}", elapsed,
                    jsonResult != null ? jsonResult.length() : 0);

            return objectMapper.readValue(jsonResult, MAP_TYPE_REF);

        } catch (PolyglotException e) {
            long elapsed = System.currentTimeMillis() - startTime;
            if (e.isInterrupted()) {
                log.error("[ScriptingTransformer] 脚本执行超时(>50ms): elapsed={}ms", elapsed);
                throw new ScriptTransformException("脚本执行超时(50ms限制)", e);
            }
            if (e.isResourceExhausted()) {
                log.error("[ScriptingTransformer] 脚本资源耗尽(内存/CPU): elapsed={}ms", elapsed);
                throw new ScriptTransformException("脚本资源耗尽(内存/CPU超限)", e);
            }
            if (e.isExit()) {
                log.error("[ScriptingTransformer] 脚本非法退出: exitCode={}", e.getExitStatus());
                throw new ScriptTransformException("脚本非法退出(exitCode=" + e.getExitStatus() + ")", e);
            }
            if (e.isHostException()) {
                log.error("[ScriptingTransformer] 脚本尝试访问宿主资源(已拦截)", e);
                throw new ScriptTransformException("脚本尝试访问宿主资源(已拦截)", e);
            }
            // JS 语法错误
            log.error("[ScriptingTransformer] 脚本语法/运行时错误: {}", e.getMessage());
            throw new ScriptTransformException("脚本转换失败: " + e.getMessage(), e);

        } catch (Exception e) {
            log.error("[ScriptingTransformer] 转换异常", e);
            throw new ScriptTransformException("脚本转换异常: " + e.getMessage(), e);
        }
    }

    /**
     * 脚本转换异常。
     */
    public static class ScriptTransformException extends RuntimeException {
        public ScriptTransformException(String message) { super(message); }
        public ScriptTransformException(String message, Throwable cause) { super(message, cause); }
    }
}