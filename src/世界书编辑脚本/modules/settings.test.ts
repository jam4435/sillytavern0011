import _ from 'lodash';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type SettingsModule = typeof import('./settings.js');

const STORAGE_KEY = 'lorebook-ai-workspace-settings';
let settingsModule: SettingsModule;

beforeAll(async () => {
  Object.assign(globalThis, { _ });
  settingsModule = await import('./settings.js');
});

beforeEach(() => {
  settingsModule.flushAiWorkspaceSettings();
  window.localStorage.clear();
});

afterAll(() => {
  settingsModule.flushAiWorkspaceSettings();
});

describe('AI 工作区设置 schema v3', () => {
  it('迁移当前活动的旧 plan 草稿并丢弃所有运行态字段', () => {
    const normalized = settingsModule.normalizeAiWorkspaceSettings({
      navMode: 'plan',
      lorebookName: '根级回退',
      direct: { instruction: '直接模式指令', selectedEntryUids: [1] },
      plan: {
        lorebookName: '计划世界书',
        instruction: '计划模式指令',
        selectedEntryUids: ['2', 2],
        readonlyEntryUids: [2, 3],
        currentStep: 'result',
        planningResult: { plan: { goal: '不应保存' } },
        previewResult: { entries: [{ uid: 2 }] },
        debugInfo: { raw: true },
        statusText: '处理中',
      },
    });

    expect(normalized).toMatchObject({
      schemaVersion: 3,
      activeMode: 'plan',
      modifyStrategy: 'plan',
      draft: {
        lorebookName: '计划世界书',
        instruction: '计划模式指令',
        selectedEntryUids: [2],
        readonlyEntryUids: [3],
      },
    });
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain('planningResult');
    expect(serialized).not.toContain('previewResult');
    expect(serialized).not.toContain('currentStep');
    expect(serialized).not.toContain('debugInfo');
    expect(serialized).not.toContain('statusText');
    expect(normalized).not.toHaveProperty('direct');
    expect(normalized).not.toHaveProperty('plan');
  });

  it.each(['api', 'generate'])('旧 %s 导航回退迁移 direct 草稿', navMode => {
    const normalized = settingsModule.normalizeAiWorkspaceSettings({
      navMode,
      direct: { instruction: '直接草稿', selectedEntryUids: [5] },
      plan: { instruction: '计划草稿', selectedEntryUids: [6] },
    });
    expect(normalized.modifyStrategy).toBe('direct');
    expect(normalized.activeMode).toBe('direct');
    expect(normalized.draft).toMatchObject({ instruction: '直接草稿', selectedEntryUids: [5] });
  });

  it('只将一份草稿防抖落盘，读取时仍兼容旧属性访问', () => {
    vi.useFakeTimers();
    settingsModule.setAiWorkspaceSettings({
      schemaVersion: 3,
      activeMode: 'plan',
      modifyStrategy: 'plan',
      strategy: 'plan',
      draft: {
        lorebookName: '测试世界书',
        instruction: '统一风格',
        selectedEntryUids: [8],
        chatContext: { enabled: true, messageCount: 12, mode: 'manual', manualText: '手工上下文' },
        chatMessages: [{ message_id: 1, name: 'A', role: 'user', message: '结构化消息' }],
        planningResult: { should: 'drop' },
      },
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const pending = settingsModule.getAiWorkspaceSettings();
    expect(pending.navMode).toBe('plan');
    expect(pending.plan).toBe(pending.draft);
    expect(pending.lorebookName).toBe('测试世界书');
    expect(pending.draft.chatContext).toMatchObject({ mode: 'manual', manualText: '手工上下文' });

    vi.advanceTimersByTime(settingsModule.AI_WORKSPACE_SAVE_DEBOUNCE_MS - 1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    expect(persisted).toMatchObject({ schemaVersion: 3, activeMode: 'plan', modifyStrategy: 'plan' });
    expect(persisted).not.toHaveProperty('strategy');
    expect(persisted).not.toHaveProperty('navMode');
    expect(persisted).not.toHaveProperty('direct');
    expect(persisted).not.toHaveProperty('plan');
    expect(persisted.draft).not.toHaveProperty('planningResult');
  });

  it('兼容旧调用方修改 navMode 和 mode 属性后再 set', () => {
    vi.useFakeTimers();
    const settings = settingsModule.getAiWorkspaceSettings();
    settings.navMode = 'plan';
    settings.plan = {
      ...settings.plan,
      lorebookName: '兼容世界书',
      instruction: '兼容调用',
      readonlyEntryUids: [9],
    };
    settingsModule.setAiWorkspaceSettings(settings);
    vi.runOnlyPendingTimers();

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    expect(persisted).toMatchObject({
      schemaVersion: 3,
      activeMode: 'plan',
      modifyStrategy: 'plan',
      draft: { lorebookName: '兼容世界书', instruction: '兼容调用', readonlyEntryUids: [9] },
    });
  });

  it('助手条目上下文开关默认关闭，并只接受严格布尔值', () => {
    expect(settingsModule.normalizeAiWorkspaceSettings({}).draft.assistantEntryContext).toEqual({
      editable: false,
      readonly: false,
    });

    const normalized = settingsModule.normalizeAiWorkspaceSettings({
      schemaVersion: 3,
      draft: {
        assistantEntryContext: { editable: true, readonly: 'true' },
        assistantChatHistory: [
          {
            role: 'user',
            content: '请比较这些条目',
            entryContext: { lorebookName: '测试世界书', editableCount: '2', readonlyCount: 1 },
          },
        ],
      },
    });

    expect(normalized.draft.assistantEntryContext).toEqual({ editable: true, readonly: false });
    expect(normalized.draft.assistantChatHistory[0]).toMatchObject({
      entryContext: { lorebookName: '测试世界书', editableCount: 2, readonlyCount: 1 },
    });
  });

  it('从 v2 迁移单一修改草稿，并保留生成模式选择与活动项目', () => {
    const normalized = settingsModule.normalizeAiWorkspaceSettings({
      schemaVersion: 2,
      strategy: 'plan',
      activeMode: 'generate',
      activeGenerationProjectId: 'project-42',
      draft: {
        lorebookName: 'v2 世界书',
        instruction: '保留这份草稿',
        selectedEntryUids: [42],
      },
    });

    expect(normalized).toMatchObject({
      schemaVersion: 3,
      activeMode: 'generate',
      modifyStrategy: 'plan',
      activeGenerationProjectId: 'project-42',
      draft: {
        lorebookName: 'v2 世界书',
        instruction: '保留这份草稿',
        selectedEntryUids: [42],
      },
    });
  });

  it('非法生成项目 ID 和工作模式回退到修改策略', () => {
    expect(
      settingsModule.normalizeAiWorkspaceSettings({
        schemaVersion: 3,
        activeMode: 'unknown',
        modifyStrategy: 'plan',
        activeGenerationProjectId: '   ',
      }),
    ).toMatchObject({
      schemaVersion: 3,
      activeMode: 'plan',
      modifyStrategy: 'plan',
      activeGenerationProjectId: null,
    });
  });
});
