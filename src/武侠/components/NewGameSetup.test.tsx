import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewGameSetup from './NewGameSetup';
import { createAvatarEntityKey, getAvatarStorageKey } from '../utils/avatarStorage';
import { APPEARANCE_TEMPLATES, DEFAULT_ATTRIBUTES, STORY_EVENTS } from '../utils/gameInitializer';

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

function setAttributeSlider(attribute: '臂力' | '根骨' | '风姿', value: number) {
  const attributeCard = screen.getByText(attribute, { selector: '.attr-name' }).closest('.attribute-card');
  expect(attributeCard).toBeTruthy();
  fireEvent.change(within(attributeCard as HTMLElement).getByRole('slider'), { target: { value: String(value) } });
}

function firstTemplateFor(
  templates: Array<{ range: { min: number; max: number }; templates: string[] }>,
  value: number,
) {
  const matches = templates.filter(template => value >= template.range.min && value <= template.range.max);
  expect(matches).toHaveLength(1);
  return matches[0].templates[0];
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

  it('骰子会把风姿、臂力和根骨三个滑块值都传入外貌生成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderSetup();

    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    setAttributeSlider('风姿', 0);
    setAttributeSlider('根骨', 0);
    setAttributeSlider('臂力', 20);

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    }

    fireEvent.click(screen.getByRole('button', { name: '🎲 随机' }));

    const appearance = screen.getByPlaceholderText('描述你的外貌和身材特征...');
    const appearanceValue = (appearance as HTMLTextAreaElement).value;
    expect(appearanceValue).toContain(firstTemplateFor(APPEARANCE_TEMPLATES.face.男, 0));
    expect(appearanceValue).toContain(firstTemplateFor(APPEARANCE_TEMPLATES.frame, 0));
    expect(appearanceValue).toContain(firstTemplateFor(APPEARANCE_TEMPLATES.strength, 20));
  });
});

describe('NewGameSetup automation markers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('可按稳定标识加载角色预设、返回开局事件页并选择事件', async () => {
    const event = STORY_EVENTS[1] ?? STORY_EVENTS[0];
    localStorage.setItem(
      'wuxia_character_builds',
      JSON.stringify([
        {
          id: 'build-automation-test',
          name: '自动化测试角色',
          createdAt: 1,
          talentTier: 'talented',
          attributes: DEFAULT_ATTRIBUTES,
          traits: [],
          martialArts: [],
          origin: '平民百姓',
          locationInfo: {
            year: STORY_EVENTS[0].year,
            month: STORY_EVENTS[0].month,
            day: STORY_EVENTS[0].day,
            location: STORY_EVENTS[0].location,
            eventName: STORY_EVENTS[0].name,
          },
          characterInfo: {
            name: '测试侠客',
            gender: '男',
            appearance: '身形挺拔，眉目清朗',
            age: 18,
          },
        },
      ]),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSetup();
    const setup = await waitFor(() => {
      const element = document.querySelector('[data-wuxia-automation="new-game-setup"]');
      expect(element).toHaveAttribute('data-wuxia-setup-step', 'talent');
      return element as HTMLElement;
    });
    const build = document.querySelector('[data-wuxia-automation="saved-character-build"]');
    expect(build).toHaveAttribute('data-wuxia-build-id', 'build-automation-test');
    expect(build).toHaveAttribute('data-wuxia-build-name', '自动化测试角色');

    fireEvent.click(within(build as HTMLElement).getByRole('button', { name: '加载' }));
    await waitFor(() => expect(setup).toHaveAttribute('data-wuxia-setup-step', 'confirm'));
    fireEvent.click(document.querySelector('[data-wuxia-automation="setup-previous-step"]') as HTMLElement);
    await waitFor(() => expect(setup).toHaveAttribute('data-wuxia-setup-step', 'identity'));
    fireEvent.click(document.querySelector('[data-wuxia-automation="setup-previous-step"]') as HTMLElement);
    await waitFor(() => expect(setup).toHaveAttribute('data-wuxia-setup-step', 'origin'));

    const eventCard = [...document.querySelectorAll('[data-wuxia-automation="opening-event"]')].find(
      element => element.getAttribute('data-wuxia-event-id') === event.id,
    );
    expect(eventCard).toHaveAttribute('data-wuxia-event-name', event.name);
    fireEvent.click(eventCard as HTMLElement);
    expect(eventCard).toHaveAttribute('data-wuxia-event-selected', 'true');
  });
});
