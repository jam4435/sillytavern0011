import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadEventDefinitionsFromWorldbook } from './era-event-loader.js';
import { buildEventRuntimeStateResetPlan, needsEventRuntimeStateReset } from './era-runtime-state.js';
import {
  EVENT_KIND,
  EVENT_RUNTIME_KEY_VERSION,
  attachEventMetadata,
  deriveEventRuntimeDescriptor,
  getEventMetadata,
  getEventParticipationKeys,
  isDebutEvent,
  normalizeOrdinaryEventReference,
} from './era-utils.js';

const ordinaryEvent = {
  事件地点: '大宋/张家口/大酒店',
  事件引子: '张家口近日来了两位显眼的少年男女。',
  事件概要: '郭靖与黄蓉在张家口初遇。',
  参与人物: ['郭靖', '黄蓉'],
  触发条件: { 类型: '时间', 年: 1219, 月: 10, 日: 20 },
};

describe('canonical event runtime keys', () => {
  it('derives ordinary and debut keys from physical worldbook entry names', () => {
    expect(deriveEventRuntimeDescriptor('射雕事件条目-第7回-02-初遇黄蓉.yaml')).toMatchObject({
      runtimeKey: '射雕第7回02-初遇黄蓉',
      kind: EVENT_KIND.ORDINARY,
      series: '射雕',
    });
    expect(deriveEventRuntimeDescriptor('射雕登场事件-第7回人物')).toMatchObject({
      runtimeKey: '射雕第7回-人物登场',
      kind: EVENT_KIND.DEBUT,
      series: '射雕',
    });
  });

  it('normalizes short follow-up and biography references without changing unrelated labels', () => {
    expect(normalizeOrdinaryEventReference('第7回-02-初遇黄蓉', '射雕第7回01-宝马风波')).toBe(
      '射雕第7回02-初遇黄蓉',
    );
    expect(normalizeOrdinaryEventReference('第7回02-初遇黄蓉', '射雕第7回01-宝马风波')).toBe(
      '射雕第7回02-初遇黄蓉',
    );
    expect(normalizeOrdinaryEventReference('射雕事件条目-第7回-02-初遇黄蓉.json')).toBe(
      '射雕第7回02-初遇黄蓉',
    );
    expect(normalizeOrdinaryEventReference('事件条目-第7回-02-初遇黄蓉', '射雕第7回01-宝马风波')).toBe(
      '射雕第7回02-初遇黄蓉',
    );
    expect(normalizeOrdinaryEventReference('原结局', '射雕第7回02-初遇黄蓉')).toBe('原结局');
    expect(getEventParticipationKeys('射雕第7回02-初遇黄蓉')).toEqual(['射雕第7回02-初遇黄蓉']);
  });

  it('classifies debut events from attached metadata instead of their key text', () => {
    const descriptor = deriveEventRuntimeDescriptor('射雕登场事件-第7回人物');
    const eventData = attachEventMetadata({ insert: {} }, descriptor);

    expect(isDebutEvent(eventData)).toBe(true);
    expect(getEventMetadata(eventData)).toMatchObject({ kind: EVENT_KIND.DEBUT });
    expect(isDebutEvent({ 事件类型: '登场事件' })).toBe(false);
  });
});

describe('worldbook event loader', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      getCharWorldbookNames: vi.fn(async () => ({ primary: '测试世界书', additional: [] })),
      getWorldbook: vi.fn(async () => [
        {
          uid: 1,
          name: '射雕事件条目-第7回-02-初遇黄蓉',
          content: JSON.stringify(ordinaryEvent),
        },
        {
          uid: 2,
          name: '射雕登场事件-第7回人物',
          content: JSON.stringify({ 事件类型: '登场事件', 触发条件: ordinaryEvent.触发条件, insert: {} }),
        },
      ]),
      toastr: { error: vi.fn() },
    });
  });

  it('keys definitions by the derived runtime key and retains explicit kind metadata', async () => {
    const definitions = await loadEventDefinitionsFromWorldbook();

    expect(Object.keys(definitions)).toEqual(['射雕第7回02-初遇黄蓉', '射雕第7回-人物登场']);
    expect(getEventMetadata(definitions['射雕第7回02-初遇黄蓉'])).toMatchObject({
      kind: EVENT_KIND.ORDINARY,
      sourceName: '射雕事件条目-第7回-02-初遇黄蓉',
    });
    expect(isDebutEvent(definitions['射雕第7回-人物登场'])).toBe(true);
  });
});

describe('legacy event state reset', () => {
  it('clears every old event-key surface and preserves unrelated frontend variables', () => {
    const statData = {
      事件系统: {
        未发生事件: { 旧事件: {} },
        进行中事件: {},
        已完成事件: {},
        人物事件占用: { 郭靖: { 事件名: '旧事件' } },
        $meta: { necessary: 'self' },
      },
      参与事件: { 旧事件: {} },
      世界事件: { 旧事件: {} },
      附近传闻: { 旧事件: '传闻' },
      后续事件线索: { 旧事件: '线索' },
      后续事件线索计数: { 旧事件: 3 },
      前端变量: { 事件结局状态: { 旧事件: '未知' }, 其他前端状态: 1 },
      角色数据: { 郭靖: { 人物经历: { 旧事件: '经历' }, 状态: '健康' }, 黄蓉: { 状态: '健康' } },
    };

    expect(needsEventRuntimeStateReset(statData)).toBe(true);
    const plan = buildEventRuntimeStateResetPlan(statData);
    expect(plan.assignPayload).toMatchObject({
      事件系统: { 未发生事件: {}, 进行中事件: {}, 已完成事件: {}, 人物事件占用: {} },
      参与事件: {},
      世界事件: {},
      附近传闻: {},
      后续事件线索: {},
      后续事件线索计数: {},
      前端变量: { 事件结局状态: {}, 事件运行时键版本: EVENT_RUNTIME_KEY_VERSION, 其他前端状态: 1 },
    });
    expect(plan.experienceDeletePayload).toEqual({ 角色数据: { 郭靖: { 人物经历: {} } } });
  });
});
