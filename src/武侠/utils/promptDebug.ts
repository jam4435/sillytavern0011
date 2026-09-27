type PromptCaptureListener = {
  stop: () => void;
};

type PromptContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url?: { url?: string } }
  | { type: 'video_url'; video_url?: { url?: string } }
  | { type?: string };

function formatPromptContentForDebug(content: SillyTavern.SendingMessage['content'] | unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(part => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        return '';
      }

      const promptPart = part as PromptContentPart;
      if (promptPart.type === 'text') {
        return typeof promptPart.text === 'string' ? promptPart.text.trim() : '';
      }
      if (promptPart.type === 'image_url') {
        return promptPart.image_url?.url ? `[image_url] ${promptPart.image_url.url}` : '[image_url]';
      }
      if (promptPart.type === 'video_url') {
        return promptPart.video_url?.url ? `[video_url] ${promptPart.video_url.url}` : '[video_url]';
      }
      return promptPart.type ? `[${promptPart.type}]` : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function formatPromptMessagesForDebug(messages: SillyTavern.SendingMessage[] | unknown): string {
  if (!Array.isArray(messages)) {
    return '';
  }

  return messages
    .map(message => {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        return '';
      }

      const promptMessage = message as SillyTavern.SendingMessage;
      const role = typeof promptMessage.role === 'string' ? promptMessage.role : 'unknown';
      const content = formatPromptContentForDebug(promptMessage.content);
      if (!content) {
        return '';
      }
      return `[${role}]\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export function captureNextCombinedPromptForDebug(onPrompt: (prompt: string) => void): PromptCaptureListener | null {
  if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') {
    return null;
  }

  const listeners: PromptCaptureListener[] = [];
  let captured = false;
  const handlePrompt = (prompt: string) => {
    if (captured || !prompt.trim()) {
      return;
    }
    captured = true;
    onPrompt(prompt);
  };

  // 只在“最终请求参数”事件的最后阶段抓取，确保 Prompt Template / EJS 等扩展
  // 已经完成对请求正文的异步改写。不要再监听 EJS 前的合并提示词事件，
  // 否则调试页会把模板源码误当成模型实际收到的输入。
  if (typeof eventMakeLast !== 'function') {
    return null;
  }

  if (tavern_events.GENERATE_AFTER_DATA) {
    listeners.push(
      eventMakeLast(tavern_events.GENERATE_AFTER_DATA, (generateData, dryRun) => {
        if (dryRun) {
          return;
        }

        const finalPrompt =
          typeof generateData?.prompt === 'string'
            ? generateData.prompt.trim()
            : formatPromptMessagesForDebug(generateData?.prompt);
        handlePrompt(finalPrompt);
      }),
    );
  }

  if (tavern_events.CHAT_COMPLETION_SETTINGS_READY) {
    listeners.push(
      eventMakeLast(tavern_events.CHAT_COMPLETION_SETTINGS_READY, generateData => {
        handlePrompt(formatPromptMessagesForDebug(generateData?.messages));
      }),
    );
  }

  if (listeners.length === 0) {
    return null;
  }

  return {
    stop: () => {
      listeners.forEach(listener => listener.stop());
    },
  };
}
