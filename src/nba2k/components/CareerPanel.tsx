import type { CareerState, OffCourtState } from '../utils/statReader';
import { getTeam } from '../utils/rosters';

/** 场外生涯面板：日程、代言、合同、关系、快捷行动 */
export function CareerPanel(props: {
  career: CareerState | null;
  offCourt: OffCourtState | null;
  disabled: boolean;
  onAction: (text: string) => void;
  onStartMatch: () => void;
}) {
  const { career, offCourt } = props;
  const team = career ? getTeam(career.球队) : undefined;

  const quickActions = [
    { label: '🏋️ 训练', text: '我去训练馆加练，教练安排今天的训练项目。' },
    { label: '📱 会见经纪人', text: '我约经纪人见面，聊聊最近的代言机会和职业规划。' },
    { label: '🤝 代言谈判', text: '我想推进当前的代言谈判/寻找新的代言机会。' },
    { label: '💬 队友聚会', text: '我组织队友聚餐，增进更衣室关系。' },
    { label: '🌹 社交活动', text: '我出席今晚的社交活动，看看会遇到谁。' },
    { label: '📰 接受采访', text: '我接受媒体采访，回应最近的话题。' },
  ];

  return (
    <div className="career-panel">
      <div className="cp-header">
        <div className="cp-identity">
          <span className="cp-name">{career?.姓名 ?? '未建档'}</span>
          <span className="cp-team" style={{ color: team?.colors.primary }}>
            {team?.cn ?? career?.球队 ?? ''} · {career?.位置 ?? ''}
          </span>
          <span className="cp-season">
            {career?.赛季 ?? ''} 赛季 第{career?.赛程索引 ?? 0}场
          </span>
        </div>
        <div className="cp-stats">
          <span>💰 {((offCourt?.资金 ?? 0) / 10000).toFixed(1)}万</span>
          <span>⭐ 声望 {offCourt?.声望 ?? 0}</span>
          <span>👥 粉丝 {((offCourt?.粉丝 ?? 0) / 10000).toFixed(1)}万</span>
          <span>📈 成长点 {career?.成长点 ?? 0}</span>
        </div>
      </div>

      <div className="cp-schedule">
        <span>📅 {offCourt?.日程?.日期 ?? '—'}</span>
        <span>下一场：{offCourt?.日程?.下一场 ?? '—'}</span>
        {(offCourt?.日程?.待办 ?? []).map(t => (
          <span key={t} className="cp-todo">
            📌 {t}
          </span>
        ))}
      </div>

      {(offCourt?.代言?.length ?? 0) > 0 && (
        <div className="cp-section">
          <div className="cp-section-title">代言</div>
          {offCourt!.代言.map(d => (
            <div key={d.品牌} className="cp-row">
              {d.品牌} · {(d.年薪 / 10000).toFixed(0)}万/年 · {d.状态}（{d.要求}）
            </div>
          ))}
        </div>
      )}

      {(offCourt?.关系?.length ?? 0) > 0 && (
        <div className="cp-section">
          <div className="cp-section-title">关系</div>
          {offCourt!.关系.map(r => (
            <div key={r.姓名} className="cp-row">
              {r.姓名}（{r.身份}）· {r.阶段} · 好感 {r.好感}
            </div>
          ))}
        </div>
      )}

      <div className="cp-actions">
        {quickActions.map(a => (
          <button key={a.label} disabled={props.disabled} onClick={() => props.onAction(a.text)}>
            {a.label}
          </button>
        ))}
        <button className="cp-start-match" disabled={props.disabled} onClick={props.onStartMatch}>
          🏀 进入下一场比赛
        </button>
      </div>
    </div>
  );
}
