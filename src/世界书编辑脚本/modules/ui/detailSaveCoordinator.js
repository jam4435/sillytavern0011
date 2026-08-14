export const DETAIL_SAVE_DELAY = 800;

function buildPatchKey(patch) {
  return `${patch.entryUid}\u0000${patch.fieldName}`;
}

function mergePatchMaps(olderPatches, newerPatches) {
  const merged = new Map(olderPatches);
  newerPatches.forEach((patch, key) => merged.set(key, patch));
  return merged;
}

export function createDetailSaveCoordinator({
  saveBatch,
  onBatchSuccess = () => {},
  onBatchError = () => {},
  delay = DETAIL_SAVE_DELAY,
  setTimer = (callback, timeout) => window.setTimeout(callback, timeout),
  clearTimer = timer => window.clearTimeout(timer),
} = {}) {
  if (typeof saveBatch !== 'function') {
    throw new TypeError('createDetailSaveCoordinator requires saveBatch');
  }

  const books = new Map();

  function getBookState(lorebookName) {
    if (!books.has(lorebookName)) {
      books.set(lorebookName, {
        pending: new Map(),
        timer: null,
        inFlight: null,
      });
    }
    return books.get(lorebookName);
  }

  function clearBookTimer(state) {
    if (state.timer == null) {
      return;
    }
    clearTimer(state.timer);
    state.timer = null;
  }

  function scheduleTimer(lorebookName, state) {
    clearBookTimer(state);
    state.timer = setTimer(() => {
      state.timer = null;
      void flush(lorebookName);
    }, delay);
  }

  function schedule(patch) {
    const lorebookName = `${patch?.lorebookName || ''}`;
    const fieldName = `${patch?.fieldName || ''}`;
    if (!lorebookName || !fieldName || !Number.isFinite(patch?.entryUid)) {
      return false;
    }

    const normalizedPatch = {
      ...patch,
      lorebookName,
      fieldName,
    };
    const state = getBookState(lorebookName);
    state.pending.set(buildPatchKey(normalizedPatch), normalizedPatch);
    scheduleTimer(lorebookName, state);
    return true;
  }

  async function flush(lorebookName) {
    const state = books.get(lorebookName);
    if (!state) {
      return { success: true, changed: false };
    }
    clearBookTimer(state);

    if (state.inFlight) {
      const inFlightResult = await state.inFlight;
      if (!inFlightResult?.success) {
        return inFlightResult;
      }
      if (state.pending.size === 0) {
        return inFlightResult;
      }
      return flush(lorebookName);
    }

    if (state.pending.size === 0) {
      books.delete(lorebookName);
      return { success: true, changed: false };
    }

    const batch = state.pending;
    const patches = [...batch.values()];
    state.pending = new Map();

    const operation = Promise.resolve()
      .then(() => saveBatch(lorebookName, patches))
      .then(async result => {
        if (!result?.success) {
          state.pending = mergePatchMaps(batch, state.pending);
          await onBatchError(lorebookName, patches, result);
          return result || { success: false, changed: false };
        }
        await onBatchSuccess(lorebookName, patches, result);
        return result;
      })
      .catch(async error => {
        state.pending = mergePatchMaps(batch, state.pending);
        const result = { success: false, changed: false, error };
        await onBatchError(lorebookName, patches, result);
        return result;
      })
      .finally(() => {
        state.inFlight = null;
        if (state.pending.size === 0 && state.timer == null) {
          books.delete(lorebookName);
        }
      });

    state.inFlight = operation;
    return operation;
  }

  async function flushAll() {
    const lorebookNames = [...books.keys()];
    return Promise.all(lorebookNames.map(lorebookName => flush(lorebookName)));
  }

  function hasPending(lorebookName) {
    if (lorebookName) {
      const state = books.get(lorebookName);
      return Boolean(state && (state.pending.size > 0 || state.inFlight));
    }
    return [...books.values()].some(state => state.pending.size > 0 || state.inFlight);
  }

  return {
    schedule,
    flush,
    flushAll,
    hasPending,
  };
}
