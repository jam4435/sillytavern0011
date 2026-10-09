import { useState } from 'react';
import { BADGE_REGISTRY, GROUP_KEYS, GROUP_LABELS, HOT_ZONE_IDS, potentialLevelCap, upgradeCost } from '../engine/development';
import type { UpgradeGroupKey } from '../engine/types';
import type { CareerState, LeagueState, OffCourtState } from '../utils/statReader';
import { getPlayerForLeague, getTeam } from '../utils/rosters';
import { careerPhase } from '../engine/lifecycle';
import type { TeamSimulationProfile } from '../engine/teamPower';
import { leaderboard, type LeaderboardCategory } from '../engine/leagueStats';
import { careerLeaders, playerCareerAchievements } from '../engine/history';

export function CareerPanel(props: {
  career: CareerState | null; offCourt: OffCourtState | null; league: LeagueState | null;
  teamPower: { profile: TeamSimulationProfile; rank: number; total: number } | null; disabled: boolean;
  onAction: (text: string) => void; onStartMatch: () => void; onNextSeason: () => void;
  onPrepareMarket: () => void; onAcceptOffer: (offerId: string) => void;
  onTrain: () => void; onUpgrade: (group: UpgradeGroupKey) => void;
}) {
  const { career, offCourt, league } = props;
  const [showDevelopment, setShowDevelopment] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLeagueLeaders, setShowLeagueLeaders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const team = career ? getTeam(career.球队) : undefined;
  const points = career?.发展.growthPoints ?? career?.成长点 ?? 0;
  const cap = potentialLevelCap(career?.能力.potential ?? 75);
  const record = career ? league?.战绩?.[career.球队] : undefined;
  const coach = career ? league?.教练?.[career.球队] : undefined;
  const coachAssimilation = coach ? Math.min(15, coach.tenureGames) : 0;
  const rotationLabel = coach
    ? coach.rotationDepthBias > 0 ? '偏深轮换' : coach.rotationDepthBias < 0 ? '偏短轮换' : '常规轮换'
    : '—';
  const starLoadLabel = coach
    ? coach.starLoadBias > 3 ? '偏重核心' : coach.starLoadBias < -3 ? '偏分担' : '均衡'
    : '—';
  const phase = career ? careerPhase(career.年龄, career.巅峰年龄, career.退役状态) : '—';
  const activeHooks = (league?.故事钩子 ?? []).filter(hook => !hook.consumed).slice(-3).reverse();
  const pendingOffers = career
    ? (league?.市场报价 ?? []).filter(offer => offer.playerKey === career.附身球员 && offer.status === '待定')
    : [];
  const latestDraftEntry = Math.max(-1, ...(league?.选秀历史 ?? []).map(pick => pick.entrySeason));
  const latestDraft = latestDraftEntry >= 0
    ? (league?.选秀历史 ?? []).filter(pick => pick.entrySeason === latestDraftEntry)
    : [];
  const draftPreview = [...latestDraft.slice(0, 5), ...latestDraft.filter(pick => pick.teamId === career?.球队)]
    .filter((pick, index, list) => list.findIndex(item => item.playerKey === pick.playerKey) === index);
  const seasonAwards = league?.奖项记录?.[league.奖项记录.length - 1];
  const history = league?.历史档案;
  const protagonistHistory = history && career
    ? playerCareerAchievements(history, league?.奖项记录 ?? [], career.附身球员) : null;
  const historicalCategories = [
    { key: 'pts' as const, label: '得分' },
    { key: 'reb' as const, label: '篮板' },
    { key: 'ast' as const, label: '助攻' },
    { key: 'stl' as const, label: '抢断' },
    { key: 'blk' as const, label: '盖帽' },
  ];
  const statCategories: { key: LeaderboardCategory; title: string }[] = [
    { key: 'pts', title: '得分' }, { key: 'reb', title: '篮板' },
    { key: 'ast', title: '助攻' }, { key: 'stl', title: '抢断' }, { key: 'blk', title: '盖帽' },
  ];
  const quickActions = [
    { label: '会见经纪人', text: '我约经纪人见面，聊聊最近的代言机会和职业规划。' },
    { label: '代言谈判', text: '我想推进当前的代言谈判或寻找新的代言机会。' },
    { label: '队友聚会', text: '我组织队友聚餐，增进更衣室关系。' },
    { label: '接受采访', text: '我接受媒体采访，回应最近的话题。' },
  ];

  return <div className="career-panel career-v3">
    <div className="cp-header"><div className="cp-identity"><span className="cp-eyebrow">{career?.赛季 ?? '—'} / MYCAREER</span><span className="cp-name">{career?.姓名 ?? '未建档'}</span><span className="cp-team" style={{ color: team?.colors.primary }}>{team?.cn ?? career?.球队} · {career?.位置} · {career?.球队角色} · {career?.年龄 ?? '—'}岁 · {phase}</span><span className="cp-season">第 {career?.赛程索引 ?? 0} 场 · {record ? `${record.胜}胜${record.负}负 · ` : ''}教练信任 {career?.教练信任 ?? 0}</span></div><div className="career-ovr"><span>OVR</span><b>{career?.能力.overall ?? 0}</b><small>POT {career?.能力.potential ?? 0}</small></div></div>
    <div className="career-resource-strip"><span>资金 <b>{((offCourt?.资金 ?? 0) / 10000).toFixed(1)}万</b></span><span>声望 <b>{offCourt?.声望 ?? 0}</b></span><span>粉丝 <b>{((offCourt?.粉丝 ?? 0) / 10000).toFixed(1)}万</b></span><span>成长点 <b>{points}</b></span></div>
    <div className="cp-schedule"><span>{offCourt?.日程?.日期 ?? '—'}</span><span>下一场：{offCourt?.日程?.下一场 ?? '—'}</span>{(offCourt?.日程?.待办 ?? []).map(item => <span key={item} className="cp-todo">{item}</span>)}</div>
    {props.teamPower && <div className="cp-section team-power"><div className="cp-section-title">当前球队实力</div>
      <div className="cp-row"><b>联盟 #{props.teamPower.rank}/{props.teamPower.total}</b> · 动态实力 {props.teamPower.profile.power.toFixed(1)} · 净效率 {props.teamPower.profile.netRating >= 0 ? '+' : ''}{props.teamPower.profile.netRating.toFixed(1)}</div>
      <div className="cp-row"><b>画像</b> · ORtg {props.teamPower.profile.offenseRating.toFixed(1)} · DRtg {props.teamPower.profile.defenseRating.toFixed(1)} · Pace {props.teamPower.profile.pace.toFixed(1)}</div>
      <div className="cp-row"><b>体系</b> · {props.teamPower.profile.tactics.offense} / {props.teamPower.profile.tactics.defense} · {props.teamPower.profile.tactics.pace}节奏 · 可用 {props.teamPower.profile.healthyPlayers} 人</div>
    </div>}
        {activeHooks.length > 0 && <div className="cp-section league-pulse"><div className="cp-section-title">联盟动态</div>{activeHooks.map(hook => <div key={hook.id} className="cp-row"><b>{hook.title}</b> · {hook.detail}</div>)}</div>}
    {league && <div className="cp-section league-leaders">
      <div className="cp-section-title">联盟个人统计榜 · {league.赛季}</div>
      <div className="cp-row">
        赛季已累计 {Object.keys(league.球员赛季统计 ?? {}).length} 名球员的数据
        <button type="button" onClick={() => setShowLeagueLeaders(value => !value)}>
          {showLeagueLeaders ? '收起榜单' : '查看五项榜单'}
        </button>
      </div>
      {showLeagueLeaders && statCategories.map(category => <div key={category.key} className="cp-row">
        <b>{category.title}榜（场均）</b> · {leaderboard(league.球员赛季统计 ?? {}, category.key)
          .map((row, index) => `${index + 1}.${row.playerKey} ${row.average.toFixed(1)}（${row.gp}场）`).join(' / ') || '暂无赛季数据'}
      </div>)}
      {seasonAwards && <div className="cp-row">
        <b>{seasonAwards.season} 正式奖项</b> · MVP {seasonAwards.mvp ?? '空缺'} · 最佳新秀 {seasonAwards.rookie ?? '空缺'} · DPOY {seasonAwards.dpoy ?? '空缺'}
        {seasonAwards.allNBA.map((keys, index) => <div key={index}>最佳阵容第{index + 1}阵：{keys.join(' / ') || '—'}</div>)}
        {seasonAwards.allDefense.map((keys, index) => <div key={index}>最佳防守第{index + 1}阵：{keys.join(' / ') || '—'}</div>)}
      </div>}
    </div>}
    {history && <div className="cp-section league-history">
      <div className="cp-section-title">联盟历史档案</div>
      <div className="cp-row">
        已封存 {history.lastCountedSeason ? '截至 ' + history.lastCountedSeason : '尚无完整赛季'} · 
        {history.championships.length} 届冠军 · {Object.keys(history.career).length} 名球员生涯账本
        <button type="button" onClick={() => setShowHistory(value => !value)}>
          {showHistory ? '收起历史' : '查看历史 / 纪录 / 里程碑'}
        </button>
      </div>
      {protagonistHistory?.stats && <div className="cp-row">
        <b>我的生涯累计</b> · {protagonistHistory.stats.seasons}季 · {protagonistHistory.stats.gp}场 ·
        {protagonistHistory.stats.pts}分 / {protagonistHistory.stats.reb}板 /
        {protagonistHistory.stats.ast}助 · MVP {protagonistHistory.mvp}次 ·
        DPOY {protagonistHistory.dpoy}次 · 最佳阵容 {protagonistHistory.allNBA}次
      </div>}
      {showHistory && <>
        <div className="cp-row"><b>历届总冠军（最近10届）</b>
          {[...history.championships].reverse().slice(0, 10).map(row =>
            <div key={row.season}>{row.season} · {getTeam(row.champion)?.cn ?? row.champion}
              （亚军 {getTeam(row.runnerUp)?.cn ?? row.runnerUp}）</div>)}
          {!history.championships.length && <div>暂无已决出的总冠军</div>}
        </div>
        <div className="cp-row"><b>历史常规赛场均纪录（至少30场）</b>
          {historicalCategories.map(({key,label}) => {
            const record = history.records[key];
            return <div key={key}>{label} · {record
              ? `${record.playerKey} ${(record.total / record.gp).toFixed(1)} /场（${record.season}）`
              : '暂无'}</div>;
          })}
        </div>
        <div className="cp-row"><b>历史生涯累计排名</b>
          {historicalCategories.map(({key,label}) => <div key={key}>
            {label}：{careerLeaders(history, key, 5).map((row, index) =>
              `${index+1}.${row.playerKey} ${row.total}${getPlayerForLeague(row.playerKey, league) ? '' : '（已退役）'}`
            ).join(' / ') || '暂无'}</div>)}
        </div>
        <div className="cp-row"><b>近年个人荣誉</b>
          {[...(league?.奖项记录 ?? [])].reverse().slice(0, 5).map(row =>
            <div key={row.season}>{row.season} · MVP {row.mvp ?? '空缺'} ·
              最佳新秀 {row.rookie ?? '空缺'} · DPOY {row.dpoy ?? '空缺'}</div>)}
        </div>
        <div className="cp-row"><b>最近里程碑</b>
          {[...history.milestones].reverse().slice(0, 8).map(row =>
            <div key={row.id}>{row.season} · {row.playerKey} · {row.category.toUpperCase()} 达到 {row.threshold}</div>)}
          {!history.milestones.length && <div>暂无</div>}
        </div>
      </>}
    </div>}
    {draftPreview.length > 0 && <div className="cp-section draft-board"><div className="cp-section-title">最近选秀</div>
      {draftPreview.map(pick => <div key={pick.playerKey} className="cp-row">
        <b>#{pick.overallPick} {getTeam(pick.teamId)?.cn ?? pick.teamId}</b> · {pick.playerName} · {pick.pos} · {pick.template} · OVR {pick.overallAtDraft} / POT {pick.potential}
      </div>)}
    </div>}
    {coach && <div className="cp-section coach-profile"><div className="cp-section-title">教练理念</div>
      <div className="cp-row"><b>体系</b> · 进攻偏好 {coach.offensePreference ?? '随阵容'} · 防守偏好 {coach.defensePreference ?? '随阵容'} · 节奏 {coach.pacePreference}</div>
      <div className="cp-row"><b>用人</b> · {rotationLabel} · {starLoadLabel} · 小阵容 {coach.smallBallBias > 4 ? '偏爱' : coach.smallBallBias < -4 ? '保守' : '中性'}</div>
      <div className="cp-row"><b>磨合</b> · {coach.tenureGames >= 15 ? '理念已稳定落地' : `${coachAssimilation}/15 场`} · 固执度 {Math.round(coach.stubbornness)}</div>
    </div>}
    {offCourt?.合同 && <div className="cp-section contract-profile"><div className="cp-section-title">当前合同</div>
      <div className="cp-row"><b>{getTeam(offCourt.合同.球队)?.cn ?? offCourt.合同.球队}</b> · 年薪 {(offCourt.合同.年薪 / 10000).toFixed(0)} 万美元 · 剩余 {offCourt.合同.年限} 年 · 到期 {offCourt.合同.到期赛季}</div>
    </div>}
    {pendingOffers.length > 0 && <div className="cp-section market-offers"><div className="cp-section-title">正式报价</div>
      {pendingOffers.map(offer => <div className="cp-row market-offer" key={offer.id}>
        <div><b>{getTeam(offer.teamId)?.cn ?? offer.teamId}</b> · {offer.type}
          {offer.type === '交易'
            ? <> · 回报 {offer.outgoingPlayerKey ?? '筹码'}</>
            : <> · {offer.years}年 / 年薪 {(offer.annualSalary / 10000).toFixed(0)} 万美元</>}
          <small> · 需求 {Math.round(offer.needScore)} · 适配 {Math.round(offer.fitScore)}</small>
        </div>
        <button disabled={props.disabled} onClick={() => props.onAcceptOffer(offer.id)}>接受</button>
      </div>)}
    </div>}

    <div className="career-toolbar"><button className={showDevelopment ? 'active' : ''} onClick={() => setShowDevelopment(value => !value)}>能力升级</button><button className={showProfile ? 'active' : ''} onClick={() => setShowProfile(value => !value)}>徽章 / 热区</button><button disabled={props.disabled} onClick={props.onTrain}>今日训练 +1</button></div>
    {showDevelopment && career && <section className="development-panel"><header><div><span>NONLINEAR DEVELOPMENT</span><b>潜力等级上限 {cap}</b></div><strong>{points} GP</strong></header><div className="development-grid">{GROUP_KEYS.map(key => { const level = career.发展.groups[key]; const cost = upgradeCost(level); return <div className="development-row" key={key}><div><span>{GROUP_LABELS[key]}</span><small>LV {level}/{cap} · 下级 {cost}点</small></div><div className="development-track"><i style={{ width: `${level / 20 * 100}%` }} /></div><button disabled={props.disabled || level >= cap || points < cost} onClick={() => props.onUpgrade(key)}>升级</button></div>; })}</div></section>}
    {showProfile && career && <section className="player-dynamics"><div><h3>核心徽章</h3><div className="badge-grid">{BADGE_REGISTRY.map(name => { const badge = career.动态徽章.badges[name]; return <span key={name} data-level={badge?.level ?? '未解锁'}>{name}<b>{badge?.level ?? '未解锁'}</b><small>{badge?.progress ?? 0}</small></span>; })}</div></div><div><h3>14区热图</h3><div className="hotzone-grid">{HOT_ZONE_IDS.map(zone => { const item = career.热区.zones[zone]; return <span key={zone} data-state={item?.state ?? '中性'}>{zone}<b>{item?.state ?? '中性'}</b><small>{item?.makes ?? 0}/{item?.attempts ?? 0}</small></span>; })}</div></div></section>}

    {(offCourt?.代言?.length ?? 0) > 0 && <div className="cp-section"><div className="cp-section-title">代言</div>{offCourt!.代言.map(item => <div key={item.品牌} className="cp-row">{item.品牌} · {(item.年薪 / 10000).toFixed(0)}万/年 · {item.状态}</div>)}</div>}
    <div className="cp-actions">
      {quickActions.map(action => <button key={action.label} disabled={props.disabled || career?.退役状态 === '退役'} onClick={() => props.onAction(action.text)}>{action.label}</button>)}
      <button disabled={props.disabled || career?.退役状态 === '退役'} onClick={props.onPrepareMarket}>
        {league?.阶段 === '休赛期' ? '查看合同市场' : '查看交易报价'}
      </button>
      {league?.阶段 === '休赛期'
        ? <button className="cp-start-match" disabled={props.disabled || career?.退役状态 === '退役'} onClick={props.onNextSeason}>进入下一赛季</button>
        : <button className="cp-start-match" disabled={props.disabled || career?.退役状态 === '退役'} onClick={props.onStartMatch}>{career?.退役状态 === '退役' ? '生涯已退役' : '进入下一场比赛'}</button>}
    </div>
  </div>;
}
