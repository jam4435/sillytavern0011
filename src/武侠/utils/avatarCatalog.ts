import aQingFc2Url from '../assets/avatars/jinyong/a_qing_fc2.png?url';
import aZhuAltUrl from '../assets/avatars/jinyong/a_zhu_alt.png?url';
import aZhuFc2Url from '../assets/avatars/jinyong/a_zhu_fc2.png?url';
import aZiAltUrl from '../assets/avatars/jinyong/a_zi_alt.png?url';
import aZiFc2Url from '../assets/avatars/jinyong/a_zi_fc2.png?url';
import chooseFaceB01Url from '../assets/avatars/jinyong/choose_face_b01.png?url';
import chooseFaceB02Url from '../assets/avatars/jinyong/choose_face_b02.png?url';
import chooseFaceB03Url from '../assets/avatars/jinyong/choose_face_b03.png?url';
import chooseFaceB04Url from '../assets/avatars/jinyong/choose_face_b04.png?url';
import chooseFaceB05Url from '../assets/avatars/jinyong/choose_face_b05.png?url';
import chooseFaceB06Url from '../assets/avatars/jinyong/choose_face_b06.png?url';
import chooseFaceB07Url from '../assets/avatars/jinyong/choose_face_b07.png?url';
import chooseFaceB08Url from '../assets/avatars/jinyong/choose_face_b08.png?url';
import chooseFaceB09Url from '../assets/avatars/jinyong/choose_face_b09.png?url';
import chooseFaceB10Url from '../assets/avatars/jinyong/choose_face_b10.png?url';
import chooseFaceG01Url from '../assets/avatars/jinyong/choose_face_g01.png?url';
import chooseFaceG02Url from '../assets/avatars/jinyong/choose_face_g02.png?url';
import chooseFaceG03Url from '../assets/avatars/jinyong/choose_face_g03.png?url';
import chooseFaceG04Url from '../assets/avatars/jinyong/choose_face_g04.png?url';
import chooseFaceG05Url from '../assets/avatars/jinyong/choose_face_g05.png?url';
import chooseFaceG06Url from '../assets/avatars/jinyong/choose_face_g06.png?url';
import chooseFaceG07Url from '../assets/avatars/jinyong/choose_face_g07.png?url';
import chooseFaceG08Url from '../assets/avatars/jinyong/choose_face_g08.png?url';
import chooseFaceG09Url from '../assets/avatars/jinyong/choose_face_g09.png?url';
import chooseFaceG10Url from '../assets/avatars/jinyong/choose_face_g10.png?url';
import chooseFaceG11Url from '../assets/avatars/jinyong/choose_face_g11.png?url';
import danqingWomanUrl from '../assets/avatars/jinyong/danqing_woman.png?url';
import duanYuAltUrl from '../assets/avatars/jinyong/duan_yu_alt.png?url';
import duanYuFc2Url from '../assets/avatars/jinyong/duan_yu_fc2.png?url';
import femalePalace1Url from '../assets/avatars/jinyong/female_palace_1.png?url';
import femalePalace2Url from '../assets/avatars/jinyong/female_palace_2.png?url';
import foreignGirlUrl from '../assets/avatars/jinyong/foreign_girl.png?url';
import gongziYuOldUrl from '../assets/avatars/jinyong/gongzi_yu_old.png?url';
import gongziYuUrl from '../assets/avatars/jinyong/gongzi_yu.png?url';
import guoJingFc2Url from '../assets/avatars/jinyong/guo_jing_fc2.png?url';
import guoXiangAltUrl from '../assets/avatars/jinyong/guo_xiang_alt.png?url';
import guoXiangFc2Url from '../assets/avatars/jinyong/guo_xiang_fc2.png?url';
import huFeiFc2Url from '../assets/avatars/jinyong/hu_fei_fc2.png?url';
import huangRongFc2Url from '../assets/avatars/jinyong/huang_rong_fc2.png?url';
import huangRongFc3Url from '../assets/avatars/jinyong/huang_rong_fc3.png?url';
import lengTingPortraitUrl from '../assets/avatars/jinyong/leng_ting_portrait.png?url';
import lengXuanPortraitUrl from '../assets/avatars/jinyong/leng_xuan_portrait.png?url';
import liMochouAltUrl from '../assets/avatars/jinyong/li_mochou_alt.png?url';
import liMochouFc2Url from '../assets/avatars/jinyong/li_mochou_fc2.png?url';
import linPingzhiFc2Url from '../assets/avatars/jinyong/lin_pingzhi_fc2.png?url';
import linghuChongAltUrl from '../assets/avatars/jinyong/linghu_chong_alt.png?url';
import linghuChongFc2Url from '../assets/avatars/jinyong/linghu_chong_fc2.png?url';
import maleKuiUrl from '../assets/avatars/jinyong/male_kui.png?url';
import malePalace1Url from '../assets/avatars/jinyong/male_palace_1.png?url';
import malePalace2Url from '../assets/avatars/jinyong/male_palace_2.png?url';
import muWanqingFc2Url from '../assets/avatars/jinyong/mu_wanqing_fc2.png?url';
import pinkGirlUrl from '../assets/avatars/jinyong/pink_girl.png?url';
import purpleGirlUrl from '../assets/avatars/jinyong/purple_girl.png?url';
import whiteSnakePortraitUrl from '../assets/avatars/jinyong/white_snake_portrait.png?url';
import xiaoLongnvAltUrl from '../assets/avatars/jinyong/xiao_longnv_alt.png?url';
import xiaoLongnvFc2Url from '../assets/avatars/jinyong/xiao_longnv_fc2.png?url';
import youngYingzhengAltUrl from '../assets/avatars/jinyong/young_yingzheng_alt.png?url';
import youngYingzhengUrl from '../assets/avatars/jinyong/young_yingzheng.png?url';

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
}

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
  };
}

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
