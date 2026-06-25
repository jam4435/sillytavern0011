import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultPresetName,
  getPresetPromptStableId,
  loadDefaultPresetPromptIds,
  renameDefaultPresetPromptSnapshot,
  deletePresetDefaultSnapshotState,
  saveCurrentLoadedPresetPromptsAsDefaultSnapshot,
  saveDefaultPresetPromptIds,
  setDefaultPresetName,
} from './handlers';
import {
  createLoadedPresetPromptMonitorState,
  shouldSyncLoadedPresetPromptDefaultSnapshot,
} from './presetPromptSync';

const presetGlobals = globalThis as typeof globalThis & {
  getLoadedPresetName: ReturnType<typeof vi.fn>;
  getPreset: ReturnType<typeof vi.fn>;
};

const BASE_PRESET_SETTINGS: Preset['settings'] = {
  max_context: 8192,
  max_completion_tokens: 1024,
  reply_count: 1,
  should_stream: true,
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 1,
  repetition_penalty: 1,
  min_p: 0,
  top_k: 0,
  top_a: 0,
  seed: -1,
  squash_system_messages: false,
  reasoning_effort: 'auto',
  request_thoughts: false,
  request_images: false,
  enable_function_calling: false,
  enable_web_search: false,
  allow_sending_images: 'auto',
  allow_sending_videos: false,
  character_name_prefix: 'default',
  wrap_user_messages_in_quotes: false,
};

function createPrompt(id: string, enabled: boolean): PresetPrompt {
  return {
    id,
    name: id,
    enabled,
    position: { type: 'relative' },
    role: 'system',
    content: `${id} content`,
  };
}

function createPreset(enabledPromptIds: string[]): Preset {
  const enabledIdSet = new Set(enabledPromptIds);
  const prompts = ['alpha', 'beta', 'gamma'].map(id => createPrompt(id, enabledIdSet.has(id)));
  return {
    settings: { ...BASE_PRESET_SETTINGS },
    prompts,
    prompts_unused: [],
    extensions: {},
  };
}

describe('presetPromptSync', () => {
  beforeEach(() => {
    localStorage.clear();
    presetGlobals.getLoadedPresetName = vi.fn();
    presetGlobals.getPreset = vi.fn();
  });

  it('同一 loaded preset 从 dirty 变 clean 时触发默认快照同步条件', () => {
    const previousState = createLoadedPresetPromptMonitorState({
      loadedPresetName: 'Alpha',
      livePromptIds: ['id:alpha'],
      savedPromptIds: ['id:beta'],
    });
    const currentState = createLoadedPresetPromptMonitorState({
      loadedPresetName: 'Alpha',
      livePromptIds: ['id:alpha'],
      savedPromptIds: ['id:alpha'],
    });

    expect(shouldSyncLoadedPresetPromptDefaultSnapshot(previousState, currentState)).toBe(true);
  });

  it('仅发生预设切换时不会误判为酒馆保存当前预设', () => {
    const previousState = createLoadedPresetPromptMonitorState({
      loadedPresetName: 'Alpha',
      livePromptIds: ['id:alpha'],
      savedPromptIds: ['id:beta'],
    });
    const currentState = createLoadedPresetPromptMonitorState({
      loadedPresetName: 'Beta',
      livePromptIds: ['id:beta'],
      savedPromptIds: ['id:beta'],
    });

    expect(shouldSyncLoadedPresetPromptDefaultSnapshot(previousState, currentState)).toBe(false);
  });

  it('会把当前 loaded preset 的 live prompt 状态保存为默认快照', () => {
    presetGlobals.getLoadedPresetName.mockReturnValue('Alpha');
    presetGlobals.getPreset.mockImplementation((presetName: string) => {
      if (presetName === 'in_use') {
        return createPreset(['alpha', 'gamma']);
      }
      if (presetName === 'Alpha') {
        return createPreset(['alpha']);
      }
      throw new Error(`unexpected preset: ${presetName}`);
    });

    const result = saveCurrentLoadedPresetPromptsAsDefaultSnapshot();

    expect(result).toEqual({
      ok: true,
      changed: true,
      count: 2,
      presetName: 'Alpha',
    });
    expect(loadDefaultPresetPromptIds('Alpha')).toEqual([
      getPresetPromptStableId(createPrompt('alpha', true)),
      getPresetPromptStableId(createPrompt('gamma', true)),
    ]);
  });

  it('PRESET_RENAMED 时迁移默认预设条目快照并同步默认预设名', () => {
    expect(saveDefaultPresetPromptIds('OldPreset', ['id:alpha'])).toBe(true);
    expect(setDefaultPresetName('OldPreset')).toBe(true);

    const result = renameDefaultPresetPromptSnapshot('OldPreset', 'NewPreset');

    expect(result).toEqual({
      ok: true,
      changed: true,
      snapshotChanged: true,
      defaultPresetChanged: true,
    });
    expect(loadDefaultPresetPromptIds('OldPreset')).toBeUndefined();
    expect(loadDefaultPresetPromptIds('NewPreset')).toEqual(['id:alpha']);
    expect(getDefaultPresetName()).toBe('NewPreset');
  });

  it('PRESET_DELETED 时清理默认预设条目快照并清空默认预设名', () => {
    expect(saveDefaultPresetPromptIds('Alpha', ['id:alpha'])).toBe(true);
    expect(setDefaultPresetName('Alpha')).toBe(true);

    const result = deletePresetDefaultSnapshotState('Alpha');

    expect(result).toEqual({
      ok: true,
      changed: true,
      snapshotChanged: true,
      defaultPresetChanged: true,
    });
    expect(loadDefaultPresetPromptIds('Alpha')).toBeUndefined();
    expect(getDefaultPresetName()).toBe('');
  });
});
