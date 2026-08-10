import { z } from 'zod';
import { GameStateSchema, type GameState } from '../domain/schema';

const CheckpointSchema = z.object({ id: z.string(), name: z.string(), createdAt: z.string(), important: z.boolean(), state: GameStateSchema }).strict();
const SaveEnvelopeSchema = z.object({
  format: z.literal('ck-lord-rpg-save'),
  formatVersion: z.literal(1),
  state: GameStateSchema,
  checkpoints: z.array(CheckpointSchema).max(10),
  eventHash: z.string(),
}).strict();

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
const variableKey = 'ck_lord_rpg';
let memoryEnvelope: SaveEnvelope | null = null;

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function eventHash(state: GameState): string {
  return hashText(JSON.stringify(state.eventLog.map(event => [event.id, event.revision, event.type, event.payload])));
}

function hasTavernVariables(): boolean {
  return typeof getVariables === 'function' && typeof replaceVariables === 'function';
}

export function createEnvelope(state: GameState, checkpoints: SaveEnvelope['checkpoints'] = []): SaveEnvelope {
  return SaveEnvelopeSchema.parse({ format: 'ck-lord-rpg-save', formatVersion: 1, state, checkpoints: checkpoints.slice(-10), eventHash: eventHash(state) });
}

export function loadSave(): SaveEnvelope | null {
  const raw = hasTavernVariables() ? (getVariables({ type: 'chat' }) as Record<string, unknown> | null)?.[variableKey] : memoryEnvelope;
  const parsed = SaveEnvelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.eventHash !== eventHash(parsed.data.state)) return null;
  return parsed.data;
}

export function saveState(state: GameState, checkpoints?: SaveEnvelope['checkpoints']): SaveEnvelope {
  const current = loadSave();
  const envelope = createEnvelope(state, checkpoints ?? current?.checkpoints ?? []);
  memoryEnvelope = envelope;
  if (hasTavernVariables()) {
    const variables = (getVariables({ type: 'chat' }) as Record<string, unknown> | null) ?? {};
    replaceVariables({ ...variables, [variableKey]: envelope }, { type: 'chat' });
  }
  return envelope;
}

export async function addCheckpoint(state: GameState, name: string, important = false): Promise<SaveEnvelope> {
  const current = loadSave() ?? createEnvelope(state);
  const checkpoint = CheckpointSchema.parse({ id: `checkpoint_${state.revision}_${Date.now().toString(36)}`, name: name.trim().slice(0, 40) || `修订 ${state.revision}`, createdAt: new Date().toISOString(), important, state });
  const envelope = saveState(state, [...current.checkpoints, checkpoint].slice(-10));
  if (important && typeof createChatMessages === 'function') {
    await createChatMessages([{ role: 'assistant', message: `【CK 领主 RPG 检查点】${checkpoint.name}\n日期：${state.currentDate} · 修订：${state.revision}`, data: { ckCheckpoint: { saveId: state.saveId, checkpointId: checkpoint.id, revision: state.revision } } }], { refresh: 'none' });
  }
  return envelope;
}

export function restoreCheckpoint(id: string): GameState | null {
  const envelope = loadSave();
  const checkpoint = envelope?.checkpoints.find(item => item.id === id);
  if (!checkpoint) return null;
  saveState(checkpoint.state, envelope?.checkpoints);
  return structuredClone(checkpoint.state);
}

export function exportSave(state: GameState): string {
  return JSON.stringify(saveState(state), null, 2);
}

export function importSave(source: string): { ok: true; state: GameState } | { ok: false; error: string } {
  try {
    const parsed = SaveEnvelopeSchema.safeParse(JSON.parse(source));
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    if (parsed.data.eventHash !== eventHash(parsed.data.state)) return { ok: false, error: '事件日志哈希不匹配，存档可能已损坏。' };
    saveState(parsed.data.state, parsed.data.checkpoints);
    return { ok: true, state: parsed.data.state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
