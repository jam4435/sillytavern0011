import {
  getPresetStorageCleanupCandidates,
  getRegexRuleContentSignature,
  stripSelectedPresetRegexMatches,
  type DisplaySettings,
} from './settingsManager';

type ChatMessageForCleanup = {
  message_id: number;
  role: 'system' | 'assistant' | 'user';
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

export type CurrentChatPresetCleanupResult = {
  updatedMessages: number;
  updatedSwipes: number;
  removedCharacters: number;
  skippedBecauseNoSelection: boolean;
};

function getSelectedSignatures(settings: DisplaySettings, presetName: string): string[] {
  return settings.presetStorageExcludedRegexSignaturesByPreset[presetName.trim()] || [];
}

export function cleanChatMessagePresetBlocks(
  message: ChatMessageForCleanup,
  rules: ReturnType<typeof getPresetStorageCleanupCandidates>,
  selectedSignatures: string[],
): { patch: Partial<ChatMessageForCleanup> | null; updatedSwipes: number; removedCharacters: number } {
  if (message.role !== 'assistant') {
    return { patch: null, updatedSwipes: 0, removedCharacters: 0 };
  }

  let updatedSwipes = 0;
  let removedCharacters = 0;
  const patch: Partial<ChatMessageForCleanup> = { message_id: message.message_id };

  if (Array.isArray(message.swipes) && message.swipes.length > 0) {
    const nextSwipes = message.swipes.map(text => {
      const next = stripSelectedPresetRegexMatches(text, rules, selectedSignatures);
      if (next !== text) {
        updatedSwipes += 1;
        removedCharacters += Math.max(0, text.length - next.length);
      }
      return next;
    });

    const activeIndex = Math.max(
      0,
      Math.min(Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0, nextSwipes.length - 1),
    );
    const nextMessage = nextSwipes[activeIndex] ?? message.message ?? '';
    const currentMessage = message.message ?? '';
    if (nextMessage !== currentMessage) {
      removedCharacters += Math.max(0, currentMessage.length - nextMessage.length);
    }

    if (updatedSwipes === 0 && nextMessage === currentMessage) {
      return { patch: null, updatedSwipes: 0, removedCharacters: 0 };
    }

    patch.message = nextMessage;
    patch.swipes = nextSwipes;
    patch.swipe_id = activeIndex;
    return { patch, updatedSwipes, removedCharacters };
  }

  const currentMessage = message.message ?? '';
  const nextMessage = stripSelectedPresetRegexMatches(currentMessage, rules, selectedSignatures);
  if (nextMessage === currentMessage) {
    return { patch: null, updatedSwipes: 0, removedCharacters: 0 };
  }
  removedCharacters += Math.max(0, currentMessage.length - nextMessage.length);
  patch.message = nextMessage;
  return { patch, updatedSwipes: 0, removedCharacters };
}

/**
 * 对当前聊天做一次显式的、玩家确认后的历史瘦身。
 * 只应用当前预设中已勾选的附加块规则；不会删除 VariableThink/ERA/summary 等受保护块。
 */
export async function cleanupCurrentChatPresetBlocks(
  settings: DisplaySettings,
  presetName: string,
): Promise<CurrentChatPresetCleanupResult> {
  const normalizedPresetName = presetName.trim();
  const selectedSignatures = getSelectedSignatures(settings, normalizedPresetName);
  if (!normalizedPresetName || selectedSignatures.length === 0) {
    return {
      updatedMessages: 0,
      updatedSwipes: 0,
      removedCharacters: 0,
      skippedBecauseNoSelection: true,
    };
  }

  const candidateRules = getPresetStorageCleanupCandidates().filter(rule =>
    selectedSignatures.includes(getRegexRuleContentSignature(rule)),
  );
  if (candidateRules.length === 0) {
    return {
      updatedMessages: 0,
      updatedSwipes: 0,
      removedCharacters: 0,
      skippedBecauseNoSelection: true,
    };
  }

  const messages = getChatMessages('0-{{lastMessageId}}', {
    role: 'assistant',
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageForCleanup[];

  const patches: Array<{ message_id: number } & Partial<ChatMessageForCleanup>> = [];
  let updatedSwipes = 0;
  let removedCharacters = 0;

  for (const message of messages) {
    const cleaned = cleanChatMessagePresetBlocks(message, candidateRules, selectedSignatures);
    if (!cleaned.patch) {
      continue;
    }
    patches.push(cleaned.patch as { message_id: number } & Partial<ChatMessageForCleanup>);
    updatedSwipes += cleaned.updatedSwipes;
    removedCharacters += cleaned.removedCharacters;
  }

  if (patches.length > 0) {
    // 不刷新消息楼层，避免 display loader 因批量改写而重复重建 iframe。
    await setChatMessages(patches, { refresh: 'none' });
  }

  return {
    updatedMessages: patches.length,
    updatedSwipes,
    removedCharacters,
    skippedBecauseNoSelection: false,
  };
}
