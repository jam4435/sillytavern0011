export function createSerialTaskQueue(onError = () => {}) {
  let queue = Promise.resolve();

  return function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(onError);
    return run;
  };
}

export function buildFollowupCounterPlan(followupCounters, eligibleCounterKeys) {
  const updates = {};
  const expiredKeys = [];
  const retainedKeys = [];

  for (const [key, currentCount] of Object.entries(followupCounters || {})) {
    if (eligibleCounterKeys instanceof Set && !eligibleCounterKeys.has(key)) {
      retainedKeys.push(key);
      continue;
    }

    const newCount = Number(currentCount) - 1;
    if (newCount > 0) {
      updates[key] = newCount;
    } else {
      expiredKeys.push(key);
    }
  }

  return { updates, expiredKeys, retainedKeys };
}
