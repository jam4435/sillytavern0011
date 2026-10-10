import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isDebugEnabled, isTimeDebugEnabled, log, logError, logTime, logWarning } from './era-utils.js';

describe('event script console switches', () => {
  beforeEach(() => {
    localStorage.removeItem('era_event_debug');
    localStorage.removeItem('era_event_time_debug');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.removeItem('era_event_debug');
    localStorage.removeItem('era_event_time_debug');
    vi.restoreAllMocks();
  });

  it('is silent by default for routine and time debugging', () => {
    expect(isDebugEnabled()).toBe(false);
    expect(isTimeDebugEnabled()).toBe(false);
    log('normal wait');
    logTime('time comparison');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('can independently enable event and time debugging without reload', () => {
    localStorage.setItem('era_event_debug', '1');
    expect(isDebugEnabled()).toBe(true);
    log('event');
    logTime('time still hidden');
    expect(console.log).toHaveBeenCalledTimes(1);

    localStorage.setItem('era_event_time_debug', '1');
    logTime('time now visible');
    expect(console.log).toHaveBeenCalledTimes(2);
  });

  it('always retains genuine warnings and errors', () => {
    logWarning('settlement not confirmed');
    logError('initialization failed');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
