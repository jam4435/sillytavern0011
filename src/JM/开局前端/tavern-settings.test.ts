import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHardIdentityRouteSettings } from './tavern-settings';

type TestWorldbookEntry = Pick<WorldbookEntry, 'name' | 'enabled'>;

let worldbook: TestWorldbookEntry[] = [];

const insertOrAssignVariablesMock = vi.fn((_variables: Record<string, unknown>, _option: VariableOption) => ({}));
const getCharWorldbookNamesMock = vi.fn(() => ({ primary: 'JM帝国', additional: [] }));
const getWorldbookMock = vi.fn(async (_worldbookName: string) => worldbook as WorldbookEntry[]);
const updateWorldbookWithMock = vi.fn(async (_worldbookName: string, updater: WorldbookUpdater) => {
  worldbook = (await updater(worldbook as WorldbookEntry[])) as TestWorldbookEntry[];
  return worldbook as WorldbookEntry[];
});

function getEntry(name: string) {
  return worldbook.find(entry => entry.name === name);
}

describe('高难身份路线同步', () => {
  beforeEach(() => {
    worldbook = [
      { name: 'cot', enabled: false },
      { name: '高难身份路线', enabled: false },
      { name: '输出提示词', enabled: false },
    ];
    vi.clearAllMocks();
    Object.assign(globalThis, {
      insertOrAssignVariables: insertOrAssignVariablesMock,
      getCharWorldbookNames: getCharWorldbookNamesMock,
      getWorldbook: getWorldbookMock,
      updateWorldbookWith: updateWorldbookWithMock,
    });
  });

  it('启用任一高难路线时写入路线变量并打开 cot 与高难身份路线条目', async () => {
    const report = await applyHardIdentityRouteSettings('imperial_male_elite');

    expect(insertOrAssignVariablesMock).toHaveBeenCalledWith(
      { hardIdentityRoute: 'imperial_male_elite' },
      { type: 'chat' },
    );
    expect(getEntry('cot')?.enabled).toBe(true);
    expect(getEntry('高难身份路线')?.enabled).toBe(true);
    expect(getEntry('输出提示词')?.enabled).toBe(false);
    expect(updateWorldbookWithMock).toHaveBeenCalledTimes(1);
    expect(report.scopes[1]).toMatchObject({
      scope: '高难路线世界书条目',
      changedItems: ['JM帝国 / cot -> 开启', 'JM帝国 / 高难身份路线 -> 开启'],
      missingLabels: [],
    });
    expect(report.hasChanges).toBe(true);
  });

  it('点击不启用路线时写入 none 并关闭 cot 与高难身份路线条目', async () => {
    worldbook = [
      { name: 'cot', enabled: true },
      { name: '高难身份路线', enabled: true },
      { name: '输出提示词', enabled: true },
    ];

    const report = await applyHardIdentityRouteSettings('none');

    expect(insertOrAssignVariablesMock).toHaveBeenCalledWith({ hardIdentityRoute: 'none' }, { type: 'chat' });
    expect(getEntry('cot')?.enabled).toBe(false);
    expect(getEntry('高难身份路线')?.enabled).toBe(false);
    expect(getEntry('输出提示词')?.enabled).toBe(true);
    expect(updateWorldbookWithMock).toHaveBeenCalledTimes(1);
    expect(report.scopes[1]).toMatchObject({
      scope: '高难路线世界书条目',
      changedItems: ['JM帝国 / cot -> 关闭', 'JM帝国 / 高难身份路线 -> 关闭'],
      missingLabels: [],
    });
  });
});
