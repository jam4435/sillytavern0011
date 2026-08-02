import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const getVariablesMock = vi.mocked(globalThis.getVariables);

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
    const fontColorInput = screen
      .getAllByDisplayValue('#2a2118')
      .find(element => (element as HTMLInputElement).type === 'text');

    expect(fontColorInput).toBeTruthy();

    fireEvent.change(fontColorInput as HTMLInputElement, { target: { value: '#112233' } });

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

  it('updates only the extra-variable readonly context round count', () => {
    const settings = createDefaultDisplaySettings();
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('button', { name: /额外模型/ }));
    fireEvent.change(screen.getByLabelText('只读上下文轮数'), { target: { value: '2' } });

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        variableContextRounds: 2,
      },
    });
  });

  it('loads the precise body cleaning rules in the extra-variable settings group', () => {
    const settings = createDefaultDisplaySettings();
    const onSettingsChange = renderSettingsPanel(settings);

    fireEvent.click(screen.getByRole('button', { name: /额外模型/ }));
    expect(screen.getByLabelText('忽略的附属标签')).toHaveValue('tucao\ncurrent_event\nprogress');
    expect(screen.getByLabelText('正文开始边界')).toHaveValue('</konatan_planning~>');

    fireEvent.change(screen.getByLabelText('忽略的附属标签'), { target: { value: 'aside\nmetadata' } });
    expect(onSettingsChange).toHaveBeenCalledWith({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        variablePromptExcludedTags: 'aside\nmetadata',
      },
    });
  });
});

describe('SettingsPanel variable groups', () => {
  beforeEach(() => {
    getVariablesMock.mockReset();
    getVariablesMock.mockReturnValue({
      stat_data: {
        世界信息: { 时间: '1220年1月1日10时' },
        附近传闻: { 城外异动: '可见传闻' },
        后续事件线索: { 射雕第7回: '可见线索' },
        事件系统: { 进行中事件: {} },
        参与事件: { 射雕第6回: { 结局: '已完成' } },
        user数据: { 姓名: '墨逸', 位置: '大宋/临安府/临安城' },
        角色数据: { 黄蓉: { 位置: '大宋/临安府/临安城' } },
        前端变量: { 隐藏标记: '不可搜索' },
        后续事件线索计数: { 隐藏计数: 3 },
        世界事件: { 隐藏历史: '不可搜索' },
      },
    });
  });

  const openVariableTab = async () => {
    renderSettingsPanel(createDefaultDisplaySettings());
    fireEvent.click(screen.getByRole('button', { name: '变量' }));
    return screen.findByRole('tablist', { name: '变量类别' });
  };

  it('shows semantic groups and renders every real root of the selected group in the tree', async () => {
    await openVariableTab();

    const groupTabs = within(screen.getByRole('tablist', { name: '变量类别' }));
    const variableTree = within(screen.getByLabelText('变量浏览'));
    expect(groupTabs.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['世界', '事件', '玩家', '人物']);
    expect(groupTabs.getByRole('tab', { name: '世界' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tablist', { name: /变量分区/ })).not.toBeInTheDocument();
    expect(variableTree.getByTitle('世界信息')).toBeInTheDocument();
    expect(variableTree.getByTitle('附近传闻')).toBeInTheDocument();
    expect(variableTree.getByTitle('后续事件线索')).toBeInTheDocument();

    fireEvent.click(groupTabs.getByRole('tab', { name: '事件' }));

    expect(variableTree.getByTitle('事件系统')).toBeInTheDocument();
    expect(variableTree.getByTitle('参与事件')).toBeInTheDocument();
    expect(variableTree.queryByTitle('世界信息')).not.toBeInTheDocument();

    fireEvent.click(groupTabs.getByRole('tab', { name: '人物' }));

    expect(screen.queryByRole('tab', { name: '角色数据' })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('人物列表')).getByRole('button', { name: /黄蓉/ })).toBeInTheDocument();
  });

  it('searches across every real root in the current category', async () => {
    await openVariableTab();

    const searchInput = screen.getByLabelText('当前类别搜索');
    const variableTree = within(screen.getByLabelText('变量浏览'));

    fireEvent.change(searchInput, { target: { value: '城外异动' } });
    expect(variableTree.getByTitle('附近传闻')).toBeInTheDocument();
    expect(variableTree.getAllByTitle('城外异动')).not.toHaveLength(0);
    expect(variableTree.queryByTitle('世界信息')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '射雕第7回' } });
    expect(variableTree.getByTitle('后续事件线索')).toBeInTheDocument();
    expect(variableTree.getAllByTitle('射雕第7回')).not.toHaveLength(0);
  });

  it('never exposes system-only roots in navigation, tree, or global search', async () => {
    await openVariableTab();

    expect(screen.queryByRole('tab', { name: '前端变量' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '后续事件线索计数' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '世界事件' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '全局路径' }));
    const searchInput = screen.getByLabelText('全局搜索');

    for (const hiddenRoot of ['前端变量', '后续事件线索计数', '世界事件']) {
      fireEvent.change(searchInput, { target: { value: hiddenRoot } });
      expect(screen.getByText('没有命中的变量路径')).toBeInTheDocument();
    }

    fireEvent.change(searchInput, { target: { value: '射雕第7回' } });
    expect(screen.getByRole('button', { name: /stat_data › 后续事件线索 › 射雕第7回/ })).toBeInTheDocument();
  });

  it('falls back by fixed group order when roots are missing', async () => {
    getVariablesMock.mockReturnValue({
      stat_data: {
        事件系统: { 已完成事件: {} },
        user数据: { 姓名: '墨逸' },
        前端变量: { 隐藏标记: true },
      },
    });

    await openVariableTab();

    expect(screen.getByRole('tab', { name: '事件' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '世界' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: '人物' })).toBeDisabled();
    expect(within(screen.getByLabelText('变量浏览')).getByTitle('事件系统')).toBeInTheDocument();
    expect(within(screen.getByLabelText('变量浏览')).queryByTitle('参与事件')).not.toBeInTheDocument();
  });

  it('keeps the real stat_data path when selecting an editable leaf', async () => {
    await openVariableTab();

    fireEvent.click(screen.getByRole('tab', { name: '玩家' }));
    fireEvent.click(screen.getByTitle('姓名'));

    expect(screen.getByTitle('stat_data.user数据.姓名')).toHaveTextContent('stat_data › user数据 › 姓名');
    expect(screen.getByLabelText('值')).toHaveValue('墨逸');
  });
});
