/**
 * @file ERA 变量框架 - 主入口与事件监听模块
 * @description
 * 该文件是整个 ERA 变量框架的起点。它的职责非常清晰和专一：
 * 1. **定义监听范围**: 声明框架所关心的所有事件类型。
 * 2. **注册监听器**: 为上述所有事件注册监听器。
 * 3. **统一派发**: 当任何一个被监听的事件触发时，它不进行任何逻辑处理，
 *    而是立即将该事件（包括事件类型和附带数据）原封不动地推入到 `event_queue.ts`
 *    中的事件处理队列中。
 *
 * 这种设计体现了良好的**关注点分离**原则：`index.ts` 只负责“听”，而 `event_queue.ts`
 * 负责“思考”和“行动”。这使得事件的来源和处理逻辑完全解耦，非常清晰且易于维护。
 */

'use strict';

import { EVENT_GROUPS } from './events/merger';
import { pushToQueue } from './events/queue';
import { consumeInternalMessageUpdatedEvent } from '../shared/internalMessageUpdateGuard';
import { ensureEraStringValueEncodingV2 } from './utils/era_data';

// 导入查询模块, 以注册 {{ERA:...}} 宏
import './api/macro/parser';

// ===============================
// 事件监听器注册
// ===============================

/**
 * @const {string[]} eventsToListen
 * @description 定义了所有需要被 ERA 框架监听的事件。
 */
const eventsToListen = [
  ...EVENT_GROUPS.WRITE,
  ...EVENT_GROUPS.SYNC,
  ...EVENT_GROUPS.API,
  ...EVENT_GROUPS.UPDATE_MK_ONLY,
  ...EVENT_GROUPS.COLLISION_DETECTORS,
  ...EVENT_GROUPS.COMBO_STARTERS,
];

// 遍历事件列表，为每个事件注册一个回调函数。
// 这个回调函数是所有事件的统一入口。
eventsToListen.forEach(ev => {
  // 当前聊天首次加载或切换聊天时，先完成旧字符串值编码迁移，再进入正常 ERA 队列。
  if (ev === tavern_events.APP_READY || ev === tavern_events.CHAT_CHANGED) {
    eventOn(ev, (detail: any) => {
      void ensureEraStringValueEncodingV2()
        .catch(error => console.error('[ERA] 字符串值编码迁移失败，将继续正常事件处理。', error))
        .finally(() => pushToQueue(ev, detail));
    });
    return;
  }

  // `eventOn` 是酒馆助手提供的全局函数，用于注册事件监听。
  // 当事件 `ev` 触发时，回调函数被调用，并将事件类型 `ev` 和事件详情 `detail` 推入队列。
  eventOn(ev, (detail: any) => pushToQueue(ev, detail));
});

// 某些宿主恢复 iframe 时 APP_READY 可能已经发生；DOM ready 后再做一次幂等兜底。
$(() => {
  void ensureEraStringValueEncodingV2().catch(error =>
    console.error('[ERA] 启动时字符串值编码迁移失败。', error),
  );
});

// 为酒馆助手脚本界面中的手动按钮注册监听器。
// 点击按钮时，同样是向队列中推入一个特定类型的事件。
eventOn(getButtonEvent('写入变量修改'), () => pushToQueue('manual_write'));
eventOn(getButtonEvent('手动同步状态'), () => pushToQueue('manual_sync'));
eventOn(getButtonEvent('强制完全重算'), () => pushToQueue('manual_full_sync'));
