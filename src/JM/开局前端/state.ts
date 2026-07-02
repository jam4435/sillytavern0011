import { maybeById } from './dom';
import { normalizeHardIdentityRoute, type HardIdentityRouteKey } from './hard-routes';
import {
  selectionOrder,
  type FeatureSelections,
  type GenerationSettings,
  type SelectionState,
  type StringSelectionKey,
} from './types';

const GENERATION_SETTINGS_STORAGE_KEY = 'jm-opening-frontend-generation-settings-v1';
const HARD_IDENTITY_ROUTE_STORAGE_KEY = 'jm-opening-frontend-hard-identity-route-v1';

const defaultGenerationSettings: GenerationSettings = {
  enableVariables: true,
  useTextStatusBar: false,
  generateOptions: true,
};

export function createSelectionState(): SelectionState {
  return {
    settings: loadGenerationSettings(),
    hardIdentityRoute: loadHardIdentityRoute(),
  };
}

export function updateSelection(selections: SelectionState, type: StringSelectionKey, value: string) {
  if (selections[type] === value) return;

  selections[type] = value;
  const currentIndex = selectionOrder.indexOf(type);
  for (let i = currentIndex + 1; i < selectionOrder.length; i++) {
    const key = selectionOrder[i];
    delete selections[key];
    const input = maybeById<HTMLInputElement | HTMLTextAreaElement>(`custom-${key}-input`);
    if (input) {
      input.value = '';
    }
  }
}

export function ensureFeatureSelections(selections: SelectionState): FeatureSelections {
  if (!selections.feature) {
    selections.feature = {};
  }
  return selections.feature;
}

export function ensureModificationSelections(selections: SelectionState): string[] {
  if (!Array.isArray(selections.modification)) {
    selections.modification = [];
  }
  return selections.modification;
}

export function ensureGenerationSettings(selections: SelectionState): GenerationSettings {
  if (!selections.settings) {
    selections.settings = loadGenerationSettings();
    return selections.settings;
  }

  if (typeof selections.settings.enableVariables !== 'boolean') {
    selections.settings.enableVariables = defaultGenerationSettings.enableVariables;
  }

  if (typeof selections.settings.useTextStatusBar !== 'boolean') {
    selections.settings.useTextStatusBar = defaultGenerationSettings.useTextStatusBar;
  }

  if (typeof selections.settings.generateOptions !== 'boolean') {
    selections.settings.generateOptions = defaultGenerationSettings.generateOptions;
  }

  if (selections.settings.enableVariables) {
    selections.settings.useTextStatusBar = false;
  }

  return selections.settings;
}

export function ensureHardIdentityRoute(selections: SelectionState): HardIdentityRouteKey {
  const route = normalizeHardIdentityRoute(selections.hardIdentityRoute);
  selections.hardIdentityRoute = route;
  return route;
}

function createDefaultGenerationSettings(): GenerationSettings {
  return {
    ...defaultGenerationSettings,
  };
}

function loadGenerationSettings(): GenerationSettings {
  try {
    const rawValue = localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return createDefaultGenerationSettings();
    }

    const parsed = JSON.parse(rawValue) as Partial<GenerationSettings>;
    return normalizeGenerationSettings(parsed);
  } catch (error) {
    console.warn('[开局前端] 读取设置缓存失败，已回退到默认设置', error);
    return createDefaultGenerationSettings();
  }
}

export function persistGenerationSettings(settings: GenerationSettings) {
  try {
    localStorage.setItem(GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeGenerationSettings(settings)));
  } catch (error) {
    console.warn('[开局前端] 保存设置缓存失败', error);
  }
}

export function persistHardIdentityRoute(route: HardIdentityRouteKey) {
  try {
    localStorage.setItem(HARD_IDENTITY_ROUTE_STORAGE_KEY, normalizeHardIdentityRoute(route));
  } catch (error) {
    console.warn('[开局前端] 保存高难身份路线缓存失败', error);
  }
}

function normalizeGenerationSettings(settings?: Partial<GenerationSettings>): GenerationSettings {
  const normalized: GenerationSettings = {
    enableVariables:
      typeof settings?.enableVariables === 'boolean'
        ? settings.enableVariables
        : defaultGenerationSettings.enableVariables,
    useTextStatusBar:
      typeof settings?.useTextStatusBar === 'boolean'
        ? settings.useTextStatusBar
        : defaultGenerationSettings.useTextStatusBar,
    generateOptions:
      typeof settings?.generateOptions === 'boolean'
        ? settings.generateOptions
        : defaultGenerationSettings.generateOptions,
  };

  if (normalized.enableVariables) {
    normalized.useTextStatusBar = false;
  }

  return normalized;
}

function loadHardIdentityRoute(): HardIdentityRouteKey {
  try {
    return normalizeHardIdentityRoute(localStorage.getItem(HARD_IDENTITY_ROUTE_STORAGE_KEY));
  } catch (error) {
    console.warn('[开局前端] 读取高难身份路线缓存失败，已回退到默认设置', error);
    return normalizeHardIdentityRoute(undefined);
  }
}
