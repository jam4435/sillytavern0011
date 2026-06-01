/**
 * 用户设定脚本 - 类型定义
 */

// ==================== 接口定义 ====================

/**
 * Persona 信息接口
 */
export interface PersonaInfo {
  name: string;
  description?: string;
  avatarId?: string;
  isDefault?: boolean;
  isLockedToChat?: boolean;
  isLockedToCharacter?: boolean;
  isSelected?: boolean;
  // 用于编辑时保存原始名称
  originalName?: string;
}

/**
 * 角色设定条目接口
 * 每个角色可以有自己的设定列表
 */
export interface PersonaTrait {
  /** 唯一 ID */
  id: string;
  /** 名称 */
  name: string;
  /** 描述/设定内容 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 设定预设（Profile）
 * 预设本质是多个 trait 的集合，可一键启用
 */
export interface PersonaProfile {
  /** 唯一 ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 包含的 trait ID 列表 */
  traitIds: string[];
  /** Plus 绑定配置 */
  plusBinding?: PersonaPlusBindingConfig;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

export interface PersonaPlusBindingWorldbookEntry {
  worldbookName: string;
  entryUids: number[];
  enabled: boolean;
}

export interface PersonaPlusExtensionSettingBinding {
  extensionId: string;
  settingsPatch: Record<string, unknown>;
}

export interface PersonaPlusBindingConfig {
  /** 酒馆 connection profile 名称 */
  connectionProfileName?: string;
  presetName?: string;
  scripts?: {
    global?: string[];
    preset?: string[];
    character?: string[];
  };
  regexes?: {
    global?: string[];
    preset?: string[];
    character?: string[];
  };
  worldbooks?: {
    global?: string[];
    characterPrimary?: string;
    characterAdditional?: string[];
    chat?: string;
  };
  worldbookEntries?: PersonaPlusBindingWorldbookEntry[];
  extensions?: PersonaPlusExtensionSettingBinding[];
}

export interface PersonaContextBindingResources extends PersonaPlusBindingConfig {
  userPersonaAvatarId?: string;
  userPersonaProfileId?: string;
  userPersonaEnabledTraitIds?: string[];
  presetEnabledPromptIds?: string[];
}

export interface PersonaContextBinding {
  id: string;
  scope: 'chat' | 'character';
  targetId: string;
  targetName: string;
  resources: PersonaContextBindingResources;
  createdAt: number;
  updatedAt: number;
}

export interface BindingGroup {
  id: string;
  name: string;
  resources: PersonaContextBindingResources;
  createdAt: number;
  updatedAt: number;
}

export type BindingPlusThemePresetId =
  | 'follow_smart_theme'
  | 'midnight_cyan'
  | 'ember_glow'
  | 'graphite_mist'
  | 'neon_night'
  | 'frost_paper'
  | 'warm_canvas'
  | 'rice_sheet'
  | 'contrast_day';

export interface BindingPlusThemeTokens {
  panelBg: string;
  panelBgSecondary: string;
  cardBg: string;
  cardBgStrong: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonHoverBg: string;
  buttonHoverBorder: string;
  selectedBg: string;
  selectedBorder: string;
  hoverBg: string;
  success: string;
  warning: string;
  danger: string;
  overlayBg: string;
  codeBg: string;
  codeBorder: string;
}

export interface BindingPlusThemePreset {
  id: BindingPlusThemePresetId;
  label: string;
  tone: 'dark' | 'light' | 'system';
  description: string;
  tokens: BindingPlusThemeTokens;
}

export interface BindingPlusThemeState {
  presetId: BindingPlusThemePresetId;
  customTokens: Partial<BindingPlusThemeTokens>;
  useCustomOverrides: boolean;
}

export interface BindingPlusPersonaBackup {
  avatarId: string;
  traits?: PersonaTrait[];
  advancedConfig?: PersonaAdvancedConfig;
  baseDescription?: string;
  snapshots?: PersonaSnapshot[];
}

export interface BindingPlusBackupData {
  contextBindings: PersonaContextBinding[];
  bindingGroups: BindingGroup[];
  defaultPresetName?: string;
  defaultPresetPromptIds: Record<string, string[]>;
  defaultWorldbookEntryUids: Record<string, number[]>;
  personas: BindingPlusPersonaBackup[];
  theme?: BindingPlusThemeState;
}

export interface BindingPlusBackupFile {
  app: 'bindingplus';
  version: 1;
  exportedAt: number;
  data: BindingPlusBackupData;
}

export interface BindingPlusBackupImportSummary {
  contextBindings: number;
  bindingGroups: number;
  defaultPresetName: boolean;
  defaultPresetPromptSnapshots: number;
  defaultWorldbookEntrySnapshots: number;
  personas: number;
  personaTraits: number;
  personaAdvancedConfigs: number;
  personaBaseDescriptions: number;
  personaSnapshots: number;
  theme: boolean;
}

export type PersonaRuleScope = 'chat' | 'character';
export type PersonaRuleMatchMode = 'includes' | 'equals' | 'regex';

/**
 * 自动启用规则
 * 命中后可自动启用 trait 或 Profile
 */
export interface PersonaAutoRule {
  /** 唯一 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 匹配对象：聊天或角色 */
  scope: PersonaRuleScope;
  /** 匹配方式 */
  matchMode: PersonaRuleMatchMode;
  /** 匹配内容 */
  pattern: string;
  /** 命中后启用的 trait */
  traitIds: string[];
  /** 命中后启用的 profile */
  profileIds: string[];
  /** 关联的条目文件夹（profile）ID，用于文件夹内联编辑 */
  profileId?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * Persona 高级配置
 * 包含预设、规则、当前激活预设
 */
export interface PersonaAdvancedConfig {
  /** 配置版本 */
  version: number;
  /** 当前激活预设 ID */
  activeProfileId?: string;
  /** 默认启用条目快照 */
  defaultEnabledTraitIds?: string[];
  /** 预设列表 */
  profiles: PersonaProfile[];
  /** 自动规则列表 */
  rules: PersonaAutoRule[];
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 运行时上下文（用于规则匹配）
 */
export interface PersonaRuntimeContext {
  chatId: string;
  chatName: string;
  characterId: string;
  characterName: string;
}

/**
 * 自动激活计算结果
 */
export interface PersonaActivationState {
  effectiveTraitIds: string[];
  activeProfileIds: string[];
  matchedRuleIds: string[];
}

/**
 * 变更保护快照
 */
export interface PersonaSnapshot {
  /** 唯一 ID */
  id: string;
  /** 创建时间 */
  timestamp: number;
  /** 变更原因 */
  reason: string;
  /** 当时的完整描述 */
  description: string;
  /** 当时的基础描述 */
  baseDescription: string;
  /** 当时的 traits */
  traits: PersonaTrait[];
  /** 当时的高级配置 */
  config: PersonaAdvancedConfig;
}

/**
 * 兼容性检查项
 */
export interface CompatibilityCheckItem {
  key: string;
  ok: boolean;
  required: boolean;
  message: string;
}

/**
 * 兼容性检查报告
 */
export interface CompatibilityCheckReport {
  ok: boolean;
  checkedAt: number;
  items: CompatibilityCheckItem[];
}

export interface PersonaPlusContextChangePayload {
  source: string;
  observedAt: number;
  previous: PersonaRuntimeContext;
  current: PersonaRuntimeContext;
  changed: {
    chat: boolean;
    character: boolean;
  };
}

export interface PersonaPlusInterfaceProbeItem {
  key: string;
  label: string;
  available: boolean;
  detail: string;
}

export interface PersonaPlusProbeReport {
  checkedAt: number;
  currentContext: PersonaRuntimeContext;
  interfaceItems: PersonaPlusInterfaceProbeItem[];
  notes: string[];
}

export interface PersonaPlusApiConfigTestItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  rawContent?: string;
  rawContentLabel?: string;
}

export interface PersonaPlusApiConfigTestReport {
  checkedAt: number;
  items: PersonaPlusApiConfigTestItem[];
  notes: string[];
}

export interface PersonaPlusEventState {
  key: string;
  label: string;
  available: boolean;
  detail: string;
  triggerCount: number;
  lastTriggeredAt: number | null;
}

/**
 * 角色设定配置接口
 * 存储某个角色的所有设定条目
 */
export interface PersonaTraitsConfig {
  /** 角色 avatarId */
  avatarId: string;
  /** 角色名称（用于显示） */
  personaName: string;
  /** 设定条目列表 */
  traits: PersonaTrait[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

// ==================== 常量定义 ====================

/** 面板容器 ID */
export const PERSONA_PANEL_ID = 'persona-quick-panel';

/** 扩展菜单按钮 ID */
export const PERSONA_BUTTON_ID = 'persona-quick-btn';

/** 按钮提示文本 */
export const PERSONA_BUTTON_TOOLTIP = '绑定plus';

/** 按钮图标类名 */
export const PERSONA_BUTTON_ICON = 'fa-solid fa-user-gear';

/** 菜单中显示的按钮文本 */
export const PERSONA_BUTTON_TEXT_IN_MENU = '绑定plus';

/** 角色设定存储键前缀 */
export const PERSONA_TRAITS_STORAGE_PREFIX = 'tavern_helper_persona_traits_';

/** Persona 高级配置存储键前缀 */
export const PERSONA_ADVANCED_STORAGE_PREFIX = 'tavern_helper_persona_advanced_';

/** 基础描述存储键前缀 */
export const PERSONA_BASE_DESC_STORAGE_PREFIX = 'tavern_helper_persona_base_desc_';

/** 变更快照存储键前缀 */
export const PERSONA_SNAPSHOT_STORAGE_PREFIX = 'tavern_helper_persona_snapshot_';

export const PERSONA_PLUS_APPLIED_STORAGE_PREFIX = 'tavern_helper_persona_plus_applied_';

export const PERSONA_CONTEXT_BINDINGS_STORAGE_KEY = 'tavern_helper_context_bindings_v1';

export const PERSONA_BINDING_GROUPS_STORAGE_KEY = 'tavern_helper_binding_groups_v1';

export const BINDING_PLUS_THEME_STORAGE_KEY = 'bindingplus_theme_v1';

export const PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY = 'tavern_helper_default_preset_prompts_v1';

export const PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY = 'tavern_helper_default_worldbook_entries_v1';

/** 设定拼装分隔标记 */
export const PERSONA_TRAIT_SEPARATOR = '--- 角色设定 ---';

export const PERSONA_PLUS_CONTEXT_CHANGED_EVENT = 'persona_plus:context_changed';

export const PERSONA_PLUS_CHAT_CHANGED_EVENT = 'persona_plus:chat_changed';

export const PERSONA_PLUS_CHARACTER_CHANGED_EVENT = 'persona_plus:character_changed';
