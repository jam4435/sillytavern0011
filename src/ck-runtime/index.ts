import {
  createPublicProjection,
  loadSave,
  PublicProjectionSchema,
  SaveEnvelopeSchema,
} from '../ck/persistence/save';
import { z } from 'zod';

const macroPattern = /\{\{CK(?::([^}]+))?\}\}/gi;

function publicProjection(): unknown {
  return (getVariables({ type: 'chat' }) as Record<string, unknown>).ck_lord_rpg_public;
}

function readPath(root: unknown, path: string): unknown {
  if (!path || path === '$ALLDATA') return root;
  return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, root);
}

function macroText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function syncPublicProjection(): void {
  const save = loadSave();
  if (!save) return;
  const projection = createPublicProjection(save.state);
  updateVariablesWith(variables => ({ ...variables, ck_lord_rpg_public: projection }), { type: 'chat' });
}

function init(): void {
  registerVariableSchema(z.object({
    ck_lord_rpg: SaveEnvelopeSchema.optional(),
    ck_lord_rpg_public: PublicProjectionSchema.optional(),
  }).passthrough(), { type: 'chat' });

  const macro = registerMacroLike(macroPattern, (_context, _fullMatch, path: string | undefined) => {
    return macroText(readPath(publicProjection(), path?.trim() || '$ALLDATA'));
  });

  const listeners: EventOnReturn[] = [];
  const notify = async (historyChanged: boolean) => {
    syncPublicProjection();
    await eventEmit('ck:host_state_changed', historyChanged);
  };
  listeners.push(eventOn(tavern_events.CHAT_CHANGED, () => notify(false)));
  for (const eventName of [tavern_events.MESSAGE_SWIPED, tavern_events.MESSAGE_DELETED, tavern_events.MESSAGE_EDITED, tavern_events.MESSAGE_UPDATED]) {
    listeners.push(eventOn(eventName, () => notify(true)));
  }

  syncPublicProjection();
  window.addEventListener('pagehide', () => {
    listeners.forEach(listener => listener.stop());
    macro.unregister();
  }, { once: true });
}

if (typeof $ === 'function') $(() => init());
else init();
