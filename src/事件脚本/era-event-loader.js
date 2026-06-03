// ================================================================================
// ERA 事件系统 - 事件加载模块
// ================================================================================
// 包含: 从世界书加载事件定义

import { CONFIG, log, logError, logSuccess, logWarning, debugGroup, debugGroupEnd, debugTable } from './era-utils.js';

// ==================== 从世界书加载事件定义 ====================
export async function loadEventDefinitionsFromWorldbook() {
  debugGroup('📚 加载事件定义');

  const eventDefinitions = {};

  try {
    const charWorldbooks = await getCharWorldbookNames('current');
    const worldbookNamesToScan = [
      ...(charWorldbooks.primary ? [charWorldbooks.primary] : []),
      ...charWorldbooks.additional,
    ];

    if (worldbookNamesToScan.length === 0) {
      logWarning('未找到关联的角色世界书');
      debugGroupEnd();
      return {};
    }

    log('扫描的世界书:', worldbookNamesToScan);

    const worldbooksContents = await Promise.all(
      worldbookNamesToScan.map(name =>
        getWorldbook(name).catch(e => {
          logError(`无法加载世界书: ${name}`, e);
          return [];
        }),
      ),
    );

    let totalEntries = 0;
    for (const entries of worldbooksContents) {
      if (!entries) continue;

      totalEntries += entries.length;

      for (const entry of entries) {
        log(`[DEBUG] 正在检查条目名称: "${entry.name}"`);

        // 方式1：检查精确前缀匹配（向后兼容）
        const matchedPrefix = CONFIG.EVENT_KEY_PREFIXES.find(prefix => entry.name && entry.name.startsWith(prefix));
        let eventName = null;

        if (matchedPrefix) {
          // 精确前缀匹配：移除前缀作为事件名
          eventName = entry.name.substring(matchedPrefix.length);
          log(`[DEBUG] 精确前缀匹配: ${matchedPrefix}`);
        } else {
          // 方式2：检查正则模式匹配（支持 xxx事件条目-xxx、xxx登场事件-xxx 等格式）
          for (const pattern of CONFIG.EVENT_KEY_PATTERNS) {
            const match = entry.name && entry.name.match(pattern);
            if (match) {
              // 使用完整条目名作为事件名（保留前缀部分以区分不同小说）
              eventName = entry.name;
              log(`[DEBUG] 正则模式匹配: ${pattern}`);
              break;
            }
          }
        }

        log(`[DEBUG] 是否为事件条目? ${!!eventName}`);

        // 检查条目名称 (name 字段)
        if (eventName && entry.content) {
          try {
            const eventData = JSON.parse(entry.content);
            eventDefinitions[eventName] = eventData;
            logSuccess(`加载事件: ${eventName}`);
          } catch (e) {
            logError(`解析事件条目JSON失败 (条目: ${entry.name}):`, e);
            toastr.error(`解析事件JSON失败: ${entry.name}`);
          }
        }
      }
    }

    log(`世界书总条目数: ${totalEntries}`);
    log(`识别到的事件数: ${Object.keys(eventDefinitions).length}`);

    if (Object.keys(eventDefinitions).length > 0) {
      debugTable(
        Object.keys(eventDefinitions).map(name => ({
          事件名: name,
          地点: eventDefinitions[name].事件地点,
          触发时间: `${eventDefinitions[name].触发条件?.年}/${eventDefinitions[name].触发条件?.月}/${eventDefinitions[name].触发条件?.日}`,
        })),
      );
    } else {
      logWarning('⚠️ 未找到任何事件条目！请检查：');
      logWarning("  1. 世界书条目名称是否以 '事件条目-' 开头");
      logWarning('  2. 条目内容是否为有效的JSON格式');
    }
  } catch (error) {
    logError('加载世界书事件时出错:', error);
    toastr.error('加载世界书事件时出错');
  }

  debugGroupEnd();
  return eventDefinitions;
}
