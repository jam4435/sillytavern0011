import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveChatVariableLeafChanges } from './variableEditorState';

const getVariablesMock = vi.mocked(globalThis.getVariables);
const updateVariablesWithMock = vi.mocked(globalThis.updateVariablesWith);

describe('variable editor ERA escape boundary', () => {
  beforeEach(() => {
    getVariablesMock.mockReset();
    updateVariablesWithMock.mockReset();
  });

  it('在反转义投影上保存，并且只在写回 stat_data 时重新转义', async () => {
    const rawVariables = {
      stat_data: {
        世界信息: {
          '别名__DOT__键': '如__SQUOTE__白虹经天__SQUOTE__。',
        },
      },
    };
    getVariablesMock.mockReturnValue(rawVariables);
    updateVariablesWithMock.mockImplementation(updater => updater(rawVariables));

    const result = await saveChatVariableLeafChanges([
      {
        path: ['世界信息', '别名.键'],
        beforeValue: "如'白虹经天'。",
        nextValue: "改为'玉女素心剑法'。",
      },
    ]);

    expect(updateVariablesWithMock).toHaveBeenCalledTimes(1);
    const writtenVariables = updateVariablesWithMock.mock.results[0]?.value as typeof rawVariables;
    expect(writtenVariables.stat_data).toEqual({
      世界信息: {
        '别名__DOT__键': '改为__SQUOTE__玉女素心剑法__SQUOTE__。',
      },
    });
    expect(result.statData).toEqual({
      世界信息: {
        '别名.键': "改为'玉女素心剑法'。",
      },
    });
  });
});
