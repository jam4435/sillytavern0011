import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readEraDiagnostics, recordEraDiagnostic } from './diagnostics';
import { LOG_CONFIG, Logger } from './log';

describe('ERA console log levels', () => {
  const logger = new Logger('events-queue');

  beforeEach(() => {
    localStorage.removeItem('era_log_level');
    LOG_CONFIG.currentLevel = LOG_CONFIG.levels.warn;
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.removeItem('era_log_level');
    vi.restoreAllMocks();
  });

  it('defaults to warnings and errors, without routine logs', () => {
    logger.debug('test', 'debug');
    logger.log('test', 'routine');
    logger.warn('test', 'warning');
    logger.error('test', 'error');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('honors changes to the runtime level without reload', () => {
    localStorage.setItem('era_log_level', 'log');
    logger.log('test', 'visible');
    logger.debug('test', 'hidden');
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.debug).not.toHaveBeenCalled();

    localStorage.setItem('era_log_level', 'debug');
    logger.debug('test', 'now visible');
    expect(console.debug).toHaveBeenCalledTimes(1);

    localStorage.setItem('era_log_level', 'warn');
    logger.log('test', 'hidden again');
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('falls back to warnings for invalid storage values', () => {
    localStorage.setItem('era_log_level', 'invalid');
    logger.log('test', 'hidden');
    logger.warn('test', 'visible');
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('constructs expensive debug arguments only when enabled', () => {
    const buildMessage = vi.fn(() => 'serialized');
    const buildObject = vi.fn(() => ({ large: 'snapshot' }));

    logger.debug('test', buildMessage, buildObject);
    expect(buildMessage).not.toHaveBeenCalled();
    expect(buildObject).not.toHaveBeenCalled();

    localStorage.setItem('era_log_level', 'debug');
    logger.debug('test', buildMessage, buildObject);
    expect(buildMessage).toHaveBeenCalledTimes(1);
    expect(buildObject).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('serialized'), { large: 'snapshot' });
  });

  it('does not suppress persistent diagnostics when console output is quiet', () => {
    logger.debug('test', 'suppressed');
    recordEraDiagnostic('log-level-test', 'console-filter-independence', { preserved: true });
    expect(console.debug).not.toHaveBeenCalled();
    expect(readEraDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'log-level-test',
          event: 'console-filter-independence',
          details: { preserved: true },
        }),
      ]),
    );
  });
});
