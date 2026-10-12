/**
 * 仅在正式人物登场时修复 ERA $template 提前生成的空壳。
 * 不改变通用 VariableInsert 语义，不碰已经变更的真实状态、位置与经历。
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const CORE_ATTRIBUTES = ['臂力', '根骨', '机敏', '悟性', '洞察'];
const EMPTY_TEXT_FIELDS = ['性别', '外貌', '性格', '境界', '状态'];

/** 以“核心标识字段为空 + 全套默认零属性”识别模板空壳，避免误修正常人物。 */
export function isTemplateNpcShell(character) {
  if (!isPlainObject(character) || !isPlainObject(character.初始属性)) return false;
  const attrs = character.初始属性;
  return character.性别 === '' &&
    character.境界 === '' &&
    character.出生年份 === 0 &&
    CORE_ATTRIBUTES.every(key => attrs[key] === 0);
}

/**
 * 已有空壳的叶子需要 ERA update；其他新键仍由原本的 insert 补入。
 * 只更新与模板完全相同的空值，绝不修改场景位置、人物经历与既有非默认字段。
 */
export function buildDebutShellRecoveryPatch(existingCharacters, debutInserts) {
  const result = {};
  for (const [name, debut] of Object.entries(debutInserts || {})) {
    const existing = existingCharacters?.[name];
    if (!isTemplateNpcShell(existing) || !isPlainObject(debut)) continue;

    const patch = {};
    for (const key of EMPTY_TEXT_FIELDS) {
      if (existing[key] === '' && typeof debut[key] === 'string' && debut[key] !== '') {
        patch[key] = debut[key];
      }
    }
    if (existing.出生年份 === 0 && Number.isFinite(debut.出生年份) && debut.出生年份 > 0) {
      patch.出生年份 = debut.出生年份;
    }

    const initialAttributes = {};
    for (const key of CORE_ATTRIBUTES) {
      if (existing.初始属性[key] === 0 && Number.isFinite(debut.初始属性?.[key]) &&
          debut.初始属性[key] !== 0) {
        initialAttributes[key] = debut.初始属性[key];
      }
    }
    if (Object.keys(initialAttributes).length > 0) patch.初始属性 = initialAttributes;
    if (Object.keys(patch).length > 0) result[name] = patch;
  }
  return result;
}

/** 回读检查：只校验本次应当修复的叶子是否真正落地，不要求改变真实位置或经历。 */
export function isDebutShellRecoveryApplied(characters, patches) {
  for (const [name, patch] of Object.entries(patches || {})) {
    const character = characters?.[name];
    if (!isPlainObject(character)) return false;
    for (const [key, value] of Object.entries(patch)) {
      if (key === '初始属性') {
        if (!isPlainObject(character.初始属性)) return false;
        if (Object.entries(value).some(([attribute, expected]) => character.初始属性[attribute] !== expected)) {
          return false;
        }
      } else if (character[key] !== value) {
        return false;
      }
    }
  }
  return true;
}
