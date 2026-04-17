import { getFeatureSet, getModificationOptions } from './data-access';
import { byId } from './dom';
import { ensureFeatureSelections, ensureGenerationSettings, ensureModificationSelections } from './state';
import type { CardOptions, GenerationSettings, ModificationOption, SelectionState } from './types';

export function navigateTo(screenId: string) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  byId<HTMLElement>(screenId).classList.add('active');
}

export function renderCardOptions(containerId: string, options: CardOptions, type: string, selections: SelectionState) {
  const container = byId<HTMLElement>(containerId);
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'selection-grid';

  if (Array.isArray(options)) {
    options.forEach(option => {
      grid.appendChild(createCard(type, option, '', selections));
    });
  } else {
    for (const [key, value] of Object.entries(options)) {
      grid.appendChild(createCard(type, key, value.description || '', selections));
    }
  }

  container.appendChild(grid);

  const nextButton = container.closest('.screen')?.querySelector<HTMLButtonElement>('.btn-primary');
  if (!nextButton) return;

  if (type === 'profession' && byId<HTMLInputElement>('custom-profession-input').value.trim()) {
    nextButton.disabled = false;
    return;
  }

  nextButton.disabled = !Boolean(selections[type]);
}

export function renderFeaturesScreen(selections: SelectionState) {
  const container = byId<HTMLDivElement>('features-container');
  container.innerHTML = '';

  const featureSelections = ensureFeatureSelections(selections);
  const isDeteriorated = selections.status?.includes('劣化人');
  const featureSet = getFeatureSet(selections);

  for (const [category, levels] of Object.entries(featureSet)) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'feature-category';

    const title = document.createElement('h4');
    title.textContent = category;
    categoryDiv.appendChild(title);

    const optionsGrid = document.createElement('div');
    optionsGrid.className = 'feature-options-grid';

    levels.forEach(level => {
      const option = document.createElement('div');
      option.className = 'feature-option';
      option.dataset.category = category;
      option.dataset.value = level;
      option.textContent = level;
      optionsGrid.appendChild(option);
    });

    categoryDiv.appendChild(optionsGrid);
    container.appendChild(categoryDiv);

    if (isDeteriorated) {
      const lowestLevel = levels[levels.length - 1];
      featureSelections[category] = lowestLevel;
      optionsGrid.querySelectorAll('.feature-option').forEach(option => option.classList.add('disabled'));
      optionsGrid.querySelector<HTMLElement>(`[data-value="${lowestLevel}"]`)?.classList.add('selected');
      continue;
    }

    const selectedLevel = featureSelections[category];
    if (selectedLevel) {
      optionsGrid.querySelector<HTMLElement>(`[data-value="${selectedLevel}"]`)?.classList.add('selected');
    }
  }

  checkAllFeaturesSelected(selections);
}

export function checkAllFeaturesSelected(selections: SelectionState) {
  const featureSet = getFeatureSet(selections);
  const allSelected = Object.keys(featureSet).every(category => Boolean(selections.feature?.[category]));
  byId<HTMLButtonElement>('to-modification').disabled = !allSelected;
}

export function renderModificationScreen(selections: SelectionState) {
  const container = byId<HTMLDivElement>('modification-container');
  container.innerHTML = '';

  const profession = selections.profession;
  const modifications = ensureModificationSelections(selections);
  const allMods = getModificationOptions(selections);
  const requiredMods = profession ? allMods.filter(mod => mod.requires?.includes(profession)) : [];

  if (requiredMods.length > 0) {
    const info = document.createElement('div');
    info.className = 'required-mod-info';
    info.innerHTML = `根据你的职业 [${profession}]，以下改造为强制执行：${requiredMods.map(mod => `<strong>${mod.name}</strong>`).join('、')}`;
    container.appendChild(info);

    requiredMods.forEach(mod => {
      if (!modifications.includes(mod.name)) {
        modifications.push(mod.name);
      }
    });
  }

  allMods.forEach(mod => {
    const option = createModOption(mod);
    const isForbidden = profession ? mod.forbids?.includes(profession) : false;

    if (isForbidden) {
      option.classList.add('disabled');
    } else if (requiredMods.some(requiredMod => requiredMod.name === mod.name)) {
      option.classList.add('selected', 'disabled');
    } else if (modifications.includes(mod.name)) {
      option.classList.add('selected');
    }

    container.appendChild(option);
  });

  byId<HTMLButtonElement>('to-summary').disabled = false;
}

export function renderSummary(selections: SelectionState) {
  const summaryContainer = byId<HTMLDivElement>('summary-content');
  summaryContainer.innerHTML = '';
  summaryContainer.className = 'summary-section';
  const settings = ensureGenerationSettings(selections);

  const fields = {
    性别: 'gender',
    社会身份: 'status',
    职业大类: 'professionCategory',
    具体职业: 'profession',
  };

  for (const [label, key] of Object.entries(fields)) {
    const value = selections[key];
    if (typeof value === 'string' && value) {
      summaryContainer.appendChild(createSummaryItem(label, value));
    }
  }

  if (selections.feature) {
    for (const [category, level] of Object.entries(selections.feature)) {
      summaryContainer.appendChild(createSummaryItem(category, level));
    }
  }

  if (selections.customFeature) {
    summaryContainer.appendChild(createSummaryItem('补充特征', selections.customFeature));
  }

  if (Array.isArray(selections.modification) && selections.modification.length > 0) {
    summaryContainer.appendChild(createSummaryItem('身体改造', selections.modification.join(', ')));
  }

  if (selections.customModification) {
    summaryContainer.appendChild(createSummaryItem('补充改造', selections.customModification));
  }

  summaryContainer.appendChild(createSummaryItem('变量系统', settings.enableVariables ? '开启' : '关闭'));
  summaryContainer.appendChild(createSummaryItem('状态栏模式', getStatusBarModeLabel(settings)));
  summaryContainer.appendChild(createSummaryItem('生成选项', settings.generateOptions ? '开启' : '关闭'));
}

export function syncSettingsControls(selections: SelectionState) {
  const settings = ensureGenerationSettings(selections);
  const variableInput = byId<HTMLInputElement>('setting-enable-variables');
  const textStatusInput = byId<HTMLInputElement>('setting-use-text-status-bar');
  const optionInput = byId<HTMLInputElement>('setting-generate-options');
  const textStatusItem = byId<HTMLLabelElement>('setting-use-text-status-bar-item');
  const textStatusHint = byId<HTMLSpanElement>('setting-use-text-status-bar-hint');

  variableInput.checked = settings.enableVariables;
  textStatusInput.checked = settings.useTextStatusBar;
  optionInput.checked = settings.generateOptions;

  textStatusInput.disabled = settings.enableVariables;
  textStatusItem.classList.toggle('disabled', settings.enableVariables);
  textStatusHint.textContent = settings.enableVariables
    ? '关闭变量后才能切换到无图片状态栏。'
    : '关闭图片状态栏并启用无图片状态栏。';
}

function getStatusBarModeLabel(settings: GenerationSettings) {
  if (settings.enableVariables) {
    return '变量状态栏';
  }

  return settings.useTextStatusBar ? '无图片状态栏' : '图片状态栏';
}

function createCard(type: string, value: string, description: string, selections: SelectionState) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.type = type;
  card.dataset.value = value;

  if (selections[type] === value) {
    card.classList.add('selected');
  }

  const title = document.createElement('h3');
  title.textContent = value;
  card.appendChild(title);

  if (description) {
    const text = document.createElement('p');
    text.textContent = description;
    card.appendChild(text);
  }

  return card;
}

function createModOption(mod: ModificationOption) {
  const option = document.createElement('div');
  option.className = 'mod-option';
  option.dataset.value = mod.name;
  option.title = mod.description || mod.name;
  option.textContent = mod.name;
  return option;
}

function createSummaryItem(label: string, value: string) {
  const item = document.createElement('div');
  item.className = 'summary-item';
  item.innerHTML = `<span class="summary-label">${label}</span><span class="summary-value">${value}</span>`;
  return item;
}
