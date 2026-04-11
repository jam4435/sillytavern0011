import { getLorebookEntry, getWorldbookNamesSafe, getWorldbookSafe, saveEntryField } from '../api.js';
import { ensureNumericUID, errorCatched, isMobile } from '../utils.js';
import { syncManagedTextareaContent } from './largeContentPreview.js';

const STYLE_ID = 'enhanced-content-editor-styles';
const CONTENT_EDITOR_MODAL_ID = 'content-editor-modal';
const COMPARE_EDITOR_MODAL_ID = 'content-compare-modal';
const COMPARE_REFRESH_DELAY = 350;

const compareState = {
  initialized: false,
  worldbookNames: [],
  current: null,
  left: null,
  right: null,
  diffSegments: [],
  refreshTimer: null,
  primarySaveSide: 'right',
  entryCache: new Map(),
  returnContext: null,
  activeMobileTab: 'right',
};

function getParentDoc() {
  return window.parent.document;
}

function escapeHtml(value) {
  return _.escape(value ?? '');
}

function normalizeText(value) {
  return `${value ?? ''}`.replace(/\r\n/g, '\n');
}

function createEmptySide() {
  return {
    sourceType: 'paste',
    lorebookName: '',
    entryUid: '',
    title: '粘贴内容',
    content: '',
    dirty: false,
  };
}

function cloneSide(side) {
  return { ...createEmptySide(), ...(side || {}) };
}

function getSide(sideKey) {
  return sideKey === 'left' ? compareState.left : compareState.right;
}

function setSide(sideKey, side) {
  if (sideKey === 'left') {
    compareState.left = side;
  } else {
    compareState.right = side;
  }
}

function resetCompareState() {
  compareState.current = null;
  compareState.left = createEmptySide();
  compareState.right = createEmptySide();
  compareState.diffSegments = [];
  compareState.primarySaveSide = 'right';
  compareState.returnContext = null;
  compareState.activeMobileTab = 'right';
  if (compareState.refreshTimer) {
    clearTimeout(compareState.refreshTimer);
    compareState.refreshTimer = null;
  }
}

function normalizeMobileCompareTab(tab) {
  return ['left', 'diff', 'right'].includes(tab) ? tab : 'right';
}

function restoreReturnContext() {
  const context = compareState.returnContext;
  if (!context?.selector) {
    return;
  }

  const parentDoc = getParentDoc();
  const $modal = $(context.selector, parentDoc);
  if (!$modal.length) {
    return;
  }

  $modal.css('display', context.display || 'flex');
  if (Number.isFinite(context.modalScrollTop)) {
    $modal.scrollTop(context.modalScrollTop);
  }

  if (context.listSelector) {
    const $list = $(context.listSelector, $modal);
    if ($list.length && Number.isFinite(context.listScrollTop)) {
      $list.scrollTop(context.listScrollTop);
    }
  }
}

function setCompareStatus(text = '', tone = 'neutral') {
  const $status = $(`#${COMPARE_EDITOR_MODAL_ID}-status`, getParentDoc());
  if ($status.length) {
    $status.text(text).attr('data-tone', tone);
  }
}

function splitContentIntoBlocks(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { blocks: [], joiner: '\n\n' };
  }
  if (/\n\s*\n/.test(normalized)) {
    return { blocks: normalized.split(/\n{2,}/), joiner: '\n\n' };
  }
  return { blocks: normalized.split('\n'), joiner: '\n' };
}

function buildDiffSegments(leftText, rightText) {
  const leftData = splitContentIntoBlocks(leftText);
  const rightData = splitContentIntoBlocks(rightText);
  const leftBlocks = leftData.blocks;
  const rightBlocks = rightData.blocks;
  const matrix = Array.from({ length: leftBlocks.length + 1 }, () => Array(rightBlocks.length + 1).fill(0));

  for (let i = leftBlocks.length - 1; i >= 0; i -= 1) {
    for (let j = rightBlocks.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        leftBlocks[i] === rightBlocks[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const segments = [];
  let pending = null;
  let i = 0;
  let j = 0;

  const ensurePending = () => {
    if (!pending) {
      pending = { leftStart: i, leftEnd: i, rightStart: j, rightEnd: j };
    }
  };

  const flush = () => {
    if (!pending) {
      return;
    }
    segments.push({
      ...pending,
      leftText: leftBlocks.slice(pending.leftStart, pending.leftEnd).join(leftData.joiner),
      rightText: rightBlocks.slice(pending.rightStart, pending.rightEnd).join(rightData.joiner),
    });
    pending = null;
  };

  while (i < leftBlocks.length && j < rightBlocks.length) {
    if (leftBlocks[i] === rightBlocks[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      ensurePending();
      i += 1;
      pending.leftEnd = i;
    } else {
      ensurePending();
      j += 1;
      pending.rightEnd = j;
    }
  }

  while (i < leftBlocks.length) {
    ensurePending();
    i += 1;
    pending.leftEnd = i;
  }

  while (j < rightBlocks.length) {
    ensurePending();
    j += 1;
    pending.rightEnd = j;
  }

  flush();
  return segments;
}

function getRealEntrySignature(side) {
  if (!side || (side.sourceType !== 'current' && side.sourceType !== 'entry')) {
    return '';
  }
  if (!side.lorebookName || side.entryUid === '' || side.entryUid == null) {
    return '';
  }
  return `${side.lorebookName}::${ensureNumericUID(side.entryUid)}`;
}

function canSaveSide(sideKey) {
  const side = getSide(sideKey);
  const signature = getRealEntrySignature(side);
  if (!signature) {
    return false;
  }
  const otherKey = sideKey === 'left' ? 'right' : 'left';
  const otherSignature = getRealEntrySignature(getSide(otherKey));
  return !otherSignature || otherSignature !== signature || compareState.primarySaveSide === sideKey;
}

function getSideTitle(side) {
  if (side.sourceType === 'paste') {
    return side.title || '粘贴内容';
  }
  return side.title || '未命名条目';
}

function getSideSourceSummary(side) {
  return side.sourceType === 'paste'
    ? '临时内容，不保存'
    : `来源：${side.lorebookName || '-'} / UID ${side.entryUid || '-'}`;
}

function buildSourceTypeOptions(sourceType) {
  return [
    ['current', '当前条目'],
    ['entry', '世界书条目'],
    ['paste', '粘贴内容'],
  ]
    .map(([value, label]) => `<option value="${value}" ${value === sourceType ? 'selected' : ''}>${label}</option>`)
    .join('');
}

async function ensureWorldbookEntries(lorebookName) {
  if (!lorebookName) {
    return [];
  }
  if (compareState.entryCache.has(lorebookName)) {
    return compareState.entryCache.get(lorebookName) || [];
  }
  const result = await getWorldbookSafe(lorebookName);
  const entries = result?.success && Array.isArray(result.data) ? result.data : [];
  compareState.entryCache.set(lorebookName, entries);
  return entries;
}

function updateVisibleEntryContent(lorebookName, entryUid, content) {
  const parentDoc = getParentDoc();
  const uid = ensureNumericUID(entryUid);
  syncManagedTextareaContent(
    $(`.detail-editor[data-lorebook-name="${lorebookName}"][data-entry-uid="${uid}"] .detail-content-textarea`, parentDoc),
    content,
  );
  syncManagedTextareaContent(
    $(`.lorebook-entry[data-entry-lorebook="${lorebookName}"][data-entry-uid="${uid}"] .content-textarea`, parentDoc),
    content,
  );
}

function renderSingleEditor(entry) {
  const $modal = $(`#${CONTENT_EDITOR_MODAL_ID}`, getParentDoc());
  $modal.find(`#${CONTENT_EDITOR_MODAL_ID}-title`).text(entry.name || '编辑条目内容');
  $modal.find(`#${CONTENT_EDITOR_MODAL_ID}-textarea`).val(entry.content || '');
  $modal.find(`#${CONTENT_EDITOR_MODAL_ID}-error`).hide().text('');
  $modal.find(`#${CONTENT_EDITOR_MODAL_ID}-save`).text('保存').prop('disabled', false);
}

function buildSideMarkup(sideKey, paneClass = '') {
  const side = getSide(sideKey);
  const sectionClass = paneClass ? `compare-pane ${paneClass}` : 'compare-pane';
  const entries = side.sourceType === 'entry' ? compareState.entryCache.get(side.lorebookName) || [] : [];
  const worldbookOptions = compareState.worldbookNames
    .map(
      name =>
        `<option value="${escapeHtml(name)}" ${name === side.lorebookName ? 'selected' : ''}>${escapeHtml(name)}</option>`,
    )
    .join('');
  const entryOptions = entries
    .map(entry => {
      const uid = ensureNumericUID(entry.uid);
      return `<option value="${uid}" ${uid === ensureNumericUID(side.entryUid) ? 'selected' : ''}>${escapeHtml(entry.name || `UID ${uid}`)}</option>`;
    })
    .join('');

  return `
    <section class="${sectionClass}" data-side="${sideKey}">
      <div class="compare-pane-header">
        <div>
          <div class="compare-pane-caption">${sideKey === 'left' ? '左侧' : '右侧'}</div>
          <div class="compare-pane-title">${escapeHtml(getSideTitle(side))}</div>
        </div>
        ${canSaveSide(sideKey) ? `<button type="button" class="compare-side-save" data-side-save="${sideKey}" ${side.dirty ? '' : 'disabled'}>${side.dirty ? '保存此侧' : '已保存'}</button>` : ''}
      </div>
      <div class="compare-source-controls">
        <label>
          <span>来源</span>
          <select data-side-source-type="${sideKey}">${buildSourceTypeOptions(side.sourceType)}</select>
        </label>
        ${
          side.sourceType === 'entry'
            ? `
            <label>
              <span>世界书</span>
              <select data-side-worldbook="${sideKey}">${worldbookOptions}</select>
            </label>
            <label>
              <span>条目</span>
              <select data-side-entry="${sideKey}">${entryOptions}</select>
            </label>
          `
            : ''
        }
      </div>
      <textarea class="compare-editor-textarea" data-side-textarea="${sideKey}" placeholder="${side.sourceType === 'paste' ? '在此粘贴内容...' : '正文内容'}">${escapeHtml(side.content)}</textarea>
      <div class="compare-pane-status">
        <span class="compare-pane-source">${escapeHtml(getSideSourceSummary(side))}</span>
        <span class="compare-pane-dirty">${side.dirty ? '已修改' : '未修改'}</span>
      </div>
    </section>
  `;
}

function buildMobileCompareMarkup() {
  const activeTab = normalizeMobileCompareTab(compareState.activeMobileTab);
  const tabButton = (tab, label) => `
    <button
      type="button"
      class="compare-mobile-tab ${activeTab === tab ? 'is-active' : ''}"
      data-mobile-compare-tab="${tab}"
    >${label}</button>
  `;
  const activePanelMarkup =
    activeTab === 'diff'
      ? '<div class="compare-mobile-diff-list" data-mobile-diff-list="true"></div>'
      : buildSideMarkup(activeTab, 'compare-pane-mobile');

  return `
    <div class="compare-mobile-shell">
      <div class="compare-mobile-tabs" role="tablist" aria-label="\u5bf9\u6bd4\u9762\u677f">
        ${tabButton('left', '\u5de6\u4fa7')}
        ${tabButton('diff', '\u5dee\u5f02')}
        ${tabButton('right', '\u53f3\u4fa7')}
      </div>
      <div class="compare-mobile-panel" data-mobile-panel="${activeTab}">
        ${activePanelMarkup}
      </div>
    </div>
  `;
}

function syncSideUi(sideKey) {
  const side = getSide(sideKey);
  const $pane = $(`.compare-pane[data-side="${sideKey}"]`, getParentDoc());
  if (!$pane.length) {
    return;
  }

  $pane.find('.compare-pane-source').text(getSideSourceSummary(side));
  $pane.find('.compare-pane-dirty').text(side.dirty ? '已修改' : '未修改');

  const $saveButton = $pane.find(`[data-side-save="${sideKey}"]`);
  if ($saveButton.length) {
    $saveButton.prop('disabled', !side.dirty).text(side.dirty ? '保存此侧' : '已保存');
  }
}

function renderDiffListLegacy() {
  const $list = $(`#${COMPARE_EDITOR_MODAL_ID}-diff-list`, getParentDoc());
  if (!compareState.diffSegments.length) {
    $list.html('<div class="compare-empty">当前两侧内容一致。</div>');
    return;
  }

  $list.html(
    compareState.diffSegments
      .map(
        (segment, index) => `
    <div class="compare-diff-item">
      <div class="compare-diff-actions">
        <button type="button" data-adopt-side="left" data-diff-index="${index}">采纳到左侧</button>
        <button type="button" data-adopt-side="right" data-diff-index="${index}">采纳到右侧</button>
      </div>
      <div class="compare-diff-panels">
        <div class="compare-diff-panel">
          <div class="compare-diff-label">左侧片段</div>
          <pre>${escapeHtml(segment.leftText || '(空)')}</pre>
        </div>
        <div class="compare-diff-panel">
          <div class="compare-diff-label">右侧片段</div>
          <pre>${escapeHtml(segment.rightText || '(空)')}</pre>
        </div>
      </div>
    </div>
  `,
      )
      .join(''),
  );
}

function renderDiffList() {
  const mobileView = isMobile();
  const $list = mobileView
    ? $(`[data-mobile-diff-list]`, getParentDoc())
    : $(`#${COMPARE_EDITOR_MODAL_ID}-diff-list`, getParentDoc());

  if (!$list.length) {
    return;
  }

  if (!compareState.diffSegments.length) {
    $list.html('<div class="compare-empty">\u5f53\u524d\u4e24\u4fa7\u5185\u5bb9\u4e00\u81f4\u3002</div>');
    return;
  }

  $list.html(
    compareState.diffSegments
      .map(
        (segment, index) => `
    <div class="compare-diff-item ${mobileView ? 'compare-mobile-diff-item' : ''}">
      <div class="compare-diff-actions">
        <button type="button" data-adopt-side="left" data-diff-index="${index}">\u91c7\u7eb3\u5230\u5de6\u4fa7</button>
        <button type="button" data-adopt-side="right" data-diff-index="${index}">\u91c7\u7eb3\u5230\u53f3\u4fa7</button>
      </div>
      <div class="compare-diff-panels ${mobileView ? 'compare-mobile-diff-stack' : ''}">
        <div class="compare-diff-panel">
          <div class="compare-diff-label">\u5de6\u4fa7\u7247\u6bb5</div>
          <pre>${escapeHtml(segment.leftText || '(\u7a7a)')}</pre>
        </div>
        <div class="compare-diff-panel">
          <div class="compare-diff-label">\u53f3\u4fa7\u7247\u6bb5</div>
          <pre>${escapeHtml(segment.rightText || '(\u7a7a)')}</pre>
        </div>
      </div>
    </div>
  `,
      )
      .join(''),
  );
}

function refreshDiffNow() {
  compareState.diffSegments = buildDiffSegments(compareState.left?.content || '', compareState.right?.content || '');
  renderDiffList();
  setCompareStatus(
    compareState.diffSegments.length ? `已识别 ${compareState.diffSegments.length} 个差异块。` : '当前两侧内容一致。',
  );
}

function scheduleDiffRefresh() {
  if (compareState.refreshTimer) {
    clearTimeout(compareState.refreshTimer);
  }
  setCompareStatus('正在刷新对比…');
  compareState.refreshTimer = window.setTimeout(() => {
    compareState.refreshTimer = null;
    refreshDiffNow();
  }, COMPARE_REFRESH_DELAY);
}

function renderCompareEditorLegacy() {
  const $modal = $(`#${COMPARE_EDITOR_MODAL_ID}`, getParentDoc());
  $modal.find(`#${COMPARE_EDITOR_MODAL_ID}-panes`).html(`${buildSideMarkup('left')}${buildSideMarkup('right')}`);
  renderDiffList();
}

function renderCompareEditor() {
  const $modal = $(`#${COMPARE_EDITOR_MODAL_ID}`, getParentDoc());
  const $panes = $modal.find(`#${COMPARE_EDITOR_MODAL_ID}-panes`);
  const $diffList = $modal.find(`#${COMPARE_EDITOR_MODAL_ID}-diff-list`);
  const mobileView = isMobile();

  $modal.toggleClass('compare-mobile-mode', mobileView);
  $panes.toggleClass('compare-panes-mobile', mobileView);

  if (mobileView) {
    compareState.activeMobileTab = normalizeMobileCompareTab(compareState.activeMobileTab);
    $panes.html(buildMobileCompareMarkup());
    $diffList.hide().empty();
  } else {
    $panes.html(`${buildSideMarkup('left')}${buildSideMarkup('right')}`);
    $diffList.show();
  }

  renderDiffList();
}

async function applySourceToSide(sideKey, sourceType, options = {}) {
  const side = cloneSide(getSide(sideKey));
  side.sourceType = sourceType;
  side.dirty = false;

  if (sourceType === 'current') {
    side.lorebookName = compareState.current.lorebookName;
    side.entryUid = compareState.current.entryUid;
    side.title = compareState.current.title;
    side.content = compareState.current.content;
  } else if (sourceType === 'entry') {
    side.lorebookName =
      options.lorebookName ||
      side.lorebookName ||
      compareState.current.lorebookName ||
      compareState.worldbookNames[0] ||
      '';
    const entries = await ensureWorldbookEntries(side.lorebookName);
    const requestedUid =
      options.entryUid != null && options.entryUid !== ''
        ? ensureNumericUID(options.entryUid)
        : ensureNumericUID(side.entryUid);
    const matched = entries.find(entry => ensureNumericUID(entry.uid) === requestedUid) || entries[0] || null;
    side.entryUid = matched ? ensureNumericUID(matched.uid) : '';
    side.title = matched?.name || '未命名条目';
    side.content = matched?.content || '';
  } else {
    side.lorebookName = '';
    side.entryUid = '';
    side.title = '粘贴内容';
    side.content = options.keepContent ? side.content : '';
  }

  setSide(sideKey, side);
}

function replaceBlocksInSide(sideKey, start, end, replacementBlocks) {
  const side = cloneSide(getSide(sideKey));
  const sideData = splitContentIntoBlocks(side.content);
  side.content = [...sideData.blocks.slice(0, start), ...replacementBlocks, ...sideData.blocks.slice(end)].join(
    sideData.joiner,
  );
  side.dirty = true;
  setSide(sideKey, side);
}

function syncDuplicateAfterSave(sideKey) {
  const otherKey = sideKey === 'left' ? 'right' : 'left';
  const side = getSide(sideKey);
  const otherSide = getSide(otherKey);
  if (getRealEntrySignature(side) && getRealEntrySignature(side) === getRealEntrySignature(otherSide)) {
    setSide(otherKey, { ...cloneSide(otherSide), content: side.content, title: side.title, dirty: false });
  }
}

async function saveCompareSide(sideKey) {
  const side = cloneSide(getSide(sideKey));
  if (!canSaveSide(sideKey)) {
    return;
  }

  const $button = $(`[data-side-save="${sideKey}"]`, getParentDoc());
  $button.prop('disabled', true).text('保存中...');

  try {
    const success = await saveEntryField(side.entryUid, side.lorebookName, 'content', side.content);
    if (!success) {
      throw new Error('保存失败');
    }

    side.dirty = false;
    setSide(sideKey, side);
    if (
      compareState.current &&
      getRealEntrySignature(side) ===
        `${compareState.current.lorebookName}::${ensureNumericUID(compareState.current.entryUid)}`
    ) {
      compareState.current = { ...compareState.current, title: side.title, content: side.content };
    }
    syncDuplicateAfterSave(sideKey);
    updateVisibleEntryContent(side.lorebookName, side.entryUid, side.content);
    renderCompareEditor();
    scheduleDiffRefresh();
    setCompareStatus(`已保存${sideKey === 'left' ? '左侧' : '右侧'}内容。`, 'success');
  } catch (error) {
    setCompareStatus(`保存失败：${error.message}`, 'error');
  }
}

async function openSingleEditor(lorebookName, entryUid) {
  const entry = await getLorebookEntry(lorebookName, entryUid);
  if (!entry) {
    alert(`无法获取 UID ${entryUid} 的条目数据。`);
    return;
  }
  const $modal = $(`#${CONTENT_EDITOR_MODAL_ID}`, getParentDoc());
  renderSingleEditor(entry);
  $modal.data('lorebook-name', lorebookName);
  $modal.data('entry-uid', ensureNumericUID(entryUid));
  $modal.css('display', 'flex');
}

async function openCompareEditor(lorebookName, entryUid) {
  const entry = await getLorebookEntry(lorebookName, entryUid);
  if (!entry) {
    alert(`无法获取 UID ${entryUid} 的条目数据。`);
    return;
  }

  resetCompareState();
  compareState.activeMobileTab = 'right';
  compareState.worldbookNames = ((await getWorldbookNamesSafe()) || []).filter(Boolean);
  compareState.current = {
    lorebookName,
    entryUid: ensureNumericUID(entryUid),
    title: entry.name || '当前条目',
    content: entry.content || '',
  };
  await ensureWorldbookEntries(lorebookName);
  await applySourceToSide('left', 'paste');
  await applySourceToSide('right', 'current');
  renderCompareEditor();
  refreshDiffNow();
  $(`#${COMPARE_EDITOR_MODAL_ID}`, getParentDoc()).css('display', 'flex');
}

async function applyPreparedSourceToSide(sideKey, source = {}) {
  const normalizedSourceType = (source.sourceType || 'paste').trim();

  if (normalizedSourceType === 'entry') {
    await applySourceToSide(sideKey, 'entry', {
      lorebookName: source.lorebookName || '',
      entryUid: source.entryUid,
    });
    const side = cloneSide(getSide(sideKey));
    if (source.title) {
      side.title = source.title;
    }
    if (typeof source.content === 'string') {
      side.content = source.content;
    }
    side.dirty = false;
    setSide(sideKey, side);
    return;
  }

  if (normalizedSourceType === 'current') {
    await applySourceToSide(sideKey, 'current');
    return;
  }

  await applySourceToSide(sideKey, 'paste', { keepContent: false });
  const side = cloneSide(getSide(sideKey));
  side.title = source.title || '临时内容';
  side.content = typeof source.content === 'string' ? source.content : '';
  side.dirty = false;
  setSide(sideKey, side);
}

async function openCompareEditorWithSources(leftSource = {}, rightSource = {}, statusText = '', returnContext = null) {
  resetCompareState();
  compareState.activeMobileTab = 'right';
  compareState.worldbookNames = ((await getWorldbookNamesSafe()) || []).filter(Boolean);
  compareState.returnContext = returnContext || null;

  const fallbackSource = [leftSource, rightSource].find(source => source && source.sourceType === 'entry') || {};
  compareState.current = {
    lorebookName: fallbackSource.lorebookName || '',
    entryUid: ensureNumericUID(fallbackSource.entryUid),
    title: fallbackSource.title || '对比来源',
    content: typeof fallbackSource.content === 'string' ? fallbackSource.content : '',
  };

  const lorebookNamesToWarm = _.uniq(
    [leftSource?.lorebookName, rightSource?.lorebookName].map(name => `${name || ''}`.trim()).filter(Boolean),
  );
  await Promise.all(lorebookNamesToWarm.map(name => ensureWorldbookEntries(name)));

  await applyPreparedSourceToSide('left', leftSource);
  await applyPreparedSourceToSide('right', rightSource);
  renderCompareEditor();
  refreshDiffNow();
  if (statusText) {
    setCompareStatus(statusText);
  }
  $(`#${COMPARE_EDITOR_MODAL_ID}`, getParentDoc()).css('display', 'flex');
}

function ensureStyles() {
  const parentDoc = getParentDoc();
  if ($(`#${STYLE_ID}`, parentDoc).length) {
    return;
  }

  $('head', parentDoc).append(`
    <style id="${STYLE_ID}">
      #${CONTENT_EDITOR_MODAL_ID},#${COMPARE_EDITOR_MODAL_ID}{display:none;position:fixed;z-index:10001;left:0;top:0;width:100vw;height:100vh;overflow-y:auto;background-color:rgba(0,0,0,.75);backdrop-filter:blur(4px);box-sizing:border-box}
      #${CONTENT_EDITOR_MODAL_ID}-content,#${COMPARE_EDITOR_MODAL_ID}-content{background:var(--panel-bg-color,#2a2a2a);color:var(--panel-text-color,#eee);border:1px solid rgba(255,255,255,.15);width:95%;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;flex-direction:column;margin:40px auto;box-sizing:border-box}
      #${CONTENT_EDITOR_MODAL_ID}-content{max-width:800px;max-height:calc(100vh - 100px)}
      #${COMPARE_EDITOR_MODAL_ID}-content{max-width:1360px;min-height:calc(100vh - 110px)}
      #${CONTENT_EDITOR_MODAL_ID}-header,#${COMPARE_EDITOR_MODAL_ID}-header{padding:15px 20px;background:var(--panel-accent-color,#5a3a8e);color:#fff;border-top-left-radius:12px;border-top-right-radius:12px;display:flex;justify-content:space-between;align-items:center}
      #${CONTENT_EDITOR_MODAL_ID}-header h4,#${COMPARE_EDITOR_MODAL_ID}-header h4{margin:0;font-size:1.05em;font-weight:600}
      #${CONTENT_EDITOR_MODAL_ID} .close-button,#${COMPARE_EDITOR_MODAL_ID} .close-button{font-size:24px;font-weight:700;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.1)}
      #${CONTENT_EDITOR_MODAL_ID}-body{padding:20px;display:flex;flex-direction:column;gap:12px;flex:1 1 auto}
      #${CONTENT_EDITOR_MODAL_ID}-textarea,#${COMPARE_EDITOR_MODAL_ID} .compare-editor-textarea,#${COMPARE_EDITOR_MODAL_ID} select{width:100%;box-sizing:border-box;background:var(--yaml-input-bg-color,#2d2d2d);color:var(--panel-text-color,#f0f0f0);border:1px solid rgba(255,255,255,.12);border-radius:8px}
      #${CONTENT_EDITOR_MODAL_ID}-textarea{min-height:400px;padding:12px;line-height:1.6;font-family:Consolas,Monaco,'Courier New',monospace}
      #${CONTENT_EDITOR_MODAL_ID}-error{display:none;color:#ff6b6b;font-size:.9em;padding:10px 12px;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:6px}
      #${CONTENT_EDITOR_MODAL_ID}-footer,#${COMPARE_EDITOR_MODAL_ID}-footer{padding:15px 20px;border-top:1px solid rgba(255,255,255,.1);background:var(--panel-entry-bg-color,rgba(0,0,0,.2));border-bottom-left-radius:12px;border-bottom-right-radius:12px;display:flex;justify-content:flex-end;align-items:center;gap:10px}
      #${CONTENT_EDITOR_MODAL_ID}-footer button,#${COMPARE_EDITOR_MODAL_ID}-footer button,#${COMPARE_EDITOR_MODAL_ID} .compare-side-save,#${COMPARE_EDITOR_MODAL_ID} .compare-toolbar button,#${COMPARE_EDITOR_MODAL_ID} .compare-diff-actions button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:.9em}
      #${CONTENT_EDITOR_MODAL_ID}-save,#${COMPARE_EDITOR_MODAL_ID} .compare-toolbar button{background:var(--panel-accent-color,#5a3a8e);color:#fff}
      #${CONTENT_EDITOR_MODAL_ID}-cancel,#${COMPARE_EDITOR_MODAL_ID}-close,#${COMPARE_EDITOR_MODAL_ID} .compare-toolbar .secondary{background:var(--panel-entry-bg-color,#555);color:#fff}
      #${COMPARE_EDITOR_MODAL_ID}-body{padding:16px 18px;display:flex;flex-direction:column;gap:14px;flex:1 1 auto}
      #${COMPARE_EDITOR_MODAL_ID} .compare-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-toolbar-actions{display:flex;gap:8px}
      #${COMPARE_EDITOR_MODAL_ID}-status[data-tone="error"]{color:#ff9b9b}
      #${COMPARE_EDITOR_MODAL_ID}-status[data-tone="success"]{color:#b5e6a7}
      #${COMPARE_EDITOR_MODAL_ID} .compare-panes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;min-height:420px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane-header,#${COMPARE_EDITOR_MODAL_ID} .compare-pane-status{display:flex;justify-content:space-between;gap:10px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane-caption,#${COMPARE_EDITOR_MODAL_ID} .compare-pane-status{font-size:12px;opacity:.8}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane-title{font-size:14px;font-weight:600;line-height:1.4;word-break:break-word}
      #${COMPARE_EDITOR_MODAL_ID} .compare-source-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-source-controls label{display:flex;flex-direction:column;gap:4px;font-size:12px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-editor-textarea{min-height:280px;padding:12px;line-height:1.6;font-family:Consolas,Monaco,'Courier New',monospace;resize:vertical}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-list{border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);padding:12px;min-height:140px;max-height:320px;overflow-y:auto}
      #${COMPARE_EDITOR_MODAL_ID} .compare-empty{text-align:center;color:rgba(255,255,255,.75);padding:18px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-item + .compare-diff-item{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-actions button{background:rgba(255,255,255,.08);color:#f0f0f0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-panel{border-radius:8px;background:rgba(0,0,0,.18);padding:10px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-label{color:var(--panel-accent-color,#9fc8e4);margin-bottom:6px;font-size:12px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-diff-panel pre{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.5;font-family:Consolas,Monaco,'Courier New',monospace}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode #${COMPARE_EDITOR_MODAL_ID}-content{width:100%;max-width:none;min-height:100vh;margin:0;border-radius:0;border:none}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode #${COMPARE_EDITOR_MODAL_ID}-header{padding:14px 16px;border-radius:0}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode #${COMPARE_EDITOR_MODAL_ID}-body{padding:12px;gap:12px}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode #${COMPARE_EDITOR_MODAL_ID}-footer{padding:12px 16px;border-radius:0}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode .compare-toolbar{flex-direction:column;align-items:stretch}
      #${COMPARE_EDITOR_MODAL_ID}.compare-mobile-mode .compare-toolbar-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;width:100%}
      #${COMPARE_EDITOR_MODAL_ID} .compare-panes.compare-panes-mobile{display:block;min-height:0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-shell{display:flex;flex-direction:column;gap:12px;min-height:0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-tab{padding:9px 10px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:.9em}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-tab.is-active{background:var(--panel-accent-color,#5a3a8e);border-color:transparent}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-panel{display:flex;flex-direction:column;gap:12px;min-height:0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane.compare-pane-mobile{min-height:0}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane.compare-pane-mobile .compare-source-controls{grid-template-columns:minmax(0,1fr)}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane.compare-pane-mobile .compare-pane-header,#${COMPARE_EDITOR_MODAL_ID} .compare-pane.compare-pane-mobile .compare-pane-status{flex-direction:column;align-items:flex-start}
      #${COMPARE_EDITOR_MODAL_ID} .compare-pane.compare-pane-mobile .compare-editor-textarea{min-height:240px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-list{display:flex;flex-direction:column;gap:12px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-item{margin:0;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.03)}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-item + .compare-mobile-diff-item{margin-top:0;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-item .compare-diff-actions{justify-content:stretch;flex-wrap:wrap;margin-bottom:10px}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-item .compare-diff-actions button{flex:1 1 calc(50% - 4px)}
      #${COMPARE_EDITOR_MODAL_ID} .compare-mobile-diff-stack{display:flex;flex-direction:column;gap:10px}
    </style>
  `);
}

function ensureMarkup() {
  const parentDoc = getParentDoc();
  if (!$(`#${CONTENT_EDITOR_MODAL_ID}`, parentDoc).length) {
    $('body', parentDoc).append(`
      <div id="${CONTENT_EDITOR_MODAL_ID}" style="display:none;">
        <div id="${CONTENT_EDITOR_MODAL_ID}-content">
          <div id="${CONTENT_EDITOR_MODAL_ID}-header">
            <h4 id="${CONTENT_EDITOR_MODAL_ID}-title">编辑条目内容</h4>
            <span class="close-button">&times;</span>
          </div>
          <div id="${CONTENT_EDITOR_MODAL_ID}-body">
            <textarea id="${CONTENT_EDITOR_MODAL_ID}-textarea" placeholder="在此输入条目内容..."></textarea>
            <div id="${CONTENT_EDITOR_MODAL_ID}-error"></div>
          </div>
          <div id="${CONTENT_EDITOR_MODAL_ID}-footer">
            <button id="${CONTENT_EDITOR_MODAL_ID}-cancel" class="lorebook-copy-cancel-btn">取消</button>
            <button id="${CONTENT_EDITOR_MODAL_ID}-save" class="lorebook-copy-confirm-btn">保存</button>
          </div>
        </div>
      </div>
    `);
  }

  if (!$(`#${COMPARE_EDITOR_MODAL_ID}`, parentDoc).length) {
    $('body', parentDoc).append(`
      <div id="${COMPARE_EDITOR_MODAL_ID}" style="display:none;">
        <div id="${COMPARE_EDITOR_MODAL_ID}-content">
          <div id="${COMPARE_EDITOR_MODAL_ID}-header">
            <h4>正文对比编辑</h4>
            <span class="close-button">&times;</span>
          </div>
          <div id="${COMPARE_EDITOR_MODAL_ID}-body">
            <div class="compare-toolbar">
              <div id="${COMPARE_EDITOR_MODAL_ID}-status">选择左右来源后即可开始对比。</div>
              <div class="compare-toolbar-actions">
                <button type="button" class="secondary" id="${COMPARE_EDITOR_MODAL_ID}-swap">交换左右</button>
                <button type="button" id="${COMPARE_EDITOR_MODAL_ID}-refresh">重新对比</button>
              </div>
            </div>
            <div id="${COMPARE_EDITOR_MODAL_ID}-panes" class="compare-panes"></div>
            <div id="${COMPARE_EDITOR_MODAL_ID}-diff-list" class="compare-diff-list"></div>
          </div>
          <div id="${COMPARE_EDITOR_MODAL_ID}-footer">
            <button id="${COMPARE_EDITOR_MODAL_ID}-close" class="lorebook-copy-cancel-btn">关闭</button>
          </div>
        </div>
      </div>
    `);
  }
}

function bindEvents() {
  if (compareState.initialized) {
    return;
  }

  const parentDoc = getParentDoc();

  $(parentDoc).on('click', `#${CONTENT_EDITOR_MODAL_ID} .close-button, #${CONTENT_EDITOR_MODAL_ID}-cancel`, () => {
    $(`#${CONTENT_EDITOR_MODAL_ID}`, parentDoc).hide();
  });

  $(`#${CONTENT_EDITOR_MODAL_ID}`, parentDoc).on('click', event => {
    if (event.target.id === CONTENT_EDITOR_MODAL_ID) {
      $(`#${CONTENT_EDITOR_MODAL_ID}`, parentDoc).hide();
    }
  });

  $(parentDoc).on('click', `#${CONTENT_EDITOR_MODAL_ID}-save`, async function () {
    const $modal = $(`#${CONTENT_EDITOR_MODAL_ID}`, parentDoc);
    const $error = $(`#${CONTENT_EDITOR_MODAL_ID}-error`, $modal);
    const lorebookName = $modal.data('lorebook-name');
    const entryUid = $modal.data('entry-uid');
    const content = $(`#${CONTENT_EDITOR_MODAL_ID}-textarea`, $modal).val();
    $(this).text('保存中...').prop('disabled', true);
    $error.hide().text('');

    try {
      const success = await saveEntryField(entryUid, lorebookName, 'content', content);
      if (!success) {
        throw new Error('保存失败，请重试。');
      }
      updateVisibleEntryContent(lorebookName, entryUid, content);
      $modal.hide();
    } catch (error) {
      $error.text(`保存失败: ${error.message}`).show();
    } finally {
      $(this).text('保存').prop('disabled', false);
    }
  });

  $(parentDoc).on('click', `#${COMPARE_EDITOR_MODAL_ID} .close-button, #${COMPARE_EDITOR_MODAL_ID}-close`, () => {
    $(`#${COMPARE_EDITOR_MODAL_ID}`, parentDoc).hide();
    restoreReturnContext();
    resetCompareState();
  });

  $(`#${COMPARE_EDITOR_MODAL_ID}`, parentDoc).on('click', event => {
    if (event.target.id === COMPARE_EDITOR_MODAL_ID) {
      $(`#${COMPARE_EDITOR_MODAL_ID}`, parentDoc).hide();
      restoreReturnContext();
      resetCompareState();
    }
  });

  $(parentDoc)
    .on('click', '[data-mobile-compare-tab]', function () {
      compareState.activeMobileTab = normalizeMobileCompareTab($(this).attr('data-mobile-compare-tab'));
      renderCompareEditor();
    })
    .on('click', `#${COMPARE_EDITOR_MODAL_ID}-refresh`, () => {
      refreshDiffNow();
    })
    .on('click', `#${COMPARE_EDITOR_MODAL_ID}-swap`, () => {
      const left = cloneSide(compareState.left);
      compareState.left = cloneSide(compareState.right);
      compareState.right = left;
      compareState.primarySaveSide = compareState.primarySaveSide === 'left' ? 'right' : 'left';
      renderCompareEditor();
      refreshDiffNow();
    })
    .on('input', '[data-side-textarea]', function () {
      const sideKey = $(this).attr('data-side-textarea');
      const side = cloneSide(getSide(sideKey));
      side.content = $(this).val();
      side.dirty = true;
      setSide(sideKey, side);
      syncSideUi(sideKey);
      scheduleDiffRefresh();
    })
    .on('change', '[data-side-source-type]', async function () {
      const sideKey = $(this).attr('data-side-source-type');
      await applySourceToSide(sideKey, ($(this).val() || 'paste').trim());
      renderCompareEditor();
      refreshDiffNow();
    })
    .on('change', '[data-side-worldbook]', async function () {
      const sideKey = $(this).attr('data-side-worldbook');
      await applySourceToSide(sideKey, 'entry', { lorebookName: ($(this).val() || '').trim() });
      renderCompareEditor();
      refreshDiffNow();
    })
    .on('change', '[data-side-entry]', async function () {
      const sideKey = $(this).attr('data-side-entry');
      await applySourceToSide(sideKey, 'entry', {
        lorebookName: getSide(sideKey)?.lorebookName || '',
        entryUid: ($(this).val() || '').trim(),
      });
      renderCompareEditor();
      refreshDiffNow();
    })
    .on('click', '[data-adopt-side]', function () {
      const targetSide = $(this).attr('data-adopt-side');
      const sourceSide = targetSide === 'left' ? 'right' : 'left';
      const segment = compareState.diffSegments[Number($(this).attr('data-diff-index'))];
      if (!segment) {
        return;
      }
      const sourceData = splitContentIntoBlocks(getSide(sourceSide)?.content || '');
      const replacementBlocks = sourceData.blocks.slice(
        sourceSide === 'left' ? segment.leftStart : segment.rightStart,
        sourceSide === 'left' ? segment.leftEnd : segment.rightEnd,
      );
      replaceBlocksInSide(
        targetSide,
        targetSide === 'left' ? segment.leftStart : segment.rightStart,
        targetSide === 'left' ? segment.leftEnd : segment.rightEnd,
        replacementBlocks,
      );
      renderCompareEditor();
      refreshDiffNow();
    })
    .on('click', '[data-side-save]', async function () {
      await saveCompareSide($(this).attr('data-side-save'));
    });

  compareState.initialized = true;
}

export function initContentEditor() {
  ensureStyles();
  ensureMarkup();
  bindEvents();
}

export const showContentEditor = errorCatched(async (lorebookName, entryUid) => {
  await openSingleEditor(lorebookName, entryUid);
}, 'showContentEditor');

export const showCompareEditor = errorCatched(async (lorebookName, entryUid) => {
  await openCompareEditor(lorebookName, entryUid);
}, 'showCompareEditor');

export const showCompareEditorPair = errorCatched(async (leftSource, rightSource, statusText = '', returnContext = null) => {
  await openCompareEditorWithSources(leftSource, rightSource, statusText, returnContext);
}, 'showCompareEditorPair');
