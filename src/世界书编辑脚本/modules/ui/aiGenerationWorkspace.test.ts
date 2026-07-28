import _ from 'lodash';
import $ from 'jquery';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let internals: typeof import('./aiGenerationWorkspace.js').aiGenerationWorkspaceInternals;

beforeAll(async () => {
  vi.stubGlobal('_', _);
  vi.stubGlobal('$', $);
  ({ aiGenerationWorkspaceInternals: internals } = await import('./aiGenerationWorkspace.js'));
});

function projectFixture() {
  return {
    id: 'project-1',
    revision: 3,
    stage: 'entry-review',
    target: {},
    sources: [],
    conversations: [],
    blueprint: {
      scale: 'large',
      nodes: [
        { nodeId: 'xml-open', title: '北境开始', xml: { groupId: 'north' } },
        { nodeId: 'north-body', title: '北境机构', xml: { groupId: 'north' } },
        { nodeId: 'standalone', title: '南方商路', xml: null },
      ],
    },
    entryDrafts: [
      { nodeId: 'xml-open', name: '北境开始', content: '<north>', strategy: { type: 'Constant', keys: [] } },
      { nodeId: 'north-body', name: '北境机构', content: '机构正文', strategy: { type: 'Normal', keys: ['北境'] } },
      { nodeId: 'standalone', name: '南方商路', content: '商路正文', strategy: { type: 'Normal', keys: ['商路'] } },
    ],
    audit: { errors: [], warnings: [] },
  };
}

describe('协作式世界书生成工作区', () => {
  it('同时呈现条目审阅、人工编辑和导入闸门', () => {
    document.body.innerHTML = internals.buildEntriesView(projectFixture() as never);

    expect(document.querySelectorAll('.gen-entry-card')).toHaveLength(3);
    expect(document.querySelector('#ai-generation-entry-content')).toBeInstanceOf(HTMLTextAreaElement);
    expect(document.body).toHaveTextContent('保存人工修订');
    expect(document.body).toHaveTextContent('导入闸门');
  });

  it('取舍 XML 条目时返回完整 XML 组，普通条目仍可独立选择', () => {
    const project = projectFixture();
    expect(internals.groupedEntryIds(project as never, project.entryDrafts as never, 'north-body')).toEqual([
      'xml-open',
      'north-body',
    ]);
    expect(internals.groupedEntryIds(project as never, project.entryDrafts as never, 'standalone')).toEqual([
      'standalone',
    ]);
  });

  it('对话区持续提供意图、作用域和有效期标签', () => {
    document.body.innerHTML = internals.buildConversationRail(projectFixture() as never);

    expect(document.querySelector('#ai-generation-chat-intent')).toHaveTextContent('修改结构');
    expect(document.querySelector('#ai-generation-chat-scope')).toHaveTextContent('北境机构');
    expect(document.querySelector('#ai-generation-chat-lifetime')).toHaveTextContent('项目规则');
  });

  it('资料冲突以阻断卡呈现，并禁用提案接受按钮', () => {
    const project = {
      ...projectFixture(),
      stage: 'blueprint-review',
      pendingProposal: {
        id: 'conflicted',
        baseRevision: 3,
        summary: '结构提案',
        operations: [],
        affectedIds: [],
        conflicts: [{ sourceIds: ['S1', 'S2'], message: '机构归属冲突', resolved: false }],
      },
    };
    document.body.innerHTML = internals.buildBlueprintView(project as never);

    expect(document.querySelector('.gen-conflict-stack')).toHaveTextContent('机构归属冲突');
    expect(document.querySelector('[data-generation-action="accept-proposal"]')).toBeDisabled();
  });
});
