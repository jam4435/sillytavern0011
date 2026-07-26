import type { CourtSpot, OnCourtStatus } from '../engine/types';
import { getPlayer, getTeam, initialsOf } from '../utils/rosters';

/**
 * 球场俯视图：横向全场 SVG（视箱 1000×540，约合 94ft×50ft）。
 * 站位坐标 x/y ∈ 0-100 直接线性映射到球场内框。
 */

const COURT_W = 1000;
const COURT_H = 540;
const PAD = 20; // 场地外留白
const IN_W = COURT_W - PAD * 2;
const IN_H = COURT_H - PAD * 2;

const toPx = (spot: { x: number; y: number }) => ({
  cx: PAD + (spot.x / 100) * IN_W,
  // y=0 是下边线，SVG y 轴向下，需要翻转
  cy: PAD + ((100 - spot.y) / 100) * IN_H,
});

function CourtLines() {
  const midX = COURT_W / 2;
  const rimLY = COURT_H / 2;
  // 禁区宽 16ft ≈ 170px，长 19ft ≈ 202px；三分弧半径 23.75ft ≈ 253px
  return (
    <g className="court-lines">
      <rect x={PAD} y={PAD} width={IN_W} height={IN_H} className="court-floor" rx={8} />
      {/* 中线与中圈 */}
      <line x1={midX} y1={PAD} x2={midX} y2={COURT_H - PAD} />
      <circle cx={midX} cy={rimLY} r={60} fill="none" />
      {/* 左右禁区 */}
      {[false, true].map(right => {
        const sign = right ? -1 : 1;
        const baseX = right ? COURT_W - PAD : PAD;
        const paintX = right ? baseX - 202 : baseX;
        const rimX = baseX + sign * 55;
        return (
          <g key={right ? 'R' : 'L'}>
            <rect x={paintX} y={rimLY - 85} width={202} height={170} fill="none" />
            <circle cx={baseX + sign * 202} cy={rimLY} r={60} fill="none" />
            {/* 篮筐与篮板 */}
            <line x1={baseX + sign * 40} y1={rimLY - 30} x2={baseX + sign * 40} y2={rimLY + 30} className="backboard" />
            <circle cx={rimX} cy={rimLY} r={9} className="rim" fill="none" />
            {/* 三分弧（简化：一段圆弧 + 底角直线） */}
            <path
              d={`M ${baseX + sign * 30} ${PAD + 28}
                  L ${baseX + sign * 140} ${PAD + 28}
                  A 253 253 0 0 ${right ? 0 : 1} ${baseX + sign * 140} ${COURT_H - PAD - 28}
                  L ${baseX + sign * 30} ${COURT_H - PAD - 28}`}
              fill="none"
            />
          </g>
        );
      })}
    </g>
  );
}

function PlayerToken(props: {
  spot: CourtSpot;
  side: '主' | '客';
  teamId: string;
  status?: OnCourtStatus;
  isProtagonist: boolean;
  onClick?: () => void;
}) {
  const { spot, teamId, status } = props;
  const player = getPlayer(spot.球员);
  const team = getTeam(teamId);
  const { cx, cy } = toPx(spot);
  const R = 24;
  const stamina = status?.体力 ?? 100;
  // 体力环：圆周按体力比例描边
  const circumference = 2 * Math.PI * (R + 4);

  return (
    <g
      className={`player-token ${props.side === '主' ? 'home' : 'away'} ${props.onClick ? 'clickable' : ''}`}
      transform={`translate(${cx}, ${cy})`}
      onClick={props.onClick}
    >
      {spot.持球 && <circle r={R + 9} className="ball-halo" />}
      <circle
        r={R + 4}
        className="stamina-ring"
        fill="none"
        strokeDasharray={`${(stamina / 100) * circumference} ${circumference}`}
        transform="rotate(-90)"
      />
      <circle r={R} fill={team?.colors.primary ?? '#666'} stroke={team?.colors.secondary ?? '#fff'} strokeWidth={2.5} />
      <text className="token-initials" dy="1">
        {player ? initialsOf(player) : spot.球员.slice(0, 2)}
      </text>
      <text className="token-number" y={-R - 10}>
        {player ? `#${player.number}` : ''}
      </text>
      <text className="token-name" y={R + 16}>
        {player?.cn.split('·').pop() ?? spot.球员}
        {props.isProtagonist ? '★' : ''}
      </text>
      {spot.持球 && (
        <circle cx={R - 3} cy={R - 3} r={7} className="ball-dot" />
      )}
    </g>
  );
}

export function CourtView(props: {
  站位: { 主: CourtSpot[]; 客: CourtSpot[] };
  主队: string;
  客队: string;
  球员状态: Record<string, OnCourtStatus>;
  主角: string;
  /** 点击场上球员（选传球目标/挡拆搭档时用） */
  onPlayerClick?: (key: string, side: '主' | '客') => void;
}) {
  return (
    <svg className="court-view" viewBox={`0 0 ${COURT_W} ${COURT_H}`} preserveAspectRatio="xMidYMid meet">
      <CourtLines />
      {(['主', '客'] as const).map(side =>
        props.站位[side]?.map(spot => (
          <PlayerToken
            key={`${side}-${spot.球员}`}
            spot={spot}
            side={side}
            teamId={side === '主' ? props.主队 : props.客队}
            status={props.球员状态[spot.球员]}
            isProtagonist={spot.球员 === props.主角}
            onClick={props.onPlayerClick ? () => props.onPlayerClick!(spot.球员, side) : undefined}
          />
        )),
      )}
    </svg>
  );
}
