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

const DYNAMIC_OVERVIEW_RE =
  /(后遭|后来|曾任|现任|已故|身亡|遇害|伏诛|接任|继任|传位|退隐|自尽|焚宫|攻山|散伙|解散|覆灭|推选新帮主|正文时代)/;

export interface PublicFactionDisplayLayer {
  名称: string;
  人数: string;
  已知人物: string[];
}

export interface PublicFactionDisplayProfile {
  概况: string;
  组织结构: PublicFactionDisplayLayer[];
}

function organizationGroupKey(name: string): string {
  return name.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function displayOrganizationName(name: string): string {
  return name.replace(/（([^）]+)）/g, ' · $1').replace(/\(([^)]+)\)/g, ' · $1').replace(/\s+/g, ' ').trim();
}

function normalizeHeadcount(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^\d+$/.test(value)) return `${value}人`;
  if (/^(约|近|逾|至少|不下于)?\d+(?:[～~-]\d+)?(?:余|多)?人$/.test(value)) return value;
  const arabicMatch = value.match(/(?:约|至少|少说也有)?(\d+)(?:余|多)?(?:人|名|位)/);
  if (arabicMatch) return `${arabicMatch[1]}${/余|多/.test(arabicMatch[0]) ? '余人' : '人'}`;
  if (/二千余|两千余/.test(value)) return '二千余人';
  if (/五百余|五百多/.test(value)) return '五百余人';
  if (/数百|几百/.test(value)) return '数百人';
  if (/百余/.test(value)) return '百余人';
  if (/数十[^；，。]*数百/.test(value)) return '数十至数百人';
  if (/数十/.test(value)) return '数十人';
  if (/人数众多|人多势众|众多|遍布天下|遍布全国|数千帮众/.test(value)) return '人数众多';
  return '人数不详';
}

function cleanOverview(text: string): string {
  const chunks = text.split(/[；。]/).map(chunk => chunk.trim()).filter(Boolean);
  const stable = chunks.filter(chunk => !DYNAMIC_OVERVIEW_RE.test(chunk));
  const selected = (stable.length ? stable : chunks).slice(0, 2);
  if (!selected.length) return '';
  const result = selected.join('；');
  return result.length > 180 ? `${result.slice(0, 177)}…` : `${result}。`;
}

export function getPublicFactionDisplayProfile(
  factionOrName: PublicFactionCatalogEntry | string,
): PublicFactionDisplayProfile | undefined {
  const faction = typeof factionOrName === 'string' ? getPublicFactionByName(factionOrName) : factionOrName;
  if (!faction) return undefined;

  const grouped = new Map<string, PublicFactionDisplayLayer>();
  for (const layer of faction.组织结构) {
    const key = organizationGroupKey(layer.名称);
    if (!key) continue;
    const current = grouped.get(key);
    const count = normalizeHeadcount(layer.显示人数);
    if (!current) {
      grouped.set(key, { 名称: displayOrganizationName(layer.名称), 人数: count, 已知人物: [...new Set(layer.已知人物)] });
      continue;
    }
    for (const person of layer.已知人物) if (!current.已知人物.includes(person)) current.已知人物.push(person);
    if ((!current.人数 || current.人数 === '人数不详') && count && count !== '人数不详') current.人数 = count;
    const nextName = displayOrganizationName(layer.名称);
    if (nextName.length < current.名称.length) current.名称 = nextName;
  }

  const candidates = faction.规模资料.map(record => cleanOverview(record.描述)).filter(Boolean).sort((a,b)=>b.length-a.length);
  return { 概况: candidates[0] || '公开资料待补充。', 组织结构: [...grouped.values()] };
}

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
