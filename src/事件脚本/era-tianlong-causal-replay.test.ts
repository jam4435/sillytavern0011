import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('replays Tianlong prerequisites and irreversible states in causal order', () => {
  // The standalone audit also fails for missing/duplicate nodes and stale aliases.
  const result = spawnSync(process.execPath, ['scripts/audit-tianlong-character-replay.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15000,
    stdio: 'pipe',
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

it('generates the same Tianlong order that was audited from source', () => {
  const root = process.cwd();
  const { order } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/tianlong-causal-order.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/事件脚本/generated/event-data/manifest.json'), 'utf8'));
  const actual = manifest.events
    .filter((event: any) => event.kind === 'ordinary' && event.sourceName.startsWith('天龙第'))
    .sort((a: any, b: any) => a.triggerHour - b.triggerHour)
    .map((event: any) => event.sourceName);
  expect(actual).toEqual(order);
});
