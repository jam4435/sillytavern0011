import type { MatchState } from '../engine/types';
import { getTeam } from '../utils/rosters';

function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ScoreBoard(props: { match: MatchState }) {
  const { match } = props;
  const home = getTeam(match.对阵.主队);
  const away = getTeam(match.对阵.客队);
  const quarterLabel = match.节次 <= 4 ? `第${match.节次}节` : `加时${match.节次 - 4}`;

  return (
    <div className="scoreboard">
      <div className={`sb-team ${match.球权 === '主' ? 'has-ball' : ''}`}>
        <span className="sb-badge" style={{ background: home?.colors.primary }}>
          {match.对阵.主队}
        </span>
        <span className="sb-name">{home?.cn ?? match.对阵.主队}</span>
        <span className="sb-score">{match.比分.主}</span>
      </div>
      <div className="sb-clock">
        <div className="sb-quarter">{quarterLabel}</div>
        <div className="sb-time">{clockText(match.剩余秒数)}</div>
        <div className="sb-possession">球权：{match.球权}队</div>
      </div>
      <div className={`sb-team away ${match.球权 === '客' ? 'has-ball' : ''}`}>
        <span className="sb-score">{match.比分.客}</span>
        <span className="sb-name">{away?.cn ?? match.对阵.客队}</span>
        <span className="sb-badge" style={{ background: away?.colors.primary }}>
          {match.对阵.客队}
        </span>
      </div>
    </div>
  );
}
