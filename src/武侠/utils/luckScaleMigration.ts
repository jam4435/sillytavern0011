import { runDirectChatVariableWrite } from '../../shared/directVariableWrite';
import { INITIAL_ATTRIBUTE_SCALE_VERSION, MAX_ATTRIBUTE_VALUE, MIN_ATTRIBUTE_VALUE } from './gameInitializer';

export interface LuckScaleMigrationResult {
  migrated: boolean;
  previousLuck?: number;
  luck?: number;
  version: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampAttribute(value: number): number {
  return Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, value));
}

/**
 * 旧版玩家福缘采用 -6～14，v2 与其余六维统一到 0～20。
 * 缺少版本标记的既有聊天视为旧刻度，并执行一次 +6 平移；新游戏会直接写入 v2 标记。
 */
export async function migratePlayerLuckScale(): Promise<LuckScaleMigrationResult> {
  const variables = getVariables({ type: 'chat' });
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const frontend = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const version = Number(frontend.福缘刻度版本);

  if (version === INITIAL_ATTRIBUTE_SCALE_VERSION) {
    return { migrated: false, version: INITIAL_ATTRIBUTE_SCALE_VERSION };
  }

  const userData = isRecord(statData.user数据) ? statData.user数据 : {};
  const initialAttributes = isRecord(userData.初始属性) ? userData.初始属性 : {};
  const previousLuck = Number(initialAttributes.福缘);

  if (!Number.isFinite(previousLuck)) {
    return { migrated: false, version: Number.isFinite(version) ? version : 0 };
  }

  const luck = previousLuck > 14 ? clampAttribute(previousLuck) : clampAttribute(previousLuck + 6);

  await runDirectChatVariableWrite(
    {
      source: 'frontend',
      operation: 'replace',
      reason: 'luck-scale-v2-migration',
      refreshHint: 'character-data',
    },
    () =>
      updateVariablesWith(currentVariables => {
        const currentStatData = isRecord(currentVariables.stat_data) ? currentVariables.stat_data : {};
        const currentFrontend = isRecord(currentStatData.前端变量) ? currentStatData.前端变量 : {};
        const currentUserData = isRecord(currentStatData.user数据) ? currentStatData.user数据 : {};
        const currentInitialAttributes = isRecord(currentUserData.初始属性) ? currentUserData.初始属性 : {};

        return {
          ...currentVariables,
          stat_data: {
            ...currentStatData,
            前端变量: {
              ...currentFrontend,
              福缘刻度版本: INITIAL_ATTRIBUTE_SCALE_VERSION,
            },
            user数据: {
              ...currentUserData,
              初始属性: {
                ...currentInitialAttributes,
                福缘: luck,
              },
            },
          },
        };
      }, { type: 'chat' }),
  );

  return {
    migrated: luck !== previousLuck || version !== INITIAL_ATTRIBUTE_SCALE_VERSION,
    previousLuck,
    luck,
    version: INITIAL_ATTRIBUTE_SCALE_VERSION,
  };
}
