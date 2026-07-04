import { getWorldbookNamesSafe, getWorldbookSafe, updateWorldbookEntries } from '../api.js';
import { DEBUG_MODE } from '../config.js';
import { getPositionLabel as getPositionDisplayLabel } from '../position.js';
import { allEntriesData, getSelectedEntries } from '../state.js';
import { ensureNumericUID, errorCatched } from '../utils.js';
import { batchUpdateEntries } from './batchActions.js';
import { getRenderableEntriesWithoutFolderMeta } from './folderMeta.js';

const LOREBOOK_COMPARE_MODAL_ID = 'lorebook-compare-preview-modal';
const LOREBOOK_COMPARE_STYLE_ID = 'lorebook-compare-preview-styles';

function ensureLorebookCompareStyles() {
  const parentDoc = window.parent.document;
  $(`#${LOREBOOK_COMPARE_STYLE_ID}`, parentDoc).remove();

  $('head', parentDoc).append(`
    <style id="${LOREBOOK_COMPARE_STYLE_ID}">
      #${LOREBOOK_COMPARE_MODAL_ID}{display:none;position:fixed;z-index:10006;left:0;top:0;width:100vw;height:100vh;overflow-y:auto;background-color:rgba(0,0,0,.75);backdrop-filter:blur(4px);box-sizing:border-box}
      #${LOREBOOK_COMPARE_MODAL_ID}-content{background:var(--panel-bg-color,#2a2a2a);color:var(--panel-text-color,#eee);border:1px solid rgba(255,255,255,.15);width:95%;max-width:1360px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;flex-direction:column;min-height:calc(100vh - 110px);margin:40px auto;box-sizing:border-box}
      #${LOREBOOK_COMPARE_MODAL_ID}-header{padding:15px 20px;background:var(--panel-accent-color,#5a3a8e);color:#fff;border-top-left-radius:12px;border-top-right-radius:12px;display:flex;justify-content:space-between;align-items:center}
      #${LOREBOOK_COMPARE_MODAL_ID}-header h4{margin:0;font-size:1.05em;font-weight:600}
      #${LOREBOOK_COMPARE_MODAL_ID} .close-button{font-size:24px;font-weight:700;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.1)}
      #${LOREBOOK_COMPARE_MODAL_ID}-body{padding:16px 18px;display:flex;flex-direction:column;gap:14px;flex:1 1 auto}
      #${LOREBOOK_COMPARE_MODAL_ID}-footer{padding:15px 20px;border-top:1px solid rgba(255,255,255,.1);background:var(--panel-entry-bg-color,rgba(0,0,0,.2));border-bottom-left-radius:12px;border-bottom-right-radius:12px;display:flex;justify-content:flex-end;align-items:center;gap:10px}
      #${LOREBOOK_COMPARE_MODAL_ID}-footer button,#${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar button,#${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-actions button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:.9em}
      #${LOREBOOK_COMPARE_MODAL_ID}-close,#${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar .secondary{background:var(--panel-entry-bg-color,#555);color:#fff}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar-actions button{background:rgba(255,255,255,.08);color:#f0f0f0}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-toolbar-actions button.active{background:var(--panel-accent-color,#5a3a8e);color:#fff}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-summary{font-size:13px;line-height:1.6;color:rgba(255,255,255,.88)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-list{border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);padding:12px;min-height:180px;max-height:calc(100vh - 280px);overflow-y:auto}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-empty{text-align:center;color:rgba(255,255,255,.75);padding:18px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-item + .compare-diff-item{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-entry-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-entry-title{font-size:15px;font-weight:600;line-height:1.45}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-entry-meta{font-size:12px;opacity:.78;line-height:1.5}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-actions button{background:rgba(255,255,255,.08);color:#f0f0f0}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-block + .compare-diff-block{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-label{color:var(--panel-accent-color,#9fc8e4);margin-bottom:6px;font-size:12px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-panel{border-radius:8px;background:rgba(0,0,0,.18);padding:10px;min-width:0}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-panel pre{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.5;font-family:Consolas,Monaco,'Courier New',monospace}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-summary{display:flex;flex-wrap:wrap;gap:4px 8px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-token{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.05);font-size:12px;line-height:1.5}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-key{color:var(--panel-accent-color,#9fc8e4)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-before,#${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-segment.is-removed{background:rgba(168,74,74,.28);color:#ffd1d1}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-after,#${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-segment.is-added{background:rgba(58,140,95,.28);color:#c7f3d6}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-before,#${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-after{padding:1px 6px;border-radius:6px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-meta-arrow{opacity:.68}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-full{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column{min-width:0;border-radius:8px;background:rgba(0,0,0,.18);overflow:hidden;display:flex;flex-direction:column}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column-header{padding:2px 8px;border-bottom:1px solid rgba(255,255,255,.08);font-size:11px;line-height:1.2;color:var(--panel-accent-color,#9fc8e4)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column-body{display:block!important;max-height:min(360px,50vh)!important;overflow:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable;padding:2px 8px 4px!important;font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;line-height:1.3;white-space:normal!important;word-break:break-word;text-overflow:clip!important}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column-body::-webkit-scrollbar{width:10px;height:10px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:999px}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-column-body::-webkit-scrollbar-track{background:rgba(255,255,255,.04)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-line{display:block;min-height:0;white-space:pre-wrap;word-break:break-word;line-height:1.3}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-segment{border-radius:3px;white-space:inherit}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-placeholder{opacity:.45}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-block.compare-diff-block-content{margin-top:6px;padding-top:0;border-top:none}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;line-height:1.5;background:rgba(255,255,255,.08)}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-chip.is-modified{background:rgba(122,90,190,.28);color:#e6dbff}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-chip.is-added{background:rgba(58,140,95,.28);color:#c7f3d6}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-chip.is-removed{background:rgba(168,74,74,.28);color:#ffd1d1}
      #${LOREBOOK_COMPARE_MODAL_ID} .compare-placeholder{opacity:.72;font-style:italic}
      @media (max-width: 900px){
        #${LOREBOOK_COMPARE_MODAL_ID}-content{width:96%;margin:20px auto;min-height:calc(100vh - 40px)}
        #${LOREBOOK_COMPARE_MODAL_ID} .compare-diff-panels{grid-template-columns:minmax(0,1fr)}
        #${LOREBOOK_COMPARE_MODAL_ID} .compare-inline-full{grid-template-columns:minmax(0,1fr)}
      }
    </style>
  `);
}

function normalizeSortableText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function compareText(a, b) {
  return normalizeSortableText(a).localeCompare(normalizeSortableText(b));
}

function summarizeText(text, maxLength = 120) {
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function normalizeLineBreaks(text) {
  return typeof text === 'string' ? text.replace(/\r\n/g, '\n') : '';
}

function toDiffLines(text) {
  const normalized = normalizeLineBreaks(text);
  return normalized === '' ? [''] : normalized.split('\n');
}

function getContentDebugInfo(text) {
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

function formatContentDebugSummary(debugInfo) {
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

function getRenderedLinesDebugInfo(lines) {
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

function buildContentDiffSnippets(beforeText, afterText, options = {}) {
  const contextLength = Number.isFinite(options.contextLength) ? options.contextLength : 48;
  const maxSnippets = Number.isFinite(options.maxSnippets) ? options.maxSnippets : 4;
  const beforeLines = typeof beforeText === 'string' ? beforeText.split(/\r?\n/) : [];
  const afterLines = typeof afterText === 'string' ? afterText.split(/\r?\n/) : [];
  const maxLineCount = Math.max(beforeLines.length, afterLines.length);
  const snippets = [];

  for (let index = 0; index < maxLineCount; index += 1) {
    const beforeLine = beforeLines[index] || '';
    const afterLine = afterLines[index] || '';
    if (beforeLine === afterLine) {
      continue;
    }

    const beforeSnippet = summarizeText(beforeLine, contextLength);
    const afterSnippet = summarizeText(afterLine, contextLength);
    snippets.push({
      before: beforeSnippet || '(空)',
      after: afterSnippet || '(空)',
    });

    if (snippets.length >= maxSnippets) {
      break;
    }
  }

  if (!snippets.length) {
    snippets.push({
      before: summarizeText(beforeText, contextLength) || '(空)',
      after: summarizeText(afterText, contextLength) || '(空)',
    });
  }

  return snippets;
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

function getCompareEntrySnapshot(entry = {}) {
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

function formatCompareValue(value) {
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

function buildEntryDiffs(baseEntry, targetEntry) {
  const beforeSnapshot = getCompareEntrySnapshot(baseEntry);
  const afterSnapshot = getCompareEntrySnapshot(targetEntry);
  const diffs = [];
  const pushDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      diffs.push({ label, before: beforeValue, after: afterValue });
    }
  };

  pushDiff('标题', beforeSnapshot.name, afterSnapshot.name);

  if (beforeSnapshot.content !== afterSnapshot.content) {
    diffs.push({
      label: '正文差异',
      type: 'content-snippets',
      snippets: buildContentDiffSnippets(beforeSnapshot.content, afterSnapshot.content),
      before: summarizeText(beforeSnapshot.content),
      after: summarizeText(afterSnapshot.content),
    });
  }

  pushDiff('主关键词', beforeSnapshot.primaryKeywords, afterSnapshot.primaryKeywords);
  pushDiff('次关键词逻辑', beforeSnapshot.secondaryKeywords.logic, afterSnapshot.secondaryKeywords.logic);
  pushDiff('次关键词', beforeSnapshot.secondaryKeywords.keys, afterSnapshot.secondaryKeywords.keys);
  pushDiff('启用状态', beforeSnapshot.enabled, afterSnapshot.enabled);
  pushDiff('模式', beforeSnapshot.mode, afterSnapshot.mode);
  pushDiff('插入位置', beforeSnapshot.positionType, afterSnapshot.positionType);
  pushDiff('深度', beforeSnapshot.depth, afterSnapshot.depth);
  pushDiff('顺序', beforeSnapshot.order, afterSnapshot.order);
  pushDiff('概率', beforeSnapshot.probability, afterSnapshot.probability);

  return diffs;
}

function buildEntryDiffsV2(baseEntry, targetEntry) {
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

async function getComparableLorebookEntries(lorebookName) {
  const cachedEntries = Array.isArray(allEntriesData[lorebookName]) ? allEntriesData[lorebookName] : null;
  let rawEntries = cachedEntries;
  if (!rawEntries) {
    const result = await getWorldbookSafe(lorebookName);
    if (!result?.success) {
      throw result?.error || new Error(`读取世界书失败: ${lorebookName}`);
    }
    rawEntries = result.data || [];
  }
  return getRenderableEntriesWithoutFolderMeta(rawEntries).map(entry => _.cloneDeep(entry));
}

function buildCompareBuckets(entries) {
  const buckets = new Map();
  (entries || []).forEach(entry => {
    const key = normalizeSortableText(entry?.name) || '未命名条目';
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(entry);
  });
  return buckets;
}

function summarizeEntryCard(entry) {
  const snapshot = getCompareEntrySnapshot(entry);
  return [
    { label: '模式', value: snapshot.mode },
    { label: '位置', value: snapshot.positionType },
    { label: '顺序', value: snapshot.order },
    { label: '关键词', value: snapshot.primaryKeywords },
    { label: '正文摘要', value: summarizeText(snapshot.content) || '(空)' },
  ];
}

function renderCompareDiffHtml(diff) {
  if (diff?.type === 'content-snippets' && Array.isArray(diff.snippets) && diff.snippets.length) {
    return diff.snippets
      .map(
        (snippet, index) => `
          <div class="preview-field">
            <strong>${_.escape(diff.label)}${diff.snippets.length > 1 ? ` #${index + 1}` : ''}</strong>
            <p class="original-text">当前: ${_.escape(snippet.before || '')}</p>
            <p class="changed-text">对比后: ${_.escape(snippet.after || '')}</p>
          </div>
        `,
      )
      .join('');
  }

  return `
    <div class="preview-field">
      <strong>${_.escape(diff.label)}</strong>
      <p class="original-text">当前: ${_.escape(formatCompareValue(diff.before))}</p>
      <p class="changed-text">对比后: ${_.escape(formatCompareValue(diff.after))}</p>
    </div>
  `;
}

function renderCompareEntryCard(item) {
  if (item.type === 'modified') {
    return `
      <div class="preview-item">
        <h5>修改: ${_.escape(item.title)} (当前 UID: ${item.baseUid} / 对比 UID: ${item.targetUid})</h5>
        ${item.diffs.map(diff => renderCompareDiffHtml(diff)).join('<hr class="diff-separator">')}
      </div>
    `;
  }

  const summaryFields = summarizeEntryCard(item.entry);
  const typeLabel = item.type === 'added' ? '新增' : '删除';
  const hint = item.type === 'added' ? '仅在对比版本中存在。' : '仅在当前版本中存在。';
  return `
    <div class="preview-item">
      <h5>${typeLabel}: ${_.escape(item.title)} (UID: ${item.uid})</h5>
      <div class="preview-field">
        <p class="changed-text">${_.escape(hint)}</p>
      </div>
      ${summaryFields
        .map(
          field => `
            <div class="preview-field">
              <strong>${_.escape(field.label)}</strong>
              <p class="${item.type === 'added' ? 'changed-text' : 'original-text'}">${_.escape(formatCompareValue(field.value))}</p>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function getActiveCompareFilter($modal) {
  return ($modal.data('compare-filter') || 'all').toString();
}

function renderCompareValuePanelV2(label, value, emptyText = '(空)') {
  return `
    <div class="compare-diff-panel">
      <div class="compare-diff-label">${_.escape(label)}</div>
      <pre>${_.escape(formatCompareValue(value) || emptyText)}</pre>
    </div>
  `;
}

function renderCompareDiffHtmlV2(diff) {
  if (diff?.type === 'content-snippets' && Array.isArray(diff.snippets) && diff.snippets.length) {
    return diff.snippets
      .map(
        (snippet, index) => `
          <div class="compare-diff-block">
            <div class="compare-diff-label">${_.escape(diff.label)}${diff.snippets.length > 1 ? ` #${index + 1}` : ''}</div>
            <div class="compare-diff-panels">
              ${renderCompareValuePanelV2('当前版本', snippet.before || '(空)')}
              ${renderCompareValuePanelV2('对比版本', snippet.after || '(空)')}
            </div>
          </div>
        `,
      )
      .join('');
  }

  return `
    <div class="compare-diff-block">
      <div class="compare-diff-label">${_.escape(diff.label)}</div>
      <div class="compare-diff-panels">
        ${renderCompareValuePanelV2('当前版本', diff.before)}
        ${renderCompareValuePanelV2('对比版本', diff.after)}
      </div>
    </div>
  `;
}

function renderCompareEntrySnapshotV2(entry, sideLabel, emptyText) {
  if (!entry) {
    return `
      <div class="compare-diff-panel">
        <div class="compare-diff-label">${_.escape(sideLabel)}</div>
        <pre class="compare-placeholder">${_.escape(emptyText)}</pre>
      </div>
    `;
  }

  const summaryFields = summarizeEntryCard(entry);
  return `
    <div class="compare-diff-panel">
      <div class="compare-diff-label">${_.escape(sideLabel)}</div>
      <pre>${_.escape(summaryFields.map(field => `${field.label}: ${formatCompareValue(field.value)}`).join('\n\n') || '(空)')}</pre>
    </div>
  `;
}

function renderCompareEntryCardV2(item, result, index) {
  const typeClass = item.type === 'modified' ? 'is-modified' : item.type === 'added' ? 'is-added' : 'is-removed';
  const typeLabel = item.type === 'modified' ? '修改' : item.type === 'added' ? '新增' : '删除';
  const compareButton = `<button type="button" data-action="open-lorebook-compare-editor" data-compare-item-index="${index}">打开对比编辑</button>`;

  if (item.type === 'modified') {
    return `
      <div class="compare-diff-item">
        <div class="compare-entry-head">
          <div>
            <div class="compare-entry-title"><span class="compare-chip ${typeClass}">${typeLabel}</span> ${_.escape(item.title)}</div>
            <div class="compare-entry-meta">当前世界书 ${_.escape(result.baseName)} · UID ${item.baseUid} ｜ 对比世界书 ${_.escape(result.targetName)} · UID ${item.targetUid}</div>
          </div>
          <div class="compare-diff-actions">${compareButton}</div>
        </div>
        ${item.diffs.map(diff => renderCompareDiffHtmlV2(diff)).join('')}
      </div>
    `;
  }

  const leftEntry = item.type === 'removed' ? item.entry : null;
  const rightEntry = item.type === 'added' ? item.entry : null;

  return `
    <div class="compare-diff-item">
      <div class="compare-entry-head">
        <div>
          <div class="compare-entry-title"><span class="compare-chip ${typeClass}">${typeLabel}</span> ${_.escape(item.title)}</div>
          <div class="compare-entry-meta">${
            item.type === 'added'
              ? `仅在对比世界书 ${_.escape(result.targetName)} 中存在 · UID ${item.uid}`
              : `仅在当前世界书 ${_.escape(result.baseName)} 中存在 · UID ${item.uid}`
          }</div>
        </div>
        <div class="compare-diff-actions">${compareButton}</div>
      </div>
      <div class="compare-diff-panels">
        ${renderCompareEntrySnapshotV2(leftEntry, '当前版本', '当前版本没有此条目。')}
        ${renderCompareEntrySnapshotV2(rightEntry, '对比版本', '对比版本没有此条目。')}
      </div>
    </div>
  `;
}

function renderCompareMetaToken(item) {
  return `
    <div class="compare-meta-token">
      <span class="compare-meta-key">${_.escape(item.label)}</span>
      <span class="compare-meta-before">${_.escape(formatCompareValue(item.before))}</span>
      <span class="compare-meta-arrow">→</span>
      <span class="compare-meta-after">${_.escape(formatCompareValue(item.after))}</span>
    </div>
  `;
}

function renderCompareInlineLineHtml(segments, changedClass) {
  if (!Array.isArray(segments) || !segments.length) {
    return '<span class="compare-inline-placeholder">&nbsp;</span>';
  }
  return segments
    .map(segment => {
      const className = segment.changed ? `compare-inline-segment ${changedClass}` : 'compare-inline-segment';
      return `<span class="${className}">${_.escape(segment.text || '')}</span>`;
    })
    .join('');
}

function renderCompareInlineColumnHtml(label, lines, changedClass, debugInfo = null) {
  const finalDebugInfo = debugInfo || getRenderedLinesDebugInfo(lines);
  if (DEBUG_MODE) {
    console.debug('[LorebookCompare][Column]', label, finalDebugInfo);
  }
  const debugAttrs = finalDebugInfo
    ? ` data-debug-raw-length="${finalDebugInfo.rawLength}"
        data-debug-line-count="${finalDebugInfo.lineCount}"
        data-debug-leading-blank-lines="${finalDebugInfo.leadingBlankLines}"
        data-debug-trailing-blank-lines="${finalDebugInfo.trailingBlankLines}"
        data-debug-first-line-length="${finalDebugInfo.firstLineLength}"
        data-debug-last-line-length="${finalDebugInfo.lastLineLength}"
        data-debug-starts-with-newline="${finalDebugInfo.startsWithNewline ? 'true' : 'false'}"
        data-debug-ends-with-newline="${finalDebugInfo.endsWithNewline ? 'true' : 'false'}"
        data-debug-summary="${_.escape(formatContentDebugSummary(finalDebugInfo))}"`
    : '';
  return `<div class="compare-inline-column"><div class="compare-inline-column-header">${_.escape(label)}</div><div class="compare-inline-column-body"${debugAttrs}>${(lines || [])
    .map(line => `<div class="compare-inline-line">${renderCompareInlineLineHtml(line, changedClass)}</div>`)
    .join('')}</div></div>`;
}

function renderStaticInlineContentColumn(label, content) {
  const lines = toDiffLines(content).map(line => (line ? [{ text: line, changed: false }] : []));
  const debugInfo = getContentDebugInfo(content);
  if (DEBUG_MODE) {
    console.debug('[LorebookCompare][StaticContent]', label, debugInfo);
  }
  return renderCompareInlineColumnHtml(label, lines, '', debugInfo);
}

function renderCompareEntrySnapshotV3(entry, sideLabel, emptyText) {
  if (!entry) {
    return `<div class="compare-diff-block compare-diff-block-content"><div class="compare-diff-label">${_.escape(sideLabel)}</div><div class="compare-inline-column"><div class="compare-inline-column-header">正文</div><div class="compare-inline-column-body"><span class="compare-inline-placeholder">${_.escape(emptyText)}</span></div></div></div>`;
  }

  const snapshot = getCompareEntrySnapshot(entry);
  const metaSummaryHtml = [
    { label: '模式', before: snapshot.mode, after: snapshot.mode },
    { label: '位置', before: snapshot.positionType, after: snapshot.positionType },
    { label: '深度', before: snapshot.depth, after: snapshot.depth },
    { label: '顺序', before: snapshot.order, after: snapshot.order },
    { label: '概率', before: snapshot.probability, after: snapshot.probability },
    { label: '主关键词', before: snapshot.primaryKeywords, after: snapshot.primaryKeywords },
  ]
    .map(renderCompareMetaToken)
    .join('');

  return `
    <div class="compare-diff-block">
      <div class="compare-diff-label">${_.escape(sideLabel)}</div>
      <div class="compare-meta-summary">${metaSummaryHtml}</div>
      ${renderStaticInlineContentColumn('正文', snapshot.content)}
    </div>
  `;
}

function renderCompareDiffHtmlV3(diff) {
  if (diff?.type === 'title-change') {
    return `
      <div class="compare-diff-block">
        <div class="compare-diff-label">${_.escape(diff.label)}</div>
        <div class="compare-meta-summary">${renderCompareMetaToken(diff)}</div>
      </div>
    `;
  }

  if (diff?.type === 'meta-summary' && Array.isArray(diff.items) && diff.items.length) {
    return `
      <div class="compare-diff-block">
        <div class="compare-diff-label">${_.escape(diff.label)}</div>
        <div class="compare-meta-summary">${diff.items.map(renderCompareMetaToken).join('')}</div>
      </div>
    `;
  }

  if (diff?.type === 'content-inline-full') {
    const beforeDebugInfo = getContentDebugInfo(diff.beforeText || '');
    const afterDebugInfo = getContentDebugInfo(diff.afterText || '');
    if (DEBUG_MODE) {
      console.debug('[LorebookCompare][InlineDiff][Before]', beforeDebugInfo);
      console.debug('[LorebookCompare][InlineDiff][After]', afterDebugInfo);
    }
    return `
      <div class="compare-diff-block compare-diff-block-content">
        <div class="compare-inline-full">
          ${renderCompareInlineColumnHtml('当前版本', diff.beforeLines, 'is-removed')}
          ${renderCompareInlineColumnHtml('对比版本', diff.afterLines, 'is-added')}
        </div>
      </div>
    `;
  }

  return renderCompareDiffHtmlV2(diff);
}

function renderCompareEntryCardV3(item, result, index) {
  const compareButton = `<button type="button" data-action="open-lorebook-compare-editor" data-compare-item-index="${index}">打开对比编辑</button>`;
  if (item.type !== 'modified') {
    const typeClass = item.type === 'added' ? 'is-added' : 'is-removed';
    const typeLabel = item.type === 'added' ? '新增' : '删除';
    const leftEntry = item.type === 'removed' ? item.entry : null;
    const rightEntry = item.type === 'added' ? item.entry : null;
    return `
      <div class="compare-diff-item">
        <div class="compare-entry-head">
          <div>
            <div class="compare-entry-title"><span class="compare-chip ${typeClass}">${typeLabel}</span> ${_.escape(item.title)}</div>
            <div class="compare-entry-meta">${
              item.type === 'added'
                ? `仅在对比世界书 ${_.escape(result.targetName)} 中存在 / UID ${item.uid}`
                : `仅在当前世界书 ${_.escape(result.baseName)} 中存在 / UID ${item.uid}`
            }</div>
          </div>
          <div class="compare-diff-actions">${compareButton}</div>
        </div>
        <div class="compare-inline-full">
          ${renderCompareEntrySnapshotV3(leftEntry, '当前版本', '当前版本没有此条目。')}
          ${renderCompareEntrySnapshotV3(rightEntry, '对比版本', '对比版本没有此条目。')}
        </div>
      </div>
    `;
  }

  return `
    <div class="compare-diff-item">
      <div class="compare-entry-head">
        <div>
          <div class="compare-entry-title"><span class="compare-chip is-modified">修改</span> ${_.escape(item.title)}</div>
          <div class="compare-entry-meta">当前世界书 ${_.escape(result.baseName)} / UID ${item.baseUid} 对比世界书 ${_.escape(result.targetName)} / UID ${item.targetUid}</div>
        </div>
        <div class="compare-diff-actions">${compareButton}</div>
      </div>
      ${item.diffs.map(diff => renderCompareDiffHtmlV3(diff)).join('')}
    </div>
  `;
}

function renderLorebookCompareResult() {
  const parentDoc = window.parent.document;
  const $modal = $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc);
  const result = $modal.data('compare-result');
  const filter = getActiveCompareFilter($modal);
  const $summary = $('#lorebook-compare-preview-summary', $modal);
  const $list = $('#lorebook-compare-preview-list', $modal);

  if (!result) {
    $summary.text('暂无比对结果。');
    $list.empty();
    return;
  }

  $('.compare-filter-button', $modal).removeClass('active');
  $(`.compare-filter-button[data-compare-filter="${filter}"]`, $modal).addClass('active');

  const filteredItems = filter === 'all' ? result.items : result.items.filter(item => item.type === filter);

  $summary.html(
    `当前世界书 <strong>${_.escape(result.baseName)}</strong> 对比 <strong>${_.escape(result.targetName)}</strong>。
     新增 <strong>${result.summary.added}</strong> 条，删除 <strong>${result.summary.removed}</strong> 条，修改 <strong>${result.summary.modified}</strong> 条。`,
  );

  if (!filteredItems.length) {
    $list.html('<div class="compare-empty">当前筛选下没有差异条目。</div>');
    return;
  }

  $list.html(filteredItems.map((item, index) => renderCompareEntryCardV3(item, result, index)).join(''));
}

export function initOptimizer() {
  const parentDoc = window.parent.document;
  if ($('#lorebook-optimize-modal', parentDoc).length > 0) return;
  ensureLorebookCompareStyles();

  const optimizeModalHtml = `
        <div id="lorebook-optimize-modal" style="display:none; position: fixed; z-index: 10002; left: 0; top: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.7); overflow-y: auto; box-sizing: border-box;">
            <div id="lorebook-optimize-modal-content" style="background-color: #2c2c2c; color: #eee; padding: 0; border: 1px solid #555; width: 90%; max-width: 600px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: calc(100vh - 150px); margin: 80px auto 50px auto; box-sizing: border-box;">
                <div id="lorebook-optimize-modal-header" style="padding: 10px 15px; background-color: #3a6a8e; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <h4 id="lorebook-optimize-modal-title">世界书优化工具</h4>
                    <span class="close-button" style="font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                </div>
                <div id="lorebook-optimize-modal-body" style="padding: 15px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto;">
                    <!-- 1. 删除无用格式 -->
                    <div class="optimize-section">
                        <h5>1. 格式清理</h5>
                        <p class="description">清理选中条目内容中的多余格式：删除所有**和*。</p>
                        <div class="action-area">
                            <button data-action="run-format-cleanup">执行格式清理</button>
                        </div>
                    </div>
                    <!-- 2. 关键字修复 -->
                    <div class="optimize-section">
                        <h5>2. 关键字修复</h5>
                        <p class="description">修复并拆分因误用中文逗号（，）而未能正确识别的关键字。</p>
                        <div class="action-area">
                            <button data-action="run-keyword-fix">执行关键字修复</button>
                        </div>
                    </div>
                    <!-- 3. 排序优化 -->
                    <div class="optimize-section">
                        <h5>3. 顺序重排</h5>
                        <p class="description">为选中的、属于同一插入位置的条目，自定义起始编号和步长来重新排序。</p>
                        <div class="action-area">
                            <button data-action="run-reorder-entries-interactive">打开排序工具</button>
                        </div>
                    </div>
                    <!-- 4. 深度优化 -->
                    <div class="optimize-section">
                        <h5>4. 深度合并</h5>
                        <p class="description">将选中条目中，深度在0-10范围内的条目，全部合并到深度0，并按当前UI顺序重新排序。</p>
                        <div class="action-area">
                            <button data-action="run-depth-optimization">执行深度合并</button>
                        </div>
                    </div>
                    <!-- 5. 删除八股词 -->
                    <div class="optimize-section">
                        <h5>5. 八股词清理</h5>
                        <p class="description">输入要删除的八股词，每行一个。将从选中条目的内容中删除这些词。</p>
                        <div class="action-area" style="flex-direction: column; align-items: stretch;">
                            <textarea id="optimize-cliche-words-textarea" placeholder="输入或粘贴八股词，每行一个...">像是,如同,好像,像,就像,似乎,仿佛,可能,大概,近乎,几乎,猛地,狂野,激烈,恨不,狂喜,一丝,一些,一抹,一种,揉进身体,指甲掐进,猛地,重重地,弓起,吞噬,cố gắng,手术刀,涟漪,石子,泛白,指节发白</textarea>
                            <button data-action="run-cliche-cleanup" style="margin-top: 10px;">执行八股词清理</button>
                        </div>
                    </div>
                    <!-- 6. 全局搜索替换 -->
                    <div class="optimize-section" id="global-search-replace-area">
                        <h5>6. 全局搜索与替换</h5>
                        <p class="description">在 当前打开的世界书 的选中条目中进行搜索和替换。</p>
                        <div class="action-area" style="flex-direction: column; align-items: stretch; gap: 10px;">
                            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                                <input type="text" id="global-search-input" placeholder="要搜索的内容..." style="width: 100%; box-sizing: border-box; background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;">
                                <input type="text" id="global-replace-input" placeholder="替换为..." style="width: 100%; box-sizing: border-box; background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;">
                            </div>
                            <div class="search-scope-container" style="display: flex; gap: 15px; align-items: center; font-size: 0.9em;">
                                <strong>搜索范围:</strong>
                                <label><input type="checkbox" class="search-scope-checkbox" value="name" checked> 标题</label>
                                <label><input type="checkbox" class="search-scope-checkbox" value="content" checked> 内容</label>
                                <label><input type="checkbox" class="search-scope-checkbox" value="keys"> 关键词</label>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" id="global-search-use-regex">
                                    <span>使用正则</span>
                                </label>
                                <div style="flex-grow: 1;"></div>
                                <button data-action="preview-global-search-replace">预览</button>
                            </div>
                        </div>
                    </div>
                    <div class="optimize-section" id="lorebook-compare-area">
                        <h5>7. 世界书全本比对</h5>
                        <p class="description">对比当前打开世界书与另一份世界书的全量差异，用于查看版本之间新增、删除和修改了哪些条目。</p>
                        <div class="action-area" style="flex-direction: column; align-items: stretch; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <strong>当前世界书:</strong>
                                <span id="optimize-compare-current-lorebook">未选择</span>
                            </div>
                            <div class="global-lorebook-adder optimize-compare-adder" style="margin-bottom: 0; position: relative; display: flex; align-items: center;">
                                <div class="global-lorebook-search-wrapper" style="flex-grow: 1;">
                                    <i class="fa-solid fa-search"></i>
                                    <input type="text" id="optimize-compare-search-input" placeholder="搜索并选择对比世界书...">
                                </div>
                                <div class="add-worldbook-results" id="optimize-compare-search-results"></div>
                            </div>
                            <div style="display: flex; justify-content: flex-end;">
                                <button data-action="preview-lorebook-compare" id="preview-lorebook-compare-button">开始比对</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
  const reorderModalHtml = `
           <div id="lorebook-reorder-modal" style="display:none; position: fixed; z-index: 10003; left: 0; top: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.7); overflow-y: auto; box-sizing: border-box; justify-content: center; align-items: center;">
               <div style="background-color: #2c2c2c; color: #eee; padding: 0; border: 1px solid #555; width: 85%; max-width: 320px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; margin: auto; box-sizing: border-box;">
                   <div style="padding: 12px 15px; background-color: #3a6a8e; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                       <h4 style="margin: 0; font-size: 16px;">交互式顺序重排</h4>
                       <span class="close-button" style="font-size: 24px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
                   </div>
                   <div style="padding: 20px 15px; display: flex; flex-direction: column; gap: 16px;">
                       <div style="display: flex; justify-content: space-between; align-items: center;">
                           <label for="reorder-start-number" style="font-size: 14px;">起始编号</label>
                           <input type="number" id="reorder-start-number" value="0" style="width: 80px; background-color: #333; color: #eee; border: 1px solid #555; padding: 6px 8px; border-radius: 4px; box-sizing: border-box;">
                       </div>
                       <div style="display: flex; justify-content: space-between; align-items: center;">
                           <label for="reorder-step-number" style="font-size: 14px;">步长 (间隔)</label>
                           <input type="number" id="reorder-step-number" value="1" style="width: 80px; background-color: #333; color: #eee; border: 1px solid #555; padding: 6px 8px; border-radius: 4px; box-sizing: border-box;">
                       </div>
                       <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 5px;">
                           <button class="cancel-reorder-button" style="padding: 8px 16px; background-color: #666; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 14px;">取消</button>
                           <button id="confirm-reorder-button" style="padding: 8px 16px; background-color: #5a3a8e; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 14px;">确认重排</button>
                       </div>
                   </div>
               </div>
           </div>
       `;
  const searchPreviewModalHtml = `
           <div id="search-preview-modal" style="display:none; position: fixed; z-index: 10006; left: 0; top: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.7); overflow-y: auto; box-sizing: border-box;">
               <div style="background-color: #2c2c2c; color: #eee; padding: 0; border: 1px solid #555; width: 90%; max-width: 800px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: calc(100vh - 150px); margin: 80px auto 50px auto; box-sizing: border-box;">
                   <div style="padding: 10px 15px; background-color: #3a6a8e; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                       <h4>搜索替换预览</h4>
                       <span class="close-button" style="font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                   </div>
                   <div style="padding: 15px; max-height: 70vh; overflow-y: auto;">
                       <div id="search-preview-summary"></div>
                       <div id="search-preview-list"></div>
                   </div>
                   <div style="padding: 10px 15px; text-align: right; border-top: 1px solid #444;">
                        <button id="cancel-search-replace-button" style="padding: 8px 12px; background-color: #555; border: none; color: white; cursor: pointer; border-radius: 4px; margin-right: 10px;">取消</button>
                        <button id="confirm-search-replace-button" style="padding: 8px 12px; background-color: #5a3a8e; border: none; color: white; cursor: pointer; border-radius: 4px;">确认替换</button>
                   </div>
               </div>
           </div>
       `;
  const lorebookCompareModalHtml = `
           <div id="${LOREBOOK_COMPARE_MODAL_ID}">
               <div id="${LOREBOOK_COMPARE_MODAL_ID}-content">
                   <div id="${LOREBOOK_COMPARE_MODAL_ID}-header">
                       <h4>世界书全本比对</h4>
                       <span class="close-button">&times;</span>
                   </div>
                   <div id="${LOREBOOK_COMPARE_MODAL_ID}-body">
                       <div class="compare-toolbar">
                           <div id="lorebook-compare-preview-summary" class="compare-summary">选择两本世界书后即可查看全量差异。</div>
                           <div id="lorebook-compare-preview-filters" class="compare-toolbar-actions">
                               <button type="button" class="compare-filter-button active" data-compare-filter="all">全部</button>
                               <button type="button" class="compare-filter-button" data-compare-filter="modified">仅修改</button>
                               <button type="button" class="compare-filter-button" data-compare-filter="added">仅新增</button>
                               <button type="button" class="compare-filter-button" data-compare-filter="removed">仅删除</button>
                           </div>
                       </div>
                       <div id="lorebook-compare-preview-list" class="compare-diff-list"></div>
                   </div>
                   <div id="${LOREBOOK_COMPARE_MODAL_ID}-footer">
                       <button id="${LOREBOOK_COMPARE_MODAL_ID}-close">关闭</button>
                   </div>
               </div>
           </div>
       `;
  $('body', parentDoc)
    .append(optimizeModalHtml)
    .append(reorderModalHtml)
    .append(searchPreviewModalHtml)
    .append(lorebookCompareModalHtml);

  // 为顺序重排弹窗的关闭按钮添加事件处理
  $('#lorebook-reorder-modal .close-button, #lorebook-reorder-modal .cancel-reorder-button', parentDoc).on(
    'click',
    function () {
      $('#lorebook-reorder-modal', parentDoc).hide();
    },
  );

  // 点击弹窗外部区域关闭弹窗
  $('#lorebook-reorder-modal', parentDoc).on('click', function (e) {
    if (e.target === this) {
      $(this).hide();
    }
  });

  $(`#${LOREBOOK_COMPARE_MODAL_ID} .close-button, #${LOREBOOK_COMPARE_MODAL_ID}-close`, parentDoc).on('click', () => {
    const $modal = $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc);
    const returnContext = $modal.data('return-context');
    $modal.hide();
    if (returnContext?.selector) {
      const $returnModal = $(returnContext.selector, parentDoc);
      if ($returnModal.length) {
        $returnModal.css('display', returnContext.display || 'flex');
        if (Number.isFinite(returnContext.scrollTop)) {
          $returnModal.scrollTop(returnContext.scrollTop);
        }
      }
    }
  });

  $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc).on('click', function (e) {
    if (e.target === this) {
      const returnContext = $(this).data('return-context');
      $(this).hide();
      if (returnContext?.selector) {
        const $returnModal = $(returnContext.selector, parentDoc);
        if ($returnModal.length) {
          $returnModal.css('display', returnContext.display || 'flex');
          if (Number.isFinite(returnContext.scrollTop)) {
            $returnModal.scrollTop(returnContext.scrollTop);
          }
        }
      }
    }
  });

  $(parentDoc).on('click', `#${LOREBOOK_COMPARE_MODAL_ID} .compare-filter-button`, function () {
    const $modal = $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc);
    $modal.data('compare-filter', ($(this).attr('data-compare-filter') || 'all').trim());
    renderLorebookCompareResult();
  });

  $(parentDoc).on(
    'click',
    `#${LOREBOOK_COMPARE_MODAL_ID} [data-action="open-lorebook-compare-editor"]`,
    async function () {
      const $modal = $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc);
      const result = $modal.data('compare-result');
      const itemIndex = Number($(this).attr('data-compare-item-index'));
      const item = result?.items?.[itemIndex];
      if (!result || !item) {
        return;
      }

      const { showCompareEditorPair } = await import('../ui/contentEditor.js');
      const returnContext = {
        selector: `#${LOREBOOK_COMPARE_MODAL_ID}`,
        display: 'flex',
        modalScrollTop: $modal.scrollTop(),
        listSelector: '#lorebook-compare-preview-list',
        listScrollTop: $('#lorebook-compare-preview-list', $modal).scrollTop(),
      };
      const openComparePair = (...args) => showCompareEditorPair(...args, returnContext);
      $modal.hide();
      if (item.type === 'modified') {
        await openComparePair(
          { sourceType: 'entry', lorebookName: result.baseName, entryUid: item.baseUid },
          { sourceType: 'entry', lorebookName: result.targetName, entryUid: item.targetUid },
          `当前世界书 ${result.baseName} ↔ 对比世界书 ${result.targetName}`,
        );
      } else if (item.type === 'added') {
        await openComparePair(
          { sourceType: 'paste', title: `${result.baseName} 中无此条目`, content: '' },
          { sourceType: 'entry', lorebookName: result.targetName, entryUid: item.uid },
          `当前世界书 ${result.baseName} ↔ 对比世界书 ${result.targetName}`,
        );
      } else {
        await openComparePair(
          { sourceType: 'entry', lorebookName: result.baseName, entryUid: item.uid },
          { sourceType: 'paste', title: `${result.targetName} 中无此条目`, content: '' },
          `当前世界书 ${result.baseName} ↔ 对比世界书 ${result.targetName}`,
        );
      }
    },
  );
}

export const prepareOptimizerModal = errorCatched(async lorebookName => {
  const parentDoc = window.parent.document;
  const $modal = $('#lorebook-optimize-modal', parentDoc);
  const $current = $('#optimize-compare-current-lorebook', $modal);
  const $input = $('#optimize-compare-search-input', $modal);
  const $results = $('#optimize-compare-search-results', $modal);
  const $button = $('#preview-lorebook-compare-button', $modal);

  if (!$input.length) {
    return;
  }

  const worldbookNames = (await getWorldbookNamesSafe())
    .filter(name => normalizeSortableText(name) && name !== lorebookName)
    .sort(compareText);

  $current.text(lorebookName || '未选择');
  $modal.data('compare-base-lorebook', lorebookName || '');
  $modal.data('compare-target-lorebook', '');
  $input.val('').removeAttr('data-selected-lorebook-name');
  $results.empty().hide();
  $button.prop('disabled', worldbookNames.length === 0);
}, 'prepareOptimizerModal');

function buildLorebookCompareResult(baseName, targetName, baseEntries, targetEntries) {
  const baseBuckets = buildCompareBuckets(baseEntries);
  const targetBuckets = buildCompareBuckets(targetEntries);
  const allTitles = _.uniq([...baseBuckets.keys(), ...targetBuckets.keys()]).sort(compareText);
  const items = [];
  const summary = { added: 0, removed: 0, modified: 0 };

  allTitles.forEach(title => {
    const baseBucket = [...(baseBuckets.get(title) || [])];
    const targetBucket = [...(targetBuckets.get(title) || [])];
    const sharedCount = Math.min(baseBucket.length, targetBucket.length);

    for (let index = 0; index < sharedCount; index += 1) {
      const baseEntry = baseBucket[index];
      const targetEntry = targetBucket[index];
      const diffs = buildEntryDiffsV2(baseEntry, targetEntry);
      if (diffs.length) {
        summary.modified += 1;
        items.push({
          type: 'modified',
          title,
          baseUid: ensureNumericUID(baseEntry.uid),
          targetUid: ensureNumericUID(targetEntry.uid),
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
          entry,
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
          entry,
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

  return { baseName, targetName, summary, items };
}

export const previewLorebookCompare = errorCatched(async lorebookName => {
  const parentDoc = window.parent.document;
  const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
  const targetLorebookName = (
    $optimizeModal.data('compare-target-lorebook') ||
    $('#optimize-compare-search-input', $optimizeModal).attr('data-selected-lorebook-name') ||
    ''
  )
    .toString()
    .trim();

  if (!targetLorebookName) {
    alert('请选择一个对比目标世界书。');
    return;
  }

  if (targetLorebookName === lorebookName) {
    alert('对比目标不能与当前世界书相同。');
    return;
  }

  const [baseEntries, targetEntries] = await Promise.all([
    getComparableLorebookEntries(lorebookName),
    getComparableLorebookEntries(targetLorebookName),
  ]);

  const result = buildLorebookCompareResult(lorebookName, targetLorebookName, baseEntries, targetEntries);
  const $modal = $(`#${LOREBOOK_COMPARE_MODAL_ID}`, parentDoc);
  $modal.data('compare-result', result);
  $modal.data('compare-filter', 'all');
  $modal.data('return-context', {
    selector: '#lorebook-optimize-modal',
    display: 'flex',
    scrollTop: $optimizeModal.scrollTop(),
  });
  $optimizeModal.hide();
  renderLorebookCompareResult();
  $modal.css('display', 'flex');
}, 'previewLorebookCompare');

// 1. 格式清理
export const runFormatCleanup = errorCatched(async (lorebookName, isGlobal) => {
  const updateLogic = content => {
    if (typeof content !== 'string') return content;
    return content.replace(/\*\*/g, '').replace(/\*/g, ' ');
  };

  return await batchUpdateEntries(
    lorebookName,
    isGlobal,
    { content: updateLogic },
    '确定要对所有选中条目执行格式清理吗？',
  );
}, 'runFormatCleanup');

// 新增：关键字修复（修正版）
export const runKeywordFix = errorCatched(async (lorebookName, isGlobal) => {
  // 定义针对 keys 字段的更新逻辑
  const updateLogic = keys => {
    // 安全检查：确保我们处理的是一个数组
    if (!Array.isArray(keys)) {
      return keys;
    }

    // 使用 flatMap 来处理和“拍平”数组
    // 1. 遍历原数组中的每个 key（例如 '水果，苹果'）
    // 2. 将每个 key 按中文或英文逗号分割成一个新数组（例如 ['水果', '苹果']）
    // 3. flatMap 会将所有这些新数组合并成一个单一数组
    const newKeys = keys.flatMap(
      key =>
        typeof key === 'string'
          ? // 同时按中英文逗号分割，更具鲁棒性
            key
              .split(/[，,]/)
              .map(k => k.trim())
              .filter(Boolean)
          : [], // 如果不是字符串，则返回空数组以安全地忽略它
    );

    // 返回去重后的最终结果，以防拆分后出现重复项
    return [...new Set(newKeys)];
  };

  // 调用通用的批量更新函数
  return await batchUpdateEntries(
    lorebookName,
    isGlobal,
    { 'strategy.keys': updateLogic },
    '确定要对所有选中条目的关键字进行拆分和修复吗？',
  );
}, 'runKeywordFix');

// 2. 顺序(Order)重排
export const runReorderEntries = errorCatched(async (lorebookName, isGlobal) => {
  const selectedUids = new Set(getSelectedEntries(lorebookName));
  if (selectedUids.size < 2) {
    alert('请至少选择两个条目进行排序。');
    return false;
  }

  const selectedEntriesInOrder = (allEntriesData[lorebookName] || []).filter(entry =>
    selectedUids.has(ensureNumericUID(entry.uid)),
  );

  if (selectedEntriesInOrder.length < 2) {
    alert('请至少选择两个条目进行排序。');
    return false;
  }

  const groups = _.groupBy(selectedEntriesInOrder, entry => _.get(entry, 'position.type', 'unknown'));

  let modifiedCount = 0;
  let modifiedGroups = 0;
  let success = false;

  const result = await updateWorldbookEntries(lorebookName, entries => {
    let hasChanges = false;
    const updatedEntries = [...entries];

    for (const positionType in groups) {
      const itemsInGroup = groups[positionType];
      if (itemsInGroup.length > 1) {
        modifiedGroups++;
        const uidsInOrder = itemsInGroup.map(entry => ensureNumericUID(entry.uid));

        let currentOrder = 0;
        uidsInOrder.forEach(uid => {
          const entryIndex = updatedEntries.findIndex(e => ensureNumericUID(e.uid) === uid);
          if (entryIndex !== -1) {
            const originalEntry = updatedEntries[entryIndex];
            if (_.get(originalEntry, 'position.order') !== currentOrder) {
              const entryToUpdate = _.cloneDeep(originalEntry);
              _.set(entryToUpdate, 'position.order', currentOrder);
              updatedEntries[entryIndex] = entryToUpdate;
              hasChanges = true;
              modifiedCount++;
            }
            currentOrder++;
          }
        });
      }
    }
    if (hasChanges) success = true;
    return hasChanges ? updatedEntries : entries;
  });

  if (!result.success) {
    throw result.error || new Error('顺序重排失败');
  }

  if (modifiedCount > 0) {
    alert(`成功为 ${modifiedGroups} 个组中的 ${modifiedCount} 个条目重新排序！`);
  } else {
    alert('没有需要修改顺序的条目。请确保选中的条目属于同一插入位置且顺序需要更新。');
  }
  return success;
}, 'runReorderEntries');

// 3. 深度(Depth)合并
export const runDepthOptimization = errorCatched(async (lorebookName, isGlobal) => {
  const selectedUids = new Set(getSelectedEntries(lorebookName));

  if (selectedUids.size === 0) {
    alert('请至少选择一个条目。');
    return false;
  }

  let modifiedCount = 0;
  let success = false;
  const result = await updateWorldbookEntries(lorebookName, entries => {
    let hasChanges = false;

    const uidsInOrder = (allEntriesData[lorebookName] || [])
      .map(entry => ensureNumericUID(entry.uid))
      .filter(uid => selectedUids.has(uid));

    let currentOrder = 0;
    const updatedEntries = entries.map(entry => {
      const numericUid = ensureNumericUID(entry.uid);
      if (uidsInOrder.includes(numericUid)) {
        const positionType = _.get(entry, 'position.type');
        const currentDepth = _.get(entry, 'position.depth');

        if (positionType === 'at_depth' && currentDepth >= 1 && currentDepth <= 10) {
          const updatedEntry = _.cloneDeep(entry);
          _.set(updatedEntry, 'position.depth', 0);
          _.set(updatedEntry, 'position.order', currentOrder++);
          modifiedCount++;
          hasChanges = true;
          return updatedEntry;
        }
      }
      return entry;
    });

    if (hasChanges) success = true;
    return hasChanges ? updatedEntries : entries;
  });

  if (!result.success) {
    throw result.error || new Error('深度优化失败');
  }

  if (modifiedCount > 0) {
    alert(`成功将 ${modifiedCount} 个条目的深度合并到0！`);
  } else {
    alert('选中的条目中没有需要进行深度合并的条目。');
  }
  return success;
}, 'runDepthOptimization');

// 4. 八股词清理
export const runClicheCleanup = errorCatched(async (lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  const clicheWordsText = $('#optimize-cliche-words-textarea', parentDoc).val();
  if (!clicheWordsText.trim()) {
    alert('请输入要删除的八股词。');
    return false;
  }

  const clicheWords = clicheWordsText
    .split(/,|\n/)
    .map(word => word.trim())
    .filter(Boolean);
  if (clicheWords.length === 0) {
    alert('请输入有效的八股词。');
    return false;
  }

  const regex = new RegExp(clicheWords.map(word => _.escapeRegExp(word)).join('|'), 'g');

  const cleanupFunc = content => {
    if (typeof content !== 'string') return content;
    return content.replace(regex, '');
  };

  return await batchUpdateEntries(
    lorebookName,
    isGlobal,
    { content: cleanupFunc },
    `确定要从选中条目中删除 ${clicheWords.length} 个八股词吗？`,
  );
}, 'runClicheCleanup');

// 【新功能】全局搜索与替换的核心实现
export const previewGlobalSearchAndReplace = errorCatched(async (lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
  const $previewModal = $('#search-preview-modal', parentDoc);

  const searchTerm = $('#global-search-input', $optimizeModal).val();
  const replaceTerm = $('#global-replace-input', $optimizeModal).val();
  const scopes = $('.search-scope-checkbox:checked', $optimizeModal)
    .map((i, el) => $(el).val())
    .get();
  const useRegex = $('#global-search-use-regex', $optimizeModal).is(':checked');

  if (!searchTerm) {
    alert('请输入要搜索的内容。');
    return;
  }
  if (scopes.length === 0) {
    alert('请至少选择一个搜索范围（标题、内容或关键词）。');
    return;
  }

  // 如果使用正则，验证正则表达式是否有效
  if (useRegex) {
    try {
      new RegExp(searchTerm);
    } catch (e) {
      alert('无效的正则表达式：' + e.message);
      return;
    }
  }

  const selectedUids = getSelectedEntries(lorebookName);

  if (selectedUids.length === 0) {
    alert('请至少选择一个要操作的条目。');
    return;
  }

  const entriesToSearch = (allEntriesData[lorebookName] || []).filter(entry =>
    selectedUids.includes(ensureNumericUID(entry.uid)),
  );
  const changes = [];

  entriesToSearch.forEach(entry => {
    const entryChanges = {
      uid: entry.uid,
      name: entry.name,
      previews: [],
    };

    const createPreview = (field, text) => {
      if (typeof text !== 'string') {
        return;
      }

      // 创建搜索正则表达式
      const regexPattern = useRegex ? searchTerm : _.escapeRegExp(searchTerm);
      // 尝试使用 s 标志（dotAll），如果浏览器不支持则回退到不使用
      let localSearchRegex;
      try {
        localSearchRegex = new RegExp(regexPattern, 'gs');
      } catch (e) {
        localSearchRegex = new RegExp(regexPattern, 'g');
      }

      // 快速检查是否有匹配（用于提前退出）
      if (!localSearchRegex.test(text)) {
        return;
      }
      // 重置 lastIndex 因为 test() 会改变它
      localSearchRegex.lastIndex = 0;

      const CONTEXT_LENGTH = 20;
      const MAX_MATCHES_PER_FIELD = 50; // 每个字段最多显示50个匹配
      let match;
      const diffs = [];
      let matchCount = 0;

      while ((match = localSearchRegex.exec(text)) !== null) {
        const matchedString = match;
        if (matchedString.length === 0) {
          localSearchRegex.lastIndex++;
          continue;
        }

        // 限制匹配数量，防止字符串过长
        if (++matchCount > MAX_MATCHES_PER_FIELD) {
          diffs.push({
            original: '...',
            changed: `<em>（还有更多匹配项未显示）</em>`,
          });
          break;
        }

        const startIndex = Math.max(0, match.index - CONTEXT_LENGTH);
        const endIndex = Math.min(text.length, match.index + matchedString.length + CONTEXT_LENGTH);
        const context = text.substring(startIndex, endIndex);

        // 高亮显示原始匹配项 - 分割字符串逐段处理避免转义问题
        let matchRegexForHighlight;
        if (useRegex) {
          try {
            matchRegexForHighlight = new RegExp(searchTerm, 'gs');
          } catch (e) {
            matchRegexForHighlight = new RegExp(searchTerm, 'g');
          }
        } else {
          matchRegexForHighlight = new RegExp(_.escapeRegExp(matchedString), 'g');
        }

        let originalHighlighted = '';
        let lastIndex = 0;
        const contextMatchRegex = new RegExp(matchRegexForHighlight.source, matchRegexForHighlight.flags);
        let contextMatch;
        while ((contextMatch = contextMatchRegex.exec(context)) !== null) {
          // 防止空匹配导致无限循环
          if (contextMatch[0].length === 0) {
            contextMatchRegex.lastIndex++;
            continue;
          }
          // 添加匹配前的普通文本
          originalHighlighted += _.escape(context.substring(lastIndex, contextMatch.index));
          // 添加高亮的匹配文本
          originalHighlighted += `<span class="search-highlight">${_.escape(contextMatch[0])}</span>`;
          lastIndex = contextMatchRegex.lastIndex;
        }
        // 添加最后剩余的文本
        originalHighlighted += _.escape(context.substring(lastIndex));

        // 执行替换并高亮替换结果
        // 这里也需要使用和搜索时相同的正则标志（包括 s 标志）
        let replaceRegex;
        if (useRegex) {
          try {
            replaceRegex = new RegExp(searchTerm, 'gs');
          } catch (e) {
            replaceRegex = new RegExp(searchTerm, 'g');
          }
        } else {
          replaceRegex = new RegExp(_.escapeRegExp(matchedString), 'g');
        }
        const replacedContext = context.replace(replaceRegex, replaceTerm);

        // 对替换后的结果进行高亮
        let changedHighlighted = '';

        // 如果替换内容为空，直接转义显示结果（不需要高亮）
        if (!replaceTerm || replaceTerm.length === 0) {
          changedHighlighted = _.escape(replacedContext);
        } else {
          // 否则高亮替换后的内容
          lastIndex = 0;
          const replacedMatchRegex = new RegExp(_.escapeRegExp(replaceTerm), 'g');
          let replacedMatch;
          while ((replacedMatch = replacedMatchRegex.exec(replacedContext)) !== null) {
            // 防止空匹配导致无限循环
            if (replacedMatch[0].length === 0) {
              replacedMatchRegex.lastIndex++;
              continue;
            }
            changedHighlighted += _.escape(replacedContext.substring(lastIndex, replacedMatch.index));
            changedHighlighted += `<span class="replace-highlight">${_.escape(replacedMatch[0])}</span>`;
            lastIndex = replacedMatchRegex.lastIndex;
          }
          changedHighlighted += _.escape(replacedContext.substring(lastIndex));
        }

        diffs.push({
          original: `...${originalHighlighted}...`,
          changed: `...${changedHighlighted}...`,
        });
      }

      if (diffs.length > 0) {
        entryChanges.previews.push({
          field: field,
          diffs: diffs,
        });
      }
    };

    if (scopes.includes('name')) createPreview('标题', entry.name);
    if (scopes.includes('content')) createPreview('内容', entry.content);
    if (scopes.includes('keys')) createPreview('关键词', (entry.strategy?.keys || []).join(', '));

    if (entryChanges.previews.length > 0) {
      changes.push(entryChanges);
    }
  });

  const $summary = $('#search-preview-summary', $previewModal);
  const $list = $('#search-preview-list', $previewModal);
  $list.empty();

  if (changes.length === 0) {
    $summary.text(`在 ${entriesToSearch.length} 个选中条目中未找到任何匹配项。`);
  } else {
    let totalChanges = 0;
    changes.forEach(c => c.previews.forEach(p => (totalChanges += p.diffs.length)));
    $summary.html(`将在 <strong>${changes.length}</strong> 个条目中执行 <strong>${totalChanges}</strong> 处更改。`);

    changes.forEach(change => {
      const previewHtml = `
                <div class="preview-item">
                    <h5>条目: ${_.escape(change.name)} (UID: ${change.uid})</h5>
                    ${change.previews
                      .map(
                        p => `
                        <div class="preview-field">
                            <strong>${p.field}:</strong>
                            ${p.diffs
                              .map(
                                d => `
                                <p class="original-text">原始: ${d.original}</p>
                                <p class="changed-text">更改为: ${d.changed}</p>
                            `,
                              )
                              .join('<hr class="diff-separator">')}
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            `;
      $list.append(previewHtml);
    });
  }

  $previewModal
    .find('#confirm-search-replace-button')
    .off('click')
    .on('click', async () => {
      $previewModal.hide();
      const success = await executeGlobalSearchAndReplace(lorebookName, isGlobal);
      if (success) {
        const parentDoc = window.parent.document;
        const $entriesWrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`, parentDoc);
        if ($entriesWrapper.is(':visible')) {
          const { loadLorebookEntries } = await import('../ui/list.js');
          await loadLorebookEntries(lorebookName, $entriesWrapper, isGlobal);
        }
      }
    });

  $previewModal
    .find('#cancel-search-replace-button, .close-button')
    .off('click')
    .on('click', () => {
      $previewModal.hide();
    });

  $previewModal.css('display', 'block');
}, 'previewGlobalSearchAndReplace');

export const executeGlobalSearchAndReplace = errorCatched(async (lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
  const searchTerm = $('#global-search-input', $optimizeModal).val();
  const replaceTerm = $('#global-replace-input', $optimizeModal).val();
  const scopes = $('.search-scope-checkbox:checked', $optimizeModal)
    .map((i, el) => $(el).val())
    .get();
  const useRegex = $('#global-search-use-regex', $optimizeModal).is(':checked');

  if (!searchTerm) {
    // Although preview checks this, it's good practice to have it here too.
    return false;
  }

  // 根据是否使用正则创建搜索表达式
  const regexPattern = useRegex ? searchTerm : _.escapeRegExp(searchTerm);
  // 尝试使用 s 标志（dotAll），如果浏览器不支持则回退到不使用
  let searchRegex;
  try {
    searchRegex = new RegExp(regexPattern, 'gs');
  } catch (e) {
    searchRegex = new RegExp(regexPattern, 'g');
  }
  const updaters = {};

  if (scopes.includes('name')) {
    updaters['name'] = text => (typeof text === 'string' ? text.replace(searchRegex, replaceTerm) : text);
  }
  if (scopes.includes('content')) {
    updaters['content'] = text => (typeof text === 'string' ? text.replace(searchRegex, replaceTerm) : text);
  }
  if (scopes.includes('keys')) {
    updaters['strategy.keys'] = keys => {
      const keyString = Array.isArray(keys) ? keys.join(', ') : '';
      return keyString
        .replace(searchRegex, replaceTerm)
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
    };
  }

  if (Object.keys(updaters).length === 0) {
    alert('没有选择任何搜索范围，操作已取消。');
    return false;
  }

  // The confirmation is handled by the preview modal, so we pass null for the message.
  return await batchUpdateEntries(lorebookName, isGlobal, updaters, null);
}, 'executeGlobalSearchAndReplace');
