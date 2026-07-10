import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterProfile } from '../../types';
import { createAvatarEntityKey, getAvatarSelectionStorageKey } from '../../utils/avatarStorage';
import { CharacterPanel } from './CharacterPanel';

const baseStats: CharacterProfile = {
  name: '郭靖',
  gender: '男',
  avatarRef: 'preset:player_male_01',
  appearance: '质朴刚毅',
  birthYear: 1170,
  status: '平稳',
  realm: '三流圆满',
  cultivation: 200,
  location: '襄阳',
  identities: {
    侠客: '初入江湖',
  },
  martialArts: {},
  initialAttributes: {
    臂力: 8,
    根骨: 9,
    机敏: 7,
    悟性: 6,
    洞察: 7,
    风姿: 5,
    福缘: 6,
  },
  attributes: {
    hp: 100,
    mp: 80,
    臂力: 80,
    根骨: 90,
    机敏: 70,
    洞察: 70,
  },
  biography: '尚无记载',
  network: {},
};

describe('CharacterPanel avatar controls', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('玩家可在状态页切换内置头像', () => {
    render(<CharacterPanel stats={baseStats} />);

    fireEvent.click(screen.getByRole('button', { name: '设置玩家头像' }));
    fireEvent.click(screen.getByRole('button', { name: /少侠二/ }));

    expect(localStorage.getItem(getAvatarSelectionStorageKey(createAvatarEntityKey('player')))).toContain(
      'preset:player_male_02',
    );
  });
});
