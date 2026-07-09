import aQingFc2Url from '../assets/avatars/jinyong/a_qing_fc2.png?url';
import aZhuFc2Url from '../assets/avatars/jinyong/a_zhu_fc2.png?url';
import aZiFc2Url from '../assets/avatars/jinyong/a_zi_fc2.png?url';
import danqingWomanUrl from '../assets/avatars/jinyong/danqing_woman.png?url';
import duanYuFc2Url from '../assets/avatars/jinyong/duan_yu_fc2.png?url';
import femalePalace1Url from '../assets/avatars/jinyong/female_palace_1.png?url';
import femalePalace2Url from '../assets/avatars/jinyong/female_palace_2.png?url';
import foreignGirlUrl from '../assets/avatars/jinyong/foreign_girl.png?url';
import gongziYuUrl from '../assets/avatars/jinyong/gongzi_yu.png?url';
import guoJingFc2Url from '../assets/avatars/jinyong/guo_jing_fc2.png?url';
import guoXiangFc2Url from '../assets/avatars/jinyong/guo_xiang_fc2.png?url';
import huFeiFc2Url from '../assets/avatars/jinyong/hu_fei_fc2.png?url';
import huangRongFc2Url from '../assets/avatars/jinyong/huang_rong_fc2.png?url';
import huangRongFc3Url from '../assets/avatars/jinyong/huang_rong_fc3.png?url';
import liMochouFc2Url from '../assets/avatars/jinyong/li_mochou_fc2.png?url';
import linPingzhiFc2Url from '../assets/avatars/jinyong/lin_pingzhi_fc2.png?url';
import linghuChongFc2Url from '../assets/avatars/jinyong/linghu_chong_fc2.png?url';
import maleKuiUrl from '../assets/avatars/jinyong/male_kui.png?url';
import malePalace1Url from '../assets/avatars/jinyong/male_palace_1.png?url';
import malePalace2Url from '../assets/avatars/jinyong/male_palace_2.png?url';
import muWanqingFc2Url from '../assets/avatars/jinyong/mu_wanqing_fc2.png?url';
import pinkGirlUrl from '../assets/avatars/jinyong/pink_girl.png?url';
import purpleGirlUrl from '../assets/avatars/jinyong/purple_girl.png?url';
import xiaoLongnvFc2Url from '../assets/avatars/jinyong/xiao_longnv_fc2.png?url';
import youngYingzhengUrl from '../assets/avatars/jinyong/young_yingzheng.png?url';

export type AvatarGender = '男' | '女';
export type AvatarRef = `preset:${string}` | `custom:${string}` | string;

export interface AvatarCatalogEntry {
  id: string;
  label: string;
  gender: AvatarGender;
  aliases: string[];
  src: string;
}

export const AVATAR_CATALOG: AvatarCatalogEntry[] = [
  {
    id: 'male_palace_1',
    label: '男主皇宫正装',
    gender: '男',
    aliases: ['男主皇宮正裝', '男主皇宫正装', '男主'],
    src: malePalace1Url,
  },
  {
    id: 'male_palace_2',
    label: '男主皇宫正装二',
    gender: '男',
    aliases: ['男主皇宮正裝2', '男主皇宫正装2', '男主'],
    src: malePalace2Url,
  },
  {
    id: 'male_kui',
    label: '男葵正装',
    gender: '男',
    aliases: ['男葵正装', '男葵正裝'],
    src: maleKuiUrl,
  },
  {
    id: 'gongzi_yu',
    label: '公子羽',
    gender: '男',
    aliases: ['公子羽'],
    src: gongziYuUrl,
  },
  {
    id: 'young_yingzheng',
    label: '少年赢政',
    gender: '男',
    aliases: ['A-少年贏政', '少年贏政', '少年赢政', '嬴政', '贏政'],
    src: youngYingzhengUrl,
  },
  {
    id: 'guo_jing_fc2',
    label: '郭靖',
    gender: '男',
    aliases: ['郭靖', '郭靖_fc2'],
    src: guoJingFc2Url,
  },
  {
    id: 'linghu_chong_fc2',
    label: '令狐冲',
    gender: '男',
    aliases: ['令狐沖', '令狐冲', '令狐沖_fc2'],
    src: linghuChongFc2Url,
  },
  {
    id: 'duan_yu_fc2',
    label: '段誉',
    gender: '男',
    aliases: ['段譽', '段誉', '段譽_fc2'],
    src: duanYuFc2Url,
  },
  {
    id: 'hu_fei_fc2',
    label: '胡斐',
    gender: '男',
    aliases: ['胡斐', '胡斐_fc2'],
    src: huFeiFc2Url,
  },
  {
    id: 'lin_pingzhi_fc2',
    label: '林平之',
    gender: '男',
    aliases: ['林平之', '林平之_fc2'],
    src: linPingzhiFc2Url,
  },
  {
    id: 'female_palace_1',
    label: '女主皇宫正装',
    gender: '女',
    aliases: ['女主皇宮正裝', '女主皇宫正装', '女主'],
    src: femalePalace1Url,
  },
  {
    id: 'female_palace_2',
    label: '女主皇宫正装二',
    gender: '女',
    aliases: ['女主皇宮正裝2', '女主皇宫正装2', '女主'],
    src: femalePalace2Url,
  },
  {
    id: 'danqing_woman',
    label: '丹青女子',
    gender: '女',
    aliases: ['丹青女子头像', '丹青女子頭像', '丹青女子'],
    src: danqingWomanUrl,
  },
  {
    id: 'pink_girl',
    label: '粉衣少女',
    gender: '女',
    aliases: ['粉衣少女'],
    src: pinkGirlUrl,
  },
  {
    id: 'purple_girl',
    label: '紫衣少女',
    gender: '女',
    aliases: ['紫衣少女'],
    src: purpleGirlUrl,
  },
  {
    id: 'foreign_girl',
    label: '异域少女',
    gender: '女',
    aliases: ['异域少女', '異域少女'],
    src: foreignGirlUrl,
  },
  {
    id: 'huang_rong_fc2',
    label: '黄蓉',
    gender: '女',
    aliases: ['黃蓉', '黄蓉', '黃蓉_fc2'],
    src: huangRongFc2Url,
  },
  {
    id: 'huang_rong_fc3',
    label: '黄蓉二',
    gender: '女',
    aliases: ['黃蓉', '黄蓉', '黃蓉_fc3'],
    src: huangRongFc3Url,
  },
  {
    id: 'xiao_longnv_fc2',
    label: '小龙女',
    gender: '女',
    aliases: ['小龍女', '小龙女', '小龍女_fc2'],
    src: xiaoLongnvFc2Url,
  },
  {
    id: 'a_zhu_fc2',
    label: '阿朱',
    gender: '女',
    aliases: ['阿朱', '阿朱_fc2'],
    src: aZhuFc2Url,
  },
  {
    id: 'a_zi_fc2',
    label: '阿紫',
    gender: '女',
    aliases: ['阿紫', '阿紫_fc2'],
    src: aZiFc2Url,
  },
  {
    id: 'guo_xiang_fc2',
    label: '郭襄',
    gender: '女',
    aliases: ['郭襄', '郭襄_fc2'],
    src: guoXiangFc2Url,
  },
  {
    id: 'mu_wanqing_fc2',
    label: '木婉清',
    gender: '女',
    aliases: ['木婉清', '木婉清_fc2'],
    src: muWanqingFc2Url,
  },
  {
    id: 'li_mochou_fc2',
    label: '李莫愁',
    gender: '女',
    aliases: ['李莫愁', '李莫愁_fc2'],
    src: liMochouFc2Url,
  },
  {
    id: 'a_qing_fc2',
    label: '阿青',
    gender: '女',
    aliases: ['阿青', '阿青_fc2'],
    src: aQingFc2Url,
  },
];

const AVATAR_BY_ID = new Map(AVATAR_CATALOG.map(avatar => [avatar.id, avatar]));

function normalizeAvatarName(name: string): string {
  return name
    .trim()
    .replace(/\.(png|jpe?g|webp|gif)$/i, '')
    .replace(/[_-]?fc\d+$/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function toPresetAvatarRef(avatarId: string): AvatarRef {
  return `preset:${avatarId}`;
}

export function toCustomAvatarRef(entityKey: string): AvatarRef {
  return `custom:${entityKey}`;
}

export function parsePresetAvatarId(avatarRef?: string): string | null {
  if (!avatarRef?.startsWith('preset:')) {
    return null;
  }
  const avatarId = avatarRef.slice('preset:'.length).trim();
  return avatarId || null;
}

export function parseCustomAvatarEntityKey(avatarRef?: string): string | null {
  if (!avatarRef?.startsWith('custom:')) {
    return null;
  }
  const entityKey = avatarRef.slice('custom:'.length).trim();
  return entityKey || null;
}

export function getAvatarById(avatarId?: string | null): AvatarCatalogEntry | null {
  return avatarId ? AVATAR_BY_ID.get(avatarId) || null : null;
}

export function getAvatarFromRef(avatarRef?: string): AvatarCatalogEntry | null {
  return getAvatarById(parsePresetAvatarId(avatarRef));
}

export function getAvatarSrcFromRef(avatarRef?: string): string | null {
  return getAvatarFromRef(avatarRef)?.src || null;
}

export function getAvatarsByGender(gender: AvatarGender): AvatarCatalogEntry[] {
  return AVATAR_CATALOG.filter(avatar => avatar.gender === gender);
}

export function getDefaultAvatarForGender(gender: AvatarGender): AvatarCatalogEntry {
  return getAvatarsByGender(gender)[0] || AVATAR_CATALOG[0];
}

export function getDefaultAvatarRefForGender(gender: AvatarGender): AvatarRef {
  return toPresetAvatarRef(getDefaultAvatarForGender(gender).id);
}

export function isAvatarRefForGender(avatarRef: string | undefined, gender: AvatarGender): boolean {
  const avatar = getAvatarFromRef(avatarRef);
  return !avatar || avatar.gender === gender;
}

export function findAvatarsByName(name?: string): AvatarCatalogEntry[] {
  if (!name?.trim()) {
    return [];
  }

  const normalizedName = normalizeAvatarName(name);
  return AVATAR_CATALOG.filter(avatar =>
    avatar.aliases.some(alias => normalizeAvatarName(alias) === normalizedName),
  );
}

export function getAvatarFallbackInitial(name?: string): string {
  return name?.trim().charAt(0) || '侠';
}
