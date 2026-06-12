package com.loyalty.platform.flow;

import java.util.*;
import java.util.stream.Collectors;

/**
 * LiteFlow EL 表达式生成器 — 从 React Flow 画布 JSON 生成 EL。
 *
 * <p>支持节点类型: start, sequence, parallel, condition, switch, loop, end。
 * 拓扑排序兜底，保证即使有环或未连通也能生成基本的 THEN 链。
 *
 * @see LiteFlowV1.01.md 第6.2节
 */
public class ElGenerator {

    /**
     * 从 flow_graph JSON（包含 nodes 和 edges 数组）生成 EL 表达式。
     *
     * @param flowGraph React Flow 画布状态，含 "nodes" 和 "edges" 列表
     * @return LiteFlow EL 表达式字符串
     */
    @SuppressWarnings("unchecked")
    public static String generate(Map<String, Object> flowGraph) {
        if (flowGraph == null) return "";

        List<Map<String, Object>> nodes = (List<Map<String, Object>>) flowGraph.getOrDefault("nodes", List.of());
        List<Map<String, Object>> edges = (List<Map<String, Object>>) flowGraph.getOrDefault("edges", List.of());

        if (nodes.isEmpty()) return "";

        // 构建节点映射
        Map<String, Map<String, Object>> nodeMap = new LinkedHashMap<>();
        Map<String, List<String>> adjacency = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();

        for (Map<String, Object> node : nodes) {
            String id = (String) node.get("id");
            nodeMap.put(id, node);
            adjacency.put(id, new ArrayList<>());
            inDegree.put(id, 0);
        }

        for (Map<String, Object> edge : edges) {
            String source = (String) edge.get("source");
            String target = (String) edge.get("target");
            List<String> adj = adjacency.get(source);
            if (adj != null) adj.add(target);
            inDegree.merge(target, 1, Integer::sum);
        }

        // 找到起始节点（入度为 0）
        String startNodeId = null;
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                startNodeId = entry.getKey();
                break;
            }
        }

        if (startNodeId == null) {
            // 兜底：拓扑排序生成 THEN 链
            return fallbackTopologicalSort(nodes, nodeMap, adjacency);
        }

        try {
            return traverse(startNodeId, nodeMap, adjacency, new HashSet<>());
        } catch (Exception e) {
            // 如果递归失败，回退到拓扑排序
            return fallbackTopologicalSort(nodes, nodeMap, adjacency);
        }
    }

    @SuppressWarnings("unchecked")
    private static String traverse(String nodeId,
                                    Map<String, Map<String, Object>> nodeMap,
                                    Map<String, List<String>> adjacency,
                                    Set<String> visited) {
        if (visited.contains(nodeId)) return "";
        visited.add(nodeId);

        Map<String, Object> node = nodeMap.get(nodeId);
        if (node == null) return "";

        String type = (String) node.getOrDefault("type", "sequence");
        List<String> nextNodes = adjacency.getOrDefault(nodeId, List.of());
        Map<String, Object> data = (Map<String, Object>) node.getOrDefault("data", Map.of());
        String compId = (String) data.getOrDefault("componentName", nodeId);

        switch (type) {
            case "start":
                if (nextNodes.size() == 1) {
                    return traverse(nextNodes.get(0), nodeMap, adjacency, visited);
                }
                throw new IllegalStateException("起始节点只能有一个后继");

            case "end":
                return "";

            case "condition": {
                if (nextNodes.size() != 2) {
                    throw new IllegalStateException("条件节点必须有两个分支");
                }
                String thenBranch = traverse(nextNodes.get(0), nodeMap, adjacency, visited);
                String elseBranch = traverse(nextNodes.get(1), nodeMap, adjacency, visited);
                if (elseBranch.isEmpty()) return String.format("IF(%s, %s)", compId, thenBranch);
                return String.format("IF(%s, %s, %s)", compId, thenBranch, elseBranch);
            }

            case "parallel": {
                if (nextNodes.isEmpty()) return compId;
                List<String> bodies = nextNodes.stream()
                        .map(nid -> traverse(nid, nodeMap, adjacency, visited))
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toList());
                return bodies.isEmpty() ? compId
                        : String.format("THEN(%s, WHEN(%s))", compId, String.join(", ", bodies));
            }

            case "switch": {
                if (nextNodes.isEmpty()) return compId;
                List<String> branches = nextNodes.stream()
                        .map(nid -> traverse(nid, nodeMap, adjacency, visited))
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toList());
                return branches.isEmpty() ? compId
                        : String.format("SWITCH(%s).to(%s)", compId, String.join(", ", branches));
            }

            case "loop": {
                if (nextNodes.size() == 0) return compId;
                int loopCount = data.containsKey("loopCount")
                        ? ((Number) data.get("loopCount")).intValue() : 1;
                String loopBody = nextNodes.stream()
                        .map(nid -> traverse(nid, nodeMap, adjacency, visited))
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.joining(", "));
                return loopBody.isEmpty() ? compId
                        : String.format("FOR(%d).DO(THEN(%s))", loopCount, loopBody);
            }

            case "sequence":
            default:
                if (nextNodes.isEmpty()) return compId;
                if (nextNodes.size() == 1) {
                    String tail = traverse(nextNodes.get(0), nodeMap, adjacency, visited);
                    return tail.isEmpty() ? compId
                            : String.format("THEN(%s, %s)", compId, tail);
                }
                // 多后继 → 并行
                List<String> parallel = nextNodes.stream()
                        .map(nid -> traverse(nid, nodeMap, adjacency, visited))
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toList());
                return parallel.isEmpty() ? compId
                        : String.format("THEN(%s, WHEN(%s))", compId, String.join(", ", parallel));
        }
    }

    /** 兜底：拓扑排序生成纯 THEN 链 */
    @SuppressWarnings("unchecked")
    private static String fallbackTopologicalSort(List<Map<String, Object>> nodes,
                                                   Map<String, Map<String, Object>> nodeMap,
                                                   Map<String, List<String>> adjacency) {
        Map<String, Integer> inDeg = new HashMap<>();
        for (String id : nodeMap.keySet()) inDeg.put(id, 0);
        for (String id : adjacency.keySet()) {
            for (String target : adjacency.get(id)) {
                inDeg.merge(target, 1, Integer::sum);
            }
        }

        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> e : inDeg.entrySet()) {
            if (e.getValue() == 0) queue.offer(e.getKey());
        }

        List<String> sorted = new ArrayList<>();
        while (!queue.isEmpty()) {
            String current = queue.poll();
            sorted.add(current);
            for (String next : adjacency.getOrDefault(current, List.of())) {
                inDeg.merge(next, -1, Integer::sum);
                if (inDeg.get(next) == 0) queue.offer(next);
            }
        }

        List<String> components = new ArrayList<>();
        for (String id : sorted) {
            Map<String, Object> node = nodeMap.get(id);
            if (node == null) continue;
            Map<String, Object> data = (Map<String, Object>) node.getOrDefault("data", Map.of());
            String compId = (String) data.getOrDefault("componentName", id);
            components.add(compId);
        }

        return components.isEmpty() ? "" : "THEN(" + String.join(", ", components) + ")";
    }
}