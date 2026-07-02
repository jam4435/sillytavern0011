import type { HardIdentityRouteKey } from './hard-routes';

export interface ProfessionCategoryInfo {
  professions?: string[];
  description?: string;
  [key: string]: unknown;
}

export interface StatusInfo {
  professions?: string[];
  professionCategories?: Record<string, ProfessionCategoryInfo>;
  description?: string;
  [key: string]: unknown;
}

export interface ModificationOption {
  name: string;
  description?: string;
  requires?: string[];
  forbids?: string[];
}

export interface GenderConfig {
  status: Record<string, StatusInfo>;
  features: Record<string, string[]>;
  modifications: ModificationOption[];
}

export type FeatureSelections = Record<string, string>;

export interface GenerationSettings {
  enableVariables: boolean;
  useTextStatusBar: boolean;
  generateOptions: boolean;
}

export interface SelectionState {
  gender?: string;
  status?: string;
  professionCategory?: string;
  profession?: string;
  feature?: FeatureSelections;
  modification?: string[];
  customFeature?: string;
  customModification?: string;
  customScene?: string;
  hardIdentityRoute?: HardIdentityRouteKey;
  settings?: GenerationSettings;
  [key: string]: unknown;
}

export interface CardOptionMeta {
  description?: string;
}

export type CardOptions = string[] | Record<string, CardOptionMeta>;

export type SelectionKey =
  | 'gender'
  | 'status'
  | 'professionCategory'
  | 'profession'
  | 'feature'
  | 'modification'
  | 'customFeature'
  | 'customModification'
  | 'customScene';

export type StringSelectionKey = 'gender' | 'status' | 'professionCategory' | 'profession';

export const selectionOrder: SelectionKey[] = [
  'gender',
  'status',
  'professionCategory',
  'profession',
  'feature',
  'modification',
  'customFeature',
  'customModification',
  'customScene',
];

export interface FinalMessageOptions {
  title: string;
  text: string;
}
