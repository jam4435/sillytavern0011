import type {
  PublicFactionCatalogEntry,
  PublicFactionRelation,
  PublicFactionRuntimeState,
} from '../types';
import factionIdentityMapJson from '../data/factionIdentityMap.json';
import factionPublicCatalogJson from '../data/factionPublicCatalog.json';

declare function getVariables(filter?: { type: 'chat' | 'character' | 'global' }): Promise<Record<string, unknown>>;

interface FactionPublicCatalogDatabase {
  version: number;
  canonicalFactionCount: number;
  supplementalFactionCount: number;
  factions: PublicFactionCatalogEntry[];
  supplementalFactions: PublicFactionCatalogEntry[];
}

interface FactionIdentityMapDatabase {
  version: number;
  sourceRecordCount: number;
  canonicalFactionCount: number;
  note: string;
  mappings: Array<{
    source: string;
    targets: Array<{ canonical: string; mode: string }>;
  }>;
  relations: PublicFactionRelation[];
}

const PUBLIC_CATALOG = factionPublicCatalogJson as unknown as FactionPublicCatalogDatabase;
const IDENTITY_MAP = factionIdentityMapJson as unknown as FactionIdentityMapDatabase;

const ALL_PUBLIC_FACTIONS: PublicFactionCatalogEntry[] = [
  ...PUBLIC_CATALOG.factions,
  ...PUBLIC_CATALOG.supplementalFactions,
];

const DEAD_STATUS_RE = /(死亡|已死|身亡|已身亡|圆寂|毙命|殒命|伏诛|自尽|战死)/;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readIdentityMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = raw;
  }
  return result;
}

function isCharacterAlive(profile: Record<string, unknown>): boolean {
  const status = typeof profile.状态 === 'string' ? profile.状态 : '';
  return !DEAD_STATUS_RE.test(status);
}

function collectLeaderCandidates(
  profileName: string,
  profile: Record<string, unknown>,
  roleKeys: string[],
  names: string[],
  matchedKeys: string[],
): void {
  if (!isCharacterAlive(profile)) return;
  const identities = readIdentityMap(profile.身份);
  for (const roleKey of roleKeys) {
    if (!Object.prototype.hasOwnProperty.call(identities, roleKey)) continue;
    if (!names.includes(profileName)) names.push(profileName);
    if (!matchedKeys.includes(roleKey)) matchedKeys.push(roleKey);
  }
}

/** 原著资料层的完整 canonical 组织目录；不直接等于玩家可加入势力列表。 */
export function getAllPublicFactions(): PublicFactionCatalogEntry[] {
  return ALL_PUBLIC_FACTIONS;
}

/** 天下势力鉴赏只展示正式可玩势力；世界组织资料仍保留在完整目录中供归一/考据使用。 */
export function getPlayablePublicFactions(): PublicFactionCatalogEntry[] {
  return ALL_PUBLIC_FACTIONS.filter(faction => faction.可加入 && Boolean(faction.sectId));
}

/** 通过 canonical id、公开名称或别名查找公开势力。 */
export function getPublicFactionByName(nameOrId: string): PublicFactionCatalogEntry | undefined {
  const query = normalizeQuery(nameOrId);
  if (!query) return undefined;
  return ALL_PUBLIC_FACTIONS.find(faction => {
    if (normalizeQuery(faction.势力ID) === query || normalizeQuery(faction.势力名称) === query) return true;
    return faction.别名.some(alias => normalizeQuery(alias) === query);
  });
}

/** 将来源名称或别名归一到 canonical faction id。 */
export function resolveCanonicalFactionId(name: string): string | undefined {
  return getPublicFactionByName(name)?.势力ID;
}

/** 获取某势力的长期/历史关系边。关系只表达资料层关系，不替代运行时状态。 */
export function getPublicFactionRelations(nameOrId: string): PublicFactionRelation[] {
  const id = resolveCanonicalFactionId(nameOrId) || nameOrId;
  return IDENTITY_MAP.relations.filter(edge => edge.from === id || edge.to === id);
}

/**
 * 从当前聊天变量解析势力的“当前掌舵人”。
 *
 * 真相优先级只使用当前人物身份变量：
 * - 角色数据.*.身份
 * - user数据.身份（玩家若实际取得相同首领身份也可被识别）
 *
 * 不根据作品名、当前年份或“某事件理论上已经发生”推断首领，
 * 避免玩家改变事件结局后出现静态时间表覆盖分支真相。
 */
export async function resolveFactionPublicState(
  factionOrName: PublicFactionCatalogEntry | string,
): Promise<PublicFactionRuntimeState> {
  const faction =
    typeof factionOrName === 'string' ? getPublicFactionByName(factionOrName) : factionOrName;

  if (!faction) {
    return {
      势力ID: typeof factionOrName === 'string' ? factionOrName : '',
      当前掌舵人: [],
      当前掌舵人来源: 'unresolved',
      命中身份键: [],
    };
  }

  if (faction.首领身份键.length === 0) {
    return {
      势力ID: faction.势力ID,
      当前掌舵人: [],
      当前掌舵人来源: 'unresolved',
      命中身份键: [],
    };
  }

  try {
    const variables = await getVariables({ type: 'chat' });
    const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
    const names: string[] = [];
    const matchedKeys: string[] = [];

    const characterData = isRecord(statData.角色数据) ? statData.角色数据 : {};
    for (const [name, rawProfile] of Object.entries(characterData)) {
      if (!isRecord(rawProfile)) continue;
      collectLeaderCandidates(name, rawProfile, faction.首领身份键, names, matchedKeys);
    }

    const userData = isRecord(statData.user数据) ? statData.user数据 : {};
    const userName =
      typeof userData.用户名 === 'string' && userData.用户名.trim() ? userData.用户名.trim() : '玩家';
    collectLeaderCandidates(userName, userData, faction.首领身份键, names, matchedKeys);

    return {
      势力ID: faction.势力ID,
      当前掌舵人: names,
      当前掌舵人来源: names.length > 0 ? 'variable' : 'unresolved',
      命中身份键: matchedKeys,
    };
  } catch {
    return {
      势力ID: faction.势力ID,
      当前掌舵人: [],
      当前掌舵人来源: 'unresolved',
      命中身份键: [],
    };
  }
}
