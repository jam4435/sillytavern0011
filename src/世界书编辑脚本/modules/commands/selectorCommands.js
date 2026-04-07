/**
 * 全局世界书选择器相关命令
 * 处理常驻世界书的切换、固定、取消固定、预设管理等操作
 */

import { disableGlobalLorebook, enableGlobalLorebook } from '../api.js';
import {
  DEBUG_MODE,
  GLOBAL_LOREBOOK_LIST_CONTAINER_ID,
  GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID,
} from '../config.js';
import {
  addGlobalLorebookToList,
  applyPreset,
  createPresetFromCurrentState,
  deletePreset,
  getPinnedBooks,
  renderGlobalLorebookSelector,
  savePinnedBooks,
} from '../ui/list.js';
import { registerCommands } from './index.js';

// 防抖状态：用于追踪正在处理中的全局世界书切换操作
const globalLorebookProcessing = new Set();

/**
 * 切换全局世界书启用状态
 */
async function toggleGlobalLorebook({ $actionTarget, $panel, parentDoc }) {
  const lorebookName = $actionTarget.data('lorebook-name');
  const wasActive = $actionTarget.hasClass('active');
  const $listContainer = $panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);

  if (DEBUG_MODE) {
    console.log('[toggle-global-lorebook] 点击:', { lorebookName, wasActive });
  }

  // 检查是否正在处理中（防抖）
  if (globalLorebookProcessing.has(lorebookName)) {
    return;
  }
  globalLorebookProcessing.add(lorebookName);

  // Optimistic UI update for the tag
  $actionTarget.toggleClass('active');

  try {
    if (wasActive) {
      // 如果之前是启用的，现在要禁用它
      await disableGlobalLorebook(lorebookName);
      // 从下方列表中移除
      const $title = $listContainer.find(`.lorebook-title[data-lorebook-name="${lorebookName}"]`);
      const $wrapper = $listContainer.find(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`);
      const $divider = $title.next('.lorebook-divider');
      $title.remove();
      $wrapper.remove();
      $divider.remove();
    } else {
      // 如果之前是禁用的，现在要启用它
      await enableGlobalLorebook(lorebookName);
      // 添加到下方列表
      addGlobalLorebookToList($listContainer, lorebookName);
    }

    // API 调用成功后，手动更新标签状态
    const $currentTag = $(`#${GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID} .lorebook-tag[data-lorebook-name="${lorebookName}"]`, parentDoc);
    if ($currentTag.length) {
      if (wasActive) {
        $currentTag.removeClass('active');
      } else {
        $currentTag.addClass('active');
      }
    }
  } catch (error) {
    console.error('角色世界书: 切换全局世界书状态失败:', error);
    // On failure, revert the optimistic UI update
    const $currentTag = $(`#${GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID} .lorebook-tag[data-lorebook-name="${lorebookName}"]`, parentDoc);
    if ($currentTag.length) {
      if (wasActive) {
        $currentTag.addClass('active');
      } else {
        $currentTag.removeClass('active');
      }
    }
  } finally {
    globalLorebookProcessing.delete(lorebookName);
  }
}

/**
 * 取消固定全局世界书
 */
async function unpinGlobalLorebook({ $actionTarget, $panel, parentDoc }) {
  const $tag = $actionTarget.closest('.lorebook-tag');
  const lorebookName = $tag.data('lorebook-name');
  const $listContainer = $panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);

  // Optimistic UI update
  $tag.remove();
  const $header = $panel.find('.global-lorebook-selector-header');
  if ($header.length) {
    const currentCount = parseInt($header.text().match(/\d+/), 10);
    $header.text(`常驻世界书 (${currentCount - 1})`);
  }

  // Remove from the list below
  const $title = $listContainer.find(`.lorebook-title[data-lorebook-name="${lorebookName}"]`);
  const $wrapper = $listContainer.find(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`);
  const $divider = $title.next('.lorebook-divider');
  $title.remove();
  $wrapper.remove();
  $divider.remove();

  // API call and localStorage update in background
  disableGlobalLorebook(lorebookName);
  let pinnedBooks = getPinnedBooks();
  pinnedBooks = pinnedBooks.filter(b => b !== lorebookName);
  savePinnedBooks(pinnedBooks);
}

/**
 * 固定全局世界书
 */
async function pinGlobalLorebook({ $actionTarget, $panel, parentDoc }) {
  const lorebookName = $actionTarget.data('lorebook-name');
  const $listContainer = $panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);

  try {
    // 1. Update pinned books list
    const pinnedBooks = getPinnedBooks();
    if (!pinnedBooks.includes(lorebookName)) {
      pinnedBooks.push(lorebookName);
      savePinnedBooks(pinnedBooks);
    }

    // 2. Enable the worldbook as global lorebook
    await enableGlobalLorebook(lorebookName);

    // 3. UI update: clear search and re-render selector
    $('#add-worldbook-search-input', parentDoc).val('');
    $('.add-worldbook-results', parentDoc).empty().hide();
    await renderGlobalLorebookSelector();

    // 4. Add to the list below
    addGlobalLorebookToList($listContainer, lorebookName);
  } catch (error) {
    console.error('角色世界书: 添加常驻世界书失败:', error);
  }
}

/**
 * 切换预设下拉菜单
 */
function togglePresetDropdown({ $target }) {
  const $dropdown = $target.closest('.preset-dropdown-container').find('.preset-dropdown-menu');
  $dropdown.toggle();
}

/**
 * 保存预设
 */
async function savePreset({ parentDoc }) {
  const name = prompt('请输入预设名称：');
  if (name) {
    if (await createPresetFromCurrentState(name)) {
      alert(`预设 "${name}" 保存成功！`);
      // 刷新下拉菜单
      renderGlobalLorebookSelector();
      // 重新打开下拉菜单
      setTimeout(() => {
        $('.preset-dropdown-menu', parentDoc).show();
      }, 100);
    } else {
      alert('保存预设失败。');
    }
  }
}

/**
 * 应用预设
 */
async function applyPresetCommand({ $target }) {
  const name = $target.data('preset-name');
  if (confirm(`确定要应用预设 "${name}" 吗？\n这将覆盖当前的常驻世界书列表和启用状态。`)) {
    if (await applyPreset(name)) {
      alert(`预设 "${name}" 已应用！`);
    } else {
      alert('应用预设失败。');
    }
  }
}

/**
 * 删除预设
 */
async function deletePresetCommand({ $target, parentDoc }) {
  const name = $target.data('preset-name');
  if (confirm(`确定要删除预设 "${name}" 吗？`)) {
    if (await deletePreset(name)) {
      // 重新打开下拉菜单
      setTimeout(() => {
        $('.preset-dropdown-menu', parentDoc).show();
      }, 100);
    } else {
      alert('删除预设失败。');
    }
  }
}

// 注册所有选择器相关命令
registerCommands({
  'toggle-global-lorebook': toggleGlobalLorebook,
  'unpin-global-lorebook': unpinGlobalLorebook,
  'pin-global-lorebook': pinGlobalLorebook,
  'toggle-preset-dropdown': togglePresetDropdown,
  'save-preset': savePreset,
  'apply-preset': applyPresetCommand,
  'delete-preset': deletePresetCommand,
});
