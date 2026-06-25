export type LoadedPresetPromptMonitorState = {
  loadedPresetName: string;
  livePromptIds: string[];
  savedPromptIds?: string[];
  dirty: boolean;
};

function normalizeStringArray(values?: string[]): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach(value => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function areOptionalStringArraysEqual(left?: string[], right?: string[]): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
}

export function createLoadedPresetPromptMonitorState(input: {
  loadedPresetName: string;
  livePromptIds: string[];
  savedPromptIds?: string[];
}): LoadedPresetPromptMonitorState | null {
  const loadedPresetName = String(input.loadedPresetName || '').trim();
  if (!loadedPresetName) {
    return null;
  }

  const livePromptIds = normalizeStringArray(input.livePromptIds) || [];
  const savedPromptIds = normalizeStringArray(input.savedPromptIds);

  return {
    loadedPresetName,
    livePromptIds,
    savedPromptIds,
    dirty: !areOptionalStringArraysEqual(livePromptIds, savedPromptIds),
  };
}

export function shouldSyncLoadedPresetPromptDefaultSnapshot(
  previousState: LoadedPresetPromptMonitorState | null,
  currentState: LoadedPresetPromptMonitorState | null,
): boolean {
  if (!previousState || !currentState) {
    return false;
  }

  if (previousState.loadedPresetName !== currentState.loadedPresetName) {
    return false;
  }

  return previousState.dirty && !currentState.dirty;
}
