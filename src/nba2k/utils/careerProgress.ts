import { GROUP_KEYS, badgeLevel, bodyCaps, hotZoneState, overallOf, ratingsFromGroups, upgradeCost } from '../engine/development';
import type { ActionResolution, MatchState, NormalizedSettlement, UpgradeGroupKey } from '../engine/types';
import type { CareerState, OffCourtState } from './statReader';

export function upgradeCareer(career: CareerState, group: UpgradeGroupKey): CareerState {
  const level = career.发展.groups[group];
  const cost = upgradeCost(level);
  const cap = Math.max(14, Math.min(20, 14 + Math.floor((career.能力.potential - 75) / 3)));
  if (level >= cap || career.发展.growthPoints < cost) return career;
  const groups = { ...career.发展.groups, [group]: level + 1 };
  let attrs = ratingsFromGroups(groups, career.能力.potential);
  if (career.自定义球员) attrs = bodyCaps(attrs, career.自定义球员.body, career.位置);
  return {
    ...career,
    能力: { overall: overallOf(attrs, career.位置), ...attrs },
    发展: { ...career.发展, groups, growthPoints: career.发展.growthPoints - cost },
    成长点: career.发展.growthPoints - cost,
  };
}

function addDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function trainCareer(career: CareerState, offCourt: OffCourtState): { career: CareerState; offCourt: OffCourtState; trained: boolean } {
  const today = offCourt.日程.日期;
  if (career.发展.lastTrainingDate === today) return { career, offCourt, trained: false };
  const points = career.发展.growthPoints + 1;
  return {
    trained: true,
    career: { ...career, 发展: { ...career.发展, growthPoints: points, lastTrainingDate: today }, 成长点: points },
    offCourt: { ...offCourt, 日程: { ...offCourt.日程, 日期: addDay(today) } },
  };
}

const BADGE_EVENTS: Record<string, { badge: string; rating: keyof CareerState['能力'] }[]> = {
  投篮: [{ badge: '高难度投篮', rating: 'movingThree' }, { badge: '抗干扰', rating: 'shotIQ' }],
  突破: [{ badge: '强力终结', rating: 'drivingLayup' }, { badge: '造犯规', rating: 'drawFoul' }],
  传球: [{ badge: '十美分', rating: 'passAccuracy' }],
  挡拆: [{ badge: '挡拆大师', rating: 'passIQ' }],
  防守: [{ badge: '外线封锁', rating: 'onBallDefenseIQ' }, { badge: '拦截者', rating: 'steal' }],
  篮板: [{ badge: '篮板精英', rating: 'defRebound' }, { badge: '卡位', rating: 'boxout' }],
};

function shotZone(action: string): string {
  if (action === '定点投篮') return '三分弧顶';
  if (action === '后撤步') return '三分右翼';
  if (action === '突破终结') return '篮下';
  if (action === '背身单打') return '油漆中';
  return '中投正面';
}

export function updateCareerDynamics(career: CareerState, resolution: ActionResolution, settlement: NormalizedSettlement): CareerState {
  const family = resolution.intent.family;
  const tendencies = structuredClone(career.倾向);
  const entry = tendencies.families[family] ?? { value: 50, samples: 0 };
  const nextSamples = entry.samples + 1;
  tendencies.families[family] = { value: Math.round((entry.value * (entry.samples + 10) + 100) / (nextSamples + 10)), samples: nextSamples };

  const badges = structuredClone(career.动态徽章);
  const successful = settlement.branch.id.includes('make') || settlement.branch.id.includes('won') || settlement.branch.id.includes('advantage') || settlement.branch.id.includes('turnover');
  if (successful) for (const event of BADGE_EVENTS[family] ?? []) {
    const current = badges.badges[event.badge] ?? { level: '未解锁' as const, progress: 0 };
    const progress = current.progress + 1;
    badges.badges[event.badge] = { progress, level: badgeLevel(progress, Number(career.能力[event.rating] ?? 0)) };
  }

  const hotZones = structuredClone(career.热区);
  if (family === '投篮' || resolution.action === '突破终结' || resolution.action === '突破急停' || resolution.action === '背身单打') {
    const zone = shotZone(resolution.action);
    const record = hotZones.zones[zone] ?? { makes: 0, attempts: 0, state: '中性' as const };
    const made = settlement.branch.statDeltas.some(delta => delta.player === career.附身球员 && delta.stat === '投篮命中' && delta.value > 0);
    const attempts = record.attempts + 1;
    const makes = record.makes + (made ? 1 : 0);
    hotZones.zones[zone] = { makes, attempts, state: hotZoneState(zone, makes, attempts) };
  }
  return { ...career, 倾向: tendencies, 动态徽章: badges, 热区: hotZones };
}

export function postGameGrowthPoints(performance: number): number {
  return performance < 60 ? 2 : performance < 70 ? 3 : performance < 80 ? 4 : performance < 90 ? 5 : 6;
}

export function finishCareerGame(career: CareerState, match: MatchState): CareerState {
  const status = match.球员状态[career.附身球员];
  if (!status) return career;
  const performance = Math.round(Math.max(0, Math.min(100,
    50 + status.得分 * .7 + status.篮板 * 1.2 + status.助攻 * 1.5 + status.抢断 * 2.5 + status.盖帽 * 2.2 - status.失误 * 2 - status.犯规 * .5,
  )));
  const reward = postGameGrowthPoints(performance);
  const previousGames = Number(career.赛季统计.出场数 ?? 0);
  const average = (key: string, value: number) => ((Number(career.赛季统计[key] ?? 0) * previousGames) + value) / (previousGames + 1);
  const points = career.发展.growthPoints + reward;
  return {
    ...career,
    赛程索引: career.赛程索引 + 1,
    发展: { ...career.发展, growthPoints: points }, 成长点: points,
    赛季统计: {
      ...career.赛季统计, 出场数: previousGames + 1,
      场均得分: Math.round(average('场均得分', status.得分) * 10) / 10,
      场均篮板: Math.round(average('场均篮板', status.篮板) * 10) / 10,
      场均助攻: Math.round(average('场均助攻', status.助攻) * 10) / 10,
      上场表现: performance,
    },
  };
}

export function assertDevelopmentGroups(groups: CareerState['发展']['groups']): boolean {
  return GROUP_KEYS.every(key => Number.isInteger(groups[key]) && groups[key] >= 0 && groups[key] <= 20);
}
