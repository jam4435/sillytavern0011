import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile } from '../../types';
import { setPlayerAvatarRef } from '../../utils/avatarState';
import { CharacterPanel } from './CharacterPanel';

vi.mock('../../utils/avatarState', () => ({
  setPlayerAvatarRef: vi.fn(async () => undefined),
  clearPlayerAvatarRef: vi.fn(async () => undefined),
}));

const setPlayerAvatarRefMock = vi.mocked(setPlayerAvatarRef);

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
    setPlayerAvatarRefMock.mockClear();
  });

  it('玩家可在状态页切换内置头像', () => {
    render(<CharacterPanel stats={baseStats} />);

    fireEvent.click(screen.getByRole('button', { name: '设置玩家头像' }));
    fireEvent.click(screen.getByRole('button', { name: /少侠二/ }));

    expect(setPlayerAvatarRefMock).toHaveBeenCalledWith('preset:player_male_02');
    expect(screen.getByAltText('郭靖头像')).toHaveAttribute('src', expect.stringContaining('choose_face_b02.png'));
  });

  it('变量写入失败时回滚乐观头像并提示', async () => {
    setPlayerAvatarRefMock.mockRejectedValueOnce(new Error('写入失败'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<CharacterPanel stats={baseStats} />);

    fireEvent.click(screen.getByRole('button', { name: '设置玩家头像' }));
    fireEvent.click(screen.getByRole('button', { name: /少侠二/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('写入失败'));
    await waitFor(() => {
      expect(screen.getByAltText('郭靖头像')).toHaveAttribute('src', expect.stringContaining('choose_face_b01.png'));
    });
  });
});
