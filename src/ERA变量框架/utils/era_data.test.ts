import { describe, expect, it } from 'vitest';

import {
  ERA_STRING_VALUE_ENCODING_VERSION,
  migrateLegacyEraStringValueStorageInPlace,
} from './era_data';

describe('ERA legacy string-value storage migration', () => {
  it('migrates stat_data values and EditLog values while preserving keys and paths', () => {
    const chatVars = {
      ERAMetaData: {
        EditLogs: {
          mk1: [
            {
              op: 'update',
              path: 'user数据.人物经历.条目__DOT__1',
              value_old: '(1201__DOT__04__DOT__01) 旧值',
              value_new: '(1201__DOT__04__DOT__02) 新值',
            },
          ],
        },
      },
      stat_data: {
        user数据: {
          人物经历: {
            条目__DOT__1: '(1201__DOT__04__DOT__02) 新值',
          },
        },
      },
    };

    expect(migrateLegacyEraStringValueStorageInPlace(chatVars)).toBe(true);
    expect(chatVars.stat_data.user数据.人物经历).toEqual({
      条目__DOT__1: '(1201.04.02) 新值',
    });
    expect(chatVars.ERAMetaData.EditLogs.mk1[0]).toEqual({
      op: 'update',
      path: 'user数据.人物经历.条目__DOT__1',
      value_old: '(1201.04.01) 旧值',
      value_new: '(1201.04.02) 新值',
    });
    expect((chatVars.ERAMetaData as Record<string, unknown>).StringValueEncodingVersion).toBe(
      ERA_STRING_VALUE_ENCODING_VERSION,
    );
  });

  it('is idempotent and does not decode new literal encoding tokens after migration', () => {
    const chatVars = {
      ERAMetaData: {
        StringValueEncodingVersion: ERA_STRING_VALUE_ENCODING_VERSION,
        EditLogs: {},
      },
      stat_data: {
        literal: '__DOT__',
      },
    };

    expect(migrateLegacyEraStringValueStorageInPlace(chatVars)).toBe(false);
    expect(chatVars.stat_data.literal).toBe('__DOT__');
  });
});
