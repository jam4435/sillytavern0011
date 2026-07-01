import type { InitialAttributes } from '../types';
import {
  calculateCombatAttributes,
  getRealmCoefficient,
} from './attributeCalculator';
import {
  completeMartialArts,
  loadMartialArtsDatabase,
  type CompleteMartialArt,
  type MartialArtsType,
  type SimpleMartialArt,
} from './martialArtsDatabase';
import {
  buildCurrentDynamicLocationContext,
  createDynamicLocationContextVariable,
  updateLocationContextInVariables,
  type DynamicLocationContextVariable,
} from './locationContext';
import {
  FRONTEND_BATTLE_ZONE_KEY,
  FRONTEND_RANDOM_NUMBERS_KEY,
  FRONTEND_VARIABLES_KEY,
} from './frontendVariableKeys';
import { dataLogger } from './logger';
const DEFAULT_RANDOM_NUMBER_COUNT = 5;

const POWER_ZONE_TYPES: MartialArtsType[] = [
  '内功',
  '外功',
  '轻功',
  '剑法',
  '刀法',
  '拳掌',
  '指法',
  '暗器',
  '枪戟',
  '棍锤',
];

const POWER_ZONE_HEADER = ['角色', ...POWER_ZONE_TYPES].join('|');
const DEFAULT_INITIAL_ATTRIBUTES: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 0,
};

type CharacterMartialArtRecord = Record<string, SimpleMartialArt | unknown>;

type PlayerProfile = {
  用户名?: string;
  所在位置?: string;
  境界?: string;
  修为?: number;
  初始属性?: Partial<InitialAttributes>;
  功法?: CharacterMartialArtRecord;
};

type NpcProfile = {
  姓名?: string;
  所在位置?: string;
  境界?: string;
  修为?: number;
  初始属性?: Partial<InitialAttributes>;
  功法?: CharacterMartialArtRecord;
};

type CombatCharacter = {
  displayName: string;
  normalizedLocation: string;
  realm: string;
  cultivation: number;
  initialAttributes: InitialAttributes;
  martialArts: Record<string, SimpleMartialArt>;
};

type StatDataRecord = Record<string, unknown>;

type FrontendDerivedVariables = {
  周围地点: DynamicLocationContextVariable;
  战力区: string;
  随机数: string;
};

type MartialArtPowerEntry = {
  name: string;
  power: number;
};

type FrontendVariablesRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLocationPath(value: string): string {
  return value
    .trim()
    .replace(/[\\＞>›→]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function sanitizeInitialAttributes(input: Partial<InitialAttributes> | undefined): InitialAttributes {
  return {
    臂力: Number.isFinite(input?.臂力) ? Number(input?.臂力) : DEFAULT_INITIAL_ATTRIBUTES.臂力,
    根骨: Number.isFinite(input?.根骨) ? Number(input?.根骨) : DEFAULT_INITIAL_ATTRIBUTES.根骨,
    机敏: Number.isFinite(input?.机敏) ? Number(input?.机敏) : DEFAULT_INITIAL_ATTRIBUTES.机敏,
    悟性: Number.isFinite(input?.悟性) ? Number(input?.悟性) : DEFAULT_INITIAL_ATTRIBUTES.悟性,
    洞察: Number.isFinite(input?.洞察) ? Number(input?.洞察) : DEFAULT_INITIAL_ATTRIBUTES.洞察,
    风姿: Number.isFinite(input?.风姿) ? Number(input?.风姿) : DEFAULT_INITIAL_ATTRIBUTES.风姿,
    福缘: Number.isFinite(input?.福缘) ? Number(input?.福缘) : DEFAULT_INITIAL_ATTRIBUTES.福缘,
  };
}

function toSimpleMartialArts(martialArts: CharacterMartialArtRecord | undefined): Record<string, SimpleMartialArt> {
  if (!isRecord(martialArts)) {
    return {};
  }

  return Object.entries(martialArts).reduce<Record<string, SimpleMartialArt>>((result, [name, value]) => {
    if (name.startsWith('$') || !isRecord(value)) {
      return result;
    }

    result[name] = {
      掌握程度: typeof value.掌握程度 === 'string' ? value.掌握程度 : undefined,
      类型: typeof value.类型 === 'string' ? value.类型 : undefined,
      功法描述: typeof value.功法描述 === 'string' ? value.功法描述 : undefined,
      功法品阶: typeof value.功法品阶 === 'string' ? value.功法品阶 : undefined,
      特性: isRecord(value.特性) ? value.特性 as Record<string, string> : undefined,
    };
    return result;
  }, {});
}

function buildPlayerCharacter(statData: StatDataRecord): CombatCharacter | null {
  const userData = isRecord(statData.user数据) ? statData.user数据 as PlayerProfile : null;
  if (!userData) {
    return null;
  }

  return {
    displayName: typeof userData.用户名 === 'string' && userData.用户名.trim() ? userData.用户名.trim() : '你',
    normalizedLocation: normalizeLocationPath(typeof userData.所在位置 === 'string' ? userData.所在位置 : ''),
    realm: typeof userData.境界 === 'string' && userData.境界.trim() ? userData.境界.trim() : '不入流',
    cultivation: Number.isFinite(userData.修为) ? Number(userData.修为) : 0,
    initialAttributes: sanitizeInitialAttributes(userData.初始属性),
    martialArts: toSimpleMartialArts(userData.功法),
  };
}

function buildNpcCharacters(statData: StatDataRecord): CombatCharacter[] {
  const characters = isRecord(statData.角色数据) ? statData.角色数据 : null;
  if (!characters) {
    return [];
  }

  return Object.entries(characters).reduce<CombatCharacter[]>((result, [name, value]) => {
    if (name.startsWith('$') || !isRecord(value)) {
      return result;
    }

    const npc = value as NpcProfile;
    const displayName = typeof npc.姓名 === 'string' && npc.姓名.trim() ? npc.姓名.trim() : name;
    result.push({
      displayName,
      normalizedLocation: normalizeLocationPath(typeof npc.所在位置 === 'string' ? npc.所在位置 : ''),
      realm: typeof npc.境界 === 'string' && npc.境界.trim() ? npc.境界.trim() : '不入流',
      cultivation: Number.isFinite(npc.修为) ? Number(npc.修为) : 0,
      initialAttributes: sanitizeInitialAttributes(npc.初始属性),
      martialArts: toSimpleMartialArts(npc.功法),
    });
    return result;
  }, []);
}

function isKnownPowerZoneType(type: string): type is MartialArtsType {
  return POWER_ZONE_TYPES.includes(type as MartialArtsType);
}

function getCombatAttributeValue(
  attributeName: string,
  multiplyByRealm: boolean,
  initialAttributes: InitialAttributes,
  combatAttributes: ReturnType<typeof calculateCombatAttributes>,
  realmCoefficient: number,
): number | null {
  if (attributeName === '臂力' || attributeName === '根骨' || attributeName === '机敏' || attributeName === '洞察') {
    return combatAttributes[attributeName];
  }

  if (attributeName === '悟性' || attributeName === '风姿' || attributeName === '福缘') {
    const baseValue = initialAttributes[attributeName];
    return multiplyByRealm ? Math.floor(baseValue * realmCoefficient) : baseValue;
  }

  return null;
}

function calculateMartialArtPower(
  martialArt: CompleteMartialArt,
  initialAttributes: InitialAttributes,
  realmCoefficient: number,
  combatAttributes: ReturnType<typeof calculateCombatAttributes>,
): number | null {
  const attributeList = martialArt.combatCoefficient?.属性列表;
  if (!attributeList || attributeList.length === 0) {
    return null;
  }

  let total = 0;
  let recognizedCount = 0;

  for (const attribute of attributeList) {
    const attributeValue = getCombatAttributeValue(
      attribute.属性,
      attribute.乘境界 === true,
      initialAttributes,
      combatAttributes,
      realmCoefficient,
    );
    if (attributeValue === null) {
      continue;
    }
    recognizedCount += 1;
    total += attributeValue * attribute.系数;
  }

  if (recognizedCount === 0) {
    return null;
  }

  return Math.round(total);
}

function buildCharacterPowerRow(character: CombatCharacter): string {
  const completedMartialArts = completeMartialArts(
    character.martialArts,
    character.cultivation,
    character.initialAttributes.悟性,
  );
  const realmCoefficient = getRealmCoefficient(character.realm);
  const combatAttributes = calculateCombatAttributes(character.initialAttributes, character.realm);
  const entriesByType = POWER_ZONE_TYPES.reduce<Record<MartialArtsType, MartialArtPowerEntry[]>>((result, type) => {
    result[type] = [];
    return result;
  }, {} as Record<MartialArtsType, MartialArtPowerEntry[]>);

  for (const [name, martialArt] of Object.entries(completedMartialArts)) {
    if (!isKnownPowerZoneType(martialArt.type)) {
      continue;
    }

    const power = calculateMartialArtPower(
      martialArt,
      character.initialAttributes,
      realmCoefficient,
      combatAttributes,
    );
    if (power === null || power <= 0) {
      continue;
    }

    entriesByType[martialArt.type].push({ name, power });
  }

  const cells = POWER_ZONE_TYPES.map(type => {
    const entries = entriesByType[type]
      .sort((left, right) => right.power - left.power || left.name.localeCompare(right.name, 'zh-CN'));
    if (entries.length === 0) {
      return '无';
    }
    return entries.map(entry => `${entry.name}=${entry.power}`).join(';');
  });

  return [character.displayName, ...cells].join('|');
}

export function buildCombatPowerZoneFromStatData(statData: StatDataRecord): string {
  const player = buildPlayerCharacter(statData);
  const playerLocation = player?.normalizedLocation || '';
  const npcRows = buildNpcCharacters(statData)
    .filter(character => playerLocation && character.normalizedLocation === playerLocation)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'));
  const rows: string[] = [POWER_ZONE_HEADER];

  if (player) {
    rows.push(buildCharacterPowerRow(player));
  }

  for (const npc of npcRows) {
    rows.push(buildCharacterPowerRow(npc));
  }

  return rows.join('\n');
}

function getStatDataRecord(variables: Record<string, unknown>): StatDataRecord {
  return isRecord(variables.stat_data) ? variables.stat_data : variables;
}

function getFrontendVariablesRecord(variables: Record<string, unknown>): FrontendVariablesRecord {
  const statData = getStatDataRecord(variables);
  return isRecord(statData[FRONTEND_VARIABLES_KEY]) ? statData[FRONTEND_VARIABLES_KEY] : {};
}

function getWorldInfoRecord(variables: Record<string, unknown>): Record<string, unknown> {
  const statData = getStatDataRecord(variables);
  return isRecord(statData.世界信息) ? statData.世界信息 : {};
}

function hasLegacyLocationContext(variables: Record<string, unknown>): boolean {
  const worldInfo = getWorldInfoRecord(variables);
  return (
    Object.hasOwn(variables, '地图上下文') ||
    Object.hasOwn(variables, '周围地点') ||
    Object.hasOwn(worldInfo, '地图上下文') ||
    Object.hasOwn(worldInfo, '周围地点')
  );
}

function shouldRefreshLocationContext(
  variables: Record<string, unknown>,
  locationContext: DynamicLocationContextVariable,
): boolean {
  const frontendVariables = getFrontendVariablesRecord(variables);
  return (
    JSON.stringify(frontendVariables.周围地点) !== JSON.stringify(locationContext) ||
    hasLegacyLocationContext(variables)
  );
}

function upsertFrontendVariables(
  variables: Record<string, unknown>,
  updates: Partial<FrontendDerivedVariables>,
): Record<string, unknown> {
  const hasStatDataWrapper = isRecord(variables.stat_data);
  const statData = hasStatDataWrapper ? variables.stat_data as Record<string, unknown> : variables;
  const currentFrontendVariables = isRecord(statData[FRONTEND_VARIABLES_KEY])
    ? statData[FRONTEND_VARIABLES_KEY] as Record<string, unknown>
    : {};
  const nextFrontendVariables = {
    ...currentFrontendVariables,
    ...updates,
  };
  const nextStatData = {
    ...statData,
    [FRONTEND_VARIABLES_KEY]: nextFrontendVariables,
  };

  if (hasStatDataWrapper) {
    return {
      ...variables,
      stat_data: nextStatData,
    };
  }

  return nextStatData;
}

export function buildFrontendRandomNumbers(count = DEFAULT_RANDOM_NUMBER_COUNT): string {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `随机数${index + 1}: ${Math.floor(Math.random() * 11)}`)
    .join('\n');
}

export async function syncFrontendDerivedVariables(): Promise<FrontendDerivedVariables | null> {
  try {
    const [locationContext] = await Promise.all([
      buildCurrentDynamicLocationContext().then(createDynamicLocationContextVariable),
      loadMartialArtsDatabase(),
    ]);
    const currentVariables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = getStatDataRecord(currentVariables);
    const battleZone = buildCombatPowerZoneFromStatData(statData);
    const randomNumbers = buildFrontendRandomNumbers();

    updateVariablesWith(current => {
      const currentVariables = current as Record<string, unknown>;
      const nextWithLocation = shouldRefreshLocationContext(currentVariables, locationContext)
        ? updateLocationContextInVariables(currentVariables, locationContext)
        : currentVariables;
      const frontendVariables = getFrontendVariablesRecord(nextWithLocation);
      const updates = {
        [FRONTEND_RANDOM_NUMBERS_KEY]: randomNumbers,
      } as Partial<FrontendDerivedVariables>;
      if (frontendVariables[FRONTEND_BATTLE_ZONE_KEY] !== battleZone) {
        updates[FRONTEND_BATTLE_ZONE_KEY] = battleZone;
      }

      return upsertFrontendVariables(nextWithLocation, updates);
    }, { type: 'chat' });

    return {
      周围地点: locationContext,
      战力区: battleZone,
      随机数: randomNumbers,
    };
  } catch (error) {
    dataLogger.warn('[frontendDerivedVariables] 刷新前端变量失败:', error);
    return null;
  }
}
