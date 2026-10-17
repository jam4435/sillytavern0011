import type { EraWriteDoneDetail } from './eraWriteWait';
import { observeEraWriteDone } from './eraWriteWait';
import { acquireTurnLock, releaseTurnLock } from './turnLifecycle';

export interface TurnTransactionResult {
  assistantText: string;
  assistantMessageId: number;
  era: EraWriteDoneDetail | null;
}

export interface TurnTransactionOptions {
  eraTimeoutMs?: number;
  /** assistant 落楼前的校验/规范化钩子；可在内部进行一次不落楼的修复生成。 */
  transformAssistant?: (assistantText: string) => Promise<string>;
  /** 可选的两阶段自由动作生成：先解析和判定，再只返回最终 assistant 正文。 */
  generateAssistant?: () => Promise<string>;
}

function generatedText(result: string | GenerateToolCallResult): string {
  return (typeof result === 'string' ? result : result.content).trim();
}

function makeRoundId(): string {
  return `nba2k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 一个 NBA2K 回合的持久化事务。user 与 assistant 都使用 refresh:none，
 * 由隐藏楼层脚本在 ERA 完成后一次性把宿主外壳同步到最终 assistant 楼层。
 */
export async function runTurnTransaction(
  text: string,
  { eraTimeoutMs = 20_000, transformAssistant, generateAssistant }: TurnTransactionOptions = {},
): Promise<TurnTransactionResult> {
  const chatId = SillyTavern.getCurrentChatId() ?? '';
  const roundId = makeRoundId();
  let lockAcquired = false;
  let userMessageId: number | null = null;
  let assistantMessageId: number | null = null;
  let observer: ReturnType<typeof observeEraWriteDone> | null = null;

  try {
    await acquireTurnLock(roundId, chatId);
    lockAcquired = true;

    await createChatMessages([{ role: 'user', message: text }], { refresh: 'none' });
    userMessageId = getLastMessageId();

    const rawAssistantText = generateAssistant
      ? (await generateAssistant()).trim()
      : generatedText(await generate({ should_stream: false }));
    if (!rawAssistantText) throw new Error('模型返回了空回复。');
    const assistantText = transformAssistant ? (await transformAssistant(rawAssistantText)).trim() : rawAssistantText;
    if (!assistantText) throw new Error('模型回复经校验后为空。');

    // 没有 VariableInsert/Edit/Delete 的叙事回合不需要 ERA 写入确认。
    const hasEraActions = /<Variable(Insert|Edit|Delete)>[\s\S]*?<\/Variable\1>/i.test(assistantText);
    // 带变量动作时主动请求一次带唯一 ID 的历史同步，不依赖酒馆是否自动发出 MESSAGE_RECEIVED。
    if (hasEraActions) observer = observeEraWriteDone('resync', roundId);
    await createChatMessages([{ role: 'assistant', message: assistantText }], { refresh: 'none' });
    assistantMessageId = getLastMessageId();
    let era: EraWriteDoneDetail | null = null;
    if (hasEraActions) {
      await eventEmit('manual_sync', { syncId: roundId });
      era = await observer!.waitForMessageId(assistantMessageId, eraTimeoutMs);
    }

    return { assistantText, assistantMessageId, era };
  } catch (error) {
    // ERA 超时时 assistant 已持久化，保留完整回合以便手动同步；更早失败则回滚孤立 user。
    if (userMessageId !== null && assistantMessageId === null) {
      try {
        await deleteChatMessages([userMessageId], { refresh: 'none' });
      } catch (rollbackError) {
        console.error('[nba2k] 回滚孤立 user 楼层失败', rollbackError);
      }
    }
    throw error;
  } finally {
    observer?.stop();
    if (lockAcquired) {
      try {
        await releaseTurnLock(roundId, chatId, assistantMessageId);
      } catch (releaseError) {
        console.error('[nba2k] 释放回合锁失败', releaseError);
      }
    }
  }
}
