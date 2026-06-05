import React, { useMemo } from 'react';
import { EdgeLabelRenderer, useNodes, type EdgeProps, type Node } from '@xyflow/react';
import type { EntityNodeData, EntityEdgeData, EntityFieldExt } from './types';

/** 字段行高 */
const FIELD_H = 23;
const HEADER_H = 36;
const NODE_MIN_W = 230;

/**
 * 从节点数据中找到字段的 Y 偏移
 */
function getFieldY(nodeData: EntityNodeData | undefined, fieldKey: string): number {
  if (!nodeData) return 0;
  const idx = (nodeData.fields as EntityFieldExt[]).findIndex((f: EntityFieldExt) => f.key === fieldKey);
  if (idx < 0) return 0;
  return HEADER_H + idx * FIELD_H + FIELD_H / 2;
}

/**
 * 自定义边：根据实体位置自动选择连接侧（左/右），只从左右两侧连线
 */
const CustomEdge: React.FC<EdgeProps> = ({
  source, target, data, selected,
  // 忽略 React Flow props 的 sourceX/sourceY，用 useNodes 自己算
}) => {
  const allNodes = useNodes();
  const sourceNode = allNodes.find(n => n.id === source) as Node<EntityNodeData> | undefined;
  const targetNode = allNodes.find(n => n.id === target) as Node<EntityNodeData> | undefined;

  const edgeData = data as EntityEdgeData | undefined;
  const fromField = edgeData?.fromField || '';
  const toField = edgeData?.toField || '';
  const relType = edgeData?.type || '1:N';
  const isLocked = edgeData?.locked;

  // 计算字段在各自节点内的 Y 偏移
  const srcFieldY = getFieldY(sourceNode?.data as EntityNodeData | undefined, fromField);
  const tgtFieldY = getFieldY(targetNode?.data as EntityNodeData | undefined, toField);

  // 绝对坐标
  const sx = sourceNode?.position.x ?? 0;
  const sy = sourceNode?.position.y ?? 0;
  const tx = targetNode?.position.x ?? 0;
  const ty = targetNode?.position.y ?? 0;
  const sw = (sourceNode?.measured?.width ?? sourceNode?.width ?? NODE_MIN_W) as number;
  const tw = (targetNode?.measured?.width ?? targetNode?.width ?? NODE_MIN_W) as number;

  // 源字段的绝对 Y
  const srcAbsY = sy + srcFieldY;
  const tgtAbsY = ty + tgtFieldY;

  // 根据实体 X 位置决定连线侧：源在左 → 用右边出，目标用左边入
  const sourceIsLeft = sx + sw / 2 < tx + tw / 2;

  // 源端点：如果源在左边，从源节点右边出去；如果源在右边，从源节点左边出去
  const srcX = sourceIsLeft ? sx + sw : sx;
  const tgtX = sourceIsLeft ? tx : tx + tw;

  const edgeColor = selected ? '#ff4d4f' : isLocked ? '#999' : '#1677ff';
  const r = 6; // 圆角半径

  // 解析基数
  let leftCard = '1', rightCard = 'N';
  if (relType === '1:1') { leftCard = '1'; rightCard = '1'; }
  else if (relType === '1:N') { leftCard = '1'; rightCard = 'N'; }
  else if (relType === 'N:1') { leftCard = 'N'; rightCard = '1'; }
  else if (relType === 'N:M') { leftCard = 'N'; rightCard = 'M'; }

  // 构建 step-path
  const edgePath = useMemo(() => {
    const signY = tgtAbsY >= srcAbsY ? 1 : -1;
    const absDY = Math.abs(tgtAbsY - srcAbsY);
    if (absDY < 20) {
      return `M${srcX},${srcAbsY}L${tgtX},${tgtAbsY}`;
    }
    // 水平偏移
    const hOffset = sourceIsLeft ? 35 : -35;
    const hOffset2 = sourceIsLeft ? -35 : 35;
    const stepX = srcX + hOffset;
    const stepX2 = tgtX + hOffset2;

    return [
      `M${srcX},${srcAbsY}`,
      `L${stepX},${srcAbsY}`,
      `L${stepX + (sourceIsLeft ? r : -r)},${srcAbsY}`,
      `Q${stepX + (sourceIsLeft ? r : -r)},${srcAbsY} ${stepX + (sourceIsLeft ? r : -r)},${srcAbsY + signY * r}`,
      `L${stepX + (sourceIsLeft ? r : -r)},${tgtAbsY - signY * r}`,
      `Q${stepX + (sourceIsLeft ? r : -r)},${tgtAbsY} ${stepX + (sourceIsLeft ? r * 2 : -r * 2)},${tgtAbsY}`,
      `L${stepX2 - (sourceIsLeft ? -r * 2 : r * 2)},${tgtAbsY}`,
      `Q${stepX2 + (sourceIsLeft ? r : -r)},${tgtAbsY} ${stepX2 + (sourceIsLeft ? r : -r)},${tgtAbsY}`,
      `L${stepX2},${tgtAbsY}`,
      `L${tgtX},${tgtAbsY}`,
    ].join(' ');
  }, [srcX, srcAbsY, tgtX, tgtAbsY, sourceIsLeft]);

  const labelX = (srcX + tgtX) / 2;
  const labelY = (srcAbsY + tgtAbsY) / 2;

  return (
    <>
      {/* 透明宽交互路径 */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20}
        className="react-flow__edge-interaction" />
      {/* 可见边 */}
      <path d={edgePath} fill="none" stroke={edgeColor}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={isLocked ? '4,2' : 'none'} />
      {/* 左侧基数 */}
      <circle cx={srcX + (sourceIsLeft ? 14 : -14)} cy={srcAbsY} r="7"
        fill={selected ? '#ff4d4f' : '#1677ff'} stroke="#fff" strokeWidth={1} />
      <text x={srcX + (sourceIsLeft ? 14 : -14)} y={srcAbsY + 3.5}
        textAnchor="middle" fontSize={8} fontWeight={600} fill="#fff"
        style={{ fontFamily: 'monospace' }}>{leftCard}</text>
      {/* 右侧基数 */}
      <circle cx={tgtX + (sourceIsLeft ? -14 : 14)} cy={tgtAbsY} r="7"
        fill={selected ? '#ff4d4f' : '#1677ff'} stroke="#fff" strokeWidth={1} />
      <text x={tgtX + (sourceIsLeft ? -14 : 14)} y={tgtAbsY + 3.5}
        textAnchor="middle" fontSize={8} fontWeight={600} fill="#fff"
        style={{ fontFamily: 'monospace' }}>{rightCard}</text>
      {/* 关系类型标签 */}
      {relType && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10, color: edgeColor, pointerEvents: 'all',
            background: '#fff', padding: '1px 6px', borderRadius: 3,
            border: `1px solid ${edgeColor}`, fontFamily: 'monospace', fontWeight: 600,
          }}>{relType}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default CustomEdge;