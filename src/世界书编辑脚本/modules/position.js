export const POSITION_TYPE_TO_NATIVE = {
  before_character_definition: 0,
  after_character_definition: 1,
  before_example_messages: 5,
  after_example_messages: 6,
  before_author_note: 2,
  after_author_note: 3,
  at_depth: 4,
};

const DEPTH_ROLE_TO_UI_VALUE = {
  system: 'at_depth_as_system',
  user: 'at_depth_as_user',
  assistant: 'at_depth_as_assistant',
};

const UI_VALUE_TO_DEPTH_ROLE = {
  at_depth_as_system: 'system',
  at_depth_as_user: 'user',
  at_depth_as_assistant: 'assistant',
};

const NATIVE_ROLE_TO_DEPTH_ROLE = {
  0: 'system',
  1: 'user',
  2: 'assistant',
};

export const POSITION_OPTIONS = [
  { value: 'before_character_definition', label: '角色定义前' },
  { value: 'after_character_definition', label: '角色定义后' },
  { value: 'before_example_messages', label: '示例消息前（↑EM）' },
  { value: 'after_example_messages', label: '示例消息后（↓EM）' },
  { value: 'before_author_note', label: '作者注释前' },
  { value: 'after_author_note', label: '作者注释后' },
  { value: 'at_depth_as_system', label: '@D [系统]在深度' },
  { value: 'at_depth_as_user', label: '@D [用户]在深度' },
  { value: 'at_depth_as_assistant', label: '@D [AI]在深度' },
];

const VALID_POSITION_VALUES = new Set(POSITION_OPTIONS.map(option => option.value));
const POSITION_LABELS = new Map(POSITION_OPTIONS.map(option => [option.value, option.label]));

export function normalizePositionRole(role) {
  if (role === null || role === undefined || role === '') {
    return 'system';
  }
  const normalized = NATIVE_ROLE_TO_DEPTH_ROLE[role] || String(role);
  return ['system', 'user', 'assistant'].includes(normalized) ? normalized : 'system';
}

export function normalizePositionSelection(positionOrValue, fallbackRole = 'system') {
  const rawValue =
    positionOrValue && typeof positionOrValue === 'object'
      ? positionOrValue.type
      : positionOrValue || 'after_character_definition';
  const role =
    positionOrValue && typeof positionOrValue === 'object' ? positionOrValue.role : fallbackRole;

  if (rawValue === 'at_depth') {
    const normalizedRole = normalizePositionRole(role);
    return {
      type: 'at_depth',
      role: normalizedRole,
      value: DEPTH_ROLE_TO_UI_VALUE[normalizedRole],
    };
  }

  if (UI_VALUE_TO_DEPTH_ROLE[rawValue]) {
    const normalizedRole = UI_VALUE_TO_DEPTH_ROLE[rawValue];
    return {
      type: 'at_depth',
      role: normalizedRole,
      value: DEPTH_ROLE_TO_UI_VALUE[normalizedRole],
    };
  }

  const value = VALID_POSITION_VALUES.has(rawValue) ? rawValue : 'after_character_definition';
  return { type: value, role: null, value };
}

export function getPositionSelectionValue(positionOrValue, fallbackRole = 'system') {
  return normalizePositionSelection(positionOrValue, fallbackRole).value;
}

export function getPositionLabel(positionOrValue, fallbackRole = 'system') {
  const value = getPositionSelectionValue(positionOrValue, fallbackRole);
  return POSITION_LABELS.get(value) || '未知位置';
}

export function isDepthPositionValue(positionOrValue, fallbackRole = 'system') {
  return normalizePositionSelection(positionOrValue, fallbackRole).type === 'at_depth';
}

export function applyPositionSelectionToEntry(entry, positionOrValue) {
  if (!entry.position) {
    entry.position = {};
  }

  const normalized = normalizePositionSelection(positionOrValue, entry.position.role);
  entry.position.type = normalized.type;
  if (normalized.type === 'at_depth') {
    entry.position.role = normalized.role;
  } else {
    delete entry.position.role;
  }
  return normalized;
}

export function getNativePositionType(positionOrValue) {
  const normalized = normalizePositionSelection(positionOrValue);
  return POSITION_TYPE_TO_NATIVE[normalized.type] ?? POSITION_TYPE_TO_NATIVE.after_character_definition;
}

export function getNativePositionRole(positionOrValue) {
  const normalized = normalizePositionSelection(positionOrValue);
  if (normalized.type !== 'at_depth') {
    return null;
  }
  return { system: 0, user: 1, assistant: 2 }[normalized.role];
}
