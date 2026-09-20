import { describe, expect, it } from 'vitest';

import { DEFAULT_GAME_STATE } from './useGameState';

describe('DEFAULT_GAME_STATE', () => {
  it('使用当前中文属性键，避免真实存档读取失败时人物页只剩空标签', () => {
    expect(DEFAULT_GAME_STATE.stats.initialAttributes).toEqual({
      臂力: 10,
      根骨: 10,
      机敏: 10,
      悟性: 10,
      洞察: 10,
      风姿: 10,
      福缘: 0,
    });
    expect(DEFAULT_GAME_STATE.stats.attributes).toEqual({
      hp: 100,
      mp: 50,
      hpCurrent: 100,
      mpCurrent: 50,
      臂力: 10,
      根骨: 10,
      机敏: 10,
      洞察: 10,
    });
  });
});
