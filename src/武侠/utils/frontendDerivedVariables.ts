import type { InitialAttributes } from '../types';
import { getLocationScopePath, normalizeLocationPath } from '../../shared/locationPath.js';
import {
  applyAttributeModifiers,
  calculateCombatAttributes,
  getRealmCoefficient,
  parseRealm,
  REALM_IMPLIED_BONUS,
  type AttributeModifierMap,
  type AttributeModifierSource,
} from './attributeCalculator';
import {
  calculateMartialArtBonus,
  completeMartialArts,
  loadMartialArtsDatabase,
  type CompleteMartialArt,
  type MartialArtsType,
  type SimpleMartialArt,
} from './martialArtsDatabase';
import {
  buildCurrentDynamicLocationContext,
  collectEventTargetPaths,
  createDynamicLocationContextVariable,
  updateLocationContextInVariables,
  type DynamicLocationContextVariable,
} from './locationContext';
import {
  FRONTEND_BATTLE_ZONE_KEY,
  FRONTEND_CULTIVATION_REFERENCE_KEY,
  FRONTEND_RANDOM_NUMBERS_KEY,
  FRONTEND_VARIABLES_KEY,
} from './frontendVariableKeys';
import { dataLogger } from './logger';
import { deriveMeridianModifiers } from './meridianSystem';
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
  包裹?: Record<string, unknown>;
  装备栏?: Record<string, unknown>;
  状态效果?: Record<string, unknown>;
};

type NpcProfile = {
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
  attributeModifiers?: AttributeModifierSource[];
};

type StatDataRecord = Record<string, unknown>;

type FrontendDerivedVariables = {
  周围地点: DynamicLocationContextVariable;
  战力区: string;
  随机数: string;
  修为变化参考: number;
};

export interface SyncFrontendDerivedVariablesOptions {
  explicitMapTargets?: string[];
}

type MartialArtPowerEntry = {
  name: string;
  power: number;
};

type FrontendVariablesRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      特性: isRecord(value.特性) ? (value.特性 as Record<string, string>) : undefined,
    };
    return result;
  }, {});
}

function normalizeModifierMap(value: unknown): AttributeModifierMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([attribute, modifier]) => Boolean(attribute) && typeof modifier === 'number' && Number.isFinite(modifier),
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as AttributeModifierMap) : undefined;
}

function createModifierSource(
  id: string,
  kind: AttributeModifierSource['kind'],
  rank: unknown,
  modifiers?: AttributeModifierMap,
): AttributeModifierSource | null {
  return modifiers ? { id, kind, rank: typeof rank === 'string' ? rank : undefined, modifiers } : null;
}

function collectPlayerAttributeModifiers(
  userData: PlayerProfile,
  frontendVariables?: Record<string, unknown>,
): AttributeModifierSource[] | undefined {
  const sources: AttributeModifierSource[] = [];
  const packageItems = isRecord(userData.包裹) ? userData.包裹 : {};
  const equipmentSlots = isRecord(userData.装备栏) ? userData.装备栏 : {};
  const statusEffects = isRecord(userData.状态效果) ? userData.状态效果 : {};
  const permanentModifiers = isRecord(frontendVariables?.永久属性修正) ? frontendVariables.永久属性修正 : {};
  const meridianModifiers = deriveMeridianModifiers(frontendVariables?.奇经八脉);

  if (Object.values(meridianModifiers).some(value => value !== 0)) {
    sources.push({ id: '奇经八脉', kind: '经脉', modifiers: meridianModifiers });
  }

  for (const [slot, itemName] of Object.entries(equipmentSlots)) {
    if (slot.startsWith('$') || typeof itemName !== 'string') {
      continue;
    }

    const item = packageItems[itemName];
    if (!isRecord(item)) {
      continue;
    }

    const source = createModifierSource(`装备:${itemName}`, '装备', item.品阶, normalizeModifierMap(item.属性修正));
    if (source) {
      sources.push(source);
    }
  }

  for (const [effectId, effect] of Object.entries(statusEffects)) {
    if (effectId.startsWith('$') || !isRecord(effect)) {
      continue;
    }

    const remaining = typeof effect.剩余时间 === 'number' ? effect.剩余时间 : Number(effect.剩余时间);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      continue;
    }

    const source = createModifierSource(
      `状态:${effectId}`,
      effect.功效类型 === '永久增幅' ? '永久增幅' : '临时增幅',
      effect.品阶,
      normalizeModifierMap(effect.属性修正),
    );
    if (source) {
      sources.push(source);
    }
  }

  for (const [modifierId, modifier] of Object.entries(permanentModifiers)) {
    if (modifierId.startsWith('$') || !isRecord(modifier)) {
      continue;
    }

    const source = createModifierSource(
      `永久:${modifierId}`,
      '永久增幅',
      modifier.品阶,
      normalizeModifierMap(modifier.属性修正),
    );
    if (source) {
      sources.push(source);
    }
  }

  return sources.length > 0 ? sources : undefined;
}

function buildPlayerCharacter(statData: StatDataRecord): CombatCharacter | null {
  const userData = isRecord(statData.user数据) ? (statData.user数据 as PlayerProfile) : null;
  const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : undefined;
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
    attributeModifiers: collectPlayerAttributeModifiers(userData, frontendVariables),
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
    result.push({
      displayName: name,
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

export function calculateBasicTechniquePower(
  realm: string,
  combatAttributes: Pick<ReturnType<typeof calculateCombatAttributes>, '臂力' | '根骨' | '机敏' | '洞察'>,
): number {
  if (parseRealm(realm).major === '不入流') {
    return 0;
  }
  return Math.round(
    (combatAttributes.臂力 + combatAttributes.根骨 + combatAttributes.机敏 + combatAttributes.洞察) * 0.15,
  );
}

function buildCharacterPowerRow(character: CombatCharacter): string {
  const completedMartialArts = completeMartialArts(
    character.martialArts,
    character.cultivation,
    character.initialAttributes.悟性,
  );
  const realmCoefficient = getRealmCoefficient(character.realm);
  const baseCombatAttributes = calculateCombatAttributes(character.initialAttributes, character.realm);
  const { combat: combatAttributes } = applyAttributeModifiers(
    baseCombatAttributes,
    { 气血上限: 0, 内力上限: 0 },
    character.attributeModifiers,
  );
  const entriesByType = POWER_ZONE_TYPES.reduce<Record<MartialArtsType, MartialArtPowerEntry[]>>(
    (result, type) => {
      result[type] = [];
      return result;
    },
    {} as Record<MartialArtsType, MartialArtPowerEntry[]>,
  );

  for (const [name, martialArt] of Object.entries(completedMartialArts)) {
    if (!isKnownPowerZoneType(martialArt.type)) {
      continue;
    }

    const power = calculateMartialArtPower(martialArt, character.initialAttributes, realmCoefficient, combatAttributes);
    if (power === null || power <= 0) {
      continue;
    }

    entriesByType[martialArt.type].push({ name, power });
  }

  const cells = POWER_ZONE_TYPES.flatMap(type => {
    const entries = entriesByType[type].sort(
      (left, right) => right.power - left.power || left.name.localeCompare(right.name, 'zh-CN'),
    );
    if (entries.length === 0) {
      return [];
    }
    return [`${type}:${entries.map(entry => `${entry.name}=${entry.power}`).join(';')}`];
  });

  const basicTechniquePower = calculateBasicTechniquePower(character.realm, combatAttributes);
  return [character.displayName, `位置:${character.normalizedLocation}`, `基础:${basicTechniquePower}`, ...cells].join(
    '|',
  );
}

function calculateEffectiveCultivationBonus(character: CombatCharacter): number {
  const completedMartialArts = completeMartialArts(
    character.martialArts,
    character.cultivation,
    character.initialAttributes.悟性,
  );
  let bestExplicitInner = 0;

  for (const martialArt of Object.values(completedMartialArts)) {
    if (martialArt.type !== '内功') {
      continue;
    }
    bestExplicitInner = Math.max(bestExplicitInner, calculateMartialArtBonus(martialArt.rank, martialArt.mastery));
  }

  const { major } = parseRealm(character.realm);
  const impliedInner = REALM_IMPLIED_BONUS[major] || 0;
  return Math.max(bestExplicitInner, impliedInner);
}

export function buildCultivationChangeReferenceFromStatData(statData: StatDataRecord): number {
  const player = buildPlayerCharacter(statData);
  if (!player) {
    return 0;
  }

  const effectiveCultivationBonus = calculateEffectiveCultivationBonus(player);
  if (effectiveCultivationBonus <= 0) {
    return 0;
  }

  return Math.round(Math.log2(getRealmCoefficient(player.realm) + 1) * effectiveCultivationBonus);
}

export function buildCombatPowerZoneFromStatData(statData: StatDataRecord): string {
  const player = buildPlayerCharacter(statData);
  const playerScope = getLocationScopePath(player?.normalizedLocation || '');
  const npcRows = buildNpcCharacters(statData)
    .filter(character => playerScope && getLocationScopePath(character.normalizedLocation) === playerScope)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'));
  const rows: string[] = [];

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
  const statData = hasStatDataWrapper ? (variables.stat_data as Record<string, unknown>) : variables;
  const currentFrontendVariables = isRecord(statData[FRONTEND_VARIABLES_KEY])
    ? (statData[FRONTEND_VARIABLES_KEY] as Record<string, unknown>)
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
  return Array.from(
    { length: Math.max(0, count) },
    (_, index) => `随机数${index + 1}: ${Math.floor(Math.random() * 11)}`,
  ).join('\n');
}

export async function syncFrontendDerivedVariables(
  options: SyncFrontendDerivedVariablesOptions = {},
): Promise<FrontendDerivedVariables | null> {
  try {
    const [dynamicLocationContext] = await Promise.all([
      buildCurrentDynamicLocationContext(),
      loadMartialArtsDatabase(),
    ]);
    const currentVariables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = getStatDataRecord(currentVariables);
    const locationContext = createDynamicLocationContextVariable(dynamicLocationContext, {
      eventTargetPaths: collectEventTargetPaths(statData),
      explicitMapTargets: options.explicitMapTargets,
    });
    const battleZone = buildCombatPowerZoneFromStatData(statData);
    const cultivationReference = buildCultivationChangeReferenceFromStatData(statData);
    const randomNumbers = buildFrontendRandomNumbers();

    updateVariablesWith(
      current => {
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
        if (frontendVariables[FRONTEND_CULTIVATION_REFERENCE_KEY] !== cultivationReference) {
          updates[FRONTEND_CULTIVATION_REFERENCE_KEY] = cultivationReference;
        }

        return upsertFrontendVariables(nextWithLocation, updates);
      },
      { type: 'chat' },
    );

    return {
      周围地点: locationContext,
      战力区: battleZone,
      随机数: randomNumbers,
      修为变化参考: cultivationReference,
    };
  } catch (error) {
    dataLogger.warn('[frontendDerivedVariables] 刷新前端变量失败:', error);
    return null;
  }
}
