import React, { useCallback, useRef, useState } from 'react';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_REGEX_SETTINGS,
  DEFAULT_SUMMARY_SETTINGS,
  DEFAULT_SUMMARY_TAB_SETTINGS,
  DisplaySettings,
  RegexRule,
  SummarySettings,
  SummaryApiConfig,
  SummaryThresholds,
  createRegexRule,
  imageToBase64,
  importTavernRegexes,
  validateRegex
} from '../utils/settingsManager';
import {
  checkSummaryTrigger,
  triggerManualSummary,
  getIsSummarizing,
  type SummaryTriggerResult,
  type BatchSummaryResult,
} from '../utils/summaryManager';
import { Icons } from './Icons';
import { DebugLogEntry } from '../hooks';
import { uiLogger } from '../utils/logger';

interface SettingsPanelProps {
  settings: DisplaySettings;
  onSettingsChange: (settings: DisplaySettings) => void;
  debugLogs?: DebugLogEntry[];
  onClearDebugLogs?: () => void;
}

/**
 * 设置面板组件
 * 提供正文显示、背景和正则替换的设置功能
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  debugLogs = [],
  onClearDebugLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'display' | 'background' | 'regex' | 'summary' | 'debug'>('display');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // 自动总结相关状态
  const [summaryStatus, setSummaryStatus] = useState<SummaryTriggerResult | null>(null);
  const [isSummaryRunning, setIsSummaryRunning] = useState(false);
  const [summaryResult, setSummaryResult] = useState<BatchSummaryResult | null>(null);

  // 更新单个设置项
  const updateSetting = useCallback(<K extends keyof DisplaySettings>(
    key: K,
    value: DisplaySettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  }, [settings, onSettingsChange]);

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
        onSettingsChange({
          ...settings,
          ...DEFAULT_REGEX_SETTINGS,
        });
        break;
      case 'summary':
        onSettingsChange({
          ...settings,
          ...DEFAULT_SUMMARY_TAB_SETTINGS,
        });
        setSummaryStatus(null);
        setSummaryResult(null);
        break;
      case 'debug':
        // 清空调试日志
        onClearDebugLogs?.();
        break;
    }
  }, [activeTab, settings, onSettingsChange, onClearDebugLogs]);

  // 获取当前页面的重置按钮文本
  const getResetButtonText = useCallback(() => {
    switch (activeTab) {
      case 'display':
        return '重置正文显示';
      case 'background':
        return '重置背景设置';
      case 'regex':
        return '清空所有规则';
      case 'summary':
        return '重置总结设置';
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

  // 添加正则规则
  const addRegexRule = useCallback(() => {
    const newRule = createRegexRule();
    updateSetting('regexRules', [...settings.regexRules, newRule]);
  }, [settings.regexRules, updateSetting]);

  // 更新正则规则
  const updateRegexRule = useCallback((id: string, updates: Partial<RegexRule>) => {
    const newRules = settings.regexRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    );
    updateSetting('regexRules', newRules);
  }, [settings.regexRules, updateSetting]);

  // 删除正则规则
  const deleteRegexRule = useCallback((id: string) => {
    const newRules = settings.regexRules.filter(rule => rule.id !== id);
    updateSetting('regexRules', newRules);
  }, [settings.regexRules, updateSetting]);

  // 切换正则规则启用状态
  const toggleRegexRule = useCallback((id: string) => {
    const rule = settings.regexRules.find(r => r.id === id);
    if (rule) {
      updateRegexRule(id, { enabled: !rule.enabled });
    }
  }, [settings.regexRules, updateRegexRule]);

  // 导入酒馆正则
  const handleImportTavernRegexes = useCallback(() => {
    const importedRules = importTavernRegexes();
    if (importedRules.length === 0) {
      alert('没有找到符合条件的酒馆正则\n\n筛选条件：\n• 已启用\n• 无最小深度\n• 作用于 AI 输出\n• 仅用于格式显示');
      return;
    }
    
    // 获取现有规则的描述列表（用于重名检查）
    const existingDescriptions = new Set(
      settings.regexRules
        .map(rule => rule.description)
        .filter((desc): desc is string => !!desc)
    );
    
    // 过滤掉重名的规则
    const newRules = importedRules.filter(
      rule => !rule.description || !existingDescriptions.has(rule.description)
    );
    const skippedCount = importedRules.length - newRules.length;
    
    if (newRules.length === 0) {
      alert(`所有 ${importedRules.length} 条酒馆正则都已存在（重名），未导入任何规则`);
      return;
    }
    
    // 将导入的规则添加到现有规则列表末尾
    updateSetting('regexRules', [...settings.regexRules, ...newRules]);

    if (skippedCount > 0) {
      alert(`成功导入 ${newRules.length} 条酒馆正则规则\n跳过 ${skippedCount} 条重名规则`);
    } else {
      alert(`成功导入 ${newRules.length} 条酒馆正则规则`);
    }
  }, [settings.regexRules, updateSetting]);

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
          <span>正文显示</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'background' ? 'active' : ''}`}
          onClick={() => setActiveTab('background')}
        >
          <Icons.Map size={16} />
          <span>背景设置</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'regex' ? 'active' : ''}`}
          onClick={() => setActiveTab('regex')}
        >
          <Icons.Scroll size={16} />
          <span>正则替换</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          <Icons.Scroll size={16} />
          <span>自动总结</span>
        </button>
        <button
          className={`settings-tab ${activeTab === 'debug' ? 'active' : ''}`}
          onClick={() => setActiveTab('debug')}
        >
          <Icons.Debug size={16} />
          <span>调试</span>
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
              使用正则表达式替换正文中的内容。规则按顺序执行。
            </p>

            {/* 规则列表 */}
            <div className="regex-rules-list">
              {settings.regexRules.length === 0 ? (
                <div className="regex-empty">
                  <Icons.Scroll size={32} />
                  <p>暂无替换规则</p>
                </div>
              ) : (
                settings.regexRules.map((rule, index) => (
                  <RegexRuleItem
                    key={rule.id}
                    rule={rule}
                    index={index}
                    onUpdate={(updates) => updateRegexRule(rule.id, updates)}
                    onDelete={() => deleteRegexRule(rule.id)}
                    onToggle={() => toggleRegexRule(rule.id)}
                  />
                ))
              )}
            </div>

            {/* 按钮组 */}
            <div className="regex-buttons-group">
              {/* 添加规则按钮 */}
              <button className="settings-add-btn" onClick={addRegexRule}>
                <span className="add-icon">+</span>
                <span>添加规则</span>
              </button>

              {/* 导入酒馆正则按钮 */}
              <button className="settings-import-btn" onClick={handleImportTavernRegexes}>
                <Icons.Scroll size={14} />
                <span>导入酒馆正则</span>
              </button>
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
