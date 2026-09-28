import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewGameSetup from './NewGameSetup';
import { createAvatarEntityKey, getAvatarStorageKey } from '../utils/avatarStorage';
import { APPEARANCE_TEMPLATES, DEFAULT_ATTRIBUTES, STORY_EVENTS } from '../utils/gameInitializer';

vi.mock('../utils/martialArtsDatabase', () => {
  const arts = [
    { 功法名称: '测试拳法', 功法品阶: '粗浅', 类型: '拳掌', 功法描述: '拳路朴实，适合初学者。' },
    { 功法名称: '测试剑法', 功法品阶: '传家', 类型: '剑法', 功法描述: '剑势轻灵，讲究进退有度。' },
    { 功法名称: '测试轻功', 功法品阶: '上乘', 类型: '轻功', 功法描述: '提气纵跃，身法迅捷。' },
    { 功法名称: '测试刀法', 功法品阶: '镇派', 类型: '刀法', 功法描述: '刀势雄浑，重在一往无前。' },
  ];

  return {
    getAllMartialArtNames: vi.fn(() => arts.map(art => art.功法名称)),
    getMartialArtData: vi.fn((name: string) => arts.find(art => art.功法名称 === name) || null),
    isDatabaseLoaded: vi.fn(() => true),
    loadMartialArtsDatabase: vi.fn(async () => true),
  };
});

function renderSetup() {
  render(<NewGameSetup onSubmit={vi.fn()} onBack={vi.fn()} isLoading={false} />);
}

function goToMartialStep() {
  for (let index = 0; index < 3; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  }
}

function goToOriginStep() {
  for (let index = 0; index < 4; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  }
}

function goToIdentityStep() {
  goToOriginStep();
  fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
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

describe('NewGameSetup trait and identity structure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('属性触发特质只展示一处', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    const autoTraitSections = Array.from(document.querySelectorAll('.traits-step .section-title')).filter(element =>
      element.textContent?.includes('属性触发天赋'),
    );
    expect(autoTraitSections).toHaveLength(1);
    expect(screen.queryByText('先天属性禀赋 (自然觉醒)')).not.toBeInTheDocument();
  });

  it('天赋自选只保留一套，不再重复展示命格全谱自选', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    fireEvent.click(screen.getByRole('button', { name: '天赋自选' }));

    const manualTitles = Array.from(document.querySelectorAll('.traits-step .section-title')).filter(element =>
      element.textContent?.includes('天赋自选'),
    );
    expect(manualTitles).toHaveLength(1);
    expect(screen.queryByText('命格全谱自选')).not.toBeInTheDocument();
  });

  it('身份步骤不再提供独立宗门选择', () => {
    renderSetup();
    goToIdentityStep();

    expect(screen.queryByText('拜入宗门与势力')).not.toBeInTheDocument();
    expect(screen.queryByText('江湖散修')).not.toBeInTheDocument();
  });
});

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

describe('NewGameSetup martial fate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('固定消耗5点生成三门武缘，必须三择一后才能离开武功页', async () => {
    renderSetup();
    goToMartialStep();

    const seekButton = await screen.findByRole('button', { name: /寻访武缘/ });
    await waitFor(() => expect(seekButton).not.toBeDisabled());

    expect(seekButton).toHaveTextContent('-5 点');
    const pointsBefore = Number(document.querySelector('.martial-selection-points strong')?.textContent);

    fireEvent.click(seekButton);

    const candidates = document.querySelectorAll('[data-wuxia-automation="martial-fate-candidate"]');
    expect(candidates).toHaveLength(3);
    expect(new Set(Array.from(candidates).map(card => card.getAttribute('data-wuxia-martial-name'))).size).toBe(3);
    const pointsAfterSeek = Number(document.querySelector('.martial-selection-points strong')?.textContent);
    expect(pointsAfterSeek).toBe(pointsBefore - 5);

    const previousButton = document.querySelector('[data-wuxia-automation="setup-previous-step"]') as HTMLButtonElement;
    const nextButton = document.querySelector('[data-wuxia-automation="setup-next-step"]') as HTMLButtonElement;
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveTextContent('请先择定武缘');

    const acceptButtons = screen.getAllByRole('button', { name: '承此武缘' });
    fireEvent.click(acceptButtons[0]);

    expect(document.querySelectorAll('[data-wuxia-automation="martial-fate-candidate"]')).toHaveLength(0);
    expect(document.querySelector('.martial-selection-heading')).toHaveTextContent('1 门');
    expect(Number(document.querySelector('.martial-selection-points strong')?.textContent)).toBe(pointsAfterSeek);
    expect(previousButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();
    expect(screen.getByText('武缘所得')).toBeInTheDocument();
  });
});

describe('NewGameSetup custom location selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('自定义开局地点使用地点表的三级联动选择，不再提供自由文本输入', () => {
    renderSetup();
    goToOriginStep();

    fireEvent.click(screen.getByRole('button', { name: /自定义时间地点/ }));

    const areaSelect = screen.getByLabelText('一级大域') as HTMLSelectElement;
    fireEvent.change(areaSelect, { target: { value: '大宋' } });

    const regionSelect = screen.getByLabelText('二级区域') as HTMLSelectElement;
    fireEvent.change(regionSelect, { target: { value: '临安府' } });

    const placeSelect = screen.getByLabelText('三级地点') as HTMLSelectElement;
    fireEvent.change(placeSelect, { target: { value: '西湖' } });

    expect(areaSelect.value).toBe('大宋');
    expect(regionSelect.value).toBe('临安府');
    expect(placeSelect.value).toBe('西湖');
    expect(screen.getByText('大宋/临安府/西湖')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/大理\/无量山\/剑湖宫/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(document.querySelector('[data-wuxia-automation="new-game-setup"]')).toHaveAttribute(
      'data-wuxia-setup-step',
      'identity',
    );
  });
});

describe('NewGameSetup custom realm picker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('自定义出身的起始境界使用单一选择栏，不再铺开全部境界按钮', () => {
    renderSetup();
    goToOriginStep();

    fireEvent.click(screen.getByText('自定义出身', { selector: '.origin-name' }));

    const realmSelect = screen.getByLabelText('起始境界') as HTMLSelectElement;
    expect(realmSelect.value).toBe('三流圆满');

    fireEvent.change(realmSelect, { target: { value: '宗师后期' } });
    expect(realmSelect.value).toBe('宗师后期');
    expect(document.querySelector('.realm-hint')).toHaveTextContent('3800');

    expect(screen.queryByRole('group', { name: '选择大境界' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '选择境界阶段' })).not.toBeInTheDocument();
  }, 15000);
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

    // 验证作品分卷筛选 Tab 可以正确过滤事件
    const shediaoTab = screen.getByRole('tab', { name: /射雕英雄传/ });
    fireEvent.click(shediaoTab);
    const visibleCards = document.querySelectorAll('[data-wuxia-automation="opening-event"]');
    expect(visibleCards.length).toBeGreaterThan(0);
    for (const card of Array.from(visibleCards).slice(0, 5)) {
      expect(card.getAttribute('data-wuxia-event-name')).toMatch(/^射雕/);
    }
  }, 15000);
});
