import { describe, expect, it } from 'vitest';
import type { Position } from '../engine/types';
import { ARCHETYPES, HEIGHT_BY_POS, buildCustomPlayer } from './customPlayer';

describe('buildCustomPlayer', () => {
  it('所有合法模板与位置组合都稳定为 73 总评，属性保持在合法范围', () => {
    for (const archetype of ARCHETYPES) {
      for (const pos of archetype.fits) {
        const player = buildCustomPlayer({
          name: '测试新秀',
          pos,
          archetypeId: archetype.id,
          height_cm: HEIGHT_BY_POS[pos].def,
          number: 8,
          teamId: 'GSW',
        });

        expect(player.overall, `${archetype.id}/${pos}`).toBe(73);
        expect(player.attrs.potential).toBe(archetype.attrs.potential);
        for (const value of Object.values(player.attrs)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(99);
        }
      }
    }
  });

  it('拒绝模板不支持的位置', () => {
    expect(() =>
      buildCustomPlayer({
        name: '错位新秀',
        pos: 'C',
        archetypeId: 'playmaker',
        height_cm: 213,
        number: 1,
        teamId: 'GSW',
      }),
    ).toThrow('不支持 C 位置');
  });

  it.each<Position>(['PG', 'SG', 'SF', 'PF', 'C'])('%s 身高和号码会被钳制在合法范围', pos => {
    const archetype = ARCHETYPES.find(item => item.fits.includes(pos))!;
    const player = buildCustomPlayer({
      name: '边界新秀',
      pos,
      archetypeId: archetype.id,
      height_cm: 999,
      number: 999,
      teamId: 'GSW',
    });
    expect(player.height_cm).toBe(HEIGHT_BY_POS[pos].max);
    expect(player.number).toBe(99);
  });
});
