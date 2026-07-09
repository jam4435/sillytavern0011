import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from './SettingsPanel';
import {
  createDefaultDisplaySettings,
  getThemeAppearanceDefaults,
  type DisplaySettings,
} from '../utils/settingsManager';
import type { VariableEditorCapability } from '../utils/variableEditorPolicy';

const variableEditorCapability: VariableEditorCapability = {
  canEdit: true,
  source: 'internal-default',
  reason: 'test',
};

function renderSettingsPanel(settings: DisplaySettings, onSettingsChange = vi.fn()) {
  render(
    <SettingsPanel
      currentPresetName=""
      settings={settings}
      onSettingsChange={onSettingsChange}
      variableEditorCapability={variableEditorCapability}
    />,
  );

  return onSettingsChange;
}

describe('SettingsPanel theme controls', () => {
  it('emits ink-wash settings when the ink theme is selected', () => {
    const settings = createDefaultDisplaySettings();
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('radio', { name: /水墨/ }));

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uiTheme: 'ink-wash',
        ...getThemeAppearanceDefaults('ink-wash'),
      }),
    );
  });

  it('restores the saved appearance of the selected theme', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      fontColor: '#2a2118',
      backgroundColor: '#efe5d6',
      backgroundOpacity: 0.46,
      backgroundImage: 'data:image/png;base64,ink',
      backgroundBlur: 2,
      chromeOpacity: 0.44,
      modalOpacity: 0.54,
      themeAppearanceByTheme: {
        'dark-gold': {
          ...defaults.themeAppearanceByTheme['dark-gold'],
          fontColor: '#123456',
          backgroundColor: '#654321',
          backgroundOpacity: 0.4,
          backgroundImage: 'data:image/png;base64,dark',
          backgroundBlur: 3,
          chromeOpacity: 0.55,
          modalOpacity: 0.65,
        },
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          fontColor: '#2a2118',
          backgroundColor: '#efe5d6',
          backgroundOpacity: 0.46,
          backgroundImage: 'data:image/png;base64,ink',
          backgroundBlur: 2,
          chromeOpacity: 0.44,
          modalOpacity: 0.54,
        },
      },
    };
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('radio', { name: /黑金/ }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uiTheme: 'dark-gold',
        fontColor: '#123456',
        backgroundColor: '#654321',
        backgroundOpacity: 0.4,
        backgroundImage: 'data:image/png;base64,dark',
        backgroundBlur: 3,
        chromeOpacity: 0.55,
        modalOpacity: 0.65,
      }),
    );
  });

  it('updates only the current theme slot when editing appearance fields', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      fontColor: '#2a2118',
      themeAppearanceByTheme: {
        'dark-gold': {
          ...defaults.themeAppearanceByTheme['dark-gold'],
          fontColor: '#abcdef',
        },
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          fontColor: '#2a2118',
        },
      },
    };
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.change(screen.getByDisplayValue('#2a2118'), { target: { value: '#112233' } });

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fontColor: '#112233',
        themeAppearanceByTheme: expect.objectContaining({
          'dark-gold': expect.objectContaining({ fontColor: '#abcdef' }),
          'ink-wash': expect.objectContaining({ fontColor: '#112233' }),
        }),
      }),
    );
  });

  it('resets appearance back to the dark-gold theme', () => {
    const settings = {
      ...createDefaultDisplaySettings(),
      uiTheme: 'ink-wash' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
      backgroundImage: 'data:image/png;base64,test',
    };
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('button', { name: '重置外观' }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uiTheme: 'dark-gold',
        ...getThemeAppearanceDefaults('dark-gold'),
        backgroundImage: null,
      }),
    );
  });
});
