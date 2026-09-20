import { describe, expect, it } from 'vitest';

import { parseEditLog } from './data';

describe('parseEditLog compatibility', () => {
  it('accepts both legacy JSON strings and native arrays', () => {
    const entries = [{ op: 'update', path: '世界信息.时间.时', value_old: 1, value_new: 2 }];

    expect(parseEditLog(JSON.stringify(entries))).toEqual(entries);
    expect(parseEditLog(entries)).toEqual(entries);
  });
});
