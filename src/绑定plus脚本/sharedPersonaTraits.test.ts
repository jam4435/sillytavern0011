import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPersonaPlusBindings,
  composePersonaDescription,
  deleteContextBinding,
  loadEnabledSharedTraitIds,
  loadPersonaTraits,
  loadSharedPersonaTraitsConfig,
  saveEnabledSharedTraitIds,
  savePersonaDefaultEnabledSharedTraitIds,
  savePersonaDefaultEnabledTraitIds,
  savePersonaTraits,
  saveSharedPersonaTraitsConfig,
  upsertContextBinding,
} from './handlers';
import type { PersonaRuntimeContext } from './types';

const globals = globalThis as typeof globalThis & {
  $: ReturnType<typeof vi.fn>;
  getCurrentPersonaId: ReturnType<typeof vi.fn>;
  getPersonaIds: ReturnType<typeof vi.fn>;
  getPersona: ReturnType<typeof vi.fn>;
  getLoadedPresetName: ReturnType<typeof vi.fn>;
  getGlobalWorldbookNames: ReturnType<typeof vi.fn>;
  getCharWorldbookNames: ReturnType<typeof vi.fn>;
  getChatWorldbookName: ReturnType<typeof vi.fn>;
};

const CONTEXT: PersonaRuntimeContext = {
  chatId: 'chat-a',
  chatName: 'Chat A',
  characterId: 'char-a',
  characterName: 'Char A',
};

function createJqueryStub() {
  const empty = {
    length: 0,
    find: vi.fn(() => empty),
    each: vi.fn(),
    first: vi.fn(() => empty),
    text: vi.fn(() => ''),
    attr: vi.fn(() => ''),
    hasClass: vi.fn(() => false),
  };
  return empty;
}

function seedPersonas(selectedAvatarId: string = 'p1') {
  globals.getCurrentPersonaId = vi.fn(() => selectedAvatarId);
  globals.getPersonaIds = vi.fn(() => ['p1']);
  globals.getPersona = vi.fn((avatarId: string) => ({
    avatar_id: avatarId,
    name: avatarId === 'p1' ? 'User One' : avatarId,
    description: '',
    is_default: false,
  }));
}

describe('shared persona traits', () => {
  beforeEach(() => {
    localStorage.clear();
    globals.$ = vi.fn(() => createJqueryStub());
    globals.getLoadedPresetName = vi.fn(() => '');
    globals.getGlobalWorldbookNames = vi.fn(() => []);
    globals.getCharWorldbookNames = vi.fn(() => ({ primary: null, additional: [] }));
    globals.getChatWorldbookName = vi.fn(() => null);
    seedPersonas();
  });

  it('归一化通用条目存储并过滤不存在的文件夹引用', () => {
    expect(loadSharedPersonaTraitsConfig().traits).toEqual([]);

    expect(
      saveSharedPersonaTraitsConfig({
        version: 1,
        traits: [
          {
            id: 'shared-a',
            name: '通用性格',
            description: '稳定温和。',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        folders: [
          {
            id: 'folder-a',
            name: '共用',
            traitIds: ['shared-a', 'missing'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        updatedAt: 1,
      }),
    ).toBe(true);

    const config = loadSharedPersonaTraitsConfig();
    expect(config.traits.map(trait => trait.id)).toEqual(['shared-a']);
    expect(config.folders[0].traitIds).toEqual(['shared-a']);
  });

  it('拼装描述时按通用条目在前、本地条目在后的顺序输出', async () => {
    saveSharedPersonaTraitsConfig({
      version: 1,
      traits: [
        {
          id: 'shared-a',
          name: '通用性格',
          description: '稳定温和。',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      folders: [],
      updatedAt: 1,
    });
    saveEnabledSharedTraitIds('p1', ['shared-a']);
    savePersonaTraits('p1', [
      {
        id: 'local-a',
        name: '身份',
        description: '身份是旅人。',
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    await expect(composePersonaDescription('p1', '基础设定')).resolves.toBe(
      '基础设定\n\n--- 角色设定 ---\n- 稳定温和。\n- 身份是旅人。',
    );
  });

  it('聊天绑定快照会应用并恢复本地与通用条目 baseline', async () => {
    saveSharedPersonaTraitsConfig({
      version: 1,
      traits: [
        { id: 'shared-a', name: '通用 A', description: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'shared-b', name: '通用 B', description: 'B', createdAt: 1, updatedAt: 1 },
      ],
      folders: [],
      updatedAt: 1,
    });
    saveEnabledSharedTraitIds('p1', ['shared-b']);
    savePersonaTraits('p1', [
      { id: 'local-a', name: '本地 A', description: 'A', enabled: false, createdAt: 1, updatedAt: 1 },
      { id: 'local-b', name: '本地 B', description: 'B', enabled: true, createdAt: 1, updatedAt: 1 },
    ]);

    upsertContextBinding(
      'chat',
      {
        userPersonaAvatarId: 'p1',
        userPersonaEnabledTraitIds: ['local-a'],
        userPersonaEnabledSharedTraitIds: ['shared-a'],
      },
      CONTEXT,
    );

    await applyPersonaPlusBindings('p1', CONTEXT, true);
    expect(loadPersonaTraits('p1').filter(trait => trait.enabled).map(trait => trait.id)).toEqual(['local-a']);
    expect(loadEnabledSharedTraitIds('p1')).toEqual(['shared-a']);

    expect(deleteContextBinding('chat', CONTEXT)).toBe(true);
    await applyPersonaPlusBindings('p1', CONTEXT, true);
    expect(loadPersonaTraits('p1').filter(trait => trait.enabled).map(trait => trait.id)).toEqual(['local-b']);
    expect(loadEnabledSharedTraitIds('p1')).toEqual(['shared-b']);
  });

  it('没有绑定快照时同时回退本地和通用默认条目状态', async () => {
    saveSharedPersonaTraitsConfig({
      version: 1,
      traits: [
        { id: 'shared-a', name: '通用 A', description: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'shared-b', name: '通用 B', description: 'B', createdAt: 1, updatedAt: 1 },
      ],
      folders: [],
      updatedAt: 1,
    });
    savePersonaTraits('p1', [
      { id: 'local-a', name: '本地 A', description: 'A', enabled: false, createdAt: 1, updatedAt: 1 },
      { id: 'local-b', name: '本地 B', description: 'B', enabled: true, createdAt: 1, updatedAt: 1 },
    ]);
    saveEnabledSharedTraitIds('p1', ['shared-b']);
    savePersonaDefaultEnabledTraitIds('p1', ['local-a']);
    savePersonaDefaultEnabledSharedTraitIds('p1', ['shared-a']);

    await applyPersonaPlusBindings('p1', CONTEXT, true);

    expect(loadPersonaTraits('p1').filter(trait => trait.enabled).map(trait => trait.id)).toEqual(['local-a']);
    expect(loadEnabledSharedTraitIds('p1')).toEqual(['shared-a']);
  });
});
