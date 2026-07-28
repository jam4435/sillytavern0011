import { describe, expect, it } from 'vitest';
import {
  auditGeneratedEntries,
  auditGenerationBlueprint,
  auditGenerationProject,
} from './worldbookGenerationAudit.js';

const position = order => ({
  type: 'before_character_definition',
  depth: 0,
  order,
});

describe('世界书生成确定性审计', () => {
  it('接受完整的大型蓝图', () => {
    const report = auditGenerationBlueprint({
      scale: 'large',
      nodes: [
        { nodeId: 'root', title: '世界根', role: 'root', type: 'Constant', position: position(10) },
        { nodeId: 'geo', parentId: 'root', title: '地理总点', role: 'domain', type: 'Constant', position: position(20) },
        {
          nodeId: 'place',
          parentId: 'geo',
          title: '风语堡',
          role: 'detail',
          type: 'Normal',
          keywords: ['风语堡'],
          position: position(30),
        },
        {
          nodeId: 'factions',
          parentId: 'root',
          title: '势力总点',
          role: 'domain',
          type: 'Constant',
          position: position(40),
        },
        {
          nodeId: 'guard',
          parentId: 'factions',
          title: '北境守军',
          role: 'detail',
          type: 'Normal',
          keywords: ['北境守军'],
          position: position(50),
        },
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('阻止小型架构建立父子关系，以及中型架构出现第二层总分', () => {
    const small = auditGenerationBlueprint({
      scale: 'small',
      nodes: [
        { nodeId: 'root', title: '场景总点', role: 'root', type: 'Constant', position: position(10) },
        {
          nodeId: 'child',
          parentId: 'root',
          title: '地点',
          role: 'detail',
          type: 'Normal',
          keywords: ['地点名'],
          position: position(20),
        },
      ],
    });
    const medium = auditGenerationBlueprint({
      scale: 'medium',
      nodes: [
        { nodeId: 'root', title: '城市总点', role: 'root', type: 'Constant', position: position(10) },
        {
          nodeId: 'domain',
          parentId: 'root',
          title: '势力总点',
          role: 'domain',
          type: 'Normal',
          keywords: ['势力名'],
          position: position(20),
        },
        {
          nodeId: 'detail',
          parentId: 'domain',
          title: '势力详情',
          role: 'detail',
          type: 'Normal',
          keywords: ['势力详情'],
          position: position(30),
        },
      ],
    });

    expect(small.errors.some(issue => issue.code === 'small-has-hierarchy')).toBe(true);
    expect(medium.errors.some(issue => issue.code === 'medium-nested-parent')).toBe(true);
  });

  it('检查缺失父级和条件总点关键词覆盖', () => {
    const report = auditGenerationBlueprint({
      scale: 'large',
      nodes: [
        { nodeId: 'root', title: '世界根', role: 'root', type: 'Constant', position: position(10) },
        {
          nodeId: 'conditional',
          parentId: 'root',
          title: '监察体系',
          role: 'conditional',
          type: 'Normal',
          keywords: ['监察体系'],
          position: position(20),
        },
        {
          nodeId: 'detail',
          parentId: 'conditional',
          title: '北境监察院',
          role: 'detail',
          type: 'Normal',
          keywords: ['北境监察院'],
          position: position(30),
        },
        {
          nodeId: 'orphan',
          parentId: 'missing',
          title: '孤岛条目',
          role: 'detail',
          type: 'Normal',
          keywords: ['孤岛条目'],
          position: position(40),
        },
      ],
    });

    expect(report.errors.some(issue => issue.code === 'missing-parent')).toBe(true);
    expect(report.errors.some(issue => issue.code === 'conditional-keyword-coverage')).toBe(true);
  });

  it('兼容规范化蓝图的 triggerType、顶层 depth 与 order 字段', () => {
    const report = auditGenerationBlueprint({
      scale: 'small',
      nodes: [
        {
          entryId: 'E001',
          nodeId: 'E001',
          parentId: null,
          title: '缺失关键词的规范节点',
          role: 'flat',
          triggerType: 'Normal',
          keywords: [],
          position: 'after_character_definition',
          depth: 0,
          order: 10,
          xml: { groupId: null, tag: null, boundary: 'none' },
        },
      ],
    });

    expect(report.errors.some(issue => issue.code === 'normal-without-keywords')).toBe(true);
  });

  it('阻止 XML 边界、坐标和 order 不完整', () => {
    const report = auditGenerationBlueprint({
      scale: 'small',
      nodes: [
        {
          nodeId: 'open',
          title: '开标签',
          role: 'flat',
          type: 'Normal',
          keywords: ['模块'],
          position: position(20),
          xml: { groupId: 'g', tag: '模块', boundary: 'open' },
        },
        {
          nodeId: 'body',
          title: '正文',
          role: 'flat',
          type: 'Normal',
          keywords: ['正文'],
          position: { type: 'after_character_definition', depth: 0, order: 10 },
          xml: { groupId: 'g', tag: '模块', boundary: 'body' },
        },
        {
          nodeId: 'close',
          title: '闭标签',
          role: 'flat',
          type: 'Normal',
          keywords: ['模块'],
          position: position(15),
          xml: { groupId: 'g', tag: '另一个模块', boundary: 'close' },
        },
      ],
    });

    expect(report.errors.some(issue => issue.code === 'tag-mismatch')).toBe(true);
    expect(report.errors.some(issue => issue.code === 'xml-coordinate-mismatch')).toBe(true);
    expect(report.errors.some(issue => issue.code === 'open-order')).toBe(true);
  });

  it('生成条目检查重复标题、Normal 关键词、正文和精确字段', () => {
    const report = auditGeneratedEntries([
      {
        entryId: 'a',
        name: '重复标题',
        content: '',
        strategy: { type: 'selective', keys: [] },
        position: position(10),
      },
      {
        entryId: 'b',
        name: '重复标题',
        content: '短正文',
        strategy: { type: 'selective', keys: ['条目 B'] },
        position: position(20),
      },
    ]);

    expect(report.valid).toBe(false);
    expect(report.errors.some(issue => issue.code === 'duplicate-title')).toBe(true);
    expect(report.errors.some(issue => issue.code === 'normal-without-keywords')).toBe(true);
    expect(report.errors.some(issue => issue.code === 'empty-content')).toBe(true);
  });

  it('项目审计合并蓝图和草稿问题', () => {
    const report = auditGenerationProject({
      blueprint: {
        scale: 'small',
        nodes: [{ nodeId: 'a', title: '平铺条目', role: 'flat', type: 'Constant', position: position(10) }],
      },
      entryDrafts: [
        {
          entryId: 'a',
          name: '平铺条目',
          content: '内容足够具体，能够支持后续叙事与一致性检查。',
          strategy: { type: 'constant', keys: [] },
          position: position(10),
        },
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.summary.errorCount).toBe(0);
  });
});
