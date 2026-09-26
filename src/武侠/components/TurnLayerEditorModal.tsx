import {
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  RefreshCw,
  Save,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivePanel } from '../types';
import type { EditableTurnSnapshot } from '../utils/latestAssistantEditor';
import Modal from './Modal';

export interface TurnLayerEditorSaveOutcome {
  snapshot: EditableTurnSnapshot;
  warning?: string;
}

interface TurnLayerEditorModalProps {
  isOpen: boolean;
  snapshot: EditableTurnSnapshot | null;
  onClose: () => void;
  onNavigate: (messageId?: number) => EditableTurnSnapshot | null;
  onSave: (
    snapshot: EditableTurnSnapshot,
    userDraftText: string,
    assistantDraftText: string,
  ) => Promise<TurnLayerEditorSaveOutcome>;
}

type EditorNotice =
  | { tone: 'idle'; message: '' }
  | { tone: 'success' | 'warning' | 'error'; message: string };

type EditTarget = 'assistant' | 'user';

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const TurnLayerEditorModal: React.FC<TurnLayerEditorModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onNavigate,
  onSave,
}) => {
  const [baseSnapshot, setBaseSnapshot] = useState<EditableTurnSnapshot | null>(snapshot);
  const [userDraftText, setUserDraftText] = useState(snapshot?.userRawText ?? '');
  const [assistantDraftText, setAssistantDraftText] = useState(snapshot?.assistant.rawText ?? '');
  const [jumpValue, setJumpValue] = useState(snapshot ? String(snapshot.assistant.messageId) : '');
  const [editTarget, setEditTarget] = useState<EditTarget>('assistant');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<EditorNotice>({ tone: 'idle', message: '' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applySnapshot = useCallback((next: EditableTurnSnapshot | null) => {
    setBaseSnapshot(next);
    setUserDraftText(next?.userRawText ?? '');
    setAssistantDraftText(next?.assistant.rawText ?? '');
    setJumpValue(next ? String(next.assistant.messageId) : '');
    if (next?.userMessageId == null) setEditTarget('assistant');
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    applySnapshot(snapshot);
    setNotice({ tone: 'idle', message: '' });
  }, [applySnapshot, isOpen, snapshot]);

  const isDirty = Boolean(
    baseSnapshot
      && (userDraftText !== baseSnapshot.userRawText || assistantDraftText !== baseSnapshot.assistant.rawText),
  );
  const canSave = Boolean(
    baseSnapshot
      && isDirty
      && assistantDraftText.trim()
      && (baseSnapshot.userMessageId === null || userDraftText.trim())
      && !isSaving,
  );

  const locatorText = useMemo(() => {
    if (!baseSnapshot) return '没有可浏览的 AI 楼层';
    const swipeCount = Math.max(0, baseSnapshot.assistant.metadata.swipeCount);
    return swipeCount > 0
      ? `AI 楼层 #${baseSnapshot.assistant.messageId} · 回复分支 ${baseSnapshot.assistant.swipeId + 1}/${swipeCount}`
      : `AI 楼层 #${baseSnapshot.assistant.messageId} · 单一回复`;
  }, [baseSnapshot]);

  const currentDraft = editTarget === 'assistant' ? assistantDraftText : userDraftText;
  const currentLabel = editTarget === 'assistant'
    ? `AI 输出 #${baseSnapshot?.assistant.messageId ?? ''}`
    : `User 输入 #${baseSnapshot?.userMessageId ?? ''}`;

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty && !window.confirm('尚有未保存的楼层修改，确定放弃并关闭吗？')) return;
    onClose();
  }, [isDirty, isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  const navigateTo = (messageId?: number) => {
    if (isSaving) return;
    if (isDirty && !window.confirm('切换楼层会丢弃当前未保存的修改，是否继续？')) return;
    try {
      const next = onNavigate(messageId);
      if (!next) {
        setNotice({ tone: 'error', message: '找不到对应的可编辑回合。可输入 User 或 AI 的楼层号。' });
        return;
      }
      applySnapshot(next);
      setNotice({ tone: 'success', message: `已切换到 AI 楼层 #${next.assistant.messageId}。` });
    } catch (error) {
      setNotice({ tone: 'error', message: `读取楼层失败：${getErrorMessage(error)}` });
    }
  };

  const handleJump = () => {
    const messageId = Number(jumpValue.trim());
    if (!Number.isInteger(messageId) || messageId < 0) {
      setNotice({ tone: 'error', message: '请输入有效的非负楼层号。' });
      return;
    }
    navigateTo(messageId);
  };

  const handleReload = () => {
    if (!baseSnapshot) return;
    navigateTo(baseSnapshot.assistant.messageId);
  };

  const handleSave = async () => {
    if (!baseSnapshot || !canSave) return;
    setIsSaving(true);
    setNotice({ tone: 'idle', message: '' });
    try {
      const outcome = await onSave(baseSnapshot, userDraftText, assistantDraftText);
      applySnapshot(outcome.snapshot);
      setNotice({
        tone: outcome.warning ? 'warning' : 'success',
        message: outcome.warning ? `楼层已保存；${outcome.warning}` : '当前回合内容已保存。',
      });
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title="校订聊天楼层"
      type={ActivePanel.SETTINGS}
      overlayClassName="latest-reply-overlay"
      boxClassName="latest-reply-modal"
      contentClassName="latest-reply-modal-content"
      showPaperTexture={false}
    >
      <div className="latest-reply-editor">
        <div className="turn-layer-navigation">
          <button
            type="button"
            className="latest-reply-action secondary"
            onClick={() => navigateTo(baseSnapshot?.previousAssistantMessageId ?? undefined)}
            disabled={baseSnapshot?.previousAssistantMessageId == null || isSaving}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span>上一回合</span>
          </button>

          <div className="turn-layer-jump">
            <span className="turn-layer-current">{baseSnapshot ? `AI #${baseSnapshot.assistant.messageId}` : '无楼层'}</span>
            <input
              value={jumpValue}
              onChange={event => setJumpValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleJump();
              }}
              inputMode="numeric"
              aria-label="跳转楼层号"
              placeholder="楼层号"
              disabled={isSaving}
            />
            <button type="button" className="latest-reply-action secondary" onClick={handleJump} disabled={isSaving}>
              跳转
            </button>
          </div>

          <button
            type="button"
            className="latest-reply-action secondary"
            onClick={() => navigateTo(baseSnapshot?.nextAssistantMessageId ?? undefined)}
            disabled={baseSnapshot?.nextAssistantMessageId == null || isSaving}
          >
            <span>下一回合</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="latest-reply-ledger">
          <div className="latest-reply-locator">
            <FilePenLine size={16} aria-hidden="true" />
            <span>{locatorText}</span>
          </div>
          <div className="latest-reply-guardrail">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>AI 的 &lt;era_data&gt; 必须原样保留；变量动作改动会触发 ERA 重算。</span>
          </div>
        </div>

        <div className="turn-layer-target-tabs" role="tablist" aria-label="选择编辑内容">
          <button
            type="button"
            role="tab"
            aria-selected={editTarget === 'assistant'}
            className={`turn-layer-target-tab ${editTarget === 'assistant' ? 'is-active' : ''}`}
            onClick={() => {
              setEditTarget('assistant');
              window.requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          >
            AI 输出
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={editTarget === 'user'}
            className={`turn-layer-target-tab ${editTarget === 'user' ? 'is-active' : ''}`}
            onClick={() => {
              setEditTarget('user');
              window.requestAnimationFrame(() => textareaRef.current?.focus());
            }}
            disabled={baseSnapshot?.userMessageId == null}
          >
            User 输入
          </button>
        </div>

        <label className="latest-reply-textarea-label" htmlFor="turn-layer-raw-text">
          {currentLabel}
        </label>
        <textarea
          ref={textareaRef}
          id="turn-layer-raw-text"
          className="latest-reply-textarea"
          aria-label={currentLabel}
          data-wuxia-automation="turn-layer-editor"
          value={currentDraft}
          onChange={event => {
            if (editTarget === 'assistant') setAssistantDraftText(event.target.value);
            else setUserDraftText(event.target.value);
          }}
          disabled={!baseSnapshot || isSaving || (editTarget === 'user' && baseSnapshot.userMessageId == null)}
          spellCheck={false}
        />

        <div className="latest-reply-footer">
          <div className={`latest-reply-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {notice.tone === 'error' || notice.tone === 'warning' ? (
              <TriangleAlert size={15} aria-hidden="true" />
            ) : notice.tone === 'success' ? (
              <ShieldCheck size={15} aria-hidden="true" />
            ) : null}
            <span>{notice.message || (isDirty ? '修改尚未写入聊天文件。' : '当前内容与聊天文件一致。')}</span>
          </div>

          <div className="latest-reply-actions">
            <button type="button" className="latest-reply-action secondary" onClick={handleReload} disabled={isSaving}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>重新读取</span>
            </button>
            <button
              type="button"
              className="latest-reply-action primary"
              onClick={handleSave}
              disabled={!canSave}
              data-wuxia-automation="save-turn-layer"
            >
              <Save size={16} aria-hidden="true" />
              <span>{isSaving ? '写入中…' : '保存修改'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TurnLayerEditorModal;
