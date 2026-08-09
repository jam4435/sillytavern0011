import { describe, expect, it } from 'vitest';
import { nba2kStatSchema } from './schema';
import { parseStatData } from './utils/statReader';

const status = () => ({
  体力: 100,
  得分: 0,
  篮板: 0,
  助攻: 0,
  抢断: 0,
  盖帽: 0,
  失误: 0,
  犯规: 0,
  手感: '平' as const,
  连续命中: 0,
  连续打铁: 0,
});

function validStat() {
  const home = ['H1', 'H2', 'H3', 'H4', 'H5'];
  const away = ['A1', 'A2', 'A3', 'A4', 'A5'];
  return {
    版本: 2 as const,
    生涯: null,
    场外: null,
    比赛: {
      进行中: true,
      对阵: { 主队: 'GSW', 客队: 'CLE' },
      节次: 1,
      剩余秒数: 720,
      比分: { 主: 0, 客: 0 },
      球权: '主' as const,
      战术: { 主: '基础', 客: '人盯人' },
      站位: {
        主: home.map((球员, index) => ({ 球员, x: 10 + index * 5, y: 20 + index * 10, ...(index === 0 ? { 持球: true } : {}) })),
        客: away.map((球员, index) => ({ 球员, x: 70 + index * 5, y: 20 + index * 10 })),
      },
      本节球队犯规: { 主: 0, 客: 0 },
      暂停: { 主: 7, 客: 7 },
      阵容: {
        主: { 场上: home, 替补: ['HB1', 'HB2'] },
        客: { 场上: away, 替补: ['AB1', 'AB2'] },
      },
      回合阶段: '常规回合' as const,
      回合情境: '比赛开始',
      球员状态: Object.fromEntries([...home, ...away].map(key => [key, status()])),
      回合摘要: '跳球完成',
    },
  };
}

describe('nba2kStatSchema', () => {
  it('接受完整的版本 2 状态', () => {
    expect(nba2kStatSchema.safeParse(validStat()).success).toBe(true);
    const parsed = parseStatData(validStat());
    expect(parsed.validationErrors).toEqual([]);
    expect(parsed.比赛?.阵容.主.场上).toHaveLength(5);
  });

  it('拒绝旧版本且不把旧数据暴露给 UI', () => {
    const old = { ...validStat(), 版本: 1 };
    const parsed = parseStatData(old);
    expect(parsed.比赛).toBeNull();
    expect(parsed.validationErrors.join('\n')).toContain('版本');
  });

  it.each([
    ['体力越界', (data: ReturnType<typeof validStat>) => { data.比赛.球员状态.H1.体力 = 101; }],
    ['坐标越界', (data: ReturnType<typeof validStat>) => { data.比赛.站位.主[0].x = -1; }],
    ['犯规越界', (data: ReturnType<typeof validStat>) => { data.比赛.球员状态.H1.犯规 = 7; }],
    ['非法阶段', (data: ReturnType<typeof validStat>) => { (data.比赛 as any).回合阶段 = '罚球'; }],
    ['场上不足五人', (data: ReturnType<typeof validStat>) => { data.比赛.阵容.主.场上.pop(); }],
    ['阵容重复', (data: ReturnType<typeof validStat>) => { data.比赛.阵容.主.替补.push('H1'); }],
  ])('拒绝%s', (_name, mutate) => {
    const data = validStat();
    mutate(data);
    expect(nba2kStatSchema.safeParse(data).success).toBe(false);
  });

  it('缺少球员连续命中/打铁字段时报告错误', () => {
    const data = validStat();
    delete (data.比赛.球员状态.H1 as Partial<ReturnType<typeof status>>).连续命中;
    delete (data.比赛.球员状态.H1 as Partial<ReturnType<typeof status>>).连续打铁;
    const parsed = parseStatData(data);
    expect(parsed.validationErrors.some(issue => issue.includes('连续命中'))).toBe(true);
    expect(parsed.validationErrors.some(issue => issue.includes('连续打铁'))).toBe(true);
  });

  it('空 stat_data 是合法未建档状态', () => {
    expect(parseStatData({})).toEqual({
      版本: 2,
      比赛: null,
      生涯: null,
      场外: null,
      validationErrors: [],
    });
  });
});
