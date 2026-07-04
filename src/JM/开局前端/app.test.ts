import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from './app';
import { applyGenerationSettings, applyHardIdentityRouteSettings } from './tavern-settings';
import { queueSettingsSyncPopup } from './popup';

vi.mock('./tavern-settings', () => ({
  applyGenerationSettings: vi.fn(async () => ({
    scopes: [],
    hasChanges: true,
    hasMissing: false,
  })),
  applyHardIdentityRouteSettings: vi.fn(async () => ({
    scopes: [],
    hasChanges: true,
    hasMissing: false,
  })),
}));

vi.mock('./popup', () => ({
  queueSettingsSyncPopup: vi.fn(),
}));

const appDocumentHtml = readFileSync(resolve(process.cwd(), 'src/JM/开局前端/index.html'), 'utf8');
const generationSettingsStorageKey = 'jm-opening-frontend-generation-settings-v1';
const hardIdentityRouteStorageKey = 'jm-opening-frontend-hard-identity-route-v1';

function resetDocumentWithAppHtml() {
  const parsed = new DOMParser().parseFromString(appDocumentHtml, 'text/html');
  const nextBody = document.createElement('body');
  nextBody.innerHTML = parsed.body.innerHTML;
  document.documentElement.replaceChild(nextBody, document.body);
}

function dispatchCheckboxChange(id: string, checked: boolean) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`未找到测试所需控件: #${id}`);
  }

  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input;
}

function dispatchRadioChange(id: string) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`未找到测试所需控件: #${id}`);
  }

  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input;
}

async function flushEffects() {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

describe('开局前端入口设置', () => {
  beforeEach(() => {
    resetDocumentWithAppHtml();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('把设置面板放在入口页而不是性别步骤页', () => {
    const modeScreen = document.getElementById('screen-mode');
    const genderScreen = document.getElementById('screen-gender');

    expect(modeScreen?.querySelector('.settings-panel')).not.toBeNull();
    expect(modeScreen?.querySelector('.hard-route-settings')).not.toBeNull();
    expect(genderScreen?.querySelector('.settings-panel')).toBeNull();
  });

  it('高难身份路线默认不启用', () => {
    init();

    const routeInput = document.getElementById('setting-hard-identity-route-none') as HTMLInputElement | null;

    expect(routeInput).not.toBeNull();
    expect(routeInput?.checked).toBe(true);
    expect(localStorage.getItem(hardIdentityRouteStorageKey)).toBeNull();
  });

  it('只开放默认、路线一和路线三，其余高难身份路线暗色禁用', () => {
    init();

    const enabledRoutes = ['none', 'imperial_male_elite', 'imperial_female_survival'];
    const disabledRoutes = [
      'imperial_male_lowborn',
      'imperial_female_revolutionary',
      'imperial_female_reformist',
      'akentor_male_defector',
      'external_revolutionary_army',
      'external_roaring_sisterhood',
    ];

    enabledRoutes.forEach(route => {
      const input = document.getElementById(`setting-hard-identity-route-${route}`) as HTMLInputElement | null;
      expect(input?.disabled).toBe(false);
      expect(input?.closest('.hard-route-option')).not.toHaveClass('disabled');
    });

    disabledRoutes.forEach(route => {
      const input = document.getElementById(`setting-hard-identity-route-${route}`) as HTMLInputElement | null;
      const option = input?.closest('.hard-route-option');

      expect(input?.disabled).toBe(true);
      expect(option).toHaveClass('disabled');
      expect(option?.textContent).toContain('未开放');
    });
  });

  it('旧缓存中的未开放高难身份路线会回退到不启用', () => {
    localStorage.setItem(hardIdentityRouteStorageKey, 'imperial_male_lowborn');

    init();

    const noneRouteInput = document.getElementById('setting-hard-identity-route-none') as HTMLInputElement | null;
    const disabledRouteInput = document.getElementById(
      'setting-hard-identity-route-imperial_male_lowborn',
    ) as HTMLInputElement | null;

    expect(noneRouteInput?.checked).toBe(true);
    expect(disabledRouteInput?.checked).toBe(false);
    expect(disabledRouteInput?.disabled).toBe(true);
  });

  it('选择高难身份路线会缓存并同步路线状态，但不触发现有设置同步', async () => {
    init();
    vi.clearAllMocks();

    const routeInput = dispatchRadioChange('setting-hard-identity-route-imperial_male_elite');

    await flushEffects();

    expect(routeInput.checked).toBe(true);
    expect(localStorage.getItem(hardIdentityRouteStorageKey)).toBe('imperial_male_elite');
    expect(applyHardIdentityRouteSettings).toHaveBeenCalledWith('imperial_male_elite');
    expect(applyGenerationSettings).not.toHaveBeenCalled();
    expect(queueSettingsSyncPopup).not.toHaveBeenCalled();
  });

  it('从路线一切回不启用时会把路线变量同步为 none', async () => {
    init();

    dispatchRadioChange('setting-hard-identity-route-imperial_male_elite');
    await flushEffects();
    vi.clearAllMocks();

    const noneRouteInput = dispatchRadioChange('setting-hard-identity-route-none');

    await flushEffects();

    expect(noneRouteInput.checked).toBe(true);
    expect(localStorage.getItem(hardIdentityRouteStorageKey)).toBe('none');
    expect(applyHardIdentityRouteSettings).toHaveBeenCalledWith('none');
    expect(applyGenerationSettings).not.toHaveBeenCalled();
  });

  it('在入口页切换设置时仍会缓存并立即同步', async () => {
    init();

    const enableVariablesInput = dispatchCheckboxChange('setting-enable-variables', false);

    await flushEffects();

    expect(enableVariablesInput.checked).toBe(false);
    expect(applyGenerationSettings).toHaveBeenCalledWith({
      enableVariables: false,
      useTextStatusBar: false,
      generateOptions: true,
    });
    expect(queueSettingsSyncPopup).toHaveBeenCalledWith({
      scopes: [],
      hasChanges: true,
      hasMissing: false,
    });
    expect(JSON.parse(localStorage.getItem(generationSettingsStorageKey) ?? '{}')).toEqual({
      enableVariables: false,
      useTextStatusBar: false,
      generateOptions: true,
    });
  });

  it('重新开启变量时会强制关闭无图片状态栏', async () => {
    init();

    dispatchCheckboxChange('setting-enable-variables', false);
    await flushEffects();

    const textStatusInput = dispatchCheckboxChange('setting-use-text-status-bar', true);
    await flushEffects();
    expect(textStatusInput.checked).toBe(true);
    expect(textStatusInput.disabled).toBe(false);

    const enableVariablesInput = dispatchCheckboxChange('setting-enable-variables', true);
    await flushEffects();

    expect(enableVariablesInput.checked).toBe(true);
    expect(textStatusInput.checked).toBe(false);
    expect(textStatusInput.disabled).toBe(true);
    expect(applyGenerationSettings).toHaveBeenLastCalledWith({
      enableVariables: true,
      useTextStatusBar: false,
      generateOptions: true,
    });
    expect(JSON.parse(localStorage.getItem(generationSettingsStorageKey) ?? '{}')).toEqual({
      enableVariables: true,
      useTextStatusBar: false,
      generateOptions: true,
    });
  });
});
