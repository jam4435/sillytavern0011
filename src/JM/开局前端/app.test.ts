import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from './app';
import { applyGenerationSettings } from './tavern-settings';
import { queueSettingsSyncPopup } from './popup';

vi.mock('./tavern-settings', () => ({
  applyGenerationSettings: vi.fn(async () => ({
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
    expect(genderScreen?.querySelector('.settings-panel')).toBeNull();
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
