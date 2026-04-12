import { data } from './data';
import type { GenderConfig, ProfessionCategoryInfo, SelectionState, StatusInfo } from './types';

const appData = data as { gender: Record<string, GenderConfig> };

export function getGenderConfig(selections: SelectionState): GenderConfig {
  const gender = selections.gender;
  if (!gender) throw Error('未选择性别');

  const genderConfig = appData.gender[gender];
  if (!genderConfig) throw Error(`未找到性别配置: ${gender}`);
  return genderConfig;
}

export function getStatusInfo(selections: SelectionState): StatusInfo {
  const status = selections.status;
  if (!status) throw Error('未选择社会身份');

  const statusInfo = getGenderConfig(selections).status[status];
  if (!statusInfo) throw Error(`未找到社会身份配置: ${status}`);
  return statusInfo;
}

export function getProfessionCategoryInfo(selections: SelectionState): ProfessionCategoryInfo {
  const professionCategory = selections.professionCategory;
  if (!professionCategory) throw Error('未选择职业大类');

  const categoryInfo = getStatusInfo(selections).professionCategories?.[professionCategory];
  if (!categoryInfo) throw Error(`未找到职业大类配置: ${professionCategory}`);
  return categoryInfo;
}

export function getFeatureSet(selections: SelectionState) {
  return getGenderConfig(selections).features;
}

export function getModificationOptions(selections: SelectionState) {
  return getGenderConfig(selections).modifications;
}
