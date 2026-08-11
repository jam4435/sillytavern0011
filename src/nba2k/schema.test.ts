import { describe, expect, it } from 'vitest';
import { createDevelopment, defaultBadges, defaultBody, defaultHotZones, defaultTendencies, initialGroups } from './engine/development';
import type { MatchState, OnCourtStatus } from './engine/types';
import { nba2kStatSchema } from './schema';
import { buildCustomPlayer } from './utils/customPlayer';
import { parseStatData } from './utils/statReader';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function validStat() {
  const groups = initialGroups('2K16模式', '均衡');
  const body = defaultBody('2K16模式', 'SG');
  const player = buildCustomPlayer({ name: '主角', pos: 'SG', mode: '2K16模式', style: '均衡', archetypeId: 'all_round', height_cm: body.heightCm, weight_kg: body.weightKg, wingspan_cm: body.wingspanCm, groups, number: 8, teamId: 'GSW' });
  const home = ['MyPlayer_主角', 'H2', 'H3', 'H4', 'H5']; const away = ['A1', 'A2', 'A3', 'A4', 'A5'];
  const match: MatchState = {
    进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 720, 投篮时钟: 24,
    比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主',
    战术: { 主: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' }, 客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' } },
    站位: { 主: home.map((球员, index) => ({ 球员, x: 20 + index * 8, y: 20 + index * 10, ...(index === 0 ? { 持球: true } : {}) })), 客: away.map((球员, index) => ({ 球员, x: 60 + index * 5, y: 20 + index * 10 })) },
    本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 }, 阵容: { 主: { 场上: home, 替补: [] }, 客: { 场上: away, 替补: [] } },
    回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '', 球员状态: Object.fromEntries([...home, ...away].map(key => [key, status()])), 回合摘要: '',
  };
  return {
    版本: 3 as const, 比赛: match,
    生涯: { 姓名: '主角', 球队: 'GSW', 位置: 'SG' as const, 附身球员: player.name, 自定义球员: player, 赛季: '2015-16', 赛程索引: 1, 能力: { overall: player.overall, ...player.attrs }, 发展: createDevelopment('2K16模式', '均衡', groups), 倾向: defaultTendencies(), 动态徽章: defaultBadges(), 热区: defaultHotZones(), 教练信任: 30, 球队角色: '轮换' as const, 赛季统计: { 出场数: 0 }, 成长点: 0 },
    场外: { 资金: 0, 声望: 0, 粉丝: 0, 经纪人: null, 代言: [], 合同: null, 关系: [], 队友好感: {}, 日程: { 日期: '2015-10-27', 下一场: 'vs CLE', 待办: [] } },
  };
}

describe('v3 schema', () => {
  it('接受完整v3并拒绝旧版本', () => {
    expect(nba2kStatSchema.safeParse(validStat()).success).toBe(true);
    expect(parseStatData(validStat()).validationErrors).toEqual([]);
    expect(parseStatData({ ...validStat(), 版本: 2 }).validationErrors.join('')).toContain('3');
  });
  it('空 stat_data 是合法未建档', () => expect(parseStatData({})).toEqual({ 版本: 3, 比赛: null, 生涯: null, 场外: null, validationErrors: [] }));
  it('拦截越界和统计不变量', () => {
    const raw = validStat();
    raw.比赛.球员状态['MyPlayer_主角'].投篮命中 = 2;
    raw.比赛.球员状态['MyPlayer_主角'].投篮出手 = 1;
    expect(nba2kStatSchema.safeParse(raw).success).toBe(false);
  });
  it('篮板/罚球阶段必须带对应待处理情境', () => {
    const raw = validStat();
    raw.比赛.回合阶段 = '篮板争抢';
    expect(nba2kStatSchema.safeParse(raw).success).toBe(false);
    raw.比赛.待处理情境 = { type: 'rebound', shootingSide: '主', shooter: 'MyPlayer_主角', zone: '篮下' };
    expect(nba2kStatSchema.safeParse(raw).success).toBe(true);
  });
});
