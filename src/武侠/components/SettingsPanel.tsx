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
  SummaryThresholds,
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
  checkSummaryTrigger,
  triggerManualSummary,
  getIsSummarizing,
  type SummaryTriggerResult,
  type BatchSummaryResult,
} from '../utils/summaryManager';
import { normalizeDisplayedMessageContent, parseAIResponse } from '../utils/variableReader';
import { Icons } from './Icons';
import { DebugLogEntry } from '../hooks';
import { uiLogger } from '../utils/logger';

type SettingsTab = 'display' | 'background' | 'regex' | 'summary' | 'variables' | 'test' | 'debug';
type VariableStatus = 'idle' | 'success' | 'error';
type VariablePath = Array<string | number>;
type AutoTestStatus = 'idle' | 'running' | 'stopping' | 'done' | 'error';
type AutoTestResultStatus = 'running' | 'success' | 'error';

interface AutoTestResult {
  id: string;
  index: number;
  prompt: string;
  rawResponse: string;
  plainResponse: string;
  startedAt: Date;
  finishedAt?: Date;
  status: AutoTestResultStatus;
  error?: string;
}

const DEFAULT_AUTO_TEST_PROMPT = '合理地继续推进剧情';
const AUTO_TEST_MAX_COUNT = 50;
const OPTION_BLOCK_REGEX = /\s*<option>\s*[\s\S]*?<\/option>\s*/gi;

const HIDDEN_VARIABLE_KEYS = new Set(['$meta', '$template']);
const ROOT_VARIABLE_PATH_KEY = 'root';

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

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

const sleep = (milliseconds: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, milliseconds));

const clampAutoTestCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(AUTO_TEST_MAX_COUNT, Math.max(1, Math.floor(value)));
};

const createAutoTestPlainResponse = (rawResponse: string): string => {
  const normalizedResponse = normalizeDisplayedMessageContent(rawResponse);
  const parsedResponse = parseAIResponse(normalizedResponse);
  const content = parsedResponse.content || normalizedResponse;
  return content
    .replace(OPTION_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const createAutoTestExportText = (results: AutoTestResult[], mode: 'plain' | 'full'): string => {
  const title = mode === 'plain' ? '自动推进测试 - 纯文本回复' : '自动推进测试 - 完整回复';
  const contentKey = mode === 'plain' ? 'plainResponse' : 'rawResponse';

  return [
    title,
    `导出时间: ${new Date().toLocaleString('zh-CN')}`,
    `记录数量: ${results.length}`,
    '',
    ...results.flatMap(result => [
      `## 第 ${result.index} 轮 [${result.status}]`,
      `开始时间: ${result.startedAt.toLocaleString('zh-CN')}`,
      result.finishedAt ? `结束时间: ${result.finishedAt.toLocaleString('zh-CN')}` : '',
      '',
      '[发送]',
      result.prompt,
      '',
      mode === 'plain' ? '[纯文本回复]' : '[完整回复]',
      result.error ? `错误: ${result.error}` : result[contentKey] || '(空)',
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
  debugLogs?: DebugLogEntry[];
  onClearDebugLogs?: () => void;
  onTestMessageSend?: (message: string) => Promise<string>;
  isGenerating?: boolean;
}

/**
 * 设置面板组件
 * 提供正文显示、背景和正则替换的设置功能
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentPresetName,
  settings,
  onSettingsChange,
  debugLogs = [],
  onClearDebugLogs,
  onTestMessageSend,
  isGenerating = false,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const autoTestStopRequestedRef = useRef(false);

  // 自动总结相关状态
  const [summaryStatus, setSummaryStatus] = useState<SummaryTriggerResult | null>(null);
  const [isSummaryRunning, setIsSummaryRunning] = useState(false);
  const [summaryResult, setSummaryResult] = useState<BatchSummaryResult | null>(null);

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

  // 自动推进测试相关状态
  const [autoTestPrompt, setAutoTestPrompt] = useState(DEFAULT_AUTO_TEST_PROMPT);
  const [autoTestCount, setAutoTestCount] = useState(5);
  const [autoTestDelaySeconds, setAutoTestDelaySeconds] = useState(0.8);
  const [autoTestStatus, setAutoTestStatus] = useState<AutoTestStatus>('idle');
  const [autoTestStatusText, setAutoTestStatusText] = useState('');
  const [autoTestResults, setAutoTestResults] = useState<AutoTestResult[]>([]);
  const [expandedAutoTestResultId, setExpandedAutoTestResultId] = useState<string | null>(null);

  const normalizedVariableSearch = variableSearch.trim().toLowerCase();
  const normalizedCurrentPresetName = currentPresetName.trim();
  const hasCurrentPreset = normalizedCurrentPresetName.length > 0;
  const currentPresetRegexRules = getCurrentPresetRegexRules(settings, normalizedCurrentPresetName);
  const visibleStatDataEntries = statData
    ? getVisibleEntries(statData).filter(([key, value]) =>
      matchesVariableSearch(key, value, normalizedVariableSearch)
    )
    : [];
  const isAutoTestRunning = autoTestStatus === 'running' || autoTestStatus === 'stopping';
  const autoTestCompletedCount = autoTestResults.filter(result => result.status === 'success').length;
  const autoTestFailedCount = autoTestResults.filter(result => result.status === 'error').length;
  const hasAutoTestResults = autoTestResults.length > 0;

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

  const updateAutoTestResult = useCallback((id: string, updates: Partial<AutoTestResult>) => {
    setAutoTestResults(previousResults =>
      previousResults.map(result => result.id === id ? { ...result, ...updates } : result)
    );
  }, []);

  const handleStartAutoTest = useCallback(async () => {
    if (isAutoTestRunning) {
      return;
    }

    if (!onTestMessageSend) {
      setAutoTestStatus('error');
      setAutoTestStatusText('当前页面没有可用的发送接口');
      return;
    }

    const prompt = autoTestPrompt.trim() || DEFAULT_AUTO_TEST_PROMPT;
    const totalCount = clampAutoTestCount(autoTestCount);
    const delaySeconds = Math.max(0, Number.isFinite(autoTestDelaySeconds) ? autoTestDelaySeconds : 0);
    const delayMs = Math.round(delaySeconds * 1000);
    let completedCount = 0;

    autoTestStopRequestedRef.current = false;
    setAutoTestPrompt(prompt);
    setAutoTestCount(totalCount);
    setAutoTestDelaySeconds(delaySeconds);
    setAutoTestResults([]);
    setExpandedAutoTestResultId(null);
    setAutoTestStatus('running');
    setAutoTestStatusText(`准备发送 ${totalCount} 轮自动推进测试`);

    for (let index = 1; index <= totalCount; index += 1) {
      if (autoTestStopRequestedRef.current) {
        break;
      }

      const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date();
      setAutoTestStatusText(`正在发送第 ${index}/${totalCount} 轮`);
      setAutoTestResults(previousResults => [
        ...previousResults,
        {
          id,
          index,
          prompt,
          rawResponse: '',
          plainResponse: '',
          startedAt,
          status: 'running',
        },
      ]);

      try {
        const rawResponse = await onTestMessageSend(prompt);
        if (!rawResponse.trim()) {
          throw new Error('本轮没有取得 AI 回复');
        }

        const plainResponse = createAutoTestPlainResponse(rawResponse);
        completedCount += 1;
        updateAutoTestResult(id, {
          rawResponse,
          plainResponse,
          finishedAt: new Date(),
          status: 'success',
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        updateAutoTestResult(id, {
          finishedAt: new Date(),
          status: 'error',
          error: errorMessage,
        });
        setAutoTestStatus('error');
        setAutoTestStatusText(`第 ${index} 轮失败：${errorMessage}`);
        autoTestStopRequestedRef.current = true;
        return;
      }

      if (autoTestStopRequestedRef.current) {
        break;
      }

      if (index < totalCount && delayMs > 0) {
        setAutoTestStatusText(`第 ${index} 轮完成，等待 ${(delayMs / 1000).toFixed(1)} 秒后继续`);
        await sleep(delayMs);
      }
    }

    setAutoTestStatus('done');
    setAutoTestStatusText(
      autoTestStopRequestedRef.current
        ? `已停止，完成 ${completedCount}/${totalCount} 轮`
        : `测试完成，完成 ${completedCount}/${totalCount} 轮`,
    );
    autoTestStopRequestedRef.current = false;
  }, [
    autoTestCount,
    autoTestDelaySeconds,
    autoTestPrompt,
    isAutoTestRunning,
    onTestMessageSend,
    updateAutoTestResult,
  ]);

  const handleStopAutoTest = useCallback(() => {
    if (!isAutoTestRunning) {
      return;
    }

    autoTestStopRequestedRef.current = true;
    setAutoTestStatus('stopping');
    setAutoTestStatusText('正在等待当前这一轮生成结束，结束后停止');
  }, [isAutoTestRunning]);

  const handleClearAutoTestResults = useCallback(() => {
    autoTestStopRequestedRef.current = true;
    setAutoTestStatus('idle');
    setAutoTestStatusText('');
    setAutoTestResults([]);
    setExpandedAutoTestResultId(null);
  }, []);

  const handleCopyAutoTestExport = useCallback(async (mode: 'plain' | 'full') => {
    try {
      await copyTextToClipboard(createAutoTestExportText(autoTestResults, mode));
      setAutoTestStatusText(mode === 'plain' ? '已复制纯文本测试记录' : '已复制完整回复测试记录');
    } catch (error) {
      setAutoTestStatus('error');
      setAutoTestStatusText(`复制失败：${getErrorMessage(error)}`);
    }
  }, [autoTestResults]);

  const handleDownloadAutoTestExport = useCallback((mode: 'plain' | 'full') => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = mode === 'plain' ? '纯文本' : '完整回复';
    downloadTextFile(`武侠自动推进测试-${suffix}-${timestamp}.txt`, createAutoTestExportText(autoTestResults, mode));
    setAutoTestStatusText(mode === 'plain' ? '已下载纯文本测试记录' : '已下载完整回复测试记录');
  }, [autoTestResults]);

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
      case 'display':
        onSettingsChange({
          ...settings,
          ...DEFAULT_DISPLAY_SETTINGS,
        });
        break;
      case 'background':
        onSettingsChange({
          ...settings,
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
      case 'test':
        handleClearAutoTestResults();
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
    handleClearAutoTestResults,
    onClearDebugLogs,
  ]);

  // 获取当前页面的重置按钮文本
  const getResetButtonText = useCallback(() => {
    switch (activeTab) {
      case 'display':
        return '重置正文显示';
      case 'background':
        return '重置背景设置';
      case 'regex':
        return '重置全局并清空当前预设';
      case 'summary':
        return '重置总结设置';
      case 'variables':
        return '重新读取变量';
      case 'test':
        return '清空测试结果';
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
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        [key]: value,
      },
    });
  }, [settings, onSettingsChange]);

  // 更新 API 配置
  const updateApiConfig = useCallback(<K extends keyof SummaryApiConfig>(
    key: K,
    value: SummaryApiConfig[K]
  ) => {
    onSettingsChange({
      ...settings,
      summarySettings: {
        ...settings.summarySettings,
        apiConfig: {
          ...settings.summarySettings.apiConfig,
          [key]: value,
        },
      },
    });
  }, [settings, onSettingsChange]);

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

  return (
    <div className="settings-panel">
      {/* 标签页导航 */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
        >
          <Icons.Character size={16} />
          <span className="settings-tab-label" data-short-label="正文">正文显示</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'background' ? 'active' : ''}`}
          onClick={() => setActiveTab('background')}
        >
          <Icons.Map size={16} />
          <span className="settings-tab-label" data-short-label="背景">背景设置</span>
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
          <span className="settings-tab-label" data-short-label="总结">自动总结</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'variables' ? 'active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          <Icons.Variables size={16} />
          <span className="settings-tab-label" data-short-label="变量">变量</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => setActiveTab('test')}
        >
          <Icons.Send size={16} />
          <span className="settings-tab-label" data-short-label="测试">自动测试</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'debug' ? 'active' : ''}`}
          onClick={() => setActiveTab('debug')}
        >
          <Icons.Debug size={16} />
          <span className="settings-tab-label" data-short-label="调试">调试</span>
        </button>
      </div>

      {/* 设置内容区域 */}
      <div className="settings-content">
        {/* 正文显示设置 */}
        {activeTab === 'display' && (
          <div className="settings-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              字体设置
            </h4>

            {/* 字体大小 */}
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

            {/* 字体颜色 */}
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

            {/* 行高 */}
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

            {/* 预览区域 */}
            <div className="settings-preview">
              <div className="preview-label">预览效果</div>
              <div
                className="preview-text"
                style={{
                  fontSize: `${settings.fontSize}px`,
                  color: settings.fontColor,
                  lineHeight: settings.lineHeight,
                }}
              >
                江湖路远，刀光剑影，恩怨情仇，尽在一念之间。
                少侠且行且珍重，莫让红尘染白衣。
              </div>
            </div>
          </div>
        )}

        {/* 背景设置 */}
        {activeTab === 'background' && (
          <div className="settings-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              背景设置
            </h4>

            {/* 背景颜色 */}
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

            {/* 背景透明度 */}
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

            {/* 背景模糊度 */}
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

            {/* 背景图片上传 */}
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
          </div>
        )}

        {/* 正则替换设置 */}
        {activeTab === 'regex' && (
          <div className="settings-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              正则替换规则
            </h4>
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

        {/* 自动总结设置 */}
        {activeTab === 'summary' && (
          <div className="settings-section summary-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              自动总结设置
            </h4>
            <p className="settings-description">
              当角色的人物经历条目过多时，自动调用 AI 进行总结精炼。
            </p>

            {/* 启用开关 */}
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

            {/* API 配置 */}
            <div className="summary-subsection">
              <h5 className="summary-subsection-title">API 配置</h5>

              <div className="settings-row">
                <label className="settings-label">API 地址</label>
                <div className="settings-control">
                  <input
                    type="text"
                    value={settings.summarySettings.apiConfig.apiurl}
                    onChange={(e) => updateApiConfig('apiurl', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="settings-text-input"
                  />
                </div>
              </div>

              <div className="settings-row">
                <label className="settings-label">API 密钥</label>
                <div className="settings-control">
                  <input
                    type="password"
                    value={settings.summarySettings.apiConfig.key}
                    onChange={(e) => updateApiConfig('key', e.target.value)}
                    placeholder="sk-..."
                    className="settings-text-input"
                  />
                </div>
              </div>

              <div className="settings-row">
                <label className="settings-label">模型名称</label>
                <div className="settings-control">
                  <input
                    type="text"
                    value={settings.summarySettings.apiConfig.model}
                    onChange={(e) => updateApiConfig('model', e.target.value)}
                    placeholder="gpt-4"
                    className="settings-text-input"
                  />
                </div>
              </div>

              <div className="settings-row">
                <label className="settings-label">API 源</label>
                <div className="settings-control">
                  <select
                    value={settings.summarySettings.apiConfig.source || 'openai'}
                    onChange={(e) => updateApiConfig('source', e.target.value)}
                    className="settings-select"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 触发阈值 */}
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

            {/* 提示词模板 */}
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

            {/* 状态检测和手动触发 */}
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
          </div>
        )}

        {/* 变量查看与编辑 */}
        {activeTab === 'variables' && (
          <div className="settings-section variables-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              变量
            </h4>

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

        {/* 自动推进测试 */}
        {activeTab === 'test' && (
          <div className="settings-section auto-test-section">
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              自动推进测试
            </h4>
            <p className="settings-description">
              按设定轮数连续发送同一句测试指令，用于抽查多轮剧情推进、变量块写入和回复稳定性。
            </p>

            <div className="auto-test-control-panel">
              <div className="settings-row settings-row-vertical">
                <label className="settings-label">测试指令</label>
                <textarea
                  className="settings-textarea auto-test-prompt-input"
                  value={autoTestPrompt}
                  onChange={(event) => setAutoTestPrompt(event.target.value)}
                  disabled={isAutoTestRunning}
                  rows={3}
                  spellCheck={false}
                />
              </div>

              <div className="auto-test-grid">
                <div className="settings-row settings-row-vertical">
                  <label className="settings-label">对话轮数</label>
                  <input
                    className="settings-number-input auto-test-number-input"
                    type="number"
                    min={1}
                    max={AUTO_TEST_MAX_COUNT}
                    value={autoTestCount}
                    onChange={(event) => setAutoTestCount(clampAutoTestCount(Number(event.target.value)))}
                    disabled={isAutoTestRunning}
                  />
                </div>
                <div className="settings-row settings-row-vertical">
                  <label className="settings-label">轮间等待秒</label>
                  <input
                    className="settings-number-input auto-test-number-input"
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={autoTestDelaySeconds}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setAutoTestDelaySeconds(Number.isFinite(value) ? Math.max(0, value) : 0);
                    }}
                    disabled={isAutoTestRunning}
                  />
                </div>
              </div>

              <div className="auto-test-actions">
                <button
                  className="settings-action-btn primary"
                  type="button"
                  onClick={handleStartAutoTest}
                  disabled={isAutoTestRunning || isGenerating || !autoTestPrompt.trim()}
                >
                  <Icons.Send size={16} />
                  <span>{isAutoTestRunning ? '测试中' : '开始测试'}</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={handleStopAutoTest}
                  disabled={!isAutoTestRunning}
                >
                  <Icons.Close size={16} />
                  <span>停止</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={handleClearAutoTestResults}
                  disabled={isAutoTestRunning || !hasAutoTestResults}
                >
                  <Icons.Refresh size={16} />
                  <span>清空</span>
                </button>
              </div>

              {(autoTestStatusText || hasAutoTestResults) && (
                <div className={`auto-test-status ${autoTestStatus}`}>
                  <span>{autoTestStatusText || '等待测试开始'}</span>
                  {hasAutoTestResults && (
                    <span className="auto-test-status-meta">
                      成功 {autoTestCompletedCount} / 失败 {autoTestFailedCount} / 共 {autoTestResults.length}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="auto-test-export-panel">
              <div className="auto-test-export-header">
                <div>
                  <h5>结果导出</h5>
                  <p>纯文本用于检查剧情质量；完整回复保留变量块，便于复制给其他 AI 检查变量生成。</p>
                </div>
              </div>
              <div className="auto-test-export-actions">
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleCopyAutoTestExport('plain')}
                  disabled={!hasAutoTestResults}
                >
                  <Icons.Copy size={16} />
                  <span>复制纯文本</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleDownloadAutoTestExport('plain')}
                  disabled={!hasAutoTestResults}
                >
                  <Icons.FileText size={16} />
                  <span>下载纯文本</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleCopyAutoTestExport('full')}
                  disabled={!hasAutoTestResults}
                >
                  <Icons.Copy size={16} />
                  <span>复制完整回复</span>
                </button>
                <button
                  className="settings-action-btn"
                  type="button"
                  onClick={() => handleDownloadAutoTestExport('full')}
                  disabled={!hasAutoTestResults}
                >
                  <Icons.FileText size={16} />
                  <span>下载完整回复</span>
                </button>
              </div>
            </div>

            <div className="auto-test-results">
              {autoTestResults.length === 0 ? (
                <div className="auto-test-empty">
                  <Icons.Send size={32} />
                  <p>暂无测试结果</p>
                </div>
              ) : (
                autoTestResults.map(result => (
                  <div
                    key={result.id}
                    className={`auto-test-result ${result.status} ${expandedAutoTestResultId === result.id ? 'expanded' : ''}`}
                  >
                    <button
                      className="auto-test-result-header"
                      type="button"
                      onClick={() => setExpandedAutoTestResultId(
                        expandedAutoTestResultId === result.id ? null : result.id,
                      )}
                    >
                      <span className="auto-test-result-title">第 {result.index} 轮</span>
                      <span className={`auto-test-result-badge ${result.status}`}>
                        {result.status === 'running' ? '生成中' : result.status === 'success' ? '完成' : '失败'}
                      </span>
                      <span className="auto-test-result-length">
                        {result.status === 'success'
                          ? `${result.plainResponse.length} / ${result.rawResponse.length} 字符`
                          : result.error || '等待回复'}
                      </span>
                      {expandedAutoTestResultId === result.id
                        ? <Icons.ChevronDown size={18} />
                        : <Icons.ChevronUp size={18} />}
                    </button>

                    {expandedAutoTestResultId !== result.id && result.plainResponse && (
                      <div className="auto-test-result-preview">
                        {result.plainResponse.slice(0, 180)}
                        {result.plainResponse.length > 180 && '...'}
                      </div>
                    )}

                    {expandedAutoTestResultId === result.id && (
                      <div className="auto-test-result-body">
                        <div className="auto-test-result-block">
                          <div className="auto-test-result-block-title">发送内容</div>
                          <pre>{result.prompt}</pre>
                        </div>
                        <div className="auto-test-result-block">
                          <div className="auto-test-result-block-title">纯文本回复</div>
                          <pre>{result.error ? `错误：${result.error}` : result.plainResponse || '(空)'}</pre>
                        </div>
                        <div className="auto-test-result-block">
                          <div className="auto-test-result-block-title">完整回复</div>
                          <pre>{result.error ? `错误：${result.error}` : result.rawResponse || '(空)'}</pre>
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
            <h4 className="settings-section-title">
              <span className="diamond-bullet"></span>
              消息调试日志
            </h4>
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
