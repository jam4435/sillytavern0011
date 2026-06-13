import React, { useEffect, useMemo, useState } from 'react';
import {
  formatVariableDetailValue,
  type VariableActualChange,
  type VariableChangeAction,
  type VariableChangeSummary,
  type VariableDeclaredChange,
} from '../utils/variableChanges';
import { Icons } from './Icons';

interface VariableChangeBarProps {
  summary: VariableChangeSummary | null;
}

const ACTION_LABELS: Record<VariableChangeAction, string> = {
  insert: '新增',
  edit: '修改',
  delete: '删除',
};

const STATUS_LABELS: Record<VariableChangeSummary['status'], string> = {
  tracking: '追踪中',
  'reply-recorded': '已记录回复',
  settled: '已更新',
  error: '基线缺失',
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

const VariableChangeBar: React.FC<VariableChangeBarProps> = ({ summary }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    setIsExpanded(false);
    setCopiedText('');
  }, [summary?.turnId]);

  const declaredTotal = summary
    ? getTotalCount(summary.declaredChanges.length, summary.omittedDeclaredCount)
    : 0;
  const actualTotal = summary
    ? getTotalCount(summary.actualChanges.length, summary.omittedActualCount)
    : 0;

  const groupText = useMemo(() => {
    if (!summary?.topLevelGroups.length) {
      return '暂无字段变化';
    }
    const visibleGroups = summary.topLevelGroups.slice(0, 4).join('、');
    return summary.topLevelGroups.length > 4 ? `${visibleGroups} 等` : visibleGroups;
  }, [summary]);

  if (!summary) {
    return null;
  }

  const handleCopy = async (label: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedText(label);
    window.setTimeout(() => setCopiedText(''), 1200);
  };

  return (
    <div className={`variable-change-bar ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="variable-change-summary"
        type="button"
        onClick={() => setIsExpanded(value => !value)}
        aria-expanded={isExpanded}
      >
        <span className="variable-change-title">
          <Icons.Variables size={15} />
          <span>变量变更</span>
        </span>
        <span className="variable-change-pill declared">AI {declaredTotal}</span>
        <span className="variable-change-pill actual">实际 {actualTotal}</span>
        <span className={`variable-change-status ${summary.status}`}>{STATUS_LABELS[summary.status]}</span>
        <span className="variable-change-groups" title={groupText}>{groupText}</span>
        <span className="variable-change-chevron">
          {isExpanded ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
        </span>
      </button>

      {isExpanded && (
        <div className="variable-change-detail">
          {copiedText && <div className="variable-change-copy-toast">已复制 {copiedText}</div>}

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

          <section className="variable-change-section">
            <div className="variable-change-section-heading">
              <span>AI 声明</span>
              <span>{declaredTotal}</span>
            </div>
            {summary.declaredChanges.length > 0 ? (
              <div className="variable-change-list">
                {summary.declaredChanges.map(change => (
                  <DeclaredChangeRow key={change.id} change={change} onCopy={handleCopy} />
                ))}
                {summary.omittedDeclaredCount > 0 && (
                  <div className="variable-change-omitted">另有 {summary.omittedDeclaredCount} 条声明变更未显示</div>
                )}
              </div>
            ) : (
              <div className="variable-change-empty">本轮回复没有声明变量写入。</div>
            )}
          </section>

          <section className="variable-change-section">
            <div className="variable-change-section-heading">
              <span>实际变更</span>
              <span>{actualTotal}</span>
            </div>
            {summary.actualChanges.length > 0 ? (
              <div className="variable-change-list">
                {summary.actualChanges.map(change => (
                  <ActualChangeRow key={change.id} change={change} onCopy={handleCopy} />
                ))}
                {summary.omittedActualCount > 0 && (
                  <div className="variable-change-omitted">另有 {summary.omittedActualCount} 条实际变更未显示</div>
                )}
              </div>
            ) : (
              <div className="variable-change-empty">尚未观察到本轮实际变量差分。</div>
            )}
          </section>

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
        </div>
      )}
    </div>
  );
};

interface DeclaredChangeRowProps {
  change: VariableDeclaredChange;
  onCopy: (label: string, text: string) => Promise<void>;
}

const DeclaredChangeRow: React.FC<DeclaredChangeRowProps> = ({ change, onCopy }) => (
  <div className="variable-change-row declared">
    <div className="variable-change-row-head">
      <span className={`variable-change-action ${change.action}`}>{ACTION_LABELS[change.action]}</span>
      <span className="variable-change-path" title={change.copyPath}>{change.displayPath}</span>
      <CopyButtons
        onCopyPath={() => onCopy('路径', change.copyPath)}
        onCopyValue={() => onCopy('值', formatVariableDetailValue(change.value))}
      />
    </div>
    <div className="variable-change-row-body">
      <span className="variable-change-value new" title={formatVariableDetailValue(change.value)}>
        {change.valuePreview}
      </span>
    </div>
  </div>
);

interface ActualChangeRowProps {
  change: VariableActualChange;
  onCopy: (label: string, text: string) => Promise<void>;
}

const ActualChangeRow: React.FC<ActualChangeRowProps> = ({ change, onCopy }) => (
  <div className="variable-change-row actual">
    <div className="variable-change-row-head">
      <span className={`variable-change-action ${change.action}`}>{ACTION_LABELS[change.action]}</span>
      <span className="variable-change-path" title={change.copyPath}>{change.displayPath}</span>
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
