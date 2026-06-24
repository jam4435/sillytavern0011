import { describe, expect, it } from 'vitest';

import {
  PARTICIPANT_ENTRY_SOURCE,
  buildOccupancyCleanupPatch,
  buildParticipantEntryPlan,
  normalizeParticipantEventDefinition,
} from './era-participant-entry.js';

const currentTime = { 年: 1210, 月: 8, 日: 8, 时: 7 };
const eventData = {
  事件地点: '蒙古/大漠/荒山',
  参与人物: ['郭靖', '梅超风'],
};

describe('normalizeParticipantEventDefinition', () => {
  it('deduplicates and trims ordinary event participants', () => {
    const result = normalizeParticipantEventDefinition(
      '射雕事件条目-第4回-05-荒山恶战',
      {
        事件地点: ' 蒙古/大漠/荒山 ',
        参与人物: ['郭靖', ' 郭靖 ', '梅超风'],
      },
      { isDebut: false },
    );

    expect(result.valid).toBe(true);
    expect(result.data.事件地点).toBe('蒙古/大漠/荒山');
    expect(result.data.参与人物).toEqual(['郭靖', '梅超风']);
  });

  it('rejects ordinary events without a location or participants', () => {
    const result = normalizeParticipantEventDefinition('无效事件', {}, { isDebut: false });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects non-string participant values', () => {
    const result = normalizeParticipantEventDefinition(
      '无效参与人物事件',
      { 事件地点: '蒙古/大漠', 参与人物: ['郭靖', 123] },
      { isDebut: false },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('事件 无效参与人物事件 的参与人物只能包含字符串');
  });

  it('does not require participant fields for debut events', () => {
    const event = { 事件类型: '登场事件', insert: {} };
    const result = normalizeParticipantEventDefinition('射雕登场事件-第4回人物', event, {
      isDebut: true,
    });

    expect(result).toEqual({ valid: true, data: event, errors: [] });
  });
});

describe('buildParticipantEntryPlan', () => {
  it('moves existing participants and skips missing characters', () => {
    const plan = buildParticipantEntryPlan({
      eventName: '荒山恶战',
      eventData,
      source: PARTICIPANT_ENTRY_SOURCE.TIME,
      currentTime,
      characters: {
        郭靖: { 所在位置: '蒙古/克烈部' },
      },
      occupancy: {},
    });

    expect(plan.locationUpdates).toEqual({
      郭靖: { 所在位置: '蒙古/大漠/荒山' },
    });
    expect(plan.occupancyInserts.郭靖).toMatchObject({
      事件名: '荒山恶战',
      地点: '蒙古/大漠/荒山',
      来源: '时间触发',
    });
    expect(plan.missingCharacters).toEqual(['梅超风']);
  });

  it('is idempotent once the same event owns the participant', () => {
    const plan = buildParticipantEntryPlan({
      eventName: '荒山恶战',
      eventData,
      source: PARTICIPANT_ENTRY_SOURCE.TIME,
      currentTime,
      characters: {
        郭靖: { 所在位置: '玩家后来带往别处' },
        梅超风: { 所在位置: '蒙古/大漠/荒山' },
      },
      occupancy: {
        郭靖: { 事件名: '荒山恶战' },
        梅超风: { 事件名: '荒山恶战' },
      },
    });

    expect(plan.locationUpdates).toEqual({});
    expect(plan.occupancyInserts).toEqual({});
    expect(plan.alreadyEntered).toEqual(['郭靖', '梅超风']);
  });

  it('does not let a time-triggered event steal a participant', () => {
    const plan = buildParticipantEntryPlan({
      eventName: '荒山恶战',
      eventData,
      source: PARTICIPANT_ENTRY_SOURCE.TIME,
      currentTime,
      characters: {
        郭靖: { 所在位置: '蒙古/克烈部' },
        梅超风: { 所在位置: '蒙古/大漠' },
      },
      occupancy: {
        郭靖: { 事件名: '另一个事件', 来源: '玩家参与' },
      },
    });

    expect(plan.locationUpdates).not.toHaveProperty('郭靖');
    expect(plan.conflicts).toEqual([{ 人物: '郭靖', 当前事件: '另一个事件', 请求事件: '荒山恶战' }]);
    expect(plan.occupancyInserts).toHaveProperty('梅超风');
  });

  it('lets player participation override prior occupancy', () => {
    const plan = buildParticipantEntryPlan({
      eventName: '荒山恶战',
      eventData,
      source: PARTICIPANT_ENTRY_SOURCE.PLAYER,
      currentTime,
      characters: {
        郭靖: { 所在位置: '蒙古/克烈部' },
        梅超风: { 所在位置: '蒙古/大漠' },
      },
      occupancy: {
        郭靖: { 事件名: '另一个事件', 来源: '时间触发' },
      },
    });

    expect(plan.occupancyDeletes).toEqual({ 郭靖: {} });
    expect(plan.locationUpdates.郭靖).toEqual({ 所在位置: '蒙古/大漠/荒山' });
    expect(plan.occupancyInserts.郭靖.来源).toBe('玩家参与');
  });
});

describe('buildOccupancyCleanupPatch', () => {
  it('only releases participants still owned by the ending event', () => {
    expect(
      buildOccupancyCleanupPatch(
        {
          郭靖: { 事件名: '荒山恶战' },
          梅超风: { 事件名: '另一个事件' },
          柯镇恶: { 事件名: '荒山恶战' },
        },
        '荒山恶战',
      ),
    ).toEqual({
      郭靖: {},
      柯镇恶: {},
    });
  });
});
