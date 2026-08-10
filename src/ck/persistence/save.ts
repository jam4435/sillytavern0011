import { z } from 'zod';
import { t } from '../content/basePack';
import { GameStateSchema, type GameState } from '../domain/schema';
import { deadlineDays, supportCount } from '../domain/selectors';

export const ChronicleEntrySchema = z
  .object({
    id: z.string(),
    date: z.string(),
    kind: z.enum(['system', 'speech', 'event', 'error']),
    title: z.string(),
    text: z.string(),
  })
  .strict();

export type ChronicleEntry = z.infer<typeof ChronicleEntrySchema>;

const ChronicleSchema = z.array(ChronicleEntrySchema).max(500);
const BranchAnchorSchema = z
  .object({
    messageId: z.number().int().nonnegative(),
    kind: z.enum(['manual', 'scene']),
    checkpointId: z.string(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const CheckpointSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    important: z.boolean(),
    state: GameStateSchema,
    chronicle: ChronicleSchema,
    stateHash: z.string(),
  })
  .strict();

const HistorySnapshotSchema = z
  .object({
    saveId: z.string(),
    checkpointId: z.string(),
    revision: z.number().int().nonnegative(),
    state: GameStateSchema,
    chronicle: ChronicleSchema,
    stateHash: z.string(),
  })
  .strict();

export const PublicProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    saveId: z.string(),
    revision: z.number().int().nonnegative(),
    date: z.string(),
    player: z.object({ id: z.string(), name: z.string(), location: z.string(), titles: z.array(z.string()) }).strict(),
    resources: z.object({ gold: z.number(), prestige: z.number(), legitimacy: z.number(), stress: z.number(), levies: z.number() }).strict(),
    politics: z.object({ support: z.number(), requiredSupport: z.number(), factionStatus: z.string(), factionPower: z.number(), ultimatumDays: z.number() }).strict(),
    activity: z.object({ id: z.string(), phase: z.string(), participantIds: z.array(z.string()) }).nullable(),
    pending: z.object({ letters: z.number(), promises: z.number(), worldSignals: z.number() }).strict(),
  })
  .strict();

export type PublicProjection = z.infer<typeof PublicProjectionSchema>;

export const SaveEnvelopeSchema = z
  .object({
    format: z.literal('ck-lord-rpg-save'),
    formatVersion: z.literal(2),
    state: GameStateSchema,
    chronicle: ChronicleSchema,
    checkpoints: z.array(CheckpointSchema).max(10),
    eventHash: z.string(),
    stateHash: z.string(),
    branchAnchor: BranchAnchorSchema.nullable(),
  })
  .strict();

const LegacyCheckpointSchema = z
  .object({ id: z.string(), name: z.string(), createdAt: z.string(), important: z.boolean(), state: GameStateSchema })
  .strict();
const LegacySaveEnvelopeSchema = z
  .object({
    format: z.literal('ck-lord-rpg-save'),
    formatVersion: z.literal(1),
    state: GameStateSchema,
    checkpoints: z.array(LegacyCheckpointSchema).max(10),
    eventHash: z.string(),
  })
  .strict();

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
export type SaveCheckpoint = z.infer<typeof CheckpointSchema>;
export type BranchAnchor = z.infer<typeof BranchAnchorSchema>;

const variableKey = 'ck_lord_rpg';
const publicVariableKey = 'ck_lord_rpg_public';
let memoryEnvelope: SaveEnvelope | null = null;

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortForHash(item)]));
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForHash(value));
}

export function hashGameState(state: GameState): string {
  return hashText(stableStringify(state));
}

function hashEventLog(state: GameState): string {
  return hashText(stableStringify(state.eventLog.map(event => [event.id, event.revision, event.type, event.payload])));
}

function legacyEventHash(state: GameState): string {
  return hashText(JSON.stringify(state.eventLog.map(event => [event.id, event.revision, event.type, event.payload])));
}

function validStateSemantics(state: GameState): boolean {
  const eventIds = new Set<string>();
  return state.eventLog.every(event => {
    if (event.revision > state.revision || eventIds.has(event.id)) return false;
    eventIds.add(event.id);
    return true;
  });
}

function hasTavernVariables(): boolean {
  return typeof getVariables === 'function' && typeof updateVariablesWith === 'function';
}

function cloneState(state: GameState): GameState {
  return GameStateSchema.parse(JSON.parse(JSON.stringify(state)));
}

function normalizeChronicle(chronicle: ChronicleEntry[]): ChronicleEntry[] {
  return ChronicleSchema.parse(chronicle.slice(-500));
}

export function createPublicProjection(state: GameState): PublicProjection {
  const player = state.characters[state.playerCharacterId];
  const location = state.locations[player.locationId];
  const faction = state.factions.faction_liberty;
  const activity = state.activities[state.scenario.feastId];
  return PublicProjectionSchema.parse({
    schemaVersion: 1,
    saveId: state.saveId,
    revision: state.revision,
    date: state.currentDate,
    player: {
      id: player.id,
      name: t(player.nameKey),
      location: t(location?.nameKey ?? player.locationId),
      titles: player.titleIds.map(id => t(state.titles[id]?.nameKey ?? id)),
    },
    resources: state.resources,
    politics: {
      support: supportCount(state),
      requiredSupport: state.scenario.requiredSupport,
      factionStatus: faction.status,
      factionPower: faction.power,
      ultimatumDays: deadlineDays(state),
    },
    activity: activity ? { id: activity.id, phase: activity.phase, participantIds: activity.participantIds } : null,
    pending: {
      letters: Object.values(state.communications).filter(item => item.status === 'in_transit').length,
      promises: Object.values(state.promises).filter(item => item.status === 'active').length,
      worldSignals: state.signals.filter(item => !item.consumed).length,
    },
  });
}

export function createEnvelope(
  state: GameState,
  options: {
    chronicle?: ChronicleEntry[];
    checkpoints?: SaveEnvelope['checkpoints'];
    branchAnchor?: BranchAnchor | null;
  } = {},
): SaveEnvelope {
  return SaveEnvelopeSchema.parse({
    format: 'ck-lord-rpg-save',
    formatVersion: 2,
    state,
    chronicle: normalizeChronicle(options.chronicle ?? []),
    checkpoints: (options.checkpoints ?? []).slice(-10),
    eventHash: hashEventLog(state),
    stateHash: hashGameState(state),
    branchAnchor: options.branchAnchor ?? null,
  });
}

function validateEnvelope(envelope: SaveEnvelope): boolean {
  return envelope.eventHash === hashEventLog(envelope.state)
    && envelope.stateHash === hashGameState(envelope.state)
    && validStateSemantics(envelope.state)
    && envelope.checkpoints.every(checkpoint => checkpoint.stateHash === hashGameState(checkpoint.state));
}

function migrateLegacy(raw: unknown): SaveEnvelope | null {
  const parsed = LegacySaveEnvelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.eventHash !== legacyEventHash(parsed.data.state) || !validStateSemantics(parsed.data.state)) return null;
  const chronicle: ChronicleEntry[] = [];
  const checkpoints = parsed.data.checkpoints.map(checkpoint => CheckpointSchema.parse({
    ...checkpoint,
    chronicle,
    stateHash: hashGameState(checkpoint.state),
  }));
  return createEnvelope(parsed.data.state, { chronicle, checkpoints });
}

export function loadSave(): SaveEnvelope | null {
  const raw = hasTavernVariables() ? (getVariables({ type: 'chat' }) as Record<string, unknown> | null)?.[variableKey] : memoryEnvelope;
  const parsed = SaveEnvelopeSchema.safeParse(raw);
  if (parsed.success && validateEnvelope(parsed.data)) return parsed.data;
  const migrated = migrateLegacy(raw);
  if (migrated) {
    memoryEnvelope = migrated;
    if (hasTavernVariables()) {
      updateVariablesWith(variables => ({ ...variables, [variableKey]: migrated, [publicVariableKey]: createPublicProjection(migrated.state) }), { type: 'chat' });
    }
  }
  return migrated;
}

export function saveState(
  state: GameState,
  options: {
    chronicle?: ChronicleEntry[];
    checkpoints?: SaveEnvelope['checkpoints'];
    branchAnchor?: BranchAnchor | null;
  } = {},
): SaveEnvelope {
  const current = loadSave();
  const envelope = createEnvelope(state, {
    chronicle: options.chronicle ?? current?.chronicle ?? [],
    checkpoints: options.checkpoints ?? current?.checkpoints ?? [],
    branchAnchor: options.branchAnchor === undefined ? current?.branchAnchor ?? null : options.branchAnchor,
  });
  memoryEnvelope = envelope;
  if (hasTavernVariables()) {
    const publicProjection = createPublicProjection(state);
    updateVariablesWith(variables => ({ ...variables, [variableKey]: envelope, [publicVariableKey]: publicProjection }), { type: 'chat' });
  }
  return envelope;
}

function historySnapshot(checkpoint: SaveCheckpoint) {
  return HistorySnapshotSchema.parse({
    saveId: checkpoint.state.saveId,
    checkpointId: checkpoint.id,
    revision: checkpoint.state.revision,
    state: checkpoint.state,
    chronicle: checkpoint.chronicle,
    stateHash: checkpoint.stateHash,
  });
}

function latestAssistantMessageId(): number | null {
  if (typeof getChatMessages !== 'function') return null;
  const messages = getChatMessages(-1, { role: 'assistant' });
  return messages[0]?.message_id ?? null;
}

export async function addCheckpoint(state: GameState, chronicle: ChronicleEntry[], name: string, important = false): Promise<SaveEnvelope> {
  const current = loadSave() ?? createEnvelope(state, { chronicle });
  const checkpoint = CheckpointSchema.parse({
    id: `checkpoint_${state.revision}_${Date.now().toString(36)}`,
    name: name.trim().slice(0, 40) || `修订 ${state.revision}`,
    createdAt: new Date().toISOString(),
    important,
    state: cloneState(state),
    chronicle: normalizeChronicle(chronicle),
    stateHash: hashGameState(state),
  });
  let envelope = saveState(state, { chronicle, checkpoints: [...current.checkpoints, checkpoint].slice(-10) });
  if (important && typeof createChatMessages === 'function') {
    await createChatMessages([{
      role: 'assistant',
      message: `【CK 领主 RPG 检查点】${checkpoint.name}\n日期：${state.currentDate} · 修订：${state.revision}`,
      data: { ckLordRpg: { kind: 'manual', snapshot: historySnapshot(checkpoint) } },
    }], { refresh: 'none' });
    const messageId = latestAssistantMessageId();
    if (messageId !== null) {
      envelope = saveState(state, {
        chronicle,
        checkpoints: envelope.checkpoints,
        branchAnchor: { messageId, kind: 'manual', checkpointId: checkpoint.id, revision: state.revision },
      });
    }
  }
  return envelope;
}

export function restoreCheckpoint(id: string): { state: GameState; chronicle: ChronicleEntry[] } | null {
  const envelope = loadSave();
  const checkpoint = envelope?.checkpoints.find(item => item.id === id);
  if (!checkpoint || checkpoint.stateHash !== hashGameState(checkpoint.state)) return null;
  const state = cloneState(checkpoint.state);
  const chronicle = normalizeChronicle(checkpoint.chronicle);
  saveState(state, { chronicle, checkpoints: envelope?.checkpoints, branchAnchor: null });
  return { state, chronicle };
}

export async function writeNarrativeExchange(state: GameState, chronicle: ChronicleEntry[], playerText: string, narration: string): Promise<SaveEnvelope> {
  if (typeof createChatMessages !== 'function') return saveState(state, { chronicle });
  const checkpoint = CheckpointSchema.parse({
    id: `scene_${state.revision}_${Date.now().toString(36)}`,
    name: `正式场景 · ${state.currentDate}`,
    createdAt: new Date().toISOString(),
    important: false,
    state: cloneState(state),
    chronicle: normalizeChronicle(chronicle),
    stateHash: hashGameState(state),
  });
  await createChatMessages([
    { role: 'user', message: playerText, data: { ckLordRpg: { kind: 'scene_input', saveId: state.saveId, revision: state.revision } } },
    { role: 'assistant', message: narration, data: { ckLordRpg: { kind: 'scene', snapshot: historySnapshot(checkpoint) } } },
  ], { refresh: 'none' });
  const messageId = latestAssistantMessageId();
  return saveState(state, {
    chronicle,
    branchAnchor: messageId === null ? undefined : { messageId, kind: 'scene', checkpointId: checkpoint.id, revision: state.revision },
  });
}

export function findLatestHistorySnapshot(): { messageId: number; kind: 'manual' | 'scene'; snapshot: z.infer<typeof HistorySnapshotSchema> } | null {
  if (typeof getChatMessages !== 'function' || typeof getLastMessageId !== 'function') return null;
  const lastMessageId = getLastMessageId();
  if (lastMessageId < 0) return null;
  const messages = getChatMessages(`0-${lastMessageId}`, { role: 'assistant' });
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index].data?.ckLordRpg;
    if (!raw || (raw.kind !== 'manual' && raw.kind !== 'scene')) continue;
    const parsed = HistorySnapshotSchema.safeParse(raw.snapshot);
    if (parsed.success && parsed.data.stateHash === hashGameState(parsed.data.state)) {
      return { messageId: messages[index].message_id, kind: raw.kind, snapshot: parsed.data };
    }
  }
  return null;
}

export function restoreLatestHistoryBranch(): SaveEnvelope | null {
  const current = loadSave();
  const history = findLatestHistorySnapshot();
  if (!current || !current.branchAnchor || !history || current.branchAnchor.messageId === history.messageId) return current;
  if (history.snapshot.saveId !== current.state.saveId) return current;
  return saveState(cloneState(history.snapshot.state), {
    chronicle: history.snapshot.chronicle,
    checkpoints: current.checkpoints,
    branchAnchor: {
      messageId: history.messageId,
      kind: history.kind,
      checkpointId: history.snapshot.checkpointId,
      revision: history.snapshot.revision,
    },
  });
}

export function exportSave(state: GameState, chronicle: ChronicleEntry[] = []): string {
  return JSON.stringify(saveState(state, { chronicle }), null, 2);
}

export function importSave(source: string): { ok: true; state: GameState; chronicle: ChronicleEntry[] } | { ok: false; error: string } {
  try {
    const raw: unknown = JSON.parse(source);
    const parsed = SaveEnvelopeSchema.safeParse(raw);
    const envelope = parsed.success ? parsed.data : migrateLegacy(raw);
    if (!envelope || !validateEnvelope(envelope)) return { ok: false, error: '存档结构、完整状态哈希或事件链校验失败。' };
    saveState(envelope.state, { chronicle: envelope.chronicle, checkpoints: envelope.checkpoints, branchAnchor: envelope.branchAnchor });
    return { ok: true, state: envelope.state, chronicle: envelope.chronicle };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function clearMemorySaveForTests(): void {
  memoryEnvelope = null;
}
