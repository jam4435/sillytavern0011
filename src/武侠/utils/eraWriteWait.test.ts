import { describe, expect, it } from 'vitest';
import { observeEraWriteDone } from './eraWriteWait';

describe('observeEraWriteDone', () => {
  it('可以消费 waitForMessageId 之前已经到达的匹配信号', async () => {
    const observer = observeEraWriteDone({ expectedAction: 'resync' });
    try {
      await eventEmit('era:writeDone', {
        message_id: 17,
        actions: { resync: true },
      });

      await expect(observer.waitForMessageId(17, {
        timeoutMessage: '不应超时',
      })).resolves.toMatchObject({
        message_id: 17,
        actions: { resync: true },
      });
    } finally {
      observer.stop();
    }
  });

  it('忽略错误 action 和 message_id，只接受目标 assistant 楼层', async () => {
    const observer = observeEraWriteDone({ expectedAction: 'resync' });
    try {
      const wait = observer.waitForMessageId(23, {
        timeoutMs: 1000,
        timeoutMessage: '等待目标楼层超时',
      });

      await eventEmit('era:writeDone', {
        message_id: 23,
        actions: { apiWrite: true },
      });
      await eventEmit('era:writeDone', {
        message_id: 22,
        actions: { resync: true },
      });
      await eventEmit('era:writeDone', {
        message_id: 23,
        actions: { resync: true },
      });

      await expect(wait).resolves.toMatchObject({
        message_id: 23,
        actions: { resync: true },
      });
    } finally {
      observer.stop();
    }
  });

  it('停止观察时会拒绝仍在等待的提交', async () => {
    const observer = observeEraWriteDone({ expectedAction: 'resync' });
    const wait = observer.waitForMessageId(31, {
      timeoutMs: 1000,
      timeoutMessage: '等待目标楼层超时',
    });

    observer.stop();

    await expect(wait).rejects.toThrow('ERA 写入观察已停止');
  });
});
