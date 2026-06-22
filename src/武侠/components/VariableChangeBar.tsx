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

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const PRODUCER_META: Record<VariableChangeProducer, { label: string; tone: SourceTone }> = {
  era: { label: 'ERA', tone: 'era' },
  direct: { label: 'Direct', tone: 'direct' },
  boundary: { label: '边界补偿', tone: 'boundary' },
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

const VariableChangeBar: React.FC<VariableChangeBarProps> = ({ summary }) => {
  const [expandedSegment, setExpandedSegment] = useState<ExpandedSegment | null>(null);
  const [lastExpandedSegment, setLastExpandedSegment] = useState<ExpandedSegment>('ai');
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    setExpandedSegment(null);
    setLastExpandedSegment('ai');
    setCopiedText('');
  }, [summary?.turnId]);

  if (!summary) {
    return null;
  }

  const declaredTotal = getTotalCount(
    summary.aiReply.declaredChanges.length,
    summary.aiReply.omittedDeclaredCount,
  );
  const aiObservedTotal = getTotalCount(
    summary.aiReply.observedChanges.length,
    summary.aiReply.omittedObservedCount,
  );
  const backgroundTotal = getTotalCount(
    summary.background.observedChanges.length,
    summary.background.omittedObservedCount,
  );
  const aiReplyComparisons = summary.aiReply.comparisons.filter(
    comparison => Boolean(comparison.declaredChange),
  );

  const handleCopy = async (label: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedText(label);
    window.setTimeout(() => setCopiedText(''), 1200);
  };

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
          <span className="variable-change-segment-count">声{declaredTotal}/实{aiObservedTotal}</span>
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
          {copiedText && <div className="variable-change-copy-toast">已复制 {copiedText}</div>}

          {expandedSegment === 'ai' ? (
            <>
              <section className="variable-change-section">
                <div className="variable-change-section-heading">
                  <span>AI回复变量</span>
                  <span>声{declaredTotal} / 实{aiObservedTotal}</span>
                </div>
                {aiReplyComparisons.length > 0 ? (
                  <div className="variable-change-list">
                    {aiReplyComparisons.map(comparison => (
                      <AiComparisonRow
                        key={comparison.id}
                        comparison={comparison}
                        onCopy={handleCopy}
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
                    <ActualChangeRow key={change.id} change={change} onCopy={handleCopy} />
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
  onCopy: (label: string, text: string) => Promise<void>;
}

const AiComparisonRow: React.FC<AiComparisonRowProps> = ({ comparison, onCopy }) => {
  const declared = comparison.declaredChange;
  const observed = comparison.observedChange;
  const copyValue = declared
    ? declared.action === 'delete'
      ? '删除目标节点'
      : formatVariableDetailValue(declared.value)
    : formatVariableDetailValue(observed?.afterValue);

  return (
    <div className="variable-change-row declared">
      <div className="variable-change-row-head variable-change-row-head-ai">
        <span className={`variable-change-action ${comparison.action}`}>{ACTION_LABELS[comparison.action]}</span>
        <span className="variable-change-path" title={comparison.copyPath}>{comparison.displayPath}</span>
        <span className={`variable-change-compare-status ${comparison.status}`}>
          {COMPARE_STATUS_LABELS[comparison.status]}
        </span>
        <CopyButtons
          onCopyPath={() => onCopy('路径', comparison.copyPath)}
          onCopyValue={() => onCopy('值', copyValue)}
        />
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
  onCopy: (label: string, text: string) => Promise<void>;
}

const ActualChangeRow: React.FC<ActualChangeRowProps> = ({ change, onCopy }) => {
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
        <CopyButtons
          onCopyPath={() => onCopy('路径', change.copyPath)}
          onCopyValue={() => onCopy('值', formatVariableDetailValue(change.afterValue))}
        />
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

interface CopyButtonsProps {
  onCopyPath: () => void;
  onCopyValue: () => void;
}

const CopyButtons: React.FC<CopyButtonsProps> = ({ onCopyPath, onCopyValue }) => (
  <span className="variable-change-copy-actions">
    <button type="button" onClick={onCopyPath} title="复制路径" aria-label="复制路径">
      <Icons.Copy size={13} />
    </button>
    <button type="button" onClick={onCopyValue} title="复制值" aria-label="复制值">
      <Icons.FileText size={13} />
    </button>
  </span>
);

export default VariableChangeBar;
