import React, { useId, useMemo } from 'react';
import type { MeridianNodeView, MeridianSummary } from '../types';

export type MeridianBodyView = 'front' | 'back';

interface MeridianBodyDiagramProps {
  view: MeridianBodyView;
  nodes: MeridianNodeView[];
  meridians: MeridianSummary[];
  selectedNodeId?: string;
  disabled?: boolean;
  active?: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectMeridian: (meridianId: MeridianSummary['id']) => void;
}

const viewLabels: Record<MeridianBodyView, string> = {
  front: '正面铜人',
  back: '背面铜人',
};

const handleKeyboardActivate = (event: React.KeyboardEvent<SVGGElement>, action: () => void) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  action();
};

/**
 * 经典工笔白描水墨针灸铜人。
 * 坐标使用 240 × 500 的标准画布，节点位置由经脉配置投影提供。
 * 保留透明热区半径为 22，确保鼠标、触摸与键盘交互及测试定位完全一致。
 */
export const MeridianBodyDiagram: React.FC<MeridianBodyDiagramProps> = ({
  view,
  nodes,
  meridians,
  selectedNodeId,
  disabled = false,
  active = true,
  onSelectNode,
  onSelectMeridian,
}) => {
  const rawId = useId();
  const idPrefix = `meridian-${view}-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const nodesByMeridian = useMemo(() => {
    const grouped = new Map<MeridianSummary['id'], MeridianNodeView[]>();
    meridians.forEach(meridian => grouped.set(meridian.id, []));
    nodes.forEach(node => grouped.get(node.meridianId)?.push(node));
    grouped.forEach(group => group.sort((left, right) => left.stageIndex - right.stageIndex));
    return grouped;
  }, [meridians, nodes]);

  // 人体工笔白描平滑轮廓（严格对应 240×500 坐标系，左右对称中轴 x=120）
  // 经脉点位（任脉/督脉 x=120, 冲脉 x=101, 阴跷 x=79-96, 阴维 x=144-161, 带脉 y=228-242）与该解剖轮廓完美契合
  const bodySilhouettePath =
    // 头顶道家发髻
    'M114 18 C114 12, 126 12, 126 18 C126 23, 123 26, 123 28 ' +
    // 头部左侧颅骨与耳廓
    'C131 29, 137 36, 137 46 C139 50, 140 55, 138 58 C136 60, 134 60, 133 60 C130 68, 125 72, 120 72 ' +
    // 下颌到右耳廓与头颅（绘制半边转对称）
    'C115 72, 110 68, 107 60 C106 60, 104 60, 102 58 C100 55, 101 50, 103 46 C103 36, 109 29, 117 28 C117 26, 114 23, 114 18 Z ' +
    // 躯干与四肢整体剪影
    'M112 73 C116 73, 124 73, 128 73 ' +
    'C131 82, 142 88, 158 94 C167 98, 175 104, 175 112 ' +
    'C174 124, 166 148, 160 178 C156 198, 152 228, 148 258 C146 272, 144 285, 141 292 C139 294, 136 293, 135 290 C137 282, 139 265, 141 248 C144 220, 148 190, 151 165 C153 148, 153 138, 152 132 ' +
    'C150 148, 148 175, 147 200 C146 225, 145 245, 147 265 C149 282, 153 300, 156 318 ' +
    'C160 342, 163 368, 162 388 C160 412, 153 438, 149 460 C147 470, 146 478, 149 482 C149 485, 142 485, 134 485 C130 485, 129 480, 130 472 C133 452, 138 428, 137 405 C136 385, 131 362, 127 340 C125 328, 123 318, 120 312 ' +
    'C117 318, 115 328, 113 340 C109 362, 104 385, 103 405 C102 428, 107 452, 110 472 C111 480, 110 485, 106 485 C98 485, 91 485, 91 482 C94 478, 93 470, 91 460 C87 438, 80 412, 78 388 C77 368, 80 342, 84 318 ' +
    'C87 300, 91 282, 93 265 C95 245, 94 225, 93 200 C92 175, 90 148, 88 132 ' +
    'C87 138, 87 148, 89 165 C92 190, 96 220, 99 248 C101 265, 103 282, 105 290 C104 293, 101 294, 99 292 C96 285, 94 272, 92 258 C88 228, 84 198, 80 178 C74 148, 66 124, 65 112 ' +
    'C65 104, 73 98, 82 94 C98 88, 109 82, 112 73 Z';

  return (
    <figure
      className={`meridian-body-card ${active ? 'is-mobile-active' : 'is-mobile-hidden'}`}
      data-wuxia-automation={`meridian-view-${view}`}
    >
      <div className="meridian-body-heading" aria-hidden="true">
        <span>{view === 'front' ? '阳面' : '阴面'}</span>
        <b>{viewLabels[view]}</b>
      </div>
      <svg
        className="meridian-body-svg"
        viewBox="0 0 240 500"
        role="img"
        aria-label={`${viewLabels[view]}奇经八脉示意图`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{viewLabels[view]}奇经八脉示意图，武侠化艺术表达，非医学图示</title>
        <defs>
          {/* 水墨宣纸与金石青铜古韵渐变 */}
          <linearGradient id={`${idPrefix}-bronze`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#241b14" stopOpacity="0.95" />
            <stop offset="30%" stopColor="#453120" stopOpacity="0.92" />
            <stop offset="65%" stopColor="#63472c" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#1e1610" stopOpacity="0.98" />
          </linearGradient>

          <linearGradient id={`${idPrefix}-inner-ink`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5a422d" stopOpacity="0.4" />
            <stop offset="45%" stopColor="#2e2117" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#18110b" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id={`${idPrefix}-axis-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(217, 173, 91, 0)" />
            <stop offset="15%" stopColor="rgba(217, 173, 91, 0.4)" />
            <stop offset="50%" stopColor="rgba(217, 173, 91, 0.6)" />
            <stop offset="85%" stopColor="rgba(217, 173, 91, 0.4)" />
            <stop offset="100%" stopColor="rgba(217, 173, 91, 0)" />
          </linearGradient>

          {/* 周天内景灵气晕染 */}
          <radialGradient id={`${idPrefix}-halo`} cx="50%" cy="48%" r="48%">
            <stop offset="0%" stopColor="#cda462" stopOpacity="0.22" />
            <stop offset="40%" stopColor="#8d6032" stopOpacity="0.08" />
            <stop offset="75%" stopColor="#3d2a1a" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* 丹田/命门真气微光 */}
          <radialGradient id={`${idPrefix}-dantian-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe4a0" stopOpacity="0.5" />
            <stop offset="35%" stopColor="#ee6a4f" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#b43a2d" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* 祥云基座渐变 */}
          <linearGradient id={`${idPrefix}-pedestal`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(217, 173, 91, 0)" />
            <stop offset="30%" stopColor="rgba(217, 173, 91, 0.35)" />
            <stop offset="50%" stopColor="rgba(255, 228, 160, 0.65)" />
            <stop offset="70%" stopColor="rgba(217, 173, 91, 0.35)" />
            <stop offset="100%" stopColor="rgba(217, 173, 91, 0)" />
          </linearGradient>

          {/* 辉光滤镜 */}
          <filter id={`${idPrefix}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 古籍宣纸微粒拓片纹理 */}
          <pattern id={`${idPrefix}-rubbing`} width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 18L18 0M3 21L21 3M-3 3L3 -3" stroke="rgba(223, 190, 128, 0.08)" strokeWidth="0.8" />
            <circle cx="9" cy="9" r="0.8" fill="rgba(223, 190, 128, 0.05)" />
          </pattern>
        </defs>

        {/* 1. 背景周天灵气与环形刻度 */}
        <ellipse className="meridian-body-halo" cx="120" cy="245" rx="114" ry="240" fill={`url(#${idPrefix}-halo)`} />
        <ellipse cx="120" cy="245" rx="108" ry="232" fill="none" stroke="rgba(217, 173, 91, 0.12)" strokeWidth="0.8" strokeDasharray="3 7" />
        <ellipse cx="120" cy="245" rx="98" ry="215" fill="none" stroke="rgba(217, 173, 91, 0.06)" strokeWidth="0.6" />

        {/* 周天任督天元中轴线 */}
        <path className="meridian-body-axis" d="M120 14V486" stroke={`url(#${idPrefix}-axis-grad)`} />

        {/* 周天经纬度刻度尺 */}
        <g className="meridian-body-ruler" aria-hidden="true">
          {Array.from({ length: 15 }, (_, index) => {
            const y = 24 + index * 32;
            const isMajor = index % 2 === 0;
            return (
              <g key={y}>
                <line x1="14" y1={y} x2={isMajor ? 24 : 19} y2={y} />
                <line x1="226" y1={y} x2={isMajor ? 216 : 221} y2={y} />
              </g>
            );
          })}
        </g>

        {/* 2. 工笔白描水墨针灸铜人人身 */}
        <g className={`meridian-bronze-figure is-${view}`} aria-hidden="true">
          {/* 人体主剪影填充 */}
          <path
            className="meridian-body-silhouette"
            d={bodySilhouettePath}
            fill={`url(#${idPrefix}-bronze)`}
          />
          {/* 宣纸古法拓片微粒 */}
          <path
            className="meridian-body-rubbing"
            d={bodySilhouettePath}
            fill={`url(#${idPrefix}-rubbing)`}
          />
          {/* 白描金石轮廓外勾线 */}
          <path
            className="meridian-body-outline"
            d={bodySilhouettePath}
            fill="none"
            stroke="rgba(217, 173, 91, 0.45)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 3. 人体工笔白描经脉内景纹理 */}
          {view === 'front' ? (
            <g className="meridian-figure-interior meridian-front-interior">
              {/* 发簪与面容意象 */}
              <path d="M110 24H130M112 48C116 52 124 52 128 48M120 44V50" stroke="rgba(217, 173, 91, 0.35)" strokeWidth="0.8" fill="none" />
              {/* 锁骨 (双侧弧线) */}
              <path d="M120 86C112 85 96 90 78 96M120 86C128 85 144 90 162 96" className="meridian-bronze-detail" />
              {/* 胸大肌轮廓与膻中胸骨 */}
              <path d="M84 126C95 140 112 140 120 134C128 140 145 140 156 126" className="meridian-bronze-detail" />
              <path d="M120 86V155" stroke="rgba(217, 173, 91, 0.25)" strokeWidth="0.9" strokeDasharray="1 3" />
              {/* 肋弓轮廓 */}
              <path d="M88 186C98 172 112 168 120 168C128 168 142 172 152 186" className="meridian-bronze-detail" />
              {/* 丹田气海与神阙肚脐 */}
              <circle cx="120" cy="228" r="14" fill={`url(#${idPrefix}-dantian-glow)`} />
              <circle cx="120" cy="228" r="2.5" fill="rgba(217, 173, 91, 0.7)" />
              <circle cx="120" cy="228" r="6" fill="none" stroke="rgba(217, 173, 91, 0.3)" strokeWidth="0.8" strokeDasharray="2 2" />
              {/* 腹股沟弧线 */}
              <path d="M92 284C102 298 114 308 120 308C126 308 138 298 148 284" className="meridian-bronze-detail" />
              {/* 膝盖髌骨 */}
              <ellipse cx="88" cy="385" rx="5.5" ry="7.5" className="meridian-bronze-detail" fill="none" />
              <ellipse cx="152" cy="385" rx="5.5" ry="7.5" className="meridian-bronze-detail" fill="none" />
              {/* 胫骨前缘白描线 */}
              <path d="M88 402C86 424 85 448 87 465M152 402C154 424 155 448 153 465" stroke="rgba(217, 173, 91, 0.2)" strokeWidth="0.8" fill="none" />
              {/* 手臂内侧经络走向线 */}
              <path d="M72 128C74 158 78 195 82 230M168 128C166 158 162 195 158 230" stroke="rgba(217, 173, 91, 0.15)" strokeWidth="0.8" strokeDasharray="2 4" fill="none" />
            </g>
          ) : (
            <g className="meridian-figure-interior meridian-back-interior">
              {/* 发髻发带意象 */}
              <path d="M120 28Q116 46 114 66M120 28Q124 46 126 66" stroke="rgba(217, 173, 91, 0.4)" strokeWidth="0.9" fill="none" />
              {/* 斜方肌颈背过渡 */}
              <path d="M120 74C112 78 96 88 78 96M120 74C128 78 144 88 162 96" className="meridian-bronze-detail" />
              {/* 左右肩胛骨 */}
              <path d="M88 120C104 126 106 148 95 166M152 120C136 126 134 148 145 166" className="meridian-bronze-detail" />
              {/* 督脉脊柱骨节中轴 */}
              <path d="M120 72V295" stroke="rgba(217, 173, 91, 0.4)" strokeWidth="1" strokeDasharray="3 3" />
              {/* 命门与腰窝 */}
              <circle cx="120" cy="226" r="12" fill={`url(#${idPrefix}-dantian-glow)`} />
              <path d="M106 226C110 224 110 230 106 232M134 226C130 224 130 230 134 232" className="meridian-bronze-detail" />
              {/* 臀大肌饱满弧线 */}
              <path d="M82 265C92 290 112 305 120 305C128 305 148 290 158 265" className="meridian-bronze-detail" />
              {/* 腘窝 (委中穴折痕) */}
              <path d="M82 385C88 388 94 388 100 385M140 385C146 388 152 388 158 385" className="meridian-bronze-detail" />
              {/* 跟腱线 */}
              <path d="M86 440V470M154 440V470" stroke="rgba(217, 173, 91, 0.2)" strokeWidth="0.8" fill="none" />
            </g>
          )}

          {/* 祥云水墨基座（立足承台） */}
          <g className="meridian-pedestal" opacity="0.85">
            <path
              d="M56 488 C76 480, 110 478, 120 478 C130 478, 164 480, 184 488 C160 495, 80 495, 56 488 Z"
              fill="rgba(30, 22, 16, 0.8)"
              stroke={`url(#${idPrefix}-pedestal)`}
              strokeWidth="1.2"
            />
            <path
              d="M82 485 C92 481, 108 481, 118 484 M122 484 C132 481, 148 481, 158 485"
              stroke="rgba(217, 173, 91, 0.35)"
              strokeWidth="0.8"
              fill="none"
            />
          </g>
        </g>

        {/* 4. 经脉连线层 */}
        <g className="meridian-path-layer">
          {meridians.map(meridian => {
            const meridianNodes = nodesByMeridian.get(meridian.id) ?? [];
            if (meridianNodes.length < 2) {
              return null;
            }
            const points = meridianNodes.map(node => `${node.x},${node.y}`).join(' ');
            const nextNode = meridianNodes.find(node => node.status === 'available');
            const targetNode = nextNode ?? meridianNodes[meridianNodes.length - 1];
            return (
              <g
                key={meridian.id}
                className="meridian-path-action"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`选择${meridian.name}，已通${meridian.completedNodes}穴，共${meridian.totalNodes}穴`}
                aria-disabled={disabled}
                onClick={() => !disabled && onSelectMeridian(meridian.id)}
                onKeyDown={event => !disabled && handleKeyboardActivate(event, () => onSelectMeridian(meridian.id))}
                data-wuxia-automation={`meridian-path-${meridian.id}`}
              >
                <polyline className="meridian-path-hit" points={points} />
                <polyline className="meridian-path-base" points={points} />
                {meridianNodes.slice(1).map((node, index) => {
                  const previous = meridianNodes[index];
                  return (
                    <line
                      key={`${previous.id}-${node.id}`}
                      className={`meridian-path-segment is-${node.status}`}
                      x1={previous.x}
                      y1={previous.y}
                      x2={node.x}
                      y2={node.y}
                    />
                  );
                })}
                <circle
                  className="meridian-path-current"
                  cx={targetNode.x}
                  cy={targetNode.y}
                  r="3"
                  filter={`url(#${idPrefix}-glow)`}
                />
              </g>
            );
          })}
        </g>

        {/* 5. 穴位节点层 */}
        <g className="meridian-node-layer">
          {nodes.map(node => {
            const selected = selectedNodeId === node.id;
            const nodeDisabled = disabled;
            return (
              <g
                key={node.id}
                className={`meridian-node is-${node.status} ${selected ? 'is-selected' : ''}`}
                role="button"
                tabIndex={nodeDisabled ? -1 : 0}
                aria-label={`${node.meridianName}${node.name}，${node.stageName}，${
                  node.status === 'opened'
                    ? '已打通'
                    : node.status === 'available'
                      ? '可以冲穴'
                      : `尚未解锁${node.prerequisiteLabel ? `，前置${node.prerequisiteLabel}` : ''}`
                }`}
                aria-pressed={selected}
                aria-disabled={nodeDisabled}
                onClick={() => !nodeDisabled && onSelectNode(node.id)}
                onKeyDown={event => !nodeDisabled && handleKeyboardActivate(event, () => onSelectNode(node.id))}
                data-node-id={node.id}
                data-status={node.status}
                data-wuxia-automation={`meridian-node-${node.id}`}
              >
                {/* 22px 交互热区 */}
                <circle className="meridian-node-hit" cx={node.x} cy={node.y} r="22" />
                {node.status === 'available' && (
                  <circle className="meridian-node-breath" cx={node.x} cy={node.y} r="12" />
                )}
                {selected && (
                  <rect className="meridian-node-seal" x={node.x - 12} y={node.y - 12} width="24" height="24" rx="2" />
                )}
                <circle className="meridian-node-mark" cx={node.x} cy={node.y} r={node.status === 'opened' ? 6 : 5} />
                <circle className="meridian-node-core" cx={node.x} cy={node.y} r="2" />
                {selected && (
                  <g className="meridian-node-callout" aria-hidden="true">
                    <path d={`M${node.x + 13} ${node.y - 2}h18`} />
                    <text x={node.x + 35} y={node.y + 2}>
                      {node.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption>
        <span aria-hidden="true">{view === 'front' ? '正' : '背'}</span>
        武侠化经络示意 · 非医学图示
      </figcaption>
    </figure>
  );
};

export default MeridianBodyDiagram;

