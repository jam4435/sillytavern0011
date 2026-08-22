import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NPC } from '../../types';
import { toCustomAvatarRef } from '../../utils/avatarCatalog';
import { createAvatarEntityKey, getAvatarStorageKey, saveCustomAvatar } from '../../utils/avatarStorage';
import { setNpcAvatarRef } from '../../utils/avatarState';
import { SocialPanel } from './SocialPanel';

vi.mock('../../utils/avatarState', () => ({
  setNpcAvatarRef: vi.fn(async () => undefined),
  clearNpcAvatarRef: vi.fn(async () => undefined),
}));

const setNpcAvatarRefMock = vi.mocked(setNpcAvatarRef);

function createNpc(name = '黄蓉'): NPC {
  return {
    id: `npc:acquaintance:${name}`,
    name,
    relationship: 30,
    relationshipLabel: '旧识',
    category: 'acquaintance',
    location: '桃花岛',
    template: {
      type: '江湖人士',
      martialArtsDescription: '',
      martialArtsRank: '上乘',
      mastery: '略有小成',
      traits: {},
    },
    keyItems: [],
    biography: '',
    network: [],
  };
}

describe('SocialPanel avatar picker', () => {
  beforeEach(() => {
    localStorage.clear();
    setNpcAvatarRefMock.mockClear();
  });

  it('姓名匹配时显示头像，并可在多个候选间选择', () => {
    render(<SocialPanel npcs={[createNpc()]} />);

    fireEvent.click(screen.getByRole('button', { name: '设置黄蓉头像' }));
    expect(screen.getByAltText('黄蓉头像')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /黄蓉二/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /黄蓉二/ }));

    expect(setNpcAvatarRefMock).toHaveBeenCalledWith('黄蓉', 'preset:huang_rong_fc3');
  });

  it('点击头像可打开大图预览', () => {
    render(<SocialPanel npcs={[createNpc()]} />);

    fireEvent.click(screen.getByRole('button', { name: '查看黄蓉头像' }));

    expect(screen.getByRole('heading', { name: '黄蓉头像' })).toBeInTheDocument();
  });

  it('上传自定义头像后本地覆盖优先', async () => {
    render(<SocialPanel npcs={[createNpc()]} />);
    fireEvent.click(screen.getByRole('button', { name: '设置黄蓉头像' }));

    const input = document.querySelector<HTMLInputElement>('.social-avatar-option.upload input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File(['avatar'], 'huangrong.png', { type: 'image/png' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(localStorage.getItem(getAvatarStorageKey(createAvatarEntityKey('npc', '黄蓉')))).toContain(
        'huangrong.png',
      );
    });
    expect(setNpcAvatarRefMock).toHaveBeenCalledWith('黄蓉', 'custom:npc:黄蓉');
  });

  it('已有本地自定义覆盖时优先显示自定义图', () => {
    const entityKey = createAvatarEntityKey('npc', '黄蓉');
    saveCustomAvatar(entityKey, 'data:image/png;base64,custom', 'custom.png');
    const npc = createNpc();
    npc.avatarRef = toCustomAvatarRef(entityKey);

    render(<SocialPanel npcs={[npc]} />);

    expect(screen.getByAltText('黄蓉头像')).toHaveAttribute('src', 'data:image/png;base64,custom');
  });

  it('NPC 头像变量写入失败时回滚并提示', async () => {
    setNpcAvatarRefMock.mockRejectedValueOnce(new Error('写入失败'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<SocialPanel npcs={[createNpc()]} />);

    fireEvent.click(screen.getByRole('button', { name: '设置黄蓉头像' }));
    fireEvent.click(screen.getByRole('button', { name: /黄蓉二/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('写入失败'));
    await waitFor(() => {
      expect(screen.getByAltText('黄蓉头像')).toHaveAttribute(
        'src',
        expect.stringContaining('generated/%E9%BB%84%E8%93%89.jpg'),
      );
    });
  });
});

describe('SocialPanel martial-art details', () => {
  it('逐项展示角色的完整功法，并忽略空特性', () => {
    const npc = createNpc('郭靖');
    npc.template = {
      ...npc.template,
      martialArts: {
        全真剑法: {
          type: '剑法',
          martialArtsDescription: "招式严谨，如'白虹经天'。",
          martialArtsRank: '上乘',
          mastery: '炉火纯青',
          traits: {
            初窥门径: '',
            炉火纯青: '剑法严谨：格挡成功率提升20%',
          },
        },
        金雁功: {
          type: '轻功',
          martialArtsDescription: '全真派上乘轻功。',
          martialArtsRank: '上乘',
          mastery: '炉火纯青',
          traits: {
            炉火纯青: '雁过无痕：移动时不触发敌人的反击',
          },
        },
      },
    };

    render(<SocialPanel npcs={[npc]} />);

    expect(screen.getByText('全真剑法')).toBeInTheDocument();
    expect(screen.getByText('金雁功')).toBeInTheDocument();
    expect(screen.getByText("招式严谨，如'白虹经天'。")).toBeInTheDocument();
    expect(screen.getByText('剑法严谨：格挡成功率提升20%')).toBeInTheDocument();
    expect(screen.queryByText('初窥门径')).not.toBeInTheDocument();
  });
});
