import type { GenerationSettingsSyncReport, GenerationSettingsSyncScopeReport } from './tavern-settings';

type PopupApi = Pick<typeof SillyTavern, 'callGenericPopup' | 'POPUP_TYPE'>;

let queuedReport: GenerationSettingsSyncReport | null = null;
let activePopupTask: Promise<void> | null = null;

export function queueSettingsSyncPopup(report: GenerationSettingsSyncReport) {
  queuedReport = report;
  if (activePopupTask) {
    return;
  }

  activePopupTask = flushSettingsSyncPopupQueue();
}

async function flushSettingsSyncPopupQueue() {
  try {
    while (queuedReport) {
      const nextReport = queuedReport;
      queuedReport = null;
      await showSettingsSyncPopup(nextReport);
    }
  } finally {
    activePopupTask = null;
    if (queuedReport) {
      queueSettingsSyncPopup(queuedReport);
    }
  }
}

async function showSettingsSyncPopup(report: GenerationSettingsSyncReport) {
  const popupApi = getPopupApi();
  if (!popupApi?.callGenericPopup) {
    alert(formatSettingsSyncReportAsPlainText(report));
    return;
  }

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '12px';
  content.style.lineHeight = '1.6';

  const title = document.createElement('div');
  title.textContent = getSettingsSyncPopupTitle(report);
  title.style.fontSize = '1.1rem';
  title.style.fontWeight = '700';
  content.appendChild(title);

  const description = document.createElement('div');
  description.textContent = '已按当前开关同步到局部正则、局部脚本和当前角色世界书。';
  description.style.opacity = '0.85';
  description.style.fontSize = '0.95rem';
  content.appendChild(description);

  report.scopes.forEach(scope => {
    content.appendChild(createSettingsSyncScopeElement(scope));
  });

  await popupApi.callGenericPopup(content, popupApi.POPUP_TYPE.TEXT, '', {
    okButton: '知道了',
    cancelButton: false,
    wider: true,
    large: shouldUseLargePopup(report),
    leftAlign: true,
    allowVerticalScrolling: true,
  });
}

function createSettingsSyncScopeElement(scope: GenerationSettingsSyncScopeReport) {
  const section = document.createElement('section');
  section.style.padding = '10px 12px';
  section.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  section.style.borderRadius = '8px';
  section.style.background = 'rgba(255, 255, 255, 0.03)';

  const title = document.createElement('div');
  title.textContent = `${scope.scope} · ${getSettingsSyncScopeSummary(scope)}`;
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  section.appendChild(title);

  if (scope.changedItems.length > 0) {
    section.appendChild(createSettingsSyncList('已修改', scope.changedItems));
  }

  if (scope.missingLabels.length > 0) {
    section.appendChild(createSettingsSyncList('未找到资源', scope.missingLabels));
  }

  if (scope.changedItems.length === 0 && scope.missingLabels.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '本次同步没有发现需要调整的项目。';
    empty.style.opacity = '0.8';
    empty.style.fontSize = '0.95rem';
    section.appendChild(empty);
  }

  return section;
}

function createSettingsSyncList(label: string, items: string[]) {
  const group = document.createElement('div');
  group.style.marginTop = '8px';

  const title = document.createElement('div');
  title.textContent = label;
  title.style.fontWeight = '700';
  title.style.marginBottom = '4px';
  group.appendChild(title);

  const list = document.createElement('ul');
  list.style.margin = '0';
  list.style.paddingLeft = '1.25rem';

  items.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    list.appendChild(listItem);
  });

  group.appendChild(list);
  return group;
}

function getSettingsSyncPopupTitle(report: GenerationSettingsSyncReport) {
  if (report.hasMissing) {
    return '开局设置已同步，但有部分资源未找到';
  }

  if (report.hasChanges) {
    return '开局设置已同步';
  }

  return '开局设置未发生修改';
}

function getSettingsSyncScopeSummary(scope: GenerationSettingsSyncScopeReport) {
  if (scope.changedItems.length > 0 && scope.missingLabels.length > 0) {
    return `已修改 ${scope.changedItems.length} 项，未找到 ${scope.missingLabels.length} 项`;
  }

  if (scope.changedItems.length > 0) {
    return `已修改 ${scope.changedItems.length} 项`;
  }

  if (scope.missingLabels.length > 0) {
    return `未找到 ${scope.missingLabels.length} 项`;
  }

  return '未发生修改';
}

function shouldUseLargePopup(report: GenerationSettingsSyncReport) {
  return report.scopes.some(scope => scope.changedItems.length + scope.missingLabels.length >= 6);
}

function formatSettingsSyncReportAsPlainText(report: GenerationSettingsSyncReport) {
  const lines = [getSettingsSyncPopupTitle(report), '已按当前开关同步到局部正则、局部脚本和当前角色世界书。'];

  report.scopes.forEach(scope => {
    lines.push('');
    lines.push(`${scope.scope}：${getSettingsSyncScopeSummary(scope)}`);

    if (scope.changedItems.length > 0) {
      lines.push('已修改:');
      scope.changedItems.forEach(item => lines.push(`- ${item}`));
    }

    if (scope.missingLabels.length > 0) {
      lines.push('未找到资源:');
      scope.missingLabels.forEach(item => lines.push(`- ${item}`));
    }

    if (scope.changedItems.length === 0 && scope.missingLabels.length === 0) {
      lines.push('本次同步没有发现需要调整的项目。');
    }
  });

  return lines.join('\n');
}

function getPopupApi(): PopupApi | undefined {
  const parentWindow = window.parent as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  const currentWindow = window as Window & typeof globalThis & { SillyTavern?: typeof SillyTavern };
  return parentWindow.SillyTavern || currentWindow.SillyTavern;
}
