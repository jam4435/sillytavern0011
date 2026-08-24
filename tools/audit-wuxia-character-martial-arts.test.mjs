import { describe, expect, it } from 'vitest';

import {
  canonicalCharacterName,
  canonicalMartialArtName,
  createCompletionCandidatesDocument,
  createMartialArtsAuditDocument,
  isActiveUseSentence,
  materializeCharacterMartialArts,
  normalizeMastery,
} from '../scripts/lib/wuxia-character-martial-arts.mjs';
import {
  createSectAssignmentCandidatesDocument,
  createSectLineageDocument,
  validateSectReviewDocuments,
} from '../scripts/lib/wuxia-sect-martial-arts.mjs';

function event(runtimeKey, effectHour, definition, kind = 'ordinary') {
  const time = { 年: 1200, 月: 1, 日: effectHour, 时: 0 };
  return {
    runtimeKey,
    sourceName: `${runtimeKey}.yaml`,
    kind,
    series: '测试',
    chapterNumber: 1,
    sequence: effectHour,
    triggerTime: time,
    triggerHour: effectHour,
    endTime: kind === 'ordinary' ? time : null,
    effectTime: time,
    effectHour,
    conditional: false,
    definition,
  };
}

describe('wuxia character martial arts audit', () => {
  it('规范化已确认人物别名、功法别名与带说明的掌握程度', () => {
    expect(canonicalCharacterName('完颜康')).toBe('杨康');
    expect(canonicalMartialArtName('双手互搏')).toBe('左右互搏之术');
    expect(canonicalMartialArtName('落英神剑掌')).toBe('落英神剑掌法');
    expect(isActiveUseSentence('甲急问乙，乙说要他以测试剑法来换东西', ['甲'], '测试剑法')).toBe(false);
    expect(normalizeMastery('融会贯通（临敌纯熟）')).toBe('融会贯通');
    expect(normalizeMastery('略有所成')).toBe('略有小成');
  });

  it('按生效时间记录获得、升级和整块删除', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: {
              境界: '二流-初期',
              身份: { 剑客: '江湖剑客' },
              功法: { 测试剑法: { 掌握程度: '初窥门径' } },
            },
          },
        },
        'debut',
      ),
      event('测试第一回01-升级', 2, {
        update: { 甲: { 功法: { 测试剑法: { 掌握程度: '融会贯通' } } } },
      }),
      event('测试第一回02-删除', 3, { delete: { 甲: { 功法: {} } } }),
    ]);
    const database = { 功法: [{ 功法名称: '测试剑法', 功法描述: '甲所用剑法' }] };
    const audit = createMartialArtsAuditDocument(materialized, database, { eventCount: 3 });
    const art = audit.角色列表[0].功法记录[0];
    expect(art.获得事件).toHaveLength(1);
    expect(art.升级或更新事件[0].操作).toBe('升级');
    expect(art.删除事件).toHaveLength(1);
    expect(art.当前存在).toBe(false);
  });

  it('后续获得功法者不进入完全缺失候选，凡人合理空值被排除', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: { 境界: '二流-初期', 身份: { 剑客: '江湖剑客' }, 功法: {} },
            乙: { 境界: '凡人', 身份: { 商人: '普通商人' }, 功法: {} },
          },
        },
        'debut',
      ),
      event('测试第一回01-得剑法', 2, {
        事件详情: '甲使出测试剑法击退强敌。',
        insert: { 甲: { 功法: { 测试剑法: { 掌握程度: '初窥门径' } } } },
        参与人物: ['甲'],
      }),
    ]);
    const database = { 功法: [{ 功法名称: '测试剑法', 功法描述: '甲所用剑法' }] };
    const candidates = createCompletionCandidatesDocument(materialized, database);
    expect(candidates.候选角色.map(item => item.角色)).not.toContain('甲');
    expect(candidates.候选角色.map(item => item.角色)).not.toContain('乙');
    expect(candidates.排除记录.some(item => item.角色 === '乙')).toBe(true);
  });

  it('只把主动施展的功法归给角色，不误收对手功法或动词残字', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: { 境界: '二流-初期', 身份: { 剑客: '江湖剑客' }, 功法: {} },
            乙: { 境界: '二流-初期', 身份: { 掌客: '江湖掌客' }, 功法: {} },
          },
        },
        'debut',
      ),
      event('测试第一回01-交手', 2, {
        事件详情: '甲使出了测试剑法迎战却不是对手，继而以测试剑法力拼乙的敌方掌法。',
        参与人物: ['甲', '乙'],
      }),
    ]);
    const database = {
      功法: [
        { 功法名称: '测试剑法', 功法描述: '一门剑法' },
        { 功法名称: '敌方掌法', 功法描述: '一门掌法' },
      ],
    };
    const candidates = createCompletionCandidatesDocument(materialized, database);
    const candidateA = candidates.候选角色.find(item => item.角色 === '甲');
    expect(candidateA.建议功法.map(item => item.功法)).toContain('测试剑法');
    expect(candidateA.建议功法.map(item => item.功法)).not.toContain('敌方掌法');
    expect(candidateA.建议功法.map(item => item.功法)).not.toContain('了测试剑法');
  });

  it('生成门派谱系时遵守层级上限、指定传人与关系排除规则', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            鹿清笃: {
              境界: '三流-中期',
              初始属性: { 臂力: 7, 根骨: 7, 机敏: 7, 洞察: 7, 悟性: 7 },
              身份: { 全真弟子: '全真教第三代弟子' },
              功法: {},
            },
            一灯大师: {
              境界: '绝世-初期',
              初始属性: { 臂力: 12, 根骨: 16, 机敏: 12, 洞察: 16, 悟性: 17 },
              身份: { 南帝: '大理段氏宗师' },
              功法: { 一阳指: { 掌握程度: '出神入化' } },
            },
            冯氏: {
              境界: '不通武艺',
              初始属性: { 臂力: 3, 根骨: 4, 机敏: 8, 洞察: 9, 悟性: 15 },
              身份: { 桃花岛主夫人: '黄药师之妻' },
              功法: {},
            },
          },
        },
        'debut',
      ),
    ]);
    const database = {
      功法: [{ 功法名称: '一阳指', 类型: '指法', 功法品阶: '绝世', 修炼限制: { 悟性: 10 } }],
    };
    const lineage = createSectLineageDocument(materialized, database, {
      sourceRoot: '测试世界书',
      databasePath: '测试功法库.json',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const assignments = createSectAssignmentCandidatesDocument(materialized, lineage, {
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const lu = assignments.候选角色.find(item => item.角色 === '鹿清笃');
    const yideng = assignments.候选角色.find(item => item.角色 === '一灯大师');
    expect(lineage.统计.门派或体系数).toBe(10);
    expect(lu.建议分配.every(item => !['核心', '镇派'].includes(item.传承层级))).toBe(true);
    expect(yideng.建议分配.map(item => item.功法)).not.toContain('六脉神剑');
    expect(assignments.排除记录.some(item => item.角色 === '冯氏' && item.门派ID === '桃花岛')).toBe(true);
    expect(validateSectReviewDocuments(lineage, assignments, database, materialized)).toEqual([]);
  });
});
