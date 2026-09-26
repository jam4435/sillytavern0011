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
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<EditorNotice>({ tone: 'idle', message: '' });
  const assistantTextareaRef = useRef<HTMLTextAreaElement>(null);

  const applySnapshot = useCallback((next: EditableTurnSnapshot | null) => {
    setBaseSnapshot(next);
    setUserDraftText(next?.userRawText ?? '');
    setAssistantDraftText(next?.assistant.rawText ?? '');
    setJumpValue(next ? String(next.assistant.messageId) : '');
    window.requestAnimationFrame(() => assistantTextareaRef.current?.focus());
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
    const userPart = baseSnapshot.userMessageId === null ? '无配对 User' : `User #${baseSnapshot.userMessageId}`;
    const swipeCount = Math.max(0, baseSnapshot.assistant.metadata.swipeCount);
    const swipePart = swipeCount > 0
      ? `回复分支 ${baseSnapshot.assistant.swipeId + 1}/${swipeCount}`
      : '单一回复';
    return `${userPart} → AI #${baseSnapshot.assistant.messageId} · ${swipePart}`;
  }, [baseSnapshot]);

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

  const handleSave = async () => {
    if (!baseSnapshot || !canSave) return;
    setIsSaving(true);
    setNotice({ tone: 'idle', message: '' });
    try {
      const outcome = await onSave(baseSnapshot, userDraftText, assistantDraftText);
      applySnapshot(outcome.snapshot);
      setNotice({
        tone: outcome.warning ? 'warning' : 'success',
        message: outcome.warning ? `楼层已保存；${outcome.warning}` : 'User 与 AI 楼层内容已保存。',
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
      title="浏览 / 校订聊天楼层"
      type={ActivePanel.SETTINGS}
      overlayClassName="latest-reply-overlay"
      boxClassName="latest-reply-modal"
      contentClassName="latest-reply-modal-content"
      showPaperTexture={false}
    >
      <div className="latest-reply-editor turn-layer-editor">
        <div className="latest-reply-ledger">
          <div className="latest-reply-locator">
            <FilePenLine size={16} aria-hidden="true" />
            <span>{locatorText}</span>
          </div>
          <div className="latest-reply-guardrail">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>可修改配对 User 输入与 AI active swipe；AI 的 &lt;era_data&gt; 不可改，变量动作变更会触发 ERA 重算。</span>
          </div>
        </div>

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

        <div className="turn-layer-edit-grid">
          <section className="turn-layer-edit-pane">
            <div className="turn-layer-edit-heading">
              User 输入 {baseSnapshot?.userMessageId !== null ? `#${baseSnapshot?.userMessageId ?? ''}` : ''}
            </div>
            <textarea
              className="latest-reply-textarea"
              aria-label="当前回合 User 输入"
              value={userDraftText}
              onChange={event => setUserDraftText(event.target.value)}
              disabled={!baseSnapshot || baseSnapshot.userMessageId === null || isSaving}
              spellCheck={false}
            />
          </section>

          <section className="turn-layer-edit-pane">
            <div className="turn-layer-edit-heading">AI 输出 #{baseSnapshot?.assistant.messageId ?? ''}</div>
            <textarea
              ref={assistantTextareaRef}
              className="latest-reply-textarea"
              aria-label="当前回合 AI 输出"
              data-wuxia-automation="turn-layer-assistant-editor"
              value={assistantDraftText}
              onChange={event => setAssistantDraftText(event.target.value)}
              disabled={!baseSnapshot || isSaving}
              spellCheck={false}
            />
          </section>
        </div>

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
            <button
              type="button"
              className="latest-reply-action secondary"
              onClick={() => navigateTo(baseSnapshot?.assistant.messageId)}
              disabled={isSaving}
            >
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
              <span>{isSaving ? '写入中…' : '保存本回合'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TurnLayerEditorModal;
