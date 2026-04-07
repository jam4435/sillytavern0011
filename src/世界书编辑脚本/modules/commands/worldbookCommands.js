/**
 * 世界书管理相关命令
 * 处理世界书的导入、导出、创建、删除、重命名、替换显示等操作
 */

import {
  createWorldbookSafe,
  deleteWorldbookSafe,
  getWorldbookSafe,
  importWorldbookSafe,
  rebindCharWorldbooksSafe,
  rebindChatWorldbookSafe,
  renameWorldbookSafe,
} from '../api.js';
import {
  GLOBAL_LOREBOOK_LIST_CONTAINER_ID,
  LOREBOOK_LIST_CONTAINER_ID,
} from '../config.js';
import { setIsReplacingCharacterLorebook } from '../state.js';
import {
  createLorebookTitleSection,
  loadLorebookEntries,
  updateBoundLorebooksList,
  updateGlobalLorebooksList,
  updateHeaderCheckboxState,
} from '../ui/list.js';
import {
  convertPluginToNativeFormat,
  openFilePickerAndRead,
  triggerDownload,
} from '../utils.js';
import { registerCommands } from './index.js';

async function showCharacterWorldbookWithoutCard($panel, worldbookName) {
  const $listContainer = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
  if (!$listContainer.length) {
    return;
  }

  let $wrapper = $listContainer.find(`.lorebook-entries-wrapper[data-lorebook-name="${worldbookName}"]`);
  if (!$wrapper.length) {
    const $title = createLorebookTitleSection(worldbookName, false);
    $title.attr('data-lorebook-name', worldbookName);
    $wrapper = $('<div></div>').addClass('lorebook-entries-wrapper').attr('data-lorebook-name', worldbookName).attr('data-is-global', 'false');
    $listContainer.append($title).append($wrapper);
  }

  await loadLorebookEntries(worldbookName, $wrapper, false);
  updateHeaderCheckboxState(worldbookName, false);
}

async function refreshImportedWorldbookList($panel, worldbookName) {
  const activeTabId = $panel.find('.tab-button.active-tab').attr('id');

  if (activeTabId === 'global-lorebook-tab') {
    await updateGlobalLorebooksList($panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`), true);
    return;
  }

  if (typeof getCharWorldbookNames === 'function') {
    const $listContainer = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
    await updateBoundLorebooksList($listContainer, true);
    if ($listContainer.find(`.lorebook-title[data-lorebook-name="${worldbookName}"]`).length > 0) {
      return;
    }
    await showCharacterWorldbookWithoutCard($panel, worldbookName);
    return;
  }

  await showCharacterWorldbookWithoutCard($panel, worldbookName);
}

/**
 * 导入世界书
 */
async function importWorldbook({ $panel }) {
  try {
    const { filename, content } = await openFilePickerAndRead();
    // 去掉 .json 扩展名
    const worldbookName = filename.replace(/\.json$/i, '');
    const response = await importWorldbookSafe(worldbookName, content);
    console.log('[调试] importRawWorldbook 返回值:', response, typeof response);

    // 处理不同类型的返回值
    // 1. 如果是 Response 对象
    if (response instanceof Response) {
      if (response.ok) {
        alert(`世界书 "${worldbookName}" 导入成功！`);
        await refreshImportedWorldbookList($panel, worldbookName);
      } else {
        let errorDetail = response.statusText || `HTTP ${response.status}`;
        try {
          const errorText = await response.text();
          if (errorText) {
            errorDetail = errorText;
          }
        } catch (e) {
          // 忽略读取 body 失败的情况
        }
        throw new Error(errorDetail);
      }
    }
    // 2. 如果返回 true/truthy 值表示成功
    else if (response === true || response === undefined) {
      alert(`世界书 "${worldbookName}" 导入成功！`);
      await refreshImportedWorldbookList($panel, worldbookName);
    }
    // 3. 如果返回 false 或其他 falsy 值表示失败
    else if (response === false) {
      throw new Error('导入操作返回失败');
    }
    // 4. 如果返回字符串（可能是错误信息或世界书名）
    else if (typeof response === 'string') {
      // 假设返回字符串表示成功（可能是世界书名）
      alert(`世界书 "${worldbookName}" 导入成功！`);
      await refreshImportedWorldbookList($panel, worldbookName);
    }
    // 5. 其他情况，尝试检查是否有 ok 属性
    else if (response && typeof response === 'object') {
      if (response.ok === true) {
        alert(`世界书 "${worldbookName}" 导入成功！`);
        await refreshImportedWorldbookList($panel, worldbookName);
      } else if (response.ok === false) {
        throw new Error(response.error || response.message || '导入失败');
      } else {
        // 没有 ok 属性，假设成功
        alert(`世界书 "${worldbookName}" 导入成功！`);
        await refreshImportedWorldbookList($panel, worldbookName);
      }
    }
    // 6. 未知情况
    else {
      console.warn('[调试] 未知的返回值类型:', response);
      throw new Error(`未知的返回值: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    console.error('[调试] 导入世界书时出错:', error);
    if (error.message !== '未选择任何文件。') {
      alert(`导入失败: ${error.message}`);
    }
  }
}

/**
 * 导出世界书
 */
async function exportWorldbook({ $panel }) {
  const lorebookNames = [];
  // 判断当前激活的标签页，以确定正确的导出范围
  const activeTabId = $panel.find('.tab-button.active-tab').attr('id');
  let listContainerId;

  if (activeTabId === 'character-lorebook-tab') {
    listContainerId = `#${LOREBOOK_LIST_CONTAINER_ID}`;
  } else {
    listContainerId = `#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`;
  }

  // 使用动态的容器ID来查找世界书标题
  $panel.find(`${listContainerId} .lorebook-title`).each(function () {
    lorebookNames.push($(this).data('lorebook-name'));
  });

  if (lorebookNames.length > 0) {
    for (const bookName of lorebookNames) {
      try {
        const result = await getWorldbookSafe(bookName);

        if (result.success && result.data) {
          // 调用转换函数，将插件格式转换为酒馆原生格式
          const nativeWorldbook = convertPluginToNativeFormat(result.data);

          // 序列化原生格式的对象
          const content = JSON.stringify(nativeWorldbook, null, 2);
          const filename = `${bookName}.json`;

          triggerDownload(filename, content);
        } else {
          console.error(`[调试] 获取 '${bookName}' 的内容失败`, result.error);
          alert(`导出世界书 '${bookName}' 失败: ${result.error?.message || '未知错误'}`);
        }
      } catch (error) {
        console.error(`[调试] 导出世界书 '${bookName}' 时发生错误:`, error);
        alert(`导出世界书 '${bookName}' 失败，请查看控制台了解详情。`);
      }
    }
    alert(`已处理 ${lorebookNames.length} 个世界书的导出请求。请注意浏览器的下载提示。`);
  } else {
    alert('[调试] 在当前标签页未找到可导出的世界书。');
  }
}

/**
 * 创建世界书
 */
async function createWorldbook() {
  const worldbookName = prompt('请输入新的世界书名称：');
  if (worldbookName) {
    try {
      await createWorldbookSafe(worldbookName);
      alert(`世界书 "${worldbookName}" 创建成功！\n你现在可以在"替换显示"的搜索框中找到它并进行编辑。`);
    } catch (error) {
      alert(`创建世界书失败: ${error.message}`);
    }
  }
}

/**
 * 删除世界书
 */
async function deleteWorldbook({ $panel }) {
  const $listContainer = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
  const $displayedTitle = $listContainer.find('.lorebook-title');

  if ($displayedTitle.length !== 1) {
    alert('操作失败：当前没有或有多个世界书正在显示。请确保只加载了一个世界书。');
    return;
  }

  const worldbookName = $displayedTitle.data('lorebook-name');
  if (confirm(`确定要删除当前显示的世界书 "${worldbookName}" 吗？此操作不可撤销。`)) {
    try {
      await deleteWorldbookSafe(worldbookName);
      alert(`世界书 "${worldbookName}" 删除成功！`);
      // 删除后刷新回角色绑定的世界书列表
      await updateBoundLorebooksList($listContainer, true);
    } catch (error) {
      alert(`删除世界书失败: ${error.message}`);
    }
  }
}

/**
 * 重命名世界书
 */
async function renameWorldbook({ $panel }) {
  const $listContainer = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
  const $displayedTitle = $listContainer.find('.lorebook-title');

  if ($displayedTitle.length !== 1) {
    alert('操作失败：当前没有或有多个世界书正在显示。请确保只加载了一个世界书。');
    return;
  }

  const oldName = $displayedTitle.data('lorebook-name');
  const newName = prompt(`请输入新的世界书名称：`, oldName);
  if (newName && newName !== oldName) {
    try {
      await renameWorldbookSafe(oldName, newName);
      alert(`世界书 "${oldName}" 已成功重命名为 "${newName}"！`);
      // 局部更新UI，避免刷新
      const $wrapper = $listContainer.find(`.lorebook-entries-wrapper[data-lorebook-name="${oldName}"]`);
      $displayedTitle.find('.lorebook-title-text').text(newName);
      $displayedTitle.attr('data-lorebook-name', newName).data('lorebook-name', newName);
      $wrapper.attr('data-lorebook-name', newName).data('lorebook-name', newName);
      await loadLorebookEntries(newName, $wrapper, false);
    } catch (error) {
      alert(`重命名世界书失败: ${error.message}`);
    }
  }
}

/**
 * 替换显示角色世界书
 */
async function replaceCharacterLorebook({ $actionTarget, $panel, parentDoc }) {
  const lorebookName = $actionTarget.data('lorebook-name');
  const $listContainer = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);

  // 设置标记，阻止并发的 updateBoundLorebooksList 调用
  setIsReplacingCharacterLorebook(true);

  // 清空除了搜索栏之外的所有内容
  $listContainer.find('> *:not(.global-lorebook-adder)').remove();
  $listContainer.append('<p>加载中...</p>');

  // 异步加载新的世界书
  setTimeout(async () => {
    try {
      $listContainer.find('p').remove(); // 移除"加载中"
      const $lorebookTitle = createLorebookTitleSection(lorebookName, false);
      $lorebookTitle.attr('data-lorebook-name', lorebookName);
      $listContainer.append($lorebookTitle);

      const $entriesWrapper = $('<div></div>')
        .addClass('lorebook-entries-wrapper')
        .attr('data-lorebook-name', lorebookName);
      $listContainer.append($entriesWrapper);

      await loadLorebookEntries(lorebookName, $entriesWrapper, false);
      updateHeaderCheckboxState(lorebookName, false);
    } catch (error) {
      console.error(`替换并加载世界书 ${lorebookName} 时出错:`, error);
      $listContainer.append('<p>加载世界书失败。</p>');
    } finally {
      // 清除标记
      setIsReplacingCharacterLorebook(false);
    }
  }, 10);

  // 清空搜索框并隐藏结果
  $('#character-worldbook-search-input', parentDoc).val('');
  $('#character-worldbook-search-results', parentDoc).empty().hide();
}

function selectOptimizerCompareLorebook({ $actionTarget, parentDoc }) {
  const lorebookName = ($actionTarget.data('lorebook-name') || '').toString().trim();
  if (!lorebookName) {
    return;
  }

  const $modal = $('#lorebook-optimize-modal', parentDoc);
  $('#optimize-compare-search-input', $modal)
    .val(lorebookName)
    .attr('data-selected-lorebook-name', lorebookName);
  $('#optimize-compare-search-results', $modal).empty().hide();
  $('#preview-lorebook-compare-button', $modal).prop('disabled', false);
  $modal.data('compare-target-lorebook', lorebookName);
}

/**
 * 设置为角色世界书
 */
async function setAsCharLorebook({ $panel }) {
  const lorebookNames = [];
  $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID} .lorebook-title`).each(function () {
    lorebookNames.push($(this).data('lorebook-name'));
  });

  if (lorebookNames.length === 0) {
    alert('当前没有显示任何世界书，无法设置。');
    return;
  }

  if (
    confirm(
      `确定要将当前显示的 ${lorebookNames.length} 个世界书（${lorebookNames.join(', ')}）设置为角色的绑定世界书吗？这会覆盖角色当前已绑定的世界书。`,
    )
  ) {
    try {
      // rebindCharWorldbooks 需要一个 { primary: string, additional: string[] } 格式的对象
      const charWorldbooks = {
        primary: lorebookNames[0] || null,
        additional: lorebookNames.slice(1),
      };
      await rebindCharWorldbooksSafe(charWorldbooks);
      alert('成功将显示的世界书设置为角色世界书！');
      // 刷新一下，以确认UI与后台数据同步
      await updateBoundLorebooksList($panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`), true);
    } catch (error) {
      console.error('设置角色世界书时出错:', error);
      alert('设置角色世界书时出错，请查看控制台了解详情。');
    }
  }
}

/**
 * 设置为聊天世界书
 */
async function setAsChatLorebook({ $panel }) {
  const lorebookNames = [];
  $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID} .lorebook-title`).each(function () {
    lorebookNames.push($(this).data('lorebook-name'));
  });

  if (lorebookNames.length === 0) {
    alert('当前没有显示任何世界书，无法设置。');
    return;
  }

  if (lorebookNames.length > 1) {
    alert('当前显示了多个世界书，请确保只显示一个世界书后再进行此操作。');
    return;
  }

  const worldbookName = lorebookNames[0];
  if (confirm(`确定要将当前显示的世界书 "${worldbookName}" 设置为聊天世界书吗？`)) {
    try {
      await rebindChatWorldbookSafe(worldbookName);
      alert(`成功将世界书 "${worldbookName}" 设置为聊天世界书！`);
    } catch (error) {
      console.error('设置聊天世界书时出错:', error);
      alert('设置聊天世界书时出错，请查看控制台了解详情。');
    }
  }
}

// 注册所有世界书管理命令
registerCommands({
  'import-worldbook': importWorldbook,
  'export-worldbook': exportWorldbook,
  'create-worldbook': createWorldbook,
  'delete-worldbook': deleteWorldbook,
  'rename-worldbook': renameWorldbook,
  'replace-character-lorebook': replaceCharacterLorebook,
  'select-optimizer-compare-lorebook': selectOptimizerCompareLorebook,
  'set-as-char-lorebook': setAsCharLorebook,
  'set-as-chat-lorebook': setAsChatLorebook,
});
