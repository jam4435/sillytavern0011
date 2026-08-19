import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

type EventListener = (...args: unknown[]) => unknown;

const listeners = new Map<string, Set<EventListener>>();

const eventOnMock = vi.fn((eventName: string, listener: EventListener) => {
  const eventListeners = listeners.get(eventName) ?? new Set<EventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);
  return {
    stop: vi.fn(() => {
      eventListeners.delete(listener);
    }),
  };
});

const eventEmitMock = vi.fn(async (eventName: string, ...args: unknown[]) => {
  const eventListeners = [...(listeners.get(eventName) ?? [])];
  await Promise.all(eventListeners.map(listener => listener(...args)));
});

Object.assign(globalThis, {
  eventOn: eventOnMock,
  eventOnce: vi.fn((eventName: string, listener: EventListener) => {
    const registration = eventOnMock(eventName, (...args: unknown[]) => {
      registration.stop();
      return listener(...args);
    });
    return registration;
  }),
  eventEmit: eventEmitMock,
  getVariables: vi.fn(() => ({ stat_data: {} })),
  getAllVariables: vi.fn(() => ({ stat_data: {} })),
  updateVariablesWith: vi.fn((updater: (variables: Record<string, unknown>) => Record<string, unknown>) =>
    updater({ stat_data: {} }),
  ),
  getChatMessages: vi.fn(() => []),
  tavern_events: {
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_SWIPED: 'message_swiped',
    CHAT_CHANGED: 'chat_id_changed',
  },
  SillyTavern: {
    characterId: '0',
    groupId: '',
    characters: [{ name: '测试角色', avatar: 'test-character.png' }],
    groups: [],
    chat: [],
    getCurrentChatId: vi.fn(() => 'test-chat'),
    getRequestHeaders: vi.fn(() => ({
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': 'test-token',
    })),
    openCharacterChat: vi.fn(async () => undefined),
    openGroupChat: vi.fn(async () => undefined),
    renameChat: vi.fn(async () => undefined),
  },
});

afterEach(() => {
  listeners.clear();
  if (typeof window !== 'undefined') {
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

export { eventEmitMock, eventOnMock, listeners };
