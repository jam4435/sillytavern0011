import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySettingsToDOM,
  createDefaultDisplaySettings,
  getThemeAppearanceDefaults,
  loadSettings,
  saveSettings,
} from './settingsManager';

describe('settingsManager ui theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-ui-theme');
    document.documentElement.removeAttribute('style');
  });

  it('uses dark-gold as the default theme', () => {
    const settings = createDefaultDisplaySettings();

    expect(settings.uiTheme).toBe('dark-gold');
    expect(settings.fontColor).toBe(getThemeAppearanceDefaults('dark-gold').fontColor);
  });

  it('migrates old stored settings without a theme field', () => {
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        fontSize: 18,
        fontColor: '#ffffff',
        lineHeight: 1.6,
      }),
    );

    const settings = loadSettings();

    expect(settings.uiTheme).toBe('dark-gold');
    expect(settings.fontSize).toBe(18);
    expect(settings.fontColor).toBe('#ffffff');
  });

  it('normalizes invalid stored themes to dark-gold', () => {
    window.localStorage.setItem('wuxia_display_settings', JSON.stringify({ uiTheme: 'paper-blue' }));

    expect(loadSettings().uiTheme).toBe('dark-gold');
  });

  it('persists and reloads the selected theme', () => {
    const settings = {
      ...createDefaultDisplaySettings(),
      uiTheme: 'ink-wash' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
    };

    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings().uiTheme).toBe('ink-wash');
  });

  it('applies data-ui-theme and ink-wash sprite variables to the DOM', () => {
    const settings = {
      ...createDefaultDisplaySettings(),
      uiTheme: 'ink-wash' as const,
      chromeOpacity: 0.45,
      modalOpacity: 0.7,
    };

    applySettingsToDOM(settings);

    expect(document.documentElement.dataset.uiTheme).toBe('ink-wash');
    expect(document.documentElement.style.getPropertyValue('--content-font-color')).toBe(
      getThemeAppearanceDefaults('ink-wash').fontColor,
    );
    expect(document.documentElement.style.getPropertyValue('--wuxia-ink-bg-image')).toContain('url(');
    expect(document.documentElement.style.getPropertyValue('--wuxia-chrome-opacity')).toBe('0.45');
    expect(document.documentElement.style.getPropertyValue('--wuxia-modal-opacity')).toBe('0.7');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
