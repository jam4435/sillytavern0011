import { byId } from './dom';
import { handleNext, handleRandomize } from './flow';
import { checkAllFeaturesSelected, navigateTo } from './render';
import { createSelectionState, ensureFeatureSelections, ensureModificationSelections, updateSelection } from './state';
import type { SelectionKey, SelectionState } from './types';

export function init() {
  const selections = createSelectionState();
  bindBodyClickEvents(selections);
  bindInputEvents(selections);
}

function bindBodyClickEvents(selections: SelectionState) {
  document.body.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;

    const card = event.target.closest('.card') as HTMLElement | null;
    const featureOption = event.target.closest('.feature-option') as HTMLElement | null;
    const modOption = event.target.closest('.mod-option') as HTMLElement | null;
    const backButton = event.target.closest('.back-btn') as HTMLButtonElement | null;
    const randomizeButton = event.target.closest('.randomize-btn') as HTMLElement | null;
    const nextButton = event.target.closest('.btn-primary') as HTMLButtonElement | null;

    const randomizeScreenId = randomizeButton?.dataset.screenId;
    if (randomizeScreenId) {
      handleRandomize(randomizeScreenId, selections);
      return;
    }

    if (card) {
      const type = card.dataset.type as SelectionKey | undefined;
      const value = card.dataset.value;
      if (!type || !value) return;

      if (type === 'profession') {
        byId<HTMLInputElement>('custom-profession-input').value = '';
      }

      updateSelection(selections, type, value);
      card.parentElement?.querySelectorAll('.card').forEach(option => option.classList.remove('selected'));
      card.classList.add('selected');
      card.closest('.screen')?.querySelector<HTMLButtonElement>('.btn-primary')?.toggleAttribute('disabled', false);
    }

    if (featureOption && !featureOption.classList.contains('disabled')) {
      const category = featureOption.dataset.category;
      const value = featureOption.dataset.value;
      if (!category || !value) return;

      ensureFeatureSelections(selections)[category] = value;
      featureOption.parentElement
        ?.querySelectorAll('.feature-option')
        .forEach(option => option.classList.remove('selected'));
      featureOption.classList.add('selected');
      checkAllFeaturesSelected(selections);
    }

    if (modOption && !modOption.classList.contains('disabled')) {
      const modificationName = modOption.dataset.value;
      if (!modificationName) return;

      const modifications = ensureModificationSelections(selections);
      const index = modifications.indexOf(modificationName);

      if (index > -1) {
        modifications.splice(index, 1);
        modOption.classList.remove('selected');
      } else {
        modifications.push(modificationName);
        modOption.classList.add('selected');
      }
    }

    if (backButton?.dataset.target) {
      navigateTo(backButton.dataset.target);
    }

    if (nextButton && !nextButton.disabled) {
      void handleNext(nextButton.id, selections);
    }
  });
}

function bindInputEvents(selections: SelectionState) {
  byId<HTMLInputElement>('custom-profession-input').addEventListener('input', event => {
    const value = event.currentTarget.value.trim();
    if (value) {
      updateSelection(selections, 'profession', value);
      document.querySelectorAll('#profession-options .card').forEach(card => card.classList.remove('selected'));
      byId<HTMLButtonElement>('to-features').disabled = false;
      return;
    }

    delete selections.profession;
    byId<HTMLButtonElement>('to-features').disabled = true;
  });

  byId<HTMLInputElement>('custom-features-input').addEventListener('input', event => {
    selections.customFeature = event.currentTarget.value.trim();
  });

  byId<HTMLInputElement>('custom-modification-input').addEventListener('input', event => {
    selections.customModification = event.currentTarget.value.trim();
  });

  byId<HTMLTextAreaElement>('custom-scene-input').addEventListener('input', event => {
    selections.customScene = event.currentTarget.value.trim();
  });
}
