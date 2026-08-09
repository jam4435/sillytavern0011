import { useMemo, useState } from 'react';
import type { ActionType, MatchState, Side } from '../engine/types';
import { getPlayer } from '../utils/rosters';

const OFFENSE_ACTIONS: ActionType[] = ['突破', '中投', '三分', '内线终结', '传球', '组织', '挡拆', '无球跑动'];
const DEFENSE_ACTIONS: ActionType[] = ['抢断', '盖帽', '贴身防守', '协防'];
const NEED_PARTNER: ActionType[] = ['传球', '挡拆'];

type RoundPhase = '常规回合' | '篮板争抢' | '死球';
type Rotation = Record<Side, { 场上: string[]; 替补: string[] }>;
type MatchWithManagement = MatchState & {
  回合阶段?: RoundPhase;
  暂停?: Record<Side, number>;
  阵容?: Rotation;
};

export interface ActionChoice {
  action: ActionType;
  actorKey: string;
  partnerKey: string | null;
}

export interface SubstitutionChoice {
  side: Side;
  outKey: string;
  inKey: string;
}

export interface ActionPanelProps {
  match: MatchState;
  /** 玩家球队在本场的主客位 */
  mySide: Side;
  protagonist: string;
  disabled: boolean;
  onChoose: (choice: ActionChoice) => void;
  /** 前端先确定性扣减暂停并切入死球，再请求 AI 叙事。 */
  onTimeout?: (side: Side) => void;
  /** 前端先完成阵容与站位替换，再请求 AI 叙事。 */
  onSubstitution?: (choice: SubstitutionChoice) => void;
}

const shortName = (key: string): string => getPlayer(key)?.cn.split('·').pop() ?? key;

export function ActionPanel(props: ActionPanelProps) {
  const { match, mySide } = props;
  const managedMatch = match as MatchWithManagement;
  const phase: RoundPhase = managedMatch.回合阶段 ?? '常规回合';
  const weHaveBall = match.球权 === mySide;
  const mySpots = match.站位[mySide] ?? [];
  const ballHolder = mySpots.find(spot => spot.持球)?.球员 ?? props.protagonist;
  const rotation = managedMatch.阵容?.[mySide];
  const onCourt = rotation?.场上?.length ? rotation.场上 : mySpots.map(spot => spot.球员);
  const bench = rotation?.替补 ?? [];
  const timeoutCount = managedMatch.暂停?.[mySide] ?? 0;

  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [selectedActor, setSelectedActor] = useState(props.protagonist);
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [subIn, setSubIn] = useState<string | null>(null);

  const activeActor = onCourt.includes(selectedActor) ? selectedActor : onCourt[0] ?? props.protagonist;
  const activeSubOut = subOut && onCourt.includes(subOut) ? subOut : onCourt[0] ?? null;
  const activeSubIn = subIn && bench.includes(subIn) ? subIn : bench[0] ?? null;

  const offBallPlayers = useMemo(() => onCourt.filter(key => key !== ballHolder), [onCourt, ballHolder]);
  const teammates = offBallPlayers;

  const choose = (action: ActionType, actorKey: string, partnerKey: string | null = null) => {
    setPendingAction(null);
    props.onChoose({ action, actorKey, partnerKey });
  };

  const submitSubstitution = () => {
    if (!activeSubOut || !activeSubIn || !props.onSubstitution) return;
    props.onSubstitution({ side: mySide, outKey: activeSubOut, inKey: activeSubIn });
    setShowSubstitution(false);
    setSubOut(null);
    setSubIn(null);
  };

  const phaseLabel = phase === '篮板争抢' ? '篮板争抢' : phase === '死球' ? '死球管理' : weHaveBall ? '进攻回合' : '防守回合';

  const management = (
    <div className="ap-management" aria-label="比赛管理">
      <button
        className="ap-manage"
        disabled={props.disabled || timeoutCount <= 0 || !props.onTimeout}
        onClick={() => props.onTimeout?.(mySide)}
      >
        请求暂停 <b>{timeoutCount}</b>
      </button>
      <button
        className={`ap-manage ${showSubstitution ? 'active' : ''}`}
        disabled={props.disabled || phase !== '死球' || bench.length === 0 || !props.onSubstitution}
        onClick={() => setShowSubstitution(value => !value)}
        title={phase !== '死球' ? '换人只能在死球阶段进行' : undefined}
      >
        阵容轮换
      </button>
    </div>
  );

  const substitution = showSubstitution ? (
    <div className="ap-substitution">
      <div className="ap-sub-column">
        <span>换下</span>
        <div className="ap-actor-row">
          {onCourt.map(key => (
            <button key={key} className={`ap-actor ${activeSubOut === key ? 'active' : ''}`} onClick={() => setSubOut(key)}>
              {shortName(key)}
            </button>
          ))}
        </div>
      </div>
      <div className="ap-sub-arrow" aria-hidden="true">⇄</div>
      <div className="ap-sub-column">
        <span>换上</span>
        <div className="ap-actor-row">
          {bench.map(key => (
            <button key={key} className={`ap-actor ${activeSubIn === key ? 'active' : ''}`} onClick={() => setSubIn(key)}>
              {shortName(key)}
            </button>
          ))}
        </div>
      </div>
      <button className="ap-confirm-sub" disabled={props.disabled || !activeSubOut || !activeSubIn} onClick={submitSubstitution}>
        确认换人
      </button>
    </div>
  ) : null;

  if (phase === '死球') {
    return (
      <section className="action-panel phase-dead-ball">
        <div className="ap-heading">
          <div>
            <span className="ap-phase">DEAD BALL</span>
            <div className="ap-title">{phaseLabel} · 可暂停或调整阵容</div>
          </div>
          {management}
        </div>
        {substitution}
        <div className="ap-hint">完成管理操作后，由结算流程恢复下一次常规回合。</div>
      </section>
    );
  }

  if (phase === '篮板争抢') {
    return (
      <section className="action-panel phase-rebound">
        <div className="ap-heading">
          <div>
            <span className="ap-phase">LIVE BALL</span>
            <div className="ap-title">{phaseLabel} · 选择冲抢球员</div>
          </div>
          {management}
        </div>
        <div className="ap-actor-row">
          {onCourt.map(key => (
            <button key={key} className={`ap-actor ${activeActor === key ? 'active' : ''}`} onClick={() => setSelectedActor(key)}>
              {shortName(key)}
            </button>
          ))}
        </div>
        <div className="ap-actions">
          <button disabled={props.disabled} className="ap-action rebound" onClick={() => choose('篮板', activeActor)}>
            冲抢篮板
          </button>
        </div>
      </section>
    );
  }

  if (!weHaveBall) {
    return (
      <section className="action-panel phase-defense">
        <div className="ap-heading">
          <div>
            <span className="ap-phase">DEFENSE</span>
            <div className="ap-title">{phaseLabel} · 选择行动人与策略</div>
          </div>
          {management}
        </div>
        <div className="ap-actor-row">
          {onCourt.map(key => (
            <button key={key} className={`ap-actor ${activeActor === key ? 'active' : ''}`} onClick={() => setSelectedActor(key)}>
              {shortName(key)}
            </button>
          ))}
        </div>
        <div className="ap-actions">
          {DEFENSE_ACTIONS.map(action => (
            <button key={action} disabled={props.disabled} className="ap-action defense" onClick={() => choose(action, activeActor)}>
              {action}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const holderPlayer = getPlayer(ballHolder);
  const selectingOffBallActor = pendingAction === '无球跑动';

  return (
    <section className="action-panel phase-offense">
      <div className="ap-heading">
        <div>
          <span className="ap-phase">OFFENSE</span>
          <div className="ap-title">
            {phaseLabel} · 持球：{holderPlayer?.cn ?? ballHolder}
            {ballHolder === props.protagonist ? '（你）' : ''}
          </div>
        </div>
        {management}
      </div>
      {pendingAction ? (
        <div className="ap-partner-select">
          <span>{selectingOffBallActor ? '谁来跑位：' : pendingAction === '传球' ? '传给谁：' : '谁来掩护：'}</span>
          {teammates.map(key => (
            <button
              key={key}
              className="ap-actor"
              disabled={props.disabled}
              onClick={() => (selectingOffBallActor ? choose(pendingAction, key) : choose(pendingAction, ballHolder, key))}
            >
              {shortName(key)}
            </button>
          ))}
          <button className="ap-cancel" onClick={() => setPendingAction(null)}>取消</button>
        </div>
      ) : (
        <div className="ap-actions">
          {OFFENSE_ACTIONS.map(action => (
            <button
              key={action}
              disabled={props.disabled}
              className="ap-action offense"
              onClick={() => (NEED_PARTNER.includes(action) || action === '无球跑动' ? setPendingAction(action) : choose(action, ballHolder))}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
