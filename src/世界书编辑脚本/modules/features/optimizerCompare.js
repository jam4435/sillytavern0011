import _ from 'lodash';

import { getPositionLabel as getPositionDisplayLabel } from '../position.js';
import { ensureNumericUID } from '../utils.js';

const FOLDER_META_ENTRY_PREFIX = '__WI_META_FOLDERS__';

export function isCompareFolderMetaEntry(entry) {
  const entryName = `${entry?.name || ''}`.trim();
  return entryName === FOLDER_META_ENTRY_PREFIX || entryName.startsWith(`${FOLDER_META_ENTRY_PREFIX}:`);
}

export function normalizeSortableText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

export function compareText(a, b) {
  return normalizeSortableText(a).localeCompare(normalizeSortableText(b));
}

export function summarizeText(text, maxLength = 120) {
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function normalizeLineBreaks(text) {
  return typeof text === 'string' ? text.replace(/\r\n/g, '\n') : '';
}

export function toDiffLines(text) {
  const normalized = normalizeLineBreaks(text);
  return normalized === '' ? [''] : normalized.split('\n');
}

export function getContentDebugInfo(text) {
  const normalized = normalizeLineBreaks(text);
  const lines = toDiffLines(text);
  let leadingBlankLines = 0;
  let trailingBlankLines = 0;

  while (leadingBlankLines < lines.length && lines[leadingBlankLines] === '') {
    leadingBlankLines += 1;
  }
  while (trailingBlankLines < lines.length && lines[lines.length - 1 - trailingBlankLines] === '') {
    trailingBlankLines += 1;
  }

  return {
    rawLength: normalized.length,
    lineCount: lines.length,
    leadingBlankLines,
    trailingBlankLines,
    firstLineLength: (lines[0] || '').length,
    lastLineLength: (lines[lines.length - 1] || '').length,
    startsWithNewline: normalized.startsWith('\n'),
    endsWithNewline: normalized.endsWith('\n'),
  };
}

export function formatContentDebugSummary(debugInfo) {
  return [
    `len=${debugInfo.rawLength}`,
    `lines=${debugInfo.lineCount}`,
    `lead=${debugInfo.leadingBlankLines}`,
    `trail=${debugInfo.trailingBlankLines}`,
    `first=${debugInfo.firstLineLength}`,
    `last=${debugInfo.lastLineLength}`,
    `startNL=${debugInfo.startsWithNewline ? 1 : 0}`,
    `endNL=${debugInfo.endsWithNewline ? 1 : 0}`,
  ].join(';');
}

export function getRenderedLinesDebugInfo(lines) {
  const text = (lines || [])
    .map(line => (Array.isArray(line) ? line.map(segment => `${segment?.text || ''}`).join('') : ''))
    .join('\n');
  return getContentDebugInfo(text);
}

function tokenizeDiffLine(line) {
  const normalized = normalizeLineBreaks(line);
  return normalized.match(/(\s+|[A-Za-z0-9_]+|[\u3400-\u9fff]|.)/gu) || [];
}

function buildLcsMatrix(leftItems, rightItems, isEqual = (left, right) => left === right) {
  const matrix = Array.from({ length: leftItems.length + 1 }, () => Array(rightItems.length + 1).fill(0));
  for (let leftIndex = leftItems.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightItems.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = isEqual(leftItems[leftIndex], rightItems[rightIndex])
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }
  return matrix;
}

function buildDiffRuns(leftItems, rightItems, isEqual = (left, right) => left === right) {
  const matrix = buildLcsMatrix(leftItems, rightItems, isEqual);
  const runs = [];
  let leftIndex = 0;
  let rightIndex = 0;

  const pushRun = (type, item) => {
    const lastRun = runs[runs.length - 1];
    if (lastRun?.type === type) {
      lastRun.items.push(item);
    } else {
      runs.push({ type, items: [item] });
    }
  };

  while (leftIndex < leftItems.length && rightIndex < rightItems.length) {
    if (isEqual(leftItems[leftIndex], rightItems[rightIndex])) {
      pushRun('equal', leftItems[leftIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1]) {
      pushRun('remove', leftItems[leftIndex]);
      leftIndex += 1;
    } else {
      pushRun('add', rightItems[rightIndex]);
      rightIndex += 1;
    }
  }

  while (leftIndex < leftItems.length) {
    pushRun('remove', leftItems[leftIndex]);
    leftIndex += 1;
  }

  while (rightIndex < rightItems.length) {
    pushRun('add', rightItems[rightIndex]);
    rightIndex += 1;
  }

  return runs;
}

function mergeMarkedSegments(segments) {
  return segments.reduce((merged, segment) => {
    if (!segment || !segment.text) {
      return merged;
    }
    const lastSegment = merged[merged.length - 1];
    if (lastSegment && lastSegment.changed === segment.changed) {
      lastSegment.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
    return merged;
  }, []);
}

function buildInlineLineSegments(beforeLine, afterLine) {
  if (beforeLine === afterLine) {
    return {
      before: beforeLine ? [{ text: beforeLine, changed: false }] : [],
      after: afterLine ? [{ text: afterLine, changed: false }] : [],
    };
  }

  const beforeTokens = tokenizeDiffLine(beforeLine);
  const afterTokens = tokenizeDiffLine(afterLine);
  const runs = buildDiffRuns(beforeTokens, afterTokens);
  const beforeSegments = [];
  const afterSegments = [];

  runs.forEach(run => {
    const text = run.items.join('');
    if (!text) {
      return;
    }
    if (run.type === 'equal') {
      beforeSegments.push({ text, changed: false });
      afterSegments.push({ text, changed: false });
      return;
    }
    if (run.type === 'remove') {
      beforeSegments.push({ text, changed: true });
      return;
    }
    afterSegments.push({ text, changed: true });
  });

  return {
    before: mergeMarkedSegments(beforeSegments),
    after: mergeMarkedSegments(afterSegments),
  };
}

function buildInlineContentDiff(beforeText, afterText) {
  const beforeLines = toDiffLines(beforeText);
  const afterLines = toDiffLines(afterText);
  const runs = buildDiffRuns(beforeLines, afterLines);
  const beforeRenderedLines = [];
  const afterRenderedLines = [];
  let pendingBefore = [];
  let pendingAfter = [];

  const flushPending = () => {
    if (!pendingBefore.length && !pendingAfter.length) {
      return;
    }
    const lineCount = Math.max(pendingBefore.length, pendingAfter.length);
    for (let index = 0; index < lineCount; index += 1) {
      const pair = buildInlineLineSegments(pendingBefore[index] || '', pendingAfter[index] || '');
      beforeRenderedLines.push(pair.before);
      afterRenderedLines.push(pair.after);
    }
    pendingBefore = [];
    pendingAfter = [];
  };

  runs.forEach(run => {
    if (run.type === 'equal') {
      flushPending();
      run.items.forEach(line => {
        const segments = line ? [{ text: line, changed: false }] : [];
        beforeRenderedLines.push(segments);
        afterRenderedLines.push(segments);
      });
      return;
    }
    if (run.type === 'remove') {
      pendingBefore.push(...run.items);
      return;
    }
    pendingAfter.push(...run.items);
  });

  flushPending();

  if (!beforeRenderedLines.length && !afterRenderedLines.length) {
    beforeRenderedLines.push([]);
    afterRenderedLines.push([]);
  }

  return {
    beforeLines: beforeRenderedLines,
    afterLines: afterRenderedLines,
  };
}

function getPositionLabel(positionType) {
  return getPositionDisplayLabel(positionType) || normalizeSortableText(positionType) || '未知位置';
}

function getModeLabel(entry) {
  return entry?.strategy?.type === 'constant' ? '常驻' : '触发';
}

function getKeywordSnapshot(entry) {
  return Array.isArray(entry?.strategy?.keys)
    ? entry.strategy.keys.map(item => normalizeSortableText(item)).filter(Boolean)
    : [];
}

function getSecondaryKeywordSnapshot(entry) {
  return {
    logic: normalizeSortableText(entry?.strategy?.keys_secondary?.logic) || 'and_any',
    keys: Array.isArray(entry?.strategy?.keys_secondary?.keys)
      ? entry.strategy.keys_secondary.keys.map(item => normalizeSortableText(item)).filter(Boolean)
      : [],
  };
}

export function getCompareEntrySnapshot(entry = {}) {
  return {
    uid: ensureNumericUID(entry.uid),
    name: normalizeSortableText(entry.name) || '未命名条目',
    content: typeof entry.content === 'string' ? entry.content : '',
    enabled: entry.enabled !== false,
    mode: getModeLabel(entry),
    positionType: getPositionLabel(entry?.position || 'after_character_definition'),
    depth: entry?.position?.depth ?? 4,
    order: entry?.position?.order ?? 0,
    probability: entry?.probability ?? 100,
    primaryKeywords: getKeywordSnapshot(entry),
    secondaryKeywords: getSecondaryKeywordSnapshot(entry),
  };
}

export function formatCompareValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join('，') : '(空)';
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'boolean') {
    return value ? '启用' : '禁用';
  }
  const text = normalizeSortableText(value);
  return text || '(空)';
}

export function buildEntryDiffs(baseEntry, targetEntry) {
  const beforeSnapshot = getCompareEntrySnapshot(baseEntry);
  const afterSnapshot = getCompareEntrySnapshot(targetEntry);
  const diffs = [];
  const metaItems = [];
  const pushMetaDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      metaItems.push({ label, before: beforeValue, after: afterValue });
    }
  };

  if (!_.isEqual(beforeSnapshot.name, afterSnapshot.name)) {
    diffs.push({
      type: 'title-change',
      label: '标题',
      before: beforeSnapshot.name,
      after: afterSnapshot.name,
    });
  }

  pushMetaDiff('主关键词', beforeSnapshot.primaryKeywords, afterSnapshot.primaryKeywords);
  pushMetaDiff('次关键词逻辑', beforeSnapshot.secondaryKeywords.logic, afterSnapshot.secondaryKeywords.logic);
  pushMetaDiff('次关键词', beforeSnapshot.secondaryKeywords.keys, afterSnapshot.secondaryKeywords.keys);
  pushMetaDiff('启用状态', beforeSnapshot.enabled, afterSnapshot.enabled);
  pushMetaDiff('模式', beforeSnapshot.mode, afterSnapshot.mode);
  pushMetaDiff('插入位置', beforeSnapshot.positionType, afterSnapshot.positionType);
  pushMetaDiff('深度', beforeSnapshot.depth, afterSnapshot.depth);
  pushMetaDiff('顺序', beforeSnapshot.order, afterSnapshot.order);
  pushMetaDiff('概率', beforeSnapshot.probability, afterSnapshot.probability);

  if (metaItems.length) {
    diffs.push({
      type: 'meta-summary',
      label: '其他差异',
      items: metaItems,
    });
  }

  if (beforeSnapshot.content !== afterSnapshot.content) {
    diffs.push({
      type: 'content-inline-full',
      label: '正文',
      beforeText: beforeSnapshot.content,
      afterText: afterSnapshot.content,
      ...buildInlineContentDiff(beforeSnapshot.content, afterSnapshot.content),
    });
  }

  return diffs;
}

function buildCompareBuckets(entries) {
  const buckets = new Map();
  (entries || []).forEach(entry => {
    if (isCompareFolderMetaEntry(entry)) {
      return;
    }
    const key = normalizeSortableText(entry?.name) || '未命名条目';
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(entry);
  });
  return buckets;
}

export function buildLorebookCompareResult(baseName, targetName, baseEntries, targetEntries) {
  const baseBuckets = buildCompareBuckets(baseEntries);
  const targetBuckets = buildCompareBuckets(targetEntries);
  const allTitles = _.uniq([...baseBuckets.keys(), ...targetBuckets.keys()]).sort(compareText);
  const items = [];
  const summary = { added: 0, removed: 0, modified: 0 };
  const titleStats = {};

  allTitles.forEach(title => {
    const baseBucket = [...(baseBuckets.get(title) || [])];
    const targetBucket = [...(targetBuckets.get(title) || [])];
    const sharedCount = Math.min(baseBucket.length, targetBucket.length);

    titleStats[title] = {
      baseCount: baseBucket.length,
      targetCount: targetBucket.length,
    };

    for (let index = 0; index < sharedCount; index += 1) {
      const baseEntry = baseBucket[index];
      const targetEntry = targetBucket[index];
      const baseContent = typeof baseEntry?.content === 'string' ? baseEntry.content : '';
      const targetContent = typeof targetEntry?.content === 'string' ? targetEntry.content : '';
      const diffs = buildEntryDiffs(baseEntry, targetEntry);
      if (diffs.length) {
        summary.modified += 1;
        items.push({
          type: 'modified',
          title,
          baseUid: ensureNumericUID(baseEntry.uid),
          targetUid: ensureNumericUID(targetEntry.uid),
          baseContent,
          targetContent,
          hasContentDiff: baseContent !== targetContent,
          diffs,
        });
      }
    }

    if (targetBucket.length > sharedCount) {
      targetBucket.slice(sharedCount).forEach(entry => {
        summary.added += 1;
        items.push({
          type: 'added',
          title,
          uid: ensureNumericUID(entry.uid),
          entry: _.cloneDeep(entry),
        });
      });
    }

    if (baseBucket.length > sharedCount) {
      baseBucket.slice(sharedCount).forEach(entry => {
        summary.removed += 1;
        items.push({
          type: 'removed',
          title,
          uid: ensureNumericUID(entry.uid),
          entry: _.cloneDeep(entry),
        });
      });
    }
  });

  const typeOrder = { modified: 0, added: 1, removed: 2 };
  items.sort((a, b) => {
    const typeDiff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
    if (typeDiff !== 0) {
      return typeDiff;
    }
    return compareText(a.title, b.title);
  });

  return { baseName, targetName, summary, titleStats, items };
}

export function getCompareItemsForFilter(result, filter = 'all') {
  const normalizedFilter = normalizeSortableText(filter) || 'all';
  return (Array.isArray(result?.items) ? result.items : [])
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => normalizedFilter === 'all' || item?.type === normalizedFilter);
}

function countEntriesByTitle(entries) {
  const counts = new Map();
  (entries || []).forEach(entry => {
    if (isCompareFolderMetaEntry(entry)) {
      return;
    }
    const title = normalizeSortableText(entry?.name) || '未命名条目';
    counts.set(title, (counts.get(title) || 0) + 1);
  });
  return counts;
}

export function buildCompareAddedEntryPlan(result, currentEntries) {
  const currentTitleCounts = countEntriesByTitle(currentEntries);
  let maxUid = (currentEntries || []).reduce(
    (currentMax, entry) => Math.max(currentMax, ensureNumericUID(entry?.uid) || 0),
    0,
  );
  const entriesToCreate = [];
  let skippedCount = 0;

  (Array.isArray(result?.items) ? result.items : [])
    .filter(item => item?.type === 'added' && item.entry && !isCompareFolderMetaEntry(item.entry))
    .forEach(item => {
      const title = normalizeSortableText(item.title || item.entry?.name) || '未命名条目';
      const currentCount = currentTitleCounts.get(title) || 0;
      const targetCount = result?.titleStats?.[title]?.targetCount ?? currentCount + 1;

      if (currentCount >= targetCount) {
        skippedCount += 1;
        return;
      }

      const entryData = _.cloneDeep(item.entry);
      delete entryData.uid;
      maxUid += 1;
      entriesToCreate.push({
        ...entryData,
        uid: maxUid,
      });
      currentTitleCounts.set(title, currentCount + 1);
    });

  return {
    entriesToCreate,
    createdCount: entriesToCreate.length,
    skippedCount,
  };
}

export function buildCompareContentOverwritePlan(result, currentEntries) {
  const currentByUid = new Map(
    (currentEntries || [])
      .filter(entry => !isCompareFolderMetaEntry(entry))
      .map(entry => [ensureNumericUID(entry.uid), entry]),
  );
  const updates = [];
  let skippedCount = 0;

  (Array.isArray(result?.items) ? result.items : [])
    .filter(item => item?.type === 'modified' && item.hasContentDiff)
    .forEach(item => {
      const uid = ensureNumericUID(item.baseUid);
      const currentEntry = currentByUid.get(uid);
      const nextContent = typeof item.targetContent === 'string' ? item.targetContent : '';

      if (!currentEntry || typeof nextContent !== 'string' || currentEntry.content === nextContent) {
        skippedCount += 1;
        return;
      }

      updates.push({
        uid,
        title: item.title,
        nextContent,
      });
    });

  return {
    updates,
    updateCount: updates.length,
    skippedCount,
  };
}

export function applyCompareContentOverwritePlan(entries, plan) {
  const updateByUid = new Map((plan?.updates || []).map(update => [ensureNumericUID(update.uid), update]));
  let changedCount = 0;
  const nextEntries = (entries || []).map(entry => {
    const update = updateByUid.get(ensureNumericUID(entry?.uid));
    if (!update || entry.content === update.nextContent) {
      return entry;
    }
    changedCount += 1;
    return {
      ..._.cloneDeep(entry),
      content: update.nextContent,
    };
  });

  return {
    entries: changedCount > 0 ? nextEntries : entries,
    changedCount,
  };
}
