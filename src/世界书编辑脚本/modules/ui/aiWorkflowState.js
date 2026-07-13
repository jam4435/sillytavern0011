export const AI_WORKFLOW_PHASES = Object.freeze(['prepare', 'planReview', 'review', 'complete']);
export const AI_WORKFLOW_STRATEGIES = Object.freeze(['direct', 'plan']);
export const AI_ENTRY_DISPOSITIONS = Object.freeze(['modify', 'readonly', 'exclude']);

const INPUT_INVALIDATION = Object.freeze({
  searchText: 'none',
  editableFields: 'preview',
});

function normalizeUid(uid) {
  const normalized = Number.parseInt(`${uid}`, 10);
  return Number.isFinite(normalized) ? normalized : null;
}

function uniqueUids(uids) {
  if (!Array.isArray(uids)) return [];
  return [...new Set(uids.map(normalizeUid).filter(uid => uid !== null))];
}

function normalizeSelectionDraft(draft = {}) {
  const selectedEntryUids = uniqueUids(draft.selectedEntryUids);
  const selectedSet = new Set(selectedEntryUids);
  const readonlyEntryUids = uniqueUids(draft.readonlyEntryUids).filter(uid => !selectedSet.has(uid));
  const readonlySet = new Set(readonlyEntryUids);
  const excludedEntryUids = uniqueUids(draft.excludedEntryUids)
    .filter(uid => !selectedSet.has(uid) && !readonlySet.has(uid));
  return {
    ...draft,
    instruction: typeof draft.instruction === 'string' ? draft.instruction : '',
    selectedEntryUids,
    readonlyEntryUids,
    excludedEntryUids,
  };
}

function idleGeneration(generationId = 0) {
  return { status: 'idle', kind: null, runId: null, generationId };
}

function idleApplication() {
  return { status: 'idle', result: null };
}

function getPreviewEntries(previewResult) {
  if (Array.isArray(previewResult?.entries)) return previewResult.entries;
  if (Array.isArray(previewResult?.previews)) return previewResult.previews;
  if (Array.isArray(previewResult?.results)) return previewResult.results;
  return [];
}

function withPreviewEntries(previewResult, entries) {
  if (Array.isArray(previewResult?.previews)) return { ...previewResult, previews: entries };
  if (Array.isArray(previewResult?.results)) return { ...previewResult, results: entries };
  return { ...previewResult, entries };
}

function itemUid(item) {
  return normalizeUid(typeof item === 'object' && item !== null ? item.uid : item);
}

function resultUids(result, keys) {
  return uniqueUids(keys.flatMap(key => Array.isArray(result?.[key]) ? result[key].map(itemUid) : []));
}

function isGenerationBusy(state) {
  return state.generation.status === 'running' || state.generation.status === 'stopping';
}

function isWorkflowBusy(state) {
  return isGenerationBusy(state) || state.application.status === 'applying';
}

function isCurrentRun(state, action) {
  return action.runId === undefined || action.runId === state.generation.runId;
}

function invalidateDerivedState(state, scope) {
  if (scope === 'none') return state;
  if (scope === 'preview') {
    const phase = state.strategy === 'plan' && state.planningResult ? 'planReview' : 'prepare';
    return {
      ...state,
      phase: ['review', 'complete'].includes(state.phase) ? phase : state.phase,
      previewResult: null,
      application: idleApplication(),
      error: null,
    };
  }
  return {
    ...state,
    phase: 'prepare',
    planningResult: null,
    planIsValid: true,
    previewResult: null,
    application: idleApplication(),
    error: null,
  };
}

function strongestInvalidation(keys) {
  if (keys.some(key => (INPUT_INVALIDATION[key] || 'all') === 'all')) return 'all';
  if (keys.some(key => INPUT_INVALIDATION[key] === 'preview')) return 'preview';
  return 'none';
}

function updateEntryDispositions(draft, uids, disposition) {
  if (!AI_ENTRY_DISPOSITIONS.includes(disposition)) return draft;
  const normalizedUids = uniqueUids(uids);
  if (normalizedUids.length === 0) return draft;
  const affected = new Set(normalizedUids);
  const next = {
    ...draft,
    selectedEntryUids: draft.selectedEntryUids.filter(uid => !affected.has(uid)),
    readonlyEntryUids: draft.readonlyEntryUids.filter(uid => !affected.has(uid)),
    excludedEntryUids: draft.excludedEntryUids.filter(uid => !affected.has(uid)),
  };
  const key = disposition === 'modify'
    ? 'selectedEntryUids'
    : disposition === 'readonly'
      ? 'readonlyEntryUids'
      : 'excludedEntryUids';
  next[key] = [...next[key], ...normalizedUids];
  return next;
}

export function getAiInputInvalidationScope(keys) {
  return strongestInvalidation(Array.isArray(keys) ? keys : [keys]);
}

export function getAiEntryDisposition(state, uid) {
  const normalized = normalizeUid(uid);
  if (normalized === null) return null;
  if (state.draft.selectedEntryUids.includes(normalized)) return 'modify';
  if (state.draft.readonlyEntryUids.includes(normalized)) return 'readonly';
  if (state.draft.excludedEntryUids.includes(normalized)) return 'exclude';
  return null;
}

export function createAiWorkflowState(initial = {}) {
  const runtime = initial.runtime || {};
  return {
    strategy: initial.strategy === 'plan' ? 'plan' : 'direct',
    phase: 'prepare',
    draft: normalizeSelectionDraft(initial.draft || {}),
    planningResult: null,
    planIsValid: true,
    previewResult: null,
    generation: idleGeneration(Number(runtime.generationId) || 0),
    application: idleApplication(),
    error: null,
    lastGenerationStatus: null,
  };
}

export function canEnterAiWorkflowPhase(state, phase) {
  if (!AI_WORKFLOW_PHASES.includes(phase)) return false;
  if (phase === 'prepare') return true;
  if (phase === 'planReview') return state.strategy === 'plan' && Boolean(state.planningResult);
  if (phase === 'review') return getPreviewEntries(state.previewResult).length > 0;
  return state.application.status === 'complete' && Boolean(state.application.result);
}

export function deriveAiWorkflowCapabilities(state) {
  const instructionReady = Boolean(state.draft.instruction.trim());
  const hasEditableEntries = state.draft.selectedEntryUids.length > 0;
  const generationBusy = isGenerationBusy(state);
  const busy = isWorkflowBusy(state);
  const acceptedPreviewCount = getPreviewEntries(state.previewResult)
    .filter(entry => entry?.accepted !== false && entry?.selected !== false).length;
  const canStartPlanning = !busy
    && state.phase === 'prepare'
    && state.strategy === 'plan'
    && instructionReady;
  const canGeneratePreview = !busy && instructionReady && (
    (state.strategy === 'direct' && state.phase === 'prepare' && hasEditableEntries)
    || (state.strategy === 'plan' && state.phase === 'planReview' && Boolean(state.planningResult) && state.planIsValid)
  );
  const canRegenerate = !busy
    && state.phase === 'review'
    && instructionReady
    && (state.strategy === 'plan' ? Boolean(state.planningResult) && state.planIsValid : hasEditableEntries);
  const canApply = !busy && state.phase === 'review' && acceptedPreviewCount > 0;
  const primaryAction = generationBusy
    ? 'stop'
    : state.phase === 'prepare'
      ? state.strategy === 'plan' ? 'plan' : 'preview'
      : state.phase === 'planReview'
        ? 'preview'
        : state.phase === 'review'
          ? 'apply'
          : null;

  let blockReason = null;
  if (!instructionReady && ['prepare', 'planReview', 'review'].includes(state.phase)) blockReason = 'instruction-required';
  else if (state.strategy === 'direct' && !hasEditableEntries && state.phase !== 'complete') {
    blockReason = 'editable-entry-required';
  }
  else if (state.phase === 'planReview' && !state.planIsValid) blockReason = 'plan-invalid';
  else if (state.phase === 'review' && acceptedPreviewCount === 0) blockReason = 'preview-selection-required';

  return {
    busy,
    canSwitchStrategy: !busy,
    canEditInputs: !busy && state.phase === 'prepare',
    canStartPlanning,
    canGeneratePreview,
    canStartGeneration: canStartPlanning || canGeneratePreview || canRegenerate,
    canRegenerate,
    canApply,
    canStop: state.generation.status === 'running',
    canGoBack: !busy && state.phase !== 'prepare',
    canEnterPhase: Object.fromEntries(AI_WORKFLOW_PHASES.map(phase => [phase, canEnterAiWorkflowPhase(state, phase)])),
    nextGenerationKind: canStartPlanning ? 'plan' : canGeneratePreview ? 'preview' : canRegenerate ? 'regenerate' : null,
    primaryAction,
    blockReason,
    acceptedPreviewCount,
    usesWholeLorebookScope: state.strategy === 'plan'
      && state.draft.selectedEntryUids.length === 0
      && state.draft.readonlyEntryUids.length === 0
      && state.draft.excludedEntryUids.length === 0,
  };
}

function finishPreviewGeneration(state, action) {
  if (!isCurrentRun(state, action) || !['preview', 'regenerate'].includes(state.generation.kind)) return state;
  const previewResult = action.previewResult || action.result || null;
  const hasEntries = getPreviewEntries(previewResult).length > 0;
  return {
    ...state,
    phase: hasEntries ? 'review' : state.phase,
    previewResult: hasEntries ? previewResult : state.previewResult,
    generation: idleGeneration(state.generation.generationId),
    error: hasEntries ? null : action.error || null,
    lastGenerationStatus: previewResult?.status || (hasEntries ? 'complete' : 'failed'),
  };
}

function finishPlanGeneration(state, action) {
  if (!isCurrentRun(state, action) || state.generation.kind !== 'plan') return state;
  const planningResult = action.planningResult || action.result || null;
  return {
    ...state,
    phase: planningResult ? 'planReview' : state.phase,
    planningResult: planningResult || state.planningResult,
    planIsValid: action.valid !== false,
    generation: idleGeneration(state.generation.generationId),
    error: planningResult ? null : action.error || null,
    lastGenerationStatus: planningResult ? 'complete' : 'failed',
  };
}

export function aiWorkflowReducer(state, action = {}) {
  switch (action.type) {
    case 'RESET':
      return createAiWorkflowState({ strategy: action.strategy || state.strategy, draft: action.draft || state.draft });
    case 'SET_STRATEGY': {
      if (isWorkflowBusy(state) || !AI_WORKFLOW_STRATEGIES.includes(action.strategy) || action.strategy === state.strategy) {
        return state;
      }
      return invalidateDerivedState({ ...state, strategy: action.strategy }, 'all');
    }
    case 'SET_INPUT': {
      if (isWorkflowBusy(state)) return state;
      const patch = action.patch && typeof action.patch === 'object' ? action.patch : {};
      const draft = normalizeSelectionDraft({ ...state.draft, ...patch });
      return invalidateDerivedState({ ...state, draft }, strongestInvalidation(Object.keys(patch)));
    }
    case 'SET_ENTRY_DISPOSITION':
    case 'SET_ENTRIES_DISPOSITION': {
      if (isWorkflowBusy(state)) return state;
      const uids = action.type === 'SET_ENTRY_DISPOSITION' ? [action.uid] : action.uids;
      const draft = updateEntryDispositions(state.draft, uids, action.disposition);
      if (draft === state.draft) return state;
      return invalidateDerivedState({ ...state, draft }, 'all');
    }
    case 'GO_TO_PHASE':
      return canEnterAiWorkflowPhase(state, action.phase) && !isWorkflowBusy(state)
        ? { ...state, phase: action.phase }
        : state;
    case 'BACK': {
      if (isWorkflowBusy(state) || state.phase === 'prepare') return state;
      if (state.phase === 'review' && state.strategy === 'plan' && state.planningResult) {
        return { ...state, phase: 'planReview' };
      }
      return { ...state, phase: state.phase === 'complete' && state.previewResult ? 'review' : 'prepare' };
    }
    case 'PLAN_UPDATED':
      if (isWorkflowBusy(state) || state.strategy !== 'plan' || !state.planningResult) return state;
      return {
        ...state,
        phase: 'planReview',
        planningResult: action.planningResult || state.planningResult,
        planIsValid: action.valid !== false,
        previewResult: null,
        application: idleApplication(),
        error: action.error || null,
      };
    case 'START_GENERATION': {
      const capabilities = deriveAiWorkflowCapabilities(state);
      const kind = action.kind || capabilities.nextGenerationKind;
      if (!capabilities.canStartGeneration || kind !== capabilities.nextGenerationKind) return state;
      const generationId = Number.isFinite(Number(action.generationId))
        ? Number(action.generationId)
        : state.generation.generationId + 1;
      return {
        ...state,
        generation: {
          status: 'running',
          kind,
          runId: action.runId ?? generationId,
          generationId,
        },
        error: null,
      };
    }
    case 'STOP_GENERATION':
      return state.generation.status === 'running'
        ? { ...state, generation: { ...state.generation, status: 'stopping' } }
        : state;
    case 'GENERATION_CANCELLED':
      if (!isCurrentRun(state, action) || !isGenerationBusy(state)) return state;
      return {
        ...state,
        generation: idleGeneration(state.generation.generationId),
        lastGenerationStatus: 'cancelled',
        error: null,
      };
    case 'GENERATION_FAILED':
      if (!isCurrentRun(state, action) || !isGenerationBusy(state)) return state;
      return {
        ...state,
        generation: idleGeneration(state.generation.generationId),
        lastGenerationStatus: 'failed',
        error: action.error || 'generation-failed',
      };
    case 'GENERATION_SUCCEEDED':
      return state.generation.kind === 'plan'
        ? finishPlanGeneration(state, action)
        : finishPreviewGeneration(state, action);
    case 'PLANNING_SUCCEEDED':
      return finishPlanGeneration(state, action);
    case 'PREVIEW_SUCCEEDED':
      return finishPreviewGeneration(state, action);
    case 'START_APPLY':
      return deriveAiWorkflowCapabilities(state).canApply
        ? { ...state, application: { ...state.application, status: 'applying' }, error: null }
        : state;
    case 'APPLY_FAILED':
      return state.application.status === 'applying'
        ? { ...state, application: { ...state.application, status: 'idle' }, error: action.error || 'apply-failed' }
        : state;
    case 'APPLY_SUCCEEDED': {
      if (state.application.status !== 'applying') return state;
      const result = action.result || {};
      const unresolvedUids = resultUids(result, ['conflicts', 'missing', 'failed', 'failures']);
      const unresolved = new Set(unresolvedUids);
      const remainingEntries = getPreviewEntries(state.previewResult).filter(entry => unresolved.has(itemUid(entry)));
      const succeededUids = resultUids(result, ['succeeded', 'successful', 'applied']);
      const partialWithoutDetails = result.status === 'partial' && unresolvedUids.length === 0;
      const shouldRemainInReview = remainingEntries.length > 0 || partialWithoutDetails || succeededUids.length === 0;
      return {
        ...state,
        phase: shouldRemainInReview ? 'review' : 'complete',
        previewResult: remainingEntries.length > 0
          ? withPreviewEntries(state.previewResult, remainingEntries)
          : state.previewResult,
        application: {
          status: shouldRemainInReview ? 'partial' : 'complete',
          result,
        },
        error: null,
      };
    }
    default:
      return state;
  }
}
