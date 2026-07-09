import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTRIBUTES,
  generateVariableData,
  type NewGameFormData,
} from './gameInitializer';

function createFormData(avatarRef?: string): NewGameFormData {
  return {
    name: '测试少侠',
    gender: '男',
    avatarRef,
    appearance: '剑眉星目',
    age: 18,
    locationInfo: {
      year: 1199,
      month: 8,
      day: 15,
      location: '牛家村',
    },
    initialAttributes: DEFAULT_ATTRIBUTES,
    martialArtId: '',
    origin: '自定义',
    originId: 'custom',
    customRealm: '三流圆满',
  };
}

describe('generateVariableData avatar fields', () => {
  it('内置头像写入 user数据.头像 preset ref', () => {
    const data = generateVariableData(createFormData('preset:guo_jing_fc2')) as {
      user数据: { 头像: string };
    };

    expect(data.user数据.头像).toBe('preset:guo_jing_fc2');
  });

  it('自定义头像只写 custom marker，不写 base64', () => {
    const data = generateVariableData(createFormData('custom:player')) as {
      user数据: { 头像: string };
    };

    expect(data.user数据.头像).toBe('custom:player');
    expect(JSON.stringify(data)).not.toContain('data:image');
    expect(JSON.stringify(data)).not.toContain('base64');
  });
});
