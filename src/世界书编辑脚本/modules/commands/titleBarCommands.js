/**
 * 标题栏操作相关命令
 * 处理筛选、优化器、批量导入、批量操作、全选等标题栏上的操作
 */

import { createNewLorebookEntry } from '../api.js';
import { AI_TAB_ID, DEBUG_MODE } from '../config.js';
import {
  adjustSelectedEntriesPosition,
  batchUpdateEntries,
  copySelectedEntries,
  deleteSelectedEntries,
  toggleAllEntries,
} from '../features/batchActions.js';
import { handleBulkImport } from '../features/bulkImport.js';
import {
  applyEntryTogglePreset,
  createEntryTogglePresetFromCurrentState,
  deleteEntryTogglePreset,
  getEntryTogglePresetsForLorebook,
} from '../features/entryTogglePresets.js';
import { getRollbackPreview, rollbackLastTransaction } from '../features/history.js';
import { prepareOptimizerModal } from '../features/optimizer.js';
import { getAiWorkspaceSettings, setAiWorkspaceSettings } from '../settings.js';
import { getActiveFilters, getSelectedEntries, setActiveFilter } from '../state.js';
import { refreshAiWorkspace, resetAiWorkspace } from '../ui/aiWorkspace.js';
import { selectDetailEntry } from '../ui/detail.js';
import { closeFloatingBatchToggleDropdowns } from '../ui/floatingBatchDropdown.js';
import { switchTab } from '../ui/panel.js';
import {
  refreshEntryTogglePresetMenu,
  updateHeaderCheckboxState,
  updateRollbackButtonState,
  updateVirtualScroll,
} from '../ui/list.js';
import { registerCommands } from './index.js';

/**
 * 设置筛选条件
 */
function setFilter({ $target, lorebookName }) {
  const filterType = $target.data('filter-type');
  const value = $target.prop('checked');

  if (DEBUG_MODE) {
    console.log(`[Filter] ${lorebookName}: ${filterType} = ${value}`);
  }

  if (!lorebookName) {
    console.error('[Filter] 错误: lorebookName 未获取到');
  }

  setActiveFilter(lorebookName, filterType, value);

  // Refresh UI to reflect filter state
  const $dropdown = $target.closest('.filter-dropdown');
  const filters = getActiveFilters(lorebookName);
  $dropdown.find('input[type="checkbox"]').each(function () {
    const $cb = $(this);
    const type = $cb.data('filter-type');
    $cb.prop('checked', !!filters[type]);
  });

  // Reload the entries list using the efficient virtual scroll update
  updateVirtualScroll(lorebookName);
}

/**
 * 打开优化器模态框
 */
async function openOptimizer({ lorebookName, isGlobal, parentDoc }) {
  const $modal = $('#lorebook-optimize-modal', parentDoc);
  $modal.find('#lorebook-optimize-modal-title').text(`世界书优化工具: ${lorebookName}`);
  $modal.data('lorebook-name', lorebookName);
  $modal.data('is-global', isGlobal);
  await prepareOptimizerModal(lorebookName);
  $modal.css('display', 'flex');
}

/**
 * 打开批量导入模态框
 */
function bulkImport({ lorebookName, isGlobal, parentDoc, refreshList }) {
  const IMPORT_MODAL_ID = 'lorebook-import-modal';
  const $modal = $(`#${IMPORT_MODAL_ID}`, parentDoc);
  $modal.find(`#${IMPORT_MODAL_ID}-textarea`).val('');
  $modal.find(`#${IMPORT_MODAL_ID}-error`).hide();
  $modal.find(`#${IMPORT_MODAL_ID}-confirm`).text('确认导入').prop('disabled', false);
  $modal.find(`#${IMPORT_MODAL_ID}-header h4`).text(`批量导入到: ${lorebookName}`);
  $modal
    .find(`#${IMPORT_MODAL_ID}-confirm`)
    .off('click')
    .on('click', async () => {
      const success = await handleBulkImport(lorebookName, isGlobal);
      if (success) {
        refreshList(lorebookName, isGlobal);
      }
    });
  $modal.css('display', 'flex');
}

/**
 * 复制选中的条目
 */
async function copyEntries({ lorebookName, isGlobal }) {
  await copySelectedEntries(lorebookName, isGlobal);
  updateRollbackButtonState(lorebookName, isGlobal);
}

async function openAiBatchEdit({ lorebookName }) {
  const entryUids = getSelectedEntries(lorebookName);
  if (entryUids.length === 0) {
    window.toastr?.warning('请先选择至少一个条目');
    return;
  }

  const selectedCount = await openAiWorkspaceForSelectedEntries(lorebookName, 'direct');
  if (selectedCount > 0) {
    window.toastr?.success(`已打开 AI 直接修改，并载入 ${selectedCount} 个选中条目`);
  }
}

function mirrorAiWorkspaceModeToLegacyState(settings, modeKey) {
  const normalizedModeKey = ['direct', 'plan'].includes(modeKey) ? modeKey : 'direct';
  const modeState = _.cloneDeep(settings?.[normalizedModeKey] || {});

  settings.lorebookName = modeState.lorebookName || settings.lorebookName || '';
  settings.selectedEntryUids = Array.isArray(modeState.selectedEntryUids) ? [...modeState.selectedEntryUids] : [];
  settings.readonlyEntryUids = Array.isArray(modeState.readonlyEntryUids) ? [...modeState.readonlyEntryUids] : [];
  settings.planningResult = _.cloneDeep(modeState.planningResult || null);
  settings.previewResult = _.cloneDeep(modeState.previewResult || null);
  settings.statusText = modeState.statusText || '';

  return settings;
}

async function applySelectedEntriesAiParticipation(lorebookName, aiMode, modeKey = null) {
  const entryUids = getSelectedEntries(lorebookName)
    .map(uid => Number(uid))
    .filter(uid => Number.isFinite(uid));

  if (!entryUids.length) {
    window.toastr?.warning('请先选择至少一个条目');
    return false;
  }

  const applyMode = modeSettings => {
    const nextMode = _.cloneDeep(modeSettings || {});
    const selected = new Set(Array.isArray(nextMode.selectedEntryUids) ? nextMode.selectedEntryUids.map(Number) : []);
    const readonly = new Set(Array.isArray(nextMode.readonlyEntryUids) ? nextMode.readonlyEntryUids.map(Number) : []);

    if (nextMode.lorebookName && nextMode.lorebookName !== lorebookName) {
      selected.clear();
      readonly.clear();
    }

    entryUids.forEach(uid => {
      selected.delete(uid);
      readonly.delete(uid);
      if (aiMode === 'editable') {
        selected.add(uid);
      } else if (aiMode === 'readonly') {
        readonly.add(uid);
      }
    });

    nextMode.lorebookName = lorebookName;
    nextMode.selectedEntryUids = Array.from(selected);
    nextMode.readonlyEntryUids = Array.from(readonly);
    nextMode.planningResult = null;
    nextMode.previewResult = null;
    nextMode.debugInfo = null;
    nextMode.statusText = '';
    nextMode.currentStep = 'selection';
    return nextMode;
  };

  const settings = getAiWorkspaceSettings();
  settings.lorebookName = lorebookName;
  if (modeKey && ['direct', 'plan'].includes(modeKey)) {
    settings.activeMode = modeKey;
    settings.modifyStrategy = modeKey;
    settings.navMode = modeKey;
    settings[modeKey] = applyMode(settings[modeKey]);
  } else {
    settings.direct = applyMode(settings.direct);
    settings.plan = applyMode(settings.plan);
  }
  mirrorAiWorkspaceModeToLegacyState(
    settings,
    modeKey && ['direct', 'plan'].includes(modeKey) ? modeKey : settings.navMode,
  );
  setAiWorkspaceSettings(settings);

  try {
    resetAiWorkspace();
    await refreshAiWorkspace();
  } catch (error) {
    console.warn('[AI Workspace] refresh failed after applying AI participation.', error);
  }

  const labelMap = {
    none: '不参与',
    readonly: 'AI只读',
    editable: 'AI修改',
  };
  window.toastr?.success(`已将 ${entryUids.length} 个条目设为${labelMap[aiMode] || '不参与'}`);
  return true;
}

function getSelectedNumericEntryUids(lorebookName) {
  return getSelectedEntries(lorebookName)
    .map(uid => Number(uid))
    .filter(uid => Number.isFinite(uid));
}

async function openAiWorkspaceForSelectedEntries(lorebookName, modeKey, options = {}) {
  const { preserveSelectionState = false } = options;
  const selectedEntryUids = getSelectedNumericEntryUids(lorebookName);
  const settings = getAiWorkspaceSettings();
  const nextMode = _.cloneDeep(settings[modeKey] || {});
  const isSameLorebook = nextMode.lorebookName === lorebookName;

  nextMode.lorebookName = lorebookName;

  if (!isSameLorebook) {
    nextMode.selectedEntryUids = [];
    nextMode.readonlyEntryUids = [];
    nextMode.planningResult = null;
    nextMode.previewResult = null;
    nextMode.debugInfo = null;
    nextMode.statusText = '';
    nextMode.currentStep = 'selection';
  }

  if (selectedEntryUids.length > 0 && !preserveSelectionState) {
    nextMode.selectedEntryUids = [...selectedEntryUids];
    nextMode.readonlyEntryUids = [];
    nextMode.planningResult = null;
    nextMode.previewResult = null;
    nextMode.debugInfo = null;
    nextMode.statusText = '';
    nextMode.currentStep = 'instruction';
  } else if (preserveSelectionState) {
    const selectedCount = Array.isArray(nextMode.selectedEntryUids) ? nextMode.selectedEntryUids.length : 0;
    const readonlyCount = Array.isArray(nextMode.readonlyEntryUids) ? nextMode.readonlyEntryUids.length : 0;
    nextMode.currentStep = selectedCount > 0 || readonlyCount > 0 ? 'instruction' : 'selection';
  }

  settings.lorebookName = lorebookName;
  settings.activeMode = modeKey;
  settings.modifyStrategy = modeKey;
  settings.navMode = modeKey;
  settings[modeKey] = nextMode;
  mirrorAiWorkspaceModeToLegacyState(settings, modeKey);
  setAiWorkspaceSettings(settings);

  await switchTab(AI_TAB_ID);
  resetAiWorkspace();
  await refreshAiWorkspace();

  return selectedEntryUids.length;
}

function ensureRollbackPreviewModal(parentDoc) {
  if ($('#rollback-preview-modal', parentDoc).length > 0) {
    return;
  }

  const modalHtml = `
    <div id="rollback-preview-modal" style="display:none; position: fixed; z-index: 10007; left: 0; top: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.7); overflow-y: auto; box-sizing: border-box;">
      <div style="background-color: #2c2c2c; color: #eee; padding: 0; border: 1px solid #555; width: 90%; max-width: 800px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: calc(100vh - 150px); margin: 80px auto 50px auto; box-sizing: border-box;">
        <div style="padding: 10px 15px; background-color: #3a6a8e; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <h4>回滚预览</h4>
          <span class="close-button" style="font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
        </div>
        <div style="padding: 15px; max-height: 70vh; overflow-y: auto;">
          <div id="rollback-preview-summary"></div>
          <div id="rollback-preview-list"></div>
        </div>
        <div style="padding: 10px 15px; text-align: right; border-top: 1px solid #444;">
          <button id="cancel-rollback-preview-button" style="padding: 8px 12px; background-color: #555; border: none; color: white; cursor: pointer; border-radius: 4px; margin-right: 10px;">取消</button>
          <button id="confirm-rollback-preview-button" style="padding: 8px 12px; background-color: #5a3a8e; border: none; color: white; cursor: pointer; border-radius: 4px;">确认回滚</button>
        </div>
      </div>
    </div>
  `;

  $('body', parentDoc).append(modalHtml);
}

function renderRollbackPreview(preview, parentDoc) {
  ensureRollbackPreviewModal(parentDoc);
  const $modal = $('#rollback-preview-modal', parentDoc);
  const $summary = $('#rollback-preview-summary', $modal);
  const $list = $('#rollback-preview-list', $modal);
  const $confirm = $('#confirm-rollback-preview-button', $modal);
  const $cancel = $('#cancel-rollback-preview-button', $modal);

  $list.empty();

  if (!preview.available) {
    $summary.text('无可回滚内容。');
    $confirm.hide();
    $cancel.text('关闭');
    return $modal;
  }

  const meta = preview.meta || {};
  const committedAt = meta.committedAt ? new Date(meta.committedAt).toLocaleString() : '未知时间';
  $summary.html(
    `将回滚 <strong>${meta.operationType || '未知操作'}</strong>。提交时间：<strong>${_.escape(committedAt)}</strong>。` +
      ` 将恢复 <strong>${preview.summary.restoreCount}</strong> 个条目，` +
      `删除 <strong>${preview.summary.removeCount}</strong> 个当前条目，` +
      `回退 <strong>${preview.summary.modifyCount}</strong> 个已修改条目。`,
  );

  preview.items.forEach(item => {
    const typeLabel = item.type === 'restore' ? '恢复' : item.type === 'remove' ? '删除' : '回退修改';
    const previewHtml = `
      <div class="preview-item">
        <h5>条目: ${_.escape(item.title)} (UID: ${item.uid})</h5>
        <div class="preview-field">
          <strong>操作:</strong>
          <p class="changed-text">${_.escape(typeLabel)}</p>
          ${
            item.type === 'modify' && item.diffs.length > 0
              ? item.diffs
                  .map(
                    diff => `
                      <p class="original-text">当前 ${_.escape(diff.label)}: ${_.escape(JSON.stringify(diff.after))}</p>
                      <p class="changed-text">回滚后 ${_.escape(diff.label)}: ${_.escape(JSON.stringify(diff.before))}</p>
                    `,
                  )
                  .join('<hr class="diff-separator">')
              : ''
          }
        </div>
      </div>
    `;
    $list.append(previewHtml);
  });

  $confirm.show().text('确认回滚');
  $cancel.text('取消');
  return $modal;
}

async function openRollbackPreview(preview, parentDoc) {
  const popupApi = window.parent.SillyTavern || window.SillyTavern;
  if (!preview.available) {
    if (popupApi?.callGenericPopup && popupApi?.POPUP_TYPE) {
      await popupApi.callGenericPopup('无可回滚内容', popupApi.POPUP_TYPE.TEXT, '', {
        okButton: '关闭',
        cancelButton: false,
      });
      return false;
    }
    alert('无可回滚内容');
    return false;
  }

  const $modal = renderRollbackPreview(preview, parentDoc);

  return await new Promise(resolve => {
    const closeModal = result => {
      $modal.hide();
      resolve(result);
    };

    $modal
      .find('#confirm-rollback-preview-button')
      .off('click')
      .on('click', () => closeModal(preview.available));

    $modal
      .find('#cancel-rollback-preview-button, .close-button')
      .off('click')
      .on('click', () => closeModal(false));

    $modal.off('click.rollbackPreview').on('click.rollbackPreview', e => {
      if (e.target.id === 'rollback-preview-modal') {
        closeModal(false);
      }
    });

    $modal.css('display', 'block');
  });
}

async function rollbackHighRiskAction({ lorebookName, isGlobal, refreshList, parentDoc }) {
  const preview = await getRollbackPreview(lorebookName);
  if (!preview.available) {
    await openRollbackPreview(preview, parentDoc);
    updateRollbackButtonState(lorebookName, isGlobal);
    return;
  }

  const confirmed = await openRollbackPreview(preview, parentDoc);
  if (!confirmed) {
    return;
  }

  const result = await rollbackLastTransaction(lorebookName);
  if (!result.success) {
    alert(result.error?.message || '没有可回滚的事务');
    updateRollbackButtonState(lorebookName, isGlobal);
    return;
  }

  updateRollbackButtonState(lorebookName, isGlobal);
  await refreshList(lorebookName, isGlobal);
  updateRollbackButtonState(lorebookName, isGlobal);
  window.toastr?.success(`已回滚：${preview.meta?.operationType || '高风险操作'}`);
}

/**
 * 调整选中条目的位置
 */
async function adjustPosition({ lorebookName, isGlobal, refreshList }) {
  if (await adjustSelectedEntriesPosition(lorebookName, isGlobal)) {
    refreshList(lorebookName, isGlobal);
  }
}

/**
 * 删除选中的条目
 */
async function deleteEntries({ lorebookName, isGlobal, refreshList }) {
  if (await deleteSelectedEntries(lorebookName, isGlobal)) {
    refreshList(lorebookName, isGlobal);
  }
}

/**
 * 添加新条目
 */
async function addEntry({ lorebookName, isGlobal, refreshList }) {
  const result = await createNewLorebookEntry(lorebookName, isGlobal);
  if (result?.success) {
    if (result.entryUid != null) {
      selectDetailEntry({
        lorebookName,
        entryUid: result.entryUid,
        isGlobal,
      });
    }
    refreshList(lorebookName, isGlobal);
  }
}

async function saveEntryTogglePreset({ lorebookName, isGlobal, parentDoc }) {
  const presetName = window.prompt('请输入条目组预设名称：');
  const normalizedPresetName = `${presetName || ''}`.trim();
  if (!normalizedPresetName) {
    return;
  }

  const existingPresets = getEntryTogglePresetsForLorebook(lorebookName);
  if (
    existingPresets[normalizedPresetName] &&
    !window.confirm(`条目组预设“${normalizedPresetName}”已存在，是否覆盖？`)
  ) {
    return;
  }

  const success = await createEntryTogglePresetFromCurrentState(lorebookName, normalizedPresetName);
  if (!success) {
    window.toastr?.error('保存条目组预设失败');
    return;
  }

  refreshEntryTogglePresetMenu(lorebookName, isGlobal, parentDoc);
  window.toastr?.success(`已保存条目组预设：${normalizedPresetName}`);
}

async function applyEntryTogglePresetCommand({ $actionTarget, lorebookName, isGlobal, refreshList }) {
  const presetName = `${$actionTarget.data('preset-name') || ''}`.trim();
  if (!presetName) {
    return;
  }

  if (!window.confirm(`确定应用条目组预设“${presetName}”吗？\n这会恢复保存时记录过的条目启用状态与蓝/绿灯模式。`)) {
    return;
  }

  const result = await applyEntryTogglePreset(lorebookName, presetName);
  if (!result?.success) {
    window.toastr?.error(result?.error?.message || '应用条目组预设失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  updateRollbackButtonState(lorebookName, isGlobal);
  window.toastr?.success(`已应用条目组预设：${presetName}，修改 ${result.modifiedCount || 0} 个条目`);
}

async function deleteEntryTogglePresetCommand({ $actionTarget, lorebookName, isGlobal, parentDoc }) {
  const presetName = `${$actionTarget.data('preset-name') || ''}`.trim();
  if (!presetName) {
    return;
  }

  if (!window.confirm(`确定删除条目组预设“${presetName}”吗？`)) {
    return;
  }

  const success = await deleteEntryTogglePreset(lorebookName, presetName);
  if (!success) {
    window.toastr?.error('删除条目组预设失败');
    return;
  }

  refreshEntryTogglePresetMenu(lorebookName, isGlobal, parentDoc);
  window.toastr?.success(`已删除条目组预设：${presetName}`);
}

/**
 * 反转字段值
 */
async function invert({ $target, lorebookName, isGlobal, refreshList }) {
  const field = $target.closest('[data-field]').data('field');
  const title = $target.closest('[title]').attr('title');
  const message = `确定要${title}吗？`;
  if (await batchUpdateEntries(lorebookName, isGlobal, { invert: field }, message)) {
    refreshList(lorebookName, isGlobal);
  }
}

/**
 * 执行批量切换操作
 */
async function executeBatchToggle({ $target, lorebookName, isGlobal, parentDoc, refreshList }) {
  const $dropdown = $target.closest('.batch-toggle-dropdown');
  const operation = $dropdown.find('input[name="batch-operation"]:checked').val();
  const aiMode = ($dropdown.find('input[name="batch-ai-mode"]:checked').val() || '').trim();
  const selectedFields = $dropdown
    .find('.batch-toggle-checkbox-group input:checked')
    .map(function () {
      return $(this).val();
    })
    .get();

  if (DEBUG_MODE) {
    console.log('[批量操作] 操作类型:', operation, '选中字段:', selectedFields);
  }

  if (selectedFields.length === 0 && !aiMode) {
    window.toastr?.warning('请至少选择一个批量字段或 AI 参与模式');
    return;
  }

  const fieldNames = {
    enabled: '启用状态',
    'strategy.type': '激活模式',
    'recursion.prevent_outgoing': '防止递归',
    'recursion.prevent_incoming': '排除递归',
  };
  const operationNames = { enable: '全开', disable: '全关', invert: '反转' };
  const fieldList = selectedFields.map(f => fieldNames[f]).join('、');
  const message = `确定要对 ${fieldList} 进行${operationNames[operation]}操作吗？`;

  if (!confirm(message)) {
    return;
  }

  let successCount = 0;
  for (const field of selectedFields) {
    let updateData;
    if (operation === 'invert') {
      updateData = { invert: field };
    } else if (operation === 'enable') {
      if (field === 'enabled') {
        updateData = { [field]: true };
      } else if (field === 'strategy.type') {
        updateData = { [field]: 'constant' };
      } else if (field.startsWith('recursion.')) {
        updateData = { [field]: true };
      }
    } else if (operation === 'disable') {
      if (field === 'enabled') {
        updateData = { [field]: false };
      } else if (field === 'strategy.type') {
        updateData = { [field]: 'selective' };
      } else if (field.startsWith('recursion.')) {
        updateData = { [field]: false };
      }
    }

    if (await batchUpdateEntries(lorebookName, isGlobal, updateData, null)) {
      successCount++;
    }
  }

  if (successCount > 0) {
    closeFloatingBatchToggleDropdowns(parentDoc);
    refreshList(lorebookName, isGlobal);
  }
}

/**
 * 全选/取消全选
 */
async function executeBatchTogglePatched({ $target, lorebookName, isGlobal, parentDoc, refreshList }) {
  const $dropdown = $target.closest('.batch-toggle-dropdown');
  const operation = $dropdown.find('input[name="batch-operation"]:checked').val();
  const aiMode = ($dropdown.find('input[name="batch-ai-mode"]:checked').val() || '').trim();
  const selectedFields = $dropdown
    .find('.batch-toggle-checkbox-group input:checked')
    .map(function () {
      return $(this).val();
    })
    .get();

  if (DEBUG_MODE) {
    console.log('[批量操作] 操作类型:', operation, '选中字段:', selectedFields, 'AI 模式:', aiMode || 'unchanged');
  }

  if (selectedFields.length === 0 && !aiMode) {
    window.toastr?.warning('请至少选择一个批量字段或 AI 参与模式');
    return;
  }

  const fieldNames = {
    enabled: '启用状态',
    'strategy.type': '激活模式',
    'recursion.prevent_outgoing': '防止递归',
    'recursion.prevent_incoming': '排除递归',
  };

  if (selectedFields.length > 0) {
    const operationNames = { enable: '全开', disable: '全关', invert: '反转' };
    const fieldList = selectedFields.map(field => fieldNames[field] || field).join('、');
    const message = `确定要对 ${fieldList} 执行${operationNames[operation]}操作吗？`;

    if (!confirm(message)) {
      return;
    }
  }

  let successCount = 0;
  for (const field of selectedFields) {
    let updateData;
    if (operation === 'invert') {
      updateData = { invert: field };
    } else if (operation === 'enable') {
      if (field === 'enabled') {
        updateData = { [field]: true };
      } else if (field === 'strategy.type') {
        updateData = { [field]: 'constant' };
      } else if (field.startsWith('recursion.')) {
        updateData = { [field]: true };
      }
    } else if (operation === 'disable') {
      if (field === 'enabled') {
        updateData = { [field]: false };
      } else if (field === 'strategy.type') {
        updateData = { [field]: 'selective' };
      } else if (field.startsWith('recursion.')) {
        updateData = { [field]: false };
      }
    }

    if (await batchUpdateEntries(lorebookName, isGlobal, updateData, null)) {
      successCount++;
    }
  }

  const aiParticipationUpdated = aiMode ? await applySelectedEntriesAiParticipation(lorebookName, aiMode) : false;

  if (successCount > 0 || aiParticipationUpdated) {
    closeFloatingBatchToggleDropdowns(parentDoc);
    refreshList(lorebookName, isGlobal);
  }
}

async function setAiSelectedMode({ lorebookName, $actionTarget, parentDoc }) {
  const aiMode = ($actionTarget.data('ai-mode') || '').toString();
  if (!aiMode) {
    return;
  }

  const success = await applySelectedEntriesAiParticipation(lorebookName, aiMode);
  if (success) {
    closeFloatingBatchToggleDropdowns(parentDoc);
  }
}

async function openAiWorkspaceMode({ lorebookName, $actionTarget, parentDoc }) {
  const modeKey = ($actionTarget.data('ai-workspace-mode') || '').toString();
  if (!['direct', 'plan'].includes(modeKey)) {
    return;
  }

  const selectedCount = await openAiWorkspaceForSelectedEntries(lorebookName, modeKey);
  closeFloatingBatchToggleDropdowns(parentDoc);

  const label = modeKey === 'plan' ? '计划修改' : '直接修改';
  if (selectedCount > 0) {
    window.toastr?.success(`已打开 AI ${label}，并载入 ${selectedCount} 个选中条目`);
  }
}

async function executeAiSelection({ $target, lorebookName, parentDoc }) {
  const $dropdown = $target.closest('.batch-toggle-dropdown');
  const aiMode = ($dropdown.find('input[name^="ai-selected-mode-"]:checked').val() || '').trim();
  const workspaceMode = ($dropdown.find('input[name^="ai-workspace-mode-"]:checked').val() || '').trim();

  if (!aiMode || !workspaceMode) {
    window.toastr?.warning('请同时选择 AI 参与模式和 AI 工作区');
    return;
  }

  const aiParticipationUpdated = await applySelectedEntriesAiParticipation(lorebookName, aiMode, workspaceMode);
  if (!aiParticipationUpdated) {
    return;
  }

  const selectedCount = await openAiWorkspaceForSelectedEntries(lorebookName, workspaceMode, { preserveSelectionState: true });
  const label = workspaceMode === 'plan' ? '计划修改' : '直接修改';
  if (selectedCount > 0) {
    window.toastr?.success(`已打开 AI ${label}，并同步 ${selectedCount} 个选中条目`);
  }
  closeFloatingBatchToggleDropdowns(parentDoc);
}

function selectAll({ $actionTarget, lorebookName, isGlobal, parentDoc }) {
  // 从按钮获取属性，优先使用按钮自己的属性
  const buttonLorebookName = $actionTarget.attr('data-lorebook-name') || lorebookName;
  // 正确处理字符串到布尔值的转换
  const buttonIsGlobalAttr = $actionTarget.attr('data-is-global');
  const buttonIsGlobal = buttonIsGlobalAttr !== undefined ? buttonIsGlobalAttr === 'true' : isGlobal;

  toggleAllEntries(buttonLorebookName, buttonIsGlobal);
}

// 注册所有标题栏操作命令
registerCommands({
  'set-filter': setFilter,
  'open-optimizer': openOptimizer,
  'bulk-import': bulkImport,
  'copy-entries': copyEntries,
  'ai-edit-selected': openAiBatchEdit,
  'rollback-last-transaction': rollbackHighRiskAction,
  'adjust-position': adjustPosition,
  'delete-entries': deleteEntries,
  'add-entry': addEntry,
  'save-entry-toggle-preset': saveEntryTogglePreset,
  'apply-entry-toggle-preset': applyEntryTogglePresetCommand,
  'delete-entry-toggle-preset': deleteEntryTogglePresetCommand,
  'invert': invert,
  'execute-batch-toggle': executeBatchTogglePatched,
  'execute-ai-selection': executeAiSelection,
  'set-ai-selected-mode': setAiSelectedMode,
  'open-ai-workspace-mode': openAiWorkspaceMode,
  'select-all': selectAll,
});
