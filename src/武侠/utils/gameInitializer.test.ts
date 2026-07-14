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
  it('内置头像只写入前端变量', () => {
    const data = generateVariableData(createFormData('preset:guo_jing_fc2')) as {
      前端变量: { 头像: { 玩家: string; 人物: Record<string, string> }; 头像版本: number; 事件运行时键版本: number };
      user数据: Record<string, unknown>;
      角色数据: { $template: Record<string, unknown> };
    };

    expect(data.前端变量.头像).toEqual({ 玩家: 'preset:guo_jing_fc2', 人物: {} });
    expect(data.前端变量.头像版本).toBe(1);
    expect(data.前端变量.事件运行时键版本).toBe(2);
    expect(data.user数据).not.toHaveProperty('头像');
    expect(data.角色数据.$template).not.toHaveProperty('头像');
  });

  it('自定义头像只写 custom marker，不写 base64', () => {
    const data = generateVariableData(createFormData('custom:player')) as {
      前端变量: { 头像: { 玩家: string } };
      user数据: Record<string, unknown>;
    };

    expect(data.前端变量.头像.玩家).toBe('custom:player');
    expect(data.user数据).not.toHaveProperty('头像');
    expect(JSON.stringify(data)).not.toContain('data:image');
    expect(JSON.stringify(data)).not.toContain('base64');
  });
});
