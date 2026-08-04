import { EVENT_RUNTIME_KEY_VERSION, logSuccess, logWarning } from './era-utils.js';
import { writeDirectAssign, writeDirectDelete } from './era-write-helper.js';

const EVENT_SYSTEM_BUCKETS = ['未发生事件', '进行中事件', '已完成事件', '已失效事件', '人物事件占用'];
const EVENT_STATE_ROOTS = ['参与事件', '世界事件', '事件分支结果', '附近传闻', '后续事件线索', '后续事件线索计数'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function needsEventRuntimeStateReset(statData) {
  return statData?.前端变量?.事件运行时键版本 !== EVENT_RUNTIME_KEY_VERSION;
}

export function buildEventRuntimeStateResetPlan(statData) {
  const currentEventSystem = isPlainObject(statData?.事件系统) ? statData.事件系统 : {};
  const currentFrontendVariables = isPlainObject(statData?.前端变量) ? statData.前端变量 : {};
  const characterData = isPlainObject(statData?.角色数据) ? statData.角色数据 : {};

  const eventSystem = Object.fromEntries(EVENT_SYSTEM_BUCKETS.map(bucket => [bucket, {}]));
  if (currentEventSystem.$meta !== undefined) {
    eventSystem.$meta = currentEventSystem.$meta;
  }

  const assignPayload = {
    事件系统: eventSystem,
    ...Object.fromEntries(EVENT_STATE_ROOTS.map(root => [root, {}])),
    前端变量: {
      ...currentFrontendVariables,
      事件结局状态: {},
      事件结算进度: {},
      事件运行时键版本: EVENT_RUNTIME_KEY_VERSION,
    },
  };

  const experienceDeletes = Object.fromEntries(
    Object.entries(characterData)
      .filter(([, value]) => isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, '人物经历'))
      .map(([characterName]) => [characterName, { 人物经历: {} }]),
  );

  return {
    assignPayload,
    experienceDeletePayload: Object.keys(experienceDeletes).length > 0 ? { 角色数据: experienceDeletes } : null,
  };
}

/**
 * 开发期一次性版本切换：不迁移旧短键，直接清空所有事件派生状态后由 loader 重新初始化。
 */
export async function resetLegacyEventRuntimeState(statData) {
  if (!needsEventRuntimeStateReset(statData)) return true;

  const plan = buildEventRuntimeStateResetPlan(statData);
  if (plan.experienceDeletePayload) {
    await writeDirectDelete(plan.experienceDeletePayload, 'reset-legacy-event-experiences');
  }
  await writeDirectAssign(plan.assignPayload, `reset-event-runtime-key-v${EVENT_RUNTIME_KEY_VERSION}`);

  const verified = await getVariables({ type: 'chat' });
  const verifiedStat = verified?.stat_data || {};
  const resetSucceeded =
    verifiedStat?.前端变量?.事件运行时键版本 === EVENT_RUNTIME_KEY_VERSION &&
    EVENT_STATE_ROOTS.every(root => isPlainObject(verifiedStat[root]) && Object.keys(verifiedStat[root]).length === 0) &&
    EVENT_SYSTEM_BUCKETS.every(
      bucket =>
        isPlainObject(verifiedStat?.事件系统?.[bucket]) &&
        Object.keys(verifiedStat.事件系统[bucket]).length === 0,
    );

  if (resetSucceeded) {
    logSuccess(`事件运行时键已升级到 v${EVENT_RUNTIME_KEY_VERSION}，旧事件状态已清空`);
  } else {
    logWarning(`事件运行时键 v${EVENT_RUNTIME_KEY_VERSION} 重置未完整落库，停止本轮初始化`);
  }
  return resetSucceeded;
}
