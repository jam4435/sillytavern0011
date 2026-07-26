import { useMemo, useState } from 'react';
import type { ActionType, MatchState, Side } from '../engine/types';
import { getPlayer } from '../utils/rosters';

const OFFENSE_ACTIONS: ActionType[] = ['突破', '中投', '三分', '内线终结', '传球', '组织', '挡拆', '无球跑动'];
const DEFENSE_ACTIONS: ActionType[] = ['抢断', '盖帽', '贴身防守', '协防'];
/** 需要选择队友作为第二参与者的动作 */
const NEED_PARTNER: ActionType[] = ['传球', '挡拆'];

export interface ActionChoice {
  action: ActionType;
  actorKey: string;
  partnerKey: string | null;
}

export function ActionPanel(props: {
  match: MatchState;
  /** 玩家球队在本场的主客位 */
  mySide: Side;
  protagonist: string;
  disabled: boolean;
  onChoose: (choice: ActionChoice) => void;
}) {
  const { match, mySide } = props;
  const weHaveBall = match.球权 === mySide;
  const mySpots = match.站位[mySide] ?? [];
  const ballHolder = mySpots.find(s => s.持球)?.球员 ?? props.protagonist;

  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [defenseActor, setDefenseActor] = useState<string>(props.protagonist);

  const teammates = useMemo(
    () => mySpots.map(s => s.球员).filter(k => k !== ballHolder),
    [mySpots, ballHolder],
  );

  const choose = (action: ActionType, actorKey: string, partnerKey: string | null = null) => {
    setPendingAction(null);
    props.onChoose({ action, actorKey, partnerKey });
  };

  if (!weHaveBall) {
    return (
      <div className="action-panel">
        <div className="ap-title">防守回合 · 选择行动人与策略</div>
        <div className="ap-actor-row">
          {mySpots.map(s => {
            const p = getPlayer(s.球员);
            return (
              <button
                key={s.球员}
                className={`ap-actor ${defenseActor === s.球员 ? 'active' : ''}`}
                onClick={() => setDefenseActor(s.球员)}
              >
                {p?.cn.split('·').pop() ?? s.球员}
              </button>
            );
          })}
        </div>
        <div className="ap-actions">
          {DEFENSE_ACTIONS.map(a => (
            <button key={a} disabled={props.disabled} className="ap-action defense" onClick={() => choose(a, defenseActor)}>
              {a}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const holderPlayer = getPlayer(ballHolder);

  return (
    <div className="action-panel">
      <div className="ap-title">
        进攻回合 · 持球：{holderPlayer?.cn ?? ballHolder}
        {ballHolder === props.protagonist ? '（你）' : ''}
      </div>
      {pendingAction ? (
        <div className="ap-partner-select">
          <span>{pendingAction === '传球' ? '传给谁：' : '谁来掩护：'}</span>
          {teammates.map(k => {
            const p = getPlayer(k);
            return (
              <button key={k} className="ap-actor" disabled={props.disabled} onClick={() => choose(pendingAction, ballHolder, k)}>
                {p?.cn.split('·').pop() ?? k}
              </button>
            );
          })}
          <button className="ap-cancel" onClick={() => setPendingAction(null)}>
            取消
          </button>
        </div>
      ) : (
        <div className="ap-actions">
          {OFFENSE_ACTIONS.map(a => (
            <button
              key={a}
              disabled={props.disabled}
              className="ap-action offense"
              onClick={() => (NEED_PARTNER.includes(a) ? setPendingAction(a) : choose(a, ballHolder))}
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
