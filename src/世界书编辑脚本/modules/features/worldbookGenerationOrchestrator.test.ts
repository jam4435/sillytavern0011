import _ from 'lodash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  requestLlmText: vi.fn(),
  cancelLlmGeneration: vi.fn(),
}));

vi.mock('./llmClient.js', () => llmMocks);
vi.mock('./worldbookGenerationApply.js', () => ({
  applyGenerationProjectToTarget: vi.fn(),
  bindCreatedWorldbook: vi.fn(),
  captureGenerationTargetBaseline: vi.fn(async project => project),
  rollbackCreatedWorldbook: vi.fn(),
}));
Object.assign(globalThis, { _ });

import {
  buildGenerationCallPlan,
  generateWorldbookBlueprint,
  generateWorldbookEntries,
  runGenerationConversation,
} from './worldbookGenerationOrchestrator.js';

function makeNode(index: number) {
  return {
    nodeId: `n${index}`,
    entryId: `n${index}`,
    parentId: null,
    role: 'flat',
    title: `条目 ${index}`,
    triggerType: 'Normal',
    keywords: [`关键词 ${index}`],
    position: { type: 'after_character_definition', role: 'system', depth: 0, order: index * 10 },
    xml: { groupId: null, tag: null, boundary: 'none' },
    contentBrief: `条目 ${index} 的职责`,
    dependsOnEntryIds: [],
  };
}

function makeProject(nodeCount = 2) {
  return {
    id: 'project-1',
    name: '测试项目',
    revision: 4,
    goal: '生成设定',
    blueprint: { scale: 'small', nodes: Array.from({ length: nodeCount }, (_, index) => makeNode(index + 1)) },
    entryDrafts: [],
    sources: [],
    projectRules: [],
    conversations: [],
    pendingProposal: null,
  };
}

describe('世界书生成编排', () => {
  beforeEach(() => {
    llmMocks.requestLlmText.mockReset();
    llmMocks.cancelLlmGeneration.mockReset();
  });

  it('蓝图结果携带 baseRevision 且只形成提案', async () => {
    const project = { ...makeProject(0), blueprint: { scale: 'small', nodes: [] } };
    const result = await generateWorldbookBlueprint(project, {
      client: vi.fn(async () => JSON.stringify({ blueprint: { scale: 'small', nodes: [makeNode(1)] } })),
    });

    expect(result.outcome).toBe('proposal');
    expect(result.proposal.baseRevision).toBe(4);
    expect(result.proposal.operations[0].type).toBe('replaceBlueprint');
    expect(project.pendingProposal).toBeNull();
    expect(result.project.pendingProposal.id).toBe(result.proposal.id);
  });

  it('蓝图发现资料冲突时把冲突放入提案，留给人工处理', async () => {
    const project = { ...makeProject(0), blueprint: { scale: 'small', nodes: [] } };
    const result = await generateWorldbookBlueprint(project, {
      client: vi.fn(async () => JSON.stringify({
        blueprint: { scale: 'small', nodes: [makeNode(1)] },
        conflicts: [{ sourceIds: ['S1', 'S2'], message: '院长归属不同', resolved: false }],
      })),
    });

    expect(result.outcome).toBe('proposal');
    expect(result.proposal.conflicts).toEqual([
      expect.objectContaining({ sourceIds: ['S1', 'S2'], resolved: false }),
    ]);
  });

  it('完整主题批次默认严格串行并在最后执行一次语义审计', async () => {
    const project = makeProject(2);
    const callTypes: string[] = [];
    let active = 0;
    let maxActive = 0;
    const result = await generateWorldbookEntries(project, {
      client: vi.fn(async (_prompt, meta) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        callTypes.push(meta.type);
        await Promise.resolve();
        active -= 1;
        if (meta.type === 'semantic-audit') return JSON.stringify({ issues: [] });
        const nodeId = meta.type === 'entry-batch' && callTypes.length === 1 ? 'n1' : 'n2';
        return JSON.stringify({
          entries: [{
            nodeId,
            entry: {
              name: `条目 ${nodeId}`,
              content: '这是足够长的世界书正文内容，用于验证完整生成流程和格式。',
              enabled: true,
              probability: 100,
              strategy: { type: 'selective', keys: [`关键词 ${nodeId}`] },
              position: { type: 'after_character_definition', role: 'system', depth: 0, order: nodeId === 'n1' ? 10 : 20 },
            },
          }],
        });
      }),
    });

    expect(result.outcome).toBe('proposal');
    expect(callTypes).toEqual(['entry-batch', 'entry-batch', 'semantic-audit']);
    expect(maxActive).toBe(1);
    expect(result.calls).toBe(3);
    expect(result.proposal.operations[0].entries).toHaveLength(2);
  });

  it('预计调用超过 20 时先请求扩充调用上限', () => {
    const plan = buildGenerationCallPlan(makeProject(21), 'entries');
    expect(plan.minimumCalls).toBe(22);
    expect(plan.requiresLimitIncrease).toBe(true);
  });

  it('可在保留成功草稿的同时独立重试失败主题组，并等待批次检查点保存', async () => {
    const project = {
      ...makeProject(2),
      jobs: [{ id: 'failed-n2', type: 'entry-batch', status: 'failed', scopeIds: ['n2'] }],
      pendingProposal: {
        id: 'partial-proposal',
        baseRevision: 4,
        scopeIds: ['n1'],
        summary: '部分条目',
        operations: [{
          type: 'replaceEntryDrafts',
          entries: [{
            nodeId: 'n1',
            name: '条目 n1',
            content: '已经生成且应当被保留的正文内容。',
            strategy: { type: 'selective', keys: ['关键词 n1'] },
            position: { type: 'after_character_definition', role: 'system', depth: 0, order: 10 },
          }],
        }],
        affectedIds: ['n1'],
        conflicts: [],
        requiredJobs: [],
      },
    };
    const checkpoints: string[] = [];
    const result = await generateWorldbookEntries(project, {
      retryJobId: 'failed-n2',
      onBatchComplete: vi.fn(async ({ job }) => {
        await Promise.resolve();
        checkpoints.push(job.status);
      }),
      client: vi.fn(async (_prompt, meta) => {
        if (meta.type === 'semantic-audit') return JSON.stringify({ issues: [] });
        return JSON.stringify({
          entries: [{
            nodeId: 'n2',
            entry: {
              name: '条目 n2',
              content: '这是重试后成功生成的第二组世界书正文内容。',
              enabled: true,
              probability: 100,
              strategy: { type: 'selective', keys: ['关键词 n2'] },
              position: { type: 'after_character_definition', role: 'system', depth: 0, order: 20 },
            },
          }],
        });
      }),
    });

    expect(checkpoints).toEqual(['complete']);
    expect(result.outcome).toBe('proposal');
    expect(result.proposal.operations[0].entries.map(entry => entry.nodeId)).toEqual(['n1', 'n2']);
  });

  it('普通问答持久化完整消息，并把超出最近八条的历史滚入摘要', async () => {
    const project = {
      ...makeProject(1),
      conversations: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `旧消息 ${index + 1}`,
      })),
    };
    const result = await runGenerationConversation(project, {
      message: '为什么这样划分？',
      intent: 'discussion',
      scope: { type: 'global', ids: [] },
      lifetime: 'once',
      client: vi.fn(async () => JSON.stringify({ kind: 'answer', answer: '因为两个领域没有共同触发条件。' })),
    });

    expect(result.outcome).toBe('answer');
    expect(result.project.conversations).toHaveLength(10);
    expect(result.project.conversationSummary).toContain('旧消息 1');
    expect(result.project.conversationSummaryCount).toBe(2);
  });

  it('标记为项目长期规则的讨论始终形成提案而不直接修改项目', async () => {
    const project = makeProject(1);
    const result = await runGenerationConversation(project, {
      message: '所有机构条目都避免使用全能型措辞。',
      intent: 'discussion',
      scope: { type: 'global', ids: [] },
      lifetime: 'project',
      client: vi.fn(async () => JSON.stringify({ kind: 'answer', answer: '明白。' })),
    });

    expect(result.outcome).toBe('proposal');
    expect(result.project.projectRules).toHaveLength(0);
    expect(result.proposal.operations).toContainEqual(
      expect.objectContaining({ type: 'insert', path: ['projectRules'] }),
    );
    expect(result.project.conversations).toHaveLength(2);
  });
});
