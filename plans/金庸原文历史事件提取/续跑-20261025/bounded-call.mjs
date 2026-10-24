/** Enforce one model request and a bounded output for task-local extraction. */
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
}
