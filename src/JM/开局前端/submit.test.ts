import _ from 'lodash';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitSelections } from './submit';
import { applyGenerationSettings } from './tavern-settings';
import type { SelectionState } from './types';

vi.mock('./tavern-settings', () => ({
  applyGenerationSettings: vi.fn(async () => ({
    scopes: [],
    hasChanges: false,
    hasMissing: false,
  })),
}));

const baseSettings = {
  enableVariables: true,
  useTextStatusBar: false,
  generateOptions: true,
};

const insertOrAssignVariablesMock = vi.fn(async () => undefined);
const triggerSlashMock = vi.fn();

function createSelections(overrides: Partial<SelectionState> = {}): SelectionState {
  return {
    gender: '男',
    status: '四级觉醒者 (帝国精英)',
    profession: '帝国军官',
    settings: { ...baseSettings },
    ...overrides,
  };
}

function resetRuntimeMocks() {
  document.body.innerHTML = '<div class="generator-container"></div>';
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.assign(globalThis, {
    _: _,
    insertOrAssignVariables: insertOrAssignVariablesMock,
    triggerSlash: triggerSlashMock,
  });
}

describe('开局前端提交', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeMocks();
  });

  it('默认写入关闭的高难身份路线变量', async () => {
    await submitSelections(createSelections());

    expect(applyGenerationSettings).toHaveBeenCalledWith(baseSettings);
    expect(insertOrAssignVariablesMock).toHaveBeenCalledWith(
      { gender: 'man', hardIdentityRoute: 'none' },
      { type: 'chat' },
    );
    expect(triggerSlashMock).toHaveBeenCalledWith(expect.stringContaining('/send 创建角色：性别男'));
  });

  it('会写入选择的高难身份路线变量', async () => {
    await submitSelections(createSelections({ hardIdentityRoute: 'imperial_male_elite' }));

    expect(insertOrAssignVariablesMock).toHaveBeenCalledWith(
      { gender: 'man', hardIdentityRoute: 'imperial_male_elite' },
      { type: 'chat' },
    );
  });

  it('发送身体改造时包含数据里的改造详情', async () => {
    await submitSelections(createSelections({ modification: ['神经强化改造'] }));

    expect(triggerSlashMock).toHaveBeenCalledWith(
      expect.stringContaining('神经强化改造：改造神经系统，加快反应速度。'),
    );
  });

  it('高难身份路线和性别明显冲突时不产生提交副作用', async () => {
    await submitSelections(createSelections({ gender: '女', hardIdentityRoute: 'imperial_male_elite' }));

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('只适用于男性开局'));
    expect(applyGenerationSettings).not.toHaveBeenCalled();
    expect(insertOrAssignVariablesMock).not.toHaveBeenCalled();
    expect(triggerSlashMock).not.toHaveBeenCalled();
  });
});
