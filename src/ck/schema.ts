import { z } from 'zod';

export const Schema = z.object({
  ck_lord_rpg: z.object({
    format: z.literal('ck-lord-rpg-save'),
    formatVersion: z.literal(3),
    state: z.record(z.string(), z.unknown()),
    chronicle: z.array(z.record(z.string(), z.unknown())),
    checkpoints: z.array(z.record(z.string(), z.unknown())).max(10),
    eventHash: z.string(),
    stateHash: z.string(),
    branchAnchor: z.record(z.string(), z.unknown()).nullable(),
  }).strict().optional(),
  ck_lord_rpg_public: z.object({
    schemaVersion: z.literal(2),
    saveId: z.string(),
    revision: z.number().int().nonnegative(),
    date: z.string(),
    player: z.record(z.string(), z.unknown()),
    resources: z.record(z.string(), z.unknown()),
    politics: z.record(z.string(), z.unknown()),
    situation: z.record(z.string(), z.unknown()).nullable(),
    activity: z.record(z.string(), z.unknown()).nullable(),
    pending: z.record(z.string(), z.unknown()),
  }).strict().optional(),
}).passthrough();
