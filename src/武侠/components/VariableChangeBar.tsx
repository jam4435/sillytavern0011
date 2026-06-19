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

type ExpandedSegment = 'ai' | 'background';
type AiCompareStatus = 'applied' | 'not-applied' | 'diverged' | 'no-op' | 'api-only';
type SourceTone = 'event' | 'frontend' | 'api' | 'mvu' | 'generic';

interface NormalizedActualChange extends VariableActualChange {
  sourceLabel?: string;
  sourceRaw?: string;
  sourceTone: SourceTone;
}

interface NormalizedAiChange {
  declaredChange: VariableDeclaredChange;
  actualChange?: NormalizedActualChange;
  compareStatus: AiCompareStatus;
}

const ACTION_LABELS: Record<VariableChangeAction, string> = {
  insert: '新增',
  edit: '修改',
  delete: '删除',
};

const COMPARE_STATUS_LABELS: Record<AiCompareStatus, string> = {
  applied: 'applied',
  'not-applied': 'not-applied',
  diverged: 'diverged',
  'no-op': 'no-op',
  'api-only': 'api-only',
};

const getTotalCount = (count: number, omittedCount: number): number => count + omittedCount;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readArrayField = <T,>(
  value: unknown,
  fieldNames: string[],
): { found: boolean; value: T[] } => {
  if (!isRecord(value)) {
    return { found: false, value: [] };
  }

  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(value, fieldName)) {
      const fieldValue = value[fieldName];
      return {
        found: true,
        value: Array.isArray(fieldValue) ? fieldValue as T[] : [],
      };
    }
  }

  return { found: false, value: [] };
};

const readNumberField = (value: unknown, fieldNames: string[]): number | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) {
      return fieldValue;
    }
  }

  return undefined;
};

const readStringField = (value: unknown, fieldNames: string[]): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (typeof fieldValue === 'string' && fieldValue.trim()) {
      return fieldValue.trim();
    }
  }

  return undefined;
};

const normalizePreferredSegment = (summary: VariableChangeSummary | null): ExpandedSegment => {
  const preferred = readStringField(summary, ['preferredExpandedSegment', 'defaultExpandedSegment', 'lastExpandedSegment']);
  return preferred === 'background' ? 'background' : 'ai';
};

const resolveActualSegment = (change: VariableActualChange): ExpandedSegment | undefined => {
  const segment = readStringField(change, ['segment', 'scope', 'group', 'changeGroup']);
  if (segment === 'ai' || segment === 'background') {
    return segment;
  }

  const raw = readStringField(change, ['origin', 'originType', 'sourceType', 'writerType', 'writer', 'source']);
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  if (normalized.includes('background') || normalized.includes('backend')) {
    return 'background';
  }
  if (normalized.includes('assistant') || normalized.includes('ai')) {
    return 'ai';
  }
  if (
    normalized.includes('event')
    || normalized.includes('script')
    || normalized.includes('frontend')
    || normalized.includes('client')
    || normalized.includes('api')
    || normalized.includes('mvu')
  ) {
    return 'background';
  }

  return undefined;
};

const resolveBackgroundSource = (
  change: VariableActualChange,
): { label?: string; raw?: string; tone: SourceTone } => {
  const explicitLabel = readStringField(change, ['sourceLabel', 'originLabel', 'badgeLabel', 'displaySource']);
  const raw = explicitLabel || readStringField(change, ['origin', 'originType', 'sourceType', 'writerType', 'writer', 'source']);
  const normalized = raw?.toLowerCase() || '';

  if (explicitLabel) {
    if (normalized.includes('事件') || normalized.includes('event') || normalized.includes('script')) {
      return { label: explicitLabel, raw, tone: 'event' };
    }
    if (normalized.includes('mvu')) {
      return { label: explicitLabel, raw, tone: 'mvu' };
    }
    if (normalized.includes('frontend') || normalized.includes('前端') || normalized.includes('client')) {
      return { label: explicitLabel, raw, tone: 'frontend' };
    }
    if (normalized.includes('api')) {
      return { label: explicitLabel, raw, tone: 'api' };
    }
    return { label: explicitLabel, raw, tone: 'generic' };
  }

  if (normalized.includes('事件') || normalized.includes('event') || normalized.includes('script')) {
    return { label: '事件脚本', raw, tone: 'event' };
  }
  if (normalized.includes('mvu')) {
    return { label: 'MVU补偿', raw, tone: 'mvu' };
  }
  if (normalized.includes('frontend') || normalized.includes('前端') || normalized.includes('client')) {
    return { label: '游戏前端', raw, tone: 'frontend' };
  }
  if (normalized.includes('api')) {
    return { label: 'API', raw, tone: 'api' };
  }
  if (normalized.includes('write') || normalized.includes('后台') || normalized.includes('backend')) {
    return { label: '后台', raw, tone: 'generic' };
  }

  return { label: raw ? '后台' : undefined, raw, tone: 'generic' };
};

const areValuesEqual = (left: unknown, right: unknown): boolean =>
  formatVariableDetailValue(left) === formatVariableDetailValue(right);

const readExplicitCompareStatus = (
  ...values: Array<VariableDeclaredChange | VariableActualChange | undefined>
): AiCompareStatus | undefined => {
  for (const value of values) {
    const status = readStringField(value, ['compareStatus', 'comparisonStatus', 'matchStatus', 'actualStatus', 'applyStatus']);
    if (
      status === 'applied'
      || status === 'not-applied'
      || status === 'diverged'
      || status === 'no-op'
      || status === 'api-only'
    ) {
      return status;
    }
  }

  return undefined;
};

const deriveCompareStatus = (
  declaredChange: VariableDeclaredChange,
  actualChange: VariableActualChange | undefined,
  summaryStatus: VariableChangeSummary['status'],
): AiCompareStatus => {
  const explicitStatus = readExplicitCompareStatus(declaredChange, actualChange);
  if (explicitStatus) {
    return explicitStatus;
  }

  if (!actualChange) {
    return summaryStatus === 'settled' ? 'not-applied' : 'api-only';
  }

  const noOpFlag = readStringField(actualChange, ['effect', 'result']) === 'no-op';
  if (
    noOpFlag
    || (areValuesEqual(actualChange.beforeValue, actualChange.afterValue)
      && (declaredChange.action === 'delete' || areValuesEqual(actualChange.afterValue, declaredChange.value)))
  ) {
    return 'no-op';
  }

  if (declaredChange.action === 'delete') {
    return actualChange.action === 'delete' ? 'applied' : 'diverged';
  }

  return areValuesEqual(actualChange.afterValue, declaredChange.value) ? 'applied' : 'diverged';
};

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

const normalizeActualChange = (change: VariableActualChange): NormalizedActualChange => {
  const source = resolveBackgroundSource(change);
  return {
    ...change,
    sourceLabel: source.label,
    sourceRaw: source.raw,
    sourceTone: source.tone,
  };
};

const VariableChangeBar: React.FC<VariableChangeBarProps> = ({ summary }) => {
  const [expandedSegment, setExpandedSegment] = useState<ExpandedSegment | null>(null);
  const [lastExpandedSegment, setLastExpandedSegment] = useState<ExpandedSegment>('ai');
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    const preferredSegment = normalizePreferredSegment(summary);
    setExpandedSegment(null);
    setLastExpandedSegment(preferredSegment);
    setCopiedText('');
  }, [summary?.turnId, summary]);

  const normalizedData = useMemo(() => {
    if (!summary) {
      return null;
    }

    const summaryRecord = summary as unknown as Record<string, unknown>;
    const allActualVisibleChanges = summary.actualChanges.map(normalizeActualChange);
    const allActualTotal = getTotalCount(summary.actualChanges.length, summary.omittedActualCount);

    const backgroundField = readArrayField<VariableActualChange>(summaryRecord, [
      'backgroundChanges',
      'backendChanges',
      'backendActualChanges',
      'nonAiActualChanges',
    ]);
    const hintedBackgroundChanges = allActualVisibleChanges.filter(change => resolveActualSegment(change) === 'background');
    const backgroundVisibleChanges = (backgroundField.found ? backgroundField.value : hintedBackgroundChanges)
      .map(normalizeActualChange);
    const backgroundIdSet = new Set(backgroundVisibleChanges.map(change => change.id));

    const aiActualField = readArrayField<VariableActualChange>(summaryRecord, [
      'aiActualChanges',
      'assistantActualChanges',
      'matchedActualChanges',
    ]);
    const hintedAiActualChanges = allActualVisibleChanges.filter(change => resolveActualSegment(change) === 'ai');

    let aiActualVisibleChanges: NormalizedActualChange[];
    if (aiActualField.found) {
      aiActualVisibleChanges = aiActualField.value.map(normalizeActualChange);
    } else if (hintedAiActualChanges.length > 0) {
      aiActualVisibleChanges = hintedAiActualChanges;
    } else if (backgroundField.found || hintedBackgroundChanges.length > 0) {
      aiActualVisibleChanges = allActualVisibleChanges.filter(change => !backgroundIdSet.has(change.id));
    } else {
      aiActualVisibleChanges = allActualVisibleChanges;
    }

    const aiActualMap = new Map<string, NormalizedActualChange[]>();
    for (const change of aiActualVisibleChanges) {
      const key = change.copyPath || change.displayPath;
      const current = aiActualMap.get(key) || [];
      current.push(change);
      aiActualMap.set(key, current);
    }

    const aiDeclaredChanges = summary.declaredChanges;
    const usedActualIds = new Set<string>();
    const normalizedAiChanges: NormalizedAiChange[] = aiDeclaredChanges.map(declaredChange => {
      const declaredRecord = declaredChange as unknown as Record<string, unknown>;
      const explicitActualId = readStringField(declaredRecord, ['actualChangeId', 'linkedActualChangeId', 'matchedActualChangeId']);
      let matchedActual = explicitActualId
        ? aiActualVisibleChanges.find(change => change.id === explicitActualId)
        : undefined;

      if (!matchedActual) {
        const candidates = aiActualMap.get(declaredChange.copyPath || declaredChange.displayPath) || [];
        matchedActual = candidates.find(change => !usedActualIds.has(change.id));
      }

      if (matchedActual) {
        usedActualIds.add(matchedActual.id);
      }

      return {
        declaredChange,
        actualChange: matchedActual,
        compareStatus: deriveCompareStatus(declaredChange, matchedActual, summary.status),
      };
    });

    const unmatchedAiActualChanges = aiActualVisibleChanges.filter(change => !usedActualIds.has(change.id));

    const omittedBackgroundCount = readNumberField(summaryRecord, ['omittedBackgroundCount', 'backgroundOmittedCount']) || 0;
    const omittedAiActualCount = readNumberField(summaryRecord, [
      'omittedAiActualCount',
      'aiActualOmittedCount',
      'omittedMatchedActualCount',
    ]);

    const backgroundTotal = readNumberField(summaryRecord, ['backgroundCount', 'backgroundTotal', 'backendCount'])
      ?? getTotalCount(backgroundVisibleChanges.length, omittedBackgroundCount);
    const aiActualTotal = readNumberField(summaryRecord, ['aiActualCount', 'matchedActualCount', 'assistantActualCount'])
      ?? (
        aiActualField.found || hintedAiActualChanges.length > 0 || backgroundField.found || hintedBackgroundChanges.length > 0
          ? getTotalCount(aiActualVisibleChanges.length, omittedAiActualCount || 0)
          : allActualTotal
      );

    return {
      aiActualTotal,
      backgroundTotal,
      backgroundVisibleChanges,
      normalizedAiChanges,
      omittedBackgroundCount,
      unmatchedAiActualChanges,
    };
  }, [summary]);

  if (!summary || !normalizedData) {
    return null;
  }

  const declaredTotal = getTotalCount(summary.declaredChanges.length, summary.omittedDeclaredCount);

  const handleCopy = async (label: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedText(label);
    window.setTimeout(() => setCopiedText(''), 1200);
  };

  const toggleSegment = (segment: ExpandedSegment) => {
    setLastExpandedSegment(segment);
    setExpandedSegment(previous => previous === segment ? null : segment);
  };

  const handleChevronClick = () => {
    setExpandedSegment(previous => previous ? null : lastExpandedSegment);
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
          <span className="variable-change-segment-count">声{declaredTotal}/实{normalizedData.aiActualTotal}</span>
        </button>

        <button
          className={`variable-change-segment background ${expandedSegment === 'background' ? 'active' : ''}`}
          type="button"
          onClick={() => toggleSegment('background')}
          aria-expanded={expandedSegment === 'background'}
        >
          <span className="variable-change-segment-label">后台变更</span>
          <span className="variable-change-segment-count">{normalizedData.backgroundTotal}</span>
        </button>

        <button
          className="variable-change-chevron"
          type="button"
          onClick={handleChevronClick}
          aria-expanded={Boolean(expandedSegment)}
          aria-label={expandedSegment ? '收起变量变更' : `展开${lastExpandedSegment === 'ai' ? 'AI回复' : '后台变更'}`}
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
                  <span>声{declaredTotal} / 实{normalizedData.aiActualTotal}</span>
                </div>
                {normalizedData.normalizedAiChanges.length > 0 ? (
                  <div className="variable-change-list">
                    {normalizedData.normalizedAiChanges.map(item => (
                      <AiChangeRow
                        key={item.declaredChange.id}
                        item={item}
                        onCopy={handleCopy}
                      />
                    ))}
                    {summary.omittedDeclaredCount > 0 && (
                      <div className="variable-change-omitted">另有 {summary.omittedDeclaredCount} 条 AI 声明未显示</div>
                    )}
                  </div>
                ) : (
                  <div className="variable-change-empty">本轮未捕获 AI 变量声明。</div>
                )}

                {normalizedData.unmatchedAiActualChanges.length > 0 && (
                  <div className="variable-change-subsection">
                    <div className="variable-change-subheading">仅观察到实际写入</div>
                    <div className="variable-change-list">
                      {normalizedData.unmatchedAiActualChanges.map(change => (
                        <ActualChangeRow
                          key={change.id}
                          change={change}
                          onCopy={handleCopy}
                          showSourceBadge={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {summary.thoughts.length > 0 && (
                <section className="variable-change-section thoughts">
                  <div className="variable-change-section-heading">
                    <span>思考</span>
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
                    <span>解析错误</span>
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
                <span>后台变更</span>
                <span>{normalizedData.backgroundTotal}</span>
              </div>
              {normalizedData.backgroundVisibleChanges.length > 0 ? (
                <div className="variable-change-list">
                  {normalizedData.backgroundVisibleChanges.map(change => (
                    <ActualChangeRow
                      key={change.id}
                      change={change}
                      onCopy={handleCopy}
                      showSourceBadge
                    />
                  ))}
                  {normalizedData.omittedBackgroundCount > 0 && (
                    <div className="variable-change-omitted">另有 {normalizedData.omittedBackgroundCount} 条后台变更未显示</div>
                  )}
                </div>
              ) : (
                <div className="variable-change-empty">当前没有可展示的后台变量变更。</div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

interface AiChangeRowProps {
  item: NormalizedAiChange;
  onCopy: (label: string, text: string) => Promise<void>;
}

const AiChangeRow: React.FC<AiChangeRowProps> = ({ item, onCopy }) => {
  const { actualChange, compareStatus, declaredChange } = item;
  const declaredValue = declaredChange.action === 'delete'
    ? '删除目标节点'
    : formatVariableDetailValue(declaredChange.value);

  return (
    <div className="variable-change-row declared">
      <div className="variable-change-row-head variable-change-row-head-ai">
        <span className={`variable-change-action ${declaredChange.action}`}>{ACTION_LABELS[declaredChange.action]}</span>
        <span className="variable-change-path" title={declaredChange.copyPath}>{declaredChange.displayPath}</span>
        <span className={`variable-change-compare-status ${compareStatus}`}>
          {COMPARE_STATUS_LABELS[compareStatus]}
        </span>
        <CopyButtons
          onCopyPath={() => onCopy('路径', declaredChange.copyPath)}
          onCopyValue={() => onCopy('值', declaredValue)}
        />
      </div>
      <div className="variable-change-row-body variable-change-row-body-ai">
        <div className="variable-change-stack">
          <span className="variable-change-caption">声明</span>
          <span className="variable-change-value new" title={declaredValue}>
            {declaredChange.action === 'delete' ? '删除目标节点' : declaredChange.valuePreview}
          </span>
        </div>

        {actualChange ? (
          <div className="variable-change-stack">
            <span className="variable-change-caption">实际</span>
            <div className="variable-change-row-body diff">
              <span className="variable-change-value old" title={formatVariableDetailValue(actualChange.beforeValue)}>
                {actualChange.beforePreview}
              </span>
              <span className="variable-change-arrow">→</span>
              <span className="variable-change-value new" title={formatVariableDetailValue(actualChange.afterValue)}>
                {actualChange.afterPreview}
              </span>
            </div>
          </div>
        ) : (
          <div className="variable-change-note">
            {compareStatus === 'api-only'
              ? '目前只有声明侧记录。'
              : compareStatus === 'not-applied'
                ? '未观察到对应实际变更。'
                : compareStatus === 'no-op'
                  ? '声明未导致有效差分。'
                  : '缺少对应实际记录。'}
          </div>
        )}
      </div>
    </div>
  );
};

interface ActualChangeRowProps {
  change: NormalizedActualChange;
  onCopy: (label: string, text: string) => Promise<void>;
  showSourceBadge: boolean;
}

const ActualChangeRow: React.FC<ActualChangeRowProps> = ({ change, onCopy, showSourceBadge }) => (
  <div className="variable-change-row actual">
    <div className="variable-change-row-head">
      <span className={`variable-change-action ${change.action}`}>{ACTION_LABELS[change.action]}</span>
      <span className="variable-change-path" title={change.copyPath}>{change.displayPath}</span>
      {showSourceBadge && change.sourceLabel ? (
        <span
          className={`variable-change-source-badge ${change.sourceTone}`}
          title={change.sourceRaw || change.sourceLabel}
        >
          {change.sourceLabel}
        </span>
      ) : null}
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
