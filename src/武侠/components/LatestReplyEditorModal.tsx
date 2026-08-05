import { FilePenLine, RefreshCw, Save, ShieldCheck, TriangleAlert } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivePanel } from '../types';
import type { LatestAssistantSnapshot } from '../utils/latestAssistantEditor';
import Modal from './Modal';

export interface LatestReplyEditorSaveOutcome {
  snapshot: LatestAssistantSnapshot;
  warning?: string;
}

interface LatestReplyEditorModalProps {
  isOpen: boolean;
  snapshot: LatestAssistantSnapshot | null;
  onClose: () => void;
  onReload: () => LatestAssistantSnapshot | null;
  onSave: (snapshot: LatestAssistantSnapshot, draftText: string) => Promise<LatestReplyEditorSaveOutcome>;
}

type EditorNotice =
  | { tone: 'idle'; message: '' }
  | { tone: 'success' | 'warning' | 'error'; message: string };

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const LatestReplyEditorModal: React.FC<LatestReplyEditorModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onReload,
  onSave,
}) => {
  const [baseSnapshot, setBaseSnapshot] = useState<LatestAssistantSnapshot | null>(snapshot);
  const [draftText, setDraftText] = useState(snapshot?.rawText ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<EditorNotice>({ tone: 'idle', message: '' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBaseSnapshot(snapshot);
    setDraftText(snapshot?.rawText ?? '');
    setNotice({ tone: 'idle', message: '' });
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, snapshot]);

  const isDirty = Boolean(baseSnapshot && draftText !== baseSnapshot.rawText);
  const canSave = Boolean(baseSnapshot && isDirty && draftText.trim() && !isSaving);
  const locatorText = useMemo(() => {
    if (!baseSnapshot) return '没有可编辑的最新回复';
    const swipeCount = Math.max(0, baseSnapshot.metadata.swipeCount);
    return swipeCount > 0
      ? `楼层 #${baseSnapshot.messageId} · 回复分支 ${baseSnapshot.swipeId + 1}/${swipeCount}`
      : `楼层 #${baseSnapshot.messageId} · 单一回复`;
  }, [baseSnapshot]);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty && !window.confirm('尚有未保存的回复修改，确定放弃并关闭吗？')) return;
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

  const handleReload = () => {
    if (isSaving) return;
    if (isDirty && !window.confirm('重新读取会丢弃当前未保存的修改，是否继续？')) return;

    try {
      const latest = onReload();
      if (!latest) {
        setNotice({ tone: 'error', message: '当前最后一条消息已不是可编辑的 AI 回复。' });
        return;
      }
      setBaseSnapshot(latest);
      setDraftText(latest.rawText);
      setNotice({ tone: 'success', message: '已重新读取聊天文件中的最新回复。' });
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      setNotice({ tone: 'error', message: `重新读取失败：${getErrorMessage(error)}` });
    }
  };

  const handleSave = async () => {
    if (!baseSnapshot || !canSave) return;
    setIsSaving(true);
    setNotice({ tone: 'idle', message: '' });
    try {
      const outcome = await onSave(baseSnapshot, draftText);
      setBaseSnapshot(outcome.snapshot);
      setDraftText(outcome.snapshot.rawText);
      setNotice({
        tone: outcome.warning ? 'warning' : 'success',
        message: outcome.warning ? `回复已覆写；${outcome.warning}` : '最新回复已覆写，iframe 保持不刷新。',
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
      title="校订最新回复"
      type={ActivePanel.SETTINGS}
      overlayClassName="latest-reply-overlay"
      boxClassName="latest-reply-modal"
      contentClassName="latest-reply-modal-content"
      showPaperTexture={false}
    >
      <div className="latest-reply-editor">
        <div className="latest-reply-ledger">
          <div className="latest-reply-locator">
            <FilePenLine size={16} aria-hidden="true" />
            <span>{locatorText}</span>
          </div>
          <div className="latest-reply-guardrail">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>完整原文可编辑；&lt;era_data&gt; 身份段必须原样保留，变量动作改动会触发 ERA 重算。</span>
          </div>
        </div>

        <label className="latest-reply-textarea-label" htmlFor="latest-reply-raw-text">
          AI 返回原文
        </label>
        <textarea
          ref={textareaRef}
          id="latest-reply-raw-text"
          className="latest-reply-textarea"
          aria-label="最新 AI 回复原文"
          data-wuxia-automation="latest-reply-editor"
          value={draftText}
          onChange={event => setDraftText(event.target.value)}
          disabled={!baseSnapshot || isSaving}
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
              data-wuxia-automation="save-latest-reply"
            >
              <Save size={16} aria-hidden="true" />
              <span>{isSaving ? '写入中…' : '覆写最新回复'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default LatestReplyEditorModal;
