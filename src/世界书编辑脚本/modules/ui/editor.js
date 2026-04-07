import { getLorebookEntry, getWorldbookSafe, updateWorldbookEntries } from '../api.js';
import { LOREBOOK_EDITOR_PANEL_ID } from '../config.js';
import { ensureNumericUID } from '../utils.js';

// 显示条目编辑器
export const showEntryEditor = async (lorebookName, entryUid, isGlobal = false) => {
  const numericUid = ensureNumericUID(entryUid);
  const parentDoc = window.parent.document;
  const $editorPanel = $(`#${LOREBOOK_EDITOR_PANEL_ID}`, parentDoc);

  if (!$editorPanel.length) {
    alert('找不到编辑器面板，请刷新页面后重试');
    return;
  }

  const $form = $editorPanel.find('#entry-edit-form');
  $form.find('.save-button').text('保存').prop('disabled', false);
  $form.find('.debug-info').hide();

  $editorPanel.find('.loading-spinner').show();
  $editorPanel.find('#entry-edit-form').hide();
  $editorPanel.css('display', 'flex');

  const entry = await getLorebookEntry(lorebookName, numericUid);

  if (!entry) {
    $editorPanel.find('.loading-spinner').text('加载条目失败! 找不到指定条目').css('color', 'red');
    return;
  }

  // 适配新数据结构
  const isConstant = _.get(entry, 'strategy.type') === 'constant';
  const positionType = _.get(entry, 'position.type', 'after_character_definition');
  const depth = _.get(entry, 'position.depth', 4);
  const keys = _.get(entry, 'strategy.keys', []);

  // 填充表单数据
  $form.find('#entry-uid').val(numericUid);
  $form.find('#entry-lorebook').val(lorebookName);
  $form.find('#entry-is-global').val(isGlobal ? 'true' : 'false');
  $form.find('#entry-comment').val(entry.name || ''); // comment -> name
  $form.find('#entry-content').val(entry.content || '');
  $form.find('#entry-keys').val(Array.isArray(keys) ? keys.join(', ') : '');
  $form.find('#entry-position').val(positionType);
  $form.find('#entry-depth').val(depth);
  $form.find('#entry-probability').val(entry.probability || 100);
  $form.find('#entry-constant').prop('checked', isConstant);

  // 设置UI状态
  if (isConstant) {
    $form.find('.constant-toggle-slider').css('background-color', '#2196F3');
    $form.find('.label-left').css('color', '#aaa').css('font-weight', 'normal');
    $form.find('.label-right').css('color', '#fff').css('font-weight', 'bold');
  } else {
    $form.find('.constant-toggle-slider').css('background-color', '#4CAF50');
    $form.find('.label-left').css('color', '#fff').css('font-weight', 'bold');
    $form.find('.label-right').css('color', '#aaa').css('font-weight', 'normal');
  }

  // 检查是否需要显示深度输入框
  toggleDepthFieldVisibility(positionType);

  $editorPanel.find('.loading-spinner').hide();
  $form.show();
};

export function toggleDepthFieldVisibility(positionValue) {
  const parentDoc = window.parent.document;
  const $depthRow = $(`#${LOREBOOK_EDITOR_PANEL_ID} .depth-row`, parentDoc);

  const needsDepth = positionValue === 'at_depth';

  $depthRow.find('input').prop('disabled', !needsDepth);
  if (needsDepth) {
    $depthRow.removeClass('depth-disabled');
  } else {
    $depthRow.addClass('depth-disabled');
  }
}

// 【核心重构】保存编辑的条目 (使用 updateWorldbookWith API)
export const saveEditedEntry = async formData => {
  const lorebookName = formData.lorebook;
  const numericUid = ensureNumericUID(formData.uid);
  const isGlobal = formData.is_global === 'true';

  try {
    const result = await updateWorldbookEntries(lorebookName, entries => {
      const entryIndex = entries.findIndex(e => ensureNumericUID(e.uid) === numericUid);
      if (entryIndex === -1) {
        throw new Error(`未找到UID为 ${numericUid} 的条目`);
      }

      // 优化：只深拷贝需要修改的条目，并创建一个新的数组引用
      const updatedEntries = [...entries];
      const entryToUpdate = _.cloneDeep(updatedEntries[entryIndex]);
      updatedEntries[entryIndex] = entryToUpdate;

      // 将表单数据映射到新的嵌套结构
      entryToUpdate.name = formData.comment;
      entryToUpdate.content = formData.content;
      entryToUpdate.probability = parseInt(formData.probability);

      // 初始化嵌套对象（如果不存在）
      if (!entryToUpdate.strategy) entryToUpdate.strategy = {};
      if (!entryToUpdate.position) entryToUpdate.position = {};

      entryToUpdate.strategy.type = formData.constant === 'on' ? 'constant' : 'selective';
      entryToUpdate.strategy.keys = formData.keys
        .split(',')
        .map(k => k.trim())
        .filter(k => k);

      entryToUpdate.position.type = formData.position;
      entryToUpdate.position.depth = parseInt(formData.depth);

      return updatedEntries;
    });

    if (!result.success) {
      throw result.error || new Error('保存失败');
    }

    return { success: true, message: '保存成功', isGlobal: isGlobal };
  } catch (error) {
    console.error(`角色世界书: 保存条目时出错`, error);
    return { success: false, message: `保存失败: ${error.message || '未知错误'}` };
  }
};

// 验证条目更新是否成功
export const verifyEntryUpdate = async (lorebookName, numericUid, updatedEntry) => {
  try {
    console.log(`角色世界书: 验证条目更新...`);
    await new Promise(resolve => setTimeout(resolve, 300)); // 等待保存生效

    const result = await getWorldbookSafe(lorebookName);
    if (!result.success) {
      console.error(`角色世界书: 验证时获取世界书失败`, result.error);
      return false;
    }
    const verifiedEntry = result.data.find(e => ensureNumericUID(e.uid) === numericUid);

    if (verifiedEntry) {
      // 检查关键字段是否匹配
      const nameMatch = verifiedEntry.name === updatedEntry.name;
      const contentMatch = verifiedEntry.content.substring(0, 20) === updatedEntry.content.substring(0, 20);
      const typeMatch = _.get(verifiedEntry, 'strategy.type') === _.get(updatedEntry, 'strategy.type');

      console.log(`角色世界书: 验证结果 - 标题匹配: ${nameMatch}, 内容匹配: ${contentMatch}, 类型匹配: ${typeMatch}`);

      // 至少有两个字段匹配才算成功
      return (nameMatch && typeMatch) || (nameMatch && contentMatch) || (typeMatch && contentMatch);
    }

    console.log(`角色世界书: 验证时找不到条目 ${numericUid}`);
    return false;
  } catch (error) {
    console.error(`角色世界书: 验证更新时出错`, error);
    return false;
  }
};
export function createEditorPanel() {
  const parentDoc = window.parent.document;
  if ($(`#${LOREBOOK_EDITOR_PANEL_ID}`, parentDoc).length > 0) {
    return;
  }

  console.log('角色世界书: 创建编辑器面板');
  const editorHtml = `
        <div id="${LOREBOOK_EDITOR_PANEL_ID}" class="lorebook-modal" style="display: none;">
            <div class="lorebook-modal-content">
                <div class="modal-header">
                    <h4>编辑世界书条目</h4>
                    <button class="close-button" title="关闭">×</button>
                </div>
                <div class="modal-body">
                    <div class="loading-spinner">加载中...</div>
                    <form id="entry-edit-form" style="display: none;">
                        <div class="form-group">
                            <label for="entry-comment">标题/注释</label>
                            <input type="text" id="entry-comment" name="comment" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="entry-content">内容</label>
                            <textarea id="entry-content" name="content" class="form-control" rows="8" required></textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group half">
                                <label for="entry-keys">触发关键词 (用逗号分隔)</label>
                                <input type="text" id="entry-keys" name="keys" class="form-control">
                            </div>
                            <div class="form-group half">
                                <label for="entry-position">插入位置</label>
                                <select id="entry-position" name="position" class="form-control">
                                    <option value="before_character_definition">角色定义前</option>
                                    <option value="after_character_definition">角色定义后</option>
                                    <option value="before_example_messages">示例消息前</option>
                                    <option value="after_example_messages">示例消息后</option>
                                    <option value="before_author_note">作者注释前</option>
                                    <option value="after_author_note">作者注释后</option>
                                    <option value="at_depth_as_system">@系统深度</option>
                                    <option value="at_depth_as_assistant">@助手深度</option>
                                    <option value="at_depth_as_user">@用户深度</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row depth-row" style="display: none;">
                            <div class="form-group half">
                                <label for="entry-depth">深度</label>
                                <input type="number" id="entry-depth" name="depth" class="form-control" min="0" max="10" value="4">
                            </div>
                            <div class="form-group half">
                                <label for="entry-probability">概率 (%)</label>
                                <input type="number" id="entry-probability" name="probability" class="form-control" min="0" max="100" value="100">
                            </div>
                        </div>
                        <div class="form-row probability-row">
                            <div class="form-group half">
                                <label for="entry-probability">概率 (%)</label>
                                <input type="number" id="entry-probability" name="probability" class="form-control" min="0" max="100" value="100">
                            </div>
                            <div class="form-group half constant-toggle-container">
                                <label class="constant-toggle-label">激活方式</label>
                                <div class="toggle-labels">
                                    <span class="label-left">关键词</span>
                                    <span class="label-right">常量</span>
                                </div>
                                <label class="constant-toggle-switch">
                                    <input type="checkbox" id="entry-constant" name="constant">
                                    <span class="constant-toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                        <input type="hidden" id="entry-uid" name="uid">
                        <input type="hidden" id="entry-lorebook" name="lorebook">
                        <input type="hidden" id="entry-is-global" name="is_global" value="false">
                        <input type="hidden" id="entry-selective" name="selective" value="off">
                        <input type="hidden" id="entry-addMemo" name="addMemo" value="off">
                        <input type="hidden" id="entry-useProbability" name="useProbability" value="off">
                        <div class="form-actions">
                            <button type="submit" class="save-button">保存</button>
                            <button type="button" class="cancel-button">取消</button>
                        </div>
                        <div class="debug-info" style="display:none;"></div>
                    </form>
                </div>
            </div>
        </div>
    `;
  $('body', parentDoc).append(editorHtml);

  const constantToggleStyles = `
        <style id="constant-toggle-styles">
            .constant-toggle-container {
                display: flex;
                flex-direction: column;
            }
            .constant-toggle-label {
                margin-bottom: 5px;
            }
            .toggle-labels {
                display: flex;
                justify-content: space-between;
                width: 60px;
                font-size: 12px;
                color: #ccc;
                margin-bottom: 3px;
            }
            .constant-toggle-switch {
                position: relative;
                display: inline-block;
                width: 60px; /* 减小宽度 */
                height: 30px;
                margin-top: 3px;
            }
            .constant-toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .constant-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #4CAF50; /* 绿色表示关键词激活 */
                transition: .4s;
                border-radius: 34px;
            }
            .constant-toggle-slider:before {
                position: absolute;
                content: "";
                height: 22px;
                width: 22px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            .constant-toggle-switch input:checked + .constant-toggle-slider {
                background-color: #2196F3; /* 蓝色表示常量 */
            }
            .constant-toggle-switch input:focus + .constant-toggle-slider {
                box-shadow: 0 0 1px #2196F3;
            }
            .constant-toggle-switch input:checked + .constant-toggle-slider:before {
                transform: translateX(30px); /* 修改滑块移动距离 */
            }
        </style>
    `;
  $('head', parentDoc).append(constantToggleStyles);
}
