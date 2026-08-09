import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { EVENT_RUNTIME_KEY_VERSION, parseCanonicalEventKey } from '../shared/eventKey.js';

const assetRoot = path.join(process.cwd(), 'src', '事件脚本', 'generated', 'event-data');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));
const openingEventSummary = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '事件信息汇总.json'), 'utf8'),
);

describe('generated wuxia event assets', () => {
  it('contains every current event exactly once', () => {
    expect(manifest.eventRuntimeKeyVersion).toBe(EVENT_RUNTIME_KEY_VERSION);
    expect(manifest.eventCount).toBe(688);
    expect(manifest.events).toHaveLength(manifest.eventCount);
    expect(new Set(manifest.events.map((event: any) => event.runtimeKey)).size).toBe(manifest.eventCount);
    expect(manifest.shardCount).toBe(manifest.shards.length);
    expect(manifest.checkpoints.length).toBeGreaterThan(0);
    expect(manifest.events.filter((event: any) => event.kind === 'ordinary')).toHaveLength(630);
    expect(manifest.events.filter((event: any) => event.kind === 'debut')).toHaveLength(58);
    for (const event of manifest.events) {
      expect(event.sourceName).toBe(event.runtimeKey);
      expect(parseCanonicalEventKey(event.runtimeKey)).not.toBeNull();
    }
  });

  it('materializes character state at each 100-event completion checkpoint', () => {
    for (const checkpoint of manifest.checkpoints) {
      const payload = JSON.parse(fs.readFileSync(path.join(assetRoot, checkpoint.file), 'utf8'));
      expect(payload.completedCount % 100).toBe(0);
      expect(payload.manifestRuntimeKeyVersion).toBe(EVENT_RUNTIME_KEY_VERSION);
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

  it('records follow-up associations without generating predecessor gates', () => {
    const runtimeKeys = new Set(manifest.events.map((event: any) => event.runtimeKey));
    expect(manifest.unresolvedReferences).toEqual([]);
    for (const event of manifest.events) {
      expect(event.predecessor).toBeUndefined();
      for (const followup of Object.keys(event.followups || {})) {
        expect(runtimeKeys.has(followup)).toBe(true);
      }
    }
  });

  it('keeps conditional definitions out of deterministic checkpoint indexes', () => {
    const conditionalKeys = new Set(manifest.indexes.conditional || []);
    const checkpointKeys = new Set<string>();
    for (const checkpoint of manifest.checkpoints) {
      const payload = JSON.parse(fs.readFileSync(path.join(assetRoot, checkpoint.file), 'utf8'));
      payload.completedRuntimeKeys.forEach((key: string) => checkpointKeys.add(key));
    }
    for (const event of manifest.events) {
      expect(event.triggerCondition || event.triggerTime).toBeDefined();
      if (event.conditional) {
        expect(conditionalKeys.has(event.runtimeKey)).toBe(true);
        expect(checkpointKeys.has(event.runtimeKey)).toBe(false);
      }
    }
  });

  it('keeps the opening event summary synchronized with ordinary worldbook events', () => {
    const ordinaryEvents = manifest.events.filter(
      (event: any) => event.kind === 'ordinary' && !event.conditional && event.triggerTime,
    );
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
      expect(summaryByName.get(event.sourceName)).toEqual({
        事件名称: event.sourceName,
        事件地点: event.location,
        触发时间: triggerTime,
      });
    }
  });
});
