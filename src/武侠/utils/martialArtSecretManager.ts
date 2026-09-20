import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type {
  InitialAttributes,
  InventoryItem,
  InventoryItemVariableData,
  MartialArtLearnRollbackData,
} from '../types';
import { getMartialArtData } from './martialArtsDatabase';
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

function buildSecretInventoryItem(itemName: string, rawItem: InventoryItemVariableData): InventoryItem | null {
  const dbData = getMartialArtData(itemName);
  if (!dbData) return null;

  return {
    id: `secret:${itemName}`,
    name: itemName,
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

/**
 * 从背包秘籍真正习得功法。
 *
 * 再次读取当前 chat 变量并重新校验，避免 UI 打开后属性/天赋/功法发生变化造成陈旧判定。
 * 功法写入与秘籍扣除使用同一个 era:transactionByObject 窗口提交。
 */
export async function learnMartialArtFromSecret(itemName: string): Promise<LearnMartialArtFromSecretResult> {
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

  const secretItem = buildSecretInventoryItem(itemName, rawItem);
  if (!secretItem) {
    return { success: false, error: `功法数据库中找不到《${itemName}》，无法确认修炼条件。` };
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
  const newCount = Math.max(0, currentCount - 1);
  const itemOperation =
    newCount > 0
      ? {
          type: 'update' as const,
          payload: {
            user数据: {
              包裹: {
                [itemName]: { 数量: newCount },
              },
            },
          },
        }
      : {
          type: 'delete' as const,
          payload: {
            user数据: {
              包裹: {
                [itemName]: {},
              },
            },
          },
        };

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
        operations: [
          {
            type: 'insert',
            payload: {
              user数据: {
                功法: {
                  [itemName]: {
                    掌握程度: '初窥门径',
                  },
                },
              },
            },
          },
          itemOperation,
        ],
      },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: `参悟《${itemName}》事务已发出，但 ERA 未确认功法与秘籍状态写入完成。`,
    });

    const rollback: MartialArtLearnRollbackData = {
      artName: itemName,
      itemName,
      originalItem,
    };
    gameLogger.log(`[martialArtSecretManager] 已从秘籍习得功法：${itemName}`);
    return {
      success: true,
      artName: itemName,
      itemName,
      newCount,
      rollback,
      commandText: `参悟秘籍《${itemName}》，已初步习得${itemName}（初窥门径），请在剧情中自然体现参悟过程。`,
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
          type: 'insert',
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
