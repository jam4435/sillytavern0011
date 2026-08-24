import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type {
  InitialAttributes,
  MeridianNodeId,
  MeridianSettlement,
  MeridianUpgradeQuote,
  MeridianUpgradeResult,
} from '../types';
import { applyMeridianUpgrade, normalizeMeridianProgress, quoteMeridianUpgrade } from './meridianSystem';

type MeridianStatData = {
  user数据?: {
    境界?: unknown;
    修为?: unknown;
    初始属性?: Partial<Record<keyof InitialAttributes, unknown>>;
  };
  前端变量?: Record<string, unknown>;
};

type EraTransactionOperation = {
  type: 'insert' | 'update';
  payload: Record<string, unknown>;
};

const DEFAULT_INITIAL_ATTRIBUTES: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 0,
};

let activeUpgrade: { nodeId: MeridianNodeId; promise: Promise<MeridianUpgradeResult> } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneInitialAttributes(raw: MeridianStatData['user数据']): InitialAttributes {
  const initial = isRecord(raw?.初始属性) ? raw.初始属性 : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_INITIAL_ATTRIBUTES).map(([attribute, fallback]) => {
      const value = initial[attribute as keyof InitialAttributes];
      return [attribute, typeof value === 'number' && Number.isFinite(value) ? value : fallback];
    }),
  ) as unknown as InitialAttributes;
}

function createTransactionId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return `meridian-${crypto.randomUUID()}`;
    }
  } catch {
    // 使用时间戳兜底即可；事务 ID 仅用于精确认领本次 ERA 完成信号。
  }
  return `meridian-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function settlementsEqual(left?: MeridianSettlement, right?: MeridianSettlement): boolean {
  return left?.类型 === right?.类型 && left?.属性 === right?.属性 && left?.增量 === right?.增量;
}

function quoteStillMatches(expected: MeridianUpgradeQuote, actual: MeridianUpgradeQuote): boolean {
  return (
    expected.nodeId === actual.nodeId &&
    expected.canUpgrade &&
    actual.canUpgrade &&
    expected.cost === actual.cost &&
    expected.baseCost === actual.baseCost &&
    expected.currentCultivation === actual.currentCultivation &&
    expected.newCultivation === actual.newCultivation &&
    settlementsEqual(expected.settlement, actual.settlement)
  );
}

async function readLatestStatData(): Promise<MeridianStatData> {
  const variables = await getVariables({ type: 'chat' });
  return isRecord(variables?.stat_data) ? (variables.stat_data as MeridianStatData) : {};
}

function assertUpgradePersisted(statData: MeridianStatData, expected: MeridianUpgradeResult): void {
  const userData = statData.user数据;
  const cultivation = typeof userData?.修为 === 'number' ? userData.修为 : Number.NaN;
  if (cultivation !== expected.newCultivation) {
    throw new Error('冲穴写后校验失败：修为扣除结果未落库。');
  }

  const normalized = normalizeMeridianProgress(statData.前端变量?.奇经八脉);
  if (!normalized.valid || !normalized.progress.已通穴位.includes(expected.nodeId)) {
    throw new Error(`冲穴写后校验失败：${normalized.error ?? '穴位进度未落库'}。`);
  }

  const persistedSettlement = normalized.progress.关窍结算[expected.nodeId];
  if (!settlementsEqual(persistedSettlement, expected.settlement)) {
    throw new Error('冲穴写后校验失败：关窍结算结果不一致。');
  }

  if (expected.settlement?.类型 === '初始属性') {
    const attribute = expected.settlement.属性 as keyof InitialAttributes;
    if (userData?.初始属性?.[attribute] !== expected.initialAttributes[attribute]) {
      throw new Error(`冲穴写后校验失败：初始${attribute}未落库。`);
    }
  }
}

function buildTransactionOperations(
  statData: MeridianStatData,
  result: MeridianUpgradeResult,
): EraTransactionOperation[] {
  const userPatch: Record<string, unknown> = { 修为: result.newCultivation };
  const operations: EraTransactionOperation[] = [
    {
      type: 'update',
      payload: { user数据: userPatch },
    },
  ];

  if (result.settlement?.类型 === '初始属性') {
    const attribute = result.settlement.属性 as keyof InitialAttributes;
    const attributePatch = { user数据: { 初始属性: { [attribute]: result.initialAttributes[attribute] } } };
    operations.push({
      type: Object.prototype.hasOwnProperty.call(statData.user数据?.初始属性 ?? {}, attribute) ? 'update' : 'insert',
      payload: attributePatch,
    });
  }

  const progressExists =
    statData.前端变量 && Object.prototype.hasOwnProperty.call(statData.前端变量, '奇经八脉');
  if (!progressExists) {
    operations.push({
      type: 'insert',
      payload: { 前端变量: { 奇经八脉: result.progress } },
    });
    return operations;
  }

  operations.push({
    type: 'update',
    payload: {
      前端变量: {
        奇经八脉: {
          已通穴位: result.progress.已通穴位,
        },
      },
    },
  });
  if (result.settlement) {
    operations.push({
      type: 'insert',
      payload: {
        前端变量: {
          奇经八脉: {
            关窍结算: { [result.nodeId]: result.settlement },
          },
        },
      },
    });
  }
  return operations;
}

async function reconcileUnknownResult(expected: MeridianUpgradeResult): Promise<boolean> {
  try {
    await eventEmit('manual_sync');
  } catch (error) {
    console.warn('[meridianManager] 冲穴结果未知，对账刷新失败', error);
  }

  try {
    assertUpgradePersisted(await readLatestStatData(), expected);
    return true;
  } catch (error) {
    console.warn('[meridianManager] 冲穴结果未知，回读未能确认事务落库', error);
    return false;
  }
}

async function performUpgrade(
  nodeId: MeridianNodeId,
  expectedQuote: MeridianUpgradeQuote,
): Promise<MeridianUpgradeResult> {
  const statData = await readLatestStatData();
  if (!statData.user数据 || !isRecord(statData.user数据)) {
    throw new Error('当前存档缺少玩家数据，无法冲穴。');
  }

  const cultivation =
    typeof statData.user数据.修为 === 'number' && Number.isFinite(statData.user数据.修为)
      ? Math.floor(statData.user数据.修为)
      : Number.NaN;
  const realm = typeof statData.user数据.境界 === 'string' ? statData.user数据.境界 : '';
  const initialAttributes = cloneInitialAttributes(statData.user数据);
  const progress = statData.前端变量?.奇经八脉;
  const actualQuote = quoteMeridianUpgrade({ progress, nodeId, realm, cultivation, initialAttributes });

  if (!quoteStillMatches(expectedQuote, actualQuote)) {
    throw new Error(
      `冲穴条件或报价已经变化，请刷新后重新确认。${actualQuote.reason ? `（${actualQuote.reason}）` : ''}`,
    );
  }

  const result = applyMeridianUpgrade({ progress, nodeId, realm, cultivation, initialAttributes });
  if (!result.success) {
    throw new Error(result.error ?? '当前无法冲穴。');
  }

  const transactionId = createTransactionId();
  const operations = buildTransactionOperations(statData, result);
  try {
    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'meridian-upgrade',
      refreshHint: 'character-data',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: { transactionId, operations },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: '冲穴事务已发出，但 ERA 没有确认写入完成。',
    });
  } catch (error) {
    if (await reconcileUnknownResult(result)) {
      return result;
    }
    throw new Error('冲穴结果暂时未知，已刷新存档进行对账；为避免重复扣除，本次不会自动重试。', {
      cause: error,
    });
  }

  assertUpgradePersisted(await readLatestStatData(), result);
  return result;
}

/**
 * 以玩家当前聊天分支中的最新变量执行一次不可逆冲穴。相同穴位的重复调用会共享同一事务，
 * 不同穴位在事务进行中会被拒绝，避免双击或并发操作造成重复扣除。
 */
export function upgradeMeridianNode(
  nodeId: MeridianNodeId,
  expectedQuote: MeridianUpgradeQuote,
): Promise<MeridianUpgradeResult> {
  if (activeUpgrade) {
    if (activeUpgrade.nodeId === nodeId) {
      return activeUpgrade.promise;
    }
    return Promise.reject(new Error('已有冲穴事务正在写入，请稍候。'));
  }

  const promise = performUpgrade(nodeId, expectedQuote).finally(() => {
    if (activeUpgrade?.promise === promise) {
      activeUpgrade = null;
    }
  });
  activeUpgrade = { nodeId, promise };
  return promise;
}
