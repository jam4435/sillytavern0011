import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type {
  InitialAttributes,
  InventoryItem,
  InventoryItemVariableData,
  MartialArtLearnRollbackData,
} from '../types';
import { matchMartialArtsInSecretName } from './martialArtsDatabase';
import { quoteMartialArtStudyEligibility } from './martialArtStudyEligibility';
import { gameLogger } from './logger';

declare function getVariables(option: { type: 'chat' }): Promise<Record<string, any>>;

interface SecretUserData {
  初始属性?: Partial<InitialAttributes>;
  天赋?: Record<string, string>;
  功法?: Record<string, unknown>;
  包裹?: Record<string, InventoryItemVariableData>;
}

export interface LearnMartialArtFromSecretResult {
  success: boolean;
  error?: string;
  artName?: string;
  itemName?: string;
  newCount?: number;
  commandText?: string;
  rollback?: MartialArtLearnRollbackData;
}

function createTransactionId(prefix: string): string {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneItem(item: InventoryItemVariableData): InventoryItemVariableData {
  return JSON.parse(JSON.stringify(item)) as InventoryItemVariableData;
}

function toCompleteInitialAttributes(value?: Partial<InitialAttributes>): InitialAttributes | undefined {
  if (!value) return undefined;
  const keys: Array<keyof InitialAttributes> = ['臂力', '根骨', '机敏', '悟性', '洞察', '风姿', '福缘'];
  if (keys.some(key => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
    return undefined;
  }
  return value as InitialAttributes;
}

function buildSecretInventoryItem(
  itemName: string,
  artName: string,
  rawItem: InventoryItemVariableData,
): InventoryItem | null {
  const dbData = matchMartialArtsInSecretName(itemName).find(art => art.功法名称 === artName);
  if (!dbData) return null;

  return {
    id: `secret:${itemName}:${artName}`,
    name: artName,
    type: 'SECRET',
    rank: dbData.功法品阶,
    count: rawItem.数量 ?? 1,
    description: dbData.功法描述 || rawItem.物品描述 || '',
    martialArtInfo: {
      description: dbData.功法描述,
      rank: dbData.功法品阶,
      requirements: dbData.修炼限制 ? { ...dbData.修炼限制 } : undefined,
    },
  };
}

/** 数据库外秘籍不直接改变量，而是作为一次正常剧情参悟行为进入下一轮。 */
export function buildNarrativeSecretStudyCommand(itemName: string): string {
  return `参悟秘籍《${itemName}》。此秘籍未收录于现有功法谱，请在剧情中自然表现参悟过程；只有本轮实际成功初步掌握其中武学时，才新增对应完整功法并结算秘籍，否则保留秘籍。`;
}

/**
 * 从背包秘籍真正习得功法。
 *
 * 再次读取当前 chat 变量并重新校验，避免 UI 打开后属性/天赋/功法发生变化造成陈旧判定。
 * 功法写入与秘籍扣除使用同一个 era:transactionByObject 窗口提交。
 */
export async function learnMartialArtFromSecret(itemName: string, artName?: string): Promise<LearnMartialArtFromSecretResult> {
  const variables = await getVariables({ type: 'chat' });
  const userData = (variables?.stat_data?.user数据 || {}) as SecretUserData;
  const rawItem = userData.包裹?.[itemName];

  if (!rawItem || rawItem.类型 !== '秘籍') {
    return { success: false, error: `背包中不存在可参悟的秘籍《${itemName}》。` };
  }

  const currentCount = rawItem.数量 ?? 0;
  if (currentCount <= 0) {
    return { success: false, error: `秘籍《${itemName}》数量不足。` };
  }

  const matchedArts = matchMartialArtsInSecretName(itemName);
  if (matchedArts.length === 0) {
    return { success: false, error: `秘籍《${itemName}》未收录于功法数据库，应作为剧情参悟处理。` };
  }

  const resolvedArtName = artName || (matchedArts.length === 1 ? matchedArts[0].功法名称 : '');
  if (!resolvedArtName) {
    return { success: false, error: `秘籍《${itemName}》记载多门功法，请先选择要参悟的武学。` };
  }
  if (!matchedArts.some(art => art.功法名称 === resolvedArtName)) {
    return { success: false, error: `《${resolvedArtName}》并非秘籍《${itemName}》中识别出的功法。` };
  }

  const secretItem = buildSecretInventoryItem(itemName, resolvedArtName, rawItem);
  if (!secretItem) {
    return { success: false, error: `无法读取《${resolvedArtName}》的功法数据。` };
  }

  const eligibility = quoteMartialArtStudyEligibility({
    item: secretItem,
    initialAttributes: toCompleteInitialAttributes(userData.初始属性),
    traits: userData.天赋,
    knownMartialArts: userData.功法,
  });
  if (!eligibility.canStudy) {
    return {
      success: false,
      error: eligibility.reasons.join('；') || '当前未满足参悟条件。',
    };
  }

  const originalItem = cloneItem(rawItem);
  const shouldConsumeSecret = matchedArts.every(
    art => art.功法名称 === resolvedArtName || Boolean(userData.功法?.[art.功法名称]),
  );
  const newCount = shouldConsumeSecret ? Math.max(0, currentCount - 1) : currentCount;
  const itemOperation = shouldConsumeSecret
    ? newCount > 0
      ? {
          type: 'update' as const,
          payload: { user数据: { 包裹: { [itemName]: { 数量: newCount } } } },
        }
      : {
          type: 'delete' as const,
          payload: { user数据: { 包裹: { [itemName]: {} } } },
        }
    : null;

  const operations: Array<{ type: 'insert' | 'update' | 'delete'; payload: Record<string, unknown> }> = [
    {
      type: 'insert',
      payload: { user数据: { 功法: { [resolvedArtName]: { 掌握程度: '初窥门径' } } } },
    },
  ];
  if (itemOperation) operations.push(itemOperation);

  const transactionId = createTransactionId('secret-learn');
  try {
    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'inventory-learn-martial-art',
      refreshHint: 'character-data',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: {
        transactionId,
        operations,
      },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: `参悟《${itemName}》事务已发出，但 ERA 未确认功法与秘籍状态写入完成。`,
    });

    const rollback: MartialArtLearnRollbackData = {
      artName: resolvedArtName,
      itemName,
      originalItem,
    };
    gameLogger.log(`[martialArtSecretManager] 已从秘籍《${itemName}》习得功法：${resolvedArtName}`);
    return {
      success: true,
      artName: resolvedArtName,
      itemName,
      newCount,
      rollback,
      commandText: `参悟秘籍《${itemName}》，已初步习得${resolvedArtName}（初窥门径）；功法与秘籍变量已由前端处理，请勿重复写入变量，并在剧情中自然体现参悟过程。`,
    };
  } catch (error) {
    gameLogger.error('[martialArtSecretManager] 秘籍参悟事务失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '秘籍参悟失败',
    };
  }
}

/**
 * 撤销尚未发送的“秘籍参悟”指令：删除刚学会的功法并恢复原秘籍。
 */
export async function undoLearnMartialArtFromSecret(rollback: MartialArtLearnRollbackData): Promise<void> {
  const variables = await getVariables({ type: 'chat' });
  const currentUserData = (variables?.stat_data?.user数据 || {}) as SecretUserData;
  const itemStillExists = Boolean(currentUserData.包裹?.[rollback.itemName]);
  const transactionId = createTransactionId('secret-learn-rollback');
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'update',
    reason: 'inventory-learn-martial-art-rollback',
    refreshHint: 'character-data',
    eventName: 'era:transactionByObject',
    attribution: 'background',
    detail: {
      transactionId,
      operations: [
        {
          type: 'delete',
          payload: {
            user数据: {
              功法: {
                [rollback.artName]: {},
              },
            },
          },
        },
        {
          type: itemStillExists ? 'update' : 'insert',
          payload: {
            user数据: {
              包裹: {
                [rollback.itemName]: cloneItem(rollback.originalItem),
              },
            },
          },
        },
      ],
    },
    expectedAction: 'apiWrite',
    expectedTransactionId: transactionId,
    timeoutMs: 10000,
    timeoutMessage: `撤销参悟《${rollback.artName}》已发出，但 ERA 未确认回滚完成。`,
  });
  gameLogger.log(`[martialArtSecretManager] 已撤销秘籍参悟：${rollback.artName}`);
}
