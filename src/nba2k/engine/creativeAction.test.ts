import { describe, expect, it } from 'vitest';
import { allowedCreativeActions, buildCreativePlanPrompt, parseCreativeActionPlan } from './creativeAction';
import type { MatchState } from './types';

const match = (): MatchState => ({
  进行中: true,
  回合阶段: '常规回合',
  对阵: { 主队: 'CLE', 客队: 'BKN' },
  球权: '主',
  节次: 1,
  投篮时钟: 24,
  阵容: {
    主: { 场上: ['Hero', 'Kyrie Irving', 'P3', 'P4', 'P5'], 替补: [] },
    客: { 场上: ['A1', 'A2', 'A3', 'A4', 'A5'], 替补: [] },
  },
  站位: {
    主: [{ 球员: 'Hero', x: 25, y: 20, 持球: true }],
    客: [{ 球员: 'A1', x: 30, y: 20, 持球: false }],
  },
} as unknown as MatchState);

describe('NBA2K 创意动作解释边界', () => {
  it('按当前球权与持球状态限制动作，主角下场不能自由结算', () => {
    const m = match();
    expect(allowedCreativeActions(m, '主', 'Hero')).toContain('突破终结');
    m.站位.主[0].持球 = false;
    m.站位.主.push({ 球员: 'Kyrie Irving', x: 40, y: 30, 持球: true });
    expect(allowedCreativeActions(m, '主', 'Hero')).toEqual(['空切', '外移接球', '无球掩护']);
    m.球权 = '客';
    expect(allowedCreativeActions(m, '主', 'Hero')).toContain('封盖干扰');
    m.阵容.主.场上 = ['Other', 'Kyrie Irving', 'P3', 'P4', 'P5'];
    expect(() => allowedCreativeActions(m, '主', 'Hero')).toThrow('不在场上');
  });

  it('生成完整动作解释上下文，不让模型直接决断成败', () => {
    const m = match();
    const allowed = allowedCreativeActions(m, '主', 'Hero');
    const prompt = buildCreativePlanPrompt({ input: '我先假投再自抛自扣', match: m, protagonist: 'Hero', mySide: '主', allowedActions: allowed });
    expect(prompt).toContain('我先假投再自抛自扣');
    expect(prompt).toContain('突破终结');
    expect(prompt).toContain('不掷骰');
    expect(prompt).toContain('Kyrie Irving');
  });

  it('不会把玩家的高风险创意动作由模型降格成普通风险', () => {
    const plan = parseCreativeActionPlan(
      '{"action":"突破终结","partnerKey":null,"description":"先骗开主防，再自抛自扣","risk":"normal"}',
      ['突破终结'], ['Kyrie Irving'], '我假投后自抛自扣',
    );
    expect(plan.action).toBe('突破终结');
    expect(plan.difficultyPenalty).toBe(-8);
  });

  it('强制拒绝模型创造的非法动作、不在场队友、畸形 JSON', () => {
    expect(() => parseCreativeActionPlan('{"action":"作弊三分"}', ['突破终结'], [], '我作弊')).toThrow('不允许');
    expect(() => parseCreativeActionPlan('{"action":"安全传球","partnerKey":"Curry"}', ['安全传球'], ['Kyrie Irving'], '传给库里')).toThrow('非法');
    expect(() => parseCreativeActionPlan('not-json', ['突破终结'], [], '我突破')).toThrow('JSON');
  });

  it('无球传球类动作必须绑定合法队友，否则取消不写入', () => {
    expect(() => parseCreativeActionPlan(
      '{"action":"安全传球","partnerKey":null,"description":"传球"}',
      ['安全传球'], ['Kyrie Irving'], '传球',
    )).toThrow('明确配合队友');
  });
});
