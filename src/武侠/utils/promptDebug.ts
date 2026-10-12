import _ from 'lodash';
import { unescapeEraData } from '../../ERA变量框架/utils/data';
import { removeMetaFields } from '../../ERA变量框架/utils/era_data';

/**
 * 仅供调试页查看：基于生成时的聊天 stat_data 展开 ERA 宏。
 * 不改动发送给模型的提示词，也不以回合结算后的变量冒充生成时快照。
 * 查不到的宏保留原文，便于排查路径错误。
 */
export function expandEraMacrosForDebug(prompt: string, statData: Record<string, unknown>): string {
  if (!/{{\s*ERA(?:-withmeta)?\s*:/i.test(prompt)) return prompt;

  return prompt.replace(/{{\s*ERA(-withmeta)?\s*:\s*([^}]+?)\s*}}/gi, (original, withMeta: string, rawPath: string) => {
    const path = rawPath.trim();
    const value = path === '$ALLDATA' ? statData : _.get(statData, path);
    if (value === undefined) return original;

    const displayValue = unescapeEraData(withMeta ? value : removeMetaFields(value));
    return displayValue !== null && typeof displayValue === 'object'
      ? JSON.stringify(displayValue)
      : String(displayValue);
  });
}

export function expandCurrentChatEraMacrosForDebug(prompt: string): string {
  if (!/{{\s*ERA(?:-withmeta)?\s*:/i.test(prompt)) return prompt;
  try {
    const chatVariables = getVariables({ type: 'chat' }) as { stat_data?: unknown };
    const statData = chatVariables?.stat_data;
    return statData && typeof statData === 'object' && !Array.isArray(statData)
      ? expandEraMacrosForDebug(prompt, statData as Record<string, unknown>)
      : prompt;
  } catch {
    // 调试视图不能阻断正文生成；失败时保留宏原文。
    return prompt;
  }
}

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
  if (typeof eventMakeLast !== 'function' || typeof tavern_events === 'undefined') {
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
  if (tavern_events.GENERATE_AFTER_DATA) {
    listeners.push(
      eventMakeLast(tavern_events.GENERATE_AFTER_DATA, (generateData, dryRun) => {
        if (dryRun) {
          return;
        }

        const rawPrompt = generateData?.prompt as unknown;
        const finalPrompt =
          typeof rawPrompt === 'string' ? rawPrompt.trim() : formatPromptMessagesForDebug(rawPrompt);
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
