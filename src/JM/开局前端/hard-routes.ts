export const HARD_IDENTITY_ROUTE_DEFAULT = 'none';

export const HARD_IDENTITY_ROUTE_KEYS = [
  HARD_IDENTITY_ROUTE_DEFAULT,
  'imperial_male_elite',
  'imperial_male_lowborn',
  'imperial_female_survival',
  'imperial_female_revolutionary',
  'imperial_female_reformist',
  'akentor_male_defector',
  'external_revolutionary_army',
  'external_roaring_sisterhood',
  'imperial_male_thorn_crown',
] as const;

export type HardIdentityRouteKey = (typeof HARD_IDENTITY_ROUTE_KEYS)[number];
export type HardIdentityRouteGender = 'male' | 'female' | 'any';

export interface HardIdentityRouteOption {
  key: HardIdentityRouteKey;
  label: string;
  difficulty: string;
  gender: HardIdentityRouteGender;
  description: string;
  enabled: boolean;
}

export const hardIdentityRouteOptions: readonly HardIdentityRouteOption[] = [
  {
    key: HARD_IDENTITY_ROUTE_DEFAULT,
    label: '不启用',
    difficulty: '默认',
    gender: 'any',
    description: '不向提示词注入高难身份路线，清空旧聊天残留路线变量。',
    enabled: true,
  },
  {
    key: 'imperial_male_elite',
    label: '路线一：血冕将倾',
    difficulty: '困难',
    gender: 'male',
    description: '帝国男性高层线。血统本该是秩序的基石，如今却是彼此轻蔑的锁链——四级鄙夷五级的迟钝，五级憎恨四级的礼遇。教廷架空君权，军队豢养边患，而被侍奉、被工具化的女性正在阴影里悄悄结网。这顶王冠越戴越重，也越戴越薄。',
    enabled: true,
  },
  {
    key: 'imperial_male_lowborn',
    label: '路线二：阶梯上的献祭',
    difficulty: '困难',
    gender: 'male',
    description: '帝国底层男性攀爬线。身为男性的特权只够让人站在阶梯最底层张望，真正的上升需要一份投名状——通常是踩碎一个比自己更弱的人。',
    enabled: true,
  },
  {
    key: 'imperial_female_survival',
    label: '路线三：公民or奴隶？',
    difficulty: '噩梦',
    gender: 'female',
    description: '帝国女性公民的一生。公民从胚胎编号到35岁报废，女性公民们被装在一条流水线上——学院规训、成人估价、岗位流转、所有权转移、延期申请，而所谓自由,不过是从一种所有权换到另一种、稍微宽松一点的绳索。',
    enabled: true,
  },
  {
    key: 'imperial_female_revolutionary',
    label: '路线四：火种与刑台',
    difficulty: '噩梦+',
    gender: 'female',
    description: '帝国女性武装革命线。在档案镇压、审讯连坐、外部盟友分歧和组织保密之间建立可存活的反抗网络。',
    enabled: true,
  },
  {
    key: 'imperial_female_reformist',
    label: '路线五：沉默的合唱',
    difficulty: '噩梦++',
    gender: 'female',
    description: '帝国女性内部改良。合法身份是盾牌也是脚镣，沉默游行是抗议也是备案名单。她要在告解室、互助会和政府演讲台之间走出一条不沾血的钢丝——而那位女权革命家的微笑比警察的警棍更难读懂。',
    enabled: false,
  },
  {
    key: 'akentor_male_defector',
    label: '路线六：不忠的儿子',
    difficulty: '较难',
    gender: 'male',
    description: '阿肯托尔对帝国的叛逆。他背叛了帝国，却发现自己站在另一座将塌的塔上——阿肯托尔要财富，革命军要平权，姐妹会只要复仇。每一方都递来橄榄枝，每一枝都藏着铁蒺藜',
    enabled: false,
  },
  {
    key: 'external_revolutionary_army',
    label: '路线七：旧世界的余烬',
    difficulty: '极难',
    gender: 'any',
    description: '境外革命军路线。兵力不足,难民成群,派系各执一词,核弹只是悬在头顶的沉默威胁，在随时可能在死亡的过程中,变成它曾发誓要推翻的那种东西;每一次征用、每一次妥协,都是对旧理念的一次拷问。',
    enabled: false,
  },
  {
    key: 'external_roaring_sisterhood',
    label: '路线八：怒吼之后',
    difficulty: '极难',
    gender: 'female',
    description: '怒吼姐妹会路线。拒绝男性是她们用伤痕换来的安全边界,可完全的拒绝可能活不下去,任何一次援助又可能是重演旧日枷锁的开始。',
    enabled: false,
  },
  {
    key: 'imperial_male_thorn_crown',
    label: '路线九：荆冠欢宴',
    difficulty: '炼狱',
    gender: 'male',
    description: '帝国男性痛欲革新线。高层男性把疼痛快感包装成血统审美、意志证明和贵族社交门槛，新痛派、旧欢派与医疗产业链围绕私宴、改造、教廷解释权和女性技术劳工展开重排。',
    enabled: true,
  },
];

const hardIdentityRouteKeySet = new Set<string>(HARD_IDENTITY_ROUTE_KEYS);
const enabledHardIdentityRouteKeySet = new Set<string>(
  hardIdentityRouteOptions.filter(option => option.enabled).map(option => option.key),
);

export function normalizeHardIdentityRoute(value: unknown): HardIdentityRouteKey {
  if (typeof value === 'string' && hardIdentityRouteKeySet.has(value) && enabledHardIdentityRouteKeySet.has(value)) {
    return value as HardIdentityRouteKey;
  }

  return HARD_IDENTITY_ROUTE_DEFAULT;
}

export function getHardIdentityRouteOption(key: HardIdentityRouteKey): HardIdentityRouteOption {
  return hardIdentityRouteOptions.find(option => option.key === key) ?? hardIdentityRouteOptions[0];
}

export function isHardIdentityRouteEnabled(key: HardIdentityRouteKey) {
  return getHardIdentityRouteOption(key).enabled;
}

export function isHardIdentityRouteCompatibleWithGender(routeKey: HardIdentityRouteKey, gender: string | undefined) {
  const route = getHardIdentityRouteOption(routeKey);
  if (route.gender === 'any') {
    return true;
  }

  if (route.gender === 'male') {
    return gender === '男';
  }

  return gender === '女';
}

export function getHardIdentityRouteGenderLabel(gender: HardIdentityRouteGender) {
  if (gender === 'male') {
    return '男性';
  }

  if (gender === 'female') {
    return '女性';
  }

  return '不限';
}
