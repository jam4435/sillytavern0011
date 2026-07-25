/**
 * @file ERA 变量框架 - 外部事件 API 实现模块
 * @description
 * 该模块是 ERA 框架与外部脚本交互的接口层。它实现了一系列自定义事件的处理器。
 *
 * **设计理念**:
 * ERA 框架不直接向外暴露函数调用接口。外部脚本与 ERA 交互的**唯一**方式是通过酒馆的
 * `eventEmit(eventName, eventData)` 函数，发送特定格式的事件。
 *
 * `index.ts` 模块会监听这些 `era:*` 前缀的事件，并将其推入 `event_queue.ts` 中进行处理。
 * 事件队列最终会调用本文件中对应的处理器函数（如 `insertByObject`）。
 *
 * 本模块中的函数通过一种巧妙、解耦的方式工作：它们在最新的 AI 消息末尾动态注入
 * `<VariableInsert>` 或 `<VariableEdit>` 指令块，然后调用酒馆的 `setChatMessages` 更新消息。
 * 这次修改会触发 `character_message_rendered` 等事件，被 ERA 的主监听器捕获，
 * 从而将 API 调用无缝地整合到 ERA 的原生解析和同步流程中。
 */

import _ from 'lodash';
import { scheduleUnthrottledTimeout } from '../../shared/unthrottledTimer';
import { createApiWriteScheduler } from './writeScheduler';
import { ERA_EVENT_EMITTER, WriteDonePayload } from '../utils/constants';
import { J, unescapeEraData } from '../utils/data';
import {
  createEraDiagnosticId,
  getActiveEraDiagnosticTask,
  recordEraDiagnostic,
  recordEraDiagnosticError,
  startEraDiagnosticWatchdog,
  updateEraDiagnosticState,
} from '../utils/diagnostics';
import { Logger } from '../utils/log';
import { findLastAiMessage, getMessageContent, updateMessageContent } from '../utils/message';

const logger = new Logger('api-command');

// API 写入任务的接口定义
interface ApiWriteJob {
  blockTag: 'VariableInsert' | 'VariableEdit' | 'VariableDelete';
  blockContent: object;
  diagnosticIds?: string[];
}

const API_WRITE_FLUSH_DELAY = 75;
const VARIABLE_BLOCK_REGEX = /<(VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/g;
const apiWriteQueue: ApiWriteJob[] = [];
let apiWriteFlushPromise: Promise<void> | null = null;

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyPlainObject(value: unknown) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function stripCodeFence(text: unknown) {
  return String(text ?? '').trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}$/i, '').trim();
}

function parseBlockContent(rawContent: string) {
  const content = stripCodeFence(rawContent);
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function mergeInsertFirstWins(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(source || {})) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (!(key in target)) {
      target[key] = cloneJson(sourceValue);
      continue;
    }
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeInsertFirstWins(targetValue, sourceValue);
    }
  }
  return target;
}

function mergeUpdateLastWins(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(source || {})) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeUpdateLastWins(targetValue, sourceValue);
    } else {
      target[key] = cloneJson(sourceValue);
    }
  }
  return target;
}

function mergeDeleteUnion(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(source || {})) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (!(key in target)) {
      target[key] = cloneJson(sourceValue);
      continue;
    }
    if (isEmptyPlainObject(targetValue) || isEmptyPlainObject(sourceValue)) {
      target[key] = {};
      continue;
    }
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeDeleteUnion(targetValue, sourceValue);
    }
  }
  return target;
}

function mergeJobInto(targetJob: ApiWriteJob, sourceJob: ApiWriteJob) {
  if (targetJob.blockTag !== sourceJob.blockTag) {
    return false;
  }
  if (targetJob.blockTag === 'VariableInsert') {
    mergeInsertFirstWins(targetJob.blockContent, sourceJob.blockContent);
  } else if (targetJob.blockTag === 'VariableEdit') {
    mergeUpdateLastWins(targetJob.blockContent, sourceJob.blockContent);
  } else {
    mergeDeleteUnion(targetJob.blockContent, sourceJob.blockContent);
  }
  targetJob.diagnosticIds = Array.from(new Set([...(targetJob.diagnosticIds ?? []), ...(sourceJob.diagnosticIds ?? [])]));
  return true;
}

function mergeAdjacentJobs(jobs: ApiWriteJob[]) {
  const merged: ApiWriteJob[] = [];
  for (const job of jobs) {
    const normalizedJob: ApiWriteJob = {
      blockTag: job.blockTag,
      blockContent: cloneJson(job.blockContent || {}),
      diagnosticIds: [...(job.diagnosticIds ?? [])],
    };
    const lastJob = merged[merged.length - 1];
    if (lastJob && mergeJobInto(lastJob, normalizedJob)) {
      continue;
    }
    merged.push(normalizedJob);
  }
  return merged;
}

function buildVariableBlock(job: ApiWriteJob) {
  let contentString: string;
  try {
    contentString = JSON.stringify(job.blockContent ?? {});
  } catch {
    contentString = J(job.blockContent ?? {});
  }
  return '\n<' + job.blockTag + '>\n' + contentString + '\n</' + job.blockTag + '>';
}

function compressVariableBlocksInText(text: string) {
  if (!text || text.indexOf('<Variable') < 0) {
    return text || '';
  }

  VARIABLE_BLOCK_REGEX.lastIndex = 0;
  let output = '';
  let cursor = 0;
  let pendingJob: ApiWriteJob | null = null;

  const flushPending = () => {
    if (!pendingJob) {
      return;
    }
    output += buildVariableBlock(pendingJob);
    pendingJob = null;
  };

  let match: RegExpExecArray | null;
  while ((match = VARIABLE_BLOCK_REGEX.exec(text)) !== null) {
    const before = text.slice(cursor, match.index);
    const blockContent = parseBlockContent(match[2]);
    const blockTag = match[1] as ApiWriteJob['blockTag'];
    if (!blockContent || !isPlainObject(blockContent)) {
      flushPending();
      output += before + match[0];
      cursor = match.index + match[0].length;
      continue;
    }

    const currentJob: ApiWriteJob = { blockTag, blockContent };
    if (pendingJob && before.trim() === '' && pendingJob.blockTag === blockTag) {
      mergeJobInto(pendingJob, currentJob);
    } else {
      flushPending();
      output += before;
      pendingJob = {
        blockTag,
        blockContent: cloneJson(blockContent),
      };
    }
    cursor = match.index + match[0].length;
  }

  flushPending();
  output += text.slice(cursor);
  return output;
}

async function flushApiWriteQueue() {
  if (apiWriteFlushPromise) {
    recordEraDiagnostic('api-command', 'flush-reused-inflight-promise', {
      queuedJobCount: apiWriteQueue.length,
    });
    return apiWriteFlushPromise;
  }

  apiWriteFlushPromise = (async () => {
    const jobs = apiWriteQueue.splice(0);
    if (jobs.length === 0) {
      return;
    }
    const flushId = createEraDiagnosticId('era-api-flush');
    const sourceDiagnosticIds = jobs.flatMap(job => job.diagnosticIds ?? []);
    const finishWatchdog = startEraDiagnosticWatchdog({
      source: 'api-command',
      event: 'flush-api-write-queue',
      correlationId: flushId,
      details: {
        sourceDiagnosticIds,
        jobCount: jobs.length,
        queuedAfterSplice: apiWriteQueue.length,
      },
    });
    updateEraDiagnosticState('apiWriteFlush', {
      flushId,
      sourceDiagnosticIds,
      jobCount: jobs.length,
      phase: 'find-last-ai-message',
    });

    try {
      const lastAiMessage = await findLastAiMessage();
      if (!lastAiMessage) {
        finishWatchdog('cancelled', { reason: 'last-ai-message-not-found' });
        logger.warn('flushApiWriteQueue', '找不到任何 AI 消息，无法执行 API 写入。');
        return;
      }

      const originalContent = getMessageContent(lastAiMessage) ?? '';
      const compactedOriginal = compressVariableBlocksInText(originalContent);
      const mergedJobs = mergeAdjacentJobs(jobs);
      const appendedBlocks = mergedJobs.map(buildVariableBlock).join('');
      const newContent = compressVariableBlocksInText(compactedOriginal + appendedBlocks);

      logger.log(
        'flushApiWriteQueue',
        '批量写入 ' + jobs.length + ' 个 API 任务，合并后 ' + mergedJobs.length + ' 个变量块到消息 ID ' + lastAiMessage.message_id + '...',
      );
      updateEraDiagnosticState('apiWriteFlush', {
        flushId,
        sourceDiagnosticIds,
        jobCount: jobs.length,
        mergedJobCount: mergedJobs.length,
        messageId: lastAiMessage.message_id,
        phase: 'set-chat-message',
      });
      recordEraDiagnostic('api-command', 'flush-message-selected', {
        sourceDiagnosticIds,
        messageId: lastAiMessage.message_id,
        jobCount: jobs.length,
        mergedJobCount: mergedJobs.length,
        originalContentLength: originalContent.length,
        compactedOriginalLength: compactedOriginal.length,
        appendedBlocksLength: appendedBlocks.length,
        newContentLength: newContent.length,
      }, flushId);
      await updateMessageContent(lastAiMessage, newContent, flushId);

      updateEraDiagnosticState('apiWriteFlush', {
        flushId,
        sourceDiagnosticIds,
        jobCount: jobs.length,
        mergedJobCount: mergedJobs.length,
        messageId: lastAiMessage.message_id,
        phase: 'emit-api-write',
      });
      const emittedAt = Date.now();
      const emission = eventEmit(ERA_EVENT_EMITTER.API_WRITE, {
        flushId,
        sourceDiagnosticIds,
        messageId: lastAiMessage.message_id,
      });
      void emission.then(
        () => recordEraDiagnostic('api-command', 'api-write-listeners-settled', {
          messageId: lastAiMessage.message_id,
          durationMs: Date.now() - emittedAt,
        }, flushId),
        error => recordEraDiagnosticError('api-command', 'api-write-listeners-failed', error, {
          messageId: lastAiMessage.message_id,
          durationMs: Date.now() - emittedAt,
        }, flushId),
      );
      finishWatchdog('success', {
        messageId: lastAiMessage.message_id,
        mergedJobCount: mergedJobs.length,
      });
      logger.log('flushApiWriteQueue', '已触发 ' + ERA_EVENT_EMITTER.API_WRITE + ' 事件。');
    } catch (error) {
      finishWatchdog('error', { error: error instanceof Error ? error.message : String(error) });
      recordEraDiagnosticError('api-command', 'flush-api-write-queue-error', error, {
        sourceDiagnosticIds,
        jobCount: jobs.length,
      }, flushId);
      throw error;
    } finally {
      updateEraDiagnosticState('apiWriteFlush', null);
    }
  })().finally(() => {
    apiWriteFlushPromise = null;
    if (apiWriteQueue.length > 0) {
      scheduleApiWriteFlush();
    }
  });

  return apiWriteFlushPromise;
}

const apiWriteQueueLengthsAtSchedule = new Map<number, number>();

const apiWriteScheduler = createApiWriteScheduler({
  delayMs: API_WRITE_FLUSH_DELAY,
  scheduleTimeout: scheduleUnthrottledTimeout,
  flush: start => {
    void flushApiWriteQueue().catch(error => {
      recordEraDiagnosticError('api-command', 'scheduled-flush-unhandled-error', error, {
        queuedJobCount: apiWriteQueue.length,
        scheduledAt: start.scheduledAt,
        expectedAt: start.expectedAt,
        actualStartAt: start.actualStartAt,
        lagMs: start.lagMs,
        timerSource: start.source,
      });
      logger.error('scheduleApiWriteFlush', `批量 API 写入异常: ${String(error)}`, error);
    });
  },
  onScheduled: schedule => {
    const queueLengthAtSchedule = apiWriteQueue.length;
    // 同一时刻最多只有一个待执行调度；提升路径会用新 id 替换旧 timer。
    apiWriteQueueLengthsAtSchedule.clear();
    apiWriteQueueLengthsAtSchedule.set(schedule.id, queueLengthAtSchedule);
    recordEraDiagnostic('api-command', 'flush-api-write-queue-scheduled', {
      scheduledAt: schedule.scheduledAt,
      expectedAt: schedule.expectedAt,
      delayMs: schedule.delayMs,
      timerSource: schedule.source,
      queueLengthAtSchedule,
      visibilityState: document.visibilityState,
    });
    updateEraDiagnosticState('apiWriteQueue', {
      length: apiWriteQueue.length,
      flushScheduled: true,
      flushRunning: false,
      scheduledAt: schedule.scheduledAt,
      expectedAt: schedule.expectedAt,
      timerSource: schedule.source,
    });
  },
  onStarted: start => {
    const queueLengthAtSchedule = apiWriteQueueLengthsAtSchedule.get(start.id) ?? apiWriteQueue.length;
    apiWriteQueueLengthsAtSchedule.delete(start.id);
    const queueLengthAtStart = apiWriteQueue.length;
    recordEraDiagnostic('api-command', 'scheduled-flush-started', {
      scheduledAt: start.scheduledAt,
      expectedAt: start.expectedAt,
      actualStartAt: start.actualStartAt,
      lagMs: start.lagMs,
      timerSource: start.source,
      queueLengthAtSchedule,
      queueLengthAtStart,
      visibilityState: document.visibilityState,
    });
    updateEraDiagnosticState('apiWriteQueue', {
      length: queueLengthAtStart,
      flushScheduled: false,
      flushRunning: true,
      scheduledAt: start.scheduledAt,
      expectedAt: start.expectedAt,
      actualStartAt: start.actualStartAt,
      lagMs: start.lagMs,
      timerSource: start.source,
    });
  },
  onScheduleError: (error, scheduleKind) => {
    recordEraDiagnosticError('api-command', 'schedule-flush-timer-error', error, {
      scheduleKind,
      queuedJobCount: apiWriteQueue.length,
      visibilityState: document.visibilityState,
    });
  },
});

function scheduleApiWriteFlush() {
  if (apiWriteScheduler.hasPending() || apiWriteFlushPromise) {
    return;
  }
  apiWriteScheduler.schedule();
}

// ==================================================================
// API 事件参考
// (事件名称的常量定义见于 `constants.ts` 中的 `ERA_API_EVENTS` 对象)
// ==================================================================

/**
 * @section API Event: 'era:insertByObject'
 * @description 通过一个对象，非破坏性地插入新变量。只会写入不存在的路径。
 * @param {object} detail - 要插入的变量对象。
 * @example
 * eventEmit('era:insertByObject', {
 *   player: { name: "勇者", hp: 100, inventory: [] }
 * });
 */

/**
 * @section API Event: 'era:updateByObject'
 * @description 通过一个对象，修改已存在的变量。如果路径不存在，则忽略。
 * @param {object} detail - 要更新的变量对象。
 * @example
 * eventEmit('era:updateByObject', {
 *   player: { hp: 120, status: 'blessed' }
 * });
 */

/**
 * @section API Event: 'era:insertByPath'
 * @description 通过指定路径和值，非破坏性地插入一个新变量。
 * @param {object} detail - 包含路径和值的对象。
 * @param {string} detail.path - 变量的路径，使用点或方括号表示法。
 * @param {*} detail.value - 要插入的值。
 * @example
 * eventEmit('era:insertByPath', {
 *   path: 'player.inventory[0]',
 *   value: { name: '生命药水', count: 3 }
 * });
 */

/**
 * @section API Event: 'era:updateByPath'
 * @description 通过指定路径和值，修改一个已存在的变量。
 * @param {object} detail - 包含路径和值的对象。
 * @param {string} detail.path - 变量的路径。
 * @param {*} detail.value - 要设置的新值。可以是直接的值，也可以是运算表达式。
 * @example
 * eventEmit('era:updateByPath', {
 *   path: 'player.hp',
 *   value: '+=10'
 * });
 */

/**
 * @section API Event: 'era:deleteByObject'
 * @description 通过一个对象，删除已存在的变量。
 * @param {object} detail - 描述要删除路径的结构。值的结构决定了删除行为。
 * @example
 * // 准备删除 player.gold。指令中 gold 的值必须是空对象 {}
 * eventEmit('era:deleteByObject', { player: { gold: {} } });
 *
 * // 准备删除整个 player 对象。
 * eventEmit('era:deleteByObject', { player: {} });
 *
 * // **重要**: 如果 player 对象包含 gold 和 mana 两个属性，
 * // 以下指令只会删除 gold 和 mana，而 player 对象本身会被保留（变为空对象）。
 * // 这与 `eventEmit('era:deleteByObject', { player: {} })` 的效果是不同的。
 * eventEmit('era:deleteByObject', { player: { gold: {}, mana: {} } });
 */

/**
 * @section API Event: 'era:deleteByPath'
 * @description 通过指定路径，删除一个已存在的变量。
 * @param {object} detail - 包含路径的对象。
 * @param {string} detail.path - 要删除的变量的路径。
 * @example
 * eventEmit('era:deleteByPath', { path: 'player.inventory[0]' });
 */

// ==================================================================
// 内部核心函数
// ==================================================================

/**
 * 在聊天记录中查找并返回最后一条由 AI 发送的消息。
 * 这是注入变量修改指令的目标消息。
 * @returns {Promise<any | null>} 返回找到的消息对象，如果不存在 AI 消息则返回 null。
 */

/**
 * 执行一次 API 写入操作。
 * 它将指定的变量修改块追加到最后一条 AI 消息的末尾，然后调度一个 'era:apiWrite' 事件。
 * @param {ApiWriteJob} job - 要执行的写入任务。
 */
function performApiWrite(job: ApiWriteJob) {
  const diagnosticId = createEraDiagnosticId('era-api-write');
  const parentDiagnosticId = getActiveEraDiagnosticTask();
  apiWriteQueue.push({
    blockTag: job.blockTag,
    blockContent: cloneJson(job.blockContent || {}),
    diagnosticIds: [diagnosticId],
  });
  recordEraDiagnostic('api-command', 'api-write-enqueued', {
    parentDiagnosticId,
    blockTag: job.blockTag,
    topLevelKeys: Object.keys(job.blockContent || {}),
    queueLength: apiWriteQueue.length,
    flushScheduled: apiWriteScheduler.hasPending(),
    flushRunning: apiWriteFlushPromise !== null,
  }, diagnosticId);
  updateEraDiagnosticState('apiWriteQueue', {
    length: apiWriteQueue.length,
    flushScheduled: apiWriteScheduler.hasPending(),
    flushRunning: apiWriteFlushPromise !== null,
  });
  logger.log('performApiWrite', 'API 任务入队 (' + job.blockTag + ')，当前队列长度: ' + apiWriteQueue.length);
  scheduleApiWriteFlush();
}

// ==================================================================
// 事件处理器实现 (由 event_queue.ts 调用)
// ==================================================================

/**
 * **【处理器】** 处理 `era:insertByObject` 事件。
 * @param {object} data - 从事件的 `detail` 中获取的变量对象。
 */
export function insertByObject(data: object) {
  performApiWrite({ blockTag: 'VariableInsert', blockContent: data });
}

/**
 * **【处理器】** 处理 `era:updateByObject` 事件。
 * @param {object} data - 从事件的 `detail` 中获取的变量对象。
 */
export function updateByObject(data: object) {
  performApiWrite({ blockTag: 'VariableEdit', blockContent: data });
}

/**
 * **【处理器】** 处理 `era:insertByPath` 事件。
 * @param {string} path - 从事件 `detail` 的 `path` 属性获取。
 * @param {*} value - 从事件 `detail` 的 `value` 属性获取。
 */
export function insertByPath(path: string, value: any) {
  const block = _.set({}, path, value);
  performApiWrite({ blockTag: 'VariableInsert', blockContent: block });
}

/**
 * **【处理器】** 处理 `era:updateByPath` 事件。
 * @param {string} path - 从事件 `detail` 的 `path` 属性获取。
 * @param {*} value - 从事件 `detail` 的 `value` 属性获取。
 */
export function updateByPath(path: string, value: any) {
  const block = _.set({}, path, value);
  performApiWrite({ blockTag: 'VariableEdit', blockContent: block });
}

/**
 * **【处理器】** 处理 `era:deleteByObject` 事件。
 * @param {object} data - 从事件的 `detail` 中获取的变量结构。
 */
export function deleteByObject(data: object) {
  performApiWrite({ blockTag: 'VariableDelete', blockContent: data });
}

/**
 * **【处理器】** 处理 `era:deleteByPath` 事件。
 * @param {string} path - 从事件 `detail` 的 `path` 属性获取。
 */
export function deleteByPath(path: string) {
  // 对于删除操作，我们用一个空对象作为值来表示删除该路径的意图
  const block = _.set({}, path, {});
  performApiWrite({ blockTag: 'VariableDelete', blockContent: block });
}

// ==================================================================
// 事件广播器实现 (由 variable_change_processor.ts 等内部模块调用)
// ==================================================================

/**
 * **【广播器】** 触发 `era:writeDone` 事件。
 * 当一次完整的变量写入操作（包括增、删、改）在 `variable_change_processor.ts` 中成功完成后，
 * 应调用此函数。它向外部脚本广播一个事件，通知它们变量状态已发生改变，并提供详细的上下文。
 *
 * @param {WriteDonePayload} payload - 包含写入操作关键信息的事件负载。
 * @example
 * // 这是一个在外部脚本中监听此事件的示例：
 * eventOn('era:writeDone', (detail) => {
 *   const { mk, message_id, actions, selectedMks, editLogs, stat, statWithoutMeta } = detail;
 *   console.log(`ERA 变量已更新！消息 ID: ${message_id}, MK: ${mk}`);
 *   console.log('执行的操作:', actions);
 *
 *   // 你可以根据需要使用 stat (带 meta) 或 statWithoutMeta (不带 meta)
 *   console.log('最新的纯净状态数据:', statWithoutMeta);
 *
 *   // 此时可以根据最新的状态数据更新你自己的 UI 或执行其他逻辑
 * });
 */
export function emitWriteDoneEvent(payload: WriteDonePayload) {
  // 在广播前，对需要暴露给外部的数据进行反转义
  const unescapedPayload = {
    ...payload,
    stat: unescapeEraData(payload.stat),
    statWithoutMeta: unescapeEraData(payload.statWithoutMeta),
  };

  logger.debug('emitWriteDoneEvent', 'writeDone事件广播数据反转义', {
    before: { stat: payload.stat, statWithoutMeta: payload.statWithoutMeta },
    after: { stat: unescapedPayload.stat, statWithoutMeta: unescapedPayload.statWithoutMeta },
  });

  const correlationId = getActiveEraDiagnosticTask() ?? createEraDiagnosticId('era-write-done');
  const emittedAt = Date.now();
  recordEraDiagnostic('api-command', 'write-done-emitting', {
    messageId: payload.message_id,
    mk: payload.mk,
    actions: payload.actions,
    consecutiveProcessingCount: payload.consecutiveProcessingCount,
  }, correlationId);
  const emission = eventEmit(ERA_EVENT_EMITTER.WRITE_DONE, unescapedPayload);
  void emission.then(
    () => recordEraDiagnostic('api-command', 'write-done-listeners-settled', {
      messageId: payload.message_id,
      mk: payload.mk,
      durationMs: Date.now() - emittedAt,
    }, correlationId),
    error => recordEraDiagnosticError('api-command', 'write-done-listeners-failed', error, {
      messageId: payload.message_id,
      mk: payload.mk,
      durationMs: Date.now() - emittedAt,
    }, correlationId),
  );
  logger.log(
    'emitWriteDoneEvent',
    `已触发 ${ERA_EVENT_EMITTER.WRITE_DONE} 事件。操作: ${JSON.stringify(
      payload.actions,
    )}, MK: ${payload.mk}, MsgID: ${payload.message_id}, 连续处理次数: ${payload.consecutiveProcessingCount}`,
  );
}
