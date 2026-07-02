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
] as const;

export type HardIdentityRouteKey = (typeof HARD_IDENTITY_ROUTE_KEYS)[number];
export type HardIdentityRouteGender = 'male' | 'female' | 'any';

export interface HardIdentityRouteOption {
  key: HardIdentityRouteKey;
  label: string;
  difficulty: string;
  gender: HardIdentityRouteGender;
  description: string;
}

export const hardIdentityRouteOptions: readonly HardIdentityRouteOption[] = [
  {
    key: HARD_IDENTITY_ROUTE_DEFAULT,
    label: '不启用',
    difficulty: '默认',
    gender: 'any',
    description: '不向提示词注入高难身份路线，清空旧聊天残留路线变量。',
  },
  {
    key: 'imperial_male_elite',
    label: '路线一：王座裂缝',
    difficulty: '极难',
    gender: 'male',
    description: '帝国男性高层，在改革、镇压与权力内斗中求生。',
  },
  {
    key: 'imperial_male_lowborn',
    label: '路线二：劣等公民',
    difficulty: '困难',
    gender: 'male',
    description: '帝国男性底层上升线，在晋升诱惑与压迫共谋间选择。',
  },
  {
    key: 'imperial_female_survival',
    label: '路线三：三十五岁以前',
    difficulty: '噩梦',
    gender: 'female',
    description: '帝国女性底层求生线，在身份、年龄与所有权压力下寻找出口。',
  },
  {
    key: 'imperial_female_revolutionary',
    label: '路线四：火种与刑台',
    difficulty: '噩梦+',
    gender: 'female',
    description: '帝国女性武装革命线，建立细胞、保护网络并承受镇压。',
  },
  {
    key: 'imperial_female_reformist',
    label: '路线五：无声者的政治',
    difficulty: '噩梦++',
    gender: 'female',
    description: '帝国女性内部改良线，在公开组织与隐蔽保护间维持群众压力。',
  },
  {
    key: 'akentor_male_defector',
    label: '路线六：不忠的儿子',
    difficulty: '较难',
    gender: 'male',
    description: '阿肯托尔男性叛变线，利用帝国内合法外观推动财富与权利冲突。',
  },
  {
    key: 'external_revolutionary_army',
    label: '路线七：旧世界的余烬',
    difficulty: '极难',
    gender: 'any',
    description: '境外革命军路线，在军事劣势和派系压力中维持旧时代平权理念。',
  },
  {
    key: 'external_roaring_sisterhood',
    label: '路线八：怒吼之后',
    difficulty: '极难',
    gender: 'female',
    description: '境外怒吼姐妹会路线，在自治边界、复仇冲动与生存合作间取舍。',
  },
];

const hardIdentityRouteKeySet = new Set<string>(HARD_IDENTITY_ROUTE_KEYS);

export function normalizeHardIdentityRoute(value: unknown): HardIdentityRouteKey {
  if (typeof value === 'string' && hardIdentityRouteKeySet.has(value)) {
    return value as HardIdentityRouteKey;
  }

  return HARD_IDENTITY_ROUTE_DEFAULT;
}

export function getHardIdentityRouteOption(key: HardIdentityRouteKey): HardIdentityRouteOption {
  return hardIdentityRouteOptions.find(option => option.key === key) ?? hardIdentityRouteOptions[0];
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
