import { describe, expect, it } from 'vitest';
import { expandEraMacrosForDebug } from './promptDebug';

describe('调试页 ERA 宏展开', () => {
  const statData = {
    前端变量: { 战力区: '风波恶|基础:42|拳掌:折扇点穴术=88' },
    角色数据: {
      风波恶: {
        境界: '二流-中期',
        初始属性: { 臂力: 11 },
        $meta: { necessary: 'self' },
      },
    },
    数值: 0,
  };

  it('按生成时快照将文本宏替换为具体值，而不是事后重新读取聊天变量', () => {
    const original = '战力：{{ERA:前端变量.战力区}}；境界：{{ ERA:角色数据.风波恶.境界 }}';
    expect(expandEraMacrosForDebug(original, statData)).toBe(
      '战力：风波恶|基础:42|拳掌:折扇点穴术=88；境界：二流-中期',
    );
    expect(original).toContain('{{ERA:前端变量.战力区}}');
  });

  it('支持对象、零值、withmeta，缺失路径保留宏以方便诊断', () => {
    expect(expandEraMacrosForDebug('{{ERA:数值}}', statData)).toBe('0');
    expect(expandEraMacrosForDebug('{{ERA:角色数据.风波恶}}', statData)).not.toContain('$meta');
    expect(expandEraMacrosForDebug('{{ERA-withmeta:角色数据.风波恶}}', statData)).toContain('$meta');
    expect(expandEraMacrosForDebug('{{ERA:未存在.路径}}', statData)).toBe('{{ERA:未存在.路径}}');
  });

  it('兼容 ERA 编码键名以及 $ALLDATA', () => {
    const snapshot = { '特殊__DOT__字段': { 值: '原文__DOT__不要替换' }, $meta: { internal: 1 } };
    const content = expandEraMacrosForDebug('{{ERA:$ALLDATA}}', snapshot);
    expect(content).toContain('"特殊.字段"');
    expect(content).toContain('原文__DOT__不要替换');
    expect(content).not.toContain('$meta');
  });
});
