import followupLocationIndex from '../data/后续事件地点.generated.json';
import { normalizeLocationPath, parseLocationPath } from '../../shared/locationPath.js';

export const FOLLOWUP_MOVEMENT_GUIDANCE =
  '当参与事件全阶段完成且玩家有继续推进想法时，往后续事件地点移动；尊重玩家其他选择，按实际行程推进，不得直接传送或提前演出后续事件。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 只读提示：参与事件存在时，提前从静态事件关系中获取下一事件的地点。
 * 不改变事件触发资格，也不新增/结算事件。静态索引由 generate:events 维护。
 */
export function deriveActiveEventFollowupLocations(statData: Record<string, unknown>): Record<string, string> {
  const participationEvents = isRecord(statData.参与事件) ? statData.参与事件 : {};
  const eventSystem = isRecord(statData.事件系统) ? statData.事件系统 : {};
  const completed = isRecord(eventSystem.已完成事件) ? eventSystem.已完成事件 : {};
  const expired = isRecord(eventSystem.已失效事件) ? eventSystem.已失效事件 : {};
  const index = followupLocationIndex as Record<string, Record<string, string>>;
  const targets: Record<string, string> = {};

  for (const [sourceEvent, snapshot] of Object.entries(participationEvents)) {
    if (sourceEvent.startsWith('$') || !isRecord(snapshot)) continue;
    for (const [eventName, rawLocation] of Object.entries(index[sourceEvent] || {})) {
      if (Object.hasOwn(completed, eventName) || Object.hasOwn(expired, eventName)) continue;
      const location = normalizeLocationPath(rawLocation);
      if (!parseLocationPath(location)) continue;
      targets[eventName] = location;
    }
  }

  return targets;
}
