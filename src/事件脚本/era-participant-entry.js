export const PARTICIPANT_ENTRY_SOURCE = {
  TIME: '时间触发',
  PLAYER: '玩家参与',
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeParticipantEventDefinition(eventName, eventData, { isDebut = false } = {}) {
  if (!isPlainObject(eventData)) {
    return {
      valid: false,
      data: eventData,
      errors: [`事件 ${eventName} 的定义不是对象`],
    };
  }

  if (isDebut) {
    return { valid: true, data: eventData, errors: [] };
  }

  const errors = [];
  const eventLocation = typeof eventData.事件地点 === 'string' ? eventData.事件地点.trim() : '';
  const rawParticipants = eventData.参与人物;

  if (!eventLocation) {
    errors.push(`事件 ${eventName} 缺少非空的事件地点`);
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
      参与人物: participants,
    },
    errors: [],
  };
}

export function buildParticipantEntryPlan({ eventName, eventData, source, currentTime, characters, occupancy }) {
  const eventLocation = eventData?.事件地点;
  const participants = Array.isArray(eventData?.参与人物) ? eventData.参与人物 : [];
  const characterData = isPlainObject(characters) ? characters : {};
  const currentOccupancy = isPlainObject(occupancy) ? occupancy : {};
  const isPlayerEntry = source === PARTICIPANT_ENTRY_SOURCE.PLAYER;

  const locationUpdates = {};
  const occupancyDeletes = {};
  const occupancyInserts = {};
  const missingCharacters = [];
  const conflicts = [];
  const alreadyEntered = [];

  for (const characterName of participants) {
    if (!isPlainObject(characterData[characterName])) {
      missingCharacters.push(characterName);
      continue;
    }

    const existingOccupancy = currentOccupancy[characterName];
    if (existingOccupancy?.事件名 === eventName) {
      alreadyEntered.push(characterName);
      continue;
    }

    if (existingOccupancy && !isPlayerEntry) {
      conflicts.push({
        人物: characterName,
        当前事件: existingOccupancy.事件名,
        请求事件: eventName,
      });
      continue;
    }

    if (existingOccupancy) {
      occupancyDeletes[characterName] = {};
    }

    if (characterData[characterName].所在位置 !== eventLocation) {
      locationUpdates[characterName] = { 所在位置: eventLocation };
    }

    occupancyInserts[characterName] = {
      事件名: eventName,
      地点: eventLocation,
      来源: source,
      入场时间: { ...currentTime },
    };
  }

  return {
    locationUpdates,
    occupancyDeletes,
    occupancyInserts,
    missingCharacters,
    conflicts,
    alreadyEntered,
  };
}

export function buildOccupancyCleanupPatch(occupancy, eventName) {
  if (!isPlainObject(occupancy)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(occupancy)
      .filter(([, value]) => value?.事件名 === eventName)
      .map(([characterName]) => [characterName, {}]),
  );
}
