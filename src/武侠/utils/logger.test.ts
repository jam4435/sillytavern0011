import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createForcedLogger, variableBarLogger, variableTraceLogger } from './logger';

describe('武侠前端变量追踪日志开关', () => {
  beforeEach(() => {
    localStorage.removeItem('wuxia_variable_trace_debug');
    localStorage.removeItem('wuxia_variable_bar_debug');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.removeItem('wuxia_variable_trace_debug');
    localStorage.removeItem('wuxia_variable_bar_debug');
    vi.restoreAllMocks();
  });

  it('默认屏蔽变量追踪及变量条的普通输出和分组', () => {
    variableTraceLogger.log('era:writeDone');
    variableBarLogger.log('summary');
    variableBarLogger.group('render');
    variableBarLogger.groupEnd();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.group).not.toHaveBeenCalled();
    expect(console.groupEnd).not.toHaveBeenCalled();
  });

  it('运行时打开与关闭追踪开关，无需重建 logger', () => {
    variableTraceLogger.log('hidden');
    localStorage.setItem('wuxia_variable_trace_debug', '1');
    variableTraceLogger.log('visible');
    variableBarLogger.log('bar hidden');
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[wuxia-variable-trace]'), 'visible');

    localStorage.removeItem('wuxia_variable_trace_debug');
    variableTraceLogger.log('hidden again');
    expect(console.log).toHaveBeenCalledTimes(1);

    localStorage.setItem('wuxia_variable_bar_debug', '1');
    variableBarLogger.group('render');
    variableBarLogger.log('summary');
    variableBarLogger.groupEnd();
    expect(console.group).toHaveBeenCalledTimes(1);
    expect(console.groupEnd).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(2);
  });

  it('默认静默不影响真正的警告及错误', () => {
    variableTraceLogger.warn('write mismatch');
    variableTraceLogger.error('unreadable stat_data');
    variableBarLogger.warn('unexpected state');
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('保留未传入开关的强制日志器行为', () => {
    const logger = createForcedLogger('[other]');
    logger.log('existing behavior');
    expect(console.log).toHaveBeenCalledTimes(1);
  });
});
