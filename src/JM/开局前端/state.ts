import { maybeById } from './dom';
import {
  selectionOrder,
  type FeatureSelections,
  type GenerationSettings,
  type SelectionKey,
  type SelectionState,
} from './types';

const defaultGenerationSettings: GenerationSettings = {
  enableVariables: true,
  useTextStatusBar: false,
  generateOptions: true,
};

export function createSelectionState(): SelectionState {
  return {
    settings: createDefaultGenerationSettings(),
  };
}

export function updateSelection(selections: SelectionState, type: SelectionKey, value: string) {
  if (selections[type] === value) return;

  selections[type] = value;
  const currentIndex = selectionOrder.indexOf(type);
  for (let i = currentIndex + 1; i < selectionOrder.length; i++) {
    const key = selectionOrder[i];
    delete selections[key];
    maybeById<HTMLInputElement | HTMLTextAreaElement>(`custom-${key}-input`)?.value = '';
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
    selections.settings = createDefaultGenerationSettings();
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

function createDefaultGenerationSettings(): GenerationSettings {
  return {
    ...defaultGenerationSettings,
  };
}
