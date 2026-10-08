import type { BodyProfile, PlayerData, Position, UpgradeGroupState } from './types';
import { BODY_BOUNDS_2K16, RATING_KEYS, bodyCaps, initialGroups, overallOf, ratingsFromGroups } from './development';
import { evolveRatingsOneSeason, retirementStatusFor } from './lifecycle';
import type { LeagueState, StandingRecord } from './season';
import type { LeagueContract } from './transactionTypes';
import { evaluateTeamNeeds, type TeamNeeds } from './transactions';
import { TEAMS } from '../data/teams';

export type RookieTemplate =
  | '神射手'
  | '组织核心'
  | '突破手'
  | '双向侧翼'
  | '禁区终结者'
  | '护框中锋'
  | '空间内线'
  | '全能前锋';

export interface GeneratedPlayerSeed {
  key: string;
  displayName: string;
  entrySeason: number;
  ageAtEntry: number;
  peakAge: number;
  pos: Position;
  secondaryPos: Position | null;
  body: BodyProfile;
  potential: number;
  targetOverall: number;
  template: RookieTemplate;
  seed: string;
}

export interface DraftPickRecord {
  season: string;
  entrySeason: number;
  round: 1 | 2;
  pick: number;
  overallPick: number;
  teamId: string;
  playerKey: string;
  playerName: string;
  pos: Position;
  template: RookieTemplate;
  overallAtDraft: number;
  potential: number;
}

export interface DraftResult {
  league: LeagueState;
  picks: DraftPickRecord[];
}

type RosterGetter = (teamId: string, league: LeagueState) => PlayerData[];

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const FIRST_NAMES = [
  'Jalen','Marcus','Devin','Malik','Jordan','Cameron','Isaiah','Darius','Miles','Tyler',
  'Aaron','Jaylen','Noah','Evan','Caleb','Trevor','Andre','Damian','Xavier','Julian',
  'Micah','Terrell','Nolan','Bryce','Kendrick','Keon','Desmond','Trey','Jabari','Cole',
];
const LAST_NAMES = [
  'Carter','Bennett','Hayes','Foster','Reed','Brooks','Coleman','Price','Warren','Parker',
  'Bryant','Simmons','Morris','Powell','Griffin','Hunter','Murray','Porter','Bishop','Harris',
  'Lawson','Banks','Holloway','Jefferson','Wells','Vaughn','Manning','Cross','Hampton','Stone',
];

function hash(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function unit(seed: string): number {
  return (hash(seed) % 100003) / 100002;
}

function pickIndex(seed: string, length: number): number {
  return Math.min(length - 1, Math.floor(unit(seed) * length));
}

function jitter(seed: string, span: number): number {
  return (unit(seed) * 2 - 1) * span;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positionFor(seed: string): Position {
  // 轻微增加侧翼/后卫供给，避免多年后联盟被中锋填满。
  const roll = unit(seed);
  if (roll < .21) return 'PG';
  if (roll < .43) return 'SG';
  if (roll < .65) return 'SF';
  if (roll < .84) return 'PF';
  return 'C';
}

function secondaryFor(pos: Position, seed: string): Position | null {
  if (unit(seed) < .34) return null;
  if (pos === 'PG') return 'SG';
  if (pos === 'SG') return unit(seed + ':dir') < .5 ? 'PG' : 'SF';
  if (pos === 'SF') return unit(seed + ':dir') < .5 ? 'SG' : 'PF';
  if (pos === 'PF') return unit(seed + ':dir') < .5 ? 'SF' : 'C';
  return 'PF';
}

const TEMPLATE_PRESET: Record<RookieTemplate, string> = {
  神射手: 'sharpshooter',
  组织核心: 'playmaker',
  突破手: 'slasher',
  双向侧翼: 'three_and_d',
  禁区终结者: 'paint_beast',
  护框中锋: 'paint_beast',
  空间内线: 'all_round',
  全能前锋: 'all_round',
};

function templatesFor(pos: Position): RookieTemplate[] {
  if (pos === 'PG') return ['组织核心', '突破手', '神射手'];
  if (pos === 'SG') return ['神射手', '突破手', '双向侧翼', '组织核心'];
  if (pos === 'SF') return ['双向侧翼', '全能前锋', '神射手', '突破手'];
  if (pos === 'PF') return ['全能前锋', '空间内线', '禁区终结者', '双向侧翼'];
  return ['护框中锋', '禁区终结者', '空间内线'];
}

function groupsFor(template: RookieTemplate, seed: string): UpgradeGroupState {
  const base = initialGroups('自由模拟模式', '均衡', TEMPLATE_PRESET[template]);
  const next = { ...base };
  // 用成对微调保持总预算大致稳定，同时让同模板不是复制人。
  const keys = Object.keys(next) as (keyof UpgradeGroupState)[];
  for (let i = 0; i < 3; i++) {
    const a = keys[pickIndex(`${seed}:ga:${i}`, keys.length)];
    const b = keys[pickIndex(`${seed}:gb:${i}`, keys.length)];
    if (a === b) continue;
    if (next[a] < 15 && next[b] > 4) {
      next[a] += 1;
      next[b] -= 1;
    }
  }
  if (template === '护框中锋') {
    next.defending = Math.min(15, next.defending + 1);
    next.threePoint = Math.max(4, next.threePoint - 1);
  } else if (template === '空间内线') {
    next.threePoint = Math.min(14, next.threePoint + 2);
    next.postScoring = Math.max(4, next.postScoring - 1);
    next.rebounding = Math.max(4, next.rebounding - 1);
  } else if (template === '全能前锋') {
    next.playmaking = Math.min(14, next.playmaking + 1);
    next.offDribble = Math.min(14, next.offDribble + 1);
    next.postScoring = Math.max(4, next.postScoring - 1);
    next.strength = Math.max(4, next.strength - 1);
  }
  return next;
}

function bodyFor(pos: Position, seed: string): BodyProfile {
  const bounds = BODY_BOUNDS_2K16[pos];
  const height = Math.round(clamp(bounds.height.def + jitter(seed + ':h', 5), bounds.height.min, bounds.height.max));
  const weight = Math.round(clamp(bounds.weight.def + jitter(seed + ':w', 10), bounds.weight.min, bounds.weight.max));
  const offset = clamp(bounds.wingspanOffset.def + jitter(seed + ':ws', 7), bounds.wingspanOffset.min, bounds.wingspanOffset.max);
  return { heightCm: height, weightKg: weight, wingspanCm: Math.round(height + offset) };
}

function prospectTalent(index: number, seed: string): { overall: number; potential: number } {
  // 先按大致选秀层级生成，再用随机噪声制造跌落/黑马。
  const rank = index + 1;
  const baseOverall = rank <= 3 ? 78 : rank <= 14 ? 74 : rank <= 30 ? 71 : 68;
  const basePotential = rank <= 3 ? 93 : rank <= 14 ? 89 : rank <= 30 ? 84 : 79;
  const overall = Math.round(clamp(baseOverall + jitter(seed + ':ovr', rank <= 14 ? 3.5 : 4.5), 64, 82));
  const potential = Math.round(clamp(
    Math.max(overall + 3, basePotential + jitter(seed + ':pot', rank <= 14 ? 5 : 7)),
    72,
    97,
  ));
  return { overall, potential };
}

function shiftToOverall(player: PlayerData, target: number): PlayerData {
  const current = overallOf(player.attrs, player.pos);
  const shift = target - current;
  const attrs = { ...player.attrs };
  for (const key of RATING_KEYS) {
    if (key === 'potential') continue;
    attrs[key] = Math.round(clamp(attrs[key] + shift, 25, 99));
  }
  attrs.potential = player.attrs.potential;
  return { ...player, overall: overallOf(attrs, player.pos), attrs };
}

export function playerFromGeneratedSeed(seed: GeneratedPlayerSeed): PlayerData {
  const groups = groupsFor(seed.template, seed.seed);
  let attrs = ratingsFromGroups(groups, seed.potential);
  attrs = bodyCaps(attrs, seed.body, seed.pos);
  let player: PlayerData = {
    name: seed.key,
    cn: seed.displayName,
    team: 'FA',
    pos: seed.pos,
    secondaryPos: seed.secondaryPos,
    body: seed.body,
    height_cm: seed.body.heightCm,
    number: Math.floor(unit(seed.seed + ':number') * 100),
    overall: overallOf(attrs, seed.pos),
    attrs,
  };
  player = shiftToOverall(player, seed.targetOverall);
  return player;
}

export function projectGeneratedPlayer(
  seed: GeneratedPlayerSeed,
  currentSeason: number,
  severeInjuries = 0,
): { player: PlayerData; age: number; retirementStatus: '现役' | '考虑退役' | '退役' } {
  let player = playerFromGeneratedSeed(seed);
  let attrs = { ...player.attrs };
  let age = seed.ageAtEntry;
  const seasons = Math.max(0, currentSeason - seed.entrySeason);
  for (let year = 0; year < seasons; year++) {
    attrs = evolveRatingsOneSeason(attrs, age, seed.peakAge, `${seed.key}:generated:${year}`);
    age += 1;
  }
  const overallBase = overallOf(player.attrs, player.pos);
  const overallNow = overallOf(attrs, player.pos);
  const overall = clamp(player.overall + (overallNow - overallBase), 40, 99);
  const retirementStatus = retirementStatusFor({
    age,
    overall,
    durability: attrs.durability,
    severeInjuries,
  });
  return { player: { ...player, overall, attrs }, age, retirementStatus };
}

export function generateDraftClass(currentSeason: number, count = 60): GeneratedPlayerSeed[] {
  const entrySeason = currentSeason + 1;
  const usedNames = new Set<string>();
  return Array.from({ length: count }, (_, index) => {
    const root = `draft:${entrySeason}:${index + 1}`;
    const pos = positionFor(root + ':pos');
    const availableTemplates = templatesFor(pos);
    const template = availableTemplates[pickIndex(root + ':template', availableTemplates.length)];
    const talent = prospectTalent(index, root);
    const ageAtEntry = 19 + pickIndex(root + ':age', 4);
    const peakAge = clamp(
      (pos === 'PG' || pos === 'SG' ? 27 : pos === 'SF' ? 28 : 29) + Math.round(jitter(root + ':peak', 1)),
      25,
      31,
    );
    const first = FIRST_NAMES[pickIndex(root + ':first', FIRST_NAMES.length)];
    const last = LAST_NAMES[pickIndex(root + ':last', LAST_NAMES.length)];
    const baseName = `${first} ${last}`;
    let displayName = baseName;
    let suffix = 2;
    while (usedNames.has(displayName)) displayName = `${baseName} ${suffix++}`;
    usedNames.add(displayName);
    return {
      key: `Generated_${entrySeason}_${String(index + 1).padStart(2, '0')}_${first}_${last}`,
      displayName,
      entrySeason,
      ageAtEntry,
      peakAge,
      pos,
      secondaryPos: secondaryFor(pos, root + ':secondary'),
      body: bodyFor(pos, root),
      potential: talent.potential,
      targetOverall: talent.overall,
      template,
      seed: root,
    };
  });
}

function winPct(record: StandingRecord | undefined): number {
  if (!record) return .5;
  const games = record.胜 + record.负;
  return games ? record.胜 / games : .5;
}

export function draftOrder(league: LeagueState): string[] {
  return TEAMS
    .slice()
    .sort((a, b) => {
      const ar = league.战绩[a.id];
      const br = league.战绩[b.id];
      const pctDiff = winPct(ar) - winPct(br);
      if (Math.abs(pctDiff) > .0001) return pctDiff;
      const aDiff = (ar?.得分 ?? 0) - (ar?.失分 ?? 0);
      const bDiff = (br?.得分 ?? 0) - (br?.失分 ?? 0);
      return aDiff - bDiff || a.id.localeCompare(b.id);
    })
    .map(team => team.id);
}

function prospectBoardValue(seed: GeneratedPlayerSeed): number {
  return seed.targetOverall * .55 + seed.potential * .45;
}

function fitForNeeds(seed: GeneratedPlayerSeed, needs: TeamNeeds): number {
  const primary = needs.byPosition[seed.pos];
  const secondary = seed.secondaryPos ? needs.byPosition[seed.secondaryPos] : primary;
  return Math.max(primary, secondary * .9);
}

function reduceNeedAfterDraft(needs: TeamNeeds, seed: GeneratedPlayerSeed): TeamNeeds {
  const byPosition = { ...needs.byPosition };
  const impact = clamp(6 + (seed.targetOverall - 64) * .72 + (seed.potential - 78) * .18, 6, 20);
  byPosition[seed.pos] = Math.max(8, byPosition[seed.pos] - impact);
  if (seed.secondaryPos) byPosition[seed.secondaryPos] = Math.max(8, byPosition[seed.secondaryPos] - impact * .55);
  const strongestNeed = [...POSITIONS].sort((a, b) => byPosition[b] - byPosition[a])[0];
  return { byPosition, strongestNeed, strongestNeedScore: byPosition[strongestNeed] };
}

function rookieSalary(overallPick: number, entrySeason: number): number {
  const firstYear = overallPick <= 30
    ? 1_100_000 + Math.pow(31 - overallPick, 1.35) * 90_000
    : 850_000 + (60 - overallPick) * 12_000;
  const inflation = Math.pow(1.045, Math.max(0, entrySeason));
  return Math.round(firstYear * inflation / 25_000) * 25_000;
}

function rookieContract(seed: GeneratedPlayerSeed, teamId: string, overallPick: number): LeagueContract {
  const years = overallPick <= 30 ? 4 : 2;
  return {
    playerKey: seed.key,
    teamId,
    signedSeason: seed.entrySeason,
    expiresAfterSeason: seed.entrySeason + years - 1,
    annualSalary: rookieSalary(overallPick, seed.entrySeason),
    years,
    status: '有效',
  };
}

export function runAnnualDraft(
  league: LeagueState,
  getRoster: RosterGetter,
): DraftResult {
  const entrySeason = league.赛季序号 + 1;
  if (league.选秀历史.some(pick => pick.entrySeason === entrySeason)) {
    return { league, picks: league.选秀历史.filter(pick => pick.entrySeason === entrySeason) };
  }

  const seeds = generateDraftClass(league.赛季序号, 60);
  const available = new Map(seeds.map(seed => [seed.key, seed]));
  const order = draftOrder(league);
  const picks: DraftPickRecord[] = [];
  // 一届选秀只扫描一次30队Roster；每签后局部降低该队对应位置需求。
  // 避免随着程序化球员累积，对每个候选人反复重建整个联盟Roster。
  const needsByTeam = Object.fromEntries(
    TEAMS.map(team => [team.id, evaluateTeamNeeds(team.id, league, getRoster)]),
  ) as Record<string, TeamNeeds>;
  let next = {
    ...league,
    生成球员: { ...league.生成球员, ...Object.fromEntries(seeds.map(seed => [seed.key, seed])) },
  };

  for (let overallPick = 1; overallPick <= 60; overallPick++) {
    const teamId = order[(overallPick - 1) % 30];
    const candidates = [...available.values()]
      .sort((a, b) => prospectBoardValue(b) - prospectBoardValue(a))
      .slice(0, overallPick <= 14 ? 9 : 7);

    const chosen = candidates
      .map(seed => ({
        seed,
        score:
          prospectBoardValue(seed) * .78 +
          fitForNeeds(seed, needsByTeam[teamId]) * .22 +
          jitter(`${seed.key}:${teamId}:draft-fit`, 2.5),
      }))
      .sort((a, b) => b.score - a.score)[0]?.seed;

    if (!chosen) break;
    available.delete(chosen.key);
    const round = overallPick <= 30 ? 1 : 2;
    const pick = round === 1 ? overallPick : overallPick - 30;
    const player = playerFromGeneratedSeed(chosen);
    const record: DraftPickRecord = {
      season: league.赛季,
      entrySeason,
      round,
      pick,
      overallPick,
      teamId,
      playerKey: chosen.key,
      playerName: chosen.displayName,
      pos: chosen.pos,
      template: chosen.template,
      overallAtDraft: player.overall,
      potential: chosen.potential,
    };
    picks.push(record);
    next = {
      ...next,
      球员归属: { ...next.球员归属, [chosen.key]: teamId },
      合同册: { ...next.合同册, [chosen.key]: rookieContract(chosen, teamId, overallPick) },
    };
    needsByTeam[teamId] = reduceNeedAfterDraft(needsByTeam[teamId], chosen);
  }

  next = {
    ...next,
    选秀历史: [...next.选秀历史, ...picks].slice(-600),
  };
  return { league: next, picks };
}
