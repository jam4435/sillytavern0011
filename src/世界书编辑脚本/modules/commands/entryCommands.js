/**
 * 条目操作相关命令
 * 处理条目的展开、编辑、切换状态、选择等操作
 */

import { saveEntryField, toggleEntryEnabled } from '../api.js';
import { AI_TAB_ID, DEBUG_MODE } from '../config.js';
import { applyAiPreview, generateAiPreview } from '../features/aiActions.js';
import { isDepthPositionValue } from '../position.js';
import { addPinnedEntry, getAiWorkspaceSettings, removePinnedEntry, setAiWorkspaceSettings } from '../settings.js';
import { allEntriesData, toggleEntrySelection, virtualScrollers } from '../state.js';
import {
  closeAiActionDialog,
  getAiActionDialogState,
  getAiInstruction,
  openAiActionDialog,
  renderAiActionPreview,
  setAiActionBusy,
  setAiActionStatus,
  updateAiActionDialogState,
} from '../ui/aiActionDialog.js';
import { showCompareEditor, showContentEditor } from '../ui/contentEditor.js';
import { isMasterDetailLayout, renderDetailPane, selectDetailEntry, syncMasterRowFromState } from '../ui/detail.js';
import { showEntryEditor } from '../ui/editor.js';
import { toggleExpanded } from '../ui/expandManager.js';
import { updateHeaderCheckboxState, updateVirtualScroll } from '../ui/list.js';
import { switchTab } from '../ui/panel.js';
import { refreshAiWorkspace, resetAiWorkspace } from '../ui/aiWorkspace.js';
import { ensureNumericUID } from '../utils.js';
import { registerCommands } from './index.js';

/**
 * 打开条目编辑器
 */
function openEditor({ event, lorebookName, numericUid, isGlobal }) {
  if (isMasterDetailLayout()) {
    selectDetailEntry({
      lorebookName,
      entryUid: numericUid,
      isGlobal,
    });
    return;
  }

  if ($(event.target).hasClass('entry-header')) {
    showEntryEditor(lorebookName, numericUid, isGlobal);
  }
}

function updateLocalEntryState(lorebookName, numericUid, updater) {
  const entries = allEntriesData[lorebookName] || [];
  const entry = entries.find(item => ensureNumericUID(item.uid) === numericUid);
  if (!entry) {
    return null;
  }
  updater(entry);
  return entry;
}

function getDisplayTitleValue(value) {
  const normalizedValue = value == null ? '' : `${value}`;
  return normalizedValue || '未命名条目';
}

function exitTitleEditMode($item) {
  $item.removeClass('is-editing-title');
  $item.removeClass('is-editing-title-mobile');
}

function syncMobileTitleUi($item, value) {
  const displayTitle = getDisplayTitleValue(value);
  $item.find('.mobile-entry-title-display').text(displayTitle).attr('title', displayTitle);
  $item.find('.mobile-entry-title-input').val(displayTitle);
}

function getCurrentTitleValue($item) {
  if ($item.hasClass('master-entry-item')) {
    return $item.find('.master-entry-title').first().text();
  }
  const mobileTitle = $item.find('.mobile-entry-title-display').first().text();
  if (mobileTitle) {
    return mobileTitle;
  }
  return getDisplayTitleValue($item.find('.mobile-entry-title-input').first().val());
}

/**
 * 展开/折叠条目
 */
function expand({ $item, lorebookName, numericUid }) {
  // 获取虚拟滚动实例以获取 styleHeight
  if (isMasterDetailLayout()) {
    return;
  }

  const clusterize = virtualScrollers[lorebookName];
  const styleHeight = clusterize?.options?.item_height ? clusterize.options.item_height - 8 : null;

  // 使用 expandManager 统一处理展开/折叠
  const newExpandedState = toggleExpanded($item, lorebookName, numericUid, styleHeight, true);

  if (DEBUG_MODE) {
    console.log(`[Expand] ${lorebookName}/${numericUid} -> ${newExpandedState}`);
  }

  // 初始化token计数
  if (newExpandedState) {
    const entry = (allEntriesData[lorebookName] || []).find(item => ensureNumericUID(item.uid) === numericUid);
    const $textarea = $item.find('.content-textarea');
    const content = entry?.content || $textarea.val() || '';
    const $counter = $item.find('.token-counter');
    $counter.text('计算中...');

    // 使用酒馆的真实tokenizer计算token数
    if (window.SillyTavern && window.SillyTavern.getTokenCountAsync) {
      window.SillyTavern.getTokenCountAsync(content)
        .then(tokenCount => {
          $counter.text(`${tokenCount} 词符`);
        })
        .catch(err => {
          console.warn('Token计数失败，使用字符数作为后备:', err);
          $counter.text(`${content.length} 字符`);
        });
    } else {
      // 后备方案：使用字符数
      $counter.text(`${content.length} 字符`);
    }
  }
}

/**
 * 切换条目启用状态
 */
async function toggleEnabled({ $target, $item, lorebookName, numericUid, isGlobal }) {
  const newState = $target.prop('checked');
  const success = await toggleEntryEnabled(lorebookName, numericUid, newState);
  if (success) {
    updateLocalEntryState(lorebookName, numericUid, entry => {
      entry.enabled = newState;
    });
    $item.toggleClass('disabled-entry', !newState).attr('data-enabled', newState);
    syncMasterRowFromState(lorebookName, numericUid, isGlobal);
    if (isMasterDetailLayout()) {
      renderDetailPane(isGlobal, { scrollIntoView: false });
    }
  } else {
    $target.prop('checked', !newState);
  }
}

/**
 * 编辑条目标题
 */
async function editTitle({ event, $target, lorebookName, numericUid, isGlobal }) {
  if (event.type === 'change') {
    const $item = $target.closest('.lorebook-entry-item');
    const nextTitle = $target.val();
    const originalTitle = getCurrentTitleValue($item);
    const success = await saveEntryField(numericUid, lorebookName, 'name', nextTitle);
    exitTitleEditMode($item);
    if (!success) {
      $target.val(originalTitle);
      syncMobileTitleUi($item, originalTitle);
      return;
    }

    updateLocalEntryState(lorebookName, numericUid, entry => {
      entry.name = nextTitle;
    });
    syncMobileTitleUi($item, nextTitle);
    syncMasterRowFromState(lorebookName, numericUid, isGlobal);
    if (isMasterDetailLayout()) {
      renderDetailPane(isGlobal);
    }
  }
}

function startEditTitle({ $item }) {
  if (!$item?.length) {
    return;
  }
  if ($item.hasClass('master-entry-item')) {
    $item.addClass('is-editing-title');
  } else {
    $item.addClass('is-editing-title-mobile');
  }
  const input = $item.find('.master-entry-title-input, .mobile-entry-title-input').get(0);
  if (input) {
    input.focus();
    input.select();
  }
}

/**
 * 切换常驻/关键字模式
 */
async function toggleConstant({ $target, lorebookName, numericUid, isGlobal }) {
  const isNowConstant = $target.prop('checked');
  $target
    .next('.mini-toggle-slider')
    .toggleClass('constant', isNowConstant)
    .toggleClass('keyword', !isNowConstant);
  const success = await saveEntryField(numericUid, lorebookName, 'strategy.type', isNowConstant ? 'constant' : 'selective');
  if (!success) {
    $target.prop('checked', !isNowConstant);
    $target
      .next('.mini-toggle-slider')
      .toggleClass('constant', !isNowConstant)
      .toggleClass('keyword', isNowConstant);
    return;
  }

  updateLocalEntryState(lorebookName, numericUid, entry => {
    entry.strategy = entry.strategy || {};
    entry.strategy.type = isNowConstant ? 'constant' : 'selective';
  });
  syncMasterRowFromState(lorebookName, numericUid, isGlobal);
  if (isMasterDetailLayout()) {
    renderDetailPane(isGlobal, { scrollIntoView: false });
  }
}

/**
 * 编辑插入位置
 */
function editPosition({ $target, $item, lorebookName, numericUid }) {
  const newPosition = $target.val();
  const $depthInput = $item.find('[data-action="edit-depth"]');
  const needsDepth = isDepthPositionValue(newPosition);
  $depthInput.prop('disabled', !needsDepth);
  $depthInput.closest('.depth-input-container').toggleClass('depth-disabled', !needsDepth);
  saveEntryField(numericUid, lorebookName, 'position.type', newPosition);
}

/**
 * 编辑深度
 */
function editDepth({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change' && !$target.prop('disabled')) {
    saveEntryField(numericUid, lorebookName, 'position.depth', parseInt($target.val()));
  }
}

/**
 * 编辑顺序
 */
function editOrder({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change') {
    saveEntryField(numericUid, lorebookName, 'position.order', parseInt($target.val()));
  }
}

/**
 * 编辑概率
 */
function editProb({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change') {
    saveEntryField(numericUid, lorebookName, 'probability', parseInt($target.val()));
  }
}

/**
 * 打开内容编辑器
 */
async function openContentEditor({ lorebookName, numericUid }) {
  await showContentEditor(lorebookName, numericUid);
}

async function openCompareEditor({ lorebookName, numericUid }) {
  await showCompareEditor(lorebookName, numericUid);
}

async function openAiEntryEdit({ lorebookName, numericUid }) {
  const settings = getAiWorkspaceSettings();
  const direct = _.cloneDeep(settings.direct || {});
  direct.lorebookName = lorebookName;
  direct.selectedEntryUids = [Number(numericUid)];
  direct.readonlyEntryUids = [];
  direct.planningResult = null;
  direct.previewResult = null;
  direct.debugInfo = null;
  direct.statusText = '';
  direct.currentStep = 'instruction';
  settings.lorebookName = lorebookName;
  settings.activeMode = 'direct';
  settings.modifyStrategy = 'direct';
  settings.navMode = 'direct';
  settings.direct = direct;
  settings.selectedEntryUids = [Number(numericUid)];
  settings.readonlyEntryUids = [];
  setAiWorkspaceSettings(settings);

  await switchTab(AI_TAB_ID);
  resetAiWorkspace();
  await refreshAiWorkspace();
  window.toastr?.success('已打开 AI 直接修改，并载入当前条目');
}

async function previewOrApplyAiAction({ $actionTarget, refreshList }) {
  const dialogState = getAiActionDialogState();
  if (!dialogState?.lorebookName) {
    return;
  }

  const phase = $actionTarget.attr('data-phase') || 'preview';
  const instruction = getAiInstruction();

  if (phase === 'preview') {
    setAiActionBusy(true, '生成中...');
    setAiActionStatus('正在准备 AI 预览...');

    try {
      const previewResult = await generateAiPreview({
        lorebookName: dialogState.lorebookName,
        entryUids: dialogState.entryUids,
        instruction,
        onProgress: progress => {
          const suffix = progress?.title ? `，当前：${progress.title}` : '';
          setAiActionStatus(
            `正在生成 AI 预览 ${progress.completed}/${progress.total}，成功 ${progress.succeeded}，失败 ${progress.failed}${suffix}`,
          );
        },
      });

      updateAiActionDialogState({
        ...dialogState,
        instruction,
        previewResult,
      });
      renderAiActionPreview(previewResult);

      if (previewResult.summary.succeeded === 0) {
        $actionTarget.attr('data-phase', 'preview').text('重新生成预览');
        setAiActionStatus('预览生成失败，没有可应用条目。');
      } else if (previewResult.summary.changed === 0) {
        setAiActionStatus('预览完成，但 AI 结果与当前内容一致，没有可应用变更。');
      } else {
        setAiActionStatus('预览生成完成，确认后可应用。');
      }
    } catch (error) {
      setAiActionStatus(error.message || '生成 AI 预览失败');
      $actionTarget.attr('data-phase', 'preview').text('重新生成预览');
    } finally {
      $actionTarget.prop('disabled', false);
      setAiActionBusy(false, $actionTarget.text());
    }
    return;
  }

  setAiActionBusy(true, '应用中...');
  setAiActionStatus('正在应用 AI 预览...');

  try {
    const result = await applyAiPreview({
      lorebookName: dialogState.lorebookName,
      previewItems: dialogState.previewResult?.items || [],
    });

    if (result.changed) {
      await refreshList(dialogState.lorebookName, dialogState.isGlobal);
      window.toastr?.success(`AI 预览已应用：${result.appliedCount} 条`);
    } else {
      window.toastr?.warning('没有可应用的 AI 变更');
    }

    closeAiActionDialog();
  } catch (error) {
    setAiActionStatus(error.message || '应用 AI 预览失败');
    setAiActionBusy(false, '应用预览');
  }
}

/**
 * 选择条目
 */
function selectEntry({ $target, lorebookName, numericUid, isGlobal }) {
  const isSelected = $target.prop('checked');
  toggleEntrySelection(lorebookName, numericUid, isSelected);
  updateHeaderCheckboxState(lorebookName, isGlobal);
}

/**
 * 编辑内容
 */
function editContent({ event, $target, $item, lorebookName, numericUid }) {
  if (event.type === 'change') {
    const content = $target.val() || '';
    const $counter = $item.find('.token-counter');
    saveEntryField(numericUid, lorebookName, 'content', content);

    // 使用酒馆的真实tokenizer计算token数
    if (window.SillyTavern && window.SillyTavern.getTokenCountAsync) {
      window.SillyTavern.getTokenCountAsync(content)
        .then(tokenCount => {
          $counter.text(`${tokenCount} 词符`);
        })
        .catch(err => {
          console.warn('Token计数失败，使用字符数作为后备:', err);
          $counter.text(`${content.length} 字符`);
        });
    } else {
      // 后备方案：使用字符数
      $counter.text(`${content.length} 字符`);
    }
  }
}

/**
 * 编辑主关键字
 */
function editKeys({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change') {
    const newKeywords = $target
      .val()
      .split(',')
      .map(k => k.trim())
      .filter(k => k);
    saveEntryField(numericUid, lorebookName, 'strategy.keys', newKeywords);
  }
}

/**
 * 编辑次要关键字
 */
function editKeysSecondary({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change') {
    const newKeywords = $target
      .val()
      .split(',')
      .map(k => k.trim())
      .filter(k => k);
    saveEntryField(numericUid, lorebookName, 'strategy.keys_secondary.keys', newKeywords);
  }
}

/**
 * 编辑次要关键字逻辑
 */
function editKeysSecondaryLogic({ event, $target, lorebookName, numericUid }) {
  if (event.type === 'change') {
    saveEntryField(numericUid, lorebookName, 'strategy.keys_secondary.logic', $target.val());
  }
}

/**
 * 切换防止递归
 */
function togglePreventOutgoing({ $target, lorebookName, numericUid }) {
  saveEntryField(numericUid, lorebookName, 'recursion.prevent_outgoing', $target.prop('checked'));
}

/**
 * 切换排除递归
 */
function togglePreventIncoming({ $target, lorebookName, numericUid }) {
  saveEntryField(numericUid, lorebookName, 'recursion.prevent_incoming', $target.prop('checked'));
}

/**
 * 切换延迟递归
 */
function toggleDelayRecursion({ $target, lorebookName, numericUid }) {
  saveEntryField(numericUid, lorebookName, 'recursion.delay_until', $target.prop('checked') ? 1 : null);
}

/**
 * 切换置顶
 */
async function togglePinned({ $target, lorebookName, numericUid }) {
  const isChecked = $target.prop('checked');

  // 步骤 1: 更新持久化存储
  if (isChecked) {
    addPinnedEntry(lorebookName, numericUid);
  } else {
    removePinnedEntry(lorebookName, numericUid);
  }

  // 步骤 2: 立即在前端内存状态中更新
  const entryToUpdate = allEntriesData[lorebookName].find(e => ensureNumericUID(e.uid) === numericUid);
  if (entryToUpdate) {
    entryToUpdate.pinned = isChecked;
  }

  // 步骤 3: 调用无感刷新，UI立即响应
  await updateVirtualScroll(lorebookName);
}

// 注册所有条目操作命令
registerCommands({
  'open-editor': openEditor,
  'expand': expand,
  'toggle-enabled': toggleEnabled,
  'start-edit-title': startEditTitle,
  'edit-title': editTitle,
  'toggle-constant': toggleConstant,
  'edit-position': editPosition,
  'edit-depth': editDepth,
  'edit-order': editOrder,
  'edit-prob': editProb,
  'open-content-editor': openContentEditor,
  'open-compare-editor': openCompareEditor,
  'ai-edit-entry': openAiEntryEdit,
  'ai-preview-apply': previewOrApplyAiAction,
  'select-entry': selectEntry,
  'edit-content': editContent,
  'edit-keys': editKeys,
  'edit-keys-secondary': editKeysSecondary,
  'edit-keys-secondary-logic': editKeysSecondaryLogic,
  'toggle-prevent-outgoing': togglePreventOutgoing,
  'toggle-prevent-incoming': togglePreventIncoming,
  'toggle-delay-recursion': toggleDelayRecursion,
  'toggle-pinned': togglePinned,
});
