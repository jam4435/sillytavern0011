import { getRemoteAvatarUrl } from './avatarRemote';
import { GENERATED_NPC_AVATAR_ASSETS } from './generatedAvatarCatalog';

const aQingFc2Url = getRemoteAvatarUrl('jinyong', 'a_qing_fc2.png');
const aZhuAltUrl = getRemoteAvatarUrl('jinyong', 'a_zhu_alt.png');
const aZhuFc2Url = getRemoteAvatarUrl('jinyong', 'a_zhu_fc2.png');
const aZiAltUrl = getRemoteAvatarUrl('jinyong', 'a_zi_alt.png');
const aZiFc2Url = getRemoteAvatarUrl('jinyong', 'a_zi_fc2.png');
const chooseFaceB01Url = getRemoteAvatarUrl('jinyong', 'choose_face_b01.png');
const chooseFaceB02Url = getRemoteAvatarUrl('jinyong', 'choose_face_b02.png');
const chooseFaceB03Url = getRemoteAvatarUrl('jinyong', 'choose_face_b03.png');
const chooseFaceB04Url = getRemoteAvatarUrl('jinyong', 'choose_face_b04.png');
const chooseFaceB05Url = getRemoteAvatarUrl('jinyong', 'choose_face_b05.png');
const chooseFaceB06Url = getRemoteAvatarUrl('jinyong', 'choose_face_b06.png');
const chooseFaceB07Url = getRemoteAvatarUrl('jinyong', 'choose_face_b07.png');
const chooseFaceB08Url = getRemoteAvatarUrl('jinyong', 'choose_face_b08.png');
const chooseFaceB09Url = getRemoteAvatarUrl('jinyong', 'choose_face_b09.png');
const chooseFaceB10Url = getRemoteAvatarUrl('jinyong', 'choose_face_b10.png');
const chooseFaceG01Url = getRemoteAvatarUrl('jinyong', 'choose_face_g01.png');
const chooseFaceG02Url = getRemoteAvatarUrl('jinyong', 'choose_face_g02.png');
const chooseFaceG03Url = getRemoteAvatarUrl('jinyong', 'choose_face_g03.png');
const chooseFaceG04Url = getRemoteAvatarUrl('jinyong', 'choose_face_g04.png');
const chooseFaceG05Url = getRemoteAvatarUrl('jinyong', 'choose_face_g05.png');
const chooseFaceG06Url = getRemoteAvatarUrl('jinyong', 'choose_face_g06.png');
const chooseFaceG07Url = getRemoteAvatarUrl('jinyong', 'choose_face_g07.png');
const chooseFaceG08Url = getRemoteAvatarUrl('jinyong', 'choose_face_g08.png');
const chooseFaceG09Url = getRemoteAvatarUrl('jinyong', 'choose_face_g09.png');
const chooseFaceG10Url = getRemoteAvatarUrl('jinyong', 'choose_face_g10.png');
const chooseFaceG11Url = getRemoteAvatarUrl('jinyong', 'choose_face_g11.png');
const danqingWomanUrl = getRemoteAvatarUrl('jinyong', 'danqing_woman.png');
const duanYuAltUrl = getRemoteAvatarUrl('jinyong', 'duan_yu_alt.png');
const duanYuFc2Url = getRemoteAvatarUrl('jinyong', 'duan_yu_fc2.png');
const femalePalace1Url = getRemoteAvatarUrl('jinyong', 'female_palace_1.png');
const femalePalace2Url = getRemoteAvatarUrl('jinyong', 'female_palace_2.png');
const foreignGirlUrl = getRemoteAvatarUrl('jinyong', 'foreign_girl.png');
const gongziYuOldUrl = getRemoteAvatarUrl('jinyong', 'gongzi_yu_old.png');
const gongziYuUrl = getRemoteAvatarUrl('jinyong', 'gongzi_yu.png');
const guoJingFc2Url = getRemoteAvatarUrl('jinyong', 'guo_jing_fc2.png');
const guoXiangAltUrl = getRemoteAvatarUrl('jinyong', 'guo_xiang_alt.png');
const guoXiangFc2Url = getRemoteAvatarUrl('jinyong', 'guo_xiang_fc2.png');
const huFeiFc2Url = getRemoteAvatarUrl('jinyong', 'hu_fei_fc2.png');
const huangRongFc2Url = getRemoteAvatarUrl('jinyong', 'huang_rong_fc2.png');
const huangRongFc3Url = getRemoteAvatarUrl('jinyong', 'huang_rong_fc3.png');
const lengTingPortraitUrl = getRemoteAvatarUrl('jinyong', 'leng_ting_portrait.png');
const lengXuanPortraitUrl = getRemoteAvatarUrl('jinyong', 'leng_xuan_portrait.png');
const liMochouAltUrl = getRemoteAvatarUrl('jinyong', 'li_mochou_alt.png');
const liMochouFc2Url = getRemoteAvatarUrl('jinyong', 'li_mochou_fc2.png');
const linPingzhiFc2Url = getRemoteAvatarUrl('jinyong', 'lin_pingzhi_fc2.png');
const linghuChongAltUrl = getRemoteAvatarUrl('jinyong', 'linghu_chong_alt.png');
const linghuChongFc2Url = getRemoteAvatarUrl('jinyong', 'linghu_chong_fc2.png');
const maleKuiUrl = getRemoteAvatarUrl('jinyong', 'male_kui.png');
const malePalace1Url = getRemoteAvatarUrl('jinyong', 'male_palace_1.png');
const malePalace2Url = getRemoteAvatarUrl('jinyong', 'male_palace_2.png');
const muWanqingFc2Url = getRemoteAvatarUrl('jinyong', 'mu_wanqing_fc2.png');
const pinkGirlUrl = getRemoteAvatarUrl('jinyong', 'pink_girl.png');
const purpleGirlUrl = getRemoteAvatarUrl('jinyong', 'purple_girl.png');
const whiteSnakePortraitUrl = getRemoteAvatarUrl('jinyong', 'white_snake_portrait.png');
const xiaoLongnvAltUrl = getRemoteAvatarUrl('jinyong', 'xiao_longnv_alt.png');
const xiaoLongnvFc2Url = getRemoteAvatarUrl('jinyong', 'xiao_longnv_fc2.png');
const youngYingzhengAltUrl = getRemoteAvatarUrl('jinyong', 'young_yingzheng_alt.png');
const youngYingzhengUrl = getRemoteAvatarUrl('jinyong', 'young_yingzheng.png');

export type AvatarGender = '男' | '女';
export type AvatarUsage = 'player' | 'npc';
export type AvatarRef = `preset:${string}` | `custom:${string}` | string;

export interface AvatarCatalogEntry {
  id: string;
  label: string;
  gender: AvatarGender;
  aliases: string[];
  src: string;
  usage: AvatarUsage;
  objectPosition?: string;
}

// Original portrait PNGs often carry large transparent margins.
// These focal points keep the visible figure centered inside circular crops.
const AVATAR_OBJECT_POSITION_BY_ID: Partial<Record<string, string>> = {
  a_qing_fc2: '66.8% 52.2%',
  a_zhu_alt: '61.7% 50.6%',
  a_zhu_fc2: '57.5% 50.0%',
  a_zi_alt: '31.3% 50.0%',
  a_zi_fc2: '40.5% 51.8%',
  danqing_woman: '53.3% 52.4%',
  duan_yu_alt: '55.1% 56.1%',
  duan_yu_fc2: '69.3% 52.0%',
  female_palace_1: '17.8% 50.0%',
  female_palace_2: '60.0% 50.6%',
  foreign_girl: '70.8% 50.8%',
  gongzi_yu_old: '43.4% 55.7%',
  gongzi_yu: '23.6% 53.0%',
  guo_jing_fc2: '72.8% 58.7%',
  guo_xiang_alt: '51.9% 54.3%',
  guo_xiang_fc2: '30.2% 51.0%',
  hu_fei_fc2: '47.7% 57.5%',
  huang_rong_fc2: '70.2% 59.6%',
  huang_rong_fc3: '48.7% 54.9%',
  leng_ting_portrait: '49.0% 50.0%',
  leng_xuan_portrait: '49.2% 50.0%',
  li_mochou_alt: '57.5% 50.4%',
  li_mochou_fc2: '71.0% 56.5%',
  lin_pingzhi_fc2: '41.5% 50.0%',
  linghu_chong_alt: '46.3% 52.0%',
  linghu_chong_fc2: '36.6% 55.7%',
  male_kui: '69.7% 50.0%',
  male_palace_1: '65.2% 50.0%',
  male_palace_2: '34.5% 50.2%',
  mu_wanqing_fc2: '61.3% 58.9%',
  pink_girl: '37.4% 55.3%',
  purple_girl: '72.4% 53.9%',
  white_snake_portrait: '35.8% 50.0%',
  xiao_longnv_alt: '51.4% 51.4%',
  xiao_longnv_fc2: '34.4% 57.3%',
  young_yingzheng_alt: '69.5% 50.8%',
  young_yingzheng: '67.9% 50.4%',
};

function createPlayerAvatar(
  id: string,
  label: string,
  gender: AvatarGender,
  src: string,
): AvatarCatalogEntry {
  return {
    id,
    label,
    gender,
    aliases: [],
    src,
    usage: 'player',
    objectPosition: AVATAR_OBJECT_POSITION_BY_ID[id],
  };
}

function createNpcAvatar(
  id: string,
  label: string,
  gender: AvatarGender,
  src: string,
  aliases: string[],
): AvatarCatalogEntry {
  return {
    id,
    label,
    gender,
    aliases,
    src,
    usage: 'npc',
    objectPosition: AVATAR_OBJECT_POSITION_BY_ID[id],
  };
}

// AI-generated portraits are ordinary bundled assets, not machine-local file
// paths. The filename is the canonical character name, and generated entries
// are placed before legacy portraits so automatic matching picks them first.
const GENERATED_NPC_NAME_ALIASES: Partial<Record<string, string[]>> = {
  黄蓉: ['黃蓉'],
  小龙女: ['小龍女'],
};

const GENERATED_NPC_AVATAR_CATALOG: AvatarCatalogEntry[] = GENERATED_NPC_AVATAR_ASSETS.map(asset =>
  createNpcAvatar(
    `generated_${asset.name}`,
    asset.name,
    asset.gender,
    asset.src,
    [asset.name, ...(GENERATED_NPC_NAME_ALIASES[asset.name] || [])],
  ),
);

const PLAYER_AVATAR_CATALOG: AvatarCatalogEntry[] = [
  createPlayerAvatar('player_male_01', '少侠一', '男', chooseFaceB01Url),
  createPlayerAvatar('player_male_02', '少侠二', '男', chooseFaceB02Url),
  createPlayerAvatar('player_male_03', '少侠三', '男', chooseFaceB03Url),
  createPlayerAvatar('player_male_04', '少侠四', '男', chooseFaceB04Url),
  createPlayerAvatar('player_male_05', '少侠五', '男', chooseFaceB05Url),
  createPlayerAvatar('player_male_06', '少侠六', '男', chooseFaceB06Url),
  createPlayerAvatar('player_male_07', '少侠七', '男', chooseFaceB07Url),
  createPlayerAvatar('player_male_08', '少侠八', '男', chooseFaceB08Url),
  createPlayerAvatar('player_male_09', '少侠九', '男', chooseFaceB09Url),
  createPlayerAvatar('player_male_10', '少侠十', '男', chooseFaceB10Url),
  createPlayerAvatar('player_female_01', '女侠一', '女', chooseFaceG01Url),
  createPlayerAvatar('player_female_02', '女侠二', '女', chooseFaceG02Url),
  createPlayerAvatar('player_female_03', '女侠三', '女', chooseFaceG03Url),
  createPlayerAvatar('player_female_04', '女侠四', '女', chooseFaceG04Url),
  createPlayerAvatar('player_female_05', '女侠五', '女', chooseFaceG05Url),
  createPlayerAvatar('player_female_06', '女侠六', '女', chooseFaceG06Url),
  createPlayerAvatar('player_female_07', '女侠七', '女', chooseFaceG07Url),
  createPlayerAvatar('player_female_08', '女侠八', '女', chooseFaceG08Url),
  createPlayerAvatar('player_female_09', '女侠九', '女', chooseFaceG09Url),
  createPlayerAvatar('player_female_10', '女侠十', '女', chooseFaceG10Url),
  createPlayerAvatar('player_female_11', '女侠十一', '女', chooseFaceG11Url),
];

const NPC_AVATAR_CATALOG: AvatarCatalogEntry[] = [
  // Generated portraits take precedence for automatic name matching; legacy
  // portraits remain available as manually selectable alternatives.
  ...GENERATED_NPC_AVATAR_CATALOG,
  createNpcAvatar('male_palace_1', '男主皇宫正装', '男', malePalace1Url, ['男主皇宮正裝', '男主皇宫正装', '男主']),
  createNpcAvatar('male_palace_2', '男主皇宫正装二', '男', malePalace2Url, ['男主皇宮正裝2', '男主皇宫正装2']),
  createNpcAvatar('male_kui', '男葵正装', '男', maleKuiUrl, ['男葵正装', '男葵正裝']),
  createNpcAvatar('gongzi_yu', '公子羽', '男', gongziYuUrl, ['公子羽']),
  createNpcAvatar('gongzi_yu_old', '公子羽二', '男', gongziYuOldUrl, ['公子羽', '老者公子羽']),
  createNpcAvatar('young_yingzheng', '少年赢政', '男', youngYingzhengUrl, ['A-少年贏政', '少年贏政', '少年赢政', '嬴政', '贏政', '赢政']),
  createNpcAvatar('young_yingzheng_alt', '少年赢政二', '男', youngYingzhengAltUrl, ['A-小贏政', '小贏政', '小赢政', '嬴政', '贏政', '赢政']),
  createNpcAvatar('guo_jing_fc2', '郭靖', '男', guoJingFc2Url, ['郭靖']),
  createNpcAvatar('linghu_chong_fc2', '令狐冲', '男', linghuChongFc2Url, ['令狐沖', '令狐冲']),
  createNpcAvatar('linghu_chong_alt', '令狐冲二', '男', linghuChongAltUrl, ['令狐沖', '令狐冲']),
  createNpcAvatar('duan_yu_fc2', '段誉', '男', duanYuFc2Url, ['段譽', '段誉']),
  createNpcAvatar('duan_yu_alt', '段誉二', '男', duanYuAltUrl, ['段譽', '段誉']),
  createNpcAvatar('hu_fei_fc2', '胡斐', '男', huFeiFc2Url, ['胡斐']),
  createNpcAvatar('lin_pingzhi_fc2', '林平之', '男', linPingzhiFc2Url, ['林平之']),
  createNpcAvatar('female_palace_1', '女主皇宫正装', '女', femalePalace1Url, ['女主皇宮正裝', '女主皇宫正装', '女主']),
  createNpcAvatar('female_palace_2', '女主皇宫正装二', '女', femalePalace2Url, ['女主皇宮正裝2', '女主皇宫正装2']),
  createNpcAvatar('danqing_woman', '丹青女子', '女', danqingWomanUrl, ['丹青女子头像', '丹青女子頭像', '丹青女子']),
  createNpcAvatar('pink_girl', '粉衣少女', '女', pinkGirlUrl, ['粉衣少女']),
  createNpcAvatar('purple_girl', '紫衣少女', '女', purpleGirlUrl, ['紫衣少女']),
  createNpcAvatar('foreign_girl', '异域少女', '女', foreignGirlUrl, ['异域少女', '異域少女']),
  createNpcAvatar('huang_rong_fc2', '黄蓉', '女', huangRongFc2Url, ['黃蓉', '黄蓉']),
  createNpcAvatar('huang_rong_fc3', '黄蓉二', '女', huangRongFc3Url, ['黃蓉', '黄蓉']),
  createNpcAvatar('xiao_longnv_fc2', '小龙女', '女', xiaoLongnvFc2Url, ['小龍女', '小龙女']),
  createNpcAvatar('xiao_longnv_alt', '小龙女二', '女', xiaoLongnvAltUrl, ['小龍女', '小龙女']),
  createNpcAvatar('a_zhu_fc2', '阿朱', '女', aZhuFc2Url, ['阿朱']),
  createNpcAvatar('a_zhu_alt', '阿朱二', '女', aZhuAltUrl, ['阿朱']),
  createNpcAvatar('a_zi_fc2', '阿紫', '女', aZiFc2Url, ['阿紫']),
  createNpcAvatar('a_zi_alt', '阿紫二', '女', aZiAltUrl, ['阿紫']),
  createNpcAvatar('guo_xiang_fc2', '郭襄', '女', guoXiangFc2Url, ['郭襄']),
  createNpcAvatar('guo_xiang_alt', '郭襄二', '女', guoXiangAltUrl, ['郭襄']),
  createNpcAvatar('mu_wanqing_fc2', '木婉清', '女', muWanqingFc2Url, ['木婉清']),
  createNpcAvatar('li_mochou_fc2', '李莫愁', '女', liMochouFc2Url, ['李莫愁']),
  createNpcAvatar('li_mochou_alt', '李莫愁二', '女', liMochouAltUrl, ['李莫愁']),
  createNpcAvatar('a_qing_fc2', '阿青', '女', aQingFc2Url, ['阿青']),
  createNpcAvatar('leng_ting_portrait', '冷婷', '女', lengTingPortraitUrl, ['冷婷头像', '冷婷']),
  createNpcAvatar('leng_xuan_portrait', '冷轩', '女', lengXuanPortraitUrl, ['冷轩头像', '冷轩']),
  createNpcAvatar('white_snake_portrait', '白蛇', '女', whiteSnakePortraitUrl, ['白蛇头像', '白蛇']),
];

export const AVATAR_CATALOG: AvatarCatalogEntry[] = [...PLAYER_AVATAR_CATALOG, ...NPC_AVATAR_CATALOG];

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
  return PLAYER_AVATAR_CATALOG.filter(avatar => avatar.gender === gender);
}

export function getDefaultAvatarForGender(gender: AvatarGender): AvatarCatalogEntry {
  return getAvatarsByGender(gender)[0] || PLAYER_AVATAR_CATALOG[0] || AVATAR_CATALOG[0];
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
  return NPC_AVATAR_CATALOG.filter(avatar =>
    avatar.aliases.some(alias => normalizeAvatarName(alias) === normalizedName),
  );
}

export function getAvatarFallbackInitial(name?: string): string {
  return name?.trim().charAt(0) || '侠';
}
