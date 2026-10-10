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
vi.mock('../rollback', () => ({
  rollbackByMk: vi.fn(async (mk: string) => {
    const logs = state.meta.EditLogs[mk] as any[] ?? [];
    for (const entry of [...logs].reverse()) {
      if (entry.op === 'insert') _.unset(state.stat, entry.path);
      else if (entry.value_old === undefined) _.unset(state.stat, entry.path);
      else _.set(state.stat, entry.path, _.cloneDeep(entry.value_old));
    }
    const { markMkRollbackPerformed } = await import('../../utils/mkLedgerJournal');
    if (logs.length > 0) markMkRollbackPerformed(mk);
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

  it('字符串功法的 Delete → Insert 迁移保留掌握程度且生成可逆账本', async () => {
    state.stat = { 角色数据: { 张阿生: { 功法: { 柳叶刀法: '融会贯通' } } } };
    const completed = {
      类型: '刀法',
      功法描述: '从数据库补全的描述',
      功法品阶: '传家',
      掌握程度: '融会贯通',
      特性: { 略有小成: '轻灵出刀' },
    };
    state.message = [
      '<VariableDelete>',
      JSON.stringify({ 角色数据: { 张阿生: { 功法: { 柳叶刀法: {} } } } }),
      '</VariableDelete>',
      '<VariableInsert>',
      JSON.stringify({ 角色数据: { 张阿生: { 功法: { 柳叶刀法: completed } } } }),
      '</VariableInsert>',
    ].join('\n');

    await ApplyVarChangeForMessage({ message_id: 2 });

    const path = '角色数据.张阿生.功法.柳叶刀法';
    expect(_.get(state.stat, path)).toEqual(completed);
    const logs = state.meta.EditLogs['mk-checkout-regression'] as Array<Record<string, any>>;
    expect(logs.map(log => [log.op, log.path])).toEqual([
      ['delete', path],
      ['insert', path],
    ]);
    expect(logs[0].value_old).toBe('融会贯通');
    expect(logs[1].value_new).toEqual(completed);

    const { rollbackByMk } = await import('../rollback');
    await rollbackByMk('mk-checkout-regression');
    expect(_.get(state.stat, path)).toBe('融会贯通');
    // 清理模拟 rollback 留下的进程内见证，避免污染后续测试的重放分支。
    const { consumeMkRollbackWitness } = await import('../../utils/mkLedgerJournal');
    consumeMkRollbackWitness('mk-checkout-regression');
  });

  it('变量块改变时先撤销旧 EditLog，然后才允许替换为空日志', async () => {
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
    const { rollbackByMk } = await import('../rollback');
    expect(rollbackByMk).toHaveBeenCalledWith('mk-checkout-regression', true);
    expect(state.stat.事件系统.人物事件占用.段誉.事件名).toBe('第06事件');
    const { recordEraDiagnostic } = await import('../../utils/diagnostics');
    expect(recordEraDiagnostic).toHaveBeenCalledWith(
      'core-crud-patcher',
      'nonempty-editlog-overwritten-by-empty',
      expect.objectContaining({ messageId: 12, oldLogCount: 1, newLogCount: 0 }),
    );
  });

  it('不同 revision 但旧效果已偏离时拒绝覆盖原账本', async () => {
    state.meta = {
      EditLogs: {
        'mk-checkout-regression': [{
          op: 'insert',
          path: '事件系统.人物事件占用.段誉',
          value_new: newOccupant,
        }],
      },
    };
    state.stat.事件系统.人物事件占用.段誉 = { 事件名: '未知事件' };
    state.message = '重新生成的内容没有动作';

    await expect(ApplyVarChangeForMessage({ message_id: 6 })).rejects.toThrow('未能验证');
    expect(state.meta.EditLogs['mk-checkout-regression']).toHaveLength(1);
    const { rollbackByMk } = await import('../rollback');
    expect(rollbackByMk).not.toHaveBeenCalled();
  });

  it('旧 MK 版本变化时先回滚再重放整楼，删除日志里的旧值仍是原始状态', async () => {
    state.stat = { 事件系统: { 人物事件占用: {} } };
    state.message = insertNew;
    await ApplyVarChangeForMessage({ message_id: 6 });

    state.message = `${deleteOld}\n${insertNew}`;
    await ApplyVarChangeForMessage({ message_id: 6 });

    const log = state.meta.EditLogs['mk-checkout-regression'] as any[];
    // 旧的 insert 必须在新 Delete→Insert 之前撤销；不能把第 07 事件当成旧值。
    expect(log).toEqual([expect.objectContaining({
      op: 'insert', path: '事件系统.人物事件占用.段誉',
      value_new: newOccupant,
    })]);
    const { rollbackByMk } = await import('../rollback');
    expect(rollbackByMk).toHaveBeenCalledWith('mk-checkout-regression', true);
  });

  it('内容版本未变但原日志的变量效果已偏离时也拒绝覆盖', async () => {
    state.stat = { 事件系统: { 人物事件占用: {} } };
    state.message = insertNew;
    await ApplyVarChangeForMessage({ message_id: 6 });
    const previous = structuredClone(state.meta.EditLogs['mk-checkout-regression']);
    // 外部 direct 更新让同一 MK 的原 insert 效果不再对应当前状态。
    state.stat.事件系统.人物事件占用.段誉 = { 事件名: '其他事件' };
    await expect(ApplyVarChangeForMessage({ message_id: 6 })).rejects.toThrow('未能验证');
    expect(state.meta.EditLogs['mk-checkout-regression']).toEqual(previous);
  });

  it('同一 MK 同内容在原效果尚存在时重复处理，不把可撤销的 Insert 账本覆盖成空', async () => {
    state.stat = { 事件系统: { 人物事件占用: {} } };
    state.message = insertNew;
    await ApplyVarChangeForMessage({ message_id: 6 });

    const first = structuredClone(state.meta.EditLogs['mk-checkout-regression']);
    expect(first).toEqual([
      expect.objectContaining({ op: 'insert', path: '事件系统.人物事件占用.段誉' }),
    ]);
    expect((state.meta as any).EditLogContentRevisions?.['mk-checkout-regression']).toEqual(expect.any(String));

    // 重复 render/API 处理时实际变量已是目标值，此时重算会生成 []。
    // 不能据此否认最初 Insert 曾发生。
    await ApplyVarChangeForMessage({ message_id: 6 });
    expect(state.meta.EditLogs['mk-checkout-regression']).toEqual(first);
  });

  it('重复 Delete 再 Insert 同一路径时保留首次删除的真实旧占用，不用新占用覆盖旧值', async () => {
    state.message = `${deleteOld}\n${insertNew}`;
    await ApplyVarChangeForMessage({ message_id: 6 });
    const initial = structuredClone(state.meta.EditLogs['mk-checkout-regression']) as any[];
    expect(initial[0].value_old).toEqual(oldOccupant);

    // 再执行同样的 Delete→Insert，生成的新日志看似仍有两条，
    // 但其 Delete.value_old 已变成第07事件，不能用它替代原账本。
    await ApplyVarChangeForMessage({ message_id: 6 });
    const persisted = state.meta.EditLogs['mk-checkout-regression'] as any[];
    expect(persisted).toEqual(initial);
    expect(persisted[0].value_old).toEqual(oldOccupant);
    expect(state.stat.事件系统.人物事件占用.段誉).toEqual(newOccupant);
  });

  it('第6楼：加入参与事件并删除后续线索，两条事务重复应用后仍保留两条逆向记录', async () => {
    state.stat = {
      参与事件: {},
      后续事件线索: { 事件06: { 地点: '琅嬛福地' } },
    };
    state.message = [
      '<VariableInsert>\\n{"参与事件":{"事件06":{"结局":"进行中"}}}\\n</VariableInsert>',
      '<VariableDelete>\\n{"后续事件线索":{"事件06":{}}}\\n</VariableDelete>',
    ].join('\\n');
    await ApplyVarChangeForMessage({ message_id: 6 });
    const initial = structuredClone(state.meta.EditLogs['mk-checkout-regression']) as any[];
    expect(initial.map(log => ({ op: log.op, path: log.path }))).toEqual([
      { op: 'insert', path: '参与事件.事件06' },
      { op: 'delete', path: '后续事件线索.事件06' },
    ]);

    // 同 MK 内容未改变、效果还在：不能把第二次无操作应用生成的 [] 覆盖成空账本。
    await ApplyVarChangeForMessage({ message_id: 6 });
    expect(state.meta.EditLogs['mk-checkout-regression']).toEqual(initial);

    // 逆序回滚确实应该回到第4楼：参与事件消失，后续线索恢复。
    for (const log of [...initial].reverse()) {
      if (log.op === 'insert') _.unset(state.stat, log.path);
      if (log.op === 'delete') _.set(state.stat, log.path, structuredClone(log.value_old));
    }
    expect(state.stat.参与事件.事件06).toBeUndefined();
    expect(state.stat.后续事件线索.事件06).toEqual({ 地点: '琅嬛福地' });
  });

  it('正常回滚后重新处理整楼，可以重建账本；修改变量块后不会沿用旧账本', async () => {
    state.message = `${deleteOld}\n${insertNew}`;
    await ApplyVarChangeForMessage({ message_id: 6 });
    const initial = structuredClone(state.meta.EditLogs['mk-checkout-regression']) as any[];
    expect(initial.map(entry => entry.op)).toEqual(['delete', 'insert']);

    // 模拟 dispatcher 先 rollbackByMk 后 ApplyVarChange。
    for (const entry of [...initial].reverse()) {
      if (entry.op === 'insert') _.unset(state.stat, entry.path);
      else if (entry.op === 'delete') _.set(state.stat, entry.path, structuredClone(entry.value_old));
    }
    expect(state.stat.事件系统.人物事件占用.段誉).toEqual(oldOccupant);
    // 完整同步已经真实撤销过此楼：由 rollbackByMk 提供一次性见证。
    const { markMkRollbackPerformed } = await import('../../utils/mkLedgerJournal');
    markMkRollbackPerformed('mk-checkout-regression');

    await ApplyVarChangeForMessage({ message_id: 6 });
    expect((state.meta.EditLogs['mk-checkout-regression'] as any[]).map(entry => entry.op))
      .toEqual(['delete', 'insert']);

    // 修改为不含动作的内容代表真正的消息替换，旧账本不能被永远保留。
    state.message = '重新生成后不包含任何变量动作';
    await ApplyVarChangeForMessage({ message_id: 6 });
    expect(state.meta.EditLogs['mk-checkout-regression']).toEqual([]);
  });

  it('变量已改动而 EditLog 持久化失败时，不得返回成功 MK', async () => {
    const { updateEraMetaData } = await import('../../utils/era_data');
    vi.mocked(updateEraMetaData).mockRejectedValueOnce(new Error('metadata write failed'));
    state.stat = { 事件系统: { 人物事件占用: {} } };
    state.message = insertNew;

    await expect(ApplyVarChangeForMessage({ message_id: 6 }))
      .rejects.toThrow('metadata write failed');
    expect(state.meta.EditLogs['mk-checkout-regression']).toBeUndefined();
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
