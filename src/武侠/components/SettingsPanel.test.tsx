import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from './SettingsPanel';
import { createDefaultDisplaySettings, getThemeAppearanceDefaults, type DisplaySettings } from '../utils/settingsManager';
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

  it('preserves custom appearance values when switching themes', () => {
    const settings = {
      ...createDefaultDisplaySettings(),
      fontColor: '#123456',
      backgroundColor: '#654321',
      backgroundOpacity: 0.4,
      backgroundBlur: 3,
    };
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('radio', { name: /水墨/ }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uiTheme: 'ink-wash',
        fontColor: '#123456',
        backgroundColor: '#654321',
        backgroundOpacity: 0.4,
        backgroundBlur: 3,
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
