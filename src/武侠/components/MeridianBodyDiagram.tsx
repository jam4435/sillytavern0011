import React, { useId, useMemo } from 'react';
import femaleBackUrl from '../assets/ui/bronze/female-back.png?url';
import femaleFrontUrl from '../assets/ui/bronze/female-front.png?url';
import maleBackUrl from '../assets/ui/bronze/male-back.png?url';
import maleFrontUrl from '../assets/ui/bronze/male-front.png?url';
import type { MeridianNodeView, MeridianSummary } from '../types';

export type MeridianBodyView = 'front' | 'back';

interface MeridianBodyDiagramProps {
  view: MeridianBodyView;
  gender?: '男' | '女' | string;
  nodes: MeridianNodeView[];
  meridians: MeridianSummary[];
  selectedNodeId?: string;
  selectedMeridianId?: string;
  disabled?: boolean;
  active?: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectMeridian: (meridianId: MeridianSummary['id']) => void;
}

const viewLabels: Record<MeridianBodyView, string> = {
  front: '正面铜人',
  back: '背面铜人',
};

// 八脉各脉专属平滑循行主干轨迹（Bézier Spline，严格对齐真实针灸铜人经络走向）
const MERIDIAN_FLOW_TRACKS: Record<string, { path: string; labelPoint: [number, number]; seal: string }> = {
  ren: {
    // 任脉：起于中极会阴，直上神阙、巨阙、膻中，直达承浆天突
    path: 'M120 400 V70',
    labelPoint: [120, 58],
    seal: '任',
  },
  du: {
    // 督脉：起于长强，贯脊入脑，直达百会神庭
    path: 'M120 405 V38',
    labelPoint: [120, 24],
    seal: '督',
  },
  chong: {
    // 冲脉：起于气街，挟任脉直上，汹涌奔腾如江河
    path: 'M96 440 C97 400, 101 340, 101 322 C101 280, 101 200, 101 176 C101 140, 101 120, 101 95',
    labelPoint: [101, 78],
    seal: '冲',
  },
  dai: {
    // 带脉：横行围腰一周，状如束带，总束诸脉
    path: 'M56 244 C76 232, 100 228, 120 228 C140 228, 164 232, 184 244',
    labelPoint: [52, 248],
    seal: '带',
  },
  yinqiao: {
    // 阴跷脉：起于照海，循内踝上行，直达咽喉目内眦
    path: 'M78 450 C78 410, 81 375, 83 356 C85 320, 86 295, 87 278 C89 240, 90 220, 91 198 C93 160, 95 135, 96 116',
    labelPoint: [96, 94],
    seal: '阴跷',
  },
  yinwei: {
    // 阴维脉：起于小腿内侧，维络诸阴，汇于胸膈
    path: 'M162 450 C162 410, 159 375, 157 350 C155 320, 154 295, 153 270 C151 240, 150 220, 149 190 C147 160, 145 135, 144 110',
    labelPoint: [144, 94],
    seal: '阴维',
  },
  yangqiao: {
    // 阳跷脉：起于申脉，循外踝直上肩颈
    path: 'M70 450 C71 410, 74 375, 76 356 C78 320, 79 295, 80 278 C82 240, 83 220, 84 198 C86 160, 89 135, 91 112',
    labelPoint: [91, 88],
    seal: '阳跷',
  },
  yangwei: {
    // 阳维脉：起于足外侧，维络诸阳，上抵头项
    path: 'M170 450 C169 410, 166 375, 164 350 C162 320, 161 295, 160 270 C158 240, 157 220, 156 190 C154 160, 151 135, 149 108',
    labelPoint: [149, 88],
    seal: '阳维',
  },
};

const handleKeyboardActivate = (event: React.KeyboardEvent<SVGGElement>, action: () => void) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  action();
};

/**
 * 经典 AI 高精针灸铜人与奇经八脉流注图。
 * 支持男/女角色专属原画铜人切换，坐标使用 240 × 500 画布，八脉流注走向分明。
 * 透明热区半径为 22，确保鼠标、触摸与键盘交互及自动化测试定位完全一致。
 */
export const MeridianBodyDiagram: React.FC<MeridianBodyDiagramProps> = ({
  view,
  gender = '男',
  nodes,
  meridians,
  selectedNodeId,
  selectedMeridianId,
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

  // 根据当前视角和角色性别选择对应的高精铜人立绘
  const figureUrl = useMemo(() => {
    const isFemale = gender === '女';
    if (view === 'front') {
      return isFemale ? femaleFrontUrl : maleFrontUrl;
    }
    return isFemale ? femaleBackUrl : maleBackUrl;
  }, [gender, view]);

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
          <linearGradient id={`${idPrefix}-axis-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(217, 173, 91, 0)" />
            <stop offset="15%" stopColor="rgba(217, 173, 91, 0.45)" />
            <stop offset="50%" stopColor="rgba(255, 228, 160, 0.75)" />
            <stop offset="85%" stopColor="rgba(217, 173, 91, 0.45)" />
            <stop offset="100%" stopColor="rgba(217, 173, 91, 0)" />
          </linearGradient>

          {/* 周天灵气光晕 */}
          <radialGradient id={`${idPrefix}-halo`} cx="50%" cy="48%" r="48%">
            <stop offset="0%" stopColor="#cda462" stopOpacity="0.25" />
            <stop offset="38%" stopColor="#8d6032" stopOpacity="0.1" />
            <stop offset="75%" stopColor="#3d2a1a" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* 丹田/命门真气微光 */}
          <radialGradient id={`${idPrefix}-dantian-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe4a0" stopOpacity="0.75" />
            <stop offset="35%" stopColor="#ee6a4f" stopOpacity="0.38" />
            <stop offset="70%" stopColor="#b43a2d" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* 辉光滤镜 */}
          <filter id={`${idPrefix}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. 背景周天灵气与环形刻度 */}
        <ellipse className="meridian-body-halo" cx="120" cy="245" rx="114" ry="240" fill={`url(#${idPrefix}-halo)`} />
        <ellipse cx="120" cy="245" rx="108" ry="232" fill="none" stroke="rgba(217, 173, 91, 0.14)" strokeWidth="0.8" strokeDasharray="3 7" />
        <ellipse cx="120" cy="245" rx="98" ry="215" fill="none" stroke="rgba(217, 173, 91, 0.08)" strokeWidth="0.6" />

        {/* 周天任督天元中轴线 */}
        <path className="meridian-body-axis" d="M120 12V486" stroke={`url(#${idPrefix}-axis-grad)`} />

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

        {/* 2. 高精 AI 水墨针灸铜人立绘底层 */}
        <g className={`meridian-bronze-figure is-${view} is-gender-${gender}`} aria-hidden="true">
          <image
            className="meridian-figure-photo"
            href={figureUrl}
            x="25"
            y="15"
            width="190"
            height="470"
            preserveAspectRatio="xMidYMid meet"
          />

          {/* 丹田/命门真气微光 */}
          {view === 'front' ? (
            <circle cx="120" cy="228" r="11" fill={`url(#${idPrefix}-dantian-glow)`} />
          ) : (
            <circle cx="120" cy="226" r="10" fill={`url(#${idPrefix}-dantian-glow)`} />
          )}
        </g>

        {/* 3. 奇经八脉流注大通道层（八脉精细内蕴，与铜人相映） */}
        <g className="meridian-path-layer">
          {meridians.map(meridian => {
            const meridianNodes = nodesByMeridian.get(meridian.id) ?? [];
            if (meridianNodes.length < 2) {
              return null;
            }
            const trackDef = MERIDIAN_FLOW_TRACKS[meridian.id];
            const isMeridianSelected = selectedMeridianId === meridian.id;
            const points = meridianNodes.map(node => `${node.x},${node.y}`).join(' ');
            const nextNode = meridianNodes.find(node => node.status === 'available');
            const targetNode = nextNode ?? meridianNodes[meridianNodes.length - 1];

            return (
              <g
                key={meridian.id}
                className={`meridian-path-action ${isMeridianSelected ? 'is-meridian-selected' : ''}`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`选择${meridian.name}，已通${meridian.completedNodes}穴，共${meridian.totalNodes}穴`}
                aria-disabled={disabled}
                onClick={() => !disabled && onSelectMeridian(meridian.id)}
                onKeyDown={event => !disabled && handleKeyboardActivate(event, () => onSelectMeridian(meridian.id))}
                data-wuxia-automation={`meridian-path-${meridian.id}`}
              >
                {/* 3.1 八脉专属平滑底衬脉道（精细金丝光缕） */}
                {trackDef && (
                  <path
                    className={`meridian-channel-track ${isMeridianSelected ? 'is-selected-track' : ''}`}
                    d={trackDef.path}
                  />
                )}

                {/* 3.2 穴位间点击交互与连接线 */}
                <polyline className="meridian-path-hit" points={points} />
                <polyline className="meridian-path-base" points={points} />
                {meridianNodes.slice(1).map((node, index) => {
                  const previous = meridianNodes[index];
                  return (
                    <line
                      key={`${previous.id}-${node.id}`}
                      className={`meridian-path-segment is-${node.status} ${isMeridianSelected ? 'is-selected-segment' : ''}`}
                      x1={previous.x}
                      y1={previous.y}
                      x2={node.x}
                      y2={node.y}
                    />
                  );
                })}

                {/* 3.3 经脉气头光斑 */}
                <circle
                  className="meridian-path-current"
                  cx={targetNode.x}
                  cy={targetNode.y}
                  r="2.2"
                  filter={`url(#${idPrefix}-glow)`}
                />

                {/* 3.4 经脉篆印标识 */}
                {trackDef && (
                  <g className={`meridian-channel-badge ${isMeridianSelected ? 'is-badge-active' : ''}`} aria-hidden="true">
                    <rect
                      x={trackDef.labelPoint[0] - 9}
                      y={trackDef.labelPoint[1] - 6.5}
                      width="18"
                      height="13"
                      rx="2"
                    />
                    <text x={trackDef.labelPoint[0]} y={trackDef.labelPoint[1] + 3}>
                      {trackDef.seal}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* 4. 穴位关窍节点层 */}
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
                {/* 22px 交互热区（保持稳定易选） */}
                <circle className="meridian-node-hit" cx={node.x} cy={node.y} r="22" />
                {node.status === 'available' && (
                  <circle className="meridian-node-breath" cx={node.x} cy={node.y} r="8" />
                )}
                {selected && (
                  <rect className="meridian-node-seal" x={node.x - 8} y={node.y - 8} width="16" height="16" rx="2" />
                )}
                <circle className="meridian-node-mark" cx={node.x} cy={node.y} r={node.status === 'opened' ? 4.2 : 3.4} />
                <circle className="meridian-node-core" cx={node.x} cy={node.y} r="1.2" />
                {selected && (
                  <g className="meridian-node-callout" aria-hidden="true">
                    <path d={`M${node.x + 9} ${node.y - 1}h14`} />
                    <text x={node.x + 26} y={node.y + 2}>
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

