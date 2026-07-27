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
