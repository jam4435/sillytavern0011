import { describe, expect, it, vi } from 'vitest';
import {
  FACTION_LEARN_TIER_COST,
  buildFactionBetrayUserMessage,
  buildFactionPromotionUserMessage,
  buildJoinFactionUserMessage,
  buildLearnMartialArtUserMessage,
  buildRequestTaskUserMessage,
  getAllSects,
  getFactionCandidateLocations,
  getSectByName,
  quoteMartialArtLearn,
} from './factionManager';
import type { InitialAttributes, SectMartialNode } from '../types';

describe('factionManager', () => {
  it('应当正确加载全部 17 个门派势力', () => {
    const sects = getAllSects();
    expect(sects).toHaveLength(17);
    expect(sects.map(s => s.门派名称)).toContain('全真教');
    expect(sects.map(s => s.门派名称)).toContain('少林派');
    expect(sects.map(s => s.门派名称)).toContain('丐帮');
    expect(sects.map(s => s.门派名称)).toContain('桃花岛');
    expect(sects.map(s => s.门派名称)).toContain('白驼山庄');
    expect(sects.map(s => s.门派名称)).toContain('星宿派');
    expect(sects.map(s => s.门派名称)).toContain('蒙古军旅武学');
  });

  it('应当支持按名称或别名查找势力', () => {
    const quanzhen = getSectByName('全真教');
    expect(quanzhen).toBeDefined();
    expect(quanzhen?.体系类型).toBe('宗门');
    expect(quanzhen?.主峰驻地).toBe('大宋/终南山/重阳宫');

    const quanzhenAlias = getSectByName('全真派');
    expect(quanzhenAlias?.门派ID).toBe('全真教');
  });

  it('应当准确计算请教消耗与前置条件判定', () => {
    const quanzhen = getSectByName('全真教');
    expect(quanzhen).toBeDefined();

    const swordNode = quanzhen?.武学传承树.find(n => n.功法 === '全真剑法') as SectMartialNode;
    expect(swordNode).toBeDefined();

    const initialAttrs: InitialAttributes = {
      臂力: 10,
      根骨: 10,
      机敏: 10,
      悟性: 10,
      洞察: 10,
      风姿: 10,
      福缘: 0,
    };

    // 1. 前置功法玄门守一诀未掌握时，应当不可请教并给出明确原因
    const quoteWithoutPre = quoteMartialArtLearn({
      sectName: '全真教',
      node: swordNode,
      userCultivation: 1000,
      userContribution: 500,
      knownMartialArts: {},
      initialAttributes: initialAttrs,
      userRealm: '二流-初期',
    });
    expect(quoteWithoutPre.canLearn).toBe(false);
    expect(quoteWithoutPre.missingPrerequisites.length).toBeGreaterThan(0);
    expect(quoteWithoutPre.reason).toContain('需掌握');

    // 2. 已掌握前置功法，但贡献不足时
    const quoteLackContrib = quoteMartialArtLearn({
      sectName: '全真教',
      node: swordNode,
      userCultivation: 1000,
      userContribution: 10, // 基础需 50 贡献
      knownMartialArts: { 玄门守一诀: { 掌握程度: '略有小成' } },
      initialAttributes: initialAttrs,
      userRealm: '二流-初期',
    });
    expect(quoteLackContrib.canLearn).toBe(false);
    expect(quoteLackContrib.reason).toContain('贡献不足');

    // 3. 前置与资源全部充足时，应当允许请教
    const quoteSuccess = quoteMartialArtLearn({
      sectName: '全真教',
      node: swordNode,
      userCultivation: 500,
      userContribution: 100,
      knownMartialArts: { 玄门守一诀: { 掌握程度: '略有小成' } },
      initialAttributes: initialAttrs,
      userRealm: '二流-初期',
    });
    expect(quoteSuccess.canLearn).toBe(true);
    expect(quoteSuccess.cultivationCost).toBe(FACTION_LEARN_TIER_COST['基础'].cultivation);
    expect(quoteSuccess.contributionCost).toBe(FACTION_LEARN_TIER_COST['基础'].contribution);

    // 4. 自身已掌握时不可重复请教
    const quoteLearned = quoteMartialArtLearn({
      sectName: '全真教',
      node: swordNode,
      userCultivation: 500,
      userContribution: 100,
      knownMartialArts: {
        玄门守一诀: { 掌握程度: '略有小成' },
        全真剑法: { 掌握程度: '初窥门径' },
      },
      initialAttributes: initialAttrs,
      userRealm: '二流-初期',
    });
    expect(quoteLearned.isLearned).toBe(true);
    expect(quoteLearned.canLearn).toBe(false);
    expect(quoteLearned.reason).toBe('已掌握该功法');
  });

  it('应当提取合法的候选差事地点白名单', () => {
    const quanzhen = getSectByName('全真教')!;
    const candidateLocs = getFactionCandidateLocations(quanzhen);
    expect(candidateLocs.length).toBeGreaterThanOrEqual(1);
    expect(candidateLocs.every(loc => loc.startsWith('大宋/终南山'))).toBe(true);
  });

  it('构造拜师指令应附带标准 VariableInsert 块', () => {
    const quanzhen = getSectByName('全真教')!;
    const msg = buildJoinFactionUserMessage(quanzhen, '墨逸');
    expect(msg).toContain('墨逸前去拜入全真教门下');
    expect(msg).toContain('<VariableInsert>');
    expect(msg).toContain('"全真教"');
    expect(msg).toContain('"体系类型": "宗门"');
    expect(msg).toContain('</VariableInsert>');
  });

  it('构造接取差事指令应附带候选白名单与 VariableInsert 块', () => {
    const quanzhen = getSectByName('全真教')!;
    const msg = buildRequestTaskUserMessage(quanzhen, '墨逸', '三流-中期');
    expect(msg).toContain('墨逸前去查看势力差事');
    expect(msg).toContain('候选地点白名单');
    expect(msg).toContain('<VariableInsert>');
    expect(msg).toContain('"任务"');
    expect(msg).toContain('"任务执行情况": "未到达地点"');
    expect(msg).toContain('"类型": "杂物"'); // 验证物品分类为杂物而非货币
    expect(msg).toContain('</VariableInsert>');
  });

  it('构造向师请教与晋升指令应符合剧情演播契约', () => {
    const learnMsg = buildLearnMartialArtUserMessage('墨逸', '丘处机', '全真剑法', '基础');
    expect(learnMsg).toContain('墨逸向师尊丘处机请教《全真剑法》');

    const quanzhen = getSectByName('全真教')!;
    const promoteMsg = buildFactionPromotionUserMessage('墨逸', quanzhen, '入门弟子', '亲传弟子');
    expect(promoteMsg).toContain('申请晋升');
    expect(promoteMsg).toContain('<VariableEdit>');
    expect(promoteMsg).toContain('"身份": "亲传弟子"');

    const betrayMsg = buildFactionBetrayUserMessage('墨逸', quanzhen, '亲传弟子');
    expect(betrayMsg).toContain('宣布脱离全真教');
    expect(betrayMsg).toContain('"身份": "弃徒"');
    expect(betrayMsg).toContain('"状态": "叛门"');
  });
});
