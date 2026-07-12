import { HARD_IDENTITY_ROUTE_DEFAULT, normalizeHardIdentityRoute, type HardIdentityRouteKey } from './hard-routes';
import type { GenerationSettings } from './types';

type MatchMode = 'exact' | 'includes';

type NamedRule = {
  key: string;
  label: string;
  query: string;
  mode: MatchMode;
};

type RuntimeApi = {
  getCharWorldbookNames: typeof getCharWorldbookNames;
  getScriptTrees: typeof getScriptTrees;
  getWorldbook: typeof getWorldbook;
  updateScriptTreesWith: typeof updateScriptTreesWith;
  updateTavernRegexesWith: typeof updateTavernRegexesWith;
  updateWorldbookWith: typeof updateWorldbookWith;
};

type WorldbookRuntimeApi = Pick<RuntimeApi, 'getCharWorldbookNames' | 'getWorldbook' | 'updateWorldbookWith'>;

type ScriptPatchResult = {
  trees: ScriptTree[];
  matchedKeys: Set<string>;
  hasEnabledManagedDescendant: boolean;
  changedItems: string[];
};

export type GenerationSettingsSyncScopeReport = {
  scope: string;
  changedItems: string[];
  missingLabels: string[];
};

export type GenerationSettingsSyncReport = {
  scopes: GenerationSettingsSyncScopeReport[];
  hasChanges: boolean;
  hasMissing: boolean;
};

const CHARACTER_REGEX_OPTION = { type: 'character', name: 'current' } as const;
const CHARACTER_SCRIPT_OPTION = { type: 'character' } as const;

const REGEX_RULES: NamedRule[] = [
  { key: 'variableStatusBar', label: '变量状态栏', query: '变量状态栏', mode: 'exact' },
  { key: 'hideOne', label: '隐藏', query: '隐藏', mode: 'exact' },
  { key: 'hideTwo', label: '隐藏2', query: '隐藏2', mode: 'exact' },
  { key: 'imageStatusBar', label: '图片状态栏', query: '图片状态栏', mode: 'exact' },
  { key: 'textStatusBar', label: '无图片状态栏', query: '无图片状态栏', mode: 'exact' },
  { key: 'optionsRegex', label: '选项', query: '选项', mode: 'exact' },
];

const SCRIPT_RULES: NamedRule[] = [
  { key: 'eraVariableFramework', label: 'ERA变量框架-1.0.5', query: 'ERA变量框架-1.0.5', mode: 'includes' },
];

const WORLDBOOK_ENTRY_RULES: NamedRule[] = [
  { key: 'variableGuide', label: '变量指导', query: '变量指导', mode: 'includes' },
  { key: 'outputPrompt', label: '输出提示词', query: '输出提示词', mode: 'includes' },
  { key: 'multiStatusBar', label: '多状态栏', query: '多状态栏', mode: 'exact' },
  { key: 'actionSuggestion', label: '行动建议', query: '行动建议', mode: 'includes' },
];

const HARD_IDENTITY_ROUTE_WORLDBOOK_ENTRY_RULES: NamedRule[] = [
  { key: 'cot', label: 'cot', query: 'cot', mode: 'exact' },
  { key: 'hardIdentityRoute', label: '高难身份路线', query: '高难身份路线', mode: 'exact' },
];

export async function applyGenerationSettings(settings: GenerationSettings): Promise<GenerationSettingsSyncReport> {
  const api = getRuntimeApi();

  const scopes = [
    await applyCharacterRegexSettings(api, settings),
    await applyCharacterScriptSettings(api, settings),
    await applyCharacterWorldbookSettings(api, settings),
  ];

  return {
    scopes,
    hasChanges: scopes.some(scope => scope.changedItems.length > 0),
    hasMissing: scopes.some(scope => scope.missingLabels.length > 0),
  };
}

export async function applyHardIdentityRouteSettings(
  route: HardIdentityRouteKey,
): Promise<GenerationSettingsSyncReport> {
  const hardIdentityRoute = normalizeHardIdentityRoute(route);
  const scopes = [
    await applyHardIdentityRouteVariable(hardIdentityRoute),
    await applyCharacterHardIdentityRouteWorldbookSettings(getWorldbookRuntimeApi(), hardIdentityRoute),
  ];

  return createSyncReport(scopes);
}

function getRuntimeApi(): RuntimeApi {
  const getCharWorldbookNamesApi = typeof getCharWorldbookNames === 'function' ? getCharWorldbookNames : undefined;
  const getScriptTreesApi = typeof getScriptTrees === 'function' ? getScriptTrees : undefined;
  const getWorldbookApi = typeof getWorldbook === 'function' ? getWorldbook : undefined;
  const updateScriptTreesWithApi = typeof updateScriptTreesWith === 'function' ? updateScriptTreesWith : undefined;
  const updateTavernRegexesWithApi =
    typeof updateTavernRegexesWith === 'function' ? updateTavernRegexesWith : undefined;
  const updateWorldbookWithApi = typeof updateWorldbookWith === 'function' ? updateWorldbookWith : undefined;

  if (!getCharWorldbookNamesApi) {
    throw Error('缺少酒馆助手接口: getCharWorldbookNames');
  }
  if (!getScriptTreesApi) {
    throw Error('缺少酒馆助手接口: getScriptTrees');
  }
  if (!getWorldbookApi) {
    throw Error('缺少酒馆助手接口: getWorldbook');
  }
  if (!updateScriptTreesWithApi) {
    throw Error('缺少酒馆助手接口: updateScriptTreesWith');
  }
  if (!updateTavernRegexesWithApi) {
    throw Error('缺少酒馆助手接口: updateTavernRegexesWith');
  }
  if (!updateWorldbookWithApi) {
    throw Error('缺少酒馆助手接口: updateWorldbookWith');
  }

  return {
    getCharWorldbookNames: getCharWorldbookNamesApi,
    getScriptTrees: getScriptTreesApi,
    getWorldbook: getWorldbookApi,
    updateScriptTreesWith: updateScriptTreesWithApi,
    updateTavernRegexesWith: updateTavernRegexesWithApi,
    updateWorldbookWith: updateWorldbookWithApi,
  };
}

function getWorldbookRuntimeApi(): WorldbookRuntimeApi {
  const getCharWorldbookNamesApi = typeof getCharWorldbookNames === 'function' ? getCharWorldbookNames : undefined;
  const getWorldbookApi = typeof getWorldbook === 'function' ? getWorldbook : undefined;
  const updateWorldbookWithApi = typeof updateWorldbookWith === 'function' ? updateWorldbookWith : undefined;

  if (!getCharWorldbookNamesApi) {
    throw Error('缺少酒馆助手接口: getCharWorldbookNames');
  }
  if (!getWorldbookApi) {
    throw Error('缺少酒馆助手接口: getWorldbook');
  }
  if (!updateWorldbookWithApi) {
    throw Error('缺少酒馆助手接口: updateWorldbookWith');
  }

  return {
    getCharWorldbookNames: getCharWorldbookNamesApi,
    getWorldbook: getWorldbookApi,
    updateWorldbookWith: updateWorldbookWithApi,
  };
}

function createSyncReport(scopes: GenerationSettingsSyncScopeReport[]): GenerationSettingsSyncReport {
  return {
    scopes,
    hasChanges: scopes.some(scope => scope.changedItems.length > 0),
    hasMissing: scopes.some(scope => scope.missingLabels.length > 0),
  };
}

async function applyHardIdentityRouteVariable(
  hardIdentityRoute: HardIdentityRouteKey,
): Promise<GenerationSettingsSyncScopeReport> {
  if (typeof insertOrAssignVariables !== 'function') {
    throw Error('缺少酒馆助手接口: insertOrAssignVariables');
  }

  await insertOrAssignVariables({ hardIdentityRoute }, { type: 'chat' });
  return {
    scope: 'chat变量',
    changedItems: [`hardIdentityRoute -> ${hardIdentityRoute}`],
    missingLabels: [],
  };
}

async function applyCharacterRegexSettings(api: RuntimeApi, settings: GenerationSettings) {
  const scope = '局部正则';
  const desiredState = new Map<string, boolean>([
    ['variableStatusBar', settings.enableVariables],
    ['hideOne', settings.enableVariables],
    ['hideTwo', settings.enableVariables],
    ['imageStatusBar', !settings.enableVariables && !settings.useTextStatusBar],
    ['textStatusBar', !settings.enableVariables && settings.useTextStatusBar],
    ['optionsRegex', settings.generateOptions],
  ]);
  const matchedKeys = new Set<string>();
  const changedItems: string[] = [];

  await api.updateTavernRegexesWith(
    regexes =>
      regexes.map(regex => {
        const matchedRule = findMatchedRule(regex.script_name, REGEX_RULES);
        if (!matchedRule) {
          return regex;
        }

        matchedKeys.add(matchedRule.key);
        const nextEnabled = desiredState.get(matchedRule.key);
        if (typeof nextEnabled !== 'boolean' || regex.enabled === nextEnabled) {
          return regex;
        }

        changedItems.push(`${regex.script_name} -> ${nextEnabled ? '开启' : '关闭'}`);
        return {
          ...regex,
          enabled: nextEnabled,
        };
      }),
    CHARACTER_REGEX_OPTION,
  );

  return {
    scope,
    changedItems,
    missingLabels: getMissingLabels(REGEX_RULES, matchedKeys, getRelevantRegexKeys(settings)),
  };
}

async function applyCharacterScriptSettings(api: RuntimeApi, settings: GenerationSettings) {
  const scope = '局部脚本';
  const desiredState = new Map<string, boolean>([['eraVariableFramework', settings.enableVariables]]);
  const patchResult = patchScriptTrees(api.getScriptTrees(CHARACTER_SCRIPT_OPTION), desiredState);

  await api.updateScriptTreesWith(() => patchResult.trees, CHARACTER_SCRIPT_OPTION);
  return {
    scope,
    changedItems: patchResult.changedItems,
    missingLabels: getMissingLabels(
      SCRIPT_RULES,
      patchResult.matchedKeys,
      settings.enableVariables ? ['eraVariableFramework'] : [],
    ),
  };
}

async function applyCharacterWorldbookSettings(api: RuntimeApi, settings: GenerationSettings) {
  const desiredState = new Map<string, boolean>([
    ['variableGuide', settings.enableVariables],
    ['outputPrompt', settings.enableVariables],
    ['multiStatusBar', !settings.enableVariables],
    ['actionSuggestion', settings.generateOptions],
  ]);

  return applyCharacterWorldbookEntrySettings(
    api,
    '当前角色世界书条目',
    WORLDBOOK_ENTRY_RULES,
    desiredState,
    getRelevantWorldbookKeys(settings),
  );
}

async function applyCharacterHardIdentityRouteWorldbookSettings(
  api: WorldbookRuntimeApi,
  hardIdentityRoute: HardIdentityRouteKey,
) {
  const enabled = hardIdentityRoute !== HARD_IDENTITY_ROUTE_DEFAULT;
  const desiredState = new Map<string, boolean>([
    ['cot', enabled],
    ['hardIdentityRoute', enabled],
  ]);

  return applyCharacterWorldbookEntrySettings(
    api,
    '高难路线世界书条目',
    HARD_IDENTITY_ROUTE_WORLDBOOK_ENTRY_RULES,
    desiredState,
    ['cot', 'hardIdentityRoute'],
  );
}

async function applyCharacterWorldbookEntrySettings(
  api: WorldbookRuntimeApi,
  scope: string,
  rules: NamedRule[],
  desiredState: Map<string, boolean>,
  relevantKeys: string[],
) {
  const charWorldbooks = api.getCharWorldbookNames('current');
  const worldbookNames = uniqueStrings([charWorldbooks.primary || '', ...(charWorldbooks.additional || [])]);
  if (worldbookNames.length === 0) {
    return {
      scope,
      changedItems: [],
      missingLabels: [],
    };
  }

  const matchedKeys = new Set<string>();
  const changedItems: string[] = [];

  for (const worldbookName of worldbookNames) {
    const worldbook = await api.getWorldbook(worldbookName);
    const nextWorldbook = patchWorldbookEntries(
      worldbook,
      worldbookName,
      rules,
      desiredState,
      matchedKeys,
      changedItems,
    );
    if (nextWorldbook !== worldbook) {
      await api.updateWorldbookWith(worldbookName, () => nextWorldbook);
    }
  }

  return {
    scope,
    changedItems,
    missingLabels: getMissingLabels(rules, matchedKeys, relevantKeys),
  };
}

function patchWorldbookEntries(
  worldbook: WorldbookEntry[],
  worldbookName: string,
  rules: NamedRule[],
  desiredState: Map<string, boolean>,
  matchedKeys: Set<string>,
  changedItems: string[],
) {
  let changed = false;

  const nextWorldbook = worldbook.map(entry => {
    const matchedRule = findMatchedRule(entry.name, rules);
    if (!matchedRule) {
      return entry;
    }

    matchedKeys.add(matchedRule.key);
    const nextEnabled = desiredState.get(matchedRule.key);
    if (typeof nextEnabled !== 'boolean' || entry.enabled === nextEnabled) {
      return entry;
    }

    changed = true;
    changedItems.push(`${worldbookName} / ${entry.name} -> ${nextEnabled ? '开启' : '关闭'}`);
    return {
      ...entry,
      enabled: nextEnabled,
    };
  });

  return changed ? nextWorldbook : worldbook;
}

function patchScriptTrees(scriptTrees: ScriptTree[], desiredState: Map<string, boolean>): ScriptPatchResult {
  const matchedKeys = new Set<string>();
  let hasEnabledManagedDescendant = false;
  const changedItems: string[] = [];

  const trees = scriptTrees.map(tree => {
    if (tree.type === 'folder') {
      const childResult = patchScriptTrees(tree.scripts as unknown as ScriptTree[], desiredState);
      const childScripts = tree.scripts as unknown as ScriptTree[];
      const childChanged = childResult.trees.some((child, index) => child !== childScripts[index]);
      childResult.matchedKeys.forEach(key => matchedKeys.add(key));
      changedItems.push(...childResult.changedItems);

      if (childResult.hasEnabledManagedDescendant) {
        hasEnabledManagedDescendant = true;
      }

      const nextEnabled = childResult.hasEnabledManagedDescendant ? true : tree.enabled;
      if (nextEnabled === tree.enabled && !childChanged) {
        return tree;
      }

      return {
        ...tree,
        enabled: nextEnabled,
        scripts: childResult.trees as Script[],
      };
    }

    const matchedRule = findMatchedRule(tree.name, SCRIPT_RULES);
    if (!matchedRule) {
      return tree;
    }

    matchedKeys.add(matchedRule.key);
    const nextEnabled = desiredState.get(matchedRule.key);
    if (nextEnabled) {
      hasEnabledManagedDescendant = true;
    }

    if (typeof nextEnabled !== 'boolean' || tree.enabled === nextEnabled) {
      return tree;
    }

    changedItems.push(`${tree.name} -> ${nextEnabled ? '开启' : '关闭'}`);

    return {
      ...tree,
      enabled: nextEnabled,
    };
  });

  return {
    trees,
    matchedKeys,
    hasEnabledManagedDescendant,
    changedItems,
  };
}

function findMatchedRule(name: string, rules: NamedRule[]) {
  return rules.find(rule => isNameMatched(name, rule));
}

function isNameMatched(name: string, rule: NamedRule) {
  const normalizedName = normalizeName(name);
  const normalizedQuery = normalizeName(rule.query);
  if (!normalizedName || !normalizedQuery) {
    return false;
  }

  if (rule.mode === 'exact') {
    return normalizedName === normalizedQuery;
  }

  return normalizedName.includes(normalizedQuery);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function getMissingLabels(rules: NamedRule[], matchedKeys: Set<string>, relevantKeys: string[]) {
  const relevantKeySet = new Set(relevantKeys);
  return rules.filter(rule => relevantKeySet.has(rule.key) && !matchedKeys.has(rule.key)).map(rule => rule.label);
}

function getRelevantRegexKeys(settings: GenerationSettings) {
  const keys = settings.enableVariables
    ? ['variableStatusBar', 'hideOne', 'hideTwo']
    : [settings.useTextStatusBar ? 'textStatusBar' : 'imageStatusBar'];

  if (settings.generateOptions) {
    keys.push('optionsRegex');
  }

  return keys;
}

function getRelevantWorldbookKeys(settings: GenerationSettings) {
  const keys = settings.enableVariables ? ['variableGuide', 'outputPrompt'] : ['multiStatusBar'];
  if (settings.generateOptions) {
    keys.push('actionSuggestion');
  }

  return keys;
}
