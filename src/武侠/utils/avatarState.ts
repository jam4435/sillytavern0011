import {
  emitSourcedEraVariableWriteAndWait,
  runDirectChatVariableWrite,
} from '../../shared/directVariableWrite';
import { parseCustomAvatarEntityKey, parsePresetAvatarId } from './avatarCatalog';
import {
  clearAvatarSelection,
  createAvatarEntityKey,
  listAvatarSelectionEntityKeys,
  readAvatarSelection,
} from './avatarStorage';

export const AVATAR_VARIABLE_VERSION = 1;

export interface AvatarVariableState {
  玩家?: string;
  人物: Record<string, string>;
}

export interface AvatarMigrationResult {
  migrated: boolean;
  playerAvatarRef?: string;
  npcAvatarCount: number;
  removedLegacyFieldCount: number;
  clearedLocalSelectionCount: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAvatarRef(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const avatarRef = value.trim();
  return parsePresetAvatarId(avatarRef) || parseCustomAvatarEntityKey(avatarRef) ? avatarRef : undefined;
}

function readChatVariables(): UnknownRecord {
  try {
    const variables = getVariables({ type: 'chat' });
    return isRecord(variables) ? variables : {};
  } catch {
    return {};
  }
}

function readStatData(): UnknownRecord {
  const chatVariables = readChatVariables();
  return isRecord(chatVariables.stat_data) ? chatVariables.stat_data : {};
}

export function parseAvatarVariableState(frontendVariables: unknown): AvatarVariableState {
  const frontend = isRecord(frontendVariables) ? frontendVariables : {};
  const avatarRoot = isRecord(frontend.头像) ? frontend.头像 : {};
  const people = isRecord(avatarRoot.人物) ? avatarRoot.人物 : {};
  const result: AvatarVariableState = {
    人物: Object.entries(people).reduce<Record<string, string>>((avatarRefs, [name, value]) => {
      const avatarRef = normalizeAvatarRef(value);
      if (name.trim() && avatarRef) {
        avatarRefs[name] = avatarRef;
      }
      return avatarRefs;
    }, {}),
  };
  const playerAvatarRef = normalizeAvatarRef(avatarRoot.玩家);
  if (playerAvatarRef) {
    result.玩家 = playerAvatarRef;
  }
  return result;
}

export function readAvatarVariableState(): AvatarVariableState {
  return parseAvatarVariableState(readStatData().前端变量);
}

function hasAvatarPath(kind: 'player' | 'npc', name?: string): boolean {
  const statData = readStatData();
  const frontend = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const avatarRoot = isRecord(frontend.头像) ? frontend.头像 : {};
  if (kind === 'player') {
    return Object.hasOwn(avatarRoot, '玩家');
  }
  const people = isRecord(avatarRoot.人物) ? avatarRoot.人物 : {};
  return !!name && Object.hasOwn(people, name);
}

async function writeAvatarRef(kind: 'player' | 'npc', avatarRef: string, name?: string): Promise<void> {
  const normalizedRef = normalizeAvatarRef(avatarRef);
  if (!normalizedRef) {
    throw new Error('头像引用必须是 preset: 或 custom: 开头的有效引用。');
  }
  if (kind === 'npc' && !name?.trim()) {
    throw new Error('写入人物头像时缺少人物名。');
  }

  const exists = hasAvatarPath(kind, name);
  const avatarPatch = kind === 'player'
    ? { 玩家: normalizedRef }
    : { 人物: { [name!.trim()]: normalizedRef } };
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: exists ? 'update' : 'insert',
    reason: kind === 'player' ? 'player-avatar-selection' : 'npc-avatar-selection',
    eventName: exists ? 'era:updateByObject' : 'era:insertByObject',
    attribution: 'background',
    detail: {
      stat_data: {
        前端变量: {
          头像: avatarPatch,
          头像版本: AVATAR_VARIABLE_VERSION,
        },
      },
    },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: '头像选择已发出，但 ERA 没有确认写入完成。',
  });
}

async function clearAvatarRef(kind: 'player' | 'npc', name?: string): Promise<void> {
  if (!hasAvatarPath(kind, name)) {
    return;
  }
  if (kind === 'npc' && !name?.trim()) {
    throw new Error('删除人物头像时缺少人物名。');
  }
  const path = kind === 'player'
    ? 'stat_data.前端变量.头像.玩家'
    : `stat_data.前端变量.头像.人物.${name!.trim()}`;
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'delete',
    reason: kind === 'player' ? 'player-avatar-clear' : 'npc-avatar-clear',
    eventName: 'era:deleteByPath',
    attribution: 'background',
    detail: { path },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: '头像清除已发出，但 ERA 没有确认写入完成。',
  });
}

export const setPlayerAvatarRef = (avatarRef: string): Promise<void> => writeAvatarRef('player', avatarRef);
export const clearPlayerAvatarRef = (): Promise<void> => clearAvatarRef('player');
export const setNpcAvatarRef = (name: string, avatarRef: string): Promise<void> => writeAvatarRef('npc', avatarRef, name);
export const clearNpcAvatarRef = (name: string): Promise<void> => clearAvatarRef('npc', name);

function copyWithoutAvatar(source: UnknownRecord): { value: UnknownRecord; removed: boolean } {
  if (!Object.hasOwn(source, '头像')) {
    return { value: source, removed: false };
  }
  const { 头像: _legacyAvatar, ...value } = source;
  return { value, removed: true };
}

/**
 * 将旧头像引用一次性迁移到前端变量。每个实体的优先级为：
 * 新结构 > 当前聊天的 localStorage selection > 旧 user/人物变量。
 */
export async function migrateAvatarState(): Promise<AvatarMigrationResult> {
  const chatVariables = readChatVariables();
  const statData = isRecord(chatVariables.stat_data) ? chatVariables.stat_data : {};
  const frontend = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const existingAvatarState = parseAvatarVariableState(frontend);
  const userData = isRecord(statData.user数据) ? statData.user数据 : {};
  const characters = isRecord(statData.角色数据) ? statData.角色数据 : {};
  const playerEntityKey = createAvatarEntityKey('player');
  const playerAvatarRef = existingAvatarState.玩家
    ?? readAvatarSelection(playerEntityKey)?.avatarRef
    ?? normalizeAvatarRef(userData.头像);
  const npcAvatarRefs = { ...existingAvatarState.人物 };

  for (const [name, rawCharacter] of Object.entries(characters)) {
    if (name.startsWith('$') || !isRecord(rawCharacter) || npcAvatarRefs[name]) {
      continue;
    }
    npcAvatarRefs[name] = readAvatarSelection(createAvatarEntityKey('npc', name))?.avatarRef
      ?? normalizeAvatarRef(rawCharacter.头像)
      ?? '';
    if (!npcAvatarRefs[name]) {
      delete npcAvatarRefs[name];
    }
  }

  let removedLegacyFieldCount = Object.hasOwn(userData, '头像') ? 1 : 0;
  for (const rawCharacter of Object.values(characters)) {
    if (isRecord(rawCharacter) && Object.hasOwn(rawCharacter, '头像')) {
      removedLegacyFieldCount += 1;
    }
  }
  const avatarVersion = Number(frontend.头像版本);
  const hasCurrentAvatarShape = isRecord(frontend.头像) && isRecord(frontend.头像.人物);
  const filledAvatarGap = playerAvatarRef !== existingAvatarState.玩家
    || Object.keys(npcAvatarRefs).some(name => npcAvatarRefs[name] !== existingAvatarState.人物[name]);
  const needsVariableMigration = avatarVersion !== AVATAR_VARIABLE_VERSION
    || !hasCurrentAvatarShape
    || filledAvatarGap
    || removedLegacyFieldCount > 0;

  if (needsVariableMigration) {
    await runDirectChatVariableWrite(
      {
        source: 'frontend',
        operation: 'replace',
        reason: 'avatar-variable-v1-migration',
      },
      () => updateVariablesWith(variables => {
        const currentStatData = isRecord(variables.stat_data) ? variables.stat_data : {};
        const currentFrontend = isRecord(currentStatData.前端变量) ? currentStatData.前端变量 : {};
        const currentUserData = isRecord(currentStatData.user数据) ? currentStatData.user数据 : {};
        const currentCharacters = isRecord(currentStatData.角色数据) ? currentStatData.角色数据 : {};
        const nextUserData = copyWithoutAvatar(currentUserData).value;
        const nextCharacters = Object.fromEntries(Object.entries(currentCharacters).map(([name, rawCharacter]) => {
          if (!isRecord(rawCharacter)) {
            return [name, rawCharacter];
          }
          return [name, copyWithoutAvatar(rawCharacter).value];
        }));
        const nextAvatarState: UnknownRecord = {
          人物: npcAvatarRefs,
        };
        if (playerAvatarRef) {
          nextAvatarState.玩家 = playerAvatarRef;
        }

        return {
          ...variables,
          stat_data: {
            ...currentStatData,
            前端变量: {
              ...currentFrontend,
              头像: nextAvatarState,
              头像版本: AVATAR_VARIABLE_VERSION,
            },
            user数据: nextUserData,
            角色数据: nextCharacters,
          },
        };
      }, { type: 'chat' }),
    );
  }

  const entityKeys = [...new Set([
    playerEntityKey,
    ...Object.keys(characters)
      .filter(name => !name.startsWith('$'))
      .map(name => createAvatarEntityKey('npc', name)),
    ...listAvatarSelectionEntityKeys(),
  ])];
  let clearedLocalSelectionCount = 0;
  for (const entityKey of entityKeys) {
    if (readAvatarSelection(entityKey)) {
      clearAvatarSelection(entityKey);
      clearedLocalSelectionCount += 1;
    }
  }

  return {
    migrated: needsVariableMigration || clearedLocalSelectionCount > 0,
    playerAvatarRef,
    npcAvatarCount: Object.keys(npcAvatarRefs).length,
    removedLegacyFieldCount,
    clearedLocalSelectionCount,
  };
}
