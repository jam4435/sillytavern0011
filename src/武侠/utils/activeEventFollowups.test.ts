import { describe, expect, it } from 'vitest';
import { deriveActiveEventFollowupLocations, FOLLOWUP_MOVEMENT_GUIDANCE } from './activeEventFollowups';

const source = '天龙第二回07-段誉蒲团得绝学启程奔万劫谷';
const target = '天龙第三回01-段誉入谷寻访空寂瓦房';
const location = '大理/万劫谷/万劫谷庄院/正堂瓦房';

describe('activeEventFollowups', () => {
  it('参与事件的阶段尚未全部完成时也提前提供下一事件地点', () => {
    const result = deriveActiveEventFollowupLocations({
      参与事件: { [source]: { 描述: '仍在琅嬛福地的当前事件', 结局: '' } },
    });
    expect(result).toEqual({ [target]: location });
    expect(FOLLOWUP_MOVEMENT_GUIDANCE).toContain('当参与事件全阶段完成且玩家有继续推进想法时，往后续事件地点移动');
  });

  it('当前没有参与事件时不提前显示静态后续事件', () => {
    expect(deriveActiveEventFollowupLocations({ 参与事件: {} })).toEqual({});
    expect(deriveActiveEventFollowupLocations({ 参与事件: { $template: {} } })).toEqual({});
  });

  it('已完成或已失效的目标不再作为当前后续事件显示', () => {
    for (const bucket of ['已完成事件', '已失效事件']) {
      expect(
        deriveActiveEventFollowupLocations({
          参与事件: { [source]: {} },
          事件系统: { [bucket]: { [target]: 1 } },
        }),
      ).toEqual({});
    }
  });

  it('不凭空为没有静态后续关系的参与事件生成地点', () => {
    expect(deriveActiveEventFollowupLocations({ 参与事件: { '不存在的事件': {} } })).toEqual({});
  });
});
