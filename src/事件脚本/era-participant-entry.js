import { EVENT_KIND } from './era-utils.js';
import { validateAndNormalizeEventDefinition } from './era-event-schema.js';
import {
  getLocationRegionPath,
  getLocationScopePath,
  normalizeLocationPath,
  parseLocationPath,
} from '../shared/locationPath.js';

export {
  getLocationScopePath,
  getLocationScene,
  isSameLocationScene,
  isSameLocationScope,
  normalizeLocationPath,
  parseLocationPath,
} from '../shared/locationPath.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getLocationPathSegments(location) {
  return parseLocationPath(location)?.segments || [];
}

export function getHierarchicalLocationPaths(location) {
  const segments = getLocationPathSegments(location);
  return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'));
}

export function getRumorScopeFromEventLocation(eventLocation) {
  return getLocationRegionPath(eventLocation);
}

export function isLocationWithinRumorScope(playerLocation, rumorScope) {
  if (!rumorScope) {
    return false;
  }

  return getHierarchicalLocationPaths(playerLocation).includes(rumorScope);
}

export function normalizeParticipantEventDefinition(eventName, eventData, { kind = EVENT_KIND.ORDINARY } = {}) {
  const shared = validateAndNormalizeEventDefinition(eventName, eventData);
  if (!isPlainObject(shared.data)) return shared;
  eventData = shared.data;

  if (kind !== EVENT_KIND.ORDINARY && kind !== EVENT_KIND.ENCOUNTER) {
    return shared;
  }

  const errors = [...shared.errors];
  const rawEventLocation = eventData.事件地点;
  const eventLocation = normalizeLocationPath(rawEventLocation);
  const eventLocationSegments = getLocationPathSegments(eventLocation);
  const eventHook = typeof eventData.事件引子 === 'string' ? eventData.事件引子.trim() : '';
  const eventSummary = typeof eventData.事件概要 === 'string' ? eventData.事件概要.trim() : '';
  const rawParticipants = eventData.参与人物;

  if (typeof rawEventLocation !== 'string' || !rawEventLocation.trim()) {
    errors.push(`事件 ${eventName} 缺少非空的事件地点`);
  } else if (!eventLocation || (eventLocationSegments.length !== 3 && eventLocationSegments.length !== 4)) {
    errors.push(`事件 ${eventName} 的事件地点必须是三级或四级完整路径`);
  }

  if (!eventHook) {
    errors.push(`事件 ${eventName} 缺少非空的事件引子`);
  }

  if (!eventSummary) {
    errors.push(`事件 ${eventName} 缺少非空的事件概要`);
  }

  if (!Array.isArray(rawParticipants)) {
    errors.push(`事件 ${eventName} 的参与人物必须是字符串数组`);
  } else if (rawParticipants.some(value => typeof value !== 'string')) {
    errors.push(`事件 ${eventName} 的参与人物只能包含字符串`);
  }

  const participants = Array.isArray(rawParticipants)
    ? [...new Set(rawParticipants.map(value => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))]
    : [];

  if (Array.isArray(rawParticipants) && participants.length === 0) {
    errors.push(`事件 ${eventName} 的参与人物不能为空`);
  }

  if (errors.length > 0) {
    return { valid: false, data: eventData, errors };
  }

  return {
    valid: true,
    data: {
      ...eventData,
      事件地点: eventLocation,
      事件引子: eventHook,
      事件概要: eventSummary,
      参与人物: participants,
    },
    errors: [],
  };
}

/** NPC 只在事件启动时入场，同批冲突在内存中仲裁。 */
export function buildParticipantEntryPlan({ eventName, eventData, characters, claimedCharacters = {} }) {
  const locationUpdates = {}, missingCharacters = [], conflicts = [], alreadyEntered = [];
  const participants = Array.isArray(eventData?.参与人物) ? eventData.参与人物 : [];
  for (const name of participants) {
    const character = characters?.[name];
    if (!isPlainObject(character)) { missingCharacters.push(name); continue; }
    if (Object.prototype.hasOwnProperty.call(claimedCharacters, name)) {
      conflicts.push({ 人物: name, 当前事件: claimedCharacters[name], 请求事件: eventName });
      continue;
    }
    claimedCharacters[name] = eventName;
    if (character.所在位置 === eventData.事件地点) alreadyEntered.push(name);
    else locationUpdates[name] = { 所在位置: eventData.事件地点 };
  }
  return { locationUpdates, missingCharacters, conflicts, alreadyEntered };
}

