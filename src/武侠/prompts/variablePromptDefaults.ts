/** 额外变量模型内置提示词默认值。实际文本放在同目录 txt，方便直接编辑。 */
import variableGuidanceText from './变量指导.txt?raw';
import variableInputTemplateText from './变量输入模板.txt?raw';
import variableStructureText from './变量模板.txt?raw';
import variableMainPromptText from './变量主提示词.txt?raw';

function normalizePromptSource(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function getVariablePromptTemplateSignature(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const DEFAULT_VARIABLE_INPUT_TEMPLATE = normalizePromptSource(variableInputTemplateText);
export const DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE = normalizePromptSource(variableMainPromptText);
export const DEFAULT_VARIABLE_STRUCTURE_TEMPLATE = normalizePromptSource(variableStructureText);
export const DEFAULT_VARIABLE_GUIDANCE_TEMPLATE = normalizePromptSource(variableGuidanceText);

/**
 * 历史项目默认值只保留轻量签名：
 * - 命中签名 => 说明用户仍使用某一代未修改的项目默认值，可自动迁移到最新 txt；
 * - 未命中 => 视为用户自定义，绝不覆盖。
 *
 * 当前这一版默认值的签名也保留在列表里，便于以后只修改 txt 时识别旧默认。
 */
export const KNOWN_VARIABLE_INPUT_TEMPLATE_DEFAULT_SIGNATURES = ["543:33841a73","591:22098b41","524:ac9d7c79"] as const;
export const KNOWN_VARIABLE_MAIN_PROMPT_DEFAULT_SIGNATURES = ["779:5e1085bf","174:9eeabf1c"] as const;
export const KNOWN_VARIABLE_STRUCTURE_DEFAULT_SIGNATURES = ["7004:e20c0ca9","2086:d965dd8e"] as const;
export const KNOWN_VARIABLE_GUIDANCE_DEFAULT_SIGNATURES = ["3159:ca9e984d","3821:025b4c6a"] as const;
