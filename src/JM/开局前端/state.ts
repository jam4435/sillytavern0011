import { maybeById } from './dom';
import { selectionOrder, type FeatureSelections, type SelectionKey, type SelectionState } from './types';

export function createSelectionState(): SelectionState {
  return {};
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
