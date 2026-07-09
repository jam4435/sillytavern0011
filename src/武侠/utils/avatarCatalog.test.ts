import { describe, expect, it } from 'vitest';
import {
  findAvatarsByName,
  getAvatarFromRef,
  getAvatarsByGender,
  toPresetAvatarRef,
} from './avatarCatalog';

describe('avatarCatalog', () => {
  it('按性别过滤头像池', () => {
    const maleAvatars = getAvatarsByGender('男');
    const femaleAvatars = getAvatarsByGender('女');

    expect(maleAvatars).toHaveLength(10);
    expect(femaleAvatars).toHaveLength(15);
    expect(maleAvatars.every(avatar => avatar.gender === '男')).toBe(true);
    expect(femaleAvatars.every(avatar => avatar.gender === '女')).toBe(true);
  });

  it('按姓名和别名精确匹配头像', () => {
    expect(findAvatarsByName('令狐沖').map(avatar => avatar.id)).toEqual(['linghu_chong_fc2']);
    expect(findAvatarsByName('小龙女').map(avatar => avatar.id)).toEqual(['xiao_longnv_fc2']);
  });

  it('同一人物可返回多个头像候选', () => {
    expect(findAvatarsByName('黃蓉').map(avatar => avatar.id)).toEqual(['huang_rong_fc2', 'huang_rong_fc3']);
  });

  it('可从 preset ref 解析头像', () => {
    expect(getAvatarFromRef(toPresetAvatarRef('guo_jing_fc2'))?.label).toBe('郭靖');
  });
});
