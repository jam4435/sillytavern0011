import { describe, expect, it } from 'vitest';

import {
  buildGenerationContext,
  getGenerationScopeNodeIds,
} from './worldbookGenerationContext.js';

describe('世界书生成上下文', () => {
  it('按分支收集祖先、后代、同 XML 组与最近八条消息', () => {
    const project = {
      id: 'p1',
      revision: 3,
      sources: [
        { sourceId: 'global', content: '全局', scope: { type: 'global' } },
        { sourceId: 'branch', content: '机构资料', scope: { type: 'branch', ids: ['child'] } },
        { sourceId: 'other', content: '无关', scope: { type: 'branch', ids: ['other'] } },
      ],
      blueprint: {
        scale: 'large',
        nodes: [
          { nodeId: 'root', parentId: null },
          { nodeId: 'domain', parentId: 'root' },
          { nodeId: 'child', parentId: 'domain', xml: { groupId: 'g1' } },
          { nodeId: 'xml-close', parentId: 'domain', xml: { groupId: 'g1', boundary: 'close' } },
          { nodeId: 'other', parentId: 'root' },
        ],
      },
      conversations: Array.from({ length: 12 }, (_, index) => ({ id: index + 1 })),
      existingWorldbookBaseline: {
        entries: [
          { uid: 99, name: '__WI_META_INTERNAL' },
          { uid: 1, name: '可见条目' },
        ],
      },
    };

    const scope = { type: 'branch', ids: ['child'] };
    const context = buildGenerationContext(project, { scope });

    expect(getGenerationScopeNodeIds(project, scope)).toEqual(
      expect.arrayContaining(['root', 'domain', 'child', 'xml-close']),
    );
    expect(context.sources.map(source => source.sourceId)).toEqual(['global', 'branch']);
    expect(context.conversation.recentMessages).toHaveLength(8);
    expect(context.conversation.recentMessages[0].id).toBe(5);
    expect(context.baselineEntries.map(entry => entry.name)).toEqual(['可见条目']);
  });
});
