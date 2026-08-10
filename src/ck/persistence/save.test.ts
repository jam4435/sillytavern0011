import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../content/basePack';
import { executeAction, makeAction } from '../domain/engine';
import {
  addCheckpoint,
  clearMemorySaveForTests,
  createEnvelope,
  createPublicProjection,
  importSave,
  loadSave,
  restoreLatestHistoryBranch,
  saveState,
  type ChronicleEntry,
} from './save';

function advance(state: ReturnType<typeof createInitialState>, days: number) {
  const call = makeAction(state, 'time.advance', state.playerCharacterId, [], { days }, 'test', 'save_test', `advance_${state.revision}_${days}`);
  const result = executeAction(state, call);
  if (result.status !== 'committed') throw new Error(result.errors.map(error => error.message).join('；'));
  return result.state;
}

describe('CK 权威存档与酒馆历史桥接', () => {
  let chatVariables: Record<string, unknown>;
  let messages: Array<{ message_id: number; role: 'user' | 'assistant' | 'system'; message: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    clearMemorySaveForTests();
    chatVariables = {};
    messages = [];
    vi.stubGlobal('getVariables', () => chatVariables);
    vi.stubGlobal('updateVariablesWith', (updater: (variables: Record<string, unknown>) => Record<string, unknown>) => {
      chatVariables = updater(chatVariables);
      return chatVariables;
    });
    vi.stubGlobal('createChatMessages', async (created: Array<{ role: 'user' | 'assistant' | 'system'; message: string; data?: Record<string, unknown> }>) => {
      for (const item of created) messages.push({ message_id: messages.length, role: item.role, message: item.message, data: item.data ?? {} });
    });
    vi.stubGlobal('getChatMessages', (range: string | number, option?: { role?: string }) => {
      const filtered = option?.role ? messages.filter(message => message.role === option.role) : messages;
      return range === -1 ? filtered.slice(-1) : filtered;
    });
    vi.stubGlobal('getLastMessageId', () => messages.length - 1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemorySaveForTests();
  });

  it('保存时只更新 CK 命名空间，并生成只读公开投影', () => {
    chatVariables.unrelated = { keep: true };
    const state = createInitialState();
    saveState(state);
    expect(chatVariables.unrelated).toEqual({ keep: true });
    expect(loadSave()?.state.saveId).toBe(state.saveId);
    expect((chatVariables.ck_lord_rpg_public as { politics: { support: number } }).politics.support).toBe(0);
    expect(createPublicProjection(state).player.name).toBe('科南二世');
  });

  it('完整状态哈希能发现未写事件的资源篡改', () => {
    const state = createInitialState();
    const envelope = createEnvelope(state);
    const tampered = JSON.parse(JSON.stringify(envelope));
    tampered.state.resources.gold += 999;
    const imported = importSave(JSON.stringify(tampered));
    expect(imported.ok).toBe(false);
  });

  it('对话纪事与最多十个命名检查点保存在权威信封中', async () => {
    const state = createInitialState();
    const chronicle: ChronicleEntry[] = [{ id: 'scene', date: state.currentDate, kind: 'speech', title: '科南二世', text: '我们去南特。' }];
    for (let index = 0; index < 12; index += 1) await addCheckpoint(state, chronicle, `检查点 ${index}`, false);
    const save = loadSave();
    expect(save?.chronicle).toEqual(chronicle);
    expect(save?.checkpoints).toHaveLength(10);
    expect(save?.checkpoints[0].name).toBe('检查点 2');
  });

  it('删除当前分支锚点后恢复到历史中最后一个有效快照', async () => {
    const chronicle: ChronicleEntry[] = [];
    let state = createInitialState();
    await addCheckpoint(state, chronicle, '第一锚点', true);
    state = advance(state, 2);
    await addCheckpoint(state, chronicle, '第二锚点', true);
    state = advance(state, 2);
    saveState(state, { chronicle });
    expect(loadSave()?.state.currentDate).toBe('1066-09-19');

    messages.pop();
    const restored = restoreLatestHistoryBranch();
    expect(restored?.state.currentDate).toBe('1066-09-15');
    expect(restored?.branchAnchor?.messageId).toBe(0);
  });
});
