import type { MatchState, Side } from '../engine/types';
import { getPlayer, getTeam } from '../utils/rosters';

type ManagedMatch = MatchState & {
  本节球队犯规?: Record<Side, number>;
  暂停?: Record<Side, number>;
  阵容?: Record<Side, { 场上: string[]; 替补: string[] }>;
  回合阶段?: '常规回合' | '篮板争抢' | '死球';
};

function clockText(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const shortName = (key: string): string => getPlayer(key)?.cn.split('·').pop() ?? key;

export function ScoreBoard(props: { match: MatchState }) {
  const match = props.match as ManagedMatch;
  const home = getTeam(match.对阵.主队);
  const away = getTeam(match.对阵.客队);
  const quarterLabel = match.节次 <= 4 ? `第${match.节次}节` : `加时${match.节次 - 4}`;
  const phase = match.回合阶段 ?? '常规回合';

  const teamBlock = (side: Side) => {
    const isHome = side === '主';
    const teamId = isHome ? match.对阵.主队 : match.对阵.客队;
    const team = isHome ? home : away;
    const score = isHome ? match.比分.主 : match.比分.客;
    const lineup = match.阵容?.[side]?.场上 ?? match.站位[side].map(spot => spot.球员);
    return (
      <div className={`sb-team ${isHome ? 'home' : 'away'} ${match.球权 === side ? 'has-ball' : ''}`}>
        <div className="sb-team-main">
          <span className="sb-badge" style={{ background: team?.colors.primary }}>{teamId}</span>
          <span className="sb-name">{team?.cn ?? teamId}</span>
          <span className="sb-score">{score}</span>
        </div>
        <div className="sb-team-meta">
          <span>本节犯规 <b>{match.本节球队犯规?.[side] ?? 0}</b></span>
          <span>暂停 <b>{match.暂停?.[side] ?? 0}</b></span>
        </div>
        <div className="sb-lineup" aria-label={`${team?.cn ?? teamId}场上阵容`}>
          {lineup.map(key => <span key={key}>{shortName(key)}</span>)}
        </div>
      </div>
    );
  };

  return (
    <section className="scoreboard" aria-label="比赛计分牌">
      {teamBlock('主')}
      <div className="sb-clock">
        <div className="sb-quarter">{quarterLabel}</div>
        <div className="sb-time">{clockText(match.剩余秒数)}</div>
        <div className="sb-possession">{phase} · {match.球权}队球权</div>
      </div>
      {teamBlock('客')}
    </section>
  );
}
