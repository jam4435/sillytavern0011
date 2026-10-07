import type { PlayerData, StructuredTeamTactics } from './types';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const avg = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export interface CpuTendencies {
  usage: number;
  /** 主导一次进攻的倾向，和终结 usage 分开。 */
  initiation: number;
  handling: number;
  passing: number;
  rim: number;
  mid: number;
  three: number;
  post: number;
  pickRollHandler: number;
  pickRollScreener: number;
  spotUp: number;
  offBall: number;
  drawFoul: number;
}

/**
 * CPU 决策倾向不是另一套能力值。
 * 它只回答“这个球员更愿意做什么”，真正能不能做成仍由 43 项能力 + resolveAction 判定。
 */
export function deriveCpuTendencies(player: PlayerData): CpuTendencies {
  const a = player.attrs;
  const guardBias = player.pos === 'PG' ? 10 : player.pos === 'SG' ? 4 : player.pos === 'SF' ? 1 : player.pos === 'PF' ? -5 : -12;
  const bigBias = player.pos === 'PF' || player.pos === 'C' ? 10 : 0;
  const usage = clamp(
    8 +
    (player.overall - 70) * .45 +
    a.offensiveConsistency * .06 +
    a.shotIQ * .06 +
    a.ballControl * .04,
    8,
    34,
  );
  const handling = clamp(avg(a.ballControl, a.speed, a.acceleration, a.offensiveConsistency) + (player.pos === 'PG' || player.pos === 'SG' ? 8 : 0));
  const passing = clamp(avg(a.passVision, a.passIQ, a.passAccuracy, a.composure));
  const initiation = clamp(handling * .38 + passing * .34 + usage * .28 + guardBias);
  return {
    usage,
    initiation,
    handling,
    passing,
    rim: clamp(avg(a.drivingLayup, a.drivingDunk, a.contactDunk, a.standingLayup)),
    mid: clamp(avg(a.movingMid, a.standingMid, a.postFade)),
    three: clamp(avg(a.movingThree, a.standingThree, a.shotIQ)),
    post: clamp(avg(a.postControl, a.postHook, a.postFade, a.strength) + bigBias),
    pickRollHandler: clamp(avg(a.ballControl, a.passVision, a.passIQ, a.acceleration) + (player.pos === 'PG' || player.pos === 'SG' ? 8 : 0)),
    pickRollScreener: clamp(avg(a.strength, a.standingDunk, a.hands, a.passIQ) + bigBias),
    spotUp: clamp(avg(a.standingThree, a.standingMid, a.shotIQ, a.hands)),
    offBall: clamp(avg(a.speed, a.acceleration, a.hands, a.offensiveConsistency)),
    drawFoul: clamp(avg(a.drawFoul, a.drivingLayup, a.contactDunk)),
  };
}

/** 少量明星覆盖只校正“风格”，不篡改能力判定。以后可被真实 2K tendency 数据直接替换。 */
const STAR_TENDENCY_OVERRIDES: Record<string, Partial<CpuTendencies>> = {
  'Stephen Curry': { usage: 32, initiation: 98, three: 98, handling: 96, pickRollHandler: 94, offBall: 96, spotUp: 97 },
  'Klay Thompson': { usage: 25, initiation: 48, three: 96, handling: 62, passing: 58, spotUp: 98, offBall: 96 },
  'Draymond Green': { usage: 18, initiation: 84, passing: 90, pickRollScreener: 93, handling: 74, post: 64, three: 62 },
  'LeBron James': { usage: 32, initiation: 96, handling: 93, passing: 95, rim: 96, pickRollHandler: 93, post: 88 },
  'Kyrie Irving': { usage: 30, initiation: 96, handling: 98, rim: 90, mid: 90, three: 88, pickRollHandler: 92 },
  'Kevin Durant': { usage: 31, initiation: 88, handling: 90, rim: 91, mid: 97, three: 92, post: 88 },
  'Russell Westbrook': { usage: 34, initiation: 98, handling: 96, rim: 96, pickRollHandler: 94, three: 68 },
  'James Harden': { usage: 34, initiation: 99, handling: 96, passing: 93, rim: 91, three: 91, drawFoul: 99, pickRollHandler: 97 },
  'Chris Paul': { usage: 27, initiation: 99, handling: 96, passing: 98, mid: 94, pickRollHandler: 99 },
  'Kobe Bryant': { usage: 32, initiation: 88, handling: 89, mid: 95, post: 90, three: 82 },
  'Damian Lillard': { usage: 30, initiation: 96, handling: 93, three: 93, rim: 86, pickRollHandler: 93 },
  'Carmelo Anthony': { usage: 31, initiation: 72, mid: 96, post: 92, three: 86, passing: 62 },
};

export function cpuTendencies(player: PlayerData): CpuTendencies {
  return { ...deriveCpuTendencies(player), ...(STAR_TENDENCY_OVERRIDES[player.name] ?? {}) };
}

const BASE_TACTICS: StructuredTeamTactics = {
  offense: '基础',
  defense: '人盯人',
  pace: '标准',
  helpIntensity: 50,
  rebound: '均衡',
};

/**
 * 球队体系从“世界书风格描述”落成 CPU 可读的结构。
 * 只放明显、稳定的 2015-16 风格；未列球队继续使用基础体系。
 */
const TEAM_TACTICS: Record<string, Partial<StructuredTeamTactics>> = {
  GSW: { offense: '动态进攻', pace: '快', defense: '换防', helpIntensity: 68, rebound: '优先退防' },
  HOU: { offense: '五外', pace: '快', defense: '换防', helpIntensity: 55, rebound: '优先退防' },
  POR: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 48 },
  OKC: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 55, rebound: '冲抢' },
  SAS: { offense: '动态进攻', pace: '标准', defense: '人盯人', helpIntensity: 72, rebound: '均衡' },
  CLE: { offense: '四外一内', pace: '标准', defense: '人盯人', helpIntensity: 58 },
  LAC: { offense: '挡拆', pace: '快', defense: '人盯人', helpIntensity: 60 },
  MEM: { offense: '低位', pace: '慢', defense: '人盯人', helpIntensity: 70, rebound: '冲抢' },
  CHI: { offense: '基础', pace: '慢', defense: '人盯人', helpIntensity: 67, rebound: '冲抢' },
  MIA: { offense: '四外一内', pace: '慢', defense: '人盯人', helpIntensity: 65 },
  NYK: { offense: '低位', pace: '标准', defense: '人盯人', helpIntensity: 48 },
  LAL: { offense: '低位', pace: '标准', defense: '人盯人', helpIntensity: 45 },
};

export function defaultTeamTactics(teamId: string): StructuredTeamTactics {
  return { ...BASE_TACTICS, ...(TEAM_TACTICS[teamId] ?? {}) };
}
