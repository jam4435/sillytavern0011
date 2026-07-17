import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewGameSetup from './NewGameSetup';
import { createAvatarEntityKey, getAvatarStorageKey } from '../utils/avatarStorage';

vi.mock('../utils/martialArtsDatabase', () => ({
  getAllMartialArtNames: vi.fn(() => []),
  getMartialArtData: vi.fn(() => null),
  isDatabaseLoaded: vi.fn(() => true),
  loadMartialArtsDatabase: vi.fn(async () => true),
}));

function renderSetup() {
  render(<NewGameSetup onSubmit={vi.fn()} onBack={vi.fn()} isLoading={false} />);
}

function goToIdentityStep() {
  for (let index = 0; index < 5; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  }
}

describe('NewGameSetup avatar selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('切换男女后头像池变化', () => {
    renderSetup();
    goToIdentityStep();

    expect(screen.getAllByText('少侠一').length).toBeGreaterThan(0);
    expect(screen.getByAltText('少侠十')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '女' }));

    expect(screen.getAllByText('女侠一').length).toBeGreaterThan(0);
    expect(screen.getByAltText('女侠十一')).toBeInTheDocument();
    expect(screen.queryByAltText('少侠十')).not.toBeInTheDocument();
  });

  it('上传图片后显示自定义预览并写入本地头像缓存', async () => {
    renderSetup();
    goToIdentityStep();

    const input = document.querySelector<HTMLInputElement>('.setup-avatar-choice.upload input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File(['avatar'], 'custom.png', { type: 'image/png' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(localStorage.getItem(getAvatarStorageKey(createAvatarEntityKey('player')))).toContain('custom.png');
    });
    expect(await screen.findByText('自定义头像')).toBeInTheDocument();
  });
});

describe('NewGameSetup appearance generation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('风姿为0时只从对应的低风姿模板生成外貌', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderSetup();

    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    const charismaCard = screen.getByText('风姿', { selector: '.attr-name' }).closest('.attribute-card');
    expect(charismaCard).toBeTruthy();
    fireEvent.change(within(charismaCard as HTMLElement).getByRole('slider'), { target: { value: '0' } });

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    }

    fireEvent.click(screen.getByRole('button', { name: '🎲 随机' }));

    expect(screen.getByPlaceholderText('描述你的外貌和身材特征...')).toHaveValue(
      '面容丑陋，五官歪斜，身材瘦弱，让人不忍直视。',
    );
  });
});
