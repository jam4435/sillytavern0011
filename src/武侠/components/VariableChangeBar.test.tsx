import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VariableChangeBar from './VariableChangeBar';
import type { VariableAiComparison, VariableChangeSummary } from '../utils/variableChanges';

const createAppliedComparison = (index: number): VariableAiComparison => {
  const path = ['user数据', `属性${index}`];
  const declaredChange = {
    id: `declared-${index}`,
    source: 'ai-declared' as const,
    action: 'edit' as const,
    path,
    displayPath: `stat_data › ${path.join(' › ')}`,
    copyPath: `stat_data.user数据.属性${index}`,
    value: index,
    valuePreview: String(index),
    blockTag: 'VariableEdit' as const,
  };

  return {
    id: `comparison-${index}`,
    status: 'applied',
    action: 'edit',
    path,
    displayPath: declaredChange.displayPath,
    copyPath: declaredChange.copyPath,
    declaredChange,
    baselineValue: 0,
    expectedValue: index,
    finalValue: index,
    baselinePreview: '0',
    expectedPreview: String(index),
    finalPreview: String(index),
  };
};

describe('VariableChangeBar', () => {
  it('uses final applied comparisons for the AI actual count', () => {
    const comparisons = Array.from({ length: 8 }, (_, index) => createAppliedComparison(index));
    const summary: VariableChangeSummary = {
      turnId: 1,
      status: 'settled',
      startedAt: 0,
      updatedAt: 0,
      thoughts: [],
      parseErrors: [],
      topLevelGroups: [],
      aiReply: {
        declaredChanges: comparisons.map(comparison => comparison.declaredChange!),
        observedChanges: [],
        comparisons,
        omittedDeclaredCount: 0,
        omittedObservedCount: 0,
        omittedComparisonCount: 0,
      },
      background: {
        observedChanges: [],
        omittedObservedCount: 0,
      },
      batches: [],
      declaredChanges: comparisons.map(comparison => comparison.declaredChange!),
      actualChanges: [],
      omittedDeclaredCount: 0,
      omittedActualCount: 0,
    };

    render(<VariableChangeBar summary={summary} />);

    const aiButton = screen.getByRole('button', { name: /AI回复/ });
    expect(aiButton).toHaveTextContent('AI回复声8/实8');

    fireEvent.click(aiButton);
    expect(screen.getByText('声8 / 实8')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制路径' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制值' })).not.toBeInTheDocument();
  });
});
