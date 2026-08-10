import { useState } from 'react';
import { BADGE_REGISTRY, GROUP_KEYS, GROUP_LABELS, HOT_ZONE_IDS, potentialLevelCap, upgradeCost } from '../engine/development';
import type { UpgradeGroupKey } from '../engine/types';
import type { CareerState, OffCourtState } from '../utils/statReader';
import { getTeam } from '../utils/rosters';

export function CareerPanel(props: {
  career: CareerState | null; offCourt: OffCourtState | null; disabled: boolean;
  onAction: (text: string) => void; onStartMatch: () => void;
  onTrain: () => void; onUpgrade: (group: UpgradeGroupKey) => void;
}) {
  const { career, offCourt } = props;
  const [showDevelopment, setShowDevelopment] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const team = career ? getTeam(career.球队) : undefined;
  const points = career?.发展.growthPoints ?? career?.成长点 ?? 0;
  const cap = potentialLevelCap(career?.能力.potential ?? 75);
  const quickActions = [
    { label: '会见经纪人', text: '我约经纪人见面，聊聊最近的代言机会和职业规划。' },
    { label: '代言谈判', text: '我想推进当前的代言谈判或寻找新的代言机会。' },
    { label: '队友聚会', text: '我组织队友聚餐，增进更衣室关系。' },
    { label: '接受采访', text: '我接受媒体采访，回应最近的话题。' },
  ];

  return <div className="career-panel career-v3">
    <div className="cp-header"><div className="cp-identity"><span className="cp-eyebrow">2015–16 / MYCAREER</span><span className="cp-name">{career?.姓名 ?? '未建档'}</span><span className="cp-team" style={{ color: team?.colors.primary }}>{team?.cn ?? career?.球队} · {career?.位置} · {career?.球队角色}</span><span className="cp-season">第 {career?.赛程索引 ?? 0} 场 · 教练信任 {career?.教练信任 ?? 0}</span></div><div className="career-ovr"><span>OVR</span><b>{career?.能力.overall ?? 0}</b><small>POT {career?.能力.potential ?? 0}</small></div></div>
    <div className="career-resource-strip"><span>资金 <b>{((offCourt?.资金 ?? 0) / 10000).toFixed(1)}万</b></span><span>声望 <b>{offCourt?.声望 ?? 0}</b></span><span>粉丝 <b>{((offCourt?.粉丝 ?? 0) / 10000).toFixed(1)}万</b></span><span>成长点 <b>{points}</b></span></div>
    <div className="cp-schedule"><span>{offCourt?.日程?.日期 ?? '—'}</span><span>下一场：{offCourt?.日程?.下一场 ?? '—'}</span>{(offCourt?.日程?.待办 ?? []).map(item => <span key={item} className="cp-todo">{item}</span>)}</div>

    <div className="career-toolbar"><button className={showDevelopment ? 'active' : ''} onClick={() => setShowDevelopment(value => !value)}>能力升级</button><button className={showProfile ? 'active' : ''} onClick={() => setShowProfile(value => !value)}>徽章 / 热区</button><button disabled={props.disabled} onClick={props.onTrain}>今日训练 +1</button></div>
    {showDevelopment && career && <section className="development-panel"><header><div><span>NONLINEAR DEVELOPMENT</span><b>潜力等级上限 {cap}</b></div><strong>{points} GP</strong></header><div className="development-grid">{GROUP_KEYS.map(key => { const level = career.发展.groups[key]; const cost = upgradeCost(level); return <div className="development-row" key={key}><div><span>{GROUP_LABELS[key]}</span><small>LV {level}/{cap} · 下级 {cost}点</small></div><div className="development-track"><i style={{ width: `${level / 20 * 100}%` }} /></div><button disabled={props.disabled || level >= cap || points < cost} onClick={() => props.onUpgrade(key)}>升级</button></div>; })}</div></section>}
    {showProfile && career && <section className="player-dynamics"><div><h3>核心徽章</h3><div className="badge-grid">{BADGE_REGISTRY.map(name => { const badge = career.动态徽章.badges[name]; return <span key={name} data-level={badge?.level ?? '未解锁'}>{name}<b>{badge?.level ?? '未解锁'}</b><small>{badge?.progress ?? 0}</small></span>; })}</div></div><div><h3>14区热图</h3><div className="hotzone-grid">{HOT_ZONE_IDS.map(zone => { const item = career.热区.zones[zone]; return <span key={zone} data-state={item?.state ?? '中性'}>{zone}<b>{item?.state ?? '中性'}</b><small>{item?.makes ?? 0}/{item?.attempts ?? 0}</small></span>; })}</div></div></section>}

    {(offCourt?.代言?.length ?? 0) > 0 && <div className="cp-section"><div className="cp-section-title">代言</div>{offCourt!.代言.map(item => <div key={item.品牌} className="cp-row">{item.品牌} · {(item.年薪 / 10000).toFixed(0)}万/年 · {item.状态}</div>)}</div>}
    <div className="cp-actions">{quickActions.map(action => <button key={action.label} disabled={props.disabled} onClick={() => props.onAction(action.text)}>{action.label}</button>)}<button className="cp-start-match" disabled={props.disabled} onClick={props.onStartMatch}>进入下一场比赛</button></div>
  </div>;
}
