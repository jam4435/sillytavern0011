import _ from 'lodash';
import $ from 'jquery';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let buildAssistantModalMarkup: typeof import('./aiWorkspaceDesktop.js').buildAssistantModalMarkup;
let buildApiSettingsMarkup: typeof import('./aiWorkspaceDesktop.js').buildApiSettingsMarkup;
let buildDesktopShellMarkup: typeof import('./aiWorkspaceDesktop.js').buildDesktopShellMarkup;
let buildInfoResourcesMarkup: typeof import('./aiWorkspaceDesktop.js').buildInfoResourcesMarkup;
let buildStepIndicator: typeof import('./aiWorkspaceDesktop.js').buildStepIndicator;
let renderEntryList: typeof import('./aiWorkspaceDesktop.js').renderEntryList;

beforeAll(async () => {
  vi.stubGlobal('_', _);
  vi.stubGlobal('$', $);
  ({
    buildApiSettingsMarkup,
    buildAssistantModalMarkup,
    buildDesktopShellMarkup,
    buildInfoResourcesMarkup,
    buildStepIndicator,
    renderEntryList,
  } = await import('./aiWorkspaceDesktop.js'));
});

describe('AI 世界书条目范围渲染', () => {
  it('初始化空模式时可以完成首屏渲染，不会中断后续世界书名称加载', () => {
    document.body.innerHTML = `
      <div id="lorebook-ai-workspace">
        <div id="ai-workspace-entry-list"></div>
        <div id="ai-workspace-selection-summary"></div>
      </div>
    `;

    expect(() => renderEntryList('direct')).not.toThrow();
    expect(document.querySelector('#ai-workspace-entry-list')).toHaveTextContent('这个世界书没有可处理的条目');
    expect(document.querySelector('#ai-workspace-selection-summary')).toHaveTextContent('总计 0 条');
  });
});

describe('AI 工作台紧凑控件布局', () => {
  it('聊天上下文与 API 选项都使用文字同行的控件标签', () => {
    document.body.innerHTML = `${buildInfoResourcesMarkup()}${buildApiSettingsMarkup()}`;

    const controlIds = [
      'ai-workspace-chat-context-enabled',
      'ai-workspace-stream',
      'ai-workspace-budget-enabled',
    ];
    controlIds.forEach(id => {
      const control = document.querySelector<HTMLInputElement>(`#${id}`);
      expect(control?.closest('label')).toHaveClass('ai-control-line');
      expect(control?.nextElementSibling).toBeInstanceOf(HTMLSpanElement);
    });

    const apiModeOptions = document.querySelectorAll<HTMLInputElement>('input[name="ai-workspace-api-mode"]');
    expect(apiModeOptions).toHaveLength(2);
    apiModeOptions.forEach(control => expect(control.closest('label')).toHaveClass('ai-control-line'));
  });

  it('阶段说明作为整个步骤条下方的独立提示呈现', () => {
    document.body.innerHTML = buildStepIndicator('direct');

    const progress = document.querySelector('.ai-workflow-progress');
    const description = document.querySelector('.ai-step-description');
    expect(progress?.children[0]).toHaveClass('ai-stepper');
    expect(progress?.children[1]).toBe(description);
    expect(description).toHaveTextContent('当前阶段提示');
    expect(description).toHaveTextContent('改动后需要重新生成审阅结果');
  });

  it('顶部助手入口使用可用的手机图标', () => {
    document.body.innerHTML = buildDesktopShellMarkup();

    const trigger = document.querySelector('[data-ai-open-assistant-tab="chat"]');
    expect(trigger).toHaveAttribute('title', '打开随身 AI 助手');
    expect(trigger?.querySelector('i')).toHaveClass('fa-mobile-screen-button');
  });
});

describe('AI 助手手机窗语义', () => {
  it('使用原生 dialog、可访问 tabs、消息日志和状态播报', () => {
    document.body.innerHTML = buildAssistantModalMarkup();

    const dialog = document.querySelector<HTMLDialogElement>('#ai-workspace-assistant-modal');
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const log = document.querySelector<HTMLElement>('#ai-workspace-assistant-history');
    const liveStatus = document.querySelector<HTMLElement>('#ai-workspace-assistant-status');

    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(tabs).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(tabs.map(tab => tab.getAttribute('aria-controls'))).toEqual(panels.map(panel => panel.id));
    expect(log).toHaveAttribute('role', 'log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(liveStatus).toHaveAttribute('role', 'status');
    expect(liveStatus).toHaveAttribute('aria-live', 'polite');
  });

  it('保留资料同步与助手事件委托依赖的稳定节点', () => {
    document.body.innerHTML = buildAssistantModalMarkup();

    expect(document.querySelector('#ai-workspace-reference-material')).toBeInstanceOf(HTMLTextAreaElement);
    expect(document.querySelector('#ai-workspace-assistant-send')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('#ai-workspace-assistant-selection-add')).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector('#ai-workspace-assistant-new-reply')).toHaveAttribute('hidden');
  });
});
