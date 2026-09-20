import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VariableChangeBar from './VariableChangeBar';
import type {
  VariableActualChange,
  VariableAiComparison,
  VariableChangeSummary,
  VariableComparisonStatus,
} from '../utils/variableChanges';

const createComparison = ({
  path,
  baselineValue,
  expectedValue,
  finalValue = expectedValue,
  status = 'applied',
  observedChange,
}: {
  path: Array<string | number>;
  baselineValue: unknown;
  expectedValue: unknown;
  finalValue?: unknown;
  status?: VariableComparisonStatus;
  observedChange?: VariableActualChange;
}): VariableAiComparison => {
  const displayPath = `stat_data › ${path.join(' › ')}`;
  const copyPath = `stat_data.${path.join('.')}`;
  const declaredChange = {
    id: `declared-${JSON.stringify(path)}`,
    source: 'ai-declared' as const,
    action: 'edit' as const,
    path,
    displayPath,
    copyPath,
    value: expectedValue,
    valuePreview: String(expectedValue),
    blockTag: 'VariableEdit' as const,
  };

  return {
    id: `comparison-${JSON.stringify(path)}`,
    status,
    action: 'edit',
    path,
    displayPath,
    copyPath,
    declaredChange,
    observedChange,
    baselineValue,
    expectedValue,
    finalValue,
    baselinePreview: String(baselineValue),
    expectedPreview: String(expectedValue),
    finalPreview: String(finalValue),
  };
};

const createBackgroundChange = ({
  path,
  beforeValue,
  afterValue,
  id,
}: {
  path: Array<string | number>;
  beforeValue: unknown;
  afterValue: unknown;
  id: string;
}): VariableActualChange => ({
  id,
  source: 'observed-diff',
  origin: 'background',
  producer: 'event-script',
  action: 'edit',
  path,
  displayPath: `stat_data › ${path.join(' › ')}`,
  copyPath: `stat_data.${path.join('.')}`,
  beforeValue,
  afterValue,
  beforePreview: String(beforeValue),
  afterPreview: String(afterValue),
  timestamp: 1000,
  batchId: 'background-time',
  actions: null,
  reason: 'event-time-update',
});

const createSummary = ({
  comparisons = [],
  backgroundChanges = [],
}: {
  comparisons?: VariableAiComparison[];
  backgroundChanges?: VariableActualChange[];
} = {}): VariableChangeSummary => ({
  turnId: 1,
  status: 'settled',
  startedAt: 0,
  updatedAt: 0,
  thoughts: [],
  parseErrors: [],
  topLevelGroups: [],
  aiReply: {
    declaredChanges: comparisons.flatMap(comparison =>
      comparison.declaredChange ? [comparison.declaredChange] : []),
    observedChanges: comparisons.flatMap(comparison =>
      comparison.observedChange ? [comparison.observedChange] : []),
    comparisons,
    omittedDeclaredCount: 0,
    omittedObservedCount: 0,
    omittedComparisonCount: 0,
  },
  background: {
    observedChanges: backgroundChanges,
    omittedObservedCount: 0,
  },
  batches: [],
  declaredChanges: comparisons.flatMap(comparison =>
    comparison.declaredChange ? [comparison.declaredChange] : []),
  actualChanges: [
    ...comparisons.flatMap(comparison =>
      comparison.observedChange ? [comparison.observedChange] : []),
    ...backgroundChanges,
  ],
  omittedDeclaredCount: 0,
  omittedActualCount: 0,
});

describe('VariableChangeBar', () => {
  it('正常落地时只强调修改前后值，不重复显示相同的 AI 声明值', () => {
    const comparison = createComparison({
      path: ['user数据', '修为'],
      baselineValue: 100,
      expectedValue: 120,
    });

    render(<VariableChangeBar summary={createSummary({ comparisons: [comparison] })} />);

    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('AI回复1项');

    fireEvent.click(aiButton);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.queryByText('AI 声明：120')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制路径' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制值' })).not.toBeInTheDocument();
  });

  it('异常时显示实际结果，并额外保留 AI 声明用于解释偏差', () => {
    const comparison = createComparison({
      path: ['user数据', '修为'],
      baselineValue: 100,
      expectedValue: 120,
      finalValue: 110,
      status: 'diverged',
    });

    render(<VariableChangeBar summary={createSummary({ comparisons: [comparison] })} />);

    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('1项 · 1异常');

    fireEvent.click(aiButton);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('AI 声明：120')).toBeInTheDocument();
    expect(screen.getByText('值不一致')).toBeInTheDocument();
  });

  it('no-op 声明默认不单列', () => {
    const comparison = createComparison({
      path: ['user数据', '修为'],
      baselineValue: 120,
      expectedValue: 120,
      finalValue: 120,
      status: 'no-op',
    });

    render(<VariableChangeBar summary={createSummary({ comparisons: [comparison] })} />);

    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('AI回复0项');

    fireEvent.click(aiButton);
    expect(screen.getByText('本轮 AI 声明均未产生净变化。')).toBeInTheDocument();
    expect(screen.queryByText('stat_data › user数据 › 修为')).not.toBeInTheDocument();
  });

  it('年月日时声明聚合成一条完整时间变化，并忽略其中没有变化的年月', () => {
    const comparisons = [
      createComparison({
        path: ['世界信息', '时间', '年'],
        baselineValue: 1201,
        expectedValue: 1201,
        finalValue: 1201,
        status: 'no-op',
      }),
      createComparison({
        path: ['世界信息', '时间', '月'],
        baselineValue: 3,
        expectedValue: 3,
        finalValue: 3,
        status: 'no-op',
      }),
      createComparison({
        path: ['世界信息', '时间', '日'],
        baselineValue: 12,
        expectedValue: 13,
        finalValue: 13,
        status: 'applied',
      }),
      createComparison({
        path: ['世界信息', '时间', '时'],
        baselineValue: 23,
        expectedValue: 0,
        finalValue: 0,
        status: 'applied',
      }),
    ];

    render(<VariableChangeBar summary={createSummary({ comparisons })} />);

    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('AI回复1项');

    fireEvent.click(aiButton);
    expect(screen.getByText('时间')).toBeInTheDocument();
    expect(screen.getByText('1201年3月12日23时')).toBeInTheDocument();
    expect(screen.getByText('1201年3月13日0时')).toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 年')).not.toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 月')).not.toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 日')).not.toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 时')).not.toBeInTheDocument();
  });

  it('整组时间都没有净变化时不显示时间行', () => {
    const comparisons = ['年', '月', '日', '时'].map((field, index) =>
      createComparison({
        path: ['世界信息', '时间', field],
        baselineValue: [1201, 3, 12, 10][index],
        expectedValue: [1201, 3, 12, 10][index],
        finalValue: [1201, 3, 12, 10][index],
        status: 'no-op',
      }),
    );

    render(<VariableChangeBar summary={createSummary({ comparisons })} />);
    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('AI回复0项');

    fireEvent.click(aiButton);
    expect(screen.queryByText('时间')).not.toBeInTheDocument();
    expect(screen.getByText('本轮 AI 声明均未产生净变化。')).toBeInTheDocument();
  });

  it('后台年月日时变化也合并成一个逻辑时间项', () => {
    const backgroundChanges = [
      createBackgroundChange({
        id: 'day',
        path: ['世界信息', '时间', '日'],
        beforeValue: 12,
        afterValue: 13,
      }),
      createBackgroundChange({
        id: 'hour',
        path: ['世界信息', '时间', '时'],
        beforeValue: 23,
        afterValue: 0,
      }),
    ];

    render(<VariableChangeBar summary={createSummary({ backgroundChanges })} />);

    const backgroundButton = screen.getByRole('button', { name: /后台变更/ });
    expect(backgroundButton).toHaveTextContent('后台变更1项');

    fireEvent.click(backgroundButton);
    const row = screen.getByText('时间').closest('.variable-change-row');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('12日23时')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('13日0时')).toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 日')).not.toBeInTheDocument();
    expect(screen.queryByText('stat_data › 世界信息 › 时间 › 时')).not.toBeInTheDocument();
  });
});
