import fs from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { EVENT_KIND, parseCanonicalEventKey } from '../shared/eventKey.js';
import { normalizeFollowupEvents } from './era-event-schema.js';

const root = process.cwd();
const eventRoot = path.join(root, '世界书', '金庸群侠传1', '世界书');
const eventFiles = fs
  .readdirSync(eventRoot)
  .filter(file => parseCanonicalEventKey(file))
  .sort();
const eventKeys = new Set(eventFiles.map(file => path.basename(file, path.extname(file))));
const terminalLabels = new Set(['全书完', '待定', '无', '后续待续', '全书终局-终章圆满']);

describe('canonical wuxia event source', () => {
  it('contains the complete canonical catalog', () => {
    expect(eventFiles).toHaveLength(1119);
    const descriptors = eventFiles.map(file => parseCanonicalEventKey(file));
    expect(descriptors.filter(descriptor => descriptor?.kind === EVENT_KIND.ORDINARY)).toHaveLength(1010);
    expect(descriptors.filter(descriptor => descriptor?.kind === EVENT_KIND.DEBUT)).toHaveLength(91);
    expect(descriptors.filter(descriptor => descriptor?.kind === EVENT_KIND.ENCOUNTER)).toHaveLength(18);
  });

  it('uses the source event key for every character experience and resolves every follow-up', () => {
    for (const file of eventFiles) {
      const eventKey = path.basename(file, path.extname(file));
      const definition = JSON.parse(fs.readFileSync(path.join(eventRoot, file), 'utf8'));
      for (const action of ['insert', 'update', 'delete']) {
        for (const delta of Object.values<any>(definition[action] || {})) {
          expect(delta, `${eventKey} must not use the legacy 经历 field`).not.toHaveProperty('经历');
          if (delta?.人物经历 && Object.keys(delta.人物经历).length > 0) {
            expect(Object.keys(delta.人物经历)).toEqual([eventKey]);
          }
        }
      }
      for (const reference of Object.keys(normalizeFollowupEvents(definition.后续事件))) {
        if (terminalLabels.has(reference)) continue;
        expect(parseCanonicalEventKey(reference), `${eventKey} -> ${reference}`).not.toBeNull();
        expect(eventKeys.has(reference), `${eventKey} -> ${reference}`).toBe(true);
      }
    }
  });

  it('世界书索引 keeps all names and file paths aligned without changing uid uniqueness', () => {
    const indexPath = path.join(root, '世界书', '金庸群侠传1', 'index.yaml');
    const index = parseYaml(fs.readFileSync(indexPath, 'utf8'));
    const entries = index.条目.filter((entry: any) => parseCanonicalEventKey(entry.名称));
    expect(entries).toHaveLength(eventFiles.length);
    expect(new Set(entries.map((entry: any) => entry.uid)).size).toBe(eventFiles.length);
    expect(new Set(entries.map((entry: any) => entry.名称))).toEqual(eventKeys);
    for (const entry of entries) {
      expect(String(entry.文件).split(/[\\/]/).at(-1)).toBe(entry.名称);
    }
  });

  it('角色卡索引 keeps 688 names and file paths aligned without changing uid uniqueness', () => {
    const indexPath = path.join(root, '角色卡', '金庸群侠传', 'index.yaml');
    const index = parseYaml(fs.readFileSync(indexPath, 'utf8'));
    const entries = index.条目.filter((entry: any) => parseCanonicalEventKey(entry.名称));
    expect(entries).toHaveLength(688);
    expect(new Set(entries.map((entry: any) => entry.uid)).size).toBe(688);
    for (const entry of entries) {
      expect(String(entry.文件).split(/[\\/]/).at(-1)).toBe(entry.名称);
    }
  });

  it('keeps location migration overrides on canonical file names', () => {
    const migration = JSON.parse(
      fs.readFileSync(path.join(root, 'scripts', 'data', 'wuxia-location-migration.json'), 'utf8'),
    );
    for (const file of Object.keys(migration.eventLocationOverrides || {})) {
      expect(parseCanonicalEventKey(file)).not.toBeNull();
      expect(eventKeys.has(path.basename(file, path.extname(file)))).toBe(true);
    }
  });
});
