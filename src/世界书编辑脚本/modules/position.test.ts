import { describe, expect, it } from 'vitest';
import {
  applyPositionSelectionToEntry,
  getNativePositionRole,
  getNativePositionType,
  getPositionLabel,
  getPositionSelectionValue,
  isDepthPositionValue,
  normalizePositionSelection,
} from './position.js';

describe('世界书插入位置映射', () => {
  it('保留普通插入位置', () => {
    expect(normalizePositionSelection('before_example_messages')).toEqual({
      type: 'before_example_messages',
      role: null,
      value: 'before_example_messages',
    });
    expect(getNativePositionType('before_example_messages')).toBe(5);
  });

  it('按角色区分三种深度插入位置', () => {
    expect(normalizePositionSelection('at_depth_as_system')).toMatchObject({ type: 'at_depth', role: 'system' });
    expect(normalizePositionSelection('at_depth_as_user')).toMatchObject({ type: 'at_depth', role: 'user' });
    expect(normalizePositionSelection('at_depth_as_assistant')).toMatchObject({
      type: 'at_depth',
      role: 'assistant',
    });
  });

  it('缺失深度角色时默认系统深度', () => {
    expect(getPositionSelectionValue({ type: 'at_depth' })).toBe('at_depth_as_system');
    expect(getPositionLabel({ type: 'at_depth' })).toBe('@D [系统]在深度');
    expect(getNativePositionRole({ type: 'at_depth' })).toBe(0);
  });

  it('兼容旧 UI 深度值并写回新 API 字段', () => {
    const entry = { position: { type: 'after_character_definition', role: 'system', depth: 4 } };

    applyPositionSelectionToEntry(entry, 'at_depth_as_user');
    expect(entry.position).toMatchObject({ type: 'at_depth', role: 'user', depth: 4 });
    expect(isDepthPositionValue(entry.position)).toBe(true);

    applyPositionSelectionToEntry(entry, 'after_author_note');
    expect(entry.position).toEqual({ type: 'after_author_note', depth: 4 });
  });

  it('兼容原生数字 role', () => {
    expect(getPositionSelectionValue({ type: 'at_depth', role: 2 })).toBe('at_depth_as_assistant');
    expect(getNativePositionRole({ type: 'at_depth', role: 1 })).toBe(1);
  });
});
