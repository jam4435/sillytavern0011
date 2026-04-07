// 通用辅助函数
import { LOREBOOK_ENTRY_CLASS } from './config.js';

export function ensureNumericUID(uid) {
  if (uid === undefined || uid === null) {
    console.warn('角色世界书: 收到undefined或null的UID值');
    return -1;
  }

  if (typeof uid === 'number') {
    return Math.floor(uid);
  }

  if (typeof uid === 'string') {
    uid = uid.replace(/[^0-9-]/g, '');
    if (uid === '' || uid === '-') {
      console.warn(`角色世界书: UID字符串"${uid}"无法解析为数字`);
      return -1;
    }
  }

  let numericUid;
  try {
    numericUid = Math.floor(Number(uid));
  } catch (e) {
    console.error(`角色世界书: UID值"${uid}"转换为数字时出错`, e);
    return -1;
  }

  if (isNaN(numericUid) || !isFinite(numericUid)) {
    console.error(`角色世界书: UID值"${uid}"(${typeof uid})不是有效数字`);
    return -1;
  }

  return numericUid;
}

export function errorCatched(fn, context = '角色世界书') {
  const onError = error => {
    let iframeName = 'UnknownIframe';
    try {
      iframeName = typeof getIframeName === 'function' ? getIframeName() : 'UnknownIframe';
    } catch (e) {
      console.warn(`(${context}) 无法获取iframe名称:`, e);
    }
    const errorMessage = `${iframeName} (${context})中发生错误: ${error.stack || error.message || error.name}`;
    console.error(errorMessage);
    if (typeof triggerSlash === 'function') {
      try {
        // triggerSlash(`echo severity=error ${errorMessage.substring(0, 500)}...`);
      } catch (e) {
        console.error(`(${context}) 无法触发slash命令报告错误:`, e);
      }
    }
    console.error(`${context}错误: ${error.message || '未知错误'}`);
  };
  return (...args) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch(error => {
          onError(error);
          throw error;
        });
      }
      return result;
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') {
    return '';
  }
  const hexValue = hex.startsWith('#') ? hex.substring(1) : hex;
  if (!/^[0-9A-Fa-f]{3,6}$/.test(hexValue)) {
    console.error('无效的十六进制颜色值:', hex);
    return '';
  }
  let r, g, b;
  if (hexValue.length === 3) {
    r = parseInt(hexValue + hexValue, 16);
    g = parseInt(hexValue + hexValue, 16);
    b = parseInt(hexValue + hexValue, 16);
  } else {
    r = parseInt(hexValue.substring(0, 2), 16);
    g = parseInt(hexValue.substring(2, 4), 16);
    b = parseInt(hexValue.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbaToHex(color) {
  if (!color || typeof color !== 'string') return '#000000';
  if (color.startsWith('#')) return color;
  if (color.startsWith('rgba')) {
    const parts = color.substring(color.indexOf('(') + 1, color.lastIndexOf(')')).split(/,\s*/);
    if (parts.length < 3) return '#000000';
    const r = parseInt(parts, 10);
    const g = parseInt(parts, 10);
    const b = parseInt(parts, 10);
    const toHex = c => ('0' + c.toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return color;
}

export const isMobile = () => {
  const screenWidth = screen.width;
  const screenHeight = screen.height;

  if (screenHeight >= screenWidth) {
    return true;
  }

  if (screenHeight < 650) {
    return true;
  }

  return false;
};

// 上下移动条目函数
export const moveEntryUpDown = errorCatched(async (lorebookName, entryUid, direction) => {
  const numericUid = ensureNumericUID(entryUid);
  const parentDoc = window.parent.document;

  try {
    const $item = $(`.${LOREBOOK_ENTRY_CLASS}[data-entry-uid="${numericUid}"]`, parentDoc);
    if (!$item.length) {
      console.error(`角色世界书: 找不到要移动的条目 ${numericUid}`);
      return false;
    }

    const $container = $item.closest('.lorebook-entries-container');
    const $items = $container.find(`.${LOREBOOK_ENTRY_CLASS}`);
    const itemIndex = $items.index($item);

    let targetIndex;
    if (direction === 'up') {
      if (itemIndex === 0) return false;
      targetIndex = itemIndex - 1;
    } else {
      if (itemIndex === $items.length - 1) return false;
      targetIndex = itemIndex + 1;
    }

    const $targetItem = $items.eq(targetIndex);

    if (direction === 'up') {
      $item.insertBefore($targetItem);
    } else {
      $item.insertAfter($targetItem);
    }

    return true;
  } catch (error) {
    console.error(`角色世界书: 移动条目时出错`, error);
    return false;
  }
}, 'moveEntryUpDown');

// 修复UID类型不一致问题
export function fixUIDMismatchIssue() {
  const parentDoc = window.parent.document;
  const $entries = $(`.${LOREBOOK_ENTRY_CLASS}`, parentDoc);

  $entries.each(function () {
    const $entry = $(this);
    const entryUid = $entry.attr('data-entry-uid');
    const numericUid = String(Math.floor(Number(entryUid)));

    if (entryUid !== numericUid) {
      $entry.attr('data-entry-uid', numericUid);
    }
  });

  return true;
}

// 新增：前端触发下载的辅助函数
export const triggerDownload = errorCatched((filename, content) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}, 'triggerDownload');

// 新增：打开文件选择器并读取文件内容的辅助函数
export const openFilePickerAndRead = errorCatched(() => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) {
        return reject(new Error('未选择任何文件。'));
      }

      const reader = new FileReader();
      reader.onload = readerEvent => {
        const content = readerEvent.target.result;
        resolve({ filename: file.name, content });
      };
      reader.onerror = () => reject(new Error('读取文件时出错。'));
      reader.readAsText(file, 'UTF-8');
    };

    input.click();
  });
}, 'openFilePickerAndRead');

/**
 * 将插件内部使用的世界书条目格式转换为酒馆原生导出格式
 * @param {Array<Object>} pluginEntries - 插件格式的条目数组
 * @returns {Object} 包含原生 `entries` 对象的顶层对象
 */
export const convertPluginToNativeFormat = pluginEntries => {
  const nativeEntries = {};

  pluginEntries.forEach((entry, index) => {
    const uid = ensureNumericUID(entry.uid);

    // 基础转换
    const nativeEntry = {
      uid: uid,
      displayIndex: entry.position?.order ?? index,
      comment: entry.name || '',
      disable: !entry.enabled,
      constant: entry.strategy?.type === 'constant',
      selective: entry.strategy?.type === 'selective',
      key: entry.strategy?.keys || [],
      selectiveLogic: entry.strategy?.keys_secondary?.logic === 'and_any' ? 0 : 1, // 假设 and_any 对应 0
      keysecondary: entry.strategy?.keys_secondary?.keys || [],
      scanDepth: entry.strategy?.scan_depth === 'same_as_global' ? null : entry.strategy?.scan_depth,
      vectorized: false, // 插件格式中没有对应字段
      position: entry.position?.type === 'after_character_definition' ? 1 : 0, // 简化映射
      role: entry.position?.role || null,
      depth: entry.position?.depth || 4,
      order: entry.position?.order || 100,
      content: entry.content || '',
      useProbability: true, // 假设总是使用概率
      probability: entry.probability || 100,
      excludeRecursion: entry.recursion?.prevent_incoming || false,
      preventRecursion: entry.recursion?.prevent_outgoing || false,
      delayUntilRecursion: entry.recursion?.delay_until || false,
      sticky: entry.effect?.sticky || null,
      cooldown: entry.effect?.cooldown || null,
      delay: entry.effect?.delay || null,
      addMemo: entry.addMemo || false,
      matchPersonaDescription: entry.matchPersonaDescription || false,
      matchCharacterDescription: entry.matchCharacterDescription || false,
      matchCharacterPersonality: entry.matchCharacterPersonality || false,
      matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt || false,
      matchScenario: entry.matchScenario || false,
      matchCreatorNotes: entry.matchCreatorNotes || false,
      group: entry.group || '',
      groupOverride: entry.groupOverride || false,
      groupWeight: entry.groupWeight || 100,
      caseSensitive: entry.caseSensitive || null,
      matchWholeWords: entry.matchWholeWords || null,
      useGroupScoring: entry.useGroupScoring || false,
      automationId: entry.automationId || '',
      ignoreBudget: false, // 插件格式中没有对应字段
      triggers: [], // 插件格式中没有对应字段
      characterFilter: {
        isExclude: false,
        names: [],
        tags: [],
      }, // 插件格式中没有对应字段
    };

    nativeEntries[uid] = nativeEntry;
  });

  // 返回符合酒馆原生格式的顶层对象
  return { entries: nativeEntries };
};
