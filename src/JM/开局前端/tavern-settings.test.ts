import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGenerationSettings, applyHardIdentityRouteSettings } from './tavern-settings';

type TestWorldbookEntry = Pick<WorldbookEntry, 'name' | 'enabled'>;

let worldbook: TestWorldbookEntry[] = [];
let scriptTrees: ScriptTree[] = [];
let regexes: Pick<TavernRegex, 'script_name' | 'enabled'>[] = [];

const insertOrAssignVariablesMock = vi.fn((_variables: Record<string, unknown>, _option: VariableOption) => ({}));
const getCharWorldbookNamesMock = vi.fn(() => ({ primary: 'JM帝国', additional: [] }));
const getWorldbookMock = vi.fn(async (_worldbookName: string) => worldbook as WorldbookEntry[]);
const updateWorldbookWithMock = vi.fn(async (_worldbookName: string, updater: WorldbookUpdater) => {
  worldbook = (await updater(worldbook as WorldbookEntry[])) as TestWorldbookEntry[];
  return worldbook as WorldbookEntry[];
});
const getScriptTreesMock = vi.fn((_option: ScriptTreesOptions) => scriptTrees);
const getTavernRegexesMock = vi.fn((_option: TavernRegexOption) => regexes as TavernRegex[]);
const updateScriptTreesWithMock = vi.fn(async (updater: (trees: ScriptTree[]) => ScriptTree[]) => {
  scriptTrees = await updater(scriptTrees);
  return scriptTrees;
});
const updateTavernRegexesWithMock = vi.fn(async (updater: TavernRegexUpdater) => {
  regexes = (await updater(regexes as TavernRegex[])) as Pick<TavernRegex, 'script_name' | 'enabled'>[];
  return regexes as TavernRegex[];
});

function getEntry(name: string) {
  return worldbook.find(entry => entry.name === name);
}

function createScript(name: string, enabled: boolean): Script {
  return {
    type: 'script',
    enabled,
    name,
    id: name,
    content: '',
    info: '',
    button: {
      enabled: false,
      buttons: [],
    },
    data: {},
    export_with: {
      data: true,
      button: true,
    },
  };
}

function findScript(name: string) {
  const result: Script[] = [];
  const walk = (nodes: ScriptTree[]) => {
    nodes.forEach(node => {
      if (node.type === 'folder') {
        walk(node.scripts);
        return;
      }

      result.push(node);
    });
  };
  walk(scriptTrees);
  return result.find(script => script.name === name);
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

describe('开局设置同步', () => {
  beforeEach(() => {
    worldbook = [];
    regexes = [];
    scriptTrees = [
      {
        type: 'folder',
        enabled: false,
        name: '变量脚本',
        id: 'variables',
        icon: '',
        color: '',
        scripts: [createScript('ERA变量框架-1.0.5', false), createScript('ERA变量框架1.4.11', false)],
      },
    ];
    vi.clearAllMocks();
    Object.assign(globalThis, {
      getCharWorldbookNames: vi.fn(() => ({ primary: null, additional: [] })),
      getScriptTrees: getScriptTreesMock,
      getTavernRegexes: getTavernRegexesMock,
      getWorldbook: getWorldbookMock,
      updateScriptTreesWith: updateScriptTreesWithMock,
      updateTavernRegexesWith: updateTavernRegexesWithMock,
      updateWorldbookWith: updateWorldbookWithMock,
    });
  });

  it('变量设置只开关 ERA变量框架-1.0.5，不再影响 1.4.11', async () => {
    const report = await applyGenerationSettings({
      enableVariables: true,
      useTextStatusBar: false,
      generateOptions: true,
    });

    expect(findScript('ERA变量框架-1.0.5')?.enabled).toBe(true);
    expect(findScript('ERA变量框架1.4.11')?.enabled).toBe(false);
    expect(report.scopes[1]).toMatchObject({
      scope: '局部脚本',
      changedItems: ['ERA变量框架-1.0.5 -> 开启'],
      missingLabels: [],
    });
  });

  it('正则状态已经符合设置时不调用会重载聊天的更新接口', async () => {
    regexes = [
      { script_name: '变量状态栏', enabled: true },
      { script_name: '隐藏', enabled: true },
      { script_name: '隐藏2', enabled: true },
      { script_name: '图片状态栏', enabled: false },
      { script_name: '无图片状态栏', enabled: false },
      { script_name: '选项', enabled: true },
    ];

    const report = await applyGenerationSettings({
      enableVariables: true,
      useTextStatusBar: false,
      generateOptions: true,
    });

    expect(updateTavernRegexesWithMock).not.toHaveBeenCalled();
    expect(report.scopes[0]).toMatchObject({
      scope: '局部正则',
      changedItems: [],
      missingLabels: [],
    });
  });

  it('按脚本、世界书、正则的顺序更新，并保持报告展示顺序不变', async () => {
    const invocationOrder: string[] = [];
    worldbook = [
      { name: '变量指导', enabled: false },
      { name: '输出提示词', enabled: false },
      { name: '多状态栏', enabled: true },
      { name: '行动建议', enabled: true },
    ];
    regexes = [
      { script_name: '变量状态栏', enabled: false },
      { script_name: '隐藏', enabled: false },
      { script_name: '隐藏2', enabled: false },
      { script_name: '图片状态栏', enabled: true },
      { script_name: '无图片状态栏', enabled: false },
      { script_name: '选项', enabled: true },
    ];
    Object.assign(globalThis, {
      getCharWorldbookNames: getCharWorldbookNamesMock,
    });
    updateScriptTreesWithMock.mockImplementationOnce(async updater => {
      invocationOrder.push('脚本');
      scriptTrees = await updater(scriptTrees);
      return scriptTrees;
    });
    updateWorldbookWithMock.mockImplementationOnce(async (_worldbookName, updater) => {
      invocationOrder.push('世界书');
      worldbook = (await updater(worldbook as WorldbookEntry[])) as TestWorldbookEntry[];
      return worldbook as WorldbookEntry[];
    });
    updateTavernRegexesWithMock.mockImplementationOnce(async updater => {
      invocationOrder.push('正则');
      regexes = (await updater(regexes as TavernRegex[])) as Pick<TavernRegex, 'script_name' | 'enabled'>[];
      return regexes as TavernRegex[];
    });

    const report = await applyGenerationSettings({
      enableVariables: true,
      useTextStatusBar: false,
      generateOptions: true,
    });

    expect(invocationOrder).toEqual(['脚本', '世界书', '正则']);
    expect(report.scopes.map(scope => scope.scope)).toEqual(['局部正则', '局部脚本', '当前角色世界书条目']);
  });
});
