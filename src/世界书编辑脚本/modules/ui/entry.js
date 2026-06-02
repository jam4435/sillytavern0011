import { LOREBOOK_ENTRY_CHECKBOX_CLASS, LOREBOOK_ENTRY_CLASS, LOREBOOK_TOGGLE_SWITCH_CLASS } from '../config.js';
import { isEntryActive } from '../features/activationTracker.js';
import { getHighlightActiveEntriesSetting } from '../settings.js';
import { isEntryCurrentDetail, isEntryExpanded, isEntrySelected } from '../state.js';
import { ensureNumericUID, isMobile } from '../utils.js';
import { getMasterDetailPositionLabel, isMasterDetailLayout } from './detail.js';
import { buildLargeContentPreviewCardHtml, shouldPreviewLargeContent } from './largeContentPreview.js';
import { buildMasterEntryTokenBadgeHtml } from './masterEntryTokens.js';

/* --- Create HTML for a single lorebook entry --- */
export function createEntryHtml(entry, lorebookName, isGlobal = false) {
  const numericUid = ensureNumericUID(entry.uid);

  if (!entry || typeof entry !== 'object') {
    console.error(`角色世界书: createEntryHtml received invalid entry data:`, entry);
    return '';
  }

  // Safely get data with defaults
  const entryTitleText = entry.name || '未命名条目';
  const entryTitle = _.escape(entryTitleText);
  const isEnabled = entry.enabled !== false;
  const strategy = entry.strategy || {};
  const position = entry.position || {};
  const recursion = entry.recursion || {};
  const isPinned = entry.pinned === true;

  const isConstant = strategy.type === 'constant';
  const positionType = position.type || 'after_character_definition';
  const depth = position.depth !== undefined ? position.depth : 4;
  const order = position.order || 0;
  const probability = entry.probability || 100;
  const keys = strategy.keys || [];
  const keysSecondary = strategy.keys_secondary || { logic: 'and_any', keys: [] };
  const preventOutgoing = recursion.prevent_outgoing === true;
  const preventIncoming = recursion.prevent_incoming === true;
  const delayRecursion = recursion.delay_until != null && recursion.delay_until !== false;
  const pinnedCheckedAttr = isPinned ? 'checked' : '';
  const content = entry.content || '';
  const contentMarkup = shouldPreviewLargeContent(content)
    ? buildLargeContentPreviewCardHtml(content, {
        hint: '内容过长，请使用上方按钮在全屏中查看和修改。',
      })
    : `<textarea class="content-textarea" rows="8" data-action="edit-content">${_.escape(content)}</textarea>`;

  const disabledClass = isEnabled ? '' : 'disabled-entry';
  const checkedAttr = isEnabled ? 'checked' : '';
  const constantCheckedAttr = isConstant ? 'checked' : '';
  const constantSliderClass = isConstant ? 'constant' : 'keyword';
  const needsDepth = positionType === 'at_depth';
  const depthDisabledClass = needsDepth ? '' : 'depth-disabled';
  const depthDisabledAttr = needsDepth ? '' : 'disabled';

  // 检查是否需要高亮激活状态
  const isHighlightEnabled = getHighlightActiveEntriesSetting();
  const activeClass = isHighlightEnabled && isEntryActive(entry.uid, lorebookName) ? 'entry-active' : '';

  const positionOptions = [
    { value: 'before_character_definition', text: '角色定义前' },
    { value: 'after_character_definition', text: '角色定义后' },
    { value: 'before_example_messages', text: '示例消息前' },
    { value: 'after_example_messages', text: '示例消息后' },
    { value: 'before_author_note', text: '作者注释前' },
    { value: 'after_author_note', text: '作者注释后' },
    { value: 'at_depth', text: '@深度' },
  ]
    .map(pos => `<option value="${pos.value}" ${pos.value === positionType ? 'selected' : ''}>${pos.text}</option>`)
    .join('');
  const positionLabelMap = {
    before_character_definition: '角色定义前',
    after_character_definition: '角色定义后',
    before_example_messages: '示例消息前',
    after_example_messages: '示例消息后',
    before_author_note: '作者注释前',
    after_author_note: '作者注释后',
    at_depth: '@深度',
  };
  const masterMetaParts = [positionLabelMap[positionType] || positionType];
  if (needsDepth) {
    masterMetaParts.push(`深度 ${depth}`);
  }
  masterMetaParts.push(`顺序 ${order}`);
  masterMetaParts.push(`概率 ${probability}`);
  const masterMetaText = masterMetaParts.join(' · ');

  // Sync checkbox with selection state
  const isSelected = isEntrySelected(lorebookName, numericUid);
  const selectedCheckboxAttr = isSelected ? 'checked' : '';
  const isCurrentDetail = isEntryCurrentDetail(lorebookName, numericUid, isGlobal);
  const selectedDetailClass = isCurrentDetail ? 'is-current-detail' : '';
  const compactMasterMetaParts = [getMasterDetailPositionLabel(positionType) || positionType];
  if (needsDepth) {
    compactMasterMetaParts.push(`D${depth}`);
  }
  compactMasterMetaParts.push(`#${order}`);
  const compactMasterMetaText = compactMasterMetaParts.filter(Boolean).join(' · ');

  if (isMasterDetailLayout()) {
    return `
        <div class="${LOREBOOK_ENTRY_CLASS} master-entry-item ${disabledClass} ${activeClass} ${selectedDetailClass}"
             data-entry-uid="${numericUid}"
             data-entry-lorebook="${lorebookName}"
             data-enabled="${isEnabled}"
             data-order="${order}">
            <div class="master-entry-main">
                <div class="master-entry-button">
                    <div class="master-entry-text">
                        <span class="master-entry-title-row">
                            <span class="master-entry-title">${entryTitle}</span>
                            <input class="master-entry-title-input" type="text" value="${entryTitle}" placeholder="条目名" data-action="edit-title">
                            <button class="master-entry-title-edit-button" type="button" data-action="start-edit-title" title="修改条目名">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </span>
                        <span class="master-entry-meta">
                            <span class="master-entry-meta-primary">${_.escape(compactMasterMetaText)}</span>
                            ${buildMasterEntryTokenBadgeHtml(entry, lorebookName, isGlobal)}
                        </span>
                    </div>
                    <div class="master-entry-status">
                        <i class="fa-solid fa-thumbtack master-entry-pin" style="${isPinned ? '' : 'display:none;'}"></i>
                    </div>
                </div>
            </div>
            <div class="master-entry-controls">
                <label class="${LOREBOOK_TOGGLE_SWITCH_CLASS} master-entry-toggle" title="${isEnabled ? '启用' : '禁用'}">
                    <input type="checkbox" data-action="toggle-enabled" ${checkedAttr}>
                    <span class="toggle-slider"></span>
                </label>
                <div class="mini-constant-toggle master-entry-mode-control" title="${isConstant ? '常驻' : '触发'}">
                    <label class="mini-toggle-switch">
                        <input type="checkbox" class="constant-checkbox" data-action="toggle-constant" ${constantCheckedAttr}>
                        <span class="mini-toggle-slider ${constantSliderClass}"></span>
                    </label>
                </div>
            </div>
            <div class="select-checkbox-container">
                <input type="checkbox" class="${LOREBOOK_ENTRY_CHECKBOX_CLASS}" data-entry-uid="${numericUid}" title="选择此条目" data-action="select-entry" ${selectedCheckboxAttr}>
            </div>
        </div>
    `;
  }

  if (isMasterDetailLayout()) {
    return `
        <div class="${LOREBOOK_ENTRY_CLASS} master-entry-item ${disabledClass} ${activeClass} ${selectedDetailClass}"
             data-entry-uid="${numericUid}"
             data-entry-lorebook="${lorebookName}"
             data-enabled="${isEnabled}"
             data-order="${order}">
            <div class="master-entry-controls">
                <label class="${LOREBOOK_TOGGLE_SWITCH_CLASS} master-entry-toggle" title="${isEnabled ? '已启用' : '已禁用'}">
                    <input type="checkbox" data-action="toggle-enabled" ${checkedAttr}>
                    <span class="toggle-slider"></span>
                </label>
                <div class="mini-constant-toggle master-entry-mode-control" title="${isConstant ? '常驻' : '触发'}">
                    <label class="mini-toggle-switch">
                        <input type="checkbox" class="constant-checkbox" data-action="toggle-constant" ${constantCheckedAttr}>
                        <span class="mini-toggle-slider ${constantSliderClass}"></span>
                    </label>
                </div>
            </div>
            <button class="master-entry-button" type="button">
                <div class="master-entry-main">
                    <span class="master-entry-title">${entryTitle}</span>
                    <span class="master-entry-meta">${_.escape(masterMetaText)}</span>
                </div>
                <div class="master-entry-status">
                    <i class="fa-solid fa-thumbtack master-entry-pin" style="${isPinned ? '' : 'display:none;'}"></i>
                </div>
            </button>
            <div class="select-checkbox-container">
                <input type="checkbox" class="${LOREBOOK_ENTRY_CHECKBOX_CLASS}" data-entry-uid="${numericUid}" title="选择此条目" data-action="select-entry" ${selectedCheckboxAttr}>
            </div>
        </div>
    `;
  }

  if (isMasterDetailLayout()) {
    return `
        <div class="${LOREBOOK_ENTRY_CLASS} master-entry-item ${disabledClass} ${activeClass} ${selectedDetailClass}"
             data-entry-uid="${numericUid}"
             data-entry-lorebook="${lorebookName}"
             data-enabled="${isEnabled}"
             data-order="${order}">
            <div class="master-entry-controls">
                <label class="${LOREBOOK_TOGGLE_SWITCH_CLASS} master-entry-toggle" title="${isEnabled ? '已启用' : '已禁用'}">
                    <input type="checkbox" data-action="toggle-enabled" ${checkedAttr}>
                    <span class="toggle-slider"></span>
                </label>
                <div class="mini-constant-toggle master-entry-mode-control" title="${isConstant ? '常驻' : '触发'}">
                    <label class="mini-toggle-switch">
                        <input type="checkbox" class="constant-checkbox" data-action="toggle-constant" ${constantCheckedAttr}>
                        <span class="mini-toggle-slider ${constantSliderClass}"></span>
                    </label>
                </div>
            </div>
            <button class="master-entry-button" type="button">
                <div class="master-entry-main">
                    <span class="master-entry-title">${entryTitle}</span>
                    <span class="master-entry-meta">${_.escape(`${isConstant ? '常驻' : '触发'} · ${positionType} · 顺序 ${order}`)}</span>
                </div>
                <div class="master-entry-status">
                    <i class="fa-solid fa-thumbtack master-entry-pin" style="${isPinned ? '' : 'display:none;'}"></i>
                    <span class="master-entry-enabled ${isEnabled ? '' : 'is-disabled'}">${isEnabled ? '已启用' : '已禁用'}</span>
                </div>
            </button>
            <div class="select-checkbox-container">
                <input type="checkbox" class="${LOREBOOK_ENTRY_CHECKBOX_CLASS}" data-entry-uid="${numericUid}" title="选择此条目" data-action="select-entry" ${selectedCheckboxAttr}>
            </div>
        </div>
    `;
  }

  // Check if entry is expanded
  const isExpanded = isEntryExpanded(lorebookName, numericUid);
  const expandedAttr = isExpanded ? 'true' : 'false';
  const expandAreaStyle = isExpanded ? '' : 'display:none;';
  const expandIconClass = isExpanded ? 'fa-chevron-up' : 'fa-chevron-down';

  // 【调试】记录HTML生成时的展开状态
  if (isExpanded) {
    console.log(
      `%c[entry.js调试] createEntryHtml 生成展开状态的条目`,
      'color: #00bcd4; font-weight: bold;',
      {
        世界书: lorebookName,
        UID: numericUid,
        isExpanded,
        expandedAttr,
        expandAreaStyle,
        调用栈: new Error().stack.split('\n').slice(2, 5).join('\n'),
      },
    );
  }

  const pcLayout = `
        <div class="drag-handle"><i class="fa-solid fa-grip-vertical"></i></div>
        <button class="small-expand-button" data-action="expand"><i class="fa-solid ${expandIconClass}"></i></button>
        <button class="content-edit-button entry-ai-button" data-action="ai-edit-entry" title="AI改写此条目">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
        </button>
        <label class="${LOREBOOK_TOGGLE_SWITCH_CLASS}">
            <input type="checkbox" data-action="toggle-enabled" ${checkedAttr}>
            <span class="toggle-slider"></span>
        </label>
        <input type="text" class="entry-item-title" value="${entryTitle}" placeholder="条目标题" data-action="edit-title">
        <div class="mini-constant-toggle">
            <label class="mini-toggle-switch">
                <input type="checkbox" class="constant-checkbox" data-action="toggle-constant" ${constantCheckedAttr}>
                <span class="mini-toggle-slider ${constantSliderClass}"></span>
            </label>
        </div>
        <select class="mini-position-select" data-action="edit-position">${positionOptions}</select>
        <div class="depth-input-container ${depthDisabledClass}">
            <input type="number" class="mini-number-input depth-input" min="0" max="10" value="${depth}" ${depthDisabledAttr} data-action="edit-depth">
        </div>
        <div class="order-input-container">
            <input type="number" class="mini-number-input order-input" min="0" value="${order}" data-action="edit-order">
        </div>
        <div class="prob-input-container">
            <input type="number" class="mini-number-input prob-input" min="0" max="100" value="${probability}" data-action="edit-prob">
        </div>
        <div class="select-checkbox-container">
            <input type="checkbox" class="${LOREBOOK_ENTRY_CHECKBOX_CLASS}" data-entry-uid="${numericUid}" title="选择此条目" data-action="select-entry" ${selectedCheckboxAttr}>
        </div>
    `;

  const mobileLayout = `
        <div class="drag-handle"><i class="fa-solid fa-grip-vertical"></i></div>
        <div class="mobile-row-1">
            <div class="mobile-control-group">
                <span class="mobile-label">移动:</span>
                <div class="move-buttons-container">
                    <button class="move-button move-up-button" title="上移条目" data-action="move-up"><i class="fa-solid fa-chevron-up"></i></button>
                    <button class="move-button move-down-button" title="下移条目" data-action="move-down"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
            </div>
            <div class="mobile-title-editor">
                <button type="button" class="mobile-entry-title-display" data-action="start-edit-title" title="${entryTitle}">
                    ${entryTitle}
                </button>
                <input type="text" class="entry-item-title mobile-entry-title-input" value="${entryTitle}" placeholder="条目标题" data-action="edit-title">
            </div>
            <div class="entry-header-right-actions">
                <button class="content-edit-button entry-ai-button" data-action="ai-edit-entry" title="AI改写此条目">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </button>
                <button class="small-expand-button" data-action="expand"><i class="fa-solid ${expandIconClass}"></i></button>
                <div class="select-checkbox-container">
                     <input type="checkbox" class="${LOREBOOK_ENTRY_CHECKBOX_CLASS}" data-entry-uid="${numericUid}" title="选择此条目" data-action="select-entry" ${selectedCheckboxAttr}>
                </div>
            </div>
        </div>
        <div class="mobile-row-2">
            <div class="mobile-control-group"><span class="mobile-label">启用:</span><label class="${LOREBOOK_TOGGLE_SWITCH_CLASS}"><input type="checkbox" data-action="toggle-enabled" ${checkedAttr}><span class="toggle-slider"></span></label></div>
            <div class="mobile-control-group"><span class="mobile-label">类型:</span><div class="mini-constant-toggle"><label class="mini-toggle-switch"><input type="checkbox" class="constant-checkbox" data-action="toggle-constant" ${constantCheckedAttr}><span class="mini-toggle-slider ${constantSliderClass}"></span></label></div></div>
            <select class="mini-position-select" data-action="edit-position">${positionOptions}</select>
            <div class="depth-input-container ${depthDisabledClass}"><input type="number" class="mini-number-input depth-input" min="0" max="10" value="${depth}" ${depthDisabledAttr} data-action="edit-depth"></div>
            <div class="mobile-control-group"><span class="mobile-label">顺序:</span><div class="order-input-container"><input type="number" class="mini-number-input order-input" min="0" value="${order}" data-action="edit-order"></div></div>
            <div class="mobile-control-group"><span class="mobile-label">概率:</span><div class="prob-input-container"><input type="number" class="mini-number-input prob-input" min="0" max="100" value="${probability}" data-action="edit-prob"></div></div>
        </div>
    `;

  const headerLayout = isMobile() ? mobileLayout : pcLayout;

  return `
        <div class="${LOREBOOK_ENTRY_CLASS} ${disabledClass} ${activeClass}"
             data-entry-uid="${numericUid}"
             data-entry-lorebook="${lorebookName}"
             data-enabled="${isEnabled}"
             data-expanded="${expandedAttr}"
             data-order="${order}">
            <div class="entry-header" data-action="open-editor">
                ${headerLayout}
            </div>
            <div class="entry-expand-area" style="${expandAreaStyle}">
                <div class="uid-display-area"><label>UID:</label><span class="uid-value">${entry.uid}</span></div>
                <div class="content-edit-area">
                    <div class="content-header">
                        <div class="content-header-left">
                            <label>内容:</label>
                            <button class="content-edit-button" data-action="open-content-editor" title="在新窗口中编辑内容">
                                <i class="fa-solid fa-expand"></i>
                            </button>
                            <button class="content-edit-button" data-action="open-compare-editor" title="打开对比编辑">
                                <i class="fa-solid fa-not-equal"></i>
                            </button>
                        </div>
                        <div class="content-header-right">
                            <span class="token-counter">0 词符</span>
                        </div>
                    </div>
                    ${contentMarkup}
                </div>
                <div class="keywords-edit-area">
                    <div class="keyword-group">
                        <label>主要关键字</label>
                        <input class="keywords-input" type="text" value="${_.escape(Array.isArray(keys) ? keys.join(', ') : '')}" data-action="edit-keys" placeholder="逗号分隔列表">
                    </div>
                    <div class="keyword-group logic-group">
                        <label>逻辑</label>
                        <select class="secondary-keys-logic-select" data-action="edit-keys-secondary-logic">
                            <option value="and_any" ${keysSecondary.logic === 'and_any' ? 'selected' : ''}>与任意</option>
                            <option value="and_all" ${keysSecondary.logic === 'and_all' ? 'selected' : ''}>与所有</option>
                            <option value="not_all" ${keysSecondary.logic === 'not_all' ? 'selected' : ''}>不与所有</option>
                            <option value="not_any" ${keysSecondary.logic === 'not_any' ? 'selected' : ''}>不与任意</option>
                        </select>
                    </div>
                    <div class="keyword-group">
                        <label>可选过滤器</label>
                        <input class="secondary-keywords-input" type="text" value="${_.escape(Array.isArray(keysSecondary.keys) ? keysSecondary.keys.join(', ') : '')}" data-action="edit-keys-secondary" placeholder="逗号分隔列表 (如果为空则忽略)">
                    </div>
                </div>
                <div class="recursion-options-area">
                    <label class="recursion-label">递归控制:</label>
                    <div class="checkbox-wrapper"><input type="checkbox" id="prevent-recursion-${numericUid}" data-action="toggle-prevent-outgoing" ${preventOutgoing ? 'checked' : ''}><label for="prevent-recursion-${numericUid}">防止递归(本条目不激活其他条目)</label></div>
                    <div class="checkbox-wrapper"><input type="checkbox" id="exclude-recursion-${numericUid}" data-action="toggle-prevent-incoming" ${preventIncoming ? 'checked' : ''}><label for="exclude-recursion-${numericUid}">排除递归(不会被其他条目激活)</label></div>
                    <div class="checkbox-wrapper"><input type="checkbox" id="delay-recursion-${numericUid}" data-action="toggle-delay-recursion" ${delayRecursion ? 'checked' : ''}><label for="delay-recursion-${numericUid}">延迟直到递归</label></div>
                    <div class="checkbox-wrapper"><input type="checkbox" id="pin-entry-${numericUid}" data-action="toggle-pinned" ${pinnedCheckedAttr}><label for="pin-entry-${numericUid}">置顶条目</label></div>
                </div>
            </div>
        </div>
    `;
}
