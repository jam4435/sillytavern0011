import { byId } from './dom';
import { handleNext, handleRandomize } from './flow';
import { normalizeHardIdentityRoute } from './hard-routes';
import { refreshQuickOpeningScreen, selectQuickOpening } from './opening-switcher';
import { queueSettingsSyncPopup } from './popup';
import { checkAllFeaturesSelected, navigateTo, renderHardIdentityRouteControls, syncSettingsControls } from './render';
import {
  createSelectionState,
  ensureFeatureSelections,
  ensureGenerationSettings,
  ensureHardIdentityRoute,
  ensureModificationSelections,
  persistGenerationSettings,
  persistHardIdentityRoute,
  updateSelection,
} from './state';
import { applyGenerationSettings } from './tavern-settings';
import type { GenerationSettings, SelectionState, StringSelectionKey } from './types';

export function init() {
  const selections = createSelectionState();
  const syncGenerationSettings = createSettingsSyncer();
  renderHardIdentityRouteControls(selections);
  syncSettingsControls(selections);
  bindBodyClickEvents(selections);
  bindInputEvents(selections, syncGenerationSettings);
}

function bindBodyClickEvents(selections: SelectionState) {
  document.body.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;

    const card = event.target.closest('.card') as HTMLElement | null;
    const featureOption = event.target.closest('.feature-option') as HTMLElement | null;
    const modOption = event.target.closest('.mod-option') as HTMLElement | null;
    const modeCard = event.target.closest('.mode-card') as HTMLButtonElement | null;
    const backButton = event.target.closest('.back-btn') as HTMLButtonElement | null;
    const randomizeButton = event.target.closest('.randomize-btn') as HTMLElement | null;
    const refreshQuickOpeningsButton = event.target.closest('#refresh-quick-openings') as HTMLButtonElement | null;
    const quickOpeningSwitchButton = event.target.closest('.quick-opening-switch') as HTMLButtonElement | null;
    const nextButton = event.target.closest('.btn-primary') as HTMLButtonElement | null;

    const modeTarget = modeCard?.dataset.modeTarget;
    if (modeTarget) {
      navigateTo(modeTarget);
      if (modeTarget === 'screen-quick-opening') {
        void refreshQuickOpeningScreen();
      }
      return;
    }

    if (refreshQuickOpeningsButton && !refreshQuickOpeningsButton.disabled) {
      void refreshQuickOpeningScreen();
      return;
    }

    if (quickOpeningSwitchButton && !quickOpeningSwitchButton.disabled) {
      const swipeIndex = Number(quickOpeningSwitchButton.dataset.swipeIndex);
      void selectQuickOpening(swipeIndex, ensureGenerationSettings(selections));
      return;
    }

    const randomizeScreenId = randomizeButton?.dataset.screenId;
    if (randomizeScreenId) {
      handleRandomize(randomizeScreenId, selections);
      return;
    }

    if (card) {
      const type = card.dataset.type as StringSelectionKey | undefined;
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

function bindInputEvents(selections: SelectionState, syncGenerationSettings: (settings: GenerationSettings) => void) {
  bindSettingsEvents(selections, syncGenerationSettings);

  byId<HTMLInputElement>('custom-profession-input').addEventListener('input', event => {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
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
    selections.customFeature = (event.currentTarget as HTMLInputElement).value.trim();
  });

  byId<HTMLInputElement>('custom-modification-input').addEventListener('input', event => {
    selections.customModification = (event.currentTarget as HTMLInputElement).value.trim();
  });

  byId<HTMLTextAreaElement>('custom-scene-input').addEventListener('input', event => {
    selections.customScene = (event.currentTarget as HTMLTextAreaElement).value.trim();
  });
}

function bindSettingsEvents(
  selections: SelectionState,
  syncGenerationSettings: (settings: GenerationSettings) => void,
) {
  byId<HTMLInputElement>('setting-enable-variables').addEventListener('change', event => {
    const settings = ensureGenerationSettings(selections);
    settings.enableVariables = (event.currentTarget as HTMLInputElement).checked;
    if (settings.enableVariables) {
      settings.useTextStatusBar = false;
    }
    syncSettingsControls(selections);
    persistGenerationSettings(settings);
    syncGenerationSettings({ ...settings });
  });

  byId<HTMLInputElement>('setting-use-text-status-bar').addEventListener('change', event => {
    const settings = ensureGenerationSettings(selections);
    if (settings.enableVariables) {
      settings.useTextStatusBar = false;
    } else {
      settings.useTextStatusBar = (event.currentTarget as HTMLInputElement).checked;
    }
    syncSettingsControls(selections);
    persistGenerationSettings(settings);
    syncGenerationSettings({ ...settings });
  });

  byId<HTMLInputElement>('setting-generate-options').addEventListener('change', event => {
    const settings = ensureGenerationSettings(selections);
    settings.generateOptions = (event.currentTarget as HTMLInputElement).checked;
    syncSettingsControls(selections);
    persistGenerationSettings(settings);
    syncGenerationSettings({ ...settings });
  });

  byId<HTMLDivElement>('hard-identity-route-options').addEventListener('change', event => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'setting-hard-identity-route') {
      return;
    }

    if (event.target.disabled) {
      renderHardIdentityRouteControls(selections);
      return;
    }

    selections.hardIdentityRoute = normalizeHardIdentityRoute(event.target.value);
    const route = ensureHardIdentityRoute(selections);
    persistHardIdentityRoute(route);
    renderHardIdentityRouteControls(selections);
  });
}

function createSettingsSyncer() {
  let pendingSettings: GenerationSettings | null = null;
  let syncing = false;

  return function syncGenerationSettings(settings: GenerationSettings) {
    pendingSettings = { ...settings };
    if (syncing) {
      return;
    }

    syncing = true;
    void flushPendingSettings();
  };

  async function flushPendingSettings() {
    while (pendingSettings) {
      const nextSettings = pendingSettings;
      pendingSettings = null;

      try {
        const syncReport = await applyGenerationSettings(nextSettings);
        queueSettingsSyncPopup(syncReport);
      } catch (error) {
        console.error('同步开局设置失败:', error);
        alert(error instanceof Error ? error.message : '同步开局设置失败');
      }
    }

    syncing = false;
  }
}
