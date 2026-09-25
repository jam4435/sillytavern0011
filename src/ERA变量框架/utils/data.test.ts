import { describe, expect, it } from 'vitest';

import {
  escapeEraData,
  parseEditLog,
  unescapeEraData,
  unescapeLegacyEraEditLogValues,
  unescapeLegacyEraStringValues,
} from './data';

describe('parseEditLog compatibility', () => {
  it('accepts both legacy JSON strings and native arrays', () => {
    const entries = [{ op: 'update', path: '世界信息.时间.时', value_old: 1, value_new: 2 }];

    expect(parseEditLog(JSON.stringify(entries))).toEqual(entries);
    expect(parseEditLog(entries)).toEqual(entries);
  });
});


describe('ERA key-only escaping', () => {
  it('escapes object keys but preserves ordinary string values', () => {
    const value = '(1201.04.02) version 1.2.3, "quoted", \'single\'';
    const escaped = escapeEraData({ '经历.记录': { '条目"一': value, literal: '__DOT__' } });

    expect(escaped).toEqual({
      经历__DOT__记录: {
        条目__DQUOTE__一: value,
        literal: '__DOT__',
      },
    });
    expect(unescapeEraData(escaped)).toEqual({ '经历.记录': { '条目"一': value, literal: '__DOT__' } });
  });
});

describe('legacy ERA string-value migration helpers', () => {
  it('decodes legacy string values without changing encoded object keys', () => {
    const legacy = {
      经历__DOT__记录: {
        value: '(1201__DOT__04__DOT__02) 说__DQUOTE__书__DQUOTE__',
      },
    };

    expect(unescapeLegacyEraStringValues(legacy)).toEqual({
      经历__DOT__记录: {
        value: '(1201.04.02) 说"书"',
      },
    });
  });

  it('migrates only EditLog values and keeps internal paths escaped', () => {
    const migrated = unescapeLegacyEraEditLogValues([
      {
        op: 'update',
        path: 'user数据.人物经历.条目__DOT__1',
        value_old: '(1201__DOT__04__DOT__01) 旧值',
        value_new: '(1201__DOT__04__DOT__02) 新值',
      },
    ]);

    expect(migrated).toEqual([
      {
        op: 'update',
        path: 'user数据.人物经历.条目__DOT__1',
        value_old: '(1201.04.01) 旧值',
        value_new: '(1201.04.02) 新值',
      },
    ]);
  });
});
