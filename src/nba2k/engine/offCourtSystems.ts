import type { CareerState, OffCourtState } from '../utils/statReader';
import type { LeagueState, StoryHook } from './season';

function winPct(league: LeagueState, teamId: string): number {
  const row = league.战绩[teamId];
  if (!row) return .5;
  const games = row.胜 + row.负;
  return games ? row.胜 / games : .5;
}

function uniqueHooks(existing: StoryHook[], incoming: StoryHook[]): StoryHook[] {
  const seen = new Set(existing.map(hook => hook.id));
  return incoming.filter(hook => !seen.has(hook.id));
}

export function isTradeWindowOpen(date: string): boolean {
  const monthDay = date.slice(5);
  return monthDay >= '10-27' || monthDay <= '02-18';
}

export function isTradeDeadlinePeriod(date: string): boolean {
  const monthDay = date.slice(5);
  return monthDay >= '02-10' && monthDay <= '02-18';
}

export function tradeInterestScore(career: CareerState, league: LeagueState): number {
  const performance = Number(career.赛季统计.上场表现 ?? 50);
  const teamPct = winPct(league, career.球队);
  const roleBonus = career.球队角色 === '核心' ? 12 : career.球队角色 === '首发' ? 7 : career.球队角色 === '第六人' ? 4 : 0;
  return Math.max(0, Math.min(100,
    25 + (career.能力.overall - 70) * 2 + (career.能力.potential - career.能力.overall) * .6 + performance * .18 + roleBonus - teamPct * 8,
  ));
}

export interface ContractQuote {
  annualSalary: number;
  years: number;
  marketScore: number;
}

export function quoteContract(career: CareerState, offCourt: OffCourtState): ContractQuote {
  const performance = Number(career.赛季统计.上场表现 ?? 50);
  const reputation = offCourt.声望;
  const marketScore = Math.max(50, Math.min(99,
    career.能力.overall * .62 + performance * .18 + reputation * .12 + career.能力.potential * .08,
  ));
  const annualSalary = Math.round((900_000 + Math.pow(Math.max(0, marketScore - 55), 1.72) * 54_000) / 50_000) * 50_000;
  const years = marketScore >= 88 ? 4 : marketScore >= 78 ? 3 : 2;
  return { annualSalary, years, marketScore: Math.round(marketScore) };
}

export function awardScores(career: CareerState, league: LeagueState): Record<'MVP' | '最佳新秀' | '最佳防守球员', number> {
  const stats = career.赛季统计;
  const ppg = Number(stats.场均得分 ?? 0);
  const rpg = Number(stats.场均篮板 ?? 0);
  const apg = Number(stats.场均助攻 ?? 0);
  const games = Number(stats.出场数 ?? 0);
  const teamPct = winPct(league, career.球队);
  const availability = Math.min(1, games / 65);
  const mvp = (ppg * 1.5 + rpg * .75 + apg + teamPct * 30) * availability;
  const rookie = (ppg * 1.35 + rpg * .8 + apg * 1.1 + career.能力.potential * .12) * availability;
  const defense = (
    career.能力.onBallDefenseIQ * .22 +
    career.能力.shotContest * .18 +
    career.能力.steal * .13 +
    career.能力.block * .13 +
    rpg * 1.2 +
    teamPct * 12
  ) * availability;
  return { MVP: Math.round(mvp * 10) / 10, 最佳新秀: Math.round(rookie * 10) / 10, 最佳防守球员: Math.round(defense * 10) / 10 };
}

function sponsorshipHooks(career: CareerState, offCourt: OffCourtState, league: LeagueState): StoryHook[] {
  const games = Number(career.赛季统计.出场数 ?? 0);
  if (!games || games % 6 !== 0 || !offCourt.代言.length) return [];
  const performance = Number(career.赛季统计.上场表现 ?? 50);
  return offCourt.代言
    .filter(item => item.状态 === '履约中')
    .map(item => ({
      id: `sponsor-check-${games}-${item.品牌}`,
      type: '代言' as const,
      title: `${item.品牌} 履约检查`,
      detail: performance >= 72
        ? `近期表现达到品牌预期，可进入奖金、续约或追加曝光讨论。`
        : `近期表现低于品牌预期，需要安排一次履约沟通；是否警告或调整合作由后续谈判决定。`,
      createdDate: league.日期,
    }));
}

function tradeHooks(career: CareerState, league: LeagueState): StoryHook[] {
  if (!isTradeDeadlinePeriod(league.日期)) return [];
  const interest = tradeInterestScore(career, league);
  if (interest < 45) return [];
  return [{
    id: `trade-window-${career.球队}-${league.赛季}`,
    type: '交易',
    title: '交易截止日前的询价',
    detail: `根据主角能力、潜力、球队战绩与角色估值，当前交易关注度约为 ${Math.round(interest)}/100。生成交易流言时必须服从球队需求与合同价值，不得由叙事模型凭空强制交易。`,
    createdDate: league.日期,
  }];
}

function contractHooks(career: CareerState, offCourt: OffCourtState, league: LeagueState): StoryHook[] {
  const games = Number(career.赛季统计.出场数 ?? 0);
  if (games < 60 && league.阶段 === '常规赛') return [];
  const quote = quoteContract(career, offCourt);
  return [{
    id: `contract-market-${league.赛季}-${career.球队}`,
    type: '合同',
    title: '合同市场估值',
    detail: `当前市场参考约 ${quote.years} 年、年薪 ${Math.round(quote.annualSalary / 10_000)} 万美元（市场分 ${quote.marketScore}）。这只是前端报价锚点，正式合同仍需玩家谈判确认。`,
    createdDate: league.日期,
  }];
}

function teamDynamicsHooks(career: CareerState, offCourt: OffCourtState, league: LeagueState): StoryHook[] {
  const teammateValues = Object.values(offCourt.队友好感);
  const avgAffinity = teammateValues.length ? teammateValues.reduce((a, b) => a + b, 0) / teammateValues.length : 50;
  const pct = winPct(league, career.球队);
  if (pct >= .42 && avgAffinity >= 38 && career.教练信任 >= 30) return [];
  return [{
    id: `locker-room-${league.赛程索引}`,
    type: '球队关系',
    title: '更衣室压力正在累积',
    detail: `近期球队胜率 ${Math.round(pct * 100)}%，队友平均好感 ${Math.round(avgAffinity)}，教练信任 ${Math.round(career.教练信任)}。下一次场外剧情可生成“矛盾苗头”，但不得预设具体冲突结果。`,
    createdDate: league.日期,
  }];
}

/**
 * 场下不是一个万能事件系统：每个 Manager 只检查自己的条件，
 * 最终汇总成轻量 StoryHook 供下一次场外叙事使用。
 */
export function collectOffCourtHooks(career: CareerState, offCourt: OffCourtState, league: LeagueState): StoryHook[] {
  return uniqueHooks(
    league.故事钩子,
    [
      ...sponsorshipHooks(career, offCourt, league),
      ...tradeHooks(career, league),
      ...contractHooks(career, offCourt, league),
      ...teamDynamicsHooks(career, offCourt, league),
    ],
  );
}

// 保留既有导出入口，实际康复判定统一交给 InjuryManager。
export { advanceInjuryRecovery } from './injury';
