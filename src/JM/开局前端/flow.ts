import { getGenderConfig, getProfessionCategoryInfo, getStatusInfo } from './data-access';
import { byId, queryRequired } from './dom';
import { renderCardOptions, renderFeaturesScreen, renderModificationScreen, renderSummary, navigateTo } from './render';
import { ensureModificationSelections } from './state';
import { submitSelections } from './submit';
import type { SelectionState } from './types';

function getRandomElement<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export function handleRandomize(screenId: string, selections: SelectionState) {
  const screenElement = document.getElementById(screenId);
  if (!screenElement) return;

  switch (screenId) {
    case 'screen-gender':
    case 'screen-status':
    case 'screen-profession-category': {
      const cards = Array.from(screenElement.querySelectorAll<HTMLElement>('.card:not(.disabled)'));
      if (cards.length > 0) {
        getRandomElement(cards).click();
      }
      break;
    }
    case 'screen-profession': {
      byId<HTMLInputElement>('custom-profession-input').value = '';
      delete selections.profession;

      const professionCards = Array.from(screenElement.querySelectorAll<HTMLElement>('.card:not(.disabled)'));
      if (professionCards.length > 0) {
        getRandomElement(professionCards).click();
      }
      break;
    }
    case 'screen-features': {
      if (selections.status?.includes('劣化人')) return;

      byId<HTMLInputElement>('custom-features-input').value = '';
      delete selections.customFeature;

      screenElement.querySelectorAll('.feature-category').forEach(category => {
        const options = Array.from(category.querySelectorAll<HTMLElement>('.feature-option:not(.disabled)'));
        if (options.length > 0) {
          getRandomElement(options).click();
        }
      });
      break;
    }
    case 'screen-modification': {
      byId<HTMLInputElement>('custom-modification-input').value = '';
      delete selections.customModification;

      const modifications = ensureModificationSelections(selections);
      selections.modification = modifications.filter(modificationName => {
        const modElement = screenElement.querySelector<HTMLElement>(
          `.mod-option[data-value="${modificationName}"]`,
        );
        return Boolean(modElement?.classList.contains('disabled'));
      });

      const optionalMods = Array.from(screenElement.querySelectorAll<HTMLElement>('.mod-option:not(.disabled)'));
      optionalMods.forEach(mod => mod.classList.remove('selected'));

      if (optionalMods.length > 0) {
        const numberOfMods = 1 + Math.floor(Math.random() * Math.min(3, optionalMods.length));
        const shuffledMods = [...optionalMods].sort(() => 0.5 - Math.random());
        for (let i = 0; i < numberOfMods; i++) {
          shuffledMods[i].click();
        }
      }
      break;
    }
  }
}

export async function handleNext(nextButtonId: string, selections: SelectionState) {
  switch (nextButtonId) {
    case 'to-status':
      renderCardOptions('status-options', getGenderConfig(selections).status, 'status', selections);
      navigateTo('screen-status');
      break;
    case 'to-profession-or-category': {
      const statusInfo = getStatusInfo(selections);
      const backButton = queryRequired<HTMLButtonElement>('#screen-profession .back-btn');

      if (statusInfo.professionCategories) {
        backButton.dataset.target = 'screen-profession-category';
        renderCardOptions(
          'profession-category-options',
          statusInfo.professionCategories,
          'professionCategory',
          selections,
        );
        navigateTo('screen-profession-category');
      } else {
        backButton.dataset.target = 'screen-status';
        renderCardOptions('profession-options', statusInfo.professions ?? [], 'profession', selections);
        navigateTo('screen-profession');
      }
      break;
    }
    case 'to-profession': {
      const categoryInfo = getProfessionCategoryInfo(selections);

      if (categoryInfo.professions?.length === 1) {
        selections.profession = categoryInfo.professions[0];
        renderFeaturesScreen(selections);
        navigateTo('screen-features');
        break;
      }

      renderCardOptions('profession-options', categoryInfo.professions ?? [], 'profession', selections);
      navigateTo('screen-profession');
      break;
    }
    case 'to-features':
      renderFeaturesScreen(selections);
      navigateTo('screen-features');
      break;
    case 'to-modification':
      renderModificationScreen(selections);
      navigateTo('screen-modification');
      break;
    case 'to-summary':
      renderSummary(selections);
      navigateTo('screen-summary');
      break;
    case 'confirm-and-start':
      await submitSelections(selections);
      break;
  }
}
