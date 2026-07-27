import { describe, expect, it } from 'vitest';
import {
  applyXmlFallbackKeywords,
  parseWorldbookYaml,
  serializeWorldbookYaml,
  worldbookEntryToYamlDocument,
  yamlDocumentToWorldbookEntry,
} from './worldbookYaml.js';

const NORMAL_DOCUMENT = {
  trigger: {
    Title: '地点详情 - 风语堡',
    type: 'Normal',
    Comma_separated_list: '风语堡,北境要塞',
    position: 'At Depth as Assistant',
    depth: 2,
    order: 110,
  },
  content: '风语堡位于北境山口。\n堡内设有三层防线。',
  enabled: true,
  probability: 100,
};

describe('世界书 YAML codec', () => {
  it('解析连续多文档并丢弃旧 uid', () => {
    const text = `uid: 7
trigger:
  Title: 旧条目 A
  type: Constant
  Comma_separated_list: ''
  position: Before Character Definition
  depth: 0
  order: 10
content: |-
  世界根信息
enabled: true
probability: 100
uid: 18
trigger:
  Title: 旧条目 B
  type: Normal
  Comma_separated_list: 风语堡
  position: After Character Definition
  depth: 0
  order: 100
content: |-
  地点信息
enabled: true
probability: 100`;

    const parsed = parseWorldbookYaml(text);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).not.toHaveProperty('uid');
    expect(parsed[1].trigger.Title).toBe('旧条目 B');
  });

  it('转换为 API 条目时填充递归、次级关键词与扫描深度安全默认值', () => {
    const entry = yamlDocumentToWorldbookEntry(NORMAL_DOCUMENT, { uid: 21 });

    expect(entry).toMatchObject({
      uid: 21,
      name: '地点详情 - 风语堡',
      strategy: {
        type: 'selective',
        keys: ['风语堡', '北境要塞'],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
      position: {
        type: 'at_depth',
        role: 'assistant',
        depth: 2,
        order: 110,
      },
      recursion: {
        prevent_incoming: false,
        prevent_outgoing: false,
        delay_until: null,
      },
    });
  });

  it('连续序列化时强制块正文、不输出 uid，并能往返特殊字符', () => {
    const entry = yamlDocumentToWorldbookEntry(NORMAL_DOCUMENT, { uid: 9 });
    entry.content = "名称: 风语堡\n口令含有 # 与 ' 引号";

    const yaml = serializeWorldbookYaml([entry]);
    const roundTrip = parseWorldbookYaml(yaml);

    expect(yaml).toMatch(/^---\n/);
    expect(yaml).toContain('content: |-');
    expect(yaml).not.toMatch(/^uid:/m);
    expect(roundTrip[0].content).toBe(entry.content);
  });

  it('拒绝没有主关键词的 Normal 条目', () => {
    expect(() =>
      parseWorldbookYaml(`---
trigger:
  Title: 无关键词
  type: Normal
  Comma_separated_list: ''
  position: After Character Definition
  depth: 0
  order: 100
content: |-
  正文
enabled: true
probability: 100`),
    ).toThrow(/Normal.*主关键词/);
  });

  it('API 条目转协议时只使用精确 position 枚举', () => {
    expect(
      worldbookEntryToYamlDocument({
        name: '深度条目',
        content: '正文',
        strategy: { type: 'selective', keys: ['深度条目'] },
        position: { type: 'at_depth', role: 'user', depth: 1, order: 90 },
      }).trigger.position,
    ).toBe('At Depth as User');
  });

  it('为 XML 开闭边界共同继承直属分点关键词', () => {
    const blueprint = {
      nodes: [
        {
          nodeId: 'open',
          role: 'conditional',
          xml: { groupId: 'north', tag: '北境机构', boundary: 'open' },
        },
        {
          nodeId: 'detail-a',
          parentId: 'open',
          keywords: ['监察院', '北境监察院'],
          xml: { groupId: 'north', tag: '北境机构', boundary: 'body' },
        },
        {
          nodeId: 'close',
          xml: { groupId: 'north', tag: '北境机构', boundary: 'close' },
        },
      ],
    };
    const entries = [
      { entryId: 'open', strategy: { type: 'selective', keys: ['北境机构'] } },
      { entryId: 'detail-a', strategy: { type: 'selective', keys: ['监察院'] } },
      { entryId: 'close', strategy: { type: 'selective', keys: ['<北境机构>'] } },
    ];

    const result = applyXmlFallbackKeywords(entries, blueprint);

    expect(result[0].strategy.keys).toEqual(expect.arrayContaining(['监察院', '北境监察院']));
    expect(result[2].strategy.keys).toEqual(expect.arrayContaining(['监察院', '北境监察院']));
    expect(result[2].recursion).toEqual({
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until: null,
    });
    expect(entries[0].strategy.keys).toEqual(['北境机构']);
  });
});
