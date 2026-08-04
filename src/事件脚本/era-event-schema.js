// Shared event-definition normalization and condition evaluation.

const VARIABLE_OPERATORS = ['等于', '不等于', '大于', '大于等于', '小于', '小于等于', '存在', '不存在'];

export function isEventPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function isTimeObject(value) {
  return (
    isEventPlainObject(value) &&
    ['年', '月', '日'].every(key => Number.isFinite(Number(value[key]))) &&
    (value.时 === undefined || Number.isFinite(Number(value.时)))
  );
}

export function isLegacyTimeTrigger(condition) {
  return (
    isEventPlainObject(condition) &&
    (condition.类型 === undefined || condition.类型 === '时间') &&
    isTimeObject(condition)
  );
}

export function normalizeFollowupEvents(rawFollowups) {
  if (!isEventPlainObject(rawFollowups)) return {};

  if (typeof rawFollowups.事件名 === 'string') {
    const target = rawFollowups.事件名.trim();
    return target ? { [target]: typeof rawFollowups.描述 === 'string' ? rawFollowups.描述 : '' } : {};
  }

  return Object.fromEntries(
    Object.entries(rawFollowups)
      .filter(([target, clue]) => target.trim() && typeof clue === 'string')
      .map(([target, clue]) => [target.trim(), clue]),
  );
}

export function normalizeBranchMarkers(rawMarkers) {
  if (!isEventPlainObject(rawMarkers)) return {};
  return Object.fromEntries(Object.entries(rawMarkers).filter(([, value]) => value === 0 || value === 1));
}

export function getConditionTimeAnchors(condition, anchors = []) {
  if (isLegacyTimeTrigger(condition)) {
    anchors.push(condition);
    return anchors;
  }
  if (!isEventPlainObject(condition)) return anchors;
  if (isTimeObject(condition.时间)) anchors.push(condition.时间);
  for (const key of ['全部', '任一']) {
    if (Array.isArray(condition[key])) {
      condition[key].forEach(child => getConditionTimeAnchors(child, anchors));
    }
  }
  return anchors;
}

export function getSingleConditionTimeAnchor(condition) {
  const anchors = getConditionTimeAnchors(condition);
  return anchors.length === 1 ? anchors[0] : null;
}

export function isPureTimeTrigger(condition) {
  return isLegacyTimeTrigger(condition) || (isEventPlainObject(condition) && isTimeObject(condition.时间));
}

function readRelativePath(root, rawPath) {
  const path = String(rawPath || '')
    .trim()
    .replace(/^stat_data\.?/, '');
  if (!path) return { exists: true, value: root };

  let value = root;
  for (const segment of path.split('.').filter(Boolean)) {
    if (!isEventPlainObject(value) && !Array.isArray(value)) return { exists: false, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return { exists: false, value: undefined };
    value = value[segment];
  }
  return { exists: true, value };
}

function evaluateVariableCondition(condition, statData, readVariable) {
  const actual = typeof readVariable === 'function'
    ? readVariable(condition.变量, () => readRelativePath(statData || {}, condition.变量))
    : readRelativePath(statData || {}, condition.变量);
  const operator = VARIABLE_OPERATORS.find(key => Object.prototype.hasOwnProperty.call(condition, key));
  if (!operator) return false;
  const expected = condition[operator];

  switch (operator) {
    case '等于':
      return actual.exists && actual.value === expected;
    case '不等于':
      return !actual.exists || actual.value !== expected;
    case '大于':
      return actual.exists && actual.value > expected;
    case '大于等于':
      return actual.exists && actual.value >= expected;
    case '小于':
      return actual.exists && actual.value < expected;
    case '小于等于':
      return actual.exists && actual.value <= expected;
    case '存在':
      return expected === false ? !actual.exists : actual.exists;
    case '不存在':
      return expected === false ? actual.exists : !actual.exists;
    default:
      return false;
  }
}

export function evaluateEventCondition(condition, context = {}) {
  if (isLegacyTimeTrigger(condition)) {
    return context.ignoreTimeConditions === true || context.compareTime?.(context.currentTime, condition, '>=') === true;
  }
  if (!isEventPlainObject(condition)) return false;

  if (Object.prototype.hasOwnProperty.call(condition, '时间')) {
    return (
      isTimeObject(condition.时间) &&
      (context.ignoreTimeConditions === true ||
        context.compareTime?.(context.currentTime, condition.时间, '>=') === true)
    );
  }
  if (Object.prototype.hasOwnProperty.call(condition, '事件完成')) {
    const eventName = String(condition.事件完成 || '').trim();
    return !!eventName && Object.prototype.hasOwnProperty.call(context.completedEvents || {}, eventName);
  }
  if (Object.prototype.hasOwnProperty.call(condition, '变量')) {
    return evaluateVariableCondition(condition, context.statData, context.readVariable);
  }
  if (Object.prototype.hasOwnProperty.call(condition, '全部')) {
    return Array.isArray(condition.全部) && condition.全部.length > 0 && condition.全部.every(child => evaluateEventCondition(child, context));
  }
  if (Object.prototype.hasOwnProperty.call(condition, '任一')) {
    return Array.isArray(condition.任一) && condition.任一.length > 0 && condition.任一.some(child => evaluateEventCondition(child, context));
  }
  return false;
}

export function validateEventCondition(condition, path = '触发条件') {
  if (isLegacyTimeTrigger(condition)) return [];
  if (!isEventPlainObject(condition)) return [`${path} 必须是条件对象`];

  const conditionKeys = ['时间', '事件完成', '变量', '全部', '任一'].filter(key =>
    Object.prototype.hasOwnProperty.call(condition, key),
  );
  if (conditionKeys.length !== 1) return [`${path} 必须且只能包含一种条件`];

  const key = conditionKeys[0];
  if (key === '时间') return isTimeObject(condition.时间) ? [] : [`${path}.时间 不是有效时间`];
  if (key === '事件完成') {
    return typeof condition.事件完成 === 'string' && condition.事件完成.trim()
      ? []
      : [`${path}.事件完成 必须是非空事件名`];
  }
  if (key === '变量') {
    const errors = [];
    if (typeof condition.变量 !== 'string' || !condition.变量.trim()) errors.push(`${path}.变量 必须是非空路径`);
    const operators = VARIABLE_OPERATORS.filter(operator => Object.prototype.hasOwnProperty.call(condition, operator));
    if (operators.length !== 1) errors.push(`${path} 的变量条件必须且只能包含一个运算符`);
    return errors;
  }

  const children = condition[key];
  if (!Array.isArray(children) || children.length === 0) return [`${path}.${key} 必须是非空条件数组`];
  return children.flatMap((child, index) => validateEventCondition(child, `${path}.${key}[${index}]`));
}

export function validateAndNormalizeEventDefinition(eventName, eventData) {
  if (!isEventPlainObject(eventData)) {
    return { valid: false, data: eventData, errors: [`事件 ${eventName} 的定义不是对象`] };
  }

  const errors = eventData.触发条件 === undefined
    ? []
    : validateEventCondition(eventData.触发条件, `事件 ${eventName}.触发条件`);
  if (eventData.事件结束时间 !== undefined && !isTimeObject(eventData.事件结束时间)) {
    errors.push(`事件 ${eventName}.事件结束时间 不是有效时间`);
  }
  if (eventData.事件持续时间 !== undefined) {
    if (!isEventPlainObject(eventData.事件持续时间)) {
      errors.push(`事件 ${eventName}.事件持续时间 必须是对象`);
    } else if (
      !['日', '时'].some(key => Number(eventData.事件持续时间[key] || 0) > 0) ||
      ['日', '时'].some(key => eventData.事件持续时间[key] !== undefined && !Number.isFinite(Number(eventData.事件持续时间[key])))
    ) {
      errors.push(`事件 ${eventName}.事件持续时间 必须包含正数日或时`);
    }
  }
  if (eventData.事件结束时间 !== undefined && eventData.事件持续时间 !== undefined) {
    errors.push(`事件 ${eventName} 不能同时定义事件结束时间和事件持续时间`);
  }

  const rawFollowups = eventData.后续事件;
  const followups = normalizeFollowupEvents(rawFollowups);
  if (rawFollowups !== undefined) {
    if (!isEventPlainObject(rawFollowups) || Object.keys(followups).length === 0) {
      errors.push(`事件 ${eventName}.后续事件 必须是旧单后续对象或目标事件到线索的字符串映射`);
    } else if (
      typeof rawFollowups.事件名 !== 'string' &&
      Object.values(rawFollowups).some(value => typeof value !== 'string')
    ) {
      errors.push(`事件 ${eventName}.后续事件 的线索必须是字符串`);
    }
  }

  const rawMarkers = eventData.分支标记;
  const branchMarkers = normalizeBranchMarkers(rawMarkers);
  if (
    rawMarkers !== undefined &&
    (!isEventPlainObject(rawMarkers) || Object.keys(branchMarkers).length !== Object.keys(rawMarkers).length)
  ) {
    errors.push(`事件 ${eventName}.分支标记 的值只能是 0 或 1`);
  }

  return {
    valid: errors.length === 0,
    data: {
      ...eventData,
      ...(rawFollowups !== undefined ? { 后续事件: followups } : {}),
      ...(rawMarkers !== undefined ? { 分支标记: cloneJson(branchMarkers) } : {}),
    },
    errors,
  };
}
