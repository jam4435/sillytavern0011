import { useState } from 'react';
import type { ActionType, MatchState, Side } from '../engine/types';
import { getPlayer } from '../utils/rosters';

const HOLDER_ACTIONS: ActionType[] = ['定点投篮', '急停投篮', '后撤步', '突破终结', '突破分球', '突破急停', '安全传球', '跨场转移', '挡拆突破', '顺下传球', '外弹传球', '背身单打'];
const OFF_BALL_ACTIONS: ActionType[] = ['空切', '外移接球', '无球掩护'];
const DEFENSE_ACTIONS: ActionType[] = ['保持身位', '贴身施压', '赌博抢断', '协防', '换防', '封盖干扰'];
const PARTNER_ACTIONS: ActionType[] = ['安全传球', '跨场转移', '挡拆突破', '顺下传球', '外弹传球', '无球掩护'];

export interface ActionChoice { action: ActionType; actorKey: string; partnerKey: string | null }
export interface SubstitutionChoice { side: Side; outKey: string; inKey: string }
export interface ActionPanelProps {
  match: MatchState; mySide: Side; protagonist: string; disabled: boolean;
  onChoose: (choice: ActionChoice) => void; onTimeout?: (side: Side) => void;
  onSubstitution?: (choice: SubstitutionChoice) => void; onFreeThrow?: () => void;
}

const shortName = (key: string) => getPlayer(key)?.cn.split('·').pop() ?? key;

export function ActionPanel(props: ActionPanelProps) {
  const { match, mySide, protagonist } = props;
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [subIn, setSubIn] = useState<string | null>(null);
  const rotation = match.阵容[mySide];
  const onCourt = rotation.场上.includes(protagonist);
  const holder = match.站位[mySide].find(spot => spot.持球)?.球员;
  const teammates = rotation.场上.filter(key => key !== protagonist);
  const timeoutCount = match.暂停[mySide];
  const choose = (action: ActionType, partnerKey: string | null = null) => { setPendingAction(null); props.onChoose({ action, actorKey: protagonist, partnerKey }); };

  const management = <div className="ap-management">
    <button className="ap-manage" disabled={props.disabled || timeoutCount <= 0 || !props.onTimeout} onClick={() => props.onTimeout?.(mySide)}>暂停 <b>{timeoutCount}</b></button>
    <button className={`ap-manage ${showSubstitution ? 'active' : ''}`} disabled={props.disabled || match.回合阶段 !== '死球' || !props.onSubstitution} onClick={() => setShowSubstitution(value => !value)}>阵容轮换</button>
  </div>;

  if (match.回合阶段 === '罚球结算') {
    const pending = match.待处理情境.type === 'freeThrow' ? match.待处理情境 : null;
    return <section className="action-panel phase-free-throw"><div className="ap-heading"><div><span className="ap-phase">FREE THROW</span><div className="ap-title">{shortName(pending?.shooter ?? '')} · 剩余 {pending?.remaining ?? 0} 罚</div></div></div><button className="ap-action offense" disabled={props.disabled || !props.onFreeThrow} onClick={props.onFreeThrow}>执行罚球判定</button></section>;
  }

  if (match.回合阶段 === '死球') {
    const out = subOut && rotation.场上.includes(subOut) ? subOut : rotation.场上[0];
    const incoming = subIn && rotation.替补.includes(subIn) ? subIn : rotation.替补[0];
    return <section className="action-panel phase-dead-ball"><div className="ap-heading"><div><span className="ap-phase">DEAD BALL</span><div className="ap-title">死球管理 · {match.回合情境}</div></div>{management}</div>{showSubstitution && <div className="ap-substitution"><div><span>换下</span><div className="ap-actor-row">{rotation.场上.map(key => <button key={key} className={out === key ? 'active ap-actor' : 'ap-actor'} onClick={() => setSubOut(key)}>{shortName(key)}</button>)}</div></div><span>⇄</span><div><span>换上</span><div className="ap-actor-row">{rotation.替补.map(key => <button key={key} className={incoming === key ? 'active ap-actor' : 'ap-actor'} onClick={() => setSubIn(key)}>{shortName(key)}</button>)}</div></div><button className="ap-confirm-sub" disabled={!out || !incoming} onClick={() => { if (out && incoming) props.onSubstitution?.({ side: mySide, outKey: out, inKey: incoming }); setShowSubstitution(false); }}>确认</button></div>}</section>;
  }

  if (!onCourt) return <section className="action-panel phase-bench"><div className="ap-heading"><div><span className="ap-phase">BENCH</span><div className="ap-title">主角暂未登场</div></div>{management}</div><div className="ap-actions">{(['观察', '模拟一个回合'] as ActionType[]).map(action => <button key={action} disabled={props.disabled} className="ap-action" onClick={() => choose(action)}>{action}</button>)}</div></section>;

  if (match.回合阶段 === '篮板争抢') {
    const shootingSide = match.待处理情境.type === 'rebound' ? match.待处理情境.shootingSide : match.球权;
    const action: ActionType = shootingSide === mySide ? '冲抢进攻篮板' : '防守篮板';
    return <section className="action-panel phase-rebound"><div className="ap-heading"><div><span className="ap-phase">REBOUND</span><div className="ap-title">篮板落点争抢</div></div>{management}</div><div className="ap-actions"><button disabled={props.disabled} className="ap-action rebound" onClick={() => choose('卡位')}>先卡位</button><button disabled={props.disabled} className="ap-action rebound" onClick={() => choose(action)}>{action}</button></div></section>;
  }

  const offense = match.球权 === mySide;
  const actions = offense ? (holder === protagonist ? HOLDER_ACTIONS : OFF_BALL_ACTIONS) : DEFENSE_ACTIONS;
  return <section className={`action-panel ${offense ? 'phase-offense' : 'phase-defense'}`}>
    <div className="ap-heading"><div><span className="ap-phase">{offense ? holder === protagonist ? 'ON BALL' : 'OFF BALL' : 'DEFENSE'}</span><div className="ap-title">{getPlayer(protagonist)?.cn ?? protagonist} · 只控制主角</div></div>{management}</div>
    {pendingAction ? <div className="ap-partner-select"><span>选择配合队友</span>{teammates.map(key => <button key={key} className="ap-actor" disabled={props.disabled} onClick={() => choose(pendingAction, key)}>{shortName(key)}</button>)}<button className="ap-cancel" onClick={() => setPendingAction(null)}>取消</button></div>
      : <div className="ap-actions">{actions.map(action => <button key={action} disabled={props.disabled} className={`ap-action ${offense ? 'offense' : 'defense'}`} onClick={() => PARTNER_ACTIONS.includes(action) ? setPendingAction(action) : choose(action)}>{action}</button>)}</div>}
  </section>;
}
