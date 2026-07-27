import _ from 'lodash';
import $ from 'jquery';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let buildAssistantModalMarkup: typeof import('./aiWorkspaceDesktop.js').buildAssistantModalMarkup;
let buildAssistantEntryContextBlock: typeof import('./aiWorkspaceDesktop.js').buildAssistantEntryContextBlock;
let buildAssistantPrompt: typeof import('./aiWorkspaceDesktop.js').buildAssistantPrompt;
let buildApiSettingsMarkup: typeof import('./aiWorkspaceDesktop.js').buildApiSettingsMarkup;
let buildDesktopShellMarkup: typeof import('./aiWorkspaceDesktop.js').buildDesktopShellMarkup;
let buildInfoResourcesMarkup: typeof import('./aiWorkspaceDesktop.js').buildInfoResourcesMarkup;
let buildPreviewModalSections: typeof import('./aiWorkspaceDesktop.js').buildPreviewModalSections;
let buildStepIndicator: typeof import('./aiWorkspaceDesktop.js').buildStepIndicator;
let formatPreviewModalValue: typeof import('./aiWorkspaceDesktop.js').formatPreviewModalValue;
let renderEntryList: typeof import('./aiWorkspaceDesktop.js').renderEntryList;

beforeAll(async () => {
  vi.stubGlobal('_', _);
  vi.stubGlobal('$', $);
  ({
    buildApiSettingsMarkup,
    buildAssistantEntryContextBlock,
    buildAssistantModalMarkup,
    buildAssistantPrompt,
    buildDesktopShellMarkup,
    buildInfoResourcesMarkup,
    buildPreviewModalSections,
    buildStepIndicator,
    formatPreviewModalValue,
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
    expect(document.querySelector('#ai-workspace-assistant-include-editable')).toBeInstanceOf(HTMLInputElement);
    expect(document.querySelector('#ai-workspace-assistant-include-readonly')).toBeInstanceOf(HTMLInputElement);
    expect(document.querySelector('#ai-workspace-assistant-entry-context-status')).toHaveAttribute(
      'id',
      'ai-workspace-assistant-entry-context-status',
    );
  });

  it('把勾选的修改与只读条目按分组注入助手提示词', () => {
    const entryContext = {
      lorebookName: '群星志',
      editableEntries: [
        {
          uid: 11,
          name: '北境',
          content: '终年落雪。',
          promptSnapshot: { primary: ['北境'], secondaryLogic: 'and_any', secondary: ['雪'] },
        },
      ],
      readonlyEntries: [{ uid: 12, name: '王都', content: '位于南方。', promptSnapshot: {} }],
    };

    const block = buildAssistantEntryContextBlock(entryContext);
    const prompt = buildAssistantPrompt(
      '比较两地设定',
      { promptSettings: { jailbreakPromptTemplate: '' } },
      [],
      entryContext,
    );

    expect(block).toContain('<当前选中的世界书条目>');
    expect(JSON.parse(block.split('\n').slice(1, -1).join('\n'))).toMatchObject({
      worldbook_name: '群星志',
      editable_entries: [{
        uid: 11,
        name: '北境',
        content: '终年落雪。',
        keywords: { primary: ['北境'] },
      }],
      readonly_entries: [{ uid: 12, name: '王都', content: '位于南方。' }],
    });
    expect(block).not.toMatch(/secondary_logic|secondary/);
    expect(prompt).toContain(block);
    expect(prompt).toContain('修改/只读');
  });

  it('没有附带条目时不注入空的世界书上下文块', () => {
    const block = buildAssistantEntryContextBlock({
      lorebookName: '群星志',
      editableEntries: [],
      readonlyEntries: [],
      excludedEntries: [{ uid: 99, name: '排除项', content: '不应出现' }],
    });
    const prompt = buildAssistantPrompt('继续整理', { promptSettings: {} }, [], {});

    expect(block).toBe('');
    expect(prompt).not.toContain('<当前选中的世界书条目>');
    expect(prompt).not.toContain('排除项');
  });
});

describe('AI 修改审阅字段', () => {
  it('只显示标题、正文和主关键词，不暴露次级关键词编辑项', () => {
    const beforeEntry = {
      name: '旧标题',
      content: '旧正文',
      strategy: {
        keys: ['旧关键词'],
        keys_secondary: { logic: 'not_any', keys: ['旧次级'] },
      },
    };
    const afterEntry = {
      name: '新标题',
      content: '新正文',
      strategy: {
        keys: ['新关键词'],
        keys_secondary: { logic: 'and_all', keys: ['新次级'] },
      },
    };

    const sections = buildPreviewModalSections(
      { beforeEntry, afterEntry },
      { editableFields: { title: true, content: true, prompt: true } },
    );

    expect(sections.map(section => section.key)).toEqual(['title', 'keywords', 'content']);
    expect(sections.map(section => section.title)).toEqual(['标题', '关键词', '内容']);
  });

  it('关键词以单行 JSON 数组显示，不插入格式化换行', () => {
    expect(formatPreviewModalValue(['关键词一', '关键词二'])).toBe('["关键词一","关键词二"]');
  });
});
