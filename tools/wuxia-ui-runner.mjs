import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright-core';

const SELECTORS = {
  input: '[data-wuxia-automation="player-input"]',
  send: '[data-wuxia-automation="send-turn"]',
  generation: '[data-wuxia-automation~="generation-state"]',
  regenerate: '[data-wuxia-automation~="regenerate-last-reply"]',
  latestReply: '[data-wuxia-automation="latest-reply"]',
  openSettings: '[data-wuxia-automation="open-settings"]',
  openDebugTab: '[data-wuxia-automation="open-debug-tab"]',
  openVariablesTab: '[data-wuxia-automation="open-variables-tab"]',
  closeModal: '[data-wuxia-automation="close-modal"]',
  debugSection: '[data-wuxia-automation="debug-section"]',
  debugToggle: '[data-wuxia-automation="debug-section-toggle"]',
  debugContent: '[data-wuxia-automation="debug-section-content"]',
  statDataSnapshot: '[data-wuxia-automation="stat-data-snapshot"]',
  openHistoryPanel: '[data-wuxia-automation="open-history-panel"]',
  historyPanel: '[data-wuxia-automation="history-panel"]',
  historyNode: '[data-wuxia-automation="history-node"]',
  historyStatus: '[data-wuxia-automation="history-status"]',
  continueHistoryNode: '[data-wuxia-automation="continue-history-node"]',
  confirmHistoryCheckout: '[data-wuxia-automation="confirm-history-checkout"]',
  stopGenerationIcon: 'i.fa-circle-stop',
};

const EXPECTED_DEBUG_SECTIONS = ['main-input', 'main-output', 'variable-input', 'variable-output'];

function printUsage() {
  console.log(`武侠外部 UI runner

用法：
  pnpm wuxia:ui -- --turns 5 --action "在客栈向掌柜打听消息"
  pnpm wuxia:ui -- --regenerate --output wuxia-regenerate-report.json
  pnpm wuxia:ui -- --restart-from-first-reply --output wuxia-restart-report.json

选项：
  --endpoint <url>       Chrome CDP 地址，默认 http://127.0.0.1:9333
  --page-url <text>      只检查 URL 包含该文本的页面，默认 127.0.0.1:8000
  --turns <n>            推进轮数，默认 1
  --action <text>        每轮发送的行动；可重复传入，为各轮指定不同文本
  --settle-ms <ms>       旋转结束后的稳定等待，默认 5000
  --timeout-ms <ms>      单轮生成超时，默认 180000
  --output <path>        将完整报告写入 JSON 文件
  --inspect-only         不发送行动，只检查当前 iframe、空闲状态与回复（首次回合不要求调试框）
  --stat-data-snapshot   仅配合 --inspect-only，按需读取变量页的完整聊天级 stat_data
  --regenerate           只重新生成最新 assistant swipe 一次，不新建 user 楼层
  --restart-from-first-reply
                         通过“存档与分叉”回到当前脉络的首个 assistant 回复，不发送或生成
  --reload-page          重新加载匹配的酒馆页面并等待武侠 iframe 就绪，不发送或生成
  --stop-generation      仅在页面正在生成时，通过酒馆终止按钮停止当前生成
  --continue-on-error    调试状态为 error 时继续下一轮
  --help                 显示帮助

runner 只连接已启动的 Chrome，不会启动、关闭或切换你的浏览器窗口。`);
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数，收到：${value}`);
  }
  return parsed;
}

function requireValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} 缺少参数`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    endpoint: 'http://127.0.0.1:9333',
    pageUrl: '127.0.0.1:8000',
    turns: 1,
    actions: [],
    settleMs: 5_000,
    timeoutMs: 180_000,
    output: '',
    inspectOnly: false,
    statDataSnapshot: false,
    regenerate: false,
    restartFromFirstReply: false,
    reloadPage: false,
    stopGeneration: false,
    continueOnError: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--continue-on-error') {
      options.continueOnError = true;
      continue;
    }
    if (arg === '--inspect-only') {
      options.inspectOnly = true;
      continue;
    }
    if (arg === '--stat-data-snapshot') {
      options.statDataSnapshot = true;
      continue;
    }
    if (arg === '--regenerate') {
      options.regenerate = true;
      continue;
    }
    if (arg === '--restart-from-first-reply') {
      options.restartFromFirstReply = true;
      continue;
    }
    if (arg === '--reload-page') {
      options.reloadPage = true;
      continue;
    }
    if (arg === '--stop-generation') {
      options.stopGeneration = true;
      continue;
    }

    const value = requireValue(argv, index, arg);
    index += 1;
    if (arg === '--endpoint') options.endpoint = value;
    else if (arg === '--page-url') options.pageUrl = value;
    else if (arg === '--turns') options.turns = parsePositiveInteger(value, arg);
    else if (arg === '--action') options.actions.push(value);
    else if (arg === '--settle-ms') options.settleMs = parsePositiveInteger(value, arg);
    else if (arg === '--timeout-ms') options.timeoutMs = parsePositiveInteger(value, arg);
    else if (arg === '--output') options.output = value;
    else throw new Error(`未知选项：${arg}`);
  }

  if (options.statDataSnapshot && !options.inspectOnly) {
    throw new Error('--stat-data-snapshot 只能与 --inspect-only 一起使用，避免默认逐轮读取完整变量');
  }
  const exclusiveModeCount = [
    options.inspectOnly,
    options.stopGeneration,
    options.regenerate,
    options.restartFromFirstReply,
    options.reloadPage,
  ].filter(Boolean).length;
  if (exclusiveModeCount > 1) {
    throw new Error('--inspect-only、--stop-generation、--regenerate、--restart-from-first-reply 与 --reload-page 必须单独使用');
  }
  if (
    options.regenerate &&
    (options.inspectOnly ||
      options.restartFromFirstReply ||
      options.reloadPage ||
      options.stopGeneration ||
      options.actions.length > 0 ||
      options.turns !== 1)
  ) {
    throw new Error(
      '--regenerate 不能与推进、--restart-from-first-reply、--inspect-only、--stop-generation 或 --turns 一起使用',
    );
  }
  if (
    options.stopGeneration &&
    (options.inspectOnly ||
      options.regenerate ||
      options.restartFromFirstReply ||
      options.reloadPage ||
      options.actions.length > 0 ||
      options.turns !== 1)
  ) {
    throw new Error(
      '--stop-generation 不能与推进、--restart-from-first-reply、--inspect-only 或 --turns 一起使用',
    );
  }
  if (
    options.restartFromFirstReply &&
    (options.inspectOnly ||
      options.regenerate ||
      options.stopGeneration ||
      options.reloadPage ||
      options.actions.length > 0 ||
      options.turns !== 1)
  ) {
    throw new Error('--restart-from-first-reply 不能与推进、重生成、终止、--inspect-only 或 --turns 一起使用');
  }
  if (
    !options.inspectOnly &&
    !options.stopGeneration &&
    !options.regenerate &&
    !options.restartFromFirstReply &&
    !options.reloadPage &&
    options.actions.length === 0
  ) {
    throw new Error('至少需要一个 --action；若只提供一个，会在每轮重复使用');
  }
  if (
    !options.inspectOnly &&
    !options.stopGeneration &&
    !options.regenerate &&
    !options.restartFromFirstReply &&
    !options.reloadPage &&
    options.actions.length !== 1 &&
    options.actions.length !== options.turns
  ) {
    throw new Error(`--action 数量必须是 1 或与 --turns 相同；当前为 ${options.actions.length}/${options.turns}`);
  }
  return options;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isoTime() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${isoTime()}] ${message}`);
}

async function findGameFrame(browser, pageUrl, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastPages = [];

  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        lastPages.push(page.url());
        if (pageUrl && !page.url().includes(pageUrl)) continue;

        for (const frame of page.frames()) {
          try {
            if ((await frame.locator(SELECTORS.input).count()) > 0) {
              return { page, frame };
            }
          } catch {
            // iframe 正在换代，下一次轮询重新扫描。
          }
        }
      }
    }
    await sleep(100);
  }

  const pages = [...new Set(lastPages)].join(', ') || '(没有页面)';
  throw new Error(`找不到武侠游戏 iframe；已检查页面：${pages}`);
}

async function inspectGeneration(browser, pageUrl) {
  const { page, frame } = await findGameFrame(browser, pageUrl, 2_000);
  const marker = frame.locator(SELECTORS.generation).first();
  if ((await marker.count()) === 0) {
    throw new Error('页面缺少 generation-state DOM 标记，请确认已构建并刷新武侠界面');
  }
  return {
    generating: (await marker.getAttribute('data-wuxia-generating')) === 'true',
    visibilityState: await page.evaluate(() => document.visibilityState),
    pageUrl: page.url(),
    frameUrl: frame.url(),
  };
}

async function inspectUiReadiness(browser, pageUrl) {
  const { page, frame } = await findGameFrame(browser, pageUrl);
  const generation = await inspectGeneration(browser, pageUrl);
  const input = frame.locator(SELECTORS.input).first();
  const send = frame.locator(SELECTORS.send).first();
  const regenerate = frame.locator(SELECTORS.regenerate).first();
  const openSettings = frame.locator(SELECTORS.openSettings).first();

  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await send.waitFor({ state: 'visible', timeout: 10_000 });

  return {
    pageUrl: page.url(),
    frameUrl: frame.url(),
    generating: generation.generating,
    inputDisabled: await input.isDisabled(),
    sendDisabled: await send.isDisabled(),
    regenerateDisabled: (await regenerate.count()) > 0 ? await regenerate.isDisabled() : null,
    automation: {
      playerInput: true,
      sendTurn: true,
      generationState: true,
      regenerateLastReply: (await regenerate.count()) > 0,
      openSettings: (await openSettings.count()) > 0,
    },
  };
}

async function waitForGenerationState(browser, pageUrl, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    try {
      lastState = await inspectGeneration(browser, pageUrl);
      if (lastState.generating === expected) return lastState;
    } catch {
      // iframe 换代或 React 正在重建；重新查找。
    }
    await sleep(100);
  }

  throw new Error(
    `等待生成状态变为 ${expected} 超时（${timeoutMs}ms）` +
      (lastState ? `；最后状态：${JSON.stringify(lastState)}` : ''),
  );
}

async function stopCurrentGeneration(browser, pageUrl) {
  const before = await inspectGeneration(browser, pageUrl);
  if (!before.generating) {
    throw new Error('页面当前并未生成，拒绝点击终止按钮');
  }

  const { page, frame } = await findGameFrame(browser, pageUrl);
  // 酒馆终止按钮属于宿主聊天页；保留 iframe 回退，兼容将来把控件移入游戏页的布局。
  const candidates = [
    page.locator(SELECTORS.stopGenerationIcon).first(),
    frame.locator(SELECTORS.stopGenerationIcon).first(),
  ];
  let stopIcon = null;
  for (const candidate of candidates) {
    if (await candidate.isVisible()) {
      stopIcon = candidate;
      break;
    }
  }
  if (!stopIcon) {
    throw new Error('页面正在生成，但找不到酒馆终止图标 i.fa-circle-stop');
  }
  const clicked = await stopIcon.evaluate(element => {
    const control = element.closest('button, [role="button"], #mes_stop, .mes_stop') || element;
    if (!(control instanceof HTMLElement)) return false;
    control.click();
    return true;
  });
  if (!clicked) throw new Error('酒馆终止图标不可点击');

  const after = await waitForGenerationState(browser, pageUrl, false, 15_000);
  return {
    requestedAt: isoTime(),
    frameUrlBefore: before.frameUrl,
    frameUrlAfter: after.frameUrl,
    stopped: true,
  };
}

async function collectFrameDiagnostics(browser, pageUrl) {
  const diagnostics = [];
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.isClosed() || (pageUrl && !page.url().includes(pageUrl))) continue;
      for (const frame of page.frames()) {
        try {
          const entry = {
            pageUrl: page.url(),
            frameUrl: frame.url(),
            inputCount: await frame.locator(SELECTORS.input).count(),
            settingsButtonCount: await frame.locator(SELECTORS.openSettings).count(),
            debugTabCount: await frame.locator(SELECTORS.openDebugTab).count(),
            settingsPanelCount: await frame.locator('.settings-panel').count(),
            modalTitles: await frame.locator('.modal-title').allTextContents(),
          };
          if (
            entry.inputCount ||
            entry.settingsButtonCount ||
            entry.debugTabCount ||
            entry.settingsPanelCount ||
            entry.modalTitles.length
          ) {
            diagnostics.push(entry);
          }
        } catch (error) {
          diagnostics.push({ frameUrl: frame.url(), error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }
  return diagnostics;
}

async function openDebugPanel(browser, pageUrl) {
  let { frame } = await findGameFrame(browser, pageUrl);
  let debugTab = frame.locator(SELECTORS.openDebugTab).first();
  if (await debugTab.isVisible()) {
    await debugTab.click();
    return;
  }

  let settingsButton = frame.locator(SELECTORS.openSettings).first();

  if (!(await settingsButton.isVisible())) {
    const menuButton = frame.getByRole('button', { name: '切换菜单' });
    if (await menuButton.isVisible()) await menuButton.click();
    ({ frame } = await findGameFrame(browser, pageUrl));
    settingsButton = frame.locator(SELECTORS.openSettings).first();
  }

  await settingsButton.click();
  ({ frame } = await findGameFrame(browser, pageUrl));
  debugTab = frame.locator(SELECTORS.openDebugTab).first();
  if ((await debugTab.count()) === 0) {
    settingsButton = frame.locator(SELECTORS.openSettings).first();
    await settingsButton.evaluate(element => element.click());
    await sleep(100);
    ({ frame } = await findGameFrame(browser, pageUrl));
    debugTab = frame.locator(SELECTORS.openDebugTab).first();
  }
  try {
    await debugTab.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    const diagnostics = await collectFrameDiagnostics(browser, pageUrl);
    throw new Error(
      `打开设置后找不到调试标签。iframe 诊断：${JSON.stringify(diagnostics)}\n` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  await debugTab.click();
}

async function openVariablesPanel(browser, pageUrl) {
  let { frame } = await findGameFrame(browser, pageUrl);
  let variablesTab = frame.locator(SELECTORS.openVariablesTab).first();
  if (await variablesTab.isVisible()) {
    await variablesTab.click();
    return;
  }

  let settingsButton = frame.locator(SELECTORS.openSettings).first();
  if (!(await settingsButton.isVisible())) {
    const menuButton = frame.getByRole('button', { name: '切换菜单' });
    if (await menuButton.isVisible()) await menuButton.click();
    ({ frame } = await findGameFrame(browser, pageUrl));
    settingsButton = frame.locator(SELECTORS.openSettings).first();
  }

  await settingsButton.click();
  ({ frame } = await findGameFrame(browser, pageUrl));
  variablesTab = frame.locator(SELECTORS.openVariablesTab).first();
  await variablesTab.waitFor({ state: 'visible', timeout: 10_000 });
  await variablesTab.click();
}

async function closeModalIfOpen(browser, pageUrl) {
  const { frame } = await findGameFrame(browser, pageUrl);
  const closeButton = frame.locator(SELECTORS.closeModal).first();
  if (!(await closeButton.isVisible())) return false;

  // 调试弹窗可能被容器裁切到视口外；只关闭带自动化标记的弹窗。
  await closeButton.evaluate(element => {
    if (element instanceof HTMLElement) element.click();
  });
  await closeButton.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  await sleep(250);
  return true;
}

async function waitForHistoryPanelIdle(frame, timeoutMs = 20_000) {
  const panel = frame.locator(SELECTORS.historyPanel).first();
  await panel.waitFor({ state: 'visible', timeout: timeoutMs });
  const status = frame.locator(SELECTORS.historyStatus).first();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = (await status.getAttribute('data-wuxia-history-status').catch(() => null)) || 'loading';
    const message = ((await status.textContent().catch(() => '')) || '').trim();
    if (state === 'error') throw new Error(`历史谱牒加载失败：${message || '未知错误'}`);
    if (state !== 'loading') return { state, message };
    await sleep(100);
  }
  throw new Error(`等待历史谱牒完成扫描超时（${timeoutMs}ms）`);
}

async function openHistoryPanel(browser, pageUrl) {
  await closeModalIfOpen(browser, pageUrl);
  let { frame } = await findGameFrame(browser, pageUrl);
  const openButton = frame.locator(SELECTORS.openHistoryPanel).first();
  await openButton.waitFor({ state: 'visible', timeout: 10_000 });
  await openButton.click();
  await sleep(250);
  if (!(await frame.locator(SELECTORS.historyPanel).first().isVisible().catch(() => false))) {
    // 刚关闭其他弹窗时 React 状态提交可能晚于第一次点击；确认关闭后重试一次。
    await openButton.click();
  }
  let status;
  try {
    // 保持使用实际点击按钮的 iframe；页面里可能同时残留多个武侠 iframe，
    // 点击后重新全局扫描会误选到没有打开谱牒的旧 iframe。
    status = await waitForHistoryPanelIdle(frame);
  } catch (error) {
    // 仅在原 iframe 已被历史切换或热更新销毁时重新发现当前 iframe。
    if (!frame.isDetached()) {
      const diagnostics = await frame
        .locator('[data-wuxia-automation]')
        .evaluateAll(elements =>
          elements.map(element => ({
            automation: element.getAttribute('data-wuxia-automation'),
            visible: !!(element instanceof HTMLElement && (element.offsetWidth || element.offsetHeight)),
            text: (element.textContent || '').trim().slice(0, 160),
          })),
        )
        .catch(() => []);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n点击谱牒后的 iframe 诊断：${JSON.stringify(diagnostics)}`,
      );
    }
    ({ frame } = await findGameFrame(browser, pageUrl));
    status = await waitForHistoryPanelIdle(frame);
  }

  const fitView = frame.locator('.react-flow__controls-fitview').first();
  if (await fitView.isVisible().catch(() => false)) {
    await fitView.click();
    await sleep(400);
  }
  return { frame, status };
}

async function readFirstHistoryNode(frame) {
  const firstNode = frame.locator(`${SELECTORS.historyNode}[data-wuxia-history-depth="0"]`).first();
  await firstNode.waitFor({ state: 'visible', timeout: 10_000 });
  return {
    locator: firstNode,
    nodeId: (await firstNode.getAttribute('data-wuxia-history-node-id')) || '',
    preview: ((await firstNode.locator('.history-node-preview').textContent()) || '').trim(),
    current: (await firstNode.getAttribute('data-wuxia-history-current')) === 'true',
  };
}

async function restartFromFirstReply(browser, options) {
  const startedAt = Date.now();
  log('历史分叉：准备回到当前脉络的首个回复');
  const preflight = await inspectGeneration(browser, options.pageUrl);
  if (preflight.generating) throw new Error('页面当前正在生成，拒绝切换历史分支');

  const opened = await openHistoryPanel(browser, options.pageUrl);
  const first = await readFirstHistoryNode(opened.frame);
  const beforeFrameUrl = opened.frame.url();
  if (first.current) {
    await closeModalIfOpen(browser, options.pageUrl);
    return {
      mode: 'restart-from-first-reply',
      startedAt: new Date(startedAt).toISOString(),
      completedAt: isoTime(),
      alreadyAtFirstReply: true,
      selectedNodeId: first.nodeId,
      selectedPreview: first.preview,
      frameUrlBefore: beforeFrameUrl,
      frameUrlAfter: beforeFrameUrl,
      verifiedFirstNodeCurrent: true,
    };
  }

  await first.locator.click();
  const continueButton = opened.frame.locator(SELECTORS.continueHistoryNode).first();
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 });
  const action = (await continueButton.getAttribute('data-wuxia-history-action')) || '';
  if (await continueButton.isDisabled()) {
    throw new Error(`首个回复节点当前不可继续（动作：${action || '未知'}）`);
  }
  await continueButton.click();

  // “切换到该分支”会直接检出既有叶节点，不显示确认框；创建新分叉和
  // 切换异文仍须点击“确认继续”。
  if (action !== '切换到该分支' && action !== '返回主分支') {
    const confirmButton = opened.frame.locator(SELECTORS.confirmHistoryCheckout).first();
    await confirmButton.waitFor({ state: 'visible', timeout: 10_000 });
    if (await confirmButton.isDisabled()) throw new Error('“确认继续”当前不可用，历史事务可能仍在进行');
    await confirmButton.evaluate(element => {
      if (!(element instanceof HTMLElement)) throw new Error('“确认继续”控件不可点击');
      element.click();
    });
  }

  const checkoutDeadline = Date.now() + options.timeoutMs;
  let frameAfter = null;
  while (Date.now() < checkoutDeadline) {
    try {
      const candidate = await findGameFrame(browser, options.pageUrl, 2_000);
      if (candidate.frame.url() !== beforeFrameUrl) {
        const generation = await inspectGeneration(browser, options.pageUrl);
        const input = candidate.frame.locator(SELECTORS.input).first();
        if (!generation.generating && (await input.isVisible()) && !(await input.isDisabled())) {
          frameAfter = candidate.frame;
          break;
        }
      }
    } catch {
      // checkout 会切换聊天并重建 iframe；在新实例就绪前继续轮询。
    }
    await sleep(200);
  }
  if (!frameAfter) throw new Error(`等待历史分叉完成并解锁输入超时（${options.timeoutMs}ms）`);

  await sleep(options.settleMs);
  const reply = await readLatestReply(browser, options.pageUrl);
  const verifiedPanel = await openHistoryPanel(browser, options.pageUrl);
  const verifiedFirst = await readFirstHistoryNode(verifiedPanel.frame);
  await closeModalIfOpen(browser, options.pageUrl);
  if (!verifiedFirst.current) {
    throw new Error('历史分叉完成后，首个回复节点未成为当前节点，拒绝继续提示词测试');
  }

  return {
    mode: 'restart-from-first-reply',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: isoTime(),
    alreadyAtFirstReply: false,
    selectedNodeId: first.nodeId,
    selectedPreview: first.preview,
    checkoutAction: action,
    frameUrlBefore: beforeFrameUrl,
    frameUrlAfter: frameAfter.url(),
    verifiedNodeId: verifiedFirst.nodeId,
    verifiedPreview: verifiedFirst.preview,
    verifiedFirstNodeCurrent: true,
    reply,
    totalMs: Date.now() - startedAt,
  };
}

async function readStatDataSnapshot(browser, pageUrl) {
  try {
    // “事件记录”等其他弹窗会遮住设置按钮；快照读取必须与历史分叉一样，
    // 从没有前置弹窗的状态开始。
    await closeModalIfOpen(browser, pageUrl);
    await openVariablesPanel(browser, pageUrl);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { frame } = await findGameFrame(browser, pageUrl);
      const snapshot = frame.locator(SELECTORS.statDataSnapshot).first();
      if ((await snapshot.count()) === 0) {
        await sleep(100);
        continue;
      }

      const status = (await snapshot.getAttribute('data-wuxia-stat-data-status')) || 'idle';
      if (status === 'error') {
        const error = (await snapshot.getAttribute('data-wuxia-stat-data-error')) || '未知错误';
        throw new Error(`变量页读取完整 stat_data 失败：${error}`);
      }
      if (status === 'ready') {
        const raw = (await snapshot.textContent()) || '';
        try {
          return {
            capturedAt: (await snapshot.getAttribute('data-wuxia-stat-data-captured-at')) || '',
            statData: JSON.parse(raw),
          };
        } catch (error) {
          throw new Error(
            `变量页返回的 stat_data 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await sleep(100);
    }
    throw new Error('等待变量页完整 stat_data 快照超时（10000ms）');
  } finally {
    await closeModalIfOpen(browser, pageUrl);
  }
}

async function readDebugSections(browser, pageUrl, prompt) {
  await openDebugPanel(browser, pageUrl);
  try {
    const { frame } = await findGameFrame(browser, pageUrl);
    const sections = {};

    for (const id of EXPECTED_DEBUG_SECTIONS) {
      const section = frame.locator(`${SELECTORS.debugSection}[data-wuxia-debug-section="${id}"]`).first();
      await section.waitFor({ state: 'visible', timeout: 10_000 });
      const status = (await section.getAttribute('data-wuxia-debug-status')) || 'unknown';
      let content = section.locator(SELECTORS.debugContent).first();
      if ((await content.count()) === 0) {
        await section.locator(SELECTORS.debugToggle).click();
        content = section.locator(SELECTORS.debugContent).first();
        await content.waitFor({ state: 'visible', timeout: 5_000 });
      }
      sections[id] = { status, content: (await content.textContent()) || '' };
    }

    if (prompt && !sections['main-input'].content.includes(prompt)) {
      throw new Error('调试页正文输入不包含本轮行动，疑似读取到了上一轮调试副本');
    }

    return sections;
  } finally {
    await closeModalIfOpen(browser, pageUrl);
  }
}

async function readLatestReply(browser, pageUrl) {
  const { frame } = await findGameFrame(browser, pageUrl);
  return ((await frame.locator(SELECTORS.latestReply).first().innerText()) || '').trim();
}

async function runTurn(browser, options, turnIndex, prompt) {
  const startedAt = Date.now();
  log(`第 ${turnIndex}/${options.turns} 轮：准备发送「${prompt}」`);

  await closeModalIfOpen(browser, options.pageUrl);
  const { page, frame } = await findGameFrame(browser, options.pageUrl);
  const preflight = await inspectGeneration(browser, options.pageUrl);
  if (preflight.generating) throw new Error('页面当前正在生成，拒绝重复发送新行动');
  if ((await frame.locator(SELECTORS.openSettings).count()) === 0) {
    throw new Error('页面缺少 open-settings DOM 标记，请确认已构建并刷新武侠界面');
  }
  const visibilityAtStart = await page.evaluate(() => document.visibilityState);
  const input = frame.locator(SELECTORS.input).first();
  const send = frame.locator(SELECTORS.send).first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  if (await input.isDisabled()) throw new Error('玩家输入框当前不可用，游戏可能仍在生成或锁定');
  await input.fill(prompt);
  await send.click();

  const generationStartedAt = Date.now();
  const startState = await waitForGenerationState(browser, options.pageUrl, true, 15_000);
  log(`第 ${turnIndex} 轮：检测到旋转开始，页面状态 ${startState.visibilityState}`);
  const endState = await waitForGenerationState(browser, options.pageUrl, false, options.timeoutMs);
  const generationEndedAt = Date.now();
  log(`第 ${turnIndex} 轮：检测到旋转结束，等待 ${options.settleMs}ms 稳定窗口`);

  await sleep(options.settleMs);
  const debug = await readDebugSections(browser, options.pageUrl, prompt);
  const reply = await readLatestReply(browser, options.pageUrl);
  const failedSections = Object.entries(debug)
    .filter(([, value]) => value.status === 'error')
    .map(([id]) => id);

  const report = {
    turn: turnIndex,
    prompt,
    startedAt: new Date(startedAt).toISOString(),
    generationStartedAt: new Date(generationStartedAt).toISOString(),
    generationEndedAt: new Date(generationEndedAt).toISOString(),
    completedAt: isoTime(),
    generationMs: generationEndedAt - generationStartedAt,
    totalMs: Date.now() - startedAt,
    visibilityAtStart,
    visibilityAtGenerationEnd: endState.visibilityState,
    reply,
    debug,
    success: failedSections.length === 0,
    failedSections,
  };

  log(
    `第 ${turnIndex} 轮：${report.success ? '完成' : `失败（${failedSections.join(', ')}）`}，` +
      `生成 ${report.generationMs}ms，总计 ${report.totalMs}ms`,
  );
  return report;
}

async function runRegeneration(browser, options) {
  const startedAt = Date.now();
  log('受控重生成：准备重新生成最新回复');

  await closeModalIfOpen(browser, options.pageUrl);
  const { page, frame } = await findGameFrame(browser, options.pageUrl);
  const preflight = await inspectGeneration(browser, options.pageUrl);
  if (preflight.generating) throw new Error('页面当前正在生成，拒绝重新生成');
  if ((await frame.locator(SELECTORS.openSettings).count()) === 0) {
    throw new Error('页面缺少 open-settings DOM 标记，请确认已构建并刷新武侠界面');
  }

  const visibilityAtStart = await page.evaluate(() => document.visibilityState);
  const regenerate = frame.locator(SELECTORS.regenerate).first();
  await regenerate.waitFor({ state: 'visible', timeout: 10_000 });
  if (await regenerate.isDisabled()) {
    throw new Error('最新回复当前不可重新生成，可能没有 assistant 楼层或回合仍在锁定');
  }

  const previousReply = await readLatestReply(browser, options.pageUrl);
  await regenerate.evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('重新生成控件不可点击');
    element.click();
  });

  const generationStartedAt = Date.now();
  const startState = await waitForGenerationState(browser, options.pageUrl, true, 15_000);
  log(`受控重生成：检测到旋转开始，页面状态 ${startState.visibilityState}`);
  const endState = await waitForGenerationState(browser, options.pageUrl, false, options.timeoutMs);
  const generationEndedAt = Date.now();
  log(`受控重生成：检测到旋转结束，等待 ${options.settleMs}ms 稳定窗口`);

  await sleep(options.settleMs);
  const debug = await readDebugSections(browser, options.pageUrl, '');
  const reply = await readLatestReply(browser, options.pageUrl);
  const failedSections = Object.entries(debug)
    .filter(([, value]) => value.status === 'error')
    .map(([id]) => id);

  const report = {
    turn: 1,
    mode: 'regenerate',
    prompt: '',
    previousReply,
    startedAt: new Date(startedAt).toISOString(),
    generationStartedAt: new Date(generationStartedAt).toISOString(),
    generationEndedAt: new Date(generationEndedAt).toISOString(),
    completedAt: isoTime(),
    generationMs: generationEndedAt - generationStartedAt,
    totalMs: Date.now() - startedAt,
    visibilityAtStart,
    visibilityAtGenerationEnd: endState.visibilityState,
    reply,
    debug,
    success: failedSections.length === 0,
    failedSections,
  };

  log(
    `受控重生成：${report.success ? '完成' : `失败（${failedSections.join(', ')}）`}，` +
      `生成 ${report.generationMs}ms，总计 ${report.totalMs}ms`,
  );
  return report;
}

async function reloadGamePage(browser, options) {
  const before = await findGameFrame(browser, options.pageUrl);
  const pageUrlBefore = before.page.url();
  const frameUrlBefore = before.frame.url();
  await before.page.reload({ waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
  const after = await findGameFrame(browser, options.pageUrl, options.timeoutMs);
  await sleep(options.settleMs);
  return {
    mode: 'reload-page',
    pageUrlBefore,
    pageUrlAfter: after.page.url(),
    frameUrlBefore,
    frameUrlAfter: after.frame.url(),
    readiness: await inspectUiReadiness(browser, options.pageUrl),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  log(`连接 Chrome：${options.endpoint}`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(options.endpoint, { timeout: 30_000 });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法连接专用 Chrome：${options.endpoint}\n` +
        '请用 --remote-debugging-port=9333 和独立 --user-data-dir 手动启动 Chrome，然后保持酒馆标签页打开。\n' +
        `原始错误：${details}`,
    );
  }
  const report = {
    startedAt: isoTime(),
    options: { ...options, actions: [...options.actions] },
    turns: [],
    success: false,
  };

  try {
    await findGameFrame(browser, options.pageUrl);
    if (options.reloadPage) {
      report.reload = await reloadGamePage(browser, options);
      report.success = !report.reload.readiness.generating && !report.reload.readiness.inputDisabled;
      return;
    }
    if (options.inspectOnly) {
      await sleep(options.settleMs);
      report.inspect = {
        readiness: await inspectUiReadiness(browser, options.pageUrl),
        reply: await readLatestReply(browser, options.pageUrl),
      };
      if (options.statDataSnapshot) {
        report.inspect.statDataSnapshot = await readStatDataSnapshot(browser, options.pageUrl);
      }
      report.success = true;
      return;
    }
    if (options.stopGeneration) {
      report.termination = await stopCurrentGeneration(browser, options.pageUrl);
      report.inspect = {
        readiness: await inspectUiReadiness(browser, options.pageUrl),
        reply: await readLatestReply(browser, options.pageUrl),
      };
      report.success = !report.inspect.readiness.generating;
      return;
    }
    if (options.restartFromFirstReply) {
      try {
        report.restart = await restartFromFirstReply(browser, options);
        report.success = report.restart.verifiedFirstNodeCurrent === true;
      } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        log(`回到首个回复异常：${message}`);
        report.restart = { mode: 'restart-from-first-reply', success: false, error: message };
        report.success = false;
      }
      return;
    }
    if (options.regenerate) {
      try {
        const regeneration = await runRegeneration(browser, options);
        report.turns.push(regeneration);
        report.success = regeneration.success;
      } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        log(`受控重生成异常：${message}`);
        report.turns.push({ turn: 1, mode: 'regenerate', prompt: '', success: false, error: message });
        report.success = false;
      }
      return;
    }
    for (let index = 0; index < options.turns; index += 1) {
      const prompt = options.actions.length === 1 ? options.actions[0] : options.actions[index];
      try {
        const turn = await runTurn(browser, options, index + 1, prompt);
        report.turns.push(turn);
        if (!turn.success && !options.continueOnError) break;
      } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        log(`第 ${index + 1} 轮异常：${message}`);
        report.turns.push({ turn: index + 1, prompt, success: false, error: message });
        if (!options.continueOnError) break;
      }
    }
    report.success = report.turns.length === options.turns && report.turns.every(turn => turn.success);
  } finally {
    report.completedAt = isoTime();
    if (options.output) {
      await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      log(`报告已写入 ${options.output}`);
    }
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (!report.success) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
