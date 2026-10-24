/** Enforce one model request and a bounded output for task-local extraction. */
import { appendFileSync } from 'node:fs';

export const name = 'wuxia-bounded-call';

/** Install reversible request guards for this one-shot dsh process. */
export function apply(ctx, config) {
  if (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0) {
    throw new Error('bounded-call requires a positive maxTokens');
  }
  ctx.on('agent/pre-step', async (payload, next) => {
    if (payload.step > 1) throw new Error('one-shot extraction forbids a second model step');
    return next();
  });
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(), maxTokens: config.maxTokens,
  }));
  ctx.on('session/event', (session, event) => {
    let data;
    if (event.type === 'request/header') data = { config: event.data.header.config,
      toolCount: event.data.header.tools.length };
    else if (event.type === 'assistant/message') data = { usage: event.data.usage };
    else if (event.type === 'turn/end') data = { reason: event.data.reason };
    else if (event.type !== 'step/start') return;
    appendFileSync(config.eventLog, JSON.stringify({ sessionId: session.id,
      type: event.type, seq: event.seq, time: event.time, data }) + '\n');
  });
}
