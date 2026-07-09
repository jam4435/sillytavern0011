import {
  findAvatarsByName,
  getAvatarFallbackInitial,
  getAvatarFromRef,
  getDefaultAvatarForGender,
  parsePresetAvatarId,
  parseCustomAvatarEntityKey,
  type AvatarCatalogEntry,
  type AvatarGender,
} from './avatarCatalog';

const STORAGE_PREFIX = 'wuxia:avatar:v1';
const SELECTION_STORAGE_PREFIX = 'wuxia:avatar-selection:v1';
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

export interface StoredCustomAvatar {
  version: 1;
  imageData: string;
  fileName?: string;
  updatedAt: number;
}

export interface StoredAvatarSelection {
  version: 1;
  avatarRef: string;
  updatedAt: number;
}

export interface AvatarResolveInput {
  entityKey: string;
  avatarRef?: string;
  name?: string;
  gender?: AvatarGender;
}

export interface ResolvedAvatarSource {
  src: string | null;
  label: string;
  source: 'custom' | 'preset' | 'matched' | 'gender-default' | 'initial';
  fallbackInitial: string;
}

function getCurrentChatId(): string {
  try {
    return SillyTavern?.getCurrentChatId?.() || 'unknown-chat';
  } catch {
    return 'unknown-chat';
  }
}

export function createAvatarEntityKey(kind: 'player' | 'npc', name?: string): string {
  return kind === 'player' ? 'player' : `npc:${name?.trim() || 'unknown'}`;
}

export function getAvatarStorageKey(entityKey: string, chatId: string = getCurrentChatId()): string {
  return `${STORAGE_PREFIX}:${chatId}:${entityKey}`;
}

export function getAvatarSelectionStorageKey(entityKey: string, chatId: string = getCurrentChatId()): string {
  return `${SELECTION_STORAGE_PREFIX}:${chatId}:${entityKey}`;
}

export function readCustomAvatar(entityKey: string, chatId?: string): StoredCustomAvatar | null {
  try {
    const raw = localStorage.getItem(getAvatarStorageKey(entityKey, chatId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredCustomAvatar>;
    if (parsed.version !== 1 || typeof parsed.imageData !== 'string' || !parsed.imageData.startsWith('data:image/')) {
      return null;
    }

    return {
      version: 1,
      imageData: parsed.imageData,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : undefined,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    };
  } catch {
    return null;
  }
}

export function readAvatarSelection(entityKey: string, chatId?: string): StoredAvatarSelection | null {
  try {
    const raw = localStorage.getItem(getAvatarSelectionStorageKey(entityKey, chatId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAvatarSelection>;
    if (parsed.version !== 1 || typeof parsed.avatarRef !== 'string') {
      return null;
    }

    const avatarRef = parsed.avatarRef.trim();
    if (!parsePresetAvatarId(avatarRef) && !parseCustomAvatarEntityKey(avatarRef)) {
      return null;
    }

    return {
      version: 1,
      avatarRef,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    };
  } catch {
    return null;
  }
}

export function saveCustomAvatar(
  entityKey: string,
  imageData: string,
  fileName?: string,
  chatId?: string,
): StoredCustomAvatar {
  const avatar: StoredCustomAvatar = {
    version: 1,
    imageData,
    fileName,
    updatedAt: Date.now(),
  };
  localStorage.setItem(getAvatarStorageKey(entityKey, chatId), JSON.stringify(avatar));
  return avatar;
}

export function clearCustomAvatar(entityKey: string, chatId?: string): void {
  localStorage.removeItem(getAvatarStorageKey(entityKey, chatId));
}

export function saveAvatarSelection(entityKey: string, avatarRef: string, chatId?: string): StoredAvatarSelection {
  const selection: StoredAvatarSelection = {
    version: 1,
    avatarRef,
    updatedAt: Date.now(),
  };
  localStorage.setItem(getAvatarSelectionStorageKey(entityKey, chatId), JSON.stringify(selection));
  return selection;
}

export function clearAvatarSelection(entityKey: string, chatId?: string): void {
  localStorage.removeItem(getAvatarSelectionStorageKey(entityKey, chatId));
}

export function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('请选择图片文件'));
  }

  if (file.size > MAX_AVATAR_FILE_SIZE) {
    return Promise.reject(new Error('图片大小不能超过 5MB'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('读取文件失败'));
    };
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export function getAvatarCandidates(input: AvatarResolveInput): AvatarCatalogEntry[] {
  const candidates: AvatarCatalogEntry[] = [];
  const seenIds = new Set<string>();

  const addCandidate = (avatar: AvatarCatalogEntry | null) => {
    if (!avatar || seenIds.has(avatar.id)) {
      return;
    }
    candidates.push(avatar);
    seenIds.add(avatar.id);
  };

  addCandidate(getAvatarFromRef(readAvatarSelection(input.entityKey)?.avatarRef));
  addCandidate(getAvatarFromRef(input.avatarRef));
  for (const avatar of findAvatarsByName(input.name)) {
    addCandidate(avatar);
  }
  if (input.gender && candidates.length === 0) {
    addCandidate(getDefaultAvatarForGender(input.gender));
  }

  return candidates;
}

export function resolveAvatarSource(input: AvatarResolveInput): ResolvedAvatarSource {
  const fallbackInitial = getAvatarFallbackInitial(input.name);

  const resolveRef = (avatarRef?: string, source: ResolvedAvatarSource['source'] = 'preset'): ResolvedAvatarSource | null => {
    const customEntityKey = parseCustomAvatarEntityKey(avatarRef);
    if (customEntityKey) {
      const referencedCustom = readCustomAvatar(customEntityKey);
      if (referencedCustom) {
        return {
          src: referencedCustom.imageData,
          label: input.name || '自定义头像',
          source: 'custom',
          fallbackInitial,
        };
      }
      return null;
    }

    const presetAvatar = getAvatarFromRef(avatarRef);
    if (presetAvatar) {
      return {
        src: presetAvatar.src,
        label: presetAvatar.label,
        source,
        fallbackInitial,
      };
    }

    return null;
  };

  const localSelection = readAvatarSelection(input.entityKey);
  const selectionSource = resolveRef(localSelection?.avatarRef);
  if (selectionSource) {
    return selectionSource;
  }

  const localCustom = readCustomAvatar(input.entityKey);
  if (localCustom) {
    return {
      src: localCustom.imageData,
      label: input.name || '自定义头像',
      source: 'custom',
      fallbackInitial,
    };
  }

  const refSource = resolveRef(input.avatarRef);
  if (refSource) {
    return refSource;
  }

  const matchedAvatar = findAvatarsByName(input.name)[0];
  if (matchedAvatar) {
    return {
      src: matchedAvatar.src,
      label: matchedAvatar.label,
      source: 'matched',
      fallbackInitial,
    };
  }

  if (input.gender) {
    const genderDefault = getDefaultAvatarForGender(input.gender);
    return {
      src: genderDefault.src,
      label: genderDefault.label,
      source: 'gender-default',
      fallbackInitial,
    };
  }

  return {
    src: null,
    label: input.name || fallbackInitial,
    source: 'initial',
    fallbackInitial,
  };
}
