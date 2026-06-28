import {
  createLorebookEntries,
  deleteLorebookEntries,
  getWorldbookNamesSafe,
  replaceWorldbookEntries,
  getWorldbookSafe,
  updateWorldbookEntries,
} from '../api.js';
import { LOREBOOK_ENTRY_CHECKBOX_CLASS, LOREBOOK_PANEL_ID } from '../config.js';
import { beginMutationTransaction, commitMutationTransaction } from './history.js';
import { getDefaultCopyConflictStrategy, setDefaultCopyConflictStrategy } from '../settings.js';
import {
  clearSelectedEntries,
  getSelectableEntries,
  getSelectAllControlState,
  getSelectedEntries,
  isEntrySelected,
  setSelectAllMemory,
  setSelectedEntries,
} from '../state.js';
import { updateHeaderCheckboxState } from '../ui/list.js';
import { loadTheme } from '../ui/theme.js';
import { ensureNumericUID, errorCatched } from '../utils.js';

const RESERVED_META_ENTRY_PREFIX = '__WI_META_';

function filterReservedMetaEntries(entries) {
  return (entries || []).filter(entry => !(entry?.name || '').startsWith(RESERVED_META_ENTRY_PREFIX));
}

function findConflictingEntriesByName(entries, entryName) {
  return filterReservedMetaEntries(entries).filter(entry => (entry?.name || '') === entryName);
}

function buildRenamedEntryTitle(baseTitle, usedTitles) {
  const safeBaseTitle = (baseTitle || '未命名条目').trim() || '未命名条目';
  const suffix = ' - 副本';
  let candidate = `${safeBaseTitle}${suffix}`;
  let counter = 2;

  while (usedTitles.has(candidate)) {
    candidate = `${safeBaseTitle}${suffix} ${counter}`;
    counter++;
  }

  usedTitles.add(candidate);
  return candidate;
}

// 【重构】批量更新选中条目的数据
export const batchUpdateEntries = errorCatched(async (lorebookName, isGlobal, updateData, confirmMessage) => {
  // Get selected UIDs from state instead of DOM
  const selectedUids = new Set(getSelectedEntries(lorebookName));

  console.log(`[批量操作] 从选择状态中获取了 ${selectedUids.size} 个实际选中的条目。`);

  if (selectedUids.size === 0) {
    alert('请至少选择一个要操作的条目。');
    return false;
  }

  if (confirmMessage && !confirm(confirmMessage)) return false;

  const uidsToUpdate = Array.from(selectedUids);

  try {
    let modifiedCount = 0;
    const result = await updateWorldbookEntries(
      lorebookName,
      entries => {
      let hasChanges = false;
      const updatedEntries = entries.map(entry => {
        if (uidsToUpdate.includes(ensureNumericUID(entry.uid))) {
          hasChanges = true;
          modifiedCount++;
          const updatedEntry = _.cloneDeep(entry);

          if (updateData.invert) {
            const field = updateData.invert;
            const currentValue = _.get(updatedEntry, field);
            let newValue;

            // 获取主题设置中的反转按钮模式
            const theme = loadTheme();
            const invertMode = theme.invertButtonMode || 'invert';

            if (
              field === 'enabled' ||
              field === 'recursion.prevent_outgoing' ||
              field === 'recursion.prevent_incoming'
            ) {
              if (invertMode === 'invert') {
                newValue = !currentValue;
              } else {
                // 开关模式：统一设置为 true (enabled) 或 false (prevent_*)
                newValue = field === 'enabled' ? true : false;
              }
            } else if (field === 'strategy.type') {
              if (invertMode === 'invert') {
                newValue = currentValue === 'constant' ? 'selective' : 'constant';
              } else {
                // 开关模式：统一设置为 constant
                newValue = 'constant';
              }
            }

            if (newValue !== undefined) {
              _.set(updatedEntry, field, newValue);
            }
          } else {
            for (const key in updateData) {
              if (key.startsWith('recursion.') && !updatedEntry.recursion) updatedEntry.recursion = {};
              if (key.startsWith('strategy.') && !updatedEntry.strategy) updatedEntry.strategy = {};

              const updater = updateData[key];
              if (typeof updater === 'function') {
                const oldValue = _.get(updatedEntry, key);
                const newValue = updater(oldValue);
                _.set(updatedEntry, key, newValue);
              } else {
                _.set(updatedEntry, key, updateData[key]);
              }
            }
          }
          return updatedEntry;
        }
        return entry;
      });
      return hasChanges ? updatedEntries : entries;
      },
      {
        trackHistory: true,
        transactionType: 'batch-update',
        transactionMeta: {
          selectedCount: uidsToUpdate.length,
        },
      },
    );

    if (!result.success) {
      throw result.error || new Error('批量更新失败');
    }

    if (modifiedCount > 0) {
      alert(`成功更新了 ${modifiedCount} 个条目！`);
    }
    return modifiedCount > 0;
  } catch (error) {
    alert(`更新条目时出错: ${error.message || '未知错误'}`);
    return false;
  } finally {
    // After batch operation completes, restore checkbox states in DOM from selection state
    setTimeout(() => {
      const parentDoc = window.parent.document;
      const containerSelector = isGlobal
        ? `.lorebook-entries-container[data-lorebook-name="${lorebookName}"][data-is-global="true"]`
        : `.lorebook-entries-container[data-lorebook-name="${lorebookName}"]:not([data-is-global="true"])`;
      const $container = $(containerSelector, parentDoc);

      // Restore checkbox states from selection state
      uidsToUpdate.forEach(uid => {
        $container.find(`.${LOREBOOK_ENTRY_CHECKBOX_CLASS}[data-entry-uid="${uid}"]`).prop('checked', true);
      });
      updateHeaderCheckboxState(lorebookName, isGlobal);
    }, 200);
  }
}, 'batchUpdateEntries');

// 【重构】复制选中条目到另一个世界书
export const copySelectedEntries = errorCatched(async (sourceLorebookName, isGlobal) => {
  const parentDoc = window.parent.document;

  // Replace DOM query with getSelectedEntries() call
  const selectedUids = getSelectedEntries(sourceLorebookName);

  if (selectedUids.length === 0) {
    alert('请至少选择一个要复制的条目');
    return;
  }

  const allLorebooks = await getWorldbookNamesSafe();
  if (allLorebooks.length === 0) {
    alert('没有可用的世界书作为复制目标。');
    return;
  }

  let copyRequest;
  try {
    copyRequest = await new Promise((resolve, reject) => {
      const defaultStrategy = getDefaultCopyConflictStrategy();
      const modalHtml = `
                <div id="lorebook-copy-modal" style="display: none; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background-color: rgba(0,0,0,0.7) !important; z-index: 10000 !important; overflow-y: auto !important; box-sizing: border-box !important;">
                    <div id="lorebook-copy-modal-content" style="background-color: #282828 !important; color: #eee !important; padding: 20px !important; border-radius: 8px !important; width: 90% !important; max-width: 400px !important; margin: 80px auto 50px auto !important; max-height: calc(100vh - 150px) !important; display: flex !important; flex-direction: column !important; box-sizing: border-box !important;">
                        <h4 style="margin-top: 0;">选择目标世界书</h4>
                        <p>将 ${selectedUids.length} 个条目复制到:</p>
                        <div style="position: relative; margin-bottom: 10px;">
                            <input type="text" id="lorebook-search-select" placeholder="点击选择或输入搜索..." 
                                   style="width: 100%; padding: 8px 30px 8px 8px; background-color: #333; color: #eee; border: 1px solid #555; cursor: pointer; box-sizing: border-box; border-radius: 4px;">
                            <span id="lorebook-dropdown-arrow" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #aaa;">▼</span>
                        </div>
                        <div id="lorebook-options-list" style="display: none; max-height: 200px; overflow-y: auto; background-color: #333; border: 1px solid #555; border-radius: 4px; flex-shrink: 0;">
                        </div>
                        <div style="margin-top: 12px;">
                            <label for="lorebook-copy-strategy" style="display: block; margin-bottom: 6px;">同名冲突时:</label>
                            <select id="lorebook-copy-strategy" style="width: 100%; padding: 8px; background-color: #333; color: #eee; border: 1px solid #555; border-radius: 4px;">
                                <option value="rename" ${defaultStrategy === 'rename' ? 'selected' : ''}>重命名后复制</option>
                                <option value="overwrite" ${defaultStrategy === 'overwrite' ? 'selected' : ''}>覆盖已有同名条目</option>
                                <option value="keep-original" ${defaultStrategy === 'keep-original' ? 'selected' : ''}>保留原名并继续复制</option>
                            </select>
                        </div>
                        <div id="lorebook-copy-modal-actions" style="margin-top: 15px; text-align: right; flex-shrink: 0;">
                            <button id="lorebook-copy-cancel-btn" style="padding: 8px 12px; background-color: #555; border: none; color: white; cursor: pointer; margin-right: 10px; border-radius: 4px;">取消</button>
                            <button id="lorebook-copy-confirm-btn" style="padding: 8px 12px; background-color: #5a3a8e; border: none; color: white; cursor: pointer; border-radius: 4px;">确认复制</button>
                        </div>
                    </div>
                </div>`;
      $('body', parentDoc).append(modalHtml);

      const $searchSelect = $('#lorebook-search-select', parentDoc);
      const $optionsList = $('#lorebook-options-list', parentDoc);
      const $arrow = $('#lorebook-dropdown-arrow', parentDoc);
      let selectedValue = ''; // 默认为空
      let isOpen = false;

      // 渲染选项列表
      function renderOptions(filterText = '') {
        const filtered = allLorebooks.filter(name => name.toLowerCase().includes(filterText.toLowerCase()));

        if (filtered.length === 0) {
          $optionsList.html('<div style="padding: 8px; color: #888;">没有匹配的世界书</div>');
          return;
        }

        const optionsHtml = filtered
          .map(
            name => `
          <div class="lorebook-option" data-value="${name}" 
               style="padding: 8px 12px; cursor: pointer; color: #eee; ${name === selectedValue ? 'background-color: #5a3a8e;' : ''}"
               onmouseover="this.style.backgroundColor='#444'" 
               onmouseout="this.style.backgroundColor='${name === selectedValue ? '#5a3a8e' : '#333'}'">
            ${name}
          </div>
        `,
          )
          .join('');
        $optionsList.html(optionsHtml);

        // 绑定选项点击事件
        $optionsList.find('.lorebook-option').on('click', function () {
          selectedValue = $(this).data('value');
          $searchSelect.val(selectedValue);
          closeDropdown();
        });
      }

      // 打开/关闭下拉列表
      function toggleDropdown() {
        isOpen = !isOpen;
        if (isOpen) {
          renderOptions($searchSelect.val());
          $optionsList.show();
          $arrow.text('▲');
          $searchSelect.focus();
        } else {
          closeDropdown();
        }
      }

      function closeDropdown() {
        isOpen = false;
        $optionsList.hide();
        $arrow.text('▼');
        $searchSelect.val(selectedValue); // 恢复为选中的值
      }

      // 初始化显示
      $searchSelect.val(selectedValue);

      // 点击输入框切换下拉
      $searchSelect.on('click', function (e) {
        e.stopPropagation();
        toggleDropdown();
      });

      // 输入时实时搜索
      $searchSelect.on('input', function () {
        if (!isOpen) {
          isOpen = true;
          $optionsList.show();
          $arrow.text('▲');
        }
        renderOptions($(this).val());
      });

      // 点击外部关闭下拉
      $(parentDoc).on('click.lorebook-dropdown', function (e) {
        if (!$(e.target).closest('#lorebook-copy-modal-content').length) {
          return;
        }
        if (!$(e.target).closest('#lorebook-search-select, #lorebook-options-list').length) {
          if (isOpen) closeDropdown();
        }
      });

      // 确认按钮
      $('#lorebook-copy-confirm-btn', parentDoc).on('click', () => {
        if (!selectedValue) {
          alert('请选择目标世界书');
          return;
        }
        const strategy = $('#lorebook-copy-strategy', parentDoc).val();
        resolve({
          destinationLorebookName: selectedValue,
          conflictStrategy: strategy,
        });
      });

      // 取消按钮
      $('#lorebook-copy-cancel-btn', parentDoc).on('click', () => {
        reject(new Error('User cancelled.'));
      });

      // 显示模态框
      $('#lorebook-copy-modal', parentDoc).fadeIn(200);
    });
  } catch (error) {
    console.log('角色世界书: 用户取消了复制操作。');
    return;
  } finally {
    $('#lorebook-copy-modal', parentDoc).remove();
    $(parentDoc).off('click.lorebook-dropdown');
  }

  if (!copyRequest?.destinationLorebookName) return;

  try {
    const { destinationLorebookName, conflictStrategy } = copyRequest;
    setDefaultCopyConflictStrategy(conflictStrategy);

    const sourceResult = await getWorldbookSafe(sourceLorebookName);
    if (!sourceResult.success) {
      alert(`获取源世界书失败: ${sourceResult.error?.message || '未知错误'}`);
      return;
    }
    const entriesToCopy = filterReservedMetaEntries(sourceResult.data).filter(entry =>
      selectedUids.includes(ensureNumericUID(entry.uid)),
    );

    if (entriesToCopy.length === 0) {
      alert('选中的条目均为保留元数据条目，未执行复制。');
      return;
    }

    const destResult = await getWorldbookSafe(destinationLorebookName);
    if (!destResult.success) {
      alert(`获取目标世界书失败: ${destResult.error?.message || '未知错误'}`);
      return;
    }
    const destinationEntries = destResult.data || [];
    const usedTitles = new Set(filterReservedMetaEntries(destinationEntries).map(entry => entry.name || ''));
    let maxUid = destinationEntries.length > 0 ? Math.max(...destinationEntries.map(e => ensureNumericUID(e.uid))) : 0;
    let overwrittenCount = 0;
    let createdCount = 0;

    if (conflictStrategy === 'overwrite') {
      const transactionMeta = {
        sourceLorebookName,
        destinationLorebookName,
        conflictStrategy,
        selectedCount: entriesToCopy.length,
      };
      const sharedTransaction = await beginMutationTransaction(destinationLorebookName, {
        operationType: 'copy-overwrite',
        ...transactionMeta,
      });
      const pendingSourceEntries = [...entriesToCopy];
      const overwriteResult = await updateWorldbookEntries(
        destinationLorebookName,
        entries => {
          const remainingEntries = [...pendingSourceEntries];
          const updatedEntries = entries.map(entry => {
            const conflictIndex = remainingEntries.findIndex(sourceEntry => sourceEntry.name === entry.name);
            if (conflictIndex === -1 || (entry?.name || '').startsWith(RESERVED_META_ENTRY_PREFIX)) {
              return entry;
            }

            const sourceEntry = remainingEntries.splice(conflictIndex, 1);
            const { uid, ...entryData } = sourceEntry[0];
            overwrittenCount++;
            return {
              ..._.cloneDeep(entryData),
              uid: entry.uid,
            };
          });

          pendingSourceEntries.splice(0, pendingSourceEntries.length, ...remainingEntries);
          return updatedEntries;
        },
        {
          trackHistory: true,
          transaction: sharedTransaction,
          commitTransaction: false,
          transactionType: 'copy-overwrite',
          transactionMeta,
        },
      );

      if (!overwriteResult.success) {
        throw overwriteResult.error || new Error('覆盖复制失败');
      }

      if (pendingSourceEntries.length > 0) {
        const entriesForCreation = pendingSourceEntries.map(entry => {
          const { uid, ...entryData } = entry;
          maxUid += 1;
          createdCount++;
          return {
            ..._.cloneDeep(entryData),
            uid: maxUid,
          };
        });

        const creationResult = await createLorebookEntries(destinationLorebookName, entriesForCreation, {
          trackHistory: true,
          transaction: sharedTransaction,
          commitTransaction: true,
          transactionType: 'copy-overwrite-create',
          transactionMeta: {
            ...transactionMeta,
            overwrittenCount,
            createdCount: entriesForCreation.length,
          },
        });

        if (!creationResult.success) {
          await replaceWorldbookEntries(destinationLorebookName, sharedTransaction.snapshot, {
            trackHistory: false,
          });
          throw creationResult.error || new Error('补充创建复制条目失败');
        }
      } else if (overwriteResult.changed) {
        await commitMutationTransaction(sharedTransaction, {
          lorebookName: destinationLorebookName,
          overwrittenCount,
          createdCount: 0,
          ...transactionMeta,
        });
      }
    } else {
      const entriesForCreation = entriesToCopy.map(entry => {
        const { uid, ...entryData } = _.cloneDeep(entry);
        const hasConflict = findConflictingEntriesByName(destinationEntries, entry.name).length > 0 || usedTitles.has(entry.name);

        if (conflictStrategy === 'rename' && hasConflict) {
          entryData.name = buildRenamedEntryTitle(entry.name, usedTitles);
        } else {
          usedTitles.add(entry.name || '');
        }

        maxUid += 1;
        createdCount++;
        return {
          ...entryData,
          uid: maxUid,
        };
      });

      const creationResult = await createLorebookEntries(destinationLorebookName, entriesForCreation, {
        trackHistory: true,
        transactionType: 'copy-create',
        transactionMeta: {
          sourceLorebookName,
          destinationLorebookName,
          conflictStrategy,
          selectedCount: entriesToCopy.length,
          createdCount: entriesForCreation.length,
        },
      });

      if (!creationResult.success) {
        throw creationResult.error || new Error('复制条目失败');
      }
    }

    alert(
      `复制完成：新增 ${createdCount} 个条目，覆盖 ${overwrittenCount} 个条目，目标世界书为 "${destinationLorebookName}"。`,
    );
  } catch (error) {
    alert(`复制条目时出错: ${error.message || '未知错误'}`);
  }
}, 'copySelectedEntries');

// 【重构】批量删除选中的条目
export const deleteSelectedEntries = errorCatched(async (lorebookName, isGlobal = false) => {
  const selectedUids = getSelectedEntries(lorebookName);

  if (selectedUids.length === 0) {
    alert('请至少选择一个要删除的条目');
    return false;
  }

  const confirmMessage = `确定要删除选中的 ${selectedUids.length} 个条目吗？`;

  if (!confirm(confirmMessage)) return false;

  try {
    const result = await deleteLorebookEntries(
      lorebookName,
      entry => selectedUids.includes(ensureNumericUID(entry.uid)),
      {
        trackHistory: true,
        transactionType: 'batch-delete',
        transactionMeta: {
          selectedCount: selectedUids.length,
        },
      },
    );

    if (!result.success) {
      throw result.error || new Error('批量删除失败');
    }

    // After successful deletion, call clearSelectedEntries to remove deleted UIDs
    clearSelectedEntries(lorebookName);
    return true; // 只返回成功状态
  } catch (error) {
    console.error(`角色世界书: 删除条目时出错`, error);
    alert(`删除条目时出错: ${error.message || '未知错误'}`);
    return false;
  }
}, 'deleteSelectedEntries');

// 【新增】批量调整选中条目的插入位置
export const adjustSelectedEntriesPosition = errorCatched(async (lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);

  const selectedUids = getSelectedEntries(lorebookName);

  if (selectedUids.length === 0) {
    alert('请至少选择一个要调整位置的条目。');
    return false;
  }

  // 显示位置调整对话框
  let positionSettings;
  try {
    positionSettings = await new Promise((resolve, reject) => {
      const modalHtml = `
        <div id="lorebook-position-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.7); z-index: 10000; overflow-y: auto; box-sizing: border-box;">
          <div id="lorebook-position-modal-content" style="background-color: #282828; color: #eee; padding: 20px; border-radius: 8px; width: 90%; max-width: 450px; margin: 80px auto 50px auto; max-height: calc(100vh - 150px); overflow-y: auto; box-sizing: border-box;">
            <h4 style="margin-top: 0;">调整插入位置</h4>
            <p>将 ${selectedUids.length} 个条目的插入位置调整为:</p>
            <div style="margin: 15px 0;">
              <label style="display: block; margin-bottom: 8px;">插入位置类型:</label>
              <select id="lorebook-position-type-select" style="width: 100%; padding: 8px; background-color: #333; color: #eee; border: 1px solid #555; border-radius: 4px;">
                <option value="before_character_definition">角色定义前</option>
                <option value="after_character_definition" selected>角色定义后</option>
                <option value="before_example_messages">示例消息前</option>
                <option value="after_example_messages">示例消息后</option>
                <option value="before_author_note">作者注释前</option>
                <option value="after_author_note">作者注释后</option>
                <option value="at_depth">@深度</option>
              </select>
            </div>
            <div id="lorebook-depth-input-wrapper" style="margin: 15px 0; display: none;">
              <label style="display: block; margin-bottom: 8px;">深度值 (0-10):</label>
              <input type="number" id="lorebook-depth-input" min="0" max="10" value="4" style="width: 100%; padding: 8px; background-color: #333; color: #eee; border: 1px solid #555; border-radius: 4px;">
            </div>
            <div id="lorebook-position-modal-actions" style="margin-top: 15px; text-align: right;">
              <button id="lorebook-position-cancel-btn" style="padding: 8px 12px; background-color: #555; border: none; color: white; cursor: pointer; margin-right: 10px; border-radius: 4px;">取消</button>
              <button id="lorebook-position-confirm-btn" style="padding: 8px 12px; background-color: #7a5a9e; border: none; color: white; cursor: pointer; border-radius: 4px;">确认调整</button>
            </div>
          </div>
        </div>`;

      $('body', parentDoc).append(modalHtml);

      const $modal = $('#lorebook-position-modal', parentDoc);
      const $typeSelect = $('#lorebook-position-type-select', parentDoc);
      const $depthWrapper = $('#lorebook-depth-input-wrapper', parentDoc);
      const $depthInput = $('#lorebook-depth-input', parentDoc);

      // 根据选择的类型显示/隐藏深度输入框
      $typeSelect.on('change', function () {
        if ($(this).val() === 'at_depth') {
          $depthWrapper.show();
        } else {
          $depthWrapper.hide();
        }
      });

      $('#lorebook-position-confirm-btn', parentDoc).on('click', () => {
        const positionType = $typeSelect.val();
        const depth = $depthInput.val();
        resolve({ type: positionType, depth: parseInt(depth) || 4 });
      });

      $('#lorebook-position-cancel-btn', parentDoc).on('click', () => {
        reject(new Error('User cancelled.'));
      });
    });
  } catch (error) {
    console.log('角色世界书: 用户取消了位置调整操作。');
    return false;
  } finally {
    $('#lorebook-position-modal', parentDoc).remove();
  }

  if (!positionSettings) return false;

  // 准备更新数据
  const updateData = {
    'position.type': positionSettings.type,
  };

  // 只有在选择@深度时才更新深度值
  if (positionSettings.type === 'at_depth') {
    updateData['position.depth'] = positionSettings.depth;
  }

  // 调用批量更新函数
  const result = await batchUpdateEntries(
    lorebookName,
    isGlobal,
    updateData,
    null, // 不需要确认消息，因为已经在模态框中确认过了
  );

  return result;
}, 'adjustSelectedEntriesPosition');

// 【修复】将函数移至全局作用域以解决 ReferenceError
export const toggleAllEntries = errorCatched((lorebookName, isGlobal) => {
  const parentDoc = window.parent.document;
  // 【修复】确保 isGlobal 是布尔值
  const isGlobalBool = isGlobal === true || isGlobal === 'true';
  const containerSelector = isGlobalBool
    ? `.lorebook-entries-container[data-lorebook-name="${lorebookName}"][data-is-global="true"]`
    : `.lorebook-entries-container[data-lorebook-name="${lorebookName}"]:not([data-is-global="true"])`;

  const $container = $(containerSelector, parentDoc);

  if (!$container.length) {
    console.error(`角色世界书: 找不到世界书 ${lorebookName} 的条目容器`);
    return false;
  }

  const controlState = getSelectAllControlState(lorebookName);
  if (controlState.nextAction === 'none') {
    updateHeaderCheckboxState(lorebookName, isGlobalBool);
    return false;
  }

  if (controlState.nextAction === 'clear') {
    clearSelectedEntries(lorebookName);
    console.log(`[全选操作] 已清空 ${controlState.selectedCount} 个选中条目`);
  } else {
    const entriesToSelect = getSelectableEntries(lorebookName);
    const selectableUids = entriesToSelect.map(entry => ensureNumericUID(entry.uid));
    setSelectedEntries(lorebookName, selectableUids);
    setSelectAllMemory(lorebookName, selectableUids.length > 0);
    console.log(`[全选操作] 已选择当前范围，共 ${selectableUids.length} 个条目`);
  }

  // Update visible DOM checkboxes after state change
  $container.find(`.${LOREBOOK_ENTRY_CHECKBOX_CLASS}`).each(function () {
    const $checkbox = $(this);
    const uid = ensureNumericUID($checkbox.attr('data-entry-uid'));
    $checkbox.prop('checked', isEntrySelected(lorebookName, uid));
  });

  // Call updateHeaderCheckboxState to sync header checkbox
  updateHeaderCheckboxState(lorebookName, isGlobalBool);

  return true;
}, 'toggleAllEntries');
