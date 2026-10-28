/** 额外变量模型可编辑提示词默认值。实际文本放在同目录 txt，方便直接维护。 */
import variableGuidanceText from './变量指导.txt?raw';
import variableStructureText from './变量模板.txt?raw';

function normalizePromptSource(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

/**
 * Stable content signature used to recognize unchanged defaults from older releases.
 * Normalize line endings only: meaningful edits must not be mistaken for an untouched default.
 */
export function getPromptTemplateSignature(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const DEFAULT_VARIABLE_STRUCTURE_TEMPLATE = normalizePromptSource(variableStructureText);
export const DEFAULT_VARIABLE_GUIDANCE_TEMPLATE = normalizePromptSource(variableGuidanceText);

/**
 * Known historical built-in defaults. Keep these signatures when the .txt files change so
 * untouched settings from older releases automatically adopt the current template.
 */
export const KNOWN_VARIABLE_STRUCTURE_DEFAULT_SIGNATURES = [
  '7004:e20c0ca9',
  '2086:d965dd8e',
  '2090:718235bb',
  getPromptTemplateSignature(DEFAULT_VARIABLE_STRUCTURE_TEMPLATE),
] as const;

export const KNOWN_VARIABLE_GUIDANCE_DEFAULT_SIGNATURES = [
  '3159:ca9e984d',
  '3821:025b4c6a',
  '2912:689fe34c',
  getPromptTemplateSignature(DEFAULT_VARIABLE_GUIDANCE_TEMPLATE),
] as const;
