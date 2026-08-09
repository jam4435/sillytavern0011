import { describe, expect, it } from 'vitest';

import {
  PARTICIPANT_ENTRY_SOURCE,
  buildOccupancyCleanupPatch,
  buildParticipantEntryPlan,
  getRumorScopeFromEventLocation,
  isLocationWithinRumorScope,
  isSameLocationScope,
  normalizeLocationPath,
  normalizeParticipantEventDefinition,
} from './era-participant-entry.js';
import { buildPlayerParticipationEntry } from './era-event-operations.js';
import { EVENT_KIND, buildInvalidParticipationDeletePatch, isParticipationEntry } from './era-utils.js';

const currentTime = { 年: 1210, 月: 8, 日: 8, 时: 7 };
const eventData = {
  事件地点: '蒙古/大漠/荒山',
  事件引子: '听说大漠荒山近日有人交手。',
  事件概要: '郭靖与梅超风结束荒山冲突，各自状态与去向得到确定。',
  参与人物: ['郭靖', '梅超风'],
};

describe('normalizeParticipantEventDefinition', () => {
  it('deduplicates and trims ordinary event participants', () => {
    const result = normalizeParticipantEventDefinition(
      '射雕第四回05-荒山恶战',
      {
        事件地点: ' 蒙古/大漠/荒山 ',
        事件引子: ' 听说大漠荒山近日有人交手。 ',
        事件概要: ' 郭靖与梅超风结束荒山冲突，各自状态与去向得到确定。 ',
        参与人物: ['郭靖', ' 郭靖 ', '梅超风'],
      },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(true);
    expect(result.data.事件地点).toBe('蒙古/大漠/荒山');
    expect(result.data.事件引子).toBe('听说大漠荒山近日有人交手。');
    expect(result.data.事件概要).toBe('郭靖与梅超风结束荒山冲突，各自状态与去向得到确定。');
    expect(result.data.参与人物).toEqual(['郭靖', '梅超风']);
  });

  it('rejects ordinary events without a location or participants', () => {
    const result = normalizeParticipantEventDefinition(
      '无效事件',
      { 事件概要: '事件结束后的持久结果已经得到确定。' },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('rejects non-string participant values', () => {
    const result = normalizeParticipantEventDefinition(
      '无效参与人物事件',
      {
        事件地点: '蒙古/大漠',
        事件引子: '听说大漠有异动。',
        事件概要: '郭靖查清大漠异动的缘由，并确定相关人物的去向。',
        参与人物: ['郭靖', 123],
      },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('事件 无效参与人物事件 的参与人物只能包含字符串');
  });

  it('rejects object-shaped event hooks for ordinary events', () => {
    const result = normalizeParticipantEventDefinition(
      '旧格式事件',
      {
        事件地点: '大宋/临安府/牛家村',
        事件引子: { '大宋/临安府': '你听说牛家村近日有异动。' },
        事件概要: '郭啸天查清牛家村异动，村中局势恢复稳定。',
        参与人物: ['郭啸天'],
      },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('事件 旧格式事件 缺少非空的事件引子');
  });

  it('rejects single-level ordinary event locations', () => {
    const result = normalizeParticipantEventDefinition(
      '单级地点事件',
      {
        事件地点: '大宋',
        事件引子: '你听说大宋近日有异动。',
        事件概要: '郭啸天查清大宋异动，相关人物的处境得到确定。',
        参与人物: ['郭啸天'],
      },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('事件 单级地点事件 的事件地点必须是三级或四级完整路径');
  });

  it('does not require participant fields for debut events', () => {
    const event = { 事件类型: '登场事件', insert: {} };
    const result = normalizeParticipantEventDefinition('射雕第四回00-人物登场', event, {
      kind: EVENT_KIND.DEBUT,
    });

    expect(result).toEqual({ valid: true, data: event, errors: [] });
  });

  it('rejects ordinary events without an event summary', () => {
    const result = normalizeParticipantEventDefinition(
      '缺少概要事件',
      { 事件地点: '蒙古/大漠', 事件引子: '听说大漠有异动。', 参与人物: ['郭靖'] },
      { kind: EVENT_KIND.ORDINARY },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('事件 缺少概要事件 缺少非空的事件概要');
  });
});

describe('derived rumor scope', () => {
  it('normalizes slash-separated location paths', () => {
    expect(normalizeLocationPath(' 大宋 / 临安府 / 牛家村 ')).toBe('大宋/临安府/牛家村');
    expect(normalizeLocationPath(' 大宋 / 临安府 / 牛家村 / 村西树林 ')).toBe('大宋/临安府/牛家村/村西树林');
    expect(normalizeLocationPath('临安府/牛家村')).toBe('');
  });

  it('derives the rumor scope from the first two event-location levels', () => {
    expect(getRumorScopeFromEventLocation('大宋/临安府/牛家村')).toBe('大宋/临安府');
    expect(getRumorScopeFromEventLocation(' 大宋 / 临安府 / 牛家村 ')).toBe('大宋/临安府');
  });

  it('shows rumors only inside the derived scope and below it', () => {
    const rumorScope = getRumorScopeFromEventLocation('大宋/临安府/牛家村');

    expect(isLocationWithinRumorScope('大宋/临安府/客栈', rumorScope)).toBe(true);
    expect(isLocationWithinRumorScope('大宋/临安府/牛家村/村西树林', rumorScope)).toBe(true);
    expect(isLocationWithinRumorScope('大宋/嘉兴府/嘉兴城', rumorScope)).toBe(false);
    expect(isLocationWithinRumorScope('金国/中都/街区', rumorScope)).toBe(false);
  });

  it('lets the caller suppress rumor output at the exact event location', () => {
    const eventLocation = '大宋/临安府/牛家村/村西树林';
    const playerLocation = '大宋/临安府/牛家村/曲三酒馆';
    const rumorScope = getRumorScopeFromEventLocation(eventLocation);
    const alreadyJoined = false;
    const canShowRumor =
      isLocationWithinRumorScope(playerLocation, rumorScope) &&
      !alreadyJoined &&
      !isSameLocationScope(eventLocation, playerLocation);

    expect(canShowRumor).toBe(false);
  });

  it('lets the caller suppress rumor output after participation', () => {
    const eventLocation = '大宋/临安府/牛家村';
    const playerLocation = '大宋/临安府/客栈';
    const rumorScope = getRumorScopeFromEventLocation(eventLocation);
    const alreadyJoined = true;
    const canShowRumor =
      isLocationWithinRumorScope(playerLocation, rumorScope) && !alreadyJoined && eventLocation !== playerLocation;

    expect(canShowRumor).toBe(false);
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

  it('keeps a fourth-level scene on the character but stores only the three-level occupancy scope', () => {
    const plan = buildParticipantEntryPlan({
      eventName: '酒馆夜斗',
      eventData: {
        ...eventData,
        事件地点: '大宋/临安府/牛家村/曲三酒馆',
        参与人物: ['郭靖'],
      },
      source: PARTICIPANT_ENTRY_SOURCE.TIME,
      currentTime,
      characters: { 郭靖: { 所在位置: '大宋/临安府/牛家村/村西树林' } },
      occupancy: {},
    });

    expect(plan.locationUpdates.郭靖).toEqual({ 所在位置: '大宋/临安府/牛家村/曲三酒馆' });
    expect(plan.occupancyInserts.郭靖).toMatchObject({
      事件名: '酒馆夜斗',
      地点: '大宋/临安府/牛家村',
    });
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

describe('player participation ending snapshot', () => {
  it('loads default ending diffs into the editable participation entry', () => {
    const sourceEvent = {
      触发条件: { 年: 1219, 月: 10, 日: 20, 时: 13 },
      事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
      事件详情: '郭靖在张家口初遇黄蓉。',
      事件概要: '郭靖结识黄蓉并请她吃饭，两人由此建立初步情谊。',
      insert: {
        郭靖: { 人物经历: { '射雕第七回02-初遇黄蓉': '请黄蓉吃饭。' } },
      },
      update: {
        黄蓉: { 所在位置: '大宋/张家口' },
      },
    };

    const entry = buildPlayerParticipationEntry('射雕第七回02-初遇黄蓉', sourceEvent, {
      年: 1219,
      月: 10,
      日: 20,
      时: 13,
    });

    expect(entry).toEqual({
      描述: '1219年10月20日13时 到 1219年10月20日15时，郭靖在张家口初遇黄蓉。',
      结局: '郭靖结识黄蓉并请她吃饭，两人由此建立初步情谊。',
      insert: {
        郭靖: { 人物经历: { '射雕第七回02-初遇黄蓉': '请黄蓉吃饭。' } },
      },
      update: {
        黄蓉: { 所在位置: '大宋/张家口' },
      },
      delete: {},
    });

    entry.insert.郭靖.人物经历['射雕第七回02-初遇黄蓉'] = '已修改';
    expect(sourceEvent.insert.郭靖.人物经历['射雕第七回02-初遇黄蓉']).toBe('请黄蓉吃饭。');
  });

  it('rejects task-progress shaped participation entries for cleanup', () => {
    const participation = {
      '射雕第七回02-初遇黄蓉': {
        描述: '事件描述',
        结局: '',
        insert: {},
        update: {},
        delete: {},
      },
      MQ__DOT__Ⅰ_金国初遇: {
        事件名称: '金国初遇',
        当前进度: '郭靖请客点菜',
        描述: '旧任务进度对象',
      },
    };

    expect(isParticipationEntry(participation['射雕第七回02-初遇黄蓉'])).toBe(true);
    expect(isParticipationEntry(participation.MQ__DOT__Ⅰ_金国初遇)).toBe(false);
    expect(buildInvalidParticipationDeletePatch(participation)).toEqual({
      MQ__DOT__Ⅰ_金国初遇: {},
    });
  });
});
