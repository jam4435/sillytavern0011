// Runtime provider for the generated event catalog.  The provider keeps the
// event definitions out of the webpack entry chunk and fetches only shards
// needed by the current lifecycle check.

// Webpack emits src/事件脚本/generated/event-data/* as a sibling directory
// next to the script entry (event-data/*). Consumers may override this URL
// for a CDN or an unpacked development directory.
import { EVENT_RUNTIME_KEY_VERSION } from '../shared/eventKey.js';
import { wuxiaCalendarTimeToTotalHours } from '../shared/wuxiaCalendar.js';

const DEFAULT_EVENT_DATA_BASE_URL = './event-data/';
const MODULE_BASE_URL = new URL(/* webpackIgnore: true */ '.', import.meta.url).href;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function timeToHours(time) {
  if (!time || typeof time !== 'object') return null;
  return wuxiaCalendarTimeToTotalHours(time);
}

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || DEFAULT_EVENT_DATA_BASE_URL);
  return value.endsWith('/') ? value : `${value}/`;
}

function resolveBaseUrl(baseUrl) {
  return new URL(normalizeBaseUrl(baseUrl), MODULE_BASE_URL).href;
}

function resolveAssetUrl(baseUrl, file) {
  return new URL(file, baseUrl).href;
}

export class GeneratedEventDataProvider {
  constructor({ baseUrl, fetcher } = {}) {
    this.baseUrl = resolveBaseUrl(baseUrl || globalThis.ERA_EVENT_DATA_BASE_URL || DEFAULT_EVENT_DATA_BASE_URL);
    this.fetcher = fetcher || globalThis.fetch?.bind(globalThis);
    this.manifestPromise = null;
    this.shardPromises = new Map();
    this.checkpointPromises = new Map();
  }

  async fetchJson(file) {
    if (typeof this.fetcher !== 'function') {
      throw new Error('事件运行时资产需要 fetch；请检查浏览器环境或显式注入 fetcher');
    }
    const response = await this.fetcher(resolveAssetUrl(this.baseUrl, file));
    if (!response?.ok) {
      throw new Error(`加载事件运行时资产失败 (${response?.status || 'unknown'}): ${file}`);
    }
    return response.json();
  }

  async loadManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = this.fetchJson('manifest.json').then(manifest => {
        if (!isPlainObject(manifest) || manifest.schemaVersion !== 1) {
          throw new Error('事件运行时 manifest schemaVersion 不受支持');
        }
        if (manifest.eventRuntimeKeyVersion !== EVENT_RUNTIME_KEY_VERSION) {
          throw new Error(
            `事件运行时 manifest 键版本不受支持: ${manifest.eventRuntimeKeyVersion}，需要 ${EVENT_RUNTIME_KEY_VERSION}`,
          );
        }
        if (!Array.isArray(manifest.events) || !Array.isArray(manifest.shards)) {
          throw new Error('事件运行时 manifest 缺少 events/shards');
        }
        return manifest;
      });
    }
    return this.manifestPromise;
  }

  async loadShard(shard) {
    const shardId = typeof shard === 'string' ? shard : shard?.id;
    const shardInfo = typeof shard === 'string' ? null : shard;
    if (!shardId) throw new Error('loadShard 需要 shard id');
    if (!this.shardPromises.has(shardId)) {
      this.shardPromises.set(
        shardId,
        this.fetchJson(shardInfo?.file || `shards/${shardId}.json`).then(payload => {
          if (!isPlainObject(payload?.definitions)) throw new Error(`事件分片 ${shardId} 缺少 definitions`);
          return payload.definitions;
        }),
      );
    }
    return this.shardPromises.get(shardId);
  }

  async loadDefinitions(runtimeKeys = []) {
    const manifest = await this.loadManifest();
    const requested = runtimeKeys == null ? manifest.events.map(event => event.runtimeKey) : [...runtimeKeys];
    const eventMap = new Map(manifest.events.map(event => [event.runtimeKey, event]));
    const byShard = new Map();
    for (const runtimeKey of requested) {
      const metadata = eventMap.get(runtimeKey);
      if (!metadata) throw new Error(`manifest 中不存在事件 runtimeKey: ${runtimeKey}`);
      if (!byShard.has(metadata.shardId)) byShard.set(metadata.shardId, []);
      byShard.get(metadata.shardId).push(runtimeKey);
    }
    const definitions = {};
    await Promise.all(
      [...byShard.entries()].map(async ([shardId, keys]) => {
        const shard = await this.loadShard(shardId);
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(shard, key)) throw new Error(`事件分片 ${shardId} 缺少 ${key}`);
          definitions[key] = shard[key];
        }
      }),
    );
    return definitions;
  }

  async loadCheckpointAtOrBefore(time) {
    const manifest = await this.loadManifest();
    const targetHour = typeof time === 'number' ? time : timeToHours(time);
    if (targetHour === null || !Array.isArray(manifest.checkpoints) || manifest.checkpoints.length === 0) return null;
    let candidate = null;
    for (const checkpoint of manifest.checkpoints) {
      if (Number(checkpoint.throughHour) > targetHour) break;
      candidate = checkpoint;
    }
    if (!candidate) return null;
    if (!this.checkpointPromises.has(candidate.id)) {
      this.checkpointPromises.set(
        candidate.id,
        this.fetchJson(candidate.file).then(checkpoint => {
          if (checkpoint?.manifestRuntimeKeyVersion !== EVENT_RUNTIME_KEY_VERSION) {
            throw new Error(
              `事件检查点键版本不受支持: ${checkpoint?.manifestRuntimeKeyVersion}，需要 ${EVENT_RUNTIME_KEY_VERSION}`,
            );
          }
          return checkpoint;
        }),
      );
    }
    return this.checkpointPromises.get(candidate.id);
  }
}

let defaultProvider;
export function getGeneratedEventDataProvider(options = {}) {
  if (Object.keys(options).length > 0) return new GeneratedEventDataProvider(options);
  if (!defaultProvider) defaultProvider = new GeneratedEventDataProvider();
  return defaultProvider;
}

export function resetGeneratedEventDataProvider() {
  defaultProvider = null;
}
