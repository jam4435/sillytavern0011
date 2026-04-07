/**
 * 展开状态管理器
 *
 * 解决展开状态三重存储问题：
 * 1. state.js 中的 Set (expandedEntries) - 作为单一数据源
 * 2. DOM 属性 (data-expanded)
 * 3. CSS 显示状态 (.entry-expand-area)
 *
 * 此模块统一管理展开状态，确保三者一致性
 */

import { DEBUG_MODE, LOREBOOK_PANEL_ID } from '../config.js';
import { isEntryExpanded, toggleEntryExpanded } from '../state.js';

/**
 * 同步展开状态到 DOM（单一数据源：state.js）
 * 用于虚拟滚动重渲染时恢复正确的展开状态
 *
 * @param {jQuery} $entry - 条目的 jQuery 对象
 * @param {string} lorebookName - 世界书名称
 * @param {number} uid - 条目的数字 UID
 * @param {number} styleHeight - 折叠状态下的高度（像素）
 * @returns {boolean} 当前的展开状态
 */
export function syncExpandState($entry, lorebookName, uid, styleHeight) {
  const isExpanded = isEntryExpanded(lorebookName, uid);

  // 同步 DOM 属性
  $entry.attr('data-expanded', isExpanded ? 'true' : 'false');

  // 同步高度样式
  if (isExpanded) {
    $entry.css('height', 'auto');
  } else if (styleHeight !== null && styleHeight !== undefined) {
    $entry.css('height', `${styleHeight}px`);
  }

  // 同步展开区域显示状态
  const $expandArea = $entry.find('.entry-expand-area');
  if (isExpanded) {
    $expandArea.show();
  } else {
    $expandArea.hide();
  }

  // 同步图标状态
  const $icon = $entry.find('.small-expand-button i');
  if (isExpanded) {
    $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
  } else {
    $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
  }

  return isExpanded;
}

/**
 * 设置展开状态并同步 DOM
 * 用于用户点击展开/折叠按钮时
 *
 * @param {jQuery} $entry - 条目的 jQuery 对象
 * @param {string} lorebookName - 世界书名称
 * @param {number} uid - 条目的数字 UID
 * @param {boolean} expanded - 目标展开状态
 * @param {number} styleHeight - 折叠状态下的高度（像素）
 * @param {boolean} animate - 是否使用动画，默认 true
 * @returns {boolean} 新的展开状态
 */
export function setExpanded($entry, lorebookName, uid, expanded, styleHeight, animate = true) {
  if (DEBUG_MODE) {
    console.log(`[ExpandManager] setExpanded`, { lorebookName, uid, expanded, animate });
  }

  // 更新 state.js 中的状态（单一数据源）
  toggleEntryExpanded(lorebookName, uid, expanded);

  // 同步 DOM 属性
  $entry.attr('data-expanded', expanded ? 'true' : 'false');

  // 处理高度
  if (expanded) {
    $entry.css('height', 'auto');
  } else if (styleHeight !== null && styleHeight !== undefined) {
    $entry.css('height', `${styleHeight}px`);
  } else {
    $entry.css('height', '');
  }

  // 处理展开区域
  const $expandArea = $entry.find('.entry-expand-area');

  if (animate) {
    // 添加标记防止 clusterChanged 回调中重复处理
    $entry.attr('data-expanding', 'true');

    if (expanded) {
      $expandArea.slideDown(200, () => {
        $entry.removeAttr('data-expanding');
      });
    } else {
      $expandArea.slideUp(200, () => {
        $entry.removeAttr('data-expanding');
      });
    }
  } else {
    if (expanded) {
      $expandArea.show();
    } else {
      $expandArea.hide();
    }
  }

  // 同步图标状态
  const $icon = $entry.find('.small-expand-button i');
  if (expanded) {
    $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
  } else {
    $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
  }

  return expanded;
}

/**
 * 切换展开状态
 *
 * @param {jQuery} $entry - 条目的 jQuery 对象
 * @param {string} lorebookName - 世界书名称
 * @param {number} uid - 条目的数字 UID
 * @param {number} styleHeight - 折叠状态下的高度（像素）
 * @param {boolean} animate - 是否使用动画，默认 true
 * @returns {boolean} 新的展开状态
 */
export function toggleExpanded($entry, lorebookName, uid, styleHeight, animate = true) {
  const currentState = isEntryExpanded(lorebookName, uid);
  return setExpanded($entry, lorebookName, uid, !currentState, styleHeight, animate);
}

/**
 * 批量同步可见条目的展开状态
 * 用于虚拟滚动的 clusterChanged 回调
 *
 * @param {jQuery} $contentArea - 内容区域的 jQuery 对象
 * @param {string} lorebookName - 世界书名称
 * @param {number} styleHeight - 折叠状态下的高度（像素）
 * @param {Function} ensureNumericUID - UID 转换函数
 */
export function syncVisibleEntries($contentArea, lorebookName, styleHeight, ensureNumericUID) {
  const $visibleEntries = $contentArea.find('> li > .lorebook-entry-item');

  $visibleEntries.each(function () {
    const $entry = $(this);
    const entryUid = ensureNumericUID($entry.attr('data-entry-uid'));

    // 如果条目正在进行展开/折叠动画，跳过处理
    const isExpanding = $entry.attr('data-expanding') === 'true';
    if (isExpanding) {
      return;
    }

    // 同步展开状态
    syncExpandState($entry, lorebookName, entryUid, styleHeight);
  });
}

/**
 * 使用 DOM 操作测量折叠状态下的条目高度
 * 替代脆弱的正则表达式替换方法
 *
 * @param {Object} entry - 条目数据对象
 * @param {string} lorebookName - 世界书名称
 * @param {Function} createEntryHtml - 创建条目 HTML 的函数
 * @param {jQuery} [$referenceContainer] - 可选的参考容器，用于获取正确的宽度
 * @returns {{ styleHeight: number, fixedHeight: number }} 高度信息
 */
export function measureCollapsedHeight(entry, lorebookName, createEntryHtml, $referenceContainer) {
  // 获取参考容器的宽度，如果没有提供则使用默认值
  let containerWidth = '100%';
  if ($referenceContainer && $referenceContainer.length > 0) {
    // 尝试获取容器的实际宽度
    const refWidth = $referenceContainer.width();
    if (refWidth && refWidth > 0) {
      containerWidth = refWidth + 'px';
    }
  }

  // 尝试将临时容器插入到面板内部，以继承正确的 CSS 样式
  // 如果面板不存在，则回退到 body
  const $panel = $(`#${LOREBOOK_PANEL_ID}`);
  const $appendTarget = $panel.length > 0 ? $panel : $('body');

  // 创建临时容器
  const $temp = $('<div>')
    .css({
      position: 'absolute',
      visibility: 'hidden',
      left: '-9999px',
      // 使用参考容器的宽度，确保测量准确
      width: containerWidth
    })
    .appendTo($appendTarget);

  // 生成 HTML
  const entryHtml = createEntryHtml(entry, lorebookName);
  const $tempLi = $('<li>').html(entryHtml);
  $temp.append($tempLi);

  // 使用 DOM API 确保折叠状态
  const $entry = $tempLi.find('.lorebook-entry-item');
  $entry.attr('data-expanded', 'false');
  // 使用 CSS 直接设置 display:none，确保在测量前生效
  const $expandArea = $entry.find('.entry-expand-area');
  $expandArea.css('display', 'none');

  // 强制浏览器重新计算布局，确保 display:none 生效
  // eslint-disable-next-line no-unused-expressions
  $temp[0].offsetHeight;

  // 测量高度
  const preciseHeight = $tempLi[0].getBoundingClientRect().height;

  // styleHeight: 写入 DOM 的高度 (不含 margin)
  const styleHeight = Math.ceil(preciseHeight);

  // fixedHeight: 告知 Clusterize 的高度 (包含 margin)
  // 8px 是 CSS 中定义的 margin-bottom
  const fixedHeight = styleHeight + 8;

  // 清理
  $temp.remove();

  return { styleHeight, fixedHeight };
}
