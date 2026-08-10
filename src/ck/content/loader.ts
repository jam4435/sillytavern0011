import JSON5 from 'json5';
import { z } from 'zod';

export const ContentEntitySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_.-]+$/i),
    kind: z.enum(['event', 'action', 'character', 'county', 'location', 'activity', 'localization']),
    operation: z.enum(['add', 'patch', 'replace']).default('add'),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ContentPackSchema = z
  .object({
    format: z.literal('ckpack'),
    formatVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9_.-]+$/i),
    version: z.string().min(1),
    name: z.string().min(1),
    namespace: z.string().regex(/^[a-z0-9_.-]+$/i),
    dependencies: z.array(z.object({ id: z.string(), version: z.string().optional() }).strict()).default([]),
    loadAfter: z.array(z.string()).default([]),
    entities: z.array(ContentEntitySchema).default([]),
  })
  .strict();

export type ContentPack = z.infer<typeof ContentPackSchema>;
export type ContentLoadError = { packId: string; code: string; message: string; entityId?: string };
export type ContentRegistry = { packs: ContentPack[]; entities: Map<string, z.infer<typeof ContentEntitySchema>>; errors: ContentLoadError[] };

export const corePack: ContentPack = ContentPackSchema.parse({
  format: 'ckpack',
  formatVersion: 1,
  id: 'ck.core',
  version: '1.0.0',
  name: 'CK 领主 RPG 核心规则',
  namespace: 'ck',
  dependencies: [],
  entities: [],
});

export const prologuePack: ContentPack = ContentPackSchema.parse({
  format: 'ckpack',
  formatVersion: 1,
  id: 'ck.prologue.brittany1066',
  version: '1.0.0',
  name: '裂冠前夜：布列塔尼 1066',
  namespace: 'brittany1066',
  dependencies: [{ id: 'ck.core', version: '1.0.0' }],
  loadAfter: ['ck.core'],
  entities: [
    { id: 'event.council_warning', kind: 'event', data: { trigger: { date: '1066-09-15' }, effects: [{ type: 'scenario.phase', value: 'planning' }] } },
    { id: 'event.norman_landing', kind: 'event', data: { trigger: { date: '1066-09-28' }, effects: [{ type: 'world.signal', kind: 'norman_landing' }] } },
    { id: 'event.ultimatum', kind: 'event', data: { trigger: { date: '1066-09-29' }, effects: [{ type: 'scenario.resolve_deadline' }] } },
  ],
});

export function parseContentPack(source: string): { ok: true; pack: ContentPack } | { ok: false; errors: string[] } {
  try {
    const parsed: unknown = JSON5.parse(source);
    const result = ContentPackSchema.safeParse(parsed);
    if (!result.success) return { ok: false, errors: result.error.issues.map(issue => `${issue.path.join('.') || 'pack'}: ${issue.message}`) };
    return { ok: true, pack: result.data };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function sortPacks(packs: ContentPack[]): ContentPack[] {
  const remaining = new Map(packs.map(pack => [pack.id, pack]));
  const sorted: ContentPack[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter(pack => pack.dependencies.every(item => sorted.some(done => done.id === item.id)) && pack.loadAfter.every(id => !remaining.has(id)));
    if (ready.length === 0) return [...sorted, ...remaining.values()];
    ready.sort((a, b) => a.id.localeCompare(b.id));
    for (const pack of ready) {
      sorted.push(pack);
      remaining.delete(pack.id);
    }
  }
  return sorted;
}

export function loadContentPacks(inputPacks: ContentPack[]): ContentRegistry {
  const errors: ContentLoadError[] = [];
  const unique = new Map<string, ContentPack>();
  for (const pack of inputPacks) {
    if (unique.has(pack.id)) errors.push({ packId: pack.id, code: 'pack.duplicate', message: `内容包 ${pack.id} 被重复加载。` });
    else unique.set(pack.id, pack);
  }
  const packs = sortPacks([...unique.values()]);
  const loadedIds = new Set(packs.map(pack => pack.id));
  const entities = new Map<string, z.infer<typeof ContentEntitySchema>>();
  for (const pack of packs) {
    for (const dependency of pack.dependencies) {
      if (!loadedIds.has(dependency.id)) errors.push({ packId: pack.id, code: 'dependency.missing', message: `缺少依赖 ${dependency.id}。` });
    }
    for (const entity of pack.entities) {
      const qualifiedId = `${pack.namespace}:${entity.id}`;
      const existing = entities.get(qualifiedId);
      if (existing && entity.operation === 'add') {
        errors.push({ packId: pack.id, code: 'entity.conflict', message: `${qualifiedId} 已存在；重复 ID 必须显式 patch 或 replace。`, entityId: entity.id });
        continue;
      }
      if (!existing && entity.operation === 'patch') {
        errors.push({ packId: pack.id, code: 'entity.patch_missing', message: `${qualifiedId} 没有可供 patch 的基础实体。`, entityId: entity.id });
        continue;
      }
      if (existing && entity.operation === 'patch') entities.set(qualifiedId, { ...existing, data: { ...existing.data, ...entity.data } });
      else entities.set(qualifiedId, entity);
    }
  }
  return { packs, entities, errors };
}

export function readContentPackFile(file: File): Promise<{ ok: true; pack: ContentPack } | { ok: false; errors: string[] }> {
  if (!file.name.endsWith('.ckpack.json5')) return Promise.resolve({ ok: false, errors: ['文件名必须以 .ckpack.json5 结尾。'] });
  return file.text().then(parseContentPack);
}
