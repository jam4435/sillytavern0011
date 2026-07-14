// ================================================================================
// ERA 事件系统 - 事件加载模块
// ================================================================================
// 包含: 从世界书加载事件定义

import {
  attachEventMetadata,
  deriveEventRuntimeDescriptor,
  log,
  logError,
  logSuccess,
  logWarning,
  debugGroup,
  debugGroupEnd,
  debugTable,
} from './era-utils.js';
import { normalizeParticipantEventDefinition } from './era-participant-entry.js';

const parsedEventEntryCache = new Map();
let cachedEventDefinitionsSignature = '';
let cachedEventDefinitions = null;

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;

  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function buildEventEntryFingerprint(entry) {
  return [entry?.uid ?? '', entry?.name ?? '', hashString(entry?.content ?? '')].join('|');
}

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
    const matchedEventEntries = [];
    const signatureParts = [...worldbookNamesToScan];

    for (const entries of worldbooksContents) {
      if (!entries) continue;

      totalEntries += entries.length;

      for (const entry of entries) {
        log(`[DEBUG] 正在检查条目名称: "${entry.name}"`);

        const descriptor = deriveEventRuntimeDescriptor(entry.name);
        const eventName = descriptor?.runtimeKey || null;

        log(`[DEBUG] 是否为事件条目? ${!!eventName}`);
        if (descriptor) {
          log(`[DEBUG] 派生运行时键: ${descriptor.runtimeKey} (${descriptor.kind})`);
        }

        // 检查条目名称 (name 字段)
        if (eventName && entry.content) {
          const entryFingerprint = buildEventEntryFingerprint(entry);
          signatureParts.push(entryFingerprint);
          matchedEventEntries.push({
            entry,
            eventName,
            descriptor,
            entryFingerprint,
          });
        }
      }
    }

    const currentSignature = signatureParts.join('||');
    if (cachedEventDefinitionsSignature === currentSignature && cachedEventDefinitions) {
      logSuccess(`复用事件定义缓存: ${Object.keys(cachedEventDefinitions).length} 个事件`);
      debugGroupEnd();
      return cachedEventDefinitions;
    }

    for (const { entry, eventName, descriptor, entryFingerprint } of matchedEventEntries) {
      if (eventDefinitions[eventName]) {
        logError(`事件运行时键冲突，已跳过后加载条目: ${eventName} (${entry.name})`);
        toastr.error(`事件运行时键冲突: ${eventName}`);
        continue;
      }

      const cachedEntryDefinition = parsedEventEntryCache.get(entryFingerprint);
      if (cachedEntryDefinition) {
        eventDefinitions[eventName] = attachEventMetadata(cachedEntryDefinition, descriptor);
        logSuccess(`复用缓存事件: ${eventName}`);
        continue;
      }

      try {
        const eventData = JSON.parse(entry.content);
        const normalized = normalizeParticipantEventDefinition(eventName, eventData, {
          kind: descriptor.kind,
        });
        if (!normalized.valid) {
          normalized.errors.forEach(error => logError(error));
          toastr.error(`事件定义无效，已跳过: ${entry.name}`);
          continue;
        }

        parsedEventEntryCache.set(entryFingerprint, normalized.data);
        eventDefinitions[eventName] = attachEventMetadata(normalized.data, descriptor);
        logSuccess(`加载事件: ${eventName}`);
      } catch (e) {
        logError(`解析事件条目JSON失败 (条目: ${entry.name}):`, e);
        toastr.error(`解析事件JSON失败: ${entry.name}`);
      }
    }

    cachedEventDefinitionsSignature = currentSignature;
    cachedEventDefinitions = eventDefinitions;

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
