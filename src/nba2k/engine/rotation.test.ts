import { describe, expect, it } from 'vitest';
import { buildFormation } from './positioning';
import { applyAutomaticRotation, createRotationState } from './rotation';
import { defaultTeamTactics } from './tendencies';
import type { MatchState, OnCourtStatus } from './types';
import { getPlayer, getRoster } from '../utils/rosters';
import { buildDynamicDepthChart } from './depthChart';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function match(): MatchState {
  const homeRoster = getRoster('GSW');
  const awayRoster = getRoster('CLE');
  const homeEntries = buildDynamicDepthChart(homeRoster, { tactics: defaultTeamTactics('GSW') }).starters;
  const awayEntries = buildDynamicDepthChart(awayRoster, { tactics: defaultTeamTactics('CLE') }).starters;
  const homeOn = homeEntries.map(e => e.key);
  const awayOn = awayEntries.map(e => e.key);
  const homeAll = homeRoster.map(p => p.name);
  const awayAll = awayRoster.map(p => p.name);
  const base: MatchState = {
    进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 720, 投篮时钟: 24,
    比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主',
    战术: { 主: defaultTeamTactics('GSW'), 客: defaultTeamTactics('CLE') },
    站位: buildFormation({
      offense: homeEntries, defense: awayEntries, offenseSide: '主',
      tactic: defaultTeamTactics('GSW').offense, defenseScheme: defaultTeamTactics('CLE').defense,
      ballHolder: homeOn[0], attackRight: true,
    }),
    本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 },
    阵容: {
      主: { 场上: homeOn, 替补: homeAll.filter(k => !homeOn.includes(k)) },
      客: { 场上: awayOn, 替补: awayAll.filter(k => !awayOn.includes(k)) },
    },
    回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '',
    球员状态: Object.fromEntries([...homeAll, ...awayAll].map(k => [k, status()])), 回合摘要: '',
  };
  base.轮换 = createRotationState(base, getPlayer);
  return base;
}

describe('RotationEngine', () => {
  it('两队常规轮换目标分钟各自严格归一到240分钟', () => {
    const m = match();
    for (const side of ['主', '客'] as const) {
      const total = Object.values(m.轮换![side].targetMinutes).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(240, 5);
    }
  });

  it('球队角色可以覆盖主角目标分钟，其他人自动重新分配剩余时间', () => {
    const m = match();
    const rotation = createRotationState(m, getPlayer, { 主: { 'Stephen Curry': 18 } });
    expect(rotation.主.targetMinutes['Stephen Curry']).toBe(18);
    expect(Object.values(rotation.主.targetMinutes).reduce((sum, value) => sum + value, 0)).toBeCloseTo(240, 5);
  });

  it('打到首节后半段会让欠分钟的轮换球员进入场上', () => {
    const m = match();
    m.剩余秒数 = 240;
    for (const key of m.阵容.主.场上) m.球员状态[key].上场秒数 = 480;
    const before = new Set(m.阵容.主.场上);
    const next = applyAutomaticRotation(m, getPlayer);
    expect(next.阵容.主.场上.some(key => !before.has(key))).toBe(true);
  });

  it('犯规麻烦会优先保护球员，六犯者必须离场', () => {
    const m = match();
    m.剩余秒数 = 500;
    m.球员状态['Stephen Curry'].犯规 = 6;
    const next = applyAutomaticRotation(m, getPlayer);
    expect(next.阵容.主.场上).not.toContain('Stephen Curry');
  });
});
