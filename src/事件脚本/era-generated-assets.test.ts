import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const assetRoot = path.join(process.cwd(), 'src', '事件脚本', 'generated', 'event-data');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));
const openingEventSummary = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '事件信息汇总.json'), 'utf8'),
);

describe('generated wuxia event assets', () => {
  it('contains every current event exactly once', () => {
    expect(manifest.eventCount).toBeGreaterThan(0);
    expect(manifest.events).toHaveLength(manifest.eventCount);
    expect(new Set(manifest.events.map((event: any) => event.runtimeKey)).size).toBe(manifest.eventCount);
    expect(manifest.shardCount).toBe(manifest.shards.length);
    expect(manifest.checkpoints.length).toBeGreaterThan(0);
  });

  it('materializes character state at each 100-event completion checkpoint', () => {
    for (const checkpoint of manifest.checkpoints) {
      const payload = JSON.parse(fs.readFileSync(path.join(assetRoot, checkpoint.file), 'utf8'));
      expect(payload.completedCount % 100).toBe(0);
      expect(payload.completedRuntimeKeys).toHaveLength(payload.completedCount);
      expect(payload.characterState).toBeDefined();
    }
  });

  it('keeps every shard below the configured event and byte limits', () => {
    for (const shard of manifest.shards) {
      expect(shard.eventCount).toBeLessThanOrEqual(50);
      expect(shard.byteLength).toBeLessThanOrEqual(350 * 1024);
      expect(fs.existsSync(path.join(assetRoot, shard.file))).toBe(true);
    }
  });

  it('resolves all graph edges and records legacy dangling references explicitly', () => {
    const runtimeKeys = new Set(manifest.events.map((event: any) => event.runtimeKey));
    const unresolved = new Set(
      manifest.unresolvedReferences.map(
        (reference: any) => `${reference.sourceRuntimeKey}\0${reference.targetRuntimeKey}`,
      ),
    );
    for (const event of manifest.events) {
      for (const predecessor of event.predecessor) expect(runtimeKeys.has(predecessor)).toBe(true);
      if (event.followup && !runtimeKeys.has(event.followup)) {
        expect(unresolved.has(`${event.runtimeKey}\0${event.followup}`)).toBe(true);
      }
    }
  });

  it('keeps the opening event summary synchronized with ordinary worldbook events', () => {
    const ordinaryEvents = manifest.events.filter((event: any) => event.kind === 'ordinary');
    const summaryByName = new Map(openingEventSummary.map((event: any) => [event.事件名称, event]));

    expect(openingEventSummary).toHaveLength(ordinaryEvents.length);
    expect(summaryByName.size).toBe(ordinaryEvents.length);

    for (const event of ordinaryEvents) {
      const triggerTime = {
        年: event.triggerTime.年,
        月: event.triggerTime.月,
        日: event.triggerTime.日,
        ...(Object.prototype.hasOwnProperty.call(event.triggerTime, '时') ? { 时: event.triggerTime.时 } : {}),
      };
      expect(summaryByName.get(event.sourceName.replace('事件条目-', ''))).toEqual({
        事件名称: event.sourceName.replace('事件条目-', ''),
        事件地点: event.location,
        触发时间: triggerTime,
      });
    }
  });
});
