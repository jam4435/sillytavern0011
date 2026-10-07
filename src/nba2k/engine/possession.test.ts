import { describe, expect, it } from 'vitest';
import { initialGroups, ratingsFromGroups } from './development';
import { simulatePossession } from './possession';
import { simulateUntilInterruption } from './simulationMode';
import type { MatchState, OnCourtStatus, PlayerData } from './types';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function makePlayer(name: string, team: string, pos: PlayerData['pos'], level = 12): PlayerData {
  const groups = initialGroups('2K16模式', '均衡');
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) groups[key] = level;
  const attrs = ratingsFromGroups(groups, 88);
  return {
    name, cn: name, team, pos, secondaryPos: null,
    body: { heightCm: pos === 'C' ? 211 : 196, weightKg: pos === 'C' ? 115 : 92, wingspanCm: pos === 'C' ? 226 : 206 },
    height_cm: pos === 'C' ? 211 : 196, number: 1, overall: 82, attrs,
  };
}

const homeKeys = ['Hero', 'H2', 'H3', 'H4', 'H5'];
const awayKeys = ['A1', 'A2', 'A3', 'A4', 'A5'];
const players = new Map<string, PlayerData>([
  ['Hero', makePlayer('Hero', 'GSW', 'PG', 16)],
  ['H2', makePlayer('H2', 'GSW', 'SG', 14)],
  ['H3', makePlayer('H3', 'GSW', 'SF', 12)],
  ['H4', makePlayer('H4', 'GSW', 'PF', 12)],
  ['H5', makePlayer('H5', 'GSW', 'C', 12)],
  ['A1', makePlayer('A1', 'CLE', 'PG', 7)],
  ['A2', makePlayer('A2', 'CLE', 'SG', 7)],
  ['A3', makePlayer('A3', 'CLE', 'SF', 7)],
  ['A4', makePlayer('A4', 'CLE', 'PF', 7)],
  ['A5', makePlayer('A5', 'CLE', 'C', 7)],
]);
const resolvePlayer = (key: string) => players.get(key);

function match(): MatchState {
  return {
    进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 720, 投篮时钟: 24,
    比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主',
    战术: {
      主: { offense: '动态进攻', defense: '换防', pace: '快', helpIntensity: 60, rebound: '均衡' },
      客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 45, rebound: '均衡' },
    },
    站位: {
      主: homeKeys.map((球员, i) => ({ 球员, x: 24 + i * 8, y: 20 + i * 10, ...(i === 0 ? { 持球: true } : {}) })),
      客: awayKeys.map((球员, i) => ({ 球员, x: 34 + i * 8, y: 20 + i * 10 })),
    },
    本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 },
    阵容: { 主: { 场上: homeKeys, 替补: [] }, 客: { 场上: awayKeys, 替补: [] } },
    回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '',
    球员状态: Object.fromEntries([...homeKeys, ...awayKeys].map(key => [key, status()])), 回合摘要: '',
  };
}

describe('CPU PossessionEngine', () => {
  it('完整模拟一次投篮 possession 并推进比分/时钟/球权', () => {
    const before = match();
    const result = simulatePossession(before, resolvePlayer, {
      rng: () => .01,
      plan: { offense: '主', defense: '客', initiator: 'Hero', action: '定点投篮', partner: null, primaryDefender: 'A1', reason: 'test' },
    });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.match.剩余秒数).toBeLessThan(before.剩余秒数);
    expect(result.match.比分.主).toBeGreaterThan(0);
    expect(result.match.球权).toBe('客');
    expect(result.match.球员状态.Hero.投篮出手).toBeGreaterThan(0);
  });

  it('传球创造优势后会继续到终结，并能记助攻', () => {
    const result = simulatePossession(match(), resolvePlayer, {
      rng: () => .01,
      plan: { offense: '主', defense: '客', initiator: 'Hero', action: '安全传球', partner: 'H2', primaryDefender: 'A1', reason: 'test pass' },
    });
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(result.match.比分.主).toBeGreaterThan(0);
    expect(result.match.球员状态.Hero.助攻).toBeGreaterThanOrEqual(1);
  });

  it('精简比赛可连续模拟与主角无关的回合', () => {
    const benched = match();
    benched.阵容.主 = { 场上: ['H2', 'H3', 'H4', 'H5', 'BenchX'], 替补: ['Hero'] };
    players.set('BenchX', makePlayer('BenchX', 'GSW', 'PG', 10));
    benched.球员状态.BenchX = status();
    benched.站位.主 = benched.阵容.主.场上.map((球员, i) => ({ 球员, x: 24 + i * 8, y: 20 + i * 10, ...(i === 0 ? { 持球: true } : {}) }));
    const segment = simulateUntilInterruption(benched, '精简比赛', 'Hero', resolvePlayer, { rng: () => .37, maxPossessions: 2 });
    expect(segment.possessions).toBeGreaterThan(0);
    expect(segment.match.剩余秒数).toBeLessThan(benched.剩余秒数);
  });
});
