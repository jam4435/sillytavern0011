/**
 * @file ERA 变量框架 - 变量写入模块
 * @description
 * 该模块是 ERA 框架的“执行引擎”，负责将消息内容中的变量修改指令应用到实际的 `chat` 变量中。
 *
 * **设计理念**:
 * 变量的写入是一个严谨的过程，必须确保所有变更都被正确记录，以便后续的回滚和同步。
 * 此模块的核心职责是：
 * 1. **解析指令**: 从 AI 消息中提取 `<VariableInsert>` 和 `<VariableEdit>` 块。
 * 2. **顺序执行**: 确保同一消息内的多个指令块按顺序执行，且后续指令能感知到前面指令的结果。
 * 3. **生成日志**: 在应用变更的同时，调用 `recursive.ts` 中的递归函数来生成精确的 `EditLog`。
 * 4. **覆盖式日志写入**: 确保每个消息密钥（MK）对应的 `EditLog` 严格反映其当前内容，
 *    即使内容中没有任何指令（此时会写入空日志），也要覆盖旧日志，这是防止 `swipe` 造成数据污染的关键。
 *
 * **职责边界**:
 * - 本模块**只负责读取 MK**，不负责创建。创建 MK 的职责由上游的 `message_key.ts` 承担。
 * - `ApplyVarChangeForMessage` 函数**只负责写入变量和 `EditLog`**，不负责更新 `SelectedMks`。
 *   更新 `SelectedMks` 的职责被移交给了更上层的调用者（如 `ApplyVarChange` 或同步函数），
 *   以避免在同步循环中修改正在被读取的状态，这是一种重要的并发控制策略。
 */

'use strict';

import { LOGS_PATH, SEL_PATH } from '../../utils/constants';
import { processDeleteBlocks } from './delete';
import { processInsertBlocks } from './insert/insert';
import { readMessageKey } from '../../core/key/mk';
import { findLastAiMessage, getMessageContent, isUserMessage } from '../../utils/message';
import { processEditBlocks } from './update';
import { getEraData, updateEraMetaData } from '../../utils/era_data';
import { extractOrderedVariableActionBlocks } from '../../utils/string';
import { escapeEraData, parseEditLog, parseJsonl } from '../../utils/data';
import { Logger } from '../../utils/log';
import { recordEraDiagnostic } from '../../utils/diagnostics';
import { consumeMkRollbackWitness, recordMkLedgerTransition, summarizeMkLedger } from '../../utils/mkLedgerJournal';

const logger = new Logger('core-crud-patcher');

const TRACKED_EVENT_ROOTS = [
  '事件系统', '参与事件', '世界事件', '事件分支结果', '后续事件线索', '后续事件线索计数',
] as const;

function fingerprintEventRoots(): Record<string, string> {
  const stat = getEraData().stat || {};
  return Object.fromEntries(TRACKED_EVENT_ROOTS.map(key => {
    let serialized: string;
    try {
      serialized = JSON.stringify(stat[key] ?? null) ?? 'null';
    } catch {
      serialized = '[unserializable]';
    }
    let hash = 2166136261;
    for (let index = 0; index < serialized.length; index += 1) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return [key, hash.toString(16).padStart(8, '0')];
  }));
}

/**
 * 根据实际变量块计算版本戳；同一 MK 会在后续事件事务中继续追加变量块，
 * 因此仅有 MK 相同不能代表内容未变。
 */
function actionBlockRevision(blocks: Array<{ tag: string; body: string }>): string {
  const raw = blocks.map(block => `${block.tag}:${block.body}`).join('\u0000');
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 旧账本仍反映在实际状态中的最低限度证据（只用于相同内容的重复应用）。 */
function oldLedgerEffectsStillPresent(logs: any[], stat: Record<string, unknown>): boolean {
  if (logs.length === 0) return false;
  return logs.every(entry => {
    if (!entry || typeof entry.path !== 'string' || !entry.path) return false;
    if (entry.op === 'delete') return !_.has(stat, entry.path);
    if (entry.op === 'insert') return _.has(stat, entry.path);
    if (entry.op === 'update') return _.isEqual(_.get(stat, entry.path), entry.value_new);
    return false;
  });
}

/**
 * **【核心实现】** 对指定的消息应用变量修改。
 * 这是变量写入流程的核心，处理单个消息。
 *
 * @param {TavernMessage} msg - 要处理的酒馆消息对象。
 * @returns {Promise<string | null>} 如果成功处理，返回该消息的 MK；如果消息无需处理或处理失败，返回 null。
 */
export const ApplyVarChangeForMessage = async (msg: any): Promise<string | null> => {
  logger.debug('ApplyVarChangeForMessage', `开始处理消息...`, { msg });
  try {
    if (!msg || typeof msg.message_id !== 'number') {
      logger.warn('ApplyVarChangeForMessage', '无效消息对象或缺少 message_id，退出');
      return null;
    }

    const messageId = msg.message_id;
    // 写入函数只负责读取 MK，不负责创建。创建的职责由上游的 `ensureMessageKey` 承担。
    const MK = readMessageKey(msg);

    // 如果消息没有 MK（可能是一个异常状态，如新消息还未被注入 MK），则跳过。
    if (!MK) {
      logger.debug('ApplyVarChangeForMessage', `消息 (ID: ${messageId}) 不含 MK，跳过变量写入。`);
      return null;
    }

    // 根据设计，用户消息自身不应包含变量修改指令，因此跳过变量处理，但返回其已有的 MK。
    if (isUserMessage(msg)) {
      logger.debug('ApplyVarChangeForMessage', `消息 (ID: ${messageId}) 为用户消息，跳过变量写入，但保留其 MK。`);
      return MK;
    }

    const rawContent = getMessageContent(msg) || '';
    const operationBlocks = extractOrderedVariableActionBlocks(rawContent);
    const oldMeta = getEraData().meta;
    const oldEditLog = parseEditLog(oldMeta?.[LOGS_PATH]?.[MK]);
    const oldRevision = oldMeta?.EditLogContentRevisions?.[MK];
    const revision = actionBlockRevision(operationBlocks);
    const replayAfterRollback = consumeMkRollbackWitness(MK);
    recordMkLedgerTransition('apply-before', MK, {
      messageId,
      revision,
      oldRevision: typeof oldRevision === 'string' ? oldRevision : null,
      replayAfterRollback,
      ...summarizeMkLedger(oldEditLog),
    });
    const beforeEventRoots = fingerprintEventRoots();
    const editLog: any[] = [];

    if (operationBlocks.length === 0) {
      logger.debug('ApplyVarChangeForMessage', `消息 (ID: ${messageId}) 未检测到变量修改标签。`);
    }

    // 同一消息中的变量动作严格按文本顺序执行。按 Insert/Edit/Delete 分桶会
    // 将“Delete 旧事件占用 → Insert 新事件占用”错误变成“Insert → Delete”。
    for (const block of operationBlocks) {
      const records = escapeEraData(parseJsonl(block.body));
      if (block.tag === 'VariableInsert') {
        await processInsertBlocks(records, editLog);
      } else if (block.tag === 'VariableEdit') {
        await processEditBlocks(records, editLog, messageId);
      } else {
        await processDeleteBlocks(records, editLog);
      }
    }

    const afterEventRoots = fingerprintEventRoots();
    const changedEventRoots = TRACKED_EVENT_ROOTS.filter(
      key => beforeEventRoots[key] !== afterEventRoots[key],
    );
    const logSummary = {
      messageId,
      mk: MK,
      blockOrder: operationBlocks.map(block => block.tag.replace('Variable', '')),
      oldLogCount: oldEditLog.length,
      newLogCount: editLog.length,
      changedEventRoots,
      beforeEventRoots,
      afterEventRoots,
    };
    if (operationBlocks.length > 0 || changedEventRoots.length > 0 || oldEditLog.length > 0) {
      recordEraDiagnostic('core-crud-patcher', 'message-apply-log-audit', logSummary);
    }
    if (changedEventRoots.length > 0 && editLog.length === 0) {
      recordEraDiagnostic('core-crud-patcher', 'event-state-changed-without-editlog', logSummary);
      logger.warn('ApplyVarChangeForMessage', '事件根状态发生变化，但本楼没有生成 ERA EditLog', logSummary);
    } else if (operationBlocks.length > 0 && editLog.length === 0) {
      recordEraDiagnostic('core-crud-patcher', 'action-blocks-produced-empty-editlog', logSummary);
    }
    // 只有同一套变量块、旧账本的效果仍在游戏变量中且本轮完全无变化时，
    // 才允许沿用旧账本：这是重入幂等应用，不是新一轮真正的回滚后重放。
    // 内容改变（包括 Swipe / 重新生成 / 新 API 事务）或效果已被回滚时仍覆盖旧日志。
    const retainLedger = oldEditLog.length > 0 &&
      editLog.length === 0 &&
      operationBlocks.length > 0 &&
      oldRevision === revision &&
      !replayAfterRollback &&
      _.isEqual(beforeEventRoots, afterEventRoots) &&
      oldLedgerEffectsStillPresent(oldEditLog, getEraData().stat ?? {});
    const committedLog = retainLedger ? oldEditLog : editLog;

    if (oldEditLog.length > 0 && committedLog.length === 0) {
      recordEraDiagnostic('core-crud-patcher', 'nonempty-editlog-overwritten-by-empty', logSummary);
    }
    recordMkLedgerTransition(retainLedger ? 'apply-preserved-idempotent-ledger' : 'apply-before-commit', MK, {
      messageId, revision,
      oldLogCount: oldEditLog.length,
      producedLogCount: editLog.length,
      nextLogCount: committedLog.length,
      ...summarizeMkLedger(committedLog),
    });

    // 5. 按本次执行结果替换账本；只有已验证的同内容幂等重复应用才沿用旧账本。
    // Swipe/重新生成/真实回滚后的重放必须以新的动作记录为准。
    try {
      await updateEraMetaData(meta => {
        const newArr = Array.isArray(committedLog) ? committedLog : parseEditLog(committedLog);
        logger.debug(
          'ApplyVarChangeForMessage',
          `准备为 MK=${MK} (MsgID=${messageId}) 写入 EditLog:\n${JSON.stringify(newArr, null, 2)}`,
        );
        // 直接保存原生数组，避免在聊天 JSON 中再次把整段日志转义成 JSON 字符串。
        // parseEditLog 同时兼容旧字符串格式，因此无需强制迁移旧存档。
        _.set(meta, [LOGS_PATH, MK], _.cloneDeep(newArr));
        // 与日志同一次 metadata 事务提交内容版本戳，避免下次重入误复用其它内容的账本。
        _.set(meta, ['EditLogContentRevisions', MK], revision);
        /*
         * N.B. 此函数不再负责更新 SelectedMks 数组。
         * 更新 SelectedMks 的职责已移交至上层调用者 (resyncStateOnHistoryChange 或 ApplyVarChange)，
         * 以避免在 resync 循环中意外修改正在被读取的 oldSelectedMks 状态。
         */
        return meta;
      });
      recordMkLedgerTransition('apply-committed', MK, {
        messageId, revision, ...summarizeMkLedger(committedLog),
      });
      logger.debug('ApplyVarChangeForMessage', `成功为 MK=${MK} 写入 EditLog。`);
    } catch (e: any) {
      recordMkLedgerTransition('apply-persist-failed', MK, {
        messageId, revision,
        attemptedLogCount: committedLog.length,
        reason: e instanceof Error ? e.message : String(e),
      });
      logger.error('ApplyVarChangeForMessage', `为 MK=${MK} 写入 EditLogs 失败: ${e?.message || e}`, e);
      throw e;
    }

    return MK;
  } catch (err: any) {
    logger.error('ApplyVarChangeForMessage', `变量写入器异常: ${err?.message || err}`, err);
    // 不允许变量已落地但 EditLog 失败时，仍回传成功的 MK 并广播 apiWrite 完成。
    throw err;
  }
};

/**
 * **【标准事件处理入口】**
 * 这是一个上层封装，用于处理最新 AI 消息的变量写入，并负责更新 `SelectedMks` 数组。
 * 它会自动寻找最后一条 AI 消息进行操作，通常被绑定到“新消息生成”等事件上。
 */
export const ApplyVarChange = async () => {
  logger.debug('ApplyVarChange', `函数被调用...`);
  // 1. 智能查找最后一条 AI 消息
  const msg = findLastAiMessage();
  if (!msg || typeof msg.message_id !== 'number') {
    logger.log('ApplyVarChange', '未找到可处理的 AI 消息，退出。');
    return;
  }

  const messageId = msg.message_id;
  logger.log('ApplyVarChange', `找到目标 AI 消息 (ID: ${messageId})，开始处理变量写入...`);

  // 2. 调用核心实现来处理变量和 EditLog 的写入。
  // EditLog 会被自动关联到从该消息中读取到的 MK 上。
  const MK = await ApplyVarChangeForMessage(msg);

  // 3. 在核心流程执行完毕后，在此处统一更新 SelectedMks，确保状态一致。
  try {
    await updateEraMetaData(meta => {
      const selectedMks = _.get(meta, SEL_PATH, []);
      // 关键：必须使用我们正在处理的 AI 消息的 messageId 作为索引，
      // 来更新 SelectedMks 数组中对应的 MK 记录。
      selectedMks[messageId] = MK;
      _.set(meta, SEL_PATH, selectedMks);
      return meta;
    });
  } catch (e: any) {
    logger.error('ApplyVarChange', `更新 SelectedMks 失败: ${e?.message || e}`, e);
  }
};
