import { describe, expect, it, vi } from 'vitest';

import { GeneratedEventDataProvider } from './era-event-data-provider.js';

function response(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('GeneratedEventDataProvider', () => {
  it('loads only requested shards and reuses the shard promise', async () => {
    const manifest = {
      schemaVersion: 1,
      events: [
        { runtimeKey: '事件一', shardId: 'shard-0001' },
        { runtimeKey: '事件二', shardId: 'shard-0002' },
      ],
      shards: [
        { id: 'shard-0001', file: 'shards/shard-0001.json' },
        { id: 'shard-0002', file: 'shards/shard-0002.json' },
      ],
      checkpoints: [],
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) return response(manifest);
      if (url.endsWith('shard-0001.json')) return response({ definitions: { 事件一: { value: 1 } } });
      if (url.endsWith('shard-0002.json')) return response({ definitions: { 事件二: { value: 2 } } });
      throw new Error(`unexpected URL: ${url}`);
    });
    const provider = new GeneratedEventDataProvider({ baseUrl: 'https://example.test/event-data/', fetcher });

    await expect(provider.loadDefinitions(['事件二'])).resolves.toEqual({ 事件二: { value: 2 } });
    await expect(provider.loadDefinitions(['事件二'])).resolves.toEqual({ 事件二: { value: 2 } });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('shard-0001.json'))).toBe(false);
  });

  it('selects the latest checkpoint not after the requested time', async () => {
    const manifest = {
      schemaVersion: 1,
      events: [],
      shards: [],
      checkpoints: [
        { id: 'checkpoint-0001', file: 'checkpoints/checkpoint-0001.json', throughHour: 100 },
        { id: 'checkpoint-0002', file: 'checkpoints/checkpoint-0002.json', throughHour: 200 },
      ],
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) return response(manifest);
      if (url.endsWith('checkpoint-0001.json')) return response({ id: 'checkpoint-0001' });
      if (url.endsWith('checkpoint-0002.json')) return response({ id: 'checkpoint-0002' });
      throw new Error(`unexpected URL: ${url}`);
    });
    const provider = new GeneratedEventDataProvider({ baseUrl: 'https://example.test/event-data/', fetcher });

    await expect(provider.loadCheckpointAtOrBefore(99)).resolves.toBeNull();
    await expect(provider.loadCheckpointAtOrBefore(199)).resolves.toEqual({ id: 'checkpoint-0001' });
    await expect(provider.loadCheckpointAtOrBefore(250)).resolves.toEqual({ id: 'checkpoint-0002' });
  });

  it('fails loudly when a production asset is missing', async () => {
    const provider = new GeneratedEventDataProvider({
      baseUrl: 'https://example.test/event-data/',
      fetcher: vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    });
    await expect(provider.loadManifest()).rejects.toThrow('manifest.json');
  });
});
