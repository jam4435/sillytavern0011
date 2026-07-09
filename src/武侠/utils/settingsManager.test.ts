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
    expect(settings.themeAppearanceByTheme['ink-wash'].fontColor).toBe(
      getThemeAppearanceDefaults('ink-wash').fontColor,
    );
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
    expect(settings.themeAppearanceByTheme['dark-gold'].fontColor).toBe('#ffffff');
  });

  it('normalizes invalid stored themes to dark-gold', () => {
    window.localStorage.setItem('wuxia_display_settings', JSON.stringify({ uiTheme: 'paper-blue' }));

    expect(loadSettings().uiTheme).toBe('dark-gold');
  });

  it('migrates legacy active-theme appearance into the matching theme slot', () => {
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        uiTheme: 'ink-wash',
        fontColor: '#2a2118',
        backgroundColor: '#efe5d6',
        backgroundOpacity: 0.46,
        backgroundImage: 'data:image/png;base64,ink',
        backgroundBlur: 2,
        chromeOpacity: 0.44,
        modalOpacity: 0.54,
      }),
    );

    const settings = loadSettings();

    expect(settings.uiTheme).toBe('ink-wash');
    expect(settings.fontColor).toBe('#2a2118');
    expect(settings.backgroundImage).toBe('data:image/png;base64,ink');
    expect(settings.themeAppearanceByTheme['ink-wash']).toEqual(
      expect.objectContaining({
        fontColor: '#2a2118',
        backgroundColor: '#efe5d6',
        backgroundOpacity: 0.46,
        backgroundImage: 'data:image/png;base64,ink',
        backgroundBlur: 2,
        chromeOpacity: 0.44,
        modalOpacity: 0.54,
      }),
    );
    expect(settings.themeAppearanceByTheme['dark-gold'].fontColor).toBe(
      getThemeAppearanceDefaults('dark-gold').fontColor,
    );
  });

  it('persists and reloads the selected theme', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
      backgroundImage: 'data:image/png;base64,ink',
      themeAppearanceByTheme: {
        ...defaults.themeAppearanceByTheme,
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          ...getThemeAppearanceDefaults('ink-wash'),
          backgroundImage: 'data:image/png;base64,ink',
        },
      },
    };

    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings()).toEqual(
      expect.objectContaining({
        uiTheme: 'ink-wash',
        backgroundImage: 'data:image/png;base64,ink',
        themeAppearanceByTheme: expect.objectContaining({
          'ink-wash': expect.objectContaining({
            backgroundImage: 'data:image/png;base64,ink',
          }),
        }),
      }),
    );
  });

  it('applies data-ui-theme and ink-wash sprite variables to the DOM', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
      chromeOpacity: 0.45,
      modalOpacity: 0.7,
      themeAppearanceByTheme: {
        ...defaults.themeAppearanceByTheme,
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          ...getThemeAppearanceDefaults('ink-wash'),
          chromeOpacity: 0.45,
          modalOpacity: 0.7,
        },
      },
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
