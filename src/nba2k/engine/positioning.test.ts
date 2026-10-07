import { describe, expect, it } from 'vitest';
import { buildFormation } from './positioning';
import type { LineupEntry } from './positioning';

const offense: LineupEntry[] = [
  { key: 'PG', pos: 'PG' },
  { key: 'SG', pos: 'SG' },
  { key: 'SF', pos: 'SF' },
  { key: 'PF', pos: 'PF' },
  { key: 'C', pos: 'C' },
];
const defense: LineupEntry[] = [
  { key: 'DPG', pos: 'PG' },
  { key: 'DSG', pos: 'SG' },
  { key: 'DSF', pos: 'SF' },
  { key: 'DPF', pos: 'PF' },
  { key: 'DC', pos: 'C' },
];

describe('tactical positioning', () => {
  it('六种正式进攻体系都有独立站位，不再回退到基础模板', () => {
    const schemes = ['基础', '五外', '四外一内', '挡拆', '低位', '动态进攻'] as const;
    const signatures = schemes.map(tactic => JSON.stringify(buildFormation({
      offense, defense, offenseSide: '主', tactic, defenseScheme: '人盯人', ballHolder: 'PG', attackRight: true,
    }).主.map(({ x, y }) => [x, y])));
    expect(new Set(signatures).size).toBe(schemes.length);
  });

  it('二三联防比人盯人明显更向篮下收缩', () => {
    const man = buildFormation({ offense, defense, offenseSide: '主', tactic: '五外', defenseScheme: '人盯人', ballHolder: 'PG', attackRight: true });
    const zone = buildFormation({ offense, defense, offenseSide: '主', tactic: '五外', defenseScheme: '二三联防', ballHolder: 'PG', attackRight: true });
    expect(zone.客[0].x).toBeGreaterThan(man.客[0].x);
  });
});
