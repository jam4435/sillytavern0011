import { describe, expect, it, vi } from 'vitest';
import { applySettlement, extractSettlementProposal, normalizeSettlement, settleAssistantResponse, validateSettlementProposal } from './settlement';
import type { MatchState, OnCourtStatus, SettlementContract } from './types';

const status = (): OnCourtStatus => ({ 体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0, 投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0, 进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0 });
const match = (): MatchState => { const h = ['Hero', 'H2', 'H3', 'H4', 'H5']; const a = ['A1', 'A2', 'A3', 'A4', 'A5']; return { 进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 100, 投篮时钟: 15, 比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主', 战术: { 主: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' }, 客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' } }, 站位: { 主: h.map((球员, i) => ({ 球员, x: 20, y: i * 20, ...(i === 0 ? { 持球: true } : {}) })), 客: a.map((球员, i) => ({ 球员, x: 70, y: i * 20 })) }, 本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 }, 阵容: { 主: { 场上: h, 替补: [] }, 客: { 场上: a, 替补: [] } }, 回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '', 球员状态: Object.fromEntries([...h, ...a].map(key => [key, status()])), 回合摘要: '' }; };
const contract = (): SettlementContract => ({ id: 'c1', intent: { action: '后撤步', family: '投篮', actor: 'Hero', partner: null }, stages: [], tier: '成功', branches: [{ id: 'made', label: '三分命中', scoreDelta: { 主: 3, 客: 0 }, possession: '客', nextPhase: '常规回合', statDeltas: [{ player: 'Hero', stat: '得分', value: 3 }, { player: 'Hero', stat: '投篮出手', value: 1 }, { player: 'Hero', stat: '投篮命中', value: 1 }, { player: 'Hero', stat: '三分出手', value: 1 }, { player: 'Hero', stat: '三分命中', value: 1 }], pending: { type: 'none' } }], referenceBranchId: 'made', clockSeconds: { min: 5, max: 12 }, shotClockSeconds: { min: 0, max: 24 }, staminaDelta: { actor: { min: -5, max: -2 } }, allowedPlayers: ['Hero', 'H2', 'H3', 'H4', 'H5', 'A1', 'A2', 'A3', 'A4', 'A5'], allowedStatePaths: ['比赛.比分'] });

describe('settlement contract', () => {
  it('解析、校验并用前端分支保持比分/个人得分一致', () => {
    const proposal = extractSettlementProposal('<NBASettlement>{"contractId":"c1","branchId":"made","clockSeconds":8,"shotClockSeconds":24,"staminaDelta":{"actor":-3},"summary":"命中"}</NBASettlement>');
    expect(validateSettlementProposal(proposal, contract())).toEqual([]);
    const normalized = normalizeSettlement(proposal, contract(), 'model');
    const next = applySettlement(match(), normalized, contract());
    expect(next.比分.主).toBe(3); expect(next.球员状态.Hero.得分).toBe(3); expect(next.球员状态.Hero.三分命中).toBe(1); expect(next.球权).toBe('客');
  });
  it('非法提案只修复一次，修复成功仍只返回一份规范assistant', async () => {
    const repair = vi.fn(async () => '<NBASettlement>{"contractId":"c1","branchId":"made","clockSeconds":8,"shotClockSeconds":24,"staminaDelta":{"actor":-3},"summary":"修复命中"}</NBASettlement>');
    const result = await settleAssistantResponse('叙事但无提案', contract(), match(), repair);
    expect(repair).toHaveBeenCalledTimes(1); expect(result.settlement.source).toBe('repair'); expect(result.assistantText.match(/<VariableEdit>/g)).toHaveLength(1);
  });
  it('修复仍非法时使用参考分支，不再二次请求', async () => {
    const repair = vi.fn(async () => '<NBASettlement>{}</NBASettlement>');
    const result = await settleAssistantResponse('bad', contract(), match(), repair);
    expect(repair).toHaveBeenCalledTimes(1); expect(result.settlement.source).toBe('fallback'); expect(result.nextMatch.比分.主).toBe(3);
  });
});
