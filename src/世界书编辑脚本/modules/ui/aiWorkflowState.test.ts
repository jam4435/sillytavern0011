import { describe, expect, it } from 'vitest';
import {
  aiWorkflowReducer,
  createAiWorkflowState,
  deriveAiWorkflowCapabilities,
  getAiEntryDisposition,
  getAiInputInvalidationScope,
  normalizeAiPlanEditorValue,
} from './aiWorkflowState.js';

function reduce(state: ReturnType<typeof createAiWorkflowState>, action: Record<string, unknown>) {
  return aiWorkflowReducer(state, action);
}

describe('AI 工作流状态层', () => {
  it('直接修改同时要求指令和至少一个可修改条目', () => {
    let state = createAiWorkflowState({ draft: { instruction: '精简正文' } });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      canStartGeneration: false,
      blockReason: 'editable-entry-required',
    });

    state = reduce(state, { type: 'SET_ENTRY_DISPOSITION', uid: 10, disposition: 'modify' });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      canGeneratePreview: true,
      nextGenerationKind: 'preview',
      primaryAction: 'preview',
    });

    state = reduce(state, { type: 'START_GENERATION', runId: 'preview-1' });
    expect(state).toMatchObject({
      phase: 'review',
      generation: { status: 'running', kind: 'preview', runId: 'preview-1' },
    });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      primaryAction: 'stop',
      canEnterPhase: { review: true },
    });
  });

  it('计划策略允许零锁定选择并明确使用整本世界书', () => {
    const state = createAiWorkflowState({ strategy: 'plan', draft: { instruction: '统一人物设定' } });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      canStartPlanning: true,
      usesWholeLorebookScope: true,
      nextGenerationKind: 'plan',
    });
  });

  it('三态选择互斥，批量改变会使派生结果失效', () => {
    let state = createAiWorkflowState({
      strategy: 'plan',
      draft: {
        instruction: '调整',
        selectedEntryUids: [1],
        readonlyEntryUids: [1, 2],
        excludedEntryUids: [2, 3],
      },
    });
    expect(state.draft).toMatchObject({
      selectedEntryUids: [1],
      readonlyEntryUids: [2],
      excludedEntryUids: [3],
    });

    state = reduce(state, { type: 'SET_ENTRIES_DISPOSITION', uids: [1, 2], disposition: 'exclude' });
    expect(getAiEntryDisposition(state, 1)).toBe('exclude');
    expect(getAiEntryDisposition(state, 2)).toBe('exclude');
    expect(state.draft.selectedEntryUids).toEqual([]);
    expect(state.draft.readonlyEntryUids).toEqual([]);
    expect(state.draft.excludedEntryUids).toEqual([3, 1, 2]);
    expect(state.phase).toBe('prepare');
  });

  it('策略切换保留输入但清除计划、预览和完成结果', () => {
    const initial = {
      ...createAiWorkflowState({ strategy: 'plan', draft: { instruction: '保留这条指令' } }),
      phase: 'review',
      planningResult: { plan: { goal: '旧计划' } },
      previewResult: { entries: [{ uid: 1 }] },
      application: { status: 'complete', result: { succeeded: [1] } },
    };
    const state = reduce(initial, { type: 'SET_STRATEGY', strategy: 'direct' });

    expect(state.strategy).toBe('direct');
    expect(state.draft.instruction).toBe('保留这条指令');
    expect(state).toMatchObject({
      phase: 'prepare',
      planningResult: null,
      previewResult: null,
      application: { status: 'idle', result: null },
    });
  });

  it('按输入失效矩阵保留计划或清空全部派生结果', () => {
    expect(getAiInputInvalidationScope('searchText')).toBe('none');
    expect(getAiInputInvalidationScope('editableFields')).toBe('preview');
    expect(getAiInputInvalidationScope(['editableFields', 'referenceMaterial'])).toBe('all');

    const planned = {
      ...createAiWorkflowState({ strategy: 'plan', draft: { instruction: '调整' } }),
      phase: 'review',
      planningResult: { plan: { goal: '统一' } },
      previewResult: { entries: [{ uid: 1 }] },
    };
    const fieldsChanged = reduce(planned, {
      type: 'SET_INPUT',
      patch: { editableFields: { title: false, content: true, prompt: true } },
    });
    expect(fieldsChanged.phase).toBe('planReview');
    expect(fieldsChanged.planningResult).toEqual(planned.planningResult);
    expect(fieldsChanged.previewResult).toBeNull();

    const contextChanged = reduce(fieldsChanged, { type: 'SET_INPUT', patch: { referenceMaterial: '新资料' } });
    expect(contextChanged.phase).toBe('prepare');
    expect(contextChanged.planningResult).toBeNull();
  });

  it('阶段只能在前置结果存在后进入，计划 JSON 无效时禁止生成预览', () => {
    let state = createAiWorkflowState({ strategy: 'plan', draft: { instruction: '调整' } });
    expect(reduce(state, { type: 'GO_TO_PHASE', phase: 'planReview' })).toBe(state);

    state = reduce(state, { type: 'START_GENERATION', runId: 'plan-1' });
    expect(state.phase).toBe('prepare');
    expect(state.generation).toMatchObject({ status: 'running', kind: 'plan', runId: 'plan-1' });
    state = reduce(state, {
      type: 'PLANNING_SUCCEEDED',
      runId: 'plan-1',
      planningResult: { plan: { goal: '统一措辞' } },
    });
    expect(state.phase).toBe('planReview');

    state = reduce(state, { type: 'PLAN_UPDATED', valid: false, error: 'JSON 无效' });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      canGeneratePreview: false,
      blockReason: 'plan-invalid',
    });
    state = reduce(state, { type: 'PLAN_UPDATED', valid: true, planningResult: state.planningResult });
    expect(deriveAiWorkflowCapabilities(state).canGeneratePreview).toBe(true);
  });

  it('计划 JSON 拒绝非法、重复、未知和重叠 UID', () => {
    const validUids = new Set([1, 2, 3]);
    expect(() => normalizeAiPlanEditorValue('{"editable_uids":[1,1]}', validUids)).toThrow('重复 UID');
    expect(() => normalizeAiPlanEditorValue('{"editable_uids":["x"]}', validUids)).toThrow('非法 UID');
    expect(() => normalizeAiPlanEditorValue('{"editable_uids":[9]}', validUids)).toThrow('不存在的 UID');
    expect(() => normalizeAiPlanEditorValue('{"editable_uids":[1],"readonly_uids":[1]}', validUids)).toThrow('不能重叠');
    expect(normalizeAiPlanEditorValue('{"editable_uids":[1],"readonly_uids":[2]}', validUids)).toMatchObject({
      editable_uids: [1],
      readonly_uids: [2],
    });
  });

  it('旧计划缺少 entry_tasks 时为每个可修改条目合成默认任务并保留旧字段', () => {
    expect(normalizeAiPlanEditorValue({
      editable_uids: [3, 1],
      readonly_uids: [2],
      locked_editable_uids: [3],
      planned_editable_uids: [1],
      plan: {
        goal: ' 统一设定 ',
        must_keep: [' 核心事实 '],
      },
    }, new Set([1, 2, 3]))).toEqual({
      readonly_uids: [2],
      editable_uids: [3, 1],
      locked_editable_uids: [3],
      locked_readonly_uids: [],
      planned_editable_uids: [1],
      planned_readonly_uids: [],
      plan: {
        goal: '统一设定',
        must_keep: ['核心事实'],
        rewrite_rules: [],
        consistency_notes: [],
        entry_tasks: [
          {
            uid: 3,
            objective: '按用户指令处理该条目',
            complexity: 'medium',
            estimated_output_tokens: 1024,
            depends_on_uids: [],
            related_uids: [],
          },
          {
            uid: 1,
            objective: '按用户指令处理该条目',
            complexity: 'medium',
            estimated_output_tokens: 1024,
            depends_on_uids: [],
            related_uids: [],
          },
        ],
      },
    });
  });

  it('规范化 entry_tasks，并允许依赖可修改或只读条目', () => {
    const normalized = normalizeAiPlanEditorValue({
      editable_uids: [1, 2],
      readonly_uids: [3],
      plan: {
        entry_tasks: [
          {
            uid: '1',
            objective: ' 建立基础设定 ',
            complexity: 'high',
            estimated_output_tokens: '1800',
            depends_on_uids: [3],
            related_uids: [2],
          },
          {
            uid: 2,
            objective: '补充关系',
            complexity: 'low',
            estimated_output_tokens: 64,
            depends_on_uids: [1],
          },
        ],
      },
    }, new Set([1, 2, 3, 4]));

    expect(normalized.plan.entry_tasks).toEqual([
      {
        uid: 1,
        objective: '建立基础设定',
        complexity: 'high',
        estimated_output_tokens: 1800,
        depends_on_uids: [3],
        related_uids: [2],
      },
      {
        uid: 2,
        objective: '补充关系',
        complexity: 'low',
        estimated_output_tokens: 64,
        depends_on_uids: [1],
        related_uids: [],
      },
    ]);
  });

  it('entry_tasks 必须唯一且完整覆盖最终可修改 UID', () => {
    const base = {
      editable_uids: [1, 2],
      readonly_uids: [3],
    };
    const task = (uid: number) => ({
      uid,
      objective: `任务 ${uid}`,
      complexity: 'medium',
      estimated_output_tokens: 1024,
      depends_on_uids: [],
      related_uids: [],
    });

    expect(() => normalizeAiPlanEditorValue({
      ...base,
      plan: { entry_tasks: [task(1), task(1)] },
    })).toThrow('重复任务 UID');
    expect(() => normalizeAiPlanEditorValue({
      ...base,
      plan: { entry_tasks: [task(1)] },
    })).toThrow('缺少可修改 UID');
    expect(() => normalizeAiPlanEditorValue({
      ...base,
      plan: { entry_tasks: [task(1), task(2), task(3)] },
    })).toThrow('非可修改或已排除 UID');
  });

  it('entry_tasks 拒绝非法复杂度、输出估算和任务内容', () => {
    const normalizeTask = (patch: Record<string, unknown>) => normalizeAiPlanEditorValue({
      editable_uids: [1],
      plan: {
        entry_tasks: [{
          uid: 1,
          objective: '改写',
          complexity: 'medium',
          estimated_output_tokens: 1024,
          depends_on_uids: [],
          related_uids: [],
          ...patch,
        }],
      },
    });

    expect(() => normalizeTask({ objective: ' ' })).toThrow('objective 必须是非空文本');
    expect(() => normalizeTask({ complexity: 'extreme' })).toThrow('low、medium 或 high');
    expect(() => normalizeTask({ estimated_output_tokens: 63 })).toThrow('64-64000');
    expect(() => normalizeTask({ estimated_output_tokens: 64001 })).toThrow('64-64000');
    expect(() => normalizeTask({ estimated_output_tokens: 100.5 })).toThrow('64-64000');
  });

  it('entry_tasks 拒绝自身、重复、未知、排除和非法关联引用', () => {
    const validUids = new Set([1, 2, 3, 4]);
    const normalizeReferences = (dependsOnUids: number[], relatedUids: number[] = []) => normalizeAiPlanEditorValue({
      editable_uids: [1, 2],
      readonly_uids: [3],
      plan: {
        entry_tasks: [
          {
            uid: 1,
            objective: '任务 1',
            complexity: 'medium',
            estimated_output_tokens: 1024,
            depends_on_uids: dependsOnUids,
            related_uids: relatedUids,
          },
          {
            uid: 2,
            objective: '任务 2',
            complexity: 'medium',
            estimated_output_tokens: 1024,
            depends_on_uids: [],
            related_uids: [],
          },
        ],
      },
    }, validUids);

    expect(() => normalizeReferences([1])).toThrow('不能引用自身');
    expect(() => normalizeReferences([3, 3])).toThrow('重复 UID');
    expect(() => normalizeReferences([9])).toThrow('不存在的 UID');
    expect(() => normalizeReferences([4])).toThrow('未知或已排除 UID');
    expect(() => normalizeReferences([], [3])).toThrow('只能引用可修改 UID');
    expect(() => normalizeReferences([], [4])).toThrow('只能引用可修改 UID');
  });

  it('用 runId 忽略陈旧异步结果，并保留取消前已经存在的审阅结果', () => {
    let state = createAiWorkflowState({ draft: { instruction: '调整', selectedEntryUids: [1] } });
    state = reduce(state, { type: 'START_GENERATION', runId: 'new-run' });
    const running = state;
    expect(reduce(state, { type: 'SET_INPUT', patch: { instruction: '运行中不得覆盖' } })).toBe(running);
    state = reduce(state, {
      type: 'PREVIEW_SUCCEEDED',
      runId: 'old-run',
      previewResult: { status: 'complete', entries: [{ uid: 1 }] },
    });
    expect(state).toBe(running);

    state = reduce(state, {
      type: 'PREVIEW_SUCCEEDED',
      runId: 'new-run',
      previewResult: { status: 'partial', entries: [{ uid: 1 }] },
    });
    expect(state.phase).toBe('review');
    expect(state.lastGenerationStatus).toBe('partial');

    state = reduce(state, { type: 'START_GENERATION', kind: 'regenerate', runId: 'regen-1' });
    state = reduce(state, { type: 'STOP_GENERATION' });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({ primaryAction: 'stop', canStop: false });
    state = reduce(state, { type: 'GENERATION_CANCELLED', runId: 'regen-1' });
    expect(state.phase).toBe('review');
    expect(state.previewResult).toEqual({ status: 'partial', entries: [{ uid: 1 }] });
  });

  it('首次预览失败后停留在审阅页，并把主动作切换为重新生成', () => {
    let state = createAiWorkflowState({
      draft: { instruction: '调整', selectedEntryUids: [1] },
    });
    state = reduce(state, { type: 'START_GENERATION', runId: 'preview-failed' });
    state = reduce(state, {
      type: 'GENERATION_FAILED',
      runId: 'preview-failed',
      error: '请求失败',
    });

    expect(state).toMatchObject({
      phase: 'review',
      previewResult: null,
      error: '请求失败',
    });
    expect(deriveAiWorkflowCapabilities(state)).toMatchObject({
      canRegenerate: true,
      canApply: false,
      primaryAction: 'regenerate',
    });
  });

  it('部分应用只保留冲突和缺失条目，全部成功后进入完成态', () => {
    let state = {
      ...createAiWorkflowState({ draft: { instruction: '调整', selectedEntryUids: [1, 2, 3] } }),
      phase: 'review',
      previewResult: { entries: [{ uid: 1 }, { uid: 2 }, { uid: 3 }] },
    };
    state = reduce(state, { type: 'START_APPLY' });
    state = reduce(state, {
      type: 'APPLY_SUCCEEDED',
      result: {
        appliedCount: 1,
        skippedCount: 2,
        appliedUids: [1],
        skipped: [{ uid: 2, reason: 'conflict' }, { uid: 3, reason: 'missing' }],
      },
    });
    expect(state.phase).toBe('review');
    expect(state.previewResult.entries.map((entry: { uid: number }) => entry.uid)).toEqual([2, 3]);
    expect(state.application.status).toBe('partial');

    state = reduce(state, { type: 'START_APPLY' });
    state = reduce(state, {
      type: 'APPLY_SUCCEEDED',
      result: { appliedCount: 2, skippedCount: 0, appliedUids: [2, 3], skipped: [] },
    });
    expect(state.phase).toBe('complete');
    expect(state.application.status).toBe('complete');
    expect(deriveAiWorkflowCapabilities(state).primaryAction).toBeNull();
  });
});
