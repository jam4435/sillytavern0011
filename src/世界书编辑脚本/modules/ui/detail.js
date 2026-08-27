import {
  CHARACTER_CONTENT_ID,
  CHARACTER_DETAIL_CONTAINER_ID,
  GLOBAL_CONTENT_ID,
  GLOBAL_DETAIL_CONTAINER_ID,
  LOREBOOK_PANEL_ID,
} from '../config.js';
import { saveEntryFields } from '../api.js';
import {
  addPinnedEntry,
  getPcLayoutModeSetting,
  getPcMasterDetailSplitSetting,
  removePinnedEntry,
  setPcMasterDetailSplitSetting,
} from '../settings.js';
import {
  allEntriesData,
  clearDetailEntry,
  getDetailEntry,
  getRememberedDetailEntry,
  isEntryCurrentDetail,
  setActiveLorebookGroup,
  setDetailEntry,
} from '../state.js';
import { ensureNumericUID, isMobile } from '../utils.js';
import {
  applyPositionSelectionToEntry,
  getPositionLabel,
  getPositionSelectionValue,
  isDepthPositionValue,
  POSITION_OPTIONS,
} from '../position.js';
import { buildLargeContentPreviewCardHtml, shouldPreviewLargeContent } from './largeContentPreview.js';
import { refreshSingleMasterEntryTokenBadge } from './masterEntryTokens.js';
import { createDetailSaveCoordinator } from './detailSaveCoordinator.js';

const DETAIL_STYLE_ID = 'enhanced-lorebook-detail-styles';
const AUTO_UNPIN_POSITION_FIELDS = new Set([
  'position.type',
  'position.role',
  'position.depth',
  'position.order',
  'position',
  'depth',
  'order',
]);

function escapeHtml(value) {
  return _.escape(value ?? '');
}

function getParentDoc() {
  return window.parent.document;
}

export function getTabKey(tabKeyOrGlobal) {
  if (tabKeyOrGlobal === 'character' || tabKeyOrGlobal === 'global') {
    return tabKeyOrGlobal;
  }
  return tabKeyOrGlobal ? 'global' : 'character';
}

export function isMasterDetailLayout() {
  return !isMobile() && getPcLayoutModeSetting() === 'master-detail';
}

function getDetailContainerId(tabKey) {
  return tabKey === 'global' ? GLOBAL_DETAIL_CONTAINER_ID : CHARACTER_DETAIL_CONTAINER_ID;
}

function getContentContainerId(tabKey) {
  return tabKey === 'global' ? GLOBAL_CONTENT_ID : CHARACTER_CONTENT_ID;
}

function getTabDetailContainer(tabKey) {
  return $(`#${getDetailContainerId(tabKey)}`, getParentDoc());
}

function getTabContent(tabKey) {
  return $(`#${getContentContainerId(tabKey)}`, getParentDoc());
}

function getEntryFromState(lorebookName, entryUid) {
  const entries = allEntriesData[lorebookName] || [];
  return entries.find(entry => ensureNumericUID(entry.uid) === ensureNumericUID(entryUid)) || null;
}

function updateEntryStateValue(lorebookName, entryUid, updater) {
  const entries = allEntriesData[lorebookName] || [];
  const entry = entries.find(item => ensureNumericUID(item.uid) === ensureNumericUID(entryUid));
  if (!entry) {
    return null;
  }
  updater(entry);
  return entry;
}

export const getMasterDetailPositionLabel = value => getPositionLabel(value);

function describeEntryMetaCompact(entry) {
  const positionType = getPositionLabel(entry.position || 'after_character_definition');
  const depthValue = entry.position?.depth ?? 4;
  const orderValue = entry.position?.order ?? 0;
  const probabilityValue = entry.probability ?? 100;
  const parts = [positionType];
  if (isDepthPositionValue(entry.position)) {
    parts.push(`深度 ${depthValue}`);
  }
  parts.push(`顺序 ${orderValue}`);
  parts.push(`概率 ${probabilityValue}`);
  return parts.join(' · ');
}

function describeEntryMeta(entry) {
  const strategyType = entry.strategy?.type === 'constant' ? '常驻' : '触发';
  const positionType = getPositionLabel(entry.position || 'after_character_definition');
  const orderValue = entry.position?.order ?? 0;
  return `${strategyType} · ${positionType} · 顺序 ${orderValue}`;
}

function describeMasterEntryMeta(entry) {
  const parts = [getPositionLabel(entry.position || 'after_character_definition')];
  if (isDepthPositionValue(entry.position)) {
    parts.push(`D${entry.position?.depth ?? 4}`);
  }
  parts.push(`#${entry.position?.order ?? 0}`);
  return parts.filter(Boolean).join(' · ');
}

export function syncMasterRowFromState(lorebookName, entryUid, isGlobal = false, options = {}) {
  const { refreshTokens = true } = options;
  const entry = getEntryFromState(lorebookName, entryUid);
  if (!entry) {
    return;
  }

  const parentDoc = getParentDoc();
  const $row = $(
    `.lorebook-entry-item[data-entry-lorebook="${lorebookName}"][data-entry-uid="${ensureNumericUID(entryUid)}"]`,
    parentDoc,
  );
  if (!$row.length) {
    return;
  }

  $row.attr('data-enabled', entry.enabled !== false);
  $row.attr('data-order', entry.position?.order ?? 0);
  $row.toggleClass('disabled-entry', entry.enabled === false);
  $row.toggleClass('is-current-detail', isEntryCurrentDetail(lorebookName, ensureNumericUID(entryUid), isGlobal));
  $row.find('.master-entry-title').text(entry.name || '未命名条目');
  const $titleInput = $row.find('.master-entry-title-input');
  if ($titleInput.length) {
    $titleInput.val(entry.name || '未命名条目');
  }
  const $metaPrimary = $row.find('.master-entry-meta-primary');
  if ($metaPrimary.length) {
    $metaPrimary.text(describeMasterEntryMeta(entry));
  } else {
    $row.find('.master-entry-meta').text(describeMasterEntryMeta(entry));
  }
  $row.find('[data-action="toggle-enabled"]').prop('checked', entry.enabled !== false);
  $row.find('[data-action="toggle-constant"]').prop('checked', entry.strategy?.type === 'constant');
  $row
    .find('.master-entry-mode-control .mini-toggle-slider')
    .toggleClass('constant', entry.strategy?.type === 'constant')
    .toggleClass('keyword', entry.strategy?.type !== 'constant');
  $row.find('.master-entry-enabled').text(entry.enabled === false ? '已禁用' : '已启用');
  $row.find('.master-entry-enabled').toggleClass('is-disabled', entry.enabled === false);
  $row.find('.master-entry-pin').toggle(entry.pinned === true);
  if (refreshTokens) {
    refreshSingleMasterEntryTokenBadge(lorebookName, entry, isGlobal);
  }
}

function showSaveError(message) {
  if (window.toastr?.error) {
    window.toastr.error(message);
    return;
  }
  alert(message);
}

function showSaveSuccess(message) {
  if (window.toastr?.success) {
    window.toastr.success(message);
  }
}

function applyPanelSplitWidth(width) {
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, getParentDoc());
  if ($panel.length) {
    $panel.css('--master-pane-width', `${width}%`);
  }
}

function renderEmptyState(tabKey, text = '请选择左侧条目') {
  const $container = getTabDetailContainer(tabKey);
  $container.html(`
    <div class="detail-empty-state">
      <div class="detail-empty-title">${escapeHtml(text)}</div>
      <p>右侧会显示可即时保存的条目编辑面板。</p>
    </div>
  `);
}

function renderMissingState(tabKey) {
  renderEmptyState(tabKey, '当前条目已失效');
}

function buildSelectOptions(options, currentValue) {
  return options
    .map(
      option =>
        `<option value="${option.value}" ${option.value === currentValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
    )
    .join('');
}

function buildDetailContentFieldMarkup(content) {
  const normalized = content || '';
  if (shouldPreviewLargeContent(normalized)) {
    return buildLargeContentPreviewCardHtml(normalized, {
      hint: '正文过长，请使用上方的全屏编辑或对比编辑查看和修改。',
    });
  }

  return `<textarea class="detail-content-textarea" rows="16" data-field="content" data-save-mode="debounced" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">${escapeHtml(normalized)}</textarea>`;
}

function renderDetailEditor(tabKey, context, entry) {
  const $container = getTabDetailContainer(tabKey);
  const strategyType = entry.strategy?.type === 'constant' ? 'constant' : 'selective';
  const positionType = entry.position?.type || 'after_character_definition';
  const positionValue = getPositionSelectionValue(entry.position || positionType);
  const positionDepth = entry.position?.depth ?? 4;
  const positionOrder = entry.position?.order ?? 0;
  const probability = entry.probability ?? 100;
  const keys = Array.isArray(entry.strategy?.keys) ? entry.strategy.keys.join(', ') : '';
  const keysSecondaryLogic = entry.strategy?.keys_secondary?.logic || 'and_any';
  const keysSecondary = Array.isArray(entry.strategy?.keys_secondary?.keys)
    ? entry.strategy.keys_secondary.keys.join(', ')
    : '';
  const preventOutgoing = entry.recursion?.prevent_outgoing === true;
  const preventIncoming = entry.recursion?.prevent_incoming === true;
  const delayRecursion = entry.recursion?.delay_until != null && entry.recursion?.delay_until !== false;
  const needsDepth = isDepthPositionValue(entry.position || positionType);

  $container.html(`
    <div class="detail-editor" data-tab-key="${tabKey}" data-lorebook-name="${escapeHtml(context.lorebookName)}" data-entry-uid="${ensureNumericUID(context.entryUid)}" data-is-global="${context.isGlobal ? 'true' : 'false'}">
      <section class="detail-section detail-main-grid">
        <label class="detail-field detail-field-title">
          <span>条目名</span>
          <input type="text" value="${escapeHtml(entry.name || '')}" data-field="name" data-save-mode="debounced">
        </label>
        <label class="detail-field detail-switch-field">
          <span>启用</span>
          <input type="checkbox" ${entry.enabled === false ? '' : 'checked'} data-field="enabled" data-save-mode="immediate">
        </label>
        <label class="detail-field">
          <span>模式</span>
          <select data-field="strategy.type" data-save-mode="immediate">
            <option value="selective" ${strategyType === 'selective' ? 'selected' : ''}>触发</option>
            <option value="constant" ${strategyType === 'constant' ? 'selected' : ''}>常驻</option>
          </select>
        </label>
        <label class="detail-field">
          <span>插入位置</span>
          <select data-field="position.type" data-save-mode="immediate">
            ${buildSelectOptions(POSITION_OPTIONS, positionValue)}
          </select>
        </label>
        <label class="detail-field ${needsDepth ? '' : 'is-disabled'}" data-depth-field>
          <span>深度</span>
          <input type="number" min="0" max="10" value="${positionDepth}" ${needsDepth ? '' : 'disabled'} data-field="position.depth" data-save-mode="debounced">
        </label>
        <label class="detail-field">
          <span>顺序</span>
          <input type="number" value="${positionOrder}" data-field="position.order" data-save-mode="debounced">
        </label>
        <label class="detail-field">
          <span>概率</span>
          <input type="number" min="0" max="100" value="${probability}" data-field="probability" data-save-mode="debounced">
        </label>
      </section>
      <section class="detail-section">
        <div class="detail-section-header">
          <span>正文</span>
          <div class="detail-inline-actions">
            <button type="button" class="detail-inline-button" data-detail-action="open-content-editor">全屏编辑</button>
            <button type="button" class="detail-inline-button" data-detail-action="open-compare-editor">对比编辑</button>
          </div>
        </div>
        ${buildDetailContentFieldMarkup(entry.content)}
      </section>
      <details class="detail-section detail-advanced">
        <summary>高级设置</summary>
        <div class="detail-advanced-grid">
          <label class="detail-field detail-field-wide">
            <span>主关键词</span>
            <input type="text" value="${escapeHtml(keys)}" data-field="strategy.keys" data-value-type="csv" data-save-mode="debounced">
          </label>
          <label class="detail-field">
            <span>次关键词逻辑</span>
            <select data-field="strategy.keys_secondary.logic" data-save-mode="immediate">
              <option value="and_any" ${keysSecondaryLogic === 'and_any' ? 'selected' : ''}>与任意</option>
              <option value="and_all" ${keysSecondaryLogic === 'and_all' ? 'selected' : ''}>与全部</option>
              <option value="not_all" ${keysSecondaryLogic === 'not_all' ? 'selected' : ''}>排除全部</option>
              <option value="not_any" ${keysSecondaryLogic === 'not_any' ? 'selected' : ''}>排除任意</option>
            </select>
          </label>
          <label class="detail-field detail-field-wide">
            <span>次关键词</span>
            <input type="text" value="${escapeHtml(keysSecondary)}" data-field="strategy.keys_secondary.keys" data-value-type="csv" data-save-mode="debounced">
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${preventOutgoing ? 'checked' : ''} data-field="recursion.prevent_outgoing" data-save-mode="immediate">
            <span>阻止外向递归</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${preventIncoming ? 'checked' : ''} data-field="recursion.prevent_incoming" data-save-mode="immediate">
            <span>阻止被递归触发</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${delayRecursion ? 'checked' : ''} data-field="recursion.delay_until" data-value-type="delay" data-save-mode="immediate">
            <span>延迟到递归阶段</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${entry.pinned === true ? 'checked' : ''} data-field="pinned" data-value-type="pinned" data-save-mode="immediate">
            <span>置顶</span>
          </label>
        </div>
      </details>
    </div>
  `);
}

function renderCompactDetailEditor(tabKey, context, entry) {
  const $container = getTabDetailContainer(tabKey);
  const strategyType = entry.strategy?.type === 'constant' ? 'constant' : 'selective';
  const positionType = entry.position?.type || 'after_character_definition';
  const positionValue = getPositionSelectionValue(entry.position || positionType);
  const positionDepth = entry.position?.depth ?? 4;
  const positionOrder = entry.position?.order ?? 0;
  const probability = entry.probability ?? 100;
  const keys = Array.isArray(entry.strategy?.keys) ? entry.strategy.keys.join(', ') : '';
  const keysSecondaryLogic = entry.strategy?.keys_secondary?.logic || 'and_any';
  const keysSecondary = Array.isArray(entry.strategy?.keys_secondary?.keys)
    ? entry.strategy.keys_secondary.keys.join(', ')
    : '';
  const preventOutgoing = entry.recursion?.prevent_outgoing === true;
  const preventIncoming = entry.recursion?.prevent_incoming === true;
  const delayRecursion = entry.recursion?.delay_until != null && entry.recursion?.delay_until !== false;
  const needsDepth = isDepthPositionValue(entry.position || positionType);

  $container.html(`
    <div class="detail-editor" data-tab-key="${tabKey}" data-lorebook-name="${escapeHtml(context.lorebookName)}" data-entry-uid="${ensureNumericUID(context.entryUid)}" data-is-global="${context.isGlobal ? 'true' : 'false'}">
      <section class="detail-section detail-section-compact">
        <div class="detail-row detail-row-metrics">
          <label class="detail-field detail-field-inline">
            <span>插入位置</span>
            <select data-field="position.type" data-save-mode="immediate">
              ${buildSelectOptions(POSITION_OPTIONS, positionValue)}
            </select>
          </label>
          <label class="detail-field detail-field-inline ${needsDepth ? '' : 'is-disabled'}" data-depth-field>
            <span>深度</span>
            <input type="number" min="0" max="10" value="${positionDepth}" ${needsDepth ? '' : 'disabled'} data-field="position.depth" data-save-mode="debounced">
          </label>
          <label class="detail-field detail-field-inline">
            <span>顺序</span>
            <input type="number" value="${positionOrder}" data-field="position.order" data-save-mode="debounced">
          </label>
          <label class="detail-field detail-field-inline">
            <span>概率</span>
            <input type="number" min="0" max="100" value="${probability}" data-field="probability" data-save-mode="debounced">
          </label>
        </div>
        <div class="detail-row detail-row-keywords">
          <label class="detail-field detail-field-inline">
            <span>主关键词</span>
            <input type="text" value="${escapeHtml(keys)}" data-field="strategy.keys" data-value-type="csv" data-save-mode="debounced">
          </label>
          <label class="detail-field detail-field-inline detail-field-logic">
            <span>次关键词逻辑</span>
            <select data-field="strategy.keys_secondary.logic" data-save-mode="immediate">
              <option value="and_any" ${keysSecondaryLogic === 'and_any' ? 'selected' : ''}>与任意</option>
              <option value="and_all" ${keysSecondaryLogic === 'and_all' ? 'selected' : ''}>与全部</option>
              <option value="not_all" ${keysSecondaryLogic === 'not_all' ? 'selected' : ''}>排除全部</option>
              <option value="not_any" ${keysSecondaryLogic === 'not_any' ? 'selected' : ''}>排除任意</option>
            </select>
          </label>
          <label class="detail-field detail-field-inline">
            <span>次关键词</span>
            <input type="text" value="${escapeHtml(keysSecondary)}" data-field="strategy.keys_secondary.keys" data-value-type="csv" data-save-mode="debounced">
          </label>
        </div>
        <div class="detail-row detail-row-flags">
          <label class="detail-check-field">
            <input type="checkbox" ${preventOutgoing ? 'checked' : ''} data-field="recursion.prevent_outgoing" data-save-mode="immediate">
            <span>阻止外向递归</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${preventIncoming ? 'checked' : ''} data-field="recursion.prevent_incoming" data-save-mode="immediate">
            <span>阻止被递归触发</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${delayRecursion ? 'checked' : ''} data-field="recursion.delay_until" data-value-type="delay" data-save-mode="immediate">
            <span>延迟到递归阶段</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${entry.pinned === true ? 'checked' : ''} data-field="pinned" data-value-type="pinned" data-save-mode="immediate">
            <span>置顶</span>
          </label>
        </div>
      </section>
      <section class="detail-section">
        <div class="detail-section-header">
          <span>正文</span>
          <div class="detail-inline-actions">
            <button type="button" class="detail-inline-button" data-detail-action="open-content-editor">全屏编辑</button>
            <button type="button" class="detail-inline-button" data-detail-action="open-compare-editor">对比编辑</button>
          </div>
        </div>
        ${buildDetailContentFieldMarkup(entry.content)}
      </section>
    </div>
  `);
}

function renderCompactDetailEditorV2(tabKey, context, entry) {
  const $container = getTabDetailContainer(tabKey);
  const positionType = entry.position?.type || 'after_character_definition';
  const positionValue = getPositionSelectionValue(entry.position || positionType);
  const positionDepth = entry.position?.depth ?? 4;
  const positionOrder = entry.position?.order ?? 0;
  const keys = Array.isArray(entry.strategy?.keys) ? entry.strategy.keys.join(', ') : '';
  const keysSecondaryLogic = entry.strategy?.keys_secondary?.logic || 'and_any';
  const keysSecondary = Array.isArray(entry.strategy?.keys_secondary?.keys)
    ? entry.strategy.keys_secondary.keys.join(', ')
    : '';
  const preventOutgoing = entry.recursion?.prevent_outgoing === true;
  const preventIncoming = entry.recursion?.prevent_incoming === true;
  const delayRecursion = entry.recursion?.delay_until != null && entry.recursion?.delay_until !== false;
  const needsDepth = isDepthPositionValue(entry.position || positionType);

  $container.html(`
    <div class="detail-editor" data-tab-key="${tabKey}" data-lorebook-name="${escapeHtml(context.lorebookName)}" data-entry-uid="${ensureNumericUID(context.entryUid)}" data-is-global="${context.isGlobal ? 'true' : 'false'}">
      <section class="detail-section detail-section-compact detail-section-integrated">
        <div class="detail-row detail-row-metrics">
          <label class="detail-field detail-field-inline">
            <span>插入位置</span>
            <select data-field="position.type" data-save-mode="immediate">
              ${buildSelectOptions(POSITION_OPTIONS, positionValue)}
            </select>
          </label>
          <label class="detail-field detail-field-inline ${needsDepth ? '' : 'is-disabled'}" data-depth-field>
            <span>深度</span>
            <input type="number" min="0" max="10" value="${positionDepth}" ${needsDepth ? '' : 'disabled'} data-field="position.depth" data-save-mode="debounced">
          </label>
          <label class="detail-field detail-field-inline">
            <span>顺序</span>
            <input type="number" value="${positionOrder}" data-field="position.order" data-save-mode="debounced">
          </label>
        </div>
        <div class="keywords-edit-area detail-keywords-edit-area">
          <div class="keyword-group">
            <label>主关键词</label>
            <input class="keywords-input" type="text" value="${escapeHtml(keys)}" data-field="strategy.keys" data-value-type="csv" data-save-mode="debounced" placeholder="逗号分隔列表">
          </div>
          <div class="keyword-group logic-group">
            <label>逻辑</label>
            <select class="secondary-keys-logic-select" data-field="strategy.keys_secondary.logic" data-save-mode="immediate">
              <option value="and_any" ${keysSecondaryLogic === 'and_any' ? 'selected' : ''}>与任意</option>
              <option value="and_all" ${keysSecondaryLogic === 'and_all' ? 'selected' : ''}>与全部</option>
              <option value="not_all" ${keysSecondaryLogic === 'not_all' ? 'selected' : ''}>排除全部</option>
              <option value="not_any" ${keysSecondaryLogic === 'not_any' ? 'selected' : ''}>排除任意</option>
            </select>
          </div>
          <div class="keyword-group">
            <label>次关键词</label>
            <input class="secondary-keywords-input" type="text" value="${escapeHtml(keysSecondary)}" data-field="strategy.keys_secondary.keys" data-value-type="csv" data-save-mode="debounced" placeholder="逗号分隔列表">
          </div>
        </div>
        <div class="detail-row detail-row-flags detail-row-flags-integrated">
          <label class="detail-check-field">
            <input type="checkbox" ${preventOutgoing ? 'checked' : ''} data-field="recursion.prevent_outgoing" data-save-mode="immediate">
            <span>阻止外向递归</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${preventIncoming ? 'checked' : ''} data-field="recursion.prevent_incoming" data-save-mode="immediate">
            <span>阻止被递归触发</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${delayRecursion ? 'checked' : ''} data-field="recursion.delay_until" data-value-type="delay" data-save-mode="immediate">
            <span>延迟到递归阶段</span>
          </label>
          <label class="detail-check-field">
            <input type="checkbox" ${entry.pinned === true ? 'checked' : ''} data-field="pinned" data-value-type="pinned" data-save-mode="immediate">
            <span>置顶</span>
          </label>
        </div>
        <div class="detail-content-block">
          <div class="detail-content-block-header">
            <span>正文</span>
            <div class="detail-content-toolbar">
              <button type="button" class="content-edit-button detail-content-tool" data-detail-action="open-content-editor" title="在新窗口中编辑内容" aria-label="全屏编辑">
                <i class="fa-solid fa-expand"></i>
              </button>
              <button type="button" class="content-edit-button detail-content-tool" data-detail-action="open-compare-editor" title="打开对比编辑" aria-label="对比编辑">
                <i class="fa-solid fa-not-equal"></i>
              </button>
            </div>
          </div>
          ${buildDetailContentFieldMarkup(entry.content)}
        </div>
      </section>
    </div>
  `);
}

function ensureDetailStyles() {
  const parentDoc = getParentDoc();
  if ($(`#${DETAIL_STYLE_ID}`, parentDoc).length > 0) {
    return;
  }

  $('head', parentDoc).append(`
    <style id="${DETAIL_STYLE_ID}">
      #${LOREBOOK_PANEL_ID} {
        --master-pane-width: 40%;
      }
      #${LOREBOOK_PANEL_ID} .tab-workspace {
        display: flex;
        flex: 1;
        min-height: 0;
        gap: 0;
      }
      #${LOREBOOK_PANEL_ID} .workspace-master {
        flex: 0 0 var(--master-pane-width);
        min-width: 280px;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: visible;
        position: relative;
        z-index: 2;
      }
      #${LOREBOOK_PANEL_ID} .workspace-master > .list-container {
        min-height: 0;
        position: relative;
        z-index: 2;
        overflow-x: visible;
      }
      #${LOREBOOK_PANEL_ID} .workspace-detail {
        flex: 1 1 auto;
        min-width: 320px;
        min-height: 0;
        overflow-y: auto;
        border-left: 1px solid rgba(255,255,255,0.08);
        padding-left: 16px;
        position: relative;
        z-index: 0;
      }
      #${LOREBOOK_PANEL_ID} .workspace-resizer {
        width: 10px;
        cursor: col-resize;
        position: relative;
        flex: 0 0 10px;
        z-index: 1;
      }
      #${LOREBOOK_PANEL_ID} .workspace-resizer::before {
        content: '';
        position: absolute;
        top: 8px;
        bottom: 8px;
        left: 4px;
        width: 2px;
        border-radius: 2px;
        background: rgba(255,255,255,0.12);
      }
      #${LOREBOOK_PANEL_ID}[data-pc-layout-mode="drawer"] .workspace-master,
      #${LOREBOOK_PANEL_ID}[data-device-mode="mobile"] .workspace-master {
        flex: 1 1 auto;
      }
      #${LOREBOOK_PANEL_ID}[data-pc-layout-mode="drawer"] .workspace-detail,
      #${LOREBOOK_PANEL_ID}[data-pc-layout-mode="drawer"] .workspace-resizer,
      #${LOREBOOK_PANEL_ID}[data-device-mode="mobile"] .workspace-detail,
      #${LOREBOOK_PANEL_ID}[data-device-mode="mobile"] .workspace-resizer {
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item {
        display: flex;
        align-items: stretch;
        gap: 6px;
        background: var(--panel-md-entry-bg-color, var(--panel-entry-bg-color, rgba(255,255,255,0.03)));
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.06));
        border-radius: 8px;
        padding: 5px 6px;
        margin-bottom: 0;
        height: auto !important;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item.is-current-detail {
        border-color: var(--panel-accent-color);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--panel-accent-color) 45%, transparent);
        background: var(--panel-md-entry-current-bg-color, color-mix(in srgb, var(--panel-accent-color) 12%, rgba(255,255,255,0.03)));
      }
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item.entry-active {
        border-left: 4px solid #4CAF50;
        background: rgba(76,175,80,0.1);
        box-shadow: 0 0 0 1px rgba(76,175,80,0.18);
      }
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item.entry-active .master-entry-button {
        background: transparent;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item.entry-active:not(.is-current-detail) .master-entry-title,
      #${LOREBOOK_PANEL_ID} .lorebook-entry-item.master-entry-item.entry-active:not(.is-current-detail) .master-entry-meta {
        color: color-mix(in srgb, var(--panel-text-color,#eee) 88%, #7CFC88);
      }
      #${LOREBOOK_PANEL_ID} .master-entry-button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: transparent;
        border: none;
        color: inherit;
        text-align: left;
        cursor: pointer;
        min-width: 0;
        padding: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        padding-left: 2px;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-item .master-entry-controls {
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        padding-left: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        margin: 4px 0 2px;
        border-radius: 10px;
        background: var(--panel-md-entry-bg-color, rgba(255,255,255,0.045));
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.08));
      }
      #${LOREBOOK_PANEL_ID} .master-folder-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: left;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-label {
        min-width: 0;
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-title {
        font-weight: 600;
        overflow: hidden;
        text-overflow: var(--lorebook-name-text-overflow);
        white-space: var(--lorebook-name-white-space);
        overflow-wrap: var(--lorebook-name-overflow-wrap);
        word-break: var(--lorebook-name-word-break);
      }
      #${LOREBOOK_PANEL_ID} .master-folder-meta {
        font-size: 0.78em;
        opacity: 0.68;
        white-space: nowrap;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-chevron {
        font-size: 0.78em;
        opacity: 0.75;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-icon {
        color: #d8b24d;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-checkbox {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-action-button {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.12));
        background: var(--panel-surface-raised-color, var(--panel-entry-bg-color, rgba(255,255,255,0.06)));
        color: inherit;
        cursor: pointer;
        padding: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-folder-entries {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0 0 8px 14px;
        padding-left: 14px;
        border-left: 1px solid var(--panel-border-color, rgba(255,255,255,0.08));
      }
      #${LOREBOOK_PANEL_ID} .master-entry-toggle {
        margin: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-mode-control {
        display: flex;
        align-items: center;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-main {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-text {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-row {
        display: flex;
        align-items: flex-start;
        gap: 4px;
        min-width: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title {
        display: block;
        flex: 1 1 auto;
        min-width: 0;
        font-weight: 600;
        overflow: hidden;
        text-overflow: var(--lorebook-name-text-overflow);
        white-space: var(--lorebook-name-white-space);
        overflow-wrap: var(--lorebook-name-overflow-wrap);
        word-break: var(--lorebook-name-word-break);
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-input {
        display: none;
        width: auto;
        flex: 1 1 auto;
        min-width: 0;
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        border-radius: 6px;
        height: 20px;
        margin: 0;
        padding: 1px 5px;
        font-weight: 600;
        line-height: 1.2;
        box-sizing: border-box;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-input:focus {
        outline: none;
        border-color: var(--panel-accent-color);
        background: var(--panel-input-focus-bg-color, rgba(255,255,255,0.08));
      }
      #${LOREBOOK_PANEL_ID} .master-entry-item.is-editing-title .master-entry-title {
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-item.is-editing-title .master-entry-title-input {
        display: block;
        flex: 1 1 auto;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-item.is-editing-title .master-entry-title-edit-button {
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-item.is-editing-title .master-entry-title-row {
        align-items: center;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-edit-button {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 0;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(255,255,255,0.62);
        cursor: pointer;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-edit-button i {
        font-size: 10px;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-title-edit-button:hover,
      #${LOREBOOK_PANEL_ID} .master-entry-title-edit-button:focus-visible {
        color: rgba(255,255,255,0.92);
        background: var(--panel-input-focus-bg-color, rgba(255,255,255,0.08));
      }
      #${LOREBOOK_PANEL_ID} .master-entry-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px 6px;
        font-size: 0.82em;
        line-height: 1.2;
        color: color-mix(in srgb, var(--panel-text-color,#eee) 72%, transparent);
      }
      #${LOREBOOK_PANEL_ID} .master-entry-meta-primary {
        min-width: 0;
        flex: 1 1 auto;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-token {
        display: inline-flex;
        align-items: center;
        padding: 0 6px;
        min-height: 18px;
        border-radius: 999px;
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.12));
        background: var(--panel-entry-bg-color, rgba(255,255,255,0.06));
        color: inherit;
        font-size: 0.92em;
        line-height: 1;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-token[data-token-state="pending"] {
        opacity: 0.6;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-token[data-token-state="fallback"] {
        border-color: rgba(250,204,21,0.22);
        color: color-mix(in srgb, currentColor 78%, #facc15);
      }
      #${LOREBOOK_PANEL_ID} .master-entry-status {
        display: flex;
        align-items: center;
        align-self: flex-start;
        gap: 6px;
        flex-shrink: 0;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-pin {
        color: #f7c66a;
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-enabled {
        font-size: 0.8em;
        color: #7dd3fc;
      }
      #${LOREBOOK_PANEL_ID} .master-entry-enabled.is-disabled {
        color: #fca5a5;
      }
      #${LOREBOOK_PANEL_ID} .detail-empty-state {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 8px;
        color: rgba(255,255,255,0.72);
        text-align: center;
        padding: 24px;
      }
      #${LOREBOOK_PANEL_ID} .detail-empty-title {
        font-size: 1.05em;
        font-weight: 600;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-height: 100%;
      }
      #${LOREBOOK_PANEL_ID} .detail-section-compact {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #${LOREBOOK_PANEL_ID} .detail-section-integrated {
        gap: 10px;
      }
      #${LOREBOOK_PANEL_ID} .detail-row {
        display: grid;
        align-items: center;
        gap: 12px;
      }
      #${LOREBOOK_PANEL_ID} .detail-row-primary {
        grid-template-columns: minmax(0, 1.8fr) 110px 170px;
      }
      #${LOREBOOK_PANEL_ID} .detail-row-metrics {
        grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(86px, 0.7fr));
      }
      #${LOREBOOK_PANEL_ID} .detail-keywords-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 118px minmax(0, 1fr);
        align-items: end;
        gap: 10px;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area .keyword-group {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 4px;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area .keyword-group label {
        display: flex;
        align-items: center;
        min-height: 17px;
        margin: 0;
        line-height: 1.2;
        color: var(--panel-text-color);
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area.keyword-focused .keyword-group {
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area.keyword-focused .keyword-group.focused {
        display: flex;
        grid-column: 1 / -1;
        width: 100%;
      }
      #${LOREBOOK_PANEL_ID} .detail-row-metrics {
        grid-template-columns: minmax(0, 1.8fr) repeat(2, minmax(96px, 0.75fr));
      }
      #${LOREBOOK_PANEL_ID} .detail-row-keywords {
        grid-template-columns: minmax(0, 1.3fr) 170px minmax(0, 1.3fr);
      }
      #${LOREBOOK_PANEL_ID} .detail-row-flags {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 18px;
      }
      #${LOREBOOK_PANEL_ID} .detail-row-flags-integrated {
        padding-top: 4px;
        border-top: 1px solid var(--panel-border-color, rgba(255,255,255,0.06));
      }
      #${LOREBOOK_PANEL_ID} .detail-section {
        background: var(--panel-entry-bg-color, rgba(255,255,255,0.03));
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.06));
        border-radius: 10px;
        padding: 14px;
      }
      #${LOREBOOK_PANEL_ID} .detail-content-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--panel-border-color, rgba(255,255,255,0.06));
      }
      #${LOREBOOK_PANEL_ID} .detail-content-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      #${LOREBOOK_PANEL_ID} .detail-content-block-header > span {
        font-size: 0.86em;
        opacity: 0.82;
      }
      #${LOREBOOK_PANEL_ID} .detail-main-grid,
      #${LOREBOOK_PANEL_ID} .detail-advanced-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      #${LOREBOOK_PANEL_ID} .detail-field,
      #${LOREBOOK_PANEL_ID} .detail-check-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${LOREBOOK_PANEL_ID} .detail-field-inline {
        flex-direction: row;
        align-items: center;
        min-width: 0;
        gap: 10px;
      }
      #${LOREBOOK_PANEL_ID} .detail-field-inline > span {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      #${LOREBOOK_PANEL_ID} .detail-field-title,
      #${LOREBOOK_PANEL_ID} .detail-field-wide {
        grid-column: 1 / -1;
      }
      #${LOREBOOK_PANEL_ID} .detail-switch-field input[type="checkbox"] {
        width: 18px;
        height: 18px;
      }
      #${LOREBOOK_PANEL_ID} .detail-field > span,
      #${LOREBOOK_PANEL_ID} .detail-section-header > span,
      #${LOREBOOK_PANEL_ID} .detail-check-field > span {
        font-size: 0.86em;
        opacity: 0.82;
      }
      #${LOREBOOK_PANEL_ID} .detail-field input,
      #${LOREBOOK_PANEL_ID} .detail-field select,
      #${LOREBOOK_PANEL_ID} .detail-content-textarea {
        width: 100%;
        border-radius: 8px;
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.08));
        background: var(--panel-input-bg-color, rgba(0,0,0,0.22));
        color: inherit;
        padding: 10px 12px;
        box-sizing: border-box;
      }
      #${LOREBOOK_PANEL_ID} .detail-field input:focus,
      #${LOREBOOK_PANEL_ID} .detail-field select:focus,
      #${LOREBOOK_PANEL_ID} .detail-content-textarea:focus {
        outline: none;
        border-color: var(--panel-accent-color);
        background: var(--panel-input-focus-bg-color, rgba(0,0,0,0.3));
      }
      #${LOREBOOK_PANEL_ID} .detail-field-inline input,
      #${LOREBOOK_PANEL_ID} .detail-field-inline select {
        flex: 1 1 auto;
        min-width: 0;
      }
      #${LOREBOOK_PANEL_ID} .detail-row-metrics .detail-field-inline input,
      #${LOREBOOK_PANEL_ID} .detail-row-metrics .detail-field-inline select {
        height: 28px;
        padding: 3px 8px;
      }
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area .keywords-input,
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area .secondary-keywords-input,
      #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area .secondary-keys-logic-select {
        display: block;
        width: 100%;
        height: 30px;
        min-height: 30px;
        margin: 0;
        padding: 5px 8px;
        line-height: 18px;
        box-sizing: border-box;
        vertical-align: top;
      }
      #${LOREBOOK_PANEL_ID} .detail-field-boolean input[type="checkbox"] {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }
      #${LOREBOOK_PANEL_ID} .detail-field.is-disabled input {
        opacity: 0.5;
      }
      #${LOREBOOK_PANEL_ID} .detail-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      #${LOREBOOK_PANEL_ID} .detail-inline-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${LOREBOOK_PANEL_ID} .detail-inline-button {
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.12));
        background: var(--panel-surface-raised-color, var(--panel-entry-bg-color, rgba(255,255,255,0.06)));
        color: inherit;
        border-radius: 999px;
        padding: 6px 10px;
        cursor: pointer;
      }
      #${LOREBOOK_PANEL_ID} .detail-content-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: 0;
      }
      #${LOREBOOK_PANEL_ID} .detail-content-tool {
        margin-left: 0;
      }
      #${LOREBOOK_PANEL_ID} .detail-content-textarea {
        min-height: 320px;
        resize: vertical;
        font-family: inherit;
        line-height: 1.6;
      }
      #${LOREBOOK_PANEL_ID} .detail-advanced summary {
        cursor: pointer;
        font-weight: 600;
        margin-bottom: 12px;
      }
      #${LOREBOOK_PANEL_ID} .detail-check-field {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout {
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
        z-index: 12;
        isolation: isolate;
        overflow: visible;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout {
        flex-direction: column;
        align-items: stretch;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-main {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1 1 auto;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-main {
        width: 100%;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-main .lorebook-title-text {
        min-width: 0;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-entries-count {
        font-size: 0.72em;
        opacity: 0.8;
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
        line-height: 1.05;
        white-space: nowrap;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-entries-count .count-line {
        display: block;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-compact-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-compact-actions {
        width: 100%;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 6px;
        position: relative;
        z-index: 14;
        overflow: visible;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-search-container {
        position: relative;
        margin-left: 10px;
        min-width: 160px;
        flex: 0 1 220px;
        position: relative;
        z-index: 2;
        pointer-events: auto;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-search-input {
        width: 100%;
        min-width: 0;
        max-width: none;
        padding: 4px 10px 4px 28px;
        margin: 0;
        border: 1px solid var(--panel-border-color, #555);
        border-radius: 15px;
        background-color: var(--panel-input-bg-color, var(--search-input-bg-color, #333));
        color: var(--panel-text-color, #eee);
        font-size: 0.85em;
        position: relative;
        z-index: 2;
        pointer-events: auto;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-search-input:focus {
        outline: none;
        border-color: var(--panel-accent-color, #7a4abe);
        background-color: var(--panel-input-focus-bg-color, #3a3a3a);
        box-shadow: none;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-search-icon {
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        margin: 0;
        color: #888;
        font-size: 0.85em;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .sort-display-button,
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-batch-action-button,
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-delete-entries-button,
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-add-entry-button {
        width: 26px;
        height: 26px;
        min-width: 26px;
        border-radius: 999px;
        padding: 0;
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-batch-toggle-container {
        margin-left: 0;
        position: relative;
        z-index: 15;
      }
      #${LOREBOOK_PANEL_ID}[data-pc-layout-mode="master-detail"] .batch-toggle-dropdown {
        left: auto;
        right: 0;
        z-index: 10020;
      }
      #${LOREBOOK_PANEL_ID} .ai-action-dropdown {
        min-width: 170px;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-select-all {
        margin-left: auto;
        width: 26px;
        height: 26px;
        min-width: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-select-all .header-checkbox {
        width: 15px;
        height: 15px;
        margin: 0;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu-container {
        position: relative;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-menu-container {
        display: contents;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu-button {
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.08));
        background: var(--panel-surface-raised-color, var(--panel-entry-bg-color, rgba(255,255,255,0.05)));
        color: inherit;
        border-radius: 8px;
        width: 30px;
        height: 30px;
        cursor: pointer;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu {
        display: none;
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        min-width: 220px;
        z-index: 6;
        background: var(--panel-dropdown-bg-color, rgba(40,40,40,0.98));
        border: 1px solid var(--panel-border-color, rgba(255,255,255,0.08));
        border-radius: 10px;
        padding: 8px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.35);
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-menu-button {
        display: none;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-menu {
        display: flex;
        position: static;
        min-width: 0;
        z-index: auto;
        background: transparent;
        border: 0;
        border-radius: 0;
        padding: 0;
        box-shadow: none;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu-container.is-open .lorebook-title-menu {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title.is-master-layout .lorebook-title-menu-container.is-open .lorebook-title-menu {
        display: flex;
        grid-template-columns: none;
      }
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu .lorebook-batch-action-button,
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu .lorebook-delete-entries-button,
      #${LOREBOOK_PANEL_ID} .lorebook-title-menu .lorebook-add-entry-button {
        width: auto;
        height: 32px;
        border-radius: 8px;
        margin-left: 0;
      }
      @media (max-width: 768px) {
        #${LOREBOOK_PANEL_ID} .detail-main-grid,
        #${LOREBOOK_PANEL_ID} .detail-advanced-grid {
          grid-template-columns: 1fr;
        }
        #${LOREBOOK_PANEL_ID} .detail-editor .detail-keywords-edit-area {
          grid-template-columns: 1fr;
        }
        #${LOREBOOK_PANEL_ID} .detail-row-primary,
        #${LOREBOOK_PANEL_ID} .detail-row-metrics,
        #${LOREBOOK_PANEL_ID} .detail-row-keywords {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `);
}

function isDetailContentField($field) {
  return $field.is('.detail-content-textarea') && $field.attr('data-field') === 'content';
}

function refreshDetailContentTokenBadge($field) {
  const $editor = $field.closest('.detail-editor');
  const lorebookName = $editor.attr('data-lorebook-name');
  const entryUid = ensureNumericUID($editor.attr('data-entry-uid'));
  const isGlobal = $editor.attr('data-is-global') === 'true';
  const entry = getEntryFromState(lorebookName, entryUid);
  if (!entry) {
    return;
  }

  refreshSingleMasterEntryTokenBadge(lorebookName, entry, isGlobal);
}

function readDetailFieldValue($field) {
  const valueType = $field.attr('data-value-type');
  if (valueType === 'csv') {
    return ($field.val() || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (valueType === 'delay') {
    return $field.is(':checked') ? 1 : null;
  }
  if ($field.is(':checkbox')) {
    return $field.is(':checked');
  }
  if ($field.attr('type') === 'number') {
    const value = Number.parseInt($field.val(), 10);
    return Number.isFinite(value) ? value : undefined;
  }
  return $field.val();
}

function applySavedDetailPatches(lorebookName, patches) {
  const affectedEntries = new Map();
  patches.forEach(patch => {
    updateEntryStateValue(lorebookName, patch.entryUid, entry => {
      if (patch.fieldName === 'position.type') {
        applyPositionSelectionToEntry(entry, patch.value);
      } else {
        _.set(entry, patch.fieldName, patch.value);
      }
      if (AUTO_UNPIN_POSITION_FIELDS.has(patch.fieldName)) {
        entry.pinned = false;
      }
    });
    if (AUTO_UNPIN_POSITION_FIELDS.has(patch.fieldName)) {
      removePinnedEntry(lorebookName, patch.entryUid);
    }
    affectedEntries.set(patch.entryUid, patch.isGlobal === true);
  });

  affectedEntries.forEach((isGlobal, entryUid) => {
    syncMasterRowFromState(lorebookName, entryUid, isGlobal, { refreshTokens: false });
  });
}

const detailSaveCoordinator = createDetailSaveCoordinator({
  saveBatch: (lorebookName, patches) => saveEntryFields(lorebookName, patches, { render: 'debounced' }),
  onBatchSuccess: (lorebookName, patches) => {
    applySavedDetailPatches(lorebookName, patches);
  },
  onBatchError: () => {
    showSaveError('保存失败，修改已保留，将在下次编辑或失焦时重试');
  },
});

export function flushDetailSaves(lorebookName) {
  return lorebookName ? detailSaveCoordinator.flush(lorebookName) : detailSaveCoordinator.flushAll();
}

function queueDetailFieldSave($field, { immediate = false } = {}) {
  const $editor = $field.closest('.detail-editor');
  const lorebookName = $editor.attr('data-lorebook-name');
  const entryUid = ensureNumericUID($editor.attr('data-entry-uid'));
  const isGlobal = $editor.attr('data-is-global') === 'true';
  const fieldName = $field.attr('data-field');
  const valueType = $field.attr('data-value-type');
  const value = readDetailFieldValue($field);

  if (valueType === 'pinned') {
    const checked = $field.is(':checked');
    updateEntryStateValue(lorebookName, entryUid, entry => {
      entry.pinned = checked;
    });
    if (checked) {
      addPinnedEntry(lorebookName, entryUid);
    } else {
      removePinnedEntry(lorebookName, entryUid);
    }
    syncMasterRowFromState(lorebookName, entryUid, isGlobal, { refreshTokens: false });
    showSaveSuccess('置顶状态已更新');
    return Promise.resolve({ success: true, changed: true });
  }
  if (value === undefined || !fieldName || entryUid < 0) {
    return Promise.resolve({ success: false, changed: false });
  }

  detailSaveCoordinator.schedule({
    lorebookName,
    entryUid,
    fieldName,
    value,
    isGlobal,
  });

  if (fieldName === 'position.type') {
    const needsDepth = isDepthPositionValue(value);
    const $depthField = $editor.find('[data-depth-field]');
    $depthField.toggleClass('is-disabled', !needsDepth);
    $depthField.find('input').prop('disabled', !needsDepth);
  }
  if (immediate) {
    return detailSaveCoordinator.flush(lorebookName);
  }
  return Promise.resolve({ success: true, changed: false, queued: true });
}

function bindResizeEvents() {
  const parentDoc = getParentDoc();
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);

  $panel.off('mousedown.detailResize').on('mousedown.detailResize', '.workspace-resizer', function (event) {
    if (!isMasterDetailLayout()) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const panelWidth = $panel.width();
    const initialWidth = getPcMasterDetailSplitSetting();

    const handleMove = moveEvent => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = initialWidth + (delta / panelWidth) * 100;
      const normalized = Math.min(70, Math.max(25, nextWidth));
      applyPanelSplitWidth(normalized);
      setPcMasterDetailSplitSetting(normalized);
    };

    const handleUp = () => {
      $(parentDoc).off('mousemove.detailResize mouseup.detailResize');
    };

    $(parentDoc).on('mousemove.detailResize', handleMove);
    $(parentDoc).on('mouseup.detailResize', handleUp);
  });
}

export function syncMasterDetailSelectionInList(tabKeyOrGlobal, options = {}) {
  const { scrollIntoView = true } = options;
  const tabKey = getTabKey(tabKeyOrGlobal);
  const context = getDetailEntry(tabKey);
  const $content = getTabContent(tabKey);
  $content.find('.master-entry-item').removeClass('is-current-detail');

  if (!isMasterDetailLayout() || !context) {
    return;
  }

  const $currentRow = $content.find(
    `.master-entry-item[data-entry-lorebook="${context.lorebookName}"][data-entry-uid="${ensureNumericUID(context.entryUid)}"]`,
  );
  if ($currentRow.length) {
    $currentRow.addClass('is-current-detail');
    if (scrollIntoView) {
      window.requestAnimationFrame(() => {
        const node = $currentRow.get(0);
        if (node && $currentRow.is(':visible')) {
          node.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  }
}

export function renderDetailPane(tabKeyOrGlobal, options = {}) {
  const tabKey = getTabKey(tabKeyOrGlobal);
  const context = getDetailEntry(tabKey);

  if (!isMasterDetailLayout()) {
    getTabDetailContainer(tabKey).empty();
    return;
  }

  if (!context?.lorebookName) {
    renderEmptyState(tabKey);
    syncMasterDetailSelectionInList(tabKey, options);
    return;
  }

  const entry = getEntryFromState(context.lorebookName, context.entryUid);
  if (!entry) {
    renderMissingState(tabKey);
    syncMasterDetailSelectionInList(tabKey, options);
    return;
  }

  renderCompactDetailEditorV2(tabKey, context, entry);
  syncMasterDetailSelectionInList(tabKey, options);
}

export function selectDetailEntry({ lorebookName, entryUid, isGlobal = false }) {
  const tabKey = getTabKey(isGlobal);
  const normalizedUid = ensureNumericUID(entryUid);

  void flushDetailSaves();
  setDetailEntry(tabKey, {
    lorebookName,
    entryUid: normalizedUid,
    isGlobal,
  });
  setActiveLorebookGroup(tabKey, lorebookName);
  renderDetailPane(tabKey);
}

function findFirstVisibleEntry(tabKey) {
  const $content = getTabContent(tabKey);
  const $row = $content.find('.lorebook-entry-item:visible').first();
  if (!$row.length) {
    return null;
  }
  return {
    lorebookName: $row.attr('data-entry-lorebook'),
    entryUid: ensureNumericUID($row.attr('data-entry-uid')),
  };
}

export function restoreDetailSelection({ tabKey, lorebookNames = [], isGlobal = false }) {
  const normalizedTabKey = getTabKey(tabKey);
  const current = getDetailEntry(normalizedTabKey);

  if (current?.lorebookName && getEntryFromState(current.lorebookName, current.entryUid)) {
    setActiveLorebookGroup(normalizedTabKey, current.lorebookName);
    renderDetailPane(normalizedTabKey);
    return current;
  }

  for (const lorebookName of lorebookNames) {
    const rememberedUid = getRememberedDetailEntry(normalizedTabKey, lorebookName);
    if (rememberedUid != null && getEntryFromState(lorebookName, rememberedUid)) {
      selectDetailEntry({ lorebookName, entryUid: rememberedUid, isGlobal });
      return getDetailEntry(normalizedTabKey);
    }
  }

  const visibleFallback = findFirstVisibleEntry(normalizedTabKey);
  if (visibleFallback) {
    selectDetailEntry({ ...visibleFallback, isGlobal });
    return getDetailEntry(normalizedTabKey);
  }

  clearDetailEntry(normalizedTabKey);
  renderEmptyState(normalizedTabKey, '当前没有可见条目');
  return null;
}

export function syncPanelLayoutMode() {
  const parentDoc = getParentDoc();
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  if (!$panel.length) {
    return;
  }

  void flushDetailSaves();
  $panel.attr('data-device-mode', isMobile() ? 'mobile' : 'desktop');
  $panel.attr('data-pc-layout-mode', isMasterDetailLayout() ? 'master-detail' : 'drawer');
  applyPanelSplitWidth(getPcMasterDetailSplitSetting());
  renderDetailPane('character');
  renderDetailPane('global');
}

export function initDetailView() {
  ensureDetailStyles();
  bindResizeEvents();
  syncPanelLayoutMode();

  const parentDoc = getParentDoc();
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);

  $panel
    .off('input.detail change.detail blur.detail click.detail')
    .on('input.detail', '.detail-editor [data-save-mode="debounced"]', function () {
      const $field = $(this);
      const shouldDeferTokenRefresh = isDetailContentField($field);
      if (shouldDeferTokenRefresh) {
        $field.data('detail-content-token-dirty', true);
      }
      void queueDetailFieldSave($field);
    })
    .on('blur.detail', '.detail-editor [data-save-mode="debounced"]', async function () {
      const $field = $(this);
      const shouldRefreshTokens = isDetailContentField($field) && $field.data('detail-content-token-dirty') === true;
      const lorebookName = $field.closest('.detail-editor').attr('data-lorebook-name');
      const result = await flushDetailSaves(lorebookName);
      if (shouldRefreshTokens && result?.success !== false) {
        refreshDetailContentTokenBadge($field);
      }
      if (isDetailContentField($field)) {
        $field.removeData('detail-content-token-dirty');
      }
    })
    .on('change.detail', '.detail-editor [data-save-mode="immediate"]', function () {
      const $field = $(this);
      void queueDetailFieldSave($field, { immediate: true });
    })
    .on('focus.detail', '.detail-editor .keywords-input, .detail-editor .secondary-keywords-input', function () {
      const $input = $(this);
      const $keywordsArea = $input.closest('.keywords-edit-area');
      const $keywordGroup = $input.closest('.keyword-group');
      $keywordsArea.addClass('keyword-focused');
      $keywordsArea.find('.keyword-group').removeClass('focused');
      $keywordGroup.addClass('focused');
    })
    .on('blur.detail', '.detail-editor .keywords-input, .detail-editor .secondary-keywords-input', function () {
      const $input = $(this);
      const $keywordsArea = $input.closest('.keywords-edit-area');

      window.setTimeout(() => {
        const hasOtherFocused = $keywordsArea.find('.keywords-input:focus, .secondary-keywords-input:focus').length > 0;
        if (!hasOtherFocused) {
          $keywordsArea.removeClass('keyword-focused');
          $keywordsArea.find('.keyword-group').removeClass('focused');
        }
      }, 100);
    })
    .on('click.detail', '[data-detail-action="open-content-editor"]', async function () {
      const $editor = $(this).closest('.detail-editor');
      const lorebookName = $editor.attr('data-lorebook-name');
      await flushDetailSaves(lorebookName);
      const { showContentEditor } = await import('./contentEditor.js');
      await showContentEditor(lorebookName, ensureNumericUID($editor.attr('data-entry-uid')));
    })
    .on('click.detail', '[data-detail-action="open-compare-editor"]', async function () {
      const $editor = $(this).closest('.detail-editor');
      const lorebookName = $editor.attr('data-lorebook-name');
      await flushDetailSaves(lorebookName);
      const { showCompareEditor } = await import('./contentEditor.js');
      await showCompareEditor(lorebookName, ensureNumericUID($editor.attr('data-entry-uid')));
    })
    .on('click.detail', '.lorebook-title-menu-button', function (event) {
      event.stopPropagation();
      const $container = $(this).closest('.lorebook-title-menu-container');
      $('.lorebook-title-menu-container', parentDoc).not($container).removeClass('is-open');
      $container.toggleClass('is-open');
    })
    .on('click.detail', '.lorebook-title-menu', function (event) {
      event.stopPropagation();
    });

  $(parentDoc)
    .off('click.detailMenuClose')
    .on('click.detailMenuClose', () => {
      $('.lorebook-title-menu-container', parentDoc).removeClass('is-open');
    })
    .off('lorebook-detail-refresh.detail')
    .on('lorebook-detail-refresh.detail', (_event, isGlobal) => {
      renderDetailPane(isGlobal, { scrollIntoView: false });
    });

  $(window)
    .off('pagehide.detailSave')
    .on('pagehide.detailSave', () => {
      void flushDetailSaves();
    });
}
