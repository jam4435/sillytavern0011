// Manifest-backed candidate selection for the sparse future-event state.

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function eventTimeToHours(time) {
  if (!time || typeof time !== 'object') return null;
  return (Number(time.年 || 0) * 365 + Number(time.月 || 0) * 30 + Number(time.日 || 0)) * 24 + Number(time.时 || 0);
}

function upperBound(entries, hour) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (Number(entries[middle]?.hour) <= hour) low = middle + 1;
    else high = middle;
  }
  return low;
}

function addThroughHour(target, entries, hour) {
  for (const entry of entries.slice(0, upperBound(entries, hour))) {
    if (entry?.runtimeKey) target.add(entry.runtimeKey);
  }
}

export function getManifestEventCandidateKeys(manifest, currentTime, statData) {
  if (!isPlainObject(manifest)) return null;
  const currentHour = eventTimeToHours(currentTime);
  if (currentHour === null) return [];

  const indexes = manifest.indexes || {};
  const candidates = new Set();
  addThroughHour(candidates, Array.isArray(indexes.byTrigger) ? indexes.byTrigger : [], currentHour);
  addThroughHour(candidates, Array.isArray(indexes.byDiscovery) ? indexes.byDiscovery : [], currentHour);

  const completed = statData?.事件系统?.已完成事件 || {};
  const active = statData?.事件系统?.进行中事件 || {};
  for (const key of Object.keys(active)) candidates.add(key);

  const entryByKey = new Map((manifest.events || []).map(entry => [entry.runtimeKey, entry]));
  return [...candidates].filter(key => {
    if (Object.prototype.hasOwnProperty.call(completed, key)) return false;
    if (Object.prototype.hasOwnProperty.call(active, key)) return true;
    const entry = entryByKey.get(key);
    // Discovery index also contains already-scheduled events; only retain
    // future events inside their ten-day discovery window.
    return Number.isFinite(entry?.discoveryHour) && Number(entry.discoveryHour) <= currentHour;
  });
}

export function buildEventScheduleState(manifestHash, currentTime) {
  return {
    schemaVersion: 1,
    manifestHash: typeof manifestHash === 'string' ? manifestHash : '',
    lastCheckedTime: currentTime && typeof currentTime === 'object' ? JSON.parse(JSON.stringify(currentTime)) : null,
  };
}
