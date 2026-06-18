export type VariableEditorCapabilitySource = 'internal-default' | 'difficulty-system';

export interface VariableEditorCapability {
  canEdit: boolean;
  source: VariableEditorCapabilitySource;
  reason: string;
}

export interface VariableEditorCapabilityOverride {
  canEdit: boolean;
  source?: VariableEditorCapabilitySource;
  reason?: string;
}

const DEFAULT_VARIABLE_EDITOR_CAPABILITY: VariableEditorCapability = {
  canEdit: true,
  source: 'internal-default',
  reason: '默认允许编辑；尚未接入难度系统接管。',
};

export function resolveVariableEditorCapability(
  override?: VariableEditorCapabilityOverride | null,
): VariableEditorCapability {
  if (!override) {
    return DEFAULT_VARIABLE_EDITOR_CAPABILITY;
  }

  return {
    canEdit: override.canEdit,
    source: override.source ?? 'difficulty-system',
    reason:
      override.reason ??
      (override.canEdit ? '允许编辑；由外部策略接管。' : '禁止编辑；由外部策略接管。'),
  };
}
