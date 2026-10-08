import { describe, expect, it } from 'vitest';
import { buildFormation } from './positioning';
import { applyAutomaticRotation } from './rotation';
import { createRotationPlan } from './rotationPlan';
import { createLeagueState } from './season';
import { getPlayerAvailability } from './availability';
import { applyCoachReview } from './coachRole';
import { defaultTeamTactics } from './tendencies';
import type { MatchState, OnCourtStatus } from './types';
import type { CareerState } from '../utils/statReader';
import { getPlayer, getRoster, starterEntries } from '../utils/rosters';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function freshMatch(): MatchState {
  const homeEntries = starterEntries('GSW');
  const awayEntries = starterEntries('CLE');
  const homeAll = getRoster('GSW').map(p => p.name);
  const awayAll = getRoster('CLE').map(p => p.name);
  const match: MatchState = {
    进行中: true,
    对阵: { 主队: 'GSW', 客队: 'CLE' },
    节次: 1,
    剩余秒数: 720,
    投篮时钟: 24,
    比分: { 主: 0, 客: 0 },
    球权: '主',
    跳球胜方: '主',
    战术: { 主: defaultTeamTactics('GSW'), 客: defaultTeamTactics('CLE') },
    站位: buildFormation({
      offense: homeEntries,
      defense: awayEntries,
      offenseSide: '主',
      tactic: defaultTeamTactics('GSW').offense,
      defenseScheme: defaultTeamTactics('CLE').defense,
      ballHolder: homeEntries[0].key,
      attackRight: true,
    }),
    本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 7, 客: 7 },
    阵容: {
      主: { 场上: homeEntries.map(e => e.key), 替补: homeAll.filter(k => !homeEntries.some(e => e.key === k)) },
      客: { 场上: awayEntries.map(e => e.key), 替补: awayAll.filter(k => !awayEntries.some(e => e.key === k)) },
    },
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: '',
    球员状态: Object.fromEntries([...homeAll, ...awayAll].map(key => [key, status()])),
    回合摘要: '',
  };
  return match;
}

describe('RotationPlan / Availability / CoachRole', () => {
  it('球队Profile替代通用分钟表，并保持每队240分钟', () => {
    const match = freshMatch();
    const plan = createRotationPlan(match, getPlayer);
    expect(plan.主.profileId).toBe('GSW');
    expect(plan.主.targetMinutes['Stephen Curry']).toBeGreaterThan(plan.主.targetMinutes['Andrew Bogut']);
    expect(plan.主.closingPriority?.['Andre Iguodala']).toBeGreaterThan(plan.主.closingPriority?.['Andrew Bogut'] ?? 0);
    expect(Object.values(plan.主.targetMinutes).reduce((sum, value) => sum + value, 0)).toBeCloseTo(240, 5);
  });

  it('伤病休战会归零分钟，复出限制会成为硬上限', () => {
    const match = freshMatch();
    const league = createLeagueState('GSW');
    league.伤病 = [
      {
        球员: 'Stephen Curry', 类型: '脚踝扭伤', 严重度: '中等',
        受伤日期: league.日期, 预计复出: league.日期, 状态: '恢复中',
      },
      {
        球员: 'Klay Thompson', 类型: '腿筋紧张', 严重度: '轻微',
        受伤日期: league.日期, 预计复出: league.日期, 状态: '可复出', 分钟限制: 22,
      },
    ];
    const plan = createRotationPlan(match, getPlayer, { league });
    expect(getPlayerAvailability('Stephen Curry', league).available).toBe(false);
    expect(plan.主.targetMinutes['Stephen Curry']).toBe(0);
    expect(plan.主.targetMinutes['Klay Thompson']).toBeLessThanOrEqual(22);
    expect(Object.values(plan.主.targetMinutes).reduce((sum, value) => sum + value, 0)).toBeCloseTo(240, 5);
  });

  it('末节大比分自动进入硬垃圾时间并撤下一部分常规主力', () => {
    const match = freshMatch();
    match.轮换 = createRotationPlan(match, getPlayer);
    match.节次 = 4;
    match.剩余秒数 = 150;
    match.比分 = { 主: 118, 客: 94 };
    for (const key of match.阵容.主.场上) match.球员状态[key].上场秒数 = 32 * 60;
    const before = new Set(match.阵容.主.场上);
    const next = applyAutomaticRotation(match, getPlayer);
    expect(next.轮换?.主.contextMode).toBe('硬垃圾时间');
    expect(next.阵容.主.场上.some(key => !before.has(key))).toBe(true);
  });


  it('同样表现主要来自垃圾时间时，教练信任增幅会被降权', () => {
    const normalMatch = freshMatch();
    normalMatch.球员状态['Stephen Curry'].上场秒数 = 30 * 60;
    normalMatch.比分 = { 主: 115, 客: 100 };
    const garbageMatch = structuredClone(normalMatch);
    garbageMatch.球员状态['Stephen Curry'].垃圾时间秒数 = 30 * 60;

    const base = {
      球队: 'GSW',
      附身球员: 'Stephen Curry',
      球队角色: '轮换',
      教练信任: 40,
      教练评估: { 最近评分: [], 上次角色调整场次: 0 },
      能力: { overall: 90 },
    } as unknown as CareerState;

    const normal = applyCoachReview(base, normalMatch, 90, 1);
    const garbage = applyCoachReview(base, garbageMatch, 90, 1);
    expect(garbage.trustDelta).toBeLessThan(normal.trustDelta);
    expect(garbage.trustDelta).toBeGreaterThan(0);
  });

  it('连续五场高质量表现最多只把轮换球员提升一级', () => {
    const match = freshMatch();
    match.球员状态['Stephen Curry'].上场秒数 = 30 * 60;
    match.比分 = { 主: 110, 客: 100 };
    let career = {
      球队: 'GSW',
      附身球员: 'Stephen Curry',
      球队角色: '轮换',
      教练信任: 30,
      教练评估: { 最近评分: [], 上次角色调整场次: 0 },
      能力: { overall: 90 },
    } as unknown as CareerState;

    for (let game = 1; game <= 5; game++) {
      career = applyCoachReview(career, match, 95, game).career;
    }
    expect(career.球队角色).toBe('第六人');
    expect(career.教练信任).toBeGreaterThan(30);
    expect(career.教练评估?.上次角色调整场次).toBe(5);
  });
});
