import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toCustomAvatarRef, toPresetAvatarRef } from './avatarCatalog';
import {
  clearAvatarSelection,
  clearCustomAvatar,
  createAvatarEntityKey,
  getAvatarSelectionStorageKey,
  getAvatarStorageKey,
  readAvatarSelection,
  readCustomAvatar,
  resolveAvatarSource,
  saveAvatarSelection,
  saveCustomAvatar,
} from './avatarStorage';

const getCurrentChatIdMock = globalThis.SillyTavern.getCurrentChatId as ReturnType<typeof vi.fn>;

describe('avatarStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    getCurrentChatIdMock.mockReturnValue('chat-a');
  });

  it('保存、读取、清除自定义头像', () => {
    const entityKey = createAvatarEntityKey('player');
    saveCustomAvatar(entityKey, 'data:image/png;base64,avatar', 'avatar.png');

    expect(readCustomAvatar(entityKey)).toEqual(
      expect.objectContaining({
        version: 1,
        imageData: 'data:image/png;base64,avatar',
        fileName: 'avatar.png',
      }),
    );

    clearCustomAvatar(entityKey);
    expect(readCustomAvatar(entityKey)).toBeNull();
  });

  it('损坏 JSON 会安全兜底为空', () => {
    localStorage.setItem(getAvatarStorageKey('player'), '{broken');
    localStorage.setItem(getAvatarSelectionStorageKey('player'), '{broken');

    expect(readCustomAvatar('player')).toBeNull();
    expect(readAvatarSelection('player')).toBeNull();
  });

  it('不同 chatId 之间互相隔离', () => {
    saveCustomAvatar('player', 'data:image/png;base64,avatar-a', 'a.png', 'chat-a');

    expect(readCustomAvatar('player', 'chat-a')?.imageData).toBe('data:image/png;base64,avatar-a');
    expect(readCustomAvatar('player', 'chat-b')).toBeNull();
  });

  it('本地 selection 覆盖变量头像 ref', () => {
    const entityKey = createAvatarEntityKey('npc', '黄蓉');
    saveAvatarSelection(entityKey, toPresetAvatarRef('huang_rong_fc3'));

    const source = resolveAvatarSource({
      entityKey,
      avatarRef: toPresetAvatarRef('huang_rong_fc2'),
      name: '黄蓉',
    });

    expect(source.label).toBe('黄蓉二');
    expect(source.source).toBe('preset');
  });

  it('本地自定义头像优先，并可清除 selection', () => {
    const entityKey = createAvatarEntityKey('npc', '黄蓉');
    saveCustomAvatar(entityKey, 'data:image/png;base64,custom', 'custom.png');
    saveAvatarSelection(entityKey, toCustomAvatarRef(entityKey));

    expect(resolveAvatarSource({ entityKey, name: '黄蓉' })).toEqual(
      expect.objectContaining({
        src: 'data:image/png;base64,custom',
        source: 'custom',
      }),
    );

    clearAvatarSelection(entityKey);
    expect(readAvatarSelection(entityKey)).toBeNull();
  });
});
