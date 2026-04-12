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

type ScriptPatchResult = {
  trees: ScriptTree[];
  matchedKeys: Set<string>;
  hasEnabledManagedDescendant: boolean;
};

const CHARACTER_REGEX_OPTION = { type: 'character', name: 'current' } as const;
const CHARACTER_SCRIPT_OPTION = { type: 'character' } as const;

const REGEX_RULES: NamedRule[] = [
  { key: 'variableStatusBar', label: '变量状态栏', query: '变量状态栏', mode: 'exact' },
  { key: 'openingInfoReplace', label: '开局信息替换', query: '开局信息替换', mode: 'exact' },
  { key: 'hideOne', label: '隐藏', query: '隐藏', mode: 'exact' },
  { key: 'hideTwo', label: '隐藏2', query: '隐藏2', mode: 'exact' },
  { key: 'imageStatusBar', label: '图片状态栏', query: '图片状态栏', mode: 'exact' },
  { key: 'textStatusBar', label: '无图片状态栏', query: '无图片状态栏', mode: 'exact' },
  { key: 'optionsRegex', label: '选项正则', query: '选项正则', mode: 'exact' },
];

const SCRIPT_RULES: NamedRule[] = [
  { key: 'eraVariableFramework', label: 'ERA变量框架1.4.11', query: 'ERA变量框架1.4.11', mode: 'includes' },
];

const WORLDBOOK_ENTRY_RULES: NamedRule[] = [
  { key: 'variableGuide', label: '变量指导', query: '变量指导', mode: 'includes' },
  { key: 'outputPrompt', label: '输出提示词', query: '输出提示词', mode: 'includes' },
  { key: 'multiStatusBar', label: '多状态栏', query: '多状态栏', mode: 'includes' },
  { key: 'actionSuggestion', label: '行动建议', query: '行动建议', mode: 'includes' },
];

export async function applyGenerationSettings(settings: GenerationSettings) {
  const api = getRuntimeApi();

  await applyCharacterRegexSettings(api, settings);
  await applyCharacterScriptSettings(api, settings);
  await applyCharacterWorldbookSettings(api, settings);
}

function getRuntimeApi(): RuntimeApi {
  const getCharWorldbookNamesApi =
    typeof getCharWorldbookNames === 'function' ? getCharWorldbookNames : undefined;
  const getScriptTreesApi = typeof getScriptTrees === 'function' ? getScriptTrees : undefined;
  const getWorldbookApi = typeof getWorldbook === 'function' ? getWorldbook : undefined;
  const updateScriptTreesWithApi =
    typeof updateScriptTreesWith === 'function' ? updateScriptTreesWith : undefined;
  const updateTavernRegexesWithApi =
    typeof updateTavernRegexesWith === 'function' ? updateTavernRegexesWith : undefined;
  const updateWorldbookWithApi =
    typeof updateWorldbookWith === 'function' ? updateWorldbookWith : undefined;

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

async function applyCharacterRegexSettings(api: RuntimeApi, settings: GenerationSettings) {
  const desiredState = new Map<string, boolean>([
    ['variableStatusBar', settings.enableVariables],
    ['openingInfoReplace', settings.enableVariables],
    ['hideOne', settings.enableVariables],
    ['hideTwo', settings.enableVariables],
    ['imageStatusBar', !settings.enableVariables && !settings.useTextStatusBar],
    ['textStatusBar', !settings.enableVariables && settings.useTextStatusBar],
    ['optionsRegex', settings.generateOptions],
  ]);
  const matchedKeys = new Set<string>();

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

        return {
          ...regex,
          enabled: nextEnabled,
        };
      }),
    CHARACTER_REGEX_OPTION,
  );

  logMissingRules('局部正则', REGEX_RULES, matchedKeys, getRelevantRegexKeys(settings));
}

async function applyCharacterScriptSettings(api: RuntimeApi, settings: GenerationSettings) {
  const desiredState = new Map<string, boolean>([['eraVariableFramework', settings.enableVariables]]);
  const patchResult = patchScriptTrees(api.getScriptTrees(CHARACTER_SCRIPT_OPTION), desiredState);

  await api.updateScriptTreesWith(() => patchResult.trees, CHARACTER_SCRIPT_OPTION);
  logMissingRules('局部脚本', SCRIPT_RULES, patchResult.matchedKeys, settings.enableVariables ? ['eraVariableFramework'] : []);
}

async function applyCharacterWorldbookSettings(api: RuntimeApi, settings: GenerationSettings) {
  const charWorldbooks = api.getCharWorldbookNames('current');
  const worldbookNames = uniqueStrings([charWorldbooks.primary || '', ...(charWorldbooks.additional || [])]);
  if (worldbookNames.length === 0) {
    return;
  }

  const desiredState = new Map<string, boolean>([
    ['variableGuide', settings.enableVariables],
    ['outputPrompt', settings.enableVariables],
    ['multiStatusBar', !settings.enableVariables],
    ['actionSuggestion', settings.generateOptions],
  ]);
  const matchedKeys = new Set<string>();

  for (const worldbookName of worldbookNames) {
    const worldbook = await api.getWorldbook(worldbookName);
    let changed = false;

    const nextWorldbook = worldbook.map(entry => {
      const matchedRule = findMatchedRule(entry.name, WORLDBOOK_ENTRY_RULES);
      if (!matchedRule) {
        return entry;
      }

      matchedKeys.add(matchedRule.key);
      const nextEnabled = desiredState.get(matchedRule.key);
      if (typeof nextEnabled !== 'boolean' || entry.enabled === nextEnabled) {
        return entry;
      }

      changed = true;
      return {
        ...entry,
        enabled: nextEnabled,
      };
    });

    if (!changed) {
      continue;
    }

    await api.updateWorldbookWith(worldbookName, () => nextWorldbook);
  }

  logMissingRules('当前角色世界书条目', WORLDBOOK_ENTRY_RULES, matchedKeys, getRelevantWorldbookKeys(settings));
}

function patchScriptTrees(scriptTrees: ScriptTree[], desiredState: Map<string, boolean>): ScriptPatchResult {
  const matchedKeys = new Set<string>();
  let hasEnabledManagedDescendant = false;

  const trees = scriptTrees.map(tree => {
    if (tree.type === 'folder') {
      const childResult = patchScriptTrees(tree.scripts as unknown as ScriptTree[], desiredState);
      const childScripts = tree.scripts as unknown as ScriptTree[];
      const childChanged = childResult.trees.some((child, index) => child !== childScripts[index]);
      childResult.matchedKeys.forEach(key => matchedKeys.add(key));

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

    return {
      ...tree,
      enabled: nextEnabled,
    };
  });

  return {
    trees,
    matchedKeys,
    hasEnabledManagedDescendant,
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

function logMissingRules(scope: string, rules: NamedRule[], matchedKeys: Set<string>, relevantKeys: string[]) {
  const relevantKeySet = new Set(relevantKeys);
  const missingLabels = rules
    .filter(rule => relevantKeySet.has(rule.key) && !matchedKeys.has(rule.key))
    .map(rule => rule.label);
  if (missingLabels.length === 0) {
    return;
  }

  console.warn(`[开局前端] ${scope}未找到以下资源: ${missingLabels.join('、')}`);
}

function getRelevantRegexKeys(settings: GenerationSettings) {
  const keys = settings.enableVariables
    ? ['variableStatusBar', 'openingInfoReplace', 'hideOne', 'hideTwo']
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
