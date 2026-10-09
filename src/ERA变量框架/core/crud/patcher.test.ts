import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import _ from 'lodash';

const state = vi.hoisted(() => ({
  message: '',
  stat: {} as Record<string, any>,
  meta: { EditLogs: {} as Record<string, unknown> },
}));

vi.mock('../../core/key/mk', () => ({ readMessageKey: () => 'mk-checkout-regression' }));
vi.mock('../../utils/message', () => ({
  getMessageContent: () => state.message,
  isUserMessage: () => false,
  findLastAiMessage: vi.fn(),
}));
vi.mock('../../utils/era_data', () => ({
  getEraData: () => ({ stat: state.stat, meta: state.meta }),
  updateEraStatData: vi.fn(async (updater: (stat: Record<string, unknown>) => unknown) => {
    state.stat = (await updater(state.stat)) as Record<string, any>;
  }),
  updateEraMetaData: vi.fn(async (updater: (meta: Record<string, unknown>) => unknown) => {
    state.meta = (await updater(state.meta)) as typeof state.meta;
  }),
}));
vi.mock('./update', () => ({ processEditBlocks: vi.fn() }));
vi.mock('../../utils/diagnostics', () => ({ recordEraDiagnostic: vi.fn() }));
vi.mock('../../utils/log', () => ({
  Logger: class {
    log = vi.fn();
    debug = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

import { ApplyVarChangeForMessage } from './patcher';

const oldOccupant = { 事件名: '第06事件', 地点: '琅嬛福地' };
const newOccupant = { 事件名: '第07事件', 地点: '琅嬛福地' };
const deleteOld = '<VariableDelete>\n{"事件系统":{"人物事件占用":{"段誉":{}}}}\n</VariableDelete>';
const insertNew =
  '<VariableInsert>\n' +
  JSON.stringify({ 事件系统: { 人物事件占用: { 段誉: newOccupant } } }) +
  '\n</VariableInsert>';

describe('ERA 同一楼层变量块的原始次序', () => {
  beforeEach(() => {
    vi.stubGlobal('_', _);
    state.stat = { 事件系统: { 人物事件占用: { 段誉: structuredClone(oldOccupant) } } };
    state.meta = { EditLogs: {} };
    state.message = '';
    vi.clearAllMocks();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('复现天龙 06→07 事件接驳：先 Delete 再 Insert 必须留下第07占用，且日志可逆', async () => {
    state.message = `正文结算\n${deleteOld}\n${insertNew}`;
    const result = await ApplyVarChangeForMessage({ message_id: 10 });

    expect(result).toBe('mk-checkout-regression');
    expect(state.stat.事件系统.人物事件占用.段誉).toEqual(newOccupant);
    const logs = state.meta.EditLogs['mk-checkout-regression'] as Array<Record<string, any>>;
    expect(logs.map(entry => entry.op)).toEqual(['delete', 'insert']);
    expect(logs[0].value_old).toEqual(oldOccupant);
    expect(logs[1].value_new).toEqual(newOccupant);
    // 模拟 rollbackByMk 使用逆序日志可回到消息处理之前。
    const restored = structuredClone(state.stat);
    for (const log of [...logs].reverse()) {
      if (log.op === 'insert') delete restored.事件系统.人物事件占用.段誉;
      if (log.op === 'delete') restored.事件系统.人物事件占用.段誉 = log.value_old;
    }
    expect(restored.事件系统.人物事件占用.段誉).toEqual(oldOccupant);
  });

  it('二次处理时覆盖非空日志为 [] 必须留下可查询的诊断，而不是擅自保留旧日志', async () => {
    state.stat.事件系统.人物事件占用.段誉 = structuredClone(newOccupant);
    state.meta = {
      EditLogs: {
        'mk-checkout-regression': [{
          op: 'update',
          path: '事件系统.人物事件占用.段誉.事件名',
          value_old: '第06事件',
          value_new: '第07事件',
        }],
      },
    };
    state.message = insertNew;
    await ApplyVarChangeForMessage({ message_id: 12 });

    expect(state.meta.EditLogs['mk-checkout-regression']).toEqual([]);
    const { recordEraDiagnostic } = await import('../../utils/diagnostics');
    expect(recordEraDiagnostic).toHaveBeenCalledWith(
      'core-crud-patcher',
      'nonempty-editlog-overwritten-by-empty',
      expect.objectContaining({ messageId: 12, oldLogCount: 1, newLogCount: 0 }),
    );
  });

  it('如果实际顺序是 Insert 再 Delete，最终仍应删除占用', async () => {
    state.stat = { 事件系统: { 人物事件占用: {} } };
    state.message = `${insertNew}\n${deleteOld}`;
    await ApplyVarChangeForMessage({ message_id: 12 });

    expect(state.stat.事件系统.人物事件占用.段誉).toBeUndefined();
    const logs = state.meta.EditLogs['mk-checkout-regression'] as Array<Record<string, any>>;
    expect(logs.map(entry => entry.op)).toEqual(['insert', 'delete']);
  });
});
