import React, { useEffect, useState } from 'react';
import {
  formatVariableDetailValue,
  type VariableActualChange,
  type VariableAiComparison,
  type VariableChangeAction,
  type VariableChangeProducer,
  type VariableChangeSummary,
  type VariableComparisonStatus,
} from '../utils/variableChanges';
import { Icons } from './Icons';
import { variableBarLogger } from '../utils/logger';

interface VariableChangeBarProps {
  summary: VariableChangeSummary | null;
}

type ExpandedSegment = 'ai' | 'background';
type SourceTone = VariableChangeProducer;

const ACTION_LABELS: Record<VariableChangeAction, string> = {
  insert: '新增',
  edit: '修改',
  delete: '删除',
};

const COMPARE_STATUS_LABELS: Record<VariableComparisonStatus, string> = {
  applied: '已落地',
  'not-applied': '未落地',
  diverged: '值不一致',
  'no-op': '无净变化',
  'api-only': 'API写入',
};

const getTotalCount = (count: number, omittedCount: number): number => count + omittedCount;

const PRODUCER_META: Record<VariableChangeProducer, { label: string; tone: SourceTone }> = {
  era: { label: 'ERA/API', tone: 'era' },
  'event-script': { label: '事件脚本', tone: 'event-script' },
  'variable-editor': { label: '变量编辑器', tone: 'variable-editor' },
  frontend: { label: '游戏前端', tone: 'frontend' },
  restore: { label: '状态恢复', tone: 'restore' },
  'message-boundary': { label: '消息补偿', tone: 'message-boundary' },
};

const getProducerMeta = (producer: VariableChangeProducer): { label: string; tone: SourceTone } =>
  PRODUCER_META[producer];

const getChangeMetaTitle = (change: VariableActualChange, fallbackLabel: string): string => {
  const actionKeys = Object.keys(change.actions ?? {}).filter(key => change.actions?.[key]);
  const details = [change.reason, actionKeys.length > 0 ? actionKeys.join(', ') : null]
    .filter(Boolean)
    .join(' · ');
  return details || fallbackLabel;
};

const summarizeActions = (actions: VariableActualChange['actions']): string[] =>
  Object.keys(actions ?? {}).filter(action => actions?.[action] === true);

const summarizeAiComparison = (comparison: VariableAiComparison) => ({
  action: comparison.action,
  path: comparison.displayPath,
  status: comparison.status,
  declared: comparison.declaredChange
    ? {
      blockTag: comparison.declaredChange.blockTag,
      value: comparison.declaredChange.valuePreview,
    }
    : null,
  observed: comparison.observedChange
    ? {
      attribution: comparison.observedChange.origin,
      producer: comparison.observedChange.producer,
      before: comparison.observedChange.beforePreview,
      after: comparison.observedChange.afterPreview,
      reason: comparison.observedChange.reason,
      actions: summarizeActions(comparison.observedChange.actions),
      batchId: comparison.observedChange.batchId,
    }
    : null,
  baseline: comparison.baselinePreview,
  expected: comparison.expectedPreview,
  final: comparison.finalPreview,
});

const summarizeActualChange = (change: VariableActualChange) => ({
  action: change.action,
  path: change.displayPath,
  attribution: change.origin,
  producer: change.producer,
  origin: change.origin,
  before: change.beforePreview,
  after: change.afterPreview,
  reason: change.reason,
  actions: summarizeActions(change.actions),
  batchId: change.batchId,
  assistantMessageId: change.assistantMessageId ?? null,
});

const VariableChangeBar: React.FC<VariableChangeBarProps> = ({ summary }) => {
  const [expandedSegment, setExpandedSegment] = useState<ExpandedSegment | null>(null);
  const [lastExpandedSegment, setLastExpandedSegment] = useState<ExpandedSegment>('ai');

  useEffect(() => {
    setExpandedSegment(null);
    setLastExpandedSegment('ai');
  }, [summary?.turnId]);

  useEffect(() => {
    if (!summary) {
      variableBarLogger.log('[VariableChangeBar] 当前没有变量变更摘要');
      return;
    }

    variableBarLogger.group('[VariableChangeBar] 渲染变量变更条');
    variableBarLogger.log('summary', {
      turnId: summary.turnId,
      status: summary.status,
      userMessageId: summary.userMessageId ?? null,
      assistantMessageId: summary.assistantMessageId ?? null,
      thoughts: summary.thoughts.map(thought => thought.preview),
      parseErrors: summary.parseErrors,
      topLevelGroups: summary.topLevelGroups,
      declaredCount: summary.aiReply.declaredChanges.length,
      aiObservedCount: summary.aiReply.observedChanges.length,
      backgroundObservedCount: summary.background.observedChanges.length,
      omittedDeclaredCount: summary.aiReply.omittedDeclaredCount,
      omittedAiObservedCount: summary.aiReply.omittedObservedCount,
      omittedBackgroundObservedCount: summary.background.omittedObservedCount,
    });
    variableBarLogger.log('aiComparisons', summary.aiReply.comparisons.map(summarizeAiComparison));
    variableBarLogger.log('backgroundChanges', summary.background.observedChanges.map(summarizeActualChange));
    variableBarLogger.log('batches', summary.batches.map(batch => ({
      batchId: batch.batchId,
      attribution: batch.origin,
      origin: batch.origin,
      producer: batch.producer,
      reason: batch.reason,
      actions: Object.keys(batch.actions ?? {}).filter(action => batch.actions?.[action] === true),
      assistantMessageId: batch.assistantMessageId ?? null,
      changeCount: batch.changeCount,
    })));
    variableBarLogger.groupEnd();
  }, [summary]);

  if (!summary) {
    return null;
  }

  const declaredTotal = getTotalCount(
    summary.aiReply.declaredChanges.length,
    summary.aiReply.omittedDeclaredCount,
  );
  const aiAppliedTotal = summary.aiReply.comparisons.filter(
    comparison => Boolean(comparison.declaredChange) && comparison.status === 'applied',
  ).length;
  const backgroundTotal = getTotalCount(
    summary.background.observedChanges.length,
    summary.background.omittedObservedCount,
  );
  const aiReplyComparisons = summary.aiReply.comparisons.filter(
    comparison => Boolean(comparison.declaredChange),
  );

  const toggleSegment = (segment: ExpandedSegment) => {
    setLastExpandedSegment(segment);
    setExpandedSegment(previous => previous === segment ? null : segment);
  };

  return (
    <div className={`variable-change-bar ${expandedSegment ? 'expanded' : ''}`}>
      <div className="variable-change-summary" role="group" aria-label="变量变更">
        <span className="variable-change-title">
          <Icons.Variables size={15} />
          <span>变量变更</span>
        </span>

        <button
          className={`variable-change-segment ai ${expandedSegment === 'ai' ? 'active' : ''}`}
          type="button"
          onClick={() => toggleSegment('ai')}
          aria-expanded={expandedSegment === 'ai'}
        >
          <span className="variable-change-segment-label">AI回复</span>
          <span className="variable-change-segment-count">声{declaredTotal}/实{aiAppliedTotal}</span>
        </button>

        <button
          className={`variable-change-segment background ${expandedSegment === 'background' ? 'active' : ''}`}
          type="button"
          onClick={() => toggleSegment('background')}
          aria-expanded={expandedSegment === 'background'}
        >
          <span className="variable-change-segment-label">后台变更</span>
          <span className="variable-change-segment-count">{backgroundTotal}</span>
        </button>

        <button
          className="variable-change-chevron"
          type="button"
          onClick={() => setExpandedSegment(previous => previous ? null : lastExpandedSegment)}
          aria-expanded={Boolean(expandedSegment)}
          aria-label={expandedSegment ? '收起变量变更' : '展开变量变更'}
        >
          {expandedSegment ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
        </button>
      </div>

      {expandedSegment && (
        <div className="variable-change-detail">
          {expandedSegment === 'ai' ? (
            <>
              <section className="variable-change-section">
                <div className="variable-change-section-heading">
                  <span>AI回复变量</span>
                  <span>声{declaredTotal} / 实{aiAppliedTotal}</span>
                </div>
                {aiReplyComparisons.length > 0 ? (
                  <div className="variable-change-list">
                    {aiReplyComparisons.map(comparison => (
                      <AiComparisonRow
                        key={comparison.id}
                        comparison={comparison}
                      />
                    ))}
                    {summary.aiReply.omittedDeclaredCount > 0 && (
                      <div className="variable-change-omitted">
                        另有 {summary.aiReply.omittedDeclaredCount} 条 AI 声明未显示
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="variable-change-empty">本轮未捕获 AI 变量声明或写入。</div>
                )}
              </section>

              {summary.thoughts.length > 0 && (
                <section className="variable-change-section thoughts">
                  <div className="variable-change-section-heading">
                    <span>AI 思考摘要</span>
                    <span>{summary.thoughts.length}</span>
                  </div>
                  <div className="variable-thought-list">
                    {summary.thoughts.map(thought => (
                      <div className="variable-thought-item" key={thought.id} title={thought.text}>
                        {thought.preview}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {summary.parseErrors.length > 0 && (
                <section className="variable-change-section errors">
                  <div className="variable-change-section-heading">
                    <span>解析问题</span>
                    <span>{summary.parseErrors.length}</span>
                  </div>
                  <div className="variable-change-error-list">
                    {summary.parseErrors.map((error, index) => (
                      <div className="variable-change-error" key={`${error}-${index}`}>{error}</div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="variable-change-section">
              <div className="variable-change-section-heading">
                <span>后台变更变量</span>
                <span>{backgroundTotal}</span>
              </div>
              {summary.background.observedChanges.length > 0 ? (
                <div className="variable-change-list">
                  {summary.background.observedChanges.map(change => (
                    <ActualChangeRow key={change.id} change={change} />
                  ))}
                  {summary.background.omittedObservedCount > 0 && (
                    <div className="variable-change-omitted">
                      另有 {summary.background.omittedObservedCount} 条后台变更未显示
                    </div>
                  )}
                </div>
              ) : (
                <div className="variable-change-empty">本轮尚未观察到后台变量变更。</div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

interface AiComparisonRowProps {
  comparison: VariableAiComparison;
}

const AiComparisonRow: React.FC<AiComparisonRowProps> = ({ comparison }) => {
  const declared = comparison.declaredChange;
  const observed = comparison.observedChange;

  return (
    <div className="variable-change-row declared">
      <div className="variable-change-row-head variable-change-row-head-ai">
        <span className={`variable-change-action ${comparison.action}`}>{ACTION_LABELS[comparison.action]}</span>
        <span className="variable-change-path" title={comparison.copyPath}>{comparison.displayPath}</span>
        <span className={`variable-change-compare-status ${comparison.status}`}>
          {COMPARE_STATUS_LABELS[comparison.status]}
        </span>
      </div>

      <div className="variable-change-row-body variable-change-row-body-ai">
        <div className="variable-change-stack">
          <span className="variable-change-caption">{declared ? 'AI 声明' : 'API 目标'}</span>
          <span className="variable-change-value new" title={formatVariableDetailValue(comparison.expectedValue)}>
            {comparison.expectedPreview}
          </span>
        </div>

        {observed ? (
          <div className="variable-change-stack">
            <span className="variable-change-caption">
              实际写入 · {getProducerMeta(observed.producer).label}
            </span>
            <div className="variable-change-row-body diff">
              <span className="variable-change-value old" title={formatVariableDetailValue(observed.beforeValue)}>
                {observed.beforePreview}
              </span>
              <span className="variable-change-arrow">→</span>
              <span className="variable-change-value new" title={formatVariableDetailValue(observed.afterValue)}>
                {observed.afterPreview}
              </span>
            </div>
          </div>
        ) : (
          <div className="variable-change-note">
            {comparison.status === 'no-op'
              ? `发送前已经是目标值：${comparison.baselinePreview}`
              : `最终值：${comparison.finalPreview}`}
          </div>
        )}
      </div>
    </div>
  );
};

interface ActualChangeRowProps {
  change: VariableActualChange;
}

const ActualChangeRow: React.FC<ActualChangeRowProps> = ({ change }) => {
  const source = getProducerMeta(change.producer);
  return (
    <div className="variable-change-row actual">
      <div className="variable-change-row-head">
        <span className={`variable-change-action ${change.action}`}>{ACTION_LABELS[change.action]}</span>
        <span className="variable-change-path" title={change.copyPath}>{change.displayPath}</span>
        <span
          className={`variable-change-source-badge ${source.tone}`}
          title={getChangeMetaTitle(change, source.label)}
        >
          {source.label}
        </span>
      </div>
      <div className="variable-change-row-body diff">
        <span className="variable-change-value old" title={formatVariableDetailValue(change.beforeValue)}>
          {change.beforePreview}
        </span>
        <span className="variable-change-arrow">→</span>
        <span className="variable-change-value new" title={formatVariableDetailValue(change.afterValue)}>
          {change.afterPreview}
        </span>
      </div>
    </div>
  );
};

export default VariableChangeBar;
