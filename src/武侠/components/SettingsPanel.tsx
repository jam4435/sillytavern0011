import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_SUMMARY_SETTINGS,
  DEFAULT_SUMMARY_TAB_SETTINGS,
  DisplaySettings,
  RegexRule,
  createDefaultRegexSettings,
  SummarySettings,
  SummaryApiConfig,
  SummaryApiProfile,
  SummaryApiSelection,
  SummaryVariableUpdateMode,
  SummaryThresholds,
  DEFAULT_SUMMARY_API_CONFIG,
  createRegexRule,
  getCurrentPresetRegexRules,
  logRegexDebugSnapshot,
  getRegexRuleContentSignature,
  imageToBase64,
  importGlobalTavernRegexes,
  importPresetTavernRegexes,
  scheduleRegexDebugDump,
  setPresetRegexRulesForPreset,
  validateRegex
} from '../utils/settingsManager';
import {
  loadSummaryModelList,
  validateSummaryApiConfig,
} from '../utils/summaryApiClient';
import { applyVariableUpdateModeWorldbookState } from '../utils/extraVariableUpdateManager';
import {
  checkSummaryTrigger,
  triggerManualSummary,
  getIsSummarizing,
  type SummaryTriggerResult,
  type BatchSummaryResult,
} from '../utils/summaryManager';
import { Icons } from './Icons';
import type { AutoAdvanceTurnResult, LatestDebugRound } from '../hooks';
import { uiLogger } from '../utils/logger';

type SettingsTab = 'appearance' | 'regex' | 'summary' | 'variables' | 'advance' | 'debug';
type VariableStatus = 'idle' | 'success' | 'error';
type VariablePath = Array<string | number>;
type AutoAdvanceStatus = 'idle' | 'running' | 'stopping' | 'done' | 'error';
type AutoAdvanceResultStatus = 'running' | 'success' | 'error';
type SettingsCollapsibleId =
  | 'appearanceText'
  | 'appearanceBackground'
  | 'extraModelApi'
  | 'extraModelSummary'
  | 'extraModelVariables';

interface AutoAdvanceResult {
  id: string;
  index: number;
  prompt: string;
  plainText: string;
  rawReply: string;
  userMessageId?: number;
  assistantMessageId?: number;
  variableWriteObserved?: boolean;
  startedAt: Date;
  finishedAt?: Date;
  status: AutoAdvanceResultStatus;
  error?: string;
}

interface SummaryApiProfileDraft {
  name: string;
  apiConfig: SummaryApiConfig;
}

const DEFAULT_AUTO_ADVANCE_PROMPT = '合理地继续推进剧情';
const AUTO_ADVANCE_MAX_COUNT = 50;
const SUMMARY_MODEL_LIST_ID = 'wuxia-summary-model-list';
const API_SELECTION_PRESET_VALUE = 'preset';
const DEFAULT_OPEN_SETTING_BLOCKS: Record<SettingsCollapsibleId, boolean> = {
  appearanceText: true,
  appearanceBackground: true,
  extraModelApi: true,
  extraModelSummary: true,
  extraModelVariables: true,
};
const SUMMARY_API_SOURCES = [
  ['openai', 'OpenAI'],
  ['openrouter', 'OpenRouter'],
  ['claude', 'Claude'],
  ['google', 'Gemini'],
  ['groq', 'Groq'],
  ['mistral', 'Mistral'],
  ['deepseek', 'DeepSeek'],
  ['custom', '自定义（OpenAI兼容）'],
] as const;

const HIDDEN_VARIABLE_KEYS = new Set(['$meta', '$template']);
const ROOT_VARIABLE_PATH_KEY = 'root';

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const createEmptyApiProfileDraft = (): SummaryApiProfileDraft => ({
  name: '',
  apiConfig: { ...DEFAULT_SUMMARY_API_CONFIG },
});

const createApiProfileId = (): string =>
  `summary-api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const cloneApiProfileDraftFromProfile = (profile: SummaryApiProfile): SummaryApiProfileDraft => ({
  name: profile.name,
  apiConfig: { ...profile.apiConfig },
});

const apiSelectionToValue = (selection: SummaryApiSelection): string =>
  selection.type === 'profile' ? `profile:${selection.profileId}` : API_SELECTION_PRESET_VALUE;

const valueToApiSelection = (value: string): SummaryApiSelection =>
  value.startsWith('profile:')
    ? { type: 'profile', profileId: value.slice('profile:'.length) }
    : { type: 'preset' };

const getApiSelectionLabel = (selection: SummaryApiSelection, profiles: SummaryApiProfile[]): string => {
  if (selection.type === 'preset') {
    return '当前预设';
  }
  return profiles.find(profile => profile.id === selection.profileId)?.name || '已删除的 API';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isHiddenVariableKey = (key: string | number): boolean =>
  typeof key === 'string' && HIDDEN_VARIABLE_KEYS.has(key);

const getVariablePathKey = (path: VariablePath): string =>
  path.length === 0 ? ROOT_VARIABLE_PATH_KEY : path.map(segment => String(segment)).join('\u001f');

const areVariablePathsEqual = (lhs: VariablePath | null, rhs: VariablePath): boolean =>
  !!lhs && lhs.length === rhs.length && lhs.every((segment, index) => segment === rhs[index]);

const getValueAtVariablePath = (source: Record<string, unknown>, path: VariablePath): unknown => {
  let cursor: unknown = source;

  for (const segment of path) {
    if (Array.isArray(cursor) && typeof segment === 'number') {
      cursor = cursor[segment];
      continue;
    }

    if (isRecord(cursor)) {
      cursor = cursor[String(segment)];
      continue;
    }

    return undefined;
  }

  return cursor;
};

const getVariableDisplayPath = (path: VariablePath): string =>
  ['stat_data', ...path.map(segment => String(segment))].join(' › ');

const formatCopyPathSegment = (segment: string | number): string => {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)
    ? `.${segment}`
    : `[${JSON.stringify(segment)}]`;
};

const getVariableCopyPath = (path: VariablePath): string =>
  path.reduce((copyPath, segment) => `${copyPath}${formatCopyPathSegment(segment)}`, 'stat_data');

const getVisibleEntries = (value: unknown): Array<[string | number, unknown]> => {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item]);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(([key]) => !isHiddenVariableKey(key));
};

const getVisibleChildCount = (value: unknown): number => getVisibleEntries(value).length;

const getVariableTypeLabel = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `数组 ${getVisibleChildCount(value)}`;
  }

  if (isRecord(value)) {
    return `对象 ${getVisibleChildCount(value)}`;
  }

  if (value === null) {
    return '空值';
  }

  if (typeof value === 'string') {
    return `文本 ${value.length}`;
  }

  if (typeof value === 'number') {
    return '数字';
  }

  if (typeof value === 'boolean') {
    return '布尔';
  }

  return typeof value;
};

const formatVariablePreview = (value: unknown): string => {
  if (Array.isArray(value) || isRecord(value)) {
    return getVariableTypeLabel(value);
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    const compactValue = value.replace(/\s+/g, ' ').trim();
    if (!compactValue) {
      return '空文本';
    }
    return compactValue.length > 140 ? `${compactValue.slice(0, 140)}...` : compactValue;
  }

  return String(value);
};

const formatVariableDetailValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) || isRecord(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return formatVariablePreview(value);
    }
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
};

const getContainerPreview = (value: unknown): string => {
  const entries = getVisibleEntries(value);
  if (entries.length === 0) {
    return '空';
  }

  const previewKeys = entries.slice(0, 4).map(([key]) => String(key)).join('、');
  return entries.length > 4 ? `${previewKeys}...` : previewKeys;
};

const renderHighlightedText = (text: string, normalizedQuery: string): React.ReactNode => {
  if (!normalizedQuery) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }

    const matchEnd = matchIndex + normalizedQuery.length;
    parts.push(
      <mark className="variable-search-mark" key={`${matchIndex}-${matchEnd}`}>
        {text.slice(matchIndex, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchIndex = lowerText.indexOf(normalizedQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
};

const matchesVariableSearch = (key: string | number, value: unknown, normalizedQuery: string): boolean => {
  if (!normalizedQuery) {
    return true;
  }

  if (String(key).toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if (Array.isArray(value) || isRecord(value)) {
    return getVisibleEntries(value).some(([childKey, childValue]) =>
      matchesVariableSearch(childKey, childValue, normalizedQuery)
    );
  }

  return formatVariablePreview(value).toLowerCase().includes(normalizedQuery);
};

const setValueAtVariablePath = (
  source: Record<string, unknown>,
  path: VariablePath,
  nextValue: unknown,
): Record<string, unknown> => {
  if (path.length === 0) {
    return isRecord(nextValue) ? nextValue : source;
  }

  const cloneRoot = { ...source };
  let cursor: Record<string, unknown> | unknown[] = cloneRoot;

  path.forEach((segment, index) => {
    const isLast = index === path.length - 1;

    if (isLast) {
      if (Array.isArray(cursor) && typeof segment === 'number') {
        cursor[segment] = nextValue;
      } else if (!Array.isArray(cursor)) {
        cursor[String(segment)] = nextValue;
      }
      return;
    }

    const currentValue = Array.isArray(cursor) && typeof segment === 'number'
      ? cursor[segment]
      : !Array.isArray(cursor)
        ? cursor[String(segment)]
        : undefined;
    const nextContainer = Array.isArray(currentValue)
      ? [...currentValue]
      : isRecord(currentValue)
        ? { ...currentValue }
        : {};

    if (Array.isArray(cursor) && typeof segment === 'number') {
      cursor[segment] = nextContainer;
    } else if (!Array.isArray(cursor)) {
      cursor[String(segment)] = nextContainer;
    }
    cursor = nextContainer;
  });

  return cloneRoot;
};

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const clampAutoAdvanceCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(AUTO_ADVANCE_MAX_COUNT, Math.max(1, Math.floor(value)));
};

const createAutoAdvanceExportText = (results: AutoAdvanceResult[], mode: 'plain' | 'full'): string => {
  const title = mode === 'plain' ? '自动推进 - 纯文本回复' : '自动推进 - 完整回复';

  return [
    title,
    `导出时间: ${new Date().toLocaleString('zh-CN')}`,
    `记录数量: ${results.length}`,
    '',
    ...results.flatMap(result => [
      `## 第 ${result.index} 轮 [${result.status}]`,
      `开始时间: ${result.startedAt.toLocaleString('zh-CN')}`,
      result.finishedAt ? `结束时间: ${result.finishedAt.toLocaleString('zh-CN')}` : '',
      result.userMessageId !== undefined ? `用户楼层: #${result.userMessageId}` : '',
      result.assistantMessageId !== undefined ? `助手楼层: #${result.assistantMessageId}` : '',
      result.status === 'success'
        ? `变量写入观察: ${result.variableWriteObserved ? '已观察到 era:writeDone' : '未观察到变量写入'}`
        : '',
      '',
      '[发送]',
      result.prompt,
      '',
      mode === 'plain' ? '[纯文本回复]' : '[完整回复]',
      result.error ? `错误: ${result.error}` : mode === 'plain' ? result.plainText || '(空)' : result.rawReply || '(空)',
      '',
    ]),
  ].filter(Boolean).join('\n');
};

const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

interface SettingsPanelProps {
  currentPresetName: string;
  settings: DisplaySettings;
  onSettingsChange: (settings: DisplaySettings) => void;
  latestDebugRound?: LatestDebugRound | null;
  onClearDebugLogs?: () => void;
  onAutoAdvanceTurn?: (message: string) => Promise<AutoAdvanceTurnResult>;
  isGenerating?: boolean;
}

interface SettingsCollapsibleBlockProps {
  id: SettingsCollapsibleId;
  title: string;
  isOpen: boolean;
  onToggle: (id: SettingsCollapsibleId) => void;
  children: React.ReactNode;
  className?: string;
}

const SettingsCollapsibleBlock: React.FC<SettingsCollapsibleBlockProps> = ({
  id,
  title,
  isOpen,
  onToggle,
  children,
  className = '',
}) => {
  const bodyId = `settings-collapsible-${id}`;

  return (
    <section className={`settings-collapsible-block ${isOpen ? 'open' : 'collapsed'} ${className}`.trim()}>
      <button
        type="button"
        className="settings-collapsible-header"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className="settings-collapsible-title">
          <span className="diamond-bullet"></span>
          <span>{title}</span>
        </span>
        {isOpen ? <Icons.ChevronDown size={18} /> : <Icons.ChevronUp size={18} />}
      </button>

      {isOpen && (
        <div className="settings-collapsible-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
};

/**
 * 设置面板组件
 * 提供正文显示、背景和正则替换的设置功能
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentPresetName,
  settings,
  onSettingsChange,
  latestDebugRound = null,
  onClearDebugLogs,
  onAutoAdvanceTurn,
  isGenerating = false,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [openSettingBlocks, setOpenSettingBlocks] = useState(DEFAULT_OPEN_SETTING_BLOCKS);
  const autoAdvanceStopRequestedRef = useRef(false);

  // 自动总结相关状态
  const [summaryStatus, setSummaryStatus] = useState<SummaryTriggerResult | null>(null);
  const [isSummaryRunning, setIsSummaryRunning] = useState(false);
  const [summaryResult, setSummaryResult] = useState<BatchSummaryResult | null>(null);
  const [summaryModelOptions, setSummaryModelOptions] = useState<string[]>([]);
  const [summaryModelStatus, setSummaryModelStatus] = useState('');
  const [isSummaryModelLoading, setIsSummaryModelLoading] = useState(false);
  const [summaryVariableModeStatus, setSummaryVariableModeStatus] = useState('');
  const [isSummaryVariableModeUpdating, setIsSummaryVariableModeUpdating] = useState(false);
  const [editingApiProfileId, setEditingApiProfileId] = useState<string | null>(
    () => settings.summarySettings.apiProfiles[0]?.id || null,
  );
  const [apiProfileDraft, setApiProfileDraft] = useState<SummaryApiProfileDraft>(() => {
    const firstProfile = settings.summarySettings.apiProfiles[0];
    return firstProfile ? cloneApiProfileDraftFromProfile(firstProfile) : createEmptyApiProfileDraft();
  });

  // 变量编辑相关状态
  const [statData, setStatData] = useState<Record<string, unknown> | null>(null);
  const [variableStatus, setVariableStatus] = useState<VariableStatus>('idle');
  const [variableStatusText, setVariableStatusText] = useState('');
  const [isVariablesDirty, setIsVariablesDirty] = useState(false);
  const [expandedVariablePaths, setExpandedVariablePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedVariablePath, setSelectedVariablePath] = useState<VariablePath | null>(null);
  const [isVariableDetailOpen, setIsVariableDetailOpen] = useState(false);
  const [variableSearch, setVariableSearch] = useState('');

  // 自动推进相关状态
  const [autoAdvancePrompt, setAutoAdvancePrompt] = useState(DEFAULT_AUTO_ADVANCE_PROMPT);
  const [autoAdvanceCount, setAutoAdvanceCount] = useState(5);
  const [autoAdvanceStatus, setAutoAdvanceStatus] = useState<AutoAdvanceStatus>('idle');
  const [autoAdvanceStatusText, setAutoAdvanceStatusText] = useState('');
  const [autoAdvanceResults, setAutoAdvanceResults] = useState<AutoAdvanceResult[]>([]);
  const [expandedAutoAdvanceResultId, setExpandedAutoAdvanceResultId] = useState<string | null>(null);

  const normalizedVariableSearch = variableSearch.trim().toLowerCase();
  const normalizedCurrentPresetName = currentPresetName.trim();
  const hasCurrentPreset = normalizedCurrentPresetName.length > 0;
  const currentPresetRegexRules = getCurrentPresetRegexRules(settings, normalizedCurrentPresetName);
  const visibleStatDataEntries = statData
    ? getVisibleEntries(statData).filter(([key, value]) =>
      matchesVariableSearch(key, value, normalizedVariableSearch)
    )
    : [];
  const isAutoAdvanceRunning = autoAdvanceStatus === 'running' || autoAdvanceStatus === 'stopping';
  const autoAdvanceCompletedCount = autoAdvanceResults.filter(result => result.status === 'success').length;
  const autoAdvanceFailedCount = autoAdvanceResults.filter(result => result.status === 'error').length;
  const hasAutoAdvanceResults = autoAdvanceResults.length > 0;
  const editingApiProfile = editingApiProfileId
    ? settings.summarySettings.apiProfiles.find(profile => profile.id === editingApiProfileId) || null
    : null;
  const isEditingExistingApiProfile = Boolean(editingApiProfile);
  const isApiDraftCustomSource = apiProfileDraft.apiConfig.source === 'custom';
  const summaryApiValidationMessage = validateSummaryApiConfig(apiProfileDraft.apiConfig, { requireModel: true });

  const toggleSettingBlock = useCallback((id: SettingsCollapsibleId) => {
    setOpenSettingBlocks(previousBlocks => ({
      ...previousBlocks,
      [id]: !previousBlocks[id],
    }));
  }, []);

  useEffect(() => {
    if (!editingApiProfileId) {
      return;
    }
    const profile = settings.summarySettings.apiProfiles.find(item => item.id === editingApiProfileId);
    if (profile) {
      setApiProfileDraft(cloneApiProfileDraftFromProfile(profile));
      return;
    }
    const fallbackProfile = settings.summarySettings.apiProfiles[0];
    setEditingApiProfileId(fallbackProfile?.id || null);
    setApiProfileDraft(fallbackProfile ? cloneApiProfileDraftFromProfile(fallbackProfile) : createEmptyApiProfileDraft());
  }, [editingApiProfileId, settings.summarySettings.apiProfiles]);

  // 更新单个设置项
  const updateSetting = useCallback(<K extends keyof DisplaySettings>(
    key: K,
    value: DisplaySettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  }, [settings, onSettingsChange]);

  const refreshStatData = useCallback(() => {
    try {
      const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
      const nextStatData = variables.stat_data;
      if (!isRecord(nextStatData)) {
        throw new Error('没有可读取的变量对象');
      }

      setStatData(nextStatData);
      const firstVisibleEntry = getVisibleEntries(nextStatData)[0];
      setSelectedVariablePath(firstVisibleEntry ? [firstVisibleEntry[0]] : null);
      setVariableStatus('idle');
      setVariableStatusText('');
      setIsVariablesDirty(false);
      setExpandedVariablePaths(new Set());
      setIsVariableDetailOpen(false);
    } catch (error) {
      setVariableStatus('error');
      setVariableStatusText(`读取失败：${getErrorMessage(error)}`);
    }
  }, []);

  const saveStatData = useCallback(() => {
    try {
      if (!statData) {
        throw new Error('没有可保存的变量数据');
      }

      const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
      replaceVariables({ ...variables, stat_data: statData }, { type: 'chat' });

      const savedVariables = getVariables({ type: 'chat' }) as Record<string, unknown>;
      const savedStatData = savedVariables.stat_data;
      if (isRecord(savedStatData)) {
        setStatData(savedStatData);
      }
      setVariableStatus('idle');
      setVariableStatusText('');
      setIsVariablesDirty(false);
    } catch (error) {
      setVariableStatus('error');
      setVariableStatusText(`保存失败：${getErrorMessage(error)}`);
    }
  }, [statData]);

  const selectedVariableValue = statData && selectedVariablePath
    ? getValueAtVariablePath(statData, selectedVariablePath)
    : undefined;

  const handleVariableSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setVariableSearch(event.target.value);
    setIsVariableDetailOpen(false);
  }, []);

  const handleVariableSelect = useCallback((path: VariablePath) => {
    setSelectedVariablePath(path);
    setIsVariableDetailOpen(true);
  }, []);

  const closeVariableDetail = useCallback(() => {
    setIsVariableDetailOpen(false);
  }, []);

  const toggleVariablePath = useCallback((pathKey: string) => {
    setExpandedVariablePaths(prev => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  }, []);

  const handleVariableLeafChange = useCallback((path: VariablePath, nextValue: unknown) => {
    setStatData(prev => prev ? setValueAtVariablePath(prev, path, nextValue) : prev);
    setIsVariablesDirty(true);
    setVariableStatus('idle');
    setVariableStatusText('');
  }, []);

  const handleCopyVariablePath = useCallback(async (path: VariablePath) => {
    try {
      await copyTextToClipboard(getVariableCopyPath(path));
      setVariableStatus('success');
      setVariableStatusText('已复制变量路径');
    } catch (error) {
      setVariableStatus('error');
      setVariableStatusText(`复制失败：${getErrorMessage(error)}`);
    }
  }, []);

  const handleCopyVariableValue = useCallback(async (value: unknown) => {
    try {
      await copyTextToClipboard(formatVariableDetailValue(value));
      setVariableStatus('success');
      setVariableStatusText('已复制变量值');
    } catch (error) {
      setVariableStatus('error');
      setVariableStatusText(`复制失败：${getErrorMessage(error)}`);
    }
  }, []);

  const updateAutoAdvanceResult = useCallback((id: string, updates: Partial<AutoAdvanceResult>) => {
    setAutoAdvanceResults(previousResults =>
      previousResults.map(result => result.id === id ? { ...result, ...updates } : result)
    );
  }, []);

  const handleStartAutoAdvance = useCallback(async () => {
    if (isAutoAdvanceRunning) {
      return;
    }

    if (!onAutoAdvanceTurn) {
      setAutoAdvanceStatus('error');
      setAutoAdvanceStatusText('当前页面没有可用的自动推进接口');
      return;
    }

    const prompt = autoAdvancePrompt.trim() || DEFAULT_AUTO_ADVANCE_PROMPT;
    const totalCount = clampAutoAdvanceCount(autoAdvanceCount);
    let completedCount = 0;

    autoAdvanceStopRequestedRef.current = false;
    setAutoAdvancePrompt(prompt);
    setAutoAdvanceCount(totalCount);
    setAutoAdvanceResults([]);
    setExpandedAutoAdvanceResultId(null);
    setAutoAdvanceStatus('running');
    setAutoAdvanceStatusText(`准备推进 ${totalCount} 轮`);

    for (let index = 1; index <= totalCount; index += 1) {
      if (autoAdvanceStopRequestedRef.current) {
        break;
      }

      const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date();
      setAutoAdvanceStatusText(`正在推进第 ${index}/${totalCount} 轮`);
      setAutoAdvanceResults(previousResults => [
        ...previousResults,
        {
          id,
          index,
          prompt,
          plainText: '',
          rawReply: '',
          startedAt,
          status: 'running',
        },
      ]);

      try {
        const turnResult = await onAutoAdvanceTurn(prompt);
        if (!turnResult.rawReply.trim()) {
          throw new Error('本轮没有取得 AI 回复');
        }

        completedCount += 1;
        updateAutoAdvanceResult(id, {
          prompt: turnResult.prompt,
          plainText: turnResult.plainText,
          rawReply: turnResult.rawReply,
          userMessageId: turnResult.userMessageId,
          assistantMessageId: turnResult.assistantMessageId,
          variableWriteObserved: turnResult.variableWriteObserved,
          finishedAt: new Date(),
          status: 'success',
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        updateAutoAdvanceResult(id, {
          finishedAt: new Date(),
          status: 'error',
          error: errorMessage,
        });
        setAutoAdvanceStatus('error');
        setAutoAdvanceStatusText(`第 ${index} 轮失败：${errorMessage}`);
        autoAdvanceStopRequestedRef.current = true;
        return;
      }

      if (autoAdvanceStopRequestedRef.current) {
        break;
      }

      if (index < totalCount) {
        setAutoAdvanceStatusText(`第 ${index} 轮完成，立即进入第 ${index + 1} 轮`);
      }
    }

    setAutoAdvanceStatus('done');
    setAutoAdvanceStatusText(
      autoAdvanceStopRequestedRef.current
        ? `已停止，完成 ${completedCount}/${totalCount} 轮`
        : `推进完成，完成 ${completedCount}/${totalCount} 轮`,
    );
    autoAdvanceStopRequestedRef.current = false;
  }, [
    autoAdvanceCount,
    autoAdvancePrompt,
    isAutoAdvanceRunning,
    onAutoAdvanceTurn,
    updateAutoAdvanceResult,
  ]);

  const handleStopAutoAdvance = useCallback(() => {
    if (!isAutoAdvanceRunning) {
      return;
    }

    autoAdvanceStopRequestedRef.current = true;
    setAutoAdvanceStatus('stopping');
    setAutoAdvanceStatusText('正在等待当前这一轮生成结束，结束后停止');
  }, [isAutoAdvanceRunning]);

  const handleClearAutoAdvanceResults = useCallback(() => {
    autoAdvanceStopRequestedRef.current = true;
    setAutoAdvanceStatus('idle');
    setAutoAdvanceStatusText('');
    setAutoAdvanceResults([]);
    setExpandedAutoAdvanceResultId(null);
  }, []);

  const handleCopyAutoAdvanceExport = useCallback(async (mode: 'plain' | 'full') => {
    try {
      await copyTextToClipboard(createAutoAdvanceExportText(autoAdvanceResults, mode));
      setAutoAdvanceStatusText(mode === 'plain' ? '已复制纯文本推进记录' : '已复制完整回复推进记录');
    } catch (error) {
      setAutoAdvanceStatus('error');
      setAutoAdvanceStatusText(`复制失败：${getErrorMessage(error)}`);
    }
  }, [autoAdvanceResults]);

  const handleDownloadAutoAdvanceExport = useCallback((mode: 'plain' | 'full') => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = mode === 'plain' ? '纯文本' : '完整回复';
    downloadTextFile(`武侠自动推进-${suffix}-${timestamp}.txt`, createAutoAdvanceExportText(autoAdvanceResults, mode));
    setAutoAdvanceStatusText(mode === 'plain' ? '已下载纯文本推进记录' : '已下载完整回复推进记录');
  }, [autoAdvanceResults]);

  useEffect(() => {
    if (activeTab !== 'variables') {
      return;
    }

    if (statData) {
      return;
    }

    refreshStatData();
  }, [activeTab, refreshStatData, statData]);

  // 重置当前页面设置
  const resetCurrentTab = useCallback(() => {
    switch (activeTab) {
      case 'appearance':
        onSettingsChange({
          ...settings,
          ...DEFAULT_DISPLAY_SETTINGS,
          ...DEFAULT_BACKGROUND_SETTINGS,
        });
        // 清除文件输入
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        break;
      case 'regex':
        {
          const defaultRegexSettings = createDefaultRegexSettings();
          const regexResetSettings = {
            ...settings,
            localRegexRules: defaultRegexSettings.localRegexRules,
          };
          onSettingsChange(
            hasCurrentPreset
              ? setPresetRegexRulesForPreset(regexResetSettings, normalizedCurrentPresetName, [])
              : regexResetSettings,
          );
        }
        break;
      case 'summary':
        onSettingsChange({
          ...settings,
          ...DEFAULT_SUMMARY_TAB_SETTINGS,
        });
        setSummaryStatus(null);
        setSummaryResult(null);
        break;
      case 'variables':
        refreshStatData();
        break;
      case 'advance':
        handleClearAutoAdvanceResults();
        break;
      case 'debug':
        // 清空调试日志
        onClearDebugLogs?.();
        break;
    }
  }, [
    activeTab,
    hasCurrentPreset,
    normalizedCurrentPresetName,
    settings,
    onSettingsChange,
    refreshStatData,
    handleClearAutoAdvanceResults,
    onClearDebugLogs,
  ]);

  // 获取当前页面的重置按钮文本
  const getResetButtonText = useCallback(() => {
    switch (activeTab) {
      case 'appearance':
        return '重置外观';
      case 'regex':
        return '重置全局并清空当前预设';
      case 'summary':
        return '重置额外模型';
      case 'variables':
        return '重新读取变量';
      case 'advance':
        return '清空推进记录';
      case 'debug':
        return '清空调试日志';
    }
  }, [activeTab]);

  // 处理图片上传
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 检查文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB');
      return;
    }

    try {
      const base64 = await imageToBase64(file);
      updateSetting('backgroundImage', base64);
    } catch (error) {
      uiLogger.error('图片上传失败:', error);
      alert('图片上传失败');
    }
  }, [updateSetting]);

  // 清除背景图片
  const clearBackgroundImage = useCallback(() => {
    updateSetting('backgroundImage', null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [updateSetting]);

  const updateCurrentPresetRules = useCallback((rules: RegexRule[]) => {
    if (!hasCurrentPreset) {
      return;
    }

    onSettingsChange(setPresetRegexRulesForPreset(settings, normalizedCurrentPresetName, rules));
  }, [hasCurrentPreset, normalizedCurrentPresetName, onSettingsChange, settings]);

  // 添加全局正则规则
  const addLocalRegexRule = useCallback(() => {
    const newRule = createRegexRule();
    updateSetting('localRegexRules', [...settings.localRegexRules, newRule]);
  }, [settings.localRegexRules, updateSetting]);

  // 更新全局正则规则
  const updateLocalRegexRule = useCallback((id: string, updates: Partial<RegexRule>) => {
    const newRules = settings.localRegexRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    );
    updateSetting('localRegexRules', newRules);
  }, [settings.localRegexRules, updateSetting]);

  // 删除全局正则规则
  const deleteLocalRegexRule = useCallback((id: string) => {
    const newRules = settings.localRegexRules.filter(rule => rule.id !== id);
    updateSetting('localRegexRules', newRules);
  }, [settings.localRegexRules, updateSetting]);

  // 切换全局正则规则启用状态
  const toggleLocalRegexRule = useCallback((id: string) => {
    const rule = settings.localRegexRules.find(r => r.id === id);
    if (rule) {
      updateLocalRegexRule(id, { enabled: !rule.enabled });
    }
  }, [settings.localRegexRules, updateLocalRegexRule]);

  const replaceImportedGlobalRegexRules = useCallback((rules: RegexRule[]) => {
    const importablePresetRules = importPresetTavernRegexes();
    const knownImportedSignatures = new Set(
      [...rules, ...importablePresetRules].map(rule => getRegexRuleContentSignature(rule)),
    );

    const preservedLocalRules = settings.localRegexRules.filter(rule => {
      if (rule.id === 'era-base-regex') {
        return true;
      }
      if (rule.originScope === 'global') {
        return false;
      }
      return !knownImportedSignatures.has(getRegexRuleContentSignature(rule));
    });
    updateSetting('localRegexRules', [...preservedLocalRules, ...rules]);
  }, [settings.localRegexRules, updateSetting]);

  // 更新当前预设正则规则
  const updatePresetRegexRule = useCallback((id: string, updates: Partial<RegexRule>) => {
    const newRules = currentPresetRegexRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    );
    updateCurrentPresetRules(newRules);
  }, [currentPresetRegexRules, updateCurrentPresetRules]);

  // 删除当前预设正则规则
  const deletePresetRegexRule = useCallback((id: string) => {
    const newRules = currentPresetRegexRules.filter(rule => rule.id !== id);
    updateCurrentPresetRules(newRules);
  }, [currentPresetRegexRules, updateCurrentPresetRules]);

  // 切换当前预设正则规则启用状态
  const togglePresetRegexRule = useCallback((id: string) => {
    const rule = currentPresetRegexRules.find(r => r.id === id);
    if (rule) {
      updatePresetRegexRule(id, { enabled: !rule.enabled });
    }
  }, [currentPresetRegexRules, updatePresetRegexRule]);

  // 导入全局酒馆正则
  const handleImportGlobalTavernRegexes = useCallback(() => {
    logRegexDebugSnapshot(settings, normalizedCurrentPresetName, '点击覆盖导入全局正则（导入前）');
    const importedRules = importGlobalTavernRegexes();
    replaceImportedGlobalRegexRules(importedRules);
    scheduleRegexDebugDump('点击覆盖导入全局正则（导入后）');
    if (importedRules.length === 0) {
      alert('没有找到符合条件的全局酒馆正则，已清理此前导入的全局规则\n\n筛选条件：\n• 作用域：全局\n• 已启用\n• 无最小深度\n• 作用于 AI 输出\n• 有作用于格式显示');
      return;
    }

    alert(`已覆盖导入 ${importedRules.length} 条全局酒馆正则规则`);
  }, [normalizedCurrentPresetName, replaceImportedGlobalRegexRules, settings]);

  // 导入当前预设酒馆正则
  const handleImportPresetTavernRegexes = useCallback(() => {
    if (!hasCurrentPreset) {
      alert('当前没有加载中的预设，无法导入当前预设规则');
      return;
    }

    logRegexDebugSnapshot(settings, normalizedCurrentPresetName, '点击覆盖导入当前预设规则（导入前）');
    const importedRules = importPresetTavernRegexes();
    if (importedRules.length === 0) {
      alert('没有找到符合条件的当前预设酒馆正则\n\n筛选条件：\n• 作用域：当前预设\n• 已启用\n• 无最小深度\n• 作用于 AI 输出\n• 有作用于格式显示');
      return;
    }

    updateCurrentPresetRules(importedRules);
    scheduleRegexDebugDump('点击覆盖导入当前预设规则（导入后）');
    alert(`已覆盖导入 ${importedRules.length} 条酒馆正则规则到预设「${normalizedCurrentPresetName}」`);
  }, [hasCurrentPreset, normalizedCurrentPresetName, settings, updateCurrentPresetRules]);

  // =========================================
  // 自动总结相关回调
  // =========================================

  // 更新总结设置
  const updateSummarySetting = useCallback(<K extends keyof SummarySettings>(
    key: K,
    value: SummarySettings[K]
  ) => {
    if (key === 'stream') {
      setSummaryModelStatus('');
    }
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        [key]: value,
      },
    });
  }, [settings, onSettingsChange]);

  const updateApiProfileDraft = useCallback(<K extends keyof SummaryApiProfileDraft>(
    key: K,
    value: SummaryApiProfileDraft[K],
  ) => {
    setSummaryModelStatus('');
    setApiProfileDraft(previous => ({
      ...previous,
      [key]: value,
    }));
  }, []);

  const updateApiProfileDraftConfig = useCallback(<K extends keyof SummaryApiConfig>(
    key: K,
    value: SummaryApiConfig[K]
  ) => {
    setSummaryModelStatus('');
    setApiProfileDraft(previous => ({
      ...previous,
      apiConfig: {
        ...previous.apiConfig,
          [key]: value,
      },
    }));
  }, []);

  const handleSelectApiProfile = useCallback((profileId: string) => {
    const profile = settings.summarySettings.apiProfiles.find(item => item.id === profileId) || null;
    setEditingApiProfileId(profile?.id || null);
    setApiProfileDraft(profile ? cloneApiProfileDraftFromProfile(profile) : createEmptyApiProfileDraft());
    setSummaryModelStatus('');
  }, [settings.summarySettings.apiProfiles]);

  const handleNewApiProfile = useCallback(() => {
    setEditingApiProfileId(null);
    setApiProfileDraft(createEmptyApiProfileDraft());
    setSummaryModelOptions([]);
    setSummaryModelStatus('正在创建新的 API 配置草稿。');
  }, []);

  const buildApiProfileFromDraft = useCallback((profileId?: string): SummaryApiProfile => {
    const now = Date.now();
    const existingProfile = profileId
      ? settings.summarySettings.apiProfiles.find(profile => profile.id === profileId)
      : null;
    return {
      id: profileId || createApiProfileId(),
      name: apiProfileDraft.name.trim() || '未命名 API',
      apiConfig: { ...apiProfileDraft.apiConfig },
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    };
  }, [apiProfileDraft, settings.summarySettings.apiProfiles]);

  const handleSaveApiProfile = useCallback(() => {
    const validationMessage = validateSummaryApiConfig(apiProfileDraft.apiConfig, { requireModel: true });
    if (validationMessage) {
      setSummaryModelStatus(validationMessage);
      return;
    }

    const savedProfile = buildApiProfileFromDraft(editingApiProfileId || undefined);
    const nextProfiles = editingApiProfileId
      ? settings.summarySettings.apiProfiles.map(profile =>
        profile.id === editingApiProfileId ? savedProfile : profile,
      )
      : [...settings.summarySettings.apiProfiles, savedProfile];

    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        apiProfiles: nextProfiles,
      },
    });
    setEditingApiProfileId(savedProfile.id);
    setApiProfileDraft(cloneApiProfileDraftFromProfile(savedProfile));
    setSummaryModelStatus('API 配置已保存。');
  }, [
    apiProfileDraft,
    buildApiProfileFromDraft,
    editingApiProfileId,
    onSettingsChange,
    settings,
  ]);

  const handleDuplicateApiProfile = useCallback(() => {
    const validationMessage = validateSummaryApiConfig(apiProfileDraft.apiConfig, { requireModel: true });
    if (validationMessage) {
      setSummaryModelStatus(validationMessage);
      return;
    }

    const now = Date.now();
    const savedProfile: SummaryApiProfile = {
      id: createApiProfileId(),
      name: `${apiProfileDraft.name.trim() || '未命名 API'} 副本`,
      apiConfig: { ...apiProfileDraft.apiConfig },
      createdAt: now,
      updatedAt: now,
    };
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        apiProfiles: [...settings.summarySettings.apiProfiles, savedProfile],
      },
    });
    setEditingApiProfileId(savedProfile.id);
    setApiProfileDraft(cloneApiProfileDraftFromProfile(savedProfile));
    setSummaryModelStatus('已另存为新的 API 配置。');
  }, [apiProfileDraft, onSettingsChange, settings]);

  const handleDeleteApiProfile = useCallback(() => {
    if (!editingApiProfileId) {
      return;
    }
    const profile = settings.summarySettings.apiProfiles.find(item => item.id === editingApiProfileId);
    if (!profile) {
      return;
    }
    if (!confirm(`确定删除 API 配置「${profile.name}」吗？`)) {
      return;
    }

    const nextProfiles = settings.summarySettings.apiProfiles.filter(item => item.id !== editingApiProfileId);
    const fallbackSelection: SummaryApiSelection = { type: 'preset' };
    const nextSummaryApiSelection =
      settings.summarySettings.summaryApiSelection.type === 'profile'
      && settings.summarySettings.summaryApiSelection.profileId === editingApiProfileId
        ? fallbackSelection
        : settings.summarySettings.summaryApiSelection;
    const nextVariableApiSelection =
      settings.summarySettings.variableApiSelection.type === 'profile'
      && settings.summarySettings.variableApiSelection.profileId === editingApiProfileId
        ? fallbackSelection
        : settings.summarySettings.variableApiSelection;
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        apiProfiles: nextProfiles,
        summaryApiSelection: nextSummaryApiSelection,
        variableApiSelection: nextVariableApiSelection,
      },
    });
    const fallbackProfile = nextProfiles[0];
    setEditingApiProfileId(fallbackProfile?.id || null);
    setApiProfileDraft(fallbackProfile ? cloneApiProfileDraftFromProfile(fallbackProfile) : createEmptyApiProfileDraft());
    setSummaryModelOptions([]);
    setSummaryModelStatus('API 配置已删除。');
  }, [editingApiProfileId, onSettingsChange, settings]);

  const updateApiSelection = useCallback((
    target: 'summary' | 'variable',
    selection: SummaryApiSelection,
  ) => {
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        [target === 'summary' ? 'summaryApiSelection' : 'variableApiSelection']: selection,
      },
    });
  }, [onSettingsChange, settings]);

  const updateVariableUpdateMode = useCallback(async (mode: SummaryVariableUpdateMode) => {
    if (settings.summarySettings.variableUpdateMode === mode || isSummaryVariableModeUpdating) {
      return;
    }

    setIsSummaryVariableModeUpdating(true);
    setSummaryVariableModeStatus(mode === 'extra' ? '正在禁用变量指导条目...' : '正在恢复变量指导条目...');

    try {
      const status = await applyVariableUpdateModeWorldbookState(mode);
      updateSummarySetting('variableUpdateMode', mode);
      setSummaryVariableModeStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSummaryVariableModeStatus(`切换失败：${message}`);
    } finally {
      setIsSummaryVariableModeUpdating(false);
    }
  }, [
    isSummaryVariableModeUpdating,
    settings.summarySettings.variableUpdateMode,
    updateSummarySetting,
  ]);

  const handleLoadSummaryModels = useCallback(async () => {
    setIsSummaryModelLoading(true);
    setSummaryModelStatus('正在读取模型列表...');

    try {
      const models = await loadSummaryModelList(apiProfileDraft.apiConfig);
      setSummaryModelOptions(models);
      setSummaryModelStatus(`已读取 ${models.length} 个模型。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSummaryModelStatus(message || '读取模型列表失败。');
    } finally {
      setIsSummaryModelLoading(false);
    }
  }, [apiProfileDraft.apiConfig]);

  // 更新阈值
  const updateThreshold = useCallback(<K extends keyof SummaryThresholds>(
    key: K,
    value: SummaryThresholds[K]
  ) => {
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        thresholds: {
          ...settings.summarySettings.thresholds,
          [key]: value,
        },
      },
    });
  }, [settings, onSettingsChange]);

  // 检测总结状态
  const handleCheckSummaryStatus = useCallback(() => {
    const result = checkSummaryTrigger(settings.summarySettings.thresholds);
    setSummaryStatus(result);
    setSummaryResult(null);
  }, [settings.summarySettings.thresholds]);

  // 手动触发总结
  const handleManualSummaryTrigger = useCallback(async () => {
    if (getIsSummarizing()) {
      alert('已有总结任务在执行中，请稍后再试');
      return;
    }

    // 先检测状态
    const checkResult = checkSummaryTrigger(settings.summarySettings.thresholds);
    setSummaryStatus(checkResult);

    if (checkResult.pendingCharacters.length === 0) {
      alert('没有需要总结的角色');
      return;
    }

    // 确认执行
    const confirmMsg = `检测到 ${checkResult.pendingCharacters.length} 个角色需要总结：\n${checkResult.pendingCharacters.map(c => `• ${c.displayName} (${c.entriesCount} 条经历)`).join('\n')}\n\n是否开始总结？`;
    if (!confirm(confirmMsg)) {
      return;
    }

    setIsSummaryRunning(true);
    setSummaryResult(null);

    try {
      const result = await triggerManualSummary(settings.summarySettings);
      setSummaryResult(result);

      if (result.success) {
        alert(`总结完成！成功处理 ${result.totalSuccess} 个角色`);
      } else {
        alert(`总结完成，但有 ${result.totalFailed} 个角色处理失败`);
      }
    } catch (error) {
      uiLogger.error('手动总结失败:', error);
      alert('总结过程中发生错误，请查看控制台日志');
    } finally {
      setIsSummaryRunning(false);
    }
  }, [settings.summarySettings]);

  const debugSections = latestDebugRound
    ? [
      {
        id: 'main-input',
        title: '正文输入',
        status: latestDebugRound.main.status,
        content: [
          '【用户输入】',
          latestDebugRound.main.userInput || '(空)',
          '',
          '【合并提示词】',
          latestDebugRound.main.combinedPrompt || latestDebugRound.main.userInput || '(未捕获，显示用户输入)',
          latestDebugRound.main.error ? `\n【错误】\n${latestDebugRound.main.error}` : '',
        ].filter(Boolean).join('\n'),
      },
      {
        id: 'main-output',
        title: '正文输出',
        status: latestDebugRound.main.status,
        content: [
          latestDebugRound.main.output || '(暂无正文输出)',
          latestDebugRound.main.error ? `\n【错误】\n${latestDebugRound.main.error}` : '',
        ].filter(Boolean).join('\n'),
      },
      {
        id: 'variable-input',
        title: '额外变量输入',
        status: latestDebugRound.variable.status,
        content: latestDebugRound.variable.input || '(本轮未进行额外变量更新)',
      },
      {
        id: 'variable-output',
        title: '额外变量输出',
        status: latestDebugRound.variable.status,
        content: [
          '【原始返回】',
          latestDebugRound.variable.output || '(无)',
          '',
          '【合法变量块】',
          latestDebugRound.variable.appendedBlocks || '(无)',
          '',
          '【最终楼层文本】',
          latestDebugRound.variable.finalMessageText || '(未追加)',
          latestDebugRound.variable.error ? `\n【错误】\n${latestDebugRound.variable.error}` : '',
        ].filter(Boolean).join('\n'),
      },
    ]
    : [];

  return (
    <div className="settings-panel">
      {/* 设置内容区域 */}
      <div className="settings-content">
        {/* 标签页导航 */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Icons.Character size={16} />
            <span className="settings-tab-label" data-short-label="外观">外观</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'regex' ? 'active' : ''}`}
            onClick={() => setActiveTab('regex')}
          >
            <Icons.Scroll size={16} />
            <span className="settings-tab-label" data-short-label="正则">正则替换</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <Icons.Scroll size={16} />
            <span className="settings-tab-label" data-short-label="模型">额外模型</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'variables' ? 'active' : ''}`}
            onClick={() => setActiveTab('variables')}
          >
            <Icons.Variables size={16} />
            <span className="settings-tab-label" data-short-label="变量">变量</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'advance' ? 'active' : ''}`}
            onClick={() => setActiveTab('advance')}
          >
            <Icons.Send size={16} />
            <span className="settings-tab-label" data-short-label="推进">自动推进</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'debug' ? 'active' : ''}`}
            onClick={() => setActiveTab('debug')}
          >
            <Icons.Debug size={16} />
            <span className="settings-tab-label" data-short-label="调试">调试</span>
          </button>
        </div>

        {/* 外观设置 */}
        {activeTab === 'appearance' && (
          <div className="settings-section appearance-section">
            <div className="appearance-stack">
              <SettingsCollapsibleBlock
                id="appearanceText"
                title="正文"
                isOpen={openSettingBlocks.appearanceText}
                onToggle={toggleSettingBlock}
              >
                <div className="settings-row">
                  <label className="settings-label">字体大小</label>
                  <div className="settings-control">
                    <input
                      type="range"
                      min="12"
                      max="24"
                      step="1"
                      value={settings.fontSize}
                      onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                      className="settings-slider"
                    />
                    <span className="settings-value">{settings.fontSize}px</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">字体颜色</label>
                  <div className="settings-control">
                    <input
                      type="color"
                      value={settings.fontColor}
                      onChange={(e) => updateSetting('fontColor', e.target.value)}
                      className="settings-color-picker"
                    />
                    <input
                      type="text"
                      value={settings.fontColor}
                      onChange={(e) => updateSetting('fontColor', e.target.value)}
                      className="settings-color-input"
                      placeholder="#RRGGBB"
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">行高</label>
                  <div className="settings-control">
                    <input
                      type="range"
                      min="1.2"
                      max="2.5"
                      step="0.1"
                      value={settings.lineHeight}
                      onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                      className="settings-slider"
                    />
                    <span className="settings-value">{settings.lineHeight.toFixed(1)}</span>
                  </div>
                </div>

                <div className="settings-preview appearance-preview">
                  <div className="preview-label">预览效果</div>
                  <div
                    className="preview-text"
                    style={{
                      fontSize: `${settings.fontSize}px`,
                      color: settings.fontColor,
                      lineHeight: settings.lineHeight,
                      backgroundColor: `${settings.backgroundColor}${Math.round(settings.backgroundOpacity * 255)
                        .toString(16)
                        .padStart(2, '0')}`,
                    }}
                  >
                    江湖路远，刀光剑影，恩怨情仇，尽在一念之间。
                    少侠且行且珍重，莫让红尘染白衣。
                  </div>
                </div>
              </SettingsCollapsibleBlock>

              <SettingsCollapsibleBlock
                id="appearanceBackground"
                title="背景"
                isOpen={openSettingBlocks.appearanceBackground}
                onToggle={toggleSettingBlock}
              >
                <div className="settings-row">
                  <label className="settings-label">背景颜色</label>
                  <div className="settings-control">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                      className="settings-color-picker"
                    />
                    <input
                      type="text"
                      value={settings.backgroundColor}
                      onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                      className="settings-color-input"
                      placeholder="#RRGGBB"
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">背景透明度</label>
                  <div className="settings-control">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.backgroundOpacity}
                      onChange={(e) => updateSetting('backgroundOpacity', parseFloat(e.target.value))}
                      className="settings-slider"
                    />
                    <span className="settings-value">{Math.round(settings.backgroundOpacity * 100)}%</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">背景模糊</label>
                  <div className="settings-control">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={settings.backgroundBlur}
                      onChange={(e) => updateSetting('backgroundBlur', parseInt(e.target.value))}
                      className="settings-slider"
                    />
                    <span className="settings-value">{settings.backgroundBlur}px</span>
                  </div>
                </div>

                <div className="settings-row settings-row-vertical">
                  <label className="settings-label">背景图片</label>
                  <div className="settings-image-upload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="settings-file-input"
                      id="bg-image-input"
                    />
                    <label htmlFor="bg-image-input" className="settings-upload-btn">
                      <Icons.Inventory size={16} />
                      <span>选择图片</span>
                    </label>
                    {settings.backgroundImage && (
                      <button
                        className="settings-clear-btn"
                        onClick={clearBackgroundImage}
                      >
                        <Icons.Close size={14} />
                        <span>清除</span>
                      </button>
                    )}
                  </div>
                  {settings.backgroundImage && (
                    <div className="settings-image-preview">
                      <img src={settings.backgroundImage} alt="背景预览" />
                    </div>
                  )}
                  <p className="settings-hint">支持 JPG、PNG、GIF 格式，最大 5MB</p>
                </div>
              </SettingsCollapsibleBlock>
            </div>
          </div>
        )}

        {/* 正则替换设置 */}
        {activeTab === 'regex' && (
          <div className="settings-section">
            <p className="settings-description">
              正文显示时按固定顺序执行：ERA 基础规则、当前预设规则、其它全局规则。
            </p>

            <div className="regex-scope-section">
              <div className="regex-section-header">
                <div>
                  <h5 className="regex-section-title">全局共享规则</h5>
                  <p className="regex-section-caption">手动添加的规则对所有预设共用。</p>
                </div>
              </div>

              <div className="regex-rules-list">
                {settings.localRegexRules.length === 0 ? (
                  <div className="regex-empty">
                    <Icons.Scroll size={32} />
                    <p>暂无全局共享规则</p>
                  </div>
                ) : (
                  settings.localRegexRules.map((rule, index) => (
                    <RegexRuleItem
                      key={rule.id}
                      rule={rule}
                      index={index}
                      onUpdate={(updates) => updateLocalRegexRule(rule.id, updates)}
                      onDelete={() => deleteLocalRegexRule(rule.id)}
                      onToggle={() => toggleLocalRegexRule(rule.id)}
                    />
                  ))
                )}
              </div>

              <div className="regex-buttons-group">
                <button className="settings-add-btn" onClick={addLocalRegexRule}>
                  <span className="add-icon">+</span>
                  <span>添加全局规则</span>
                </button>
                <button className="settings-import-btn" onClick={handleImportGlobalTavernRegexes}>
                  <Icons.Scroll size={14} />
                  <span>覆盖导入全局正则</span>
                </button>
              </div>
            </div>

            <div className="regex-scope-section">
              <div className="regex-section-header">
                <div>
                  <h5 className="regex-section-title">当前预设规则</h5>
                  <p className="regex-section-caption">
                    {hasCurrentPreset
                      ? `当前预设：${normalizedCurrentPresetName}。导入时会覆盖这一桶规则。`
                      : '未检测到当前预设，仅可查看和编辑全局共享规则。'}
                  </p>
                </div>
                {hasCurrentPreset && (
                  <span className="regex-section-meta">{normalizedCurrentPresetName}</span>
                )}
              </div>

              <div className="regex-rules-list">
                {currentPresetRegexRules.length === 0 ? (
                  <div className="regex-empty">
                    <Icons.Scroll size={32} />
                    <p>{hasCurrentPreset ? '当前预设暂无导入规则' : '暂无可用预设规则'}</p>
                  </div>
                ) : (
                  currentPresetRegexRules.map((rule, index) => (
                    <RegexRuleItem
                      key={rule.id}
                      rule={rule}
                      index={index}
                      onUpdate={(updates) => updatePresetRegexRule(rule.id, updates)}
                      onDelete={() => deletePresetRegexRule(rule.id)}
                      onToggle={() => togglePresetRegexRule(rule.id)}
                    />
                  ))
                )}
              </div>

              <div className="regex-buttons-group">
                <button
                  className="settings-import-btn"
                  onClick={handleImportPresetTavernRegexes}
                  disabled={!hasCurrentPreset}
                >
                  <Icons.Scroll size={14} />
                  <span>覆盖导入当前预设规则</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 额外模型设置 */}
        {activeTab === 'summary' && (
          <div className="settings-section summary-section">
            <SettingsCollapsibleBlock
              id="extraModelApi"
              title="API"
              isOpen={openSettingBlocks.extraModelApi}
              onToggle={toggleSettingBlock}
            >
              <p className="settings-hint">
                在这里保存可复用的额外模型 API；自动总结和额外变量可以在各自分组中分别选择使用哪一个。
              </p>

              <div className="summary-api-profile-toolbar">
                <select
                  value={editingApiProfileId || ''}
                  onChange={(e) => handleSelectApiProfile(e.target.value)}
                  className="settings-select summary-api-profile-select"
                >
                  <option value="">新 API 草稿</option>
                  {settings.summarySettings.apiProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="settings-action-btn" onClick={handleNewApiProfile}>
                  <Icons.Plus size={15} />
                  <span>新建</span>
                </button>
              </div>

              <div className="summary-api-fields">
                <div className="settings-row">
                  <label className="settings-label">保存名称</label>
                  <div className="settings-control">
                    <input
                      type="text"
                      value={apiProfileDraft.name}
                      onChange={(e) => updateApiProfileDraft('name', e.target.value)}
                      placeholder="例如：总结用 GPT / 变量用 DeepSeek"
                      className="settings-text-input"
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">API 渠道</label>
                  <div className="settings-control">
                    <select
                      value={apiProfileDraft.apiConfig.source}
                      onChange={(e) => updateApiProfileDraftConfig('source', e.target.value)}
                      className="settings-select"
                    >
                      {SUMMARY_API_SOURCES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {isApiDraftCustomSource && (
                  <div className="settings-row">
                    <label className="settings-label">API URL</label>
                    <div className="settings-control">
                      <input
                        type="text"
                        value={apiProfileDraft.apiConfig.apiurl}
                        onChange={(e) => updateApiProfileDraftConfig('apiurl', e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="settings-text-input"
                      />
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <label className="settings-label">API Key</label>
                  <div className="settings-control">
                    <input
                      type="password"
                      value={apiProfileDraft.apiConfig.key}
                      onChange={(e) => updateApiProfileDraftConfig('key', e.target.value)}
                      placeholder="sk-..."
                      className="settings-text-input"
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">Model</label>
                  <div className="settings-control summary-model-control">
                    <input
                      type="text"
                      list={SUMMARY_MODEL_LIST_ID}
                      value={apiProfileDraft.apiConfig.model}
                      onChange={(e) => updateApiProfileDraftConfig('model', e.target.value)}
                      placeholder="模型名称"
                      className="settings-text-input"
                    />
                    <datalist id={SUMMARY_MODEL_LIST_ID}>
                      {summaryModelOptions.map(model => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      className="settings-action-btn summary-model-load-btn"
                      onClick={handleLoadSummaryModels}
                      disabled={isSummaryModelLoading}
                    >
                      <Icons.Refresh size={15} />
                      <span>{isSummaryModelLoading ? '读取中' : '读取模型列表'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="summary-api-actions">
                <button type="button" className="settings-action-btn primary" onClick={handleSaveApiProfile}>
                  <Icons.Save size={15} />
                  <span>{isEditingExistingApiProfile ? '保存修改' : '保存 API'}</span>
                </button>
                <button type="button" className="settings-action-btn" onClick={handleDuplicateApiProfile}>
                  <Icons.Copy size={15} />
                  <span>另存为新 API</span>
                </button>
                <button
                  type="button"
                  className="settings-action-btn danger"
                  onClick={handleDeleteApiProfile}
                  disabled={!isEditingExistingApiProfile}
                >
                  <Icons.Trash size={15} />
                  <span>删除当前 API</span>
                </button>
              </div>

              {summaryApiValidationMessage && (
                <div className="summary-api-status warning">{summaryApiValidationMessage}</div>
              )}
              {summaryModelStatus && (
                <div className={`summary-api-status ${summaryModelStatus.startsWith('已读取') ? 'success' : 'info'}`}>
                  {summaryModelStatus}
                </div>
              )}
            </SettingsCollapsibleBlock>

            <SettingsCollapsibleBlock
              id="extraModelSummary"
              title="自动总结"
              isOpen={openSettingBlocks.extraModelSummary}
              onToggle={toggleSettingBlock}
            >
              <p className="settings-description compact">
                当角色的人物经历条目过多时，调用额外模型进行总结精炼。
              </p>

              <div className="settings-row">
                <label className="settings-label">使用 API</label>
                <div className="settings-control">
                  <select
                    value={apiSelectionToValue(settings.summarySettings.summaryApiSelection)}
                    onChange={(e) => updateApiSelection('summary', valueToApiSelection(e.target.value))}
                    className="settings-select"
                  >
                    <option value={API_SELECTION_PRESET_VALUE}>当前预设</option>
                    {settings.summarySettings.apiProfiles.map(profile => (
                      <option key={profile.id} value={`profile:${profile.id}`}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <span className="settings-hint-inline">
                    当前：{getApiSelectionLabel(settings.summarySettings.summaryApiSelection, settings.summarySettings.apiProfiles)}
                  </span>
                </div>
              </div>

              <div className="settings-row">
                <label className="settings-label">启用自动总结</label>
                <div className="settings-control">
                  <button
                    className={`summary-toggle-btn ${settings.summarySettings.enabled ? 'active' : ''}`}
                    onClick={() => updateSummarySetting('enabled', !settings.summarySettings.enabled)}
                  >
                    {settings.summarySettings.enabled ? <Icons.ToggleRight size={24} /> : <Icons.ToggleLeft size={24} />}
                    <span>{settings.summarySettings.enabled ? '已启用' : '已禁用'}</span>
                  </button>
                </div>
              </div>

              <div className="summary-api-toolbar summary-api-toolbar-inline">
                <label className="summary-stream-toggle">
                  <input
                    type="checkbox"
                    checked={settings.summarySettings.stream}
                    onChange={(e) => updateSummarySetting('stream', e.target.checked)}
                  />
                  <span>流式生成</span>
                </label>
              </div>

              <div className="summary-subsection">
                <h5 className="summary-subsection-title">触发阈值</h5>

                <div className="settings-row">
                  <label className="settings-label">单角色条目阈值</label>
                  <div className="settings-control">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={settings.summarySettings.thresholds.perCharacterEntriesThreshold}
                      onChange={(e) => updateThreshold('perCharacterEntriesThreshold', parseInt(e.target.value) || 10)}
                      className="settings-number-input"
                    />
                    <span className="settings-hint-inline">超过此条目数的角色加入待处理队列</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">待处理队列阈值</label>
                  <div className="settings-control">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={settings.summarySettings.thresholds.pendingQueueThreshold}
                      onChange={(e) => updateThreshold('pendingQueueThreshold', parseInt(e.target.value) || 5)}
                      className="settings-number-input"
                    />
                    <span className="settings-hint-inline">队列中角色数达到此值时触发总结</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label className="settings-label">总条目数阈值</label>
                  <div className="settings-control">
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={settings.summarySettings.thresholds.totalEntriesThreshold}
                      onChange={(e) => updateThreshold('totalEntriesThreshold', parseInt(e.target.value) || 50)}
                      className="settings-number-input"
                    />
                    <span className="settings-hint-inline">所有角色总条目数达到此值时触发总结</span>
                  </div>
                </div>
              </div>

              <div className="summary-subsection">
                <h5 className="summary-subsection-title">提示词模板</h5>
                <p className="settings-hint">
                  可用变量：{'{{characterName}}'} - 角色名称，{'{{biographyEntries}}'} - 经历条目
                </p>
                <textarea
                  value={settings.summarySettings.promptTemplate}
                  onChange={(e) => updateSummarySetting('promptTemplate', e.target.value)}
                  placeholder="请输入总结提示词模板..."
                  className="settings-textarea"
                  rows={8}
                />
                <button
                  className="settings-reset-template-btn"
                  onClick={() => updateSummarySetting('promptTemplate', DEFAULT_SUMMARY_SETTINGS.promptTemplate)}
                >
                  恢复默认模板
                </button>
              </div>

              <div className="summary-subsection">
                <h5 className="summary-subsection-title">手动操作</h5>

                <div className="summary-actions">
                  <button
                    className="settings-action-btn"
                    onClick={handleCheckSummaryStatus}
                    disabled={isSummaryRunning}
                  >
                    <Icons.Debug size={16} />
                    <span>检测状态</span>
                  </button>
                  <button
                    className="settings-action-btn primary"
                    onClick={handleManualSummaryTrigger}
                    disabled={isSummaryRunning}
                  >
                    <Icons.Scroll size={16} />
                    <span>{isSummaryRunning ? '总结中...' : '手动触发总结'}</span>
                  </button>
                </div>

                {/* 状态显示 */}
                {summaryStatus && (
                  <div className="summary-status">
                    <div className="summary-status-header">
                      <span>检测结果</span>
                      <span className={`summary-status-badge ${summaryStatus.shouldTrigger ? 'warning' : 'ok'}`}>
                        {summaryStatus.shouldTrigger ? '需要总结' : '正常'}
                      </span>
                    </div>
                    <div className="summary-status-body">
                      <div className="summary-status-item">
                        <span>待处理角色数：</span>
                        <strong>{summaryStatus.pendingCharacters.length}</strong>
                      </div>
                      <div className="summary-status-item">
                        <span>总经历条目数：</span>
                        <strong>{summaryStatus.totalEntries}</strong>
                      </div>
                      {summaryStatus.pendingCharacters.length > 0 && (
                        <div className="summary-pending-list">
                          <span>待处理角色：</span>
                          <ul>
                            {summaryStatus.pendingCharacters.map(c => (
                              <li key={c.characterId}>
                                {c.displayName} ({c.entriesCount} 条)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 总结结果 */}
                {summaryResult && (
                  <div className={`summary-result ${summaryResult.success ? 'success' : 'partial'}`}>
                    <div className="summary-result-header">
                      <span>总结结果</span>
                      <span className={`summary-result-badge ${summaryResult.success ? 'success' : 'warning'}`}>
                        {summaryResult.success ? '全部成功' : '部分失败'}
                      </span>
                    </div>
                    <div className="summary-result-body">
                      <div className="summary-result-item">
                        <span>处理总数：</span>
                        <strong>{summaryResult.totalProcessed}</strong>
                      </div>
                      <div className="summary-result-item success">
                        <span>成功：</span>
                        <strong>{summaryResult.totalSuccess}</strong>
                      </div>
                      {summaryResult.totalFailed > 0 && (
                        <div className="summary-result-item failed">
                          <span>失败：</span>
                          <strong>{summaryResult.totalFailed}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SettingsCollapsibleBlock>

            <SettingsCollapsibleBlock
              id="extraModelVariables"
              title="额外变量"
              isOpen={openSettingBlocks.extraModelVariables}
              onToggle={toggleSettingBlock}
            >
              <div className="settings-row">
                <label className="settings-label">使用 API</label>
                <div className="settings-control">
                  <select
                    value={apiSelectionToValue(settings.summarySettings.variableApiSelection)}
                    onChange={(e) => updateApiSelection('variable', valueToApiSelection(e.target.value))}
                    className="settings-select"
                  >
                    <option value={API_SELECTION_PRESET_VALUE}>当前预设</option>
                    {settings.summarySettings.apiProfiles.map(profile => (
                      <option key={profile.id} value={`profile:${profile.id}`}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <span className="settings-hint-inline">
                    当前：{getApiSelectionLabel(settings.summarySettings.variableApiSelection, settings.summarySettings.apiProfiles)}
                  </span>
                </div>
              </div>

              <div className="summary-api-mode-group" role="radiogroup" aria-label="正文变量更新模式">
                <label className={`summary-api-mode ${settings.summarySettings.variableUpdateMode !== 'extra' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="summary-variable-update-mode"
                    checked={settings.summarySettings.variableUpdateMode !== 'extra'}
                    disabled={isSummaryVariableModeUpdating}
                    onChange={() => void updateVariableUpdateMode('inline')}
                  />
                  <span>随正文更新变量</span>
                </label>
                <label className={`summary-api-mode ${settings.summarySettings.variableUpdateMode === 'extra' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="summary-variable-update-mode"
                    checked={settings.summarySettings.variableUpdateMode === 'extra'}
                    disabled={isSummaryVariableModeUpdating}
                    onChange={() => void updateVariableUpdateMode('extra')}
                  />
                  <span>额外进行变量更新</span>
                </label>
              </div>

              <p className="settings-hint">
                额外更新会禁用当前角色世界书的「变量指导」条目，正文输出后使用上方选择的 API 单独生成变量块。
              </p>

              <div className="summary-subsection">
                <h5 className="summary-subsection-title">变量提示词模板</h5>
                <p className="settings-hint">
                  可用变量：{'{{recentBodies}}'}、{'{{variableContext}}'}、{'{{variableGuidance}}'}。
                </p>
                <textarea
                  value={settings.summarySettings.variablePromptTemplate}
                  onChange={(e) => updateSummarySetting('variablePromptTemplate', e.target.value)}
                  placeholder="请输入额外变量更新提示词模板..."
                  className="settings-textarea variable-prompt-template-input"
                  rows={12}
                />
                <button
                  className="settings-reset-template-btn"
                  onClick={() => updateSummarySetting('variablePromptTemplate', DEFAULT_SUMMARY_SETTINGS.variablePromptTemplate)}
                >
                  恢复默认模板
                </button>
              </div>

              {summaryVariableModeStatus && (
                <div className={`summary-api-status ${summaryVariableModeStatus.startsWith('切换失败') ? 'warning' : 'info'}`}>
                  {summaryVariableModeStatus}
                </div>
              )}
            </SettingsCollapsibleBlock>
          </div>
        )}

        {/* 变量查看与编辑 */}
        {activeTab === 'variables' && (
          <div className="settings-section variables-section">
            <div className="variables-toolbar">
              <div className="variables-field variables-search-field">
                <label className="variables-field-label">搜索</label>
                <div className="variables-search-box">
                  <Icons.Search size={16} />
                  <input
                    type="text"
                    value={variableSearch}
                    onChange={handleVariableSearchChange}
                    placeholder="字段名或值"
                    className="settings-text-input variables-search-input"
                  />
                </div>
              </div>

              <button className="settings-action-btn" type="button" onClick={refreshStatData}>
                <Icons.Refresh size={16} />
                <span>刷新</span>
              </button>
              <button
                className="settings-action-btn primary"
                type="button"
                onClick={saveStatData}
                disabled={!isVariablesDirty || !statData}
              >
                <Icons.Variables size={16} />
                <span>保存</span>
              </button>
            </div>

            {variableStatusText && (
              <div className={`variables-status ${variableStatus}`}>
                {variableStatusText}
              </div>
            )}

            <div className={`variables-browser${isVariableDetailOpen ? ' detail-open' : ''}`}>
              <div className="variables-tree" aria-label="变量树">
                {statData ? (
                  visibleStatDataEntries.length > 0 ? (
                    visibleStatDataEntries.map(([key, value]) => (
                      <VariableTreeNode
                        key={String(key)}
                        label={key}
                        value={value}
                        path={[key]}
                        depth={0}
                        expandedPaths={expandedVariablePaths}
                        selectedPath={selectedVariablePath}
                        normalizedSearch={normalizedVariableSearch}
                        onToggle={toggleVariablePath}
                        onSelect={handleVariableSelect}
                      />
                    ))
                  ) : (
                    <div className="variables-empty">
                      <Icons.Variables size={32} />
                      <p>没有可显示的变量</p>
                    </div>
                  )
                ) : (
                  <div className="variables-empty">
                    <Icons.Variables size={32} />
                    <p>尚未读取到变量数据</p>
                  </div>
                )}
              </div>

              <VariableDetailPanel
                path={statData ? selectedVariablePath : null}
                value={selectedVariableValue}
                normalizedSearch={normalizedVariableSearch}
                onValueChange={handleVariableLeafChange}
                onCopyPath={handleCopyVariablePath}
                onCopyValue={handleCopyVariableValue}
                onBack={closeVariableDetail}
              />
            </div>

            {isVariablesDirty && (
              <div className="variables-editor-meta">
                <span className="dirty">有未保存修改</span>
              </div>
            )}
          </div>
        )}

        {/* 自动推进 */}
        {activeTab === 'advance' && (
          <div className="settings-section auto-advance-section">
            <p className="settings-description">
              按设定轮数连续发送同一句推进指令，复用底部输入框的手动发送流程，并记录每轮回复。
            </p>

            <div className="auto-advance-control-panel">
              <div className="settings-row settings-row-vertical">
                <label className="settings-label">推进指令</label>
                <textarea
                  className="settings-textarea auto-advance-prompt-input"
                  value={autoAdvancePrompt}
                  onChange={(event) => setAutoAdvancePrompt(event.target.value)}
                  disabled={isAutoAdvanceRunning}
                  rows={3}
                  spellCheck={false}
                />
              </div>

              <div className="auto-advance-grid">
                <div className="settings-row settings-row-vertical">
                  <label className="settings-label">对话轮数</label>
                  <input
                    className="settings-number-input auto-advance-number-input"
                    type="number"
                    min={1}
                    max={AUTO_ADVANCE_MAX_COUNT}
                    value={autoAdvanceCount}
                    onChange={(event) => setAutoAdvanceCount(clampAutoAdvanceCount(Number(event.target.value)))}
                    disabled={isAutoAdvanceRunning}
                  />
                </div>
              </div>

              <div className="auto-advance-actions">
                <button
                  className="settings-action-btn primary"
                  type="button"
                  onClick={handleStartAutoAdvance}
                  disabled={isAutoAdvanceRunning || isGenerating || !autoAdvancePrompt.trim()}
                >
                  <Icons.Send size={16} />
                  <span>{isAutoAdvanceRunning ? '推进中' : '开始推进'}</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={handleStopAutoAdvance}
                  disabled={!isAutoAdvanceRunning}
                >
                  <Icons.Close size={16} />
                  <span>停止</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={handleClearAutoAdvanceResults}
                  disabled={isAutoAdvanceRunning || !hasAutoAdvanceResults}
                >
                  <Icons.Refresh size={16} />
                  <span>清空</span>
                </button>
              </div>

              {(autoAdvanceStatusText || hasAutoAdvanceResults) && (
                <div className={`auto-advance-status ${autoAdvanceStatus}`}>
                  <span>{autoAdvanceStatusText || '等待推进开始'}</span>
                  {hasAutoAdvanceResults && (
                    <span className="auto-advance-status-meta">
                      成功 {autoAdvanceCompletedCount} / 失败 {autoAdvanceFailedCount} / 共 {autoAdvanceResults.length}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="auto-advance-export-panel">
              <div className="auto-advance-export-header">
                <div>
                  <h5>结果导出</h5>
                  <p>纯文本用于检查剧情质量；完整回复保留变量块，便于复制给其他 AI 检查变量生成。</p>
                </div>
              </div>
              <div className="auto-advance-export-actions">
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleCopyAutoAdvanceExport('plain')}
                  disabled={!hasAutoAdvanceResults}
                >
                  <Icons.Copy size={16} />
                  <span>复制纯文本</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleDownloadAutoAdvanceExport('plain')}
                  disabled={!hasAutoAdvanceResults}
                >
                  <Icons.FileText size={16} />
                  <span>下载纯文本</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleCopyAutoAdvanceExport('full')}
                  disabled={!hasAutoAdvanceResults}
                >
                  <Icons.Copy size={16} />
                  <span>复制完整回复</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleDownloadAutoAdvanceExport('full')}
                  disabled={!hasAutoAdvanceResults}
                >
                  <Icons.FileText size={16} />
                  <span>下载完整回复</span>
                </button>
              </div>
            </div>

            <div className="auto-advance-results">
              {autoAdvanceResults.length === 0 ? (
                <div className="auto-advance-empty">
                  <Icons.Send size={32} />
                  <p>暂无推进记录</p>
                </div>
              ) : (
                autoAdvanceResults.map(result => (
                  <div
                    key={result.id}
                    className={`auto-advance-result ${result.status} ${expandedAutoAdvanceResultId === result.id ? 'expanded' : ''}`}
                  >
                    <button
                      className="auto-advance-result-header"
                      type="button"
                      onClick={() => setExpandedAutoAdvanceResultId(
                        expandedAutoAdvanceResultId === result.id ? null : result.id,
                      )}
                    >
                      <span className="auto-advance-result-title">第 {result.index} 轮</span>
                      <span className={`auto-advance-result-badge ${result.status}`}>
                        {result.status === 'running' ? '生成中' : result.status === 'success' ? '完成' : '失败'}
                      </span>
                      <span className="auto-advance-result-length">
                        {result.status === 'success'
                          ? `#${result.userMessageId ?? '?'} → #${result.assistantMessageId ?? '?'} · ${result.plainText.length} / ${result.rawReply.length} 字符`
                          : result.error || '等待回复'}
                      </span>
                      {expandedAutoAdvanceResultId === result.id
                        ? <Icons.ChevronDown size={18} />
                        : <Icons.ChevronUp size={18} />}
                    </button>

                    {expandedAutoAdvanceResultId !== result.id && result.plainText && (
                      <div className="auto-advance-result-preview">
                        {result.plainText.slice(0, 180)}
                        {result.plainText.length > 180 && '...'}
                      </div>
                    )}

                    {expandedAutoAdvanceResultId === result.id && (
                      <div className="auto-advance-result-body">
                        {result.status === 'success' && (
                          <div className="auto-advance-result-meta">
                            <span>用户楼层 #{result.userMessageId ?? '?'}</span>
                            <span>助手楼层 #{result.assistantMessageId ?? '?'}</span>
                            <span>{result.variableWriteObserved ? '已观察到变量写入' : '未观察到变量写入'}</span>
                          </div>
                        )}
                        <div className="auto-advance-result-block">
                          <div className="auto-advance-result-block-title">发送内容</div>
                          <pre>{result.prompt}</pre>
                        </div>
                        <div className="auto-advance-result-block">
                          <div className="auto-advance-result-block-title">纯文本回复</div>
                          <pre>{result.error ? `错误：${result.error}` : result.plainText || '(空)'}</pre>
                        </div>
                        <div className="auto-advance-result-block">
                          <div className="auto-advance-result-block-title">完整回复</div>
                          <pre>{result.error ? `错误：${result.error}` : result.rawReply || '(空)'}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 调试设置 */}
        {activeTab === 'debug' && (
          <div className="settings-section">
            <p className="settings-description">
              查看每次发送给 AI 的消息和 AI 回复的内容，帮助调试提示词和检查输出。
            </p>

            {/* 调试日志列表 */}
            <div className="debug-logs-list">
              {debugLogs.length === 0 ? (
                <div className="debug-empty">
                  <Icons.Debug size={32} />
                  <p>暂无调试日志</p>
                  <p className="debug-hint">发送消息后，日志将在此显示</p>
                </div>
              ) : (
                debugLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`debug-log-item ${log.type === 'prompt' ? 'prompt' : 'assistant'} ${expandedLogId === log.id ? 'expanded' : ''}`}
                  >
                    <div
                      className="debug-log-header"
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    >
                      <div className="debug-log-info">
                        <span className={`debug-log-type ${log.type}`}>
                          {log.type === 'prompt' ? '📤 完整提示词' : '📥 AI 回复'}
                        </span>
                        <span className="debug-log-time">
                          {log.timestamp.toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                        <span className="debug-log-length">
                          {log.content.length} 字符
                        </span>
                      </div>
                      <div className="debug-log-actions">
                        <button
                          className="debug-expand-btn"
                          title={expandedLogId === log.id ? '收起' : '展开'}
                        >
                          {expandedLogId === log.id ? <Icons.ChevronDown size={18} /> : <Icons.ChevronUp size={18} />}
                        </button>
                      </div>
                    </div>
                    
                    {/* 预览内容（收起状态） */}
                    {expandedLogId !== log.id && (
                      <div className="debug-log-preview">
                        {log.content.substring(0, 150)}
                        {log.content.length > 150 && '...'}
                      </div>
                    )}
                    
                    {/* 完整内容（展开状态） */}
                    {expandedLogId === log.id && (
                      <div className="debug-log-body">
                        <div className="debug-log-content">
                          <pre>{log.content}</pre>
                        </div>
                        <div className="debug-log-footer">
                          <button
                            className="debug-copy-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(log.content);
                              // 可以添加复制成功的提示
                            }}
                            title="复制内容"
                          >
                            复制全部
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 日志统计 */}
            {debugLogs.length > 0 && (
              <div className="debug-stats">
                <span>共 {debugLogs.length} 条记录</span>
                <span>•</span>
                <span>提示词 {debugLogs.filter(l => l.type === 'prompt').length} 条</span>
                <span>•</span>
                <span>回复 {debugLogs.filter(l => l.type === 'assistant').length} 条</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="settings-footer">
        <button className="settings-reset-btn" onClick={resetCurrentTab}>
          <Icons.Close size={14} />
          <span>{getResetButtonText()}</span>
        </button>
      </div>
    </div>
  );
};

interface VariableTreeNodeProps {
  label: string | number;
  value: unknown;
  path: VariablePath;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: VariablePath | null;
  normalizedSearch: string;
  onToggle: (pathKey: string) => void;
  onSelect: (path: VariablePath) => void;
}

const VariableTreeNode: React.FC<VariableTreeNodeProps> = ({
  label,
  value,
  path,
  depth,
  expandedPaths,
  selectedPath,
  normalizedSearch,
  onToggle,
  onSelect,
}) => {
  const pathKey = getVariablePathKey(path);
  const isRoot = path.length === 0;
  const isContainer = Array.isArray(value) || isRecord(value);
  const isExpanded = isRoot || Boolean(normalizedSearch) || expandedPaths.has(pathKey);
  const isSelected = areVariablePathsEqual(selectedPath, path);
  const rawEntries = isContainer ? getVisibleEntries(value) : [];
  const visibleEntries = normalizedSearch
    ? rawEntries.filter(([childKey, childValue]) => matchesVariableSearch(childKey, childValue, normalizedSearch))
    : rawEntries;
  const handleSelect = () => onSelect(path);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(path);
    }
  };

  return (
    <div className={`variable-node ${isRoot ? 'root' : ''} ${isContainer ? 'branch' : 'leaf'} ${isSelected ? 'selected' : ''}`}>
      <div
        className="variable-node-row"
        style={{ paddingLeft: `${Math.min(depth, 8) * 0.85}rem` }}
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
      >
        {isContainer && !isRoot ? (
          <button
            className="variable-node-toggle"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(pathKey);
            }}
            title={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? <Icons.ChevronDown size={16} /> : <Icons.ChevronUp size={16} />}
          </button>
        ) : (
          <span className="variable-node-toggle-spacer" />
        )}

        <span className="variable-node-key" title={String(label)}>
          {renderHighlightedText(String(label), normalizedSearch)}
        </span>
        <span className="variable-node-type">{getVariableTypeLabel(value)}</span>
        <VariableValuePreview value={value} normalizedSearch={normalizedSearch} />
      </div>

      {isContainer && isExpanded && (
        <div className="variable-node-children">
          {visibleEntries.length > 0 ? (
            visibleEntries.map(([childKey, childValue]) => (
              <VariableTreeNode
                key={`${pathKey}:${String(childKey)}`}
                label={childKey}
                value={childValue}
                path={[...path, childKey]}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                normalizedSearch={normalizedSearch}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          ) : (
            <div
              className="variable-node-empty"
              style={{ paddingLeft: `${Math.min(depth + 1, 8) * 0.85 + 1.5}rem` }}
            >
              空
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface VariableValuePreviewProps {
  value: unknown;
  normalizedSearch: string;
}

const VariableValuePreview: React.FC<VariableValuePreviewProps> = ({
  value,
  normalizedSearch,
}) => {
  const preview = Array.isArray(value) || isRecord(value)
    ? getContainerPreview(value)
    : formatVariablePreview(value);

  return (
    <span className="variable-node-preview" title={preview}>
      {renderHighlightedText(preview, normalizedSearch)}
    </span>
  );
};

interface VariableDetailPanelProps {
  path: VariablePath | null;
  value: unknown;
  normalizedSearch: string;
  onValueChange: (path: VariablePath, nextValue: unknown) => void;
  onCopyPath: (path: VariablePath) => void;
  onCopyValue: (value: unknown) => void;
  onBack: () => void;
}

const VariableDetailPanel: React.FC<VariableDetailPanelProps> = ({
  path,
  value,
  normalizedSearch,
  onValueChange,
  onCopyPath,
  onCopyValue,
  onBack,
}) => {
  if (!path) {
    return (
      <aside className="variable-detail-panel empty" aria-label="变量详情">
        <Icons.Eye size={28} />
        <p>选择变量查看详情</p>
      </aside>
    );
  }

  const isContainer = Array.isArray(value) || isRecord(value);
  const displayPath = getVariableDisplayPath(path);
  const copyPath = getVariableCopyPath(path);
  const detailValue = formatVariableDetailValue(value);

  return (
    <aside className="variable-detail-panel" aria-label="变量详情">
      <div className="variable-detail-header">
        <div className="variable-detail-title">
          <button
            type="button"
            className="variable-detail-back-btn"
            onClick={onBack}
            title="返回变量列表"
            aria-label="返回变量列表"
          >
            <Icons.ArrowLeft size={15} />
          </button>
          <Icons.Eye size={16} />
          <span>变量详情</span>
        </div>
        <div className="variable-detail-actions">
          <button
            type="button"
            className="variable-detail-icon-btn"
            onClick={() => onCopyPath(path)}
            title="复制路径"
          >
            <Icons.Copy size={15} />
          </button>
          <button
            type="button"
            className="variable-detail-icon-btn"
            onClick={() => onCopyValue(value)}
            title="复制值"
          >
            <Icons.FileText size={15} />
          </button>
        </div>
      </div>

      <div className="variable-detail-path" title={copyPath}>
        {renderHighlightedText(displayPath, normalizedSearch)}
      </div>

      <div className="variable-detail-meta">
        <span>{getVariableTypeLabel(value)}</span>
        <span>{path.length} 层</span>
      </div>

      <div className="variable-detail-body">
        {isContainer ? (
          <pre className="variable-detail-code">{detailValue}</pre>
        ) : (
          <>
            <label className="variable-detail-field-label">值</label>
            <VariableLeafEditor
              value={value}
              path={path}
              onValueChange={onValueChange}
            />
          </>
        )}
      </div>
    </aside>
  );
};

interface VariableLeafEditorProps {
  value: unknown;
  path: VariablePath;
  onValueChange: (path: VariablePath, nextValue: unknown) => void;
}

const VariableLeafEditor: React.FC<VariableLeafEditorProps> = ({
  value,
  path,
  onValueChange,
}) => {
  if (typeof value === 'string') {
    const isLongText = value.length > 80 || value.includes('\n');
    if (isLongText) {
      return (
        <textarea
          className="variable-leaf-input variable-leaf-textarea"
          value={value}
          onChange={(e) => onValueChange(path, e.target.value)}
          rows={Math.min(5, Math.max(2, value.split('\n').length))}
          spellCheck={false}
        />
      );
    }

    return (
      <input
        className="variable-leaf-input"
        type="text"
        value={value}
        onChange={(e) => onValueChange(path, e.target.value)}
      />
    );
  }

  if (typeof value === 'number') {
    return (
      <input
        className="variable-leaf-input variable-leaf-number"
        type="number"
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const rawValue = e.target.value.trim();
          const nextValue = rawValue === '' ? 0 : Number(rawValue);
          if (Number.isFinite(nextValue)) {
            onValueChange(path, nextValue);
          }
        }}
      />
    );
  }

  if (typeof value === 'boolean') {
    return (
      <button
        className={`variable-boolean-toggle ${value ? 'active' : ''}`}
        onClick={() => onValueChange(path, !value)}
      >
        {value ? 'true' : 'false'}
      </button>
    );
  }

  if (value === null) {
    return <span className="variable-null-value">null</span>;
  }

  return <span className="variable-unknown-value">{formatVariablePreview(value)}</span>;
};

/**
 * 正则规则项组件
 */
interface RegexRuleItemProps {
  rule: RegexRule;
  index: number;
  onUpdate: (updates: Partial<RegexRule>) => void;
  onDelete: () => void;
  onToggle: () => void;
}

const RegexRuleItem: React.FC<RegexRuleItemProps> = ({
  rule,
  index,
  onUpdate,
  onDelete,
  onToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false); // 默认收起
  const validation = validateRegex(rule.pattern);
  const originScopeLabel =
    rule.originScope === 'preset'
      ? '预设导入'
      : rule.originScope === 'global'
        ? '全局导入'
        : '全局规则';

  // 阻止事件冒泡
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  // 整个头部都可以点击展开/收起
  const handleHeaderClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`regex-rule-item ${rule.enabled ? '' : 'disabled'}`}>
      <div className="regex-rule-header" onClick={handleHeaderClick}>
        <div className="regex-rule-info" onClick={stopPropagation}>
          <button
            className={`regex-toggle-btn ${rule.enabled ? 'active' : ''}`}
            onClick={onToggle}
            title={rule.enabled ? '点击禁用' : '点击启用'}
          >
            {rule.enabled ? <Icons.ToggleRight size={20} /> : <Icons.ToggleLeft size={20} />}
          </button>
          <span className="regex-rule-index">规则 {index + 1}</span>
          <span className={`regex-rule-origin regex-rule-origin--${rule.originScope}`}>{originScopeLabel}</span>
          {rule.description && (
            <span className="regex-rule-desc" title={rule.description}>{rule.description}</span>
          )}
        </div>
        <div className="regex-rule-actions">
          <button
            className="regex-expand-btn"
            title={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? <Icons.ChevronDown size={18} /> : <Icons.ChevronUp size={18} />}
          </button>
          <button
            className="regex-delete-btn"
            onClick={(e) => {
              stopPropagation(e);
              onDelete();
            }}
            title="删除规则"
          >
            <Icons.Close size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="regex-rule-body">
          {/* 描述 */}
          <div className="regex-field">
            <label>描述（可选）</label>
            <input
              type="text"
              value={rule.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="例如：移除思考过程"
              className="regex-input"
            />
          </div>

          {/* 正则模式 */}
          <div className="regex-field">
            <label>正则表达式</label>
            <input
              type="text"
              value={rule.pattern}
              onChange={(e) => onUpdate({ pattern: e.target.value })}
              placeholder="例如：/<thinks>.*?<\/thinks>/gs"
              className={`regex-input ${!validation.valid ? 'invalid' : ''}`}
            />
            {!validation.valid && (
              <span className="regex-error">{validation.error}</span>
            )}
          </div>

          {/* 替换文本 */}
          <div className="regex-field">
            <label>替换为</label>
            <input
              type="text"
              value={rule.replacement}
              onChange={(e) => onUpdate({ replacement: e.target.value })}
              placeholder="留空即为删除"
              className="regex-input"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
