import { describe, expect, it } from 'vitest';
import { ACTION_SPECS } from './attributes';
import { initialGroups, ratingsFromGroups } from './development';
import { resolveAction, shotProbability, tierOf } from './resolveAction';
import type { ActionType, MatchState, OnCourtStatus, PlayerData, SituationContext } from './types';

const status: OnCourtStatus = { 体力: 90, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0, 投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0, 进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0 };

function player(name: string, strength = 10): PlayerData {
  const groups = initialGroups('2K16模式', '均衡');
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) groups[key] = Math.max(4, Math.min(20, strength));
  return { name, cn: name, team: name.startsWith('H') ? 'GSW' : 'CLE', pos: 'SG', secondaryPos: null, body: { heightCm: 196, weightKg: 93, wingspanCm: 206 }, height_cm: 196, number: 1, overall: 75, attrs: ratingsFromGroups(groups, 88) };
}

function match(): MatchState {
  const home = ['Hero', 'H2', 'H3', 'H4', 'H5']; const away = ['A1', 'A2', 'A3', 'A4', 'A5'];
  return { 进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 700, 投篮时钟: 20, 比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主', 战术: { 主: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' }, 客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' } }, 站位: { 主: home.map((球员, index) => ({ 球员, x: 30, y: 20 + index * 10, ...(index === 0 ? { 持球: true } : {}) })), 客: away.map((球员, index) => ({ 球员, x: index === 0 ? 34 : index === 1 ? 38 : 60 + index * 5, y: index === 1 ? 28 : 20 + index * 10 })) }, 本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 }, 阵容: { 主: { 场上: home, 替补: [] }, 客: { 场上: away, 替补: [] } }, 回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '', 球员状态: {}, 回合摘要: '' };
}

const situation = (m: MatchState, help = 50): SituationContext => ({ isHome: true, isClutch: false, coverage: 'normal', mismatch: false, defenderFouls: 0, actorSpot: m.站位.主[0], defenderSpots: m.站位.客, teammateSpots: m.站位.主, offenseTactic: m.战术.主, defenseTactic: { ...m.战术.客, helpIntensity: help } });

function resolve(action: ActionType, rolls = [25, 25], help = 50) {
  const m = match(); const actor = player('Hero', 14); const defender = player('A1', 9); const defenders = m.阵容.客.场上.map(key => player(key, 9)); let cursor = 0;
  return resolveAction({ action, actor, actorStatus: status, defender, defenders, partner: player('H2', 12), partnerDefender: player('A2', 10), actionSide: '主', match: m, situation: situation(m, help), rollDice: () => rolls[Math.min(cursor++, rolls.length - 1)] });
}

describe('v3 multi-stage resolution', () => {
  it('五档判级和显示使用同一成功线', () => {
    expect(tierOf(10, 40)).toBe('大成功');
    expect(tierOf(40, 40)).toBe('成功');
    expect(tierOf(41, 40)).toBe('部分成功');
    expect(tierOf(56, 40)).toBe('失败');
    expect(tierOf(97, 95)).toBe('大失败');
  });
  it('突破与挡拆执行两阶段骰子', () => {
    expect(resolve('突破终结').stages.map(stage => stage.id)).toEqual(['separation', 'shot']);
    expect(resolve('挡拆突破').stages.map(stage => stage.id)).toEqual(['separation', 'execution']);
    expect(resolve('定点投篮').stages).toHaveLength(1);
  });
  it('全部情境动作都生成可执行合同和合法参考分支', () => {
    for (const action of Object.keys(ACTION_SPECS) as ActionType[]) {
      const result = resolve(action);
      expect(result.contract.branches.length).toBeGreaterThan(0);
      expect(result.contract.branches.some(branch => branch.id === result.contract.referenceBranchId)).toBe(true);
      expect(result.contract.allowedStatePaths).toContain('比赛.投篮时钟');
    }
  });
  it('协防强度与附近协防者真实压低突破/投篮成功线', () => {
    const low = resolve('突破终结', [20, 20], 0);
    const high = resolve('突破终结', [20, 20], 100);
    expect(high.finalRate).toBeLessThan(low.finalRate);
    expect(high.defenders.length).toBeGreaterThanOrEqual(low.defenders.length);
  });
  it('投篮概率随能力上升、干扰下降而单调改善并钳制', () => {
    const m = match(); const weak = player('Hero', 6); const strong = player('Hero', 16); const defender = player('A1', 10);
    const base = { action: '后撤步' as const, actorStatus: status, defender, defenders: [defender], partner: null, actionSide: '主' as const, match: m, situation: situation(m), rollDice: () => 50 };
    expect(shotProbability({ ...base, actor: strong }, 55, 0)).toBeGreaterThan(shotProbability({ ...base, actor: weak }, 55, 0));
    expect(shotProbability({ ...base, actor: strong }, 90, 2)).toBeLessThan(shotProbability({ ...base, actor: strong }, 55, 0));
    expect(shotProbability({ ...base, actor: weak }, 99, 20)).toBeGreaterThanOrEqual(.03);
  });
  it('大成功投篮提供命中/加罚合法分支，大失败不会产生模型自由得分', () => {
    const great = resolve('后撤步', [1]);
    expect(great.tier).toBe('大成功');
    expect(great.contract.branches.map(branch => branch.id)).toContain('and-one');
    const bad = resolve('后撤步', [99]);
    expect(bad.tier).toBe('大失败');
    expect(bad.contract.branches.every(branch => branch.scoreDelta.主 === 0 && branch.scoreDelta.客 === 0)).toBe(true);
  });
});
