import type { MatchState } from '../engine/types';
import { getPlayer } from '../utils/rosters';

export function BoxScore(props: { match: MatchState }) {
  const { match } = props;
  const rows = (side: '主' | '客') =>
    (match.站位[side] ?? []).map(s => {
      const st = match.球员状态[s.球员];
      const p = getPlayer(s.球员);
      return (
        <tr key={s.球员}>
          <td className="bs-name">
            {p?.cn.split('·').pop() ?? s.球员}
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

  return (
    <div className="box-score">
      {(['主', '客'] as const).map(side => (
        <table key={side}>
          <thead>
            <tr>
              <th>{side === '主' ? match.对阵.主队 : match.对阵.客队}</th>
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
