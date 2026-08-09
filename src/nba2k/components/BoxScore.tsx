import type { MatchState, Side } from '../engine/types';
import { getPlayer } from '../utils/rosters';

export function BoxScore(props: { match: MatchState }) {
  const match = props.match as MatchState & {
    阵容?: Record<Side, { 场上: string[]; 替补: string[] }>;
    本节球队犯规?: Record<Side, number>;
    暂停?: Record<Side, number>;
  };
  const rows = (side: Side) => {
    const onCourt = match.阵容?.[side]?.场上 ?? match.站位[side].map(spot => spot.球员);
    const bench = match.阵容?.[side]?.替补 ?? [];
    return [...onCourt, ...bench].map(key => {
      const st = match.球员状态[key];
      const p = getPlayer(key);
      return (
        <tr key={key} className={onCourt.includes(key) ? 'is-on-court' : 'is-bench'}>
          <td className="bs-name">
            <i>{onCourt.includes(key) ? '场上' : '替补'}</i>
            {p?.cn.split('·').pop() ?? key}
            {st?.手感 === '热' ? ' 🔥' : st?.手感 === '冷' ? ' 🧊' : ''}
          </td>
          <td>{st?.得分 ?? 0}</td>
          <td>{st?.篮板 ?? 0}</td>
          <td>{st?.助攻 ?? 0}</td>
          <td>{st?.犯规 ?? 0}</td>
          <td>{st?.体力 ?? 100}</td>
        </tr>
      );
    });
  };

  return (
    <div className="box-score">
      {(['主', '客'] as const).map(side => (
        <table key={side}>
          <thead>
            <tr>
              <th>
                {side === '主' ? match.对阵.主队 : match.对阵.客队}
                <small>犯规 {match.本节球队犯规?.[side] ?? 0} · 暂停 {match.暂停?.[side] ?? 0}</small>
              </th>
              <th>分</th>
              <th>板</th>
              <th>助</th>
              <th>犯</th>
              <th>体</th>
            </tr>
          </thead>
          <tbody>{rows(side)}</tbody>
        </table>
      ))}
    </div>
  );
}
