import React from 'react';
import ChatInput from './ChatInput';
import FullscreenButton from './FullscreenButton';

interface OpeningScreenProps {
  welcomeLine: string;
  playerName?: string;
  location?: string;
  isLoading?: boolean;
  onSend: (message: string) => Promise<void> | void;
}

const OpeningScreen: React.FC<OpeningScreenProps> = ({
  welcomeLine,
  playerName,
  location,
  isLoading = false,
  onSend,
}) => {
  return (
    <div className="opening-screen">
      <div className="opening-bg-layer">
        <div className="opening-bg-img"></div>
        <div className="opening-bg-vignette"></div>
      </div>

      <FullscreenButton className="splash-fullscreen-btn" />

      <main className="opening-content" aria-label="开局输入">
        <header className="opening-header">
          <span className="opening-kicker">{location || '江湖未定'}</span>
          <h1 className="opening-title">{playerName || '无名客'}</h1>
          <p className="opening-welcome">{welcomeLine}</p>
        </header>

        <section className="opening-prompt">
          <p>请输入你想要的初始开局场景，或者直接输入“开始”。</p>
        </section>

        <div className="opening-input-wrap">
          <ChatInput
            onSend={onSend}
            placeholder="例如：我在一个山洞醒来，身边只有半截断剑..."
            disabled={isLoading}
          />
        </div>
      </main>
    </div>
  );
};

export default OpeningScreen;
