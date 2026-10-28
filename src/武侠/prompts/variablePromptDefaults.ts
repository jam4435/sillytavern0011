/** 额外变量模型可编辑提示词默认值。实际文本放在同目录 txt，方便直接维护。 */
import variableGuidanceText from './变量指导.txt?raw';
import variableStructureText from './变量模板.txt?raw';

function normalizePromptSource(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export const DEFAULT_VARIABLE_STRUCTURE_TEMPLATE = normalizePromptSource(variableStructureText);
export const DEFAULT_VARIABLE_GUIDANCE_TEMPLATE = normalizePromptSource(variableGuidanceText);
