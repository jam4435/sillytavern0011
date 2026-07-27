import {
  cloneGenerationValue,
  createGenerationId,
  normalizeGenerationProject,
} from './worldbookGenerationSchema.js';
import {
  createGenerationProject,
  duplicateGenerationProjectSnapshot,
  getLastGenerationRevisionRecord,
} from './worldbookGenerationProject.js';

export const GENERATION_PROJECT_DATABASE_NAME = 'lorebook-ai-generation-projects';
export const GENERATION_PROJECT_DATABASE_VERSION = 1;
export const GENERATION_PROJECT_REVISION_LIMIT = 100;

const memoryProjects = new Map();
const memoryRevisions = new Map();
let lastStorageError = null;

function indexedDbFactory(options = {}) {
  return options?.indexedDB || globalThis.indexedDB || null;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function transactionAsPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务已中止'));
  });
}

export function openGenerationProjectDatabase(options = {}) {
  const factory = indexedDbFactory(options);
  if (!factory) return Promise.reject(new Error('当前环境不支持 IndexedDB'));

  return new Promise((resolve, reject) => {
    const request = factory.open(GENERATION_PROJECT_DATABASE_NAME, GENERATION_PROJECT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const projects = database.objectStoreNames.contains('projects')
        ? request.transaction.objectStore('projects')
        : database.createObjectStore('projects', { keyPath: 'id' });
      if (!projects.indexNames.contains('updatedAt')) projects.createIndex('updatedAt', 'updatedAt');
      if (!projects.indexNames.contains('archived')) projects.createIndex('archived', 'archived');

      const revisions = database.objectStoreNames.contains('revisions')
        ? request.transaction.objectStore('revisions')
        : database.createObjectStore('revisions', { keyPath: ['projectId', 'revision'] });
      if (!revisions.indexNames.contains('projectId')) revisions.createIndex('projectId', 'projectId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开生成项目数据库'));
    request.onblocked = () => reject(new Error('生成项目数据库升级被其他页面阻塞'));
  });
}

function rememberProject(project, revisionRecord = null) {
  const normalized = normalizeGenerationProject(project, { recoverRunningJobs: true });
  memoryProjects.set(normalized.id, cloneGenerationValue(normalized));
  if (revisionRecord) {
    const records = memoryRevisions.get(normalized.id) || [];
    records.push(cloneGenerationValue(revisionRecord));
    memoryRevisions.set(normalized.id, records.slice(-GENERATION_PROJECT_REVISION_LIMIT));
  }
  return normalized;
}

function storageFailure(error, project = null, revisionRecord = null) {
  lastStorageError = error instanceof Error ? error : new Error(`${error}`);
  if (project) rememberProject(project, revisionRecord);
  console.warn('世界书生成项目未能写入 IndexedDB，已保留在当前页面内存中。', lastStorageError);
}

export function getGenerationProjectStoreStatus() {
  return {
    saved: lastStorageError === null,
    error: lastStorageError,
    memoryProjectCount: memoryProjects.size,
  };
}

async function readAllFromStore(storeName, options = {}) {
  const database = await openGenerationProjectDatabase(options);
  try {
    const transaction = database.transaction(storeName, 'readonly');
    const result = await requestAsPromise(transaction.objectStore(storeName).getAll());
    await transactionAsPromise(transaction);
    return result;
  } finally {
    database.close();
  }
}

export async function listGenerationProjects(options = {}) {
  let stored = [];
  try {
    stored = await readAllFromStore('projects', options);
    lastStorageError = null;
  } catch (error) {
    storageFailure(error);
  }

  const merged = new Map(
    stored.map(project => {
      const normalized = normalizeGenerationProject(project, { recoverRunningJobs: true });
      return [normalized.id, normalized];
    }),
  );
  memoryProjects.forEach((project, id) => {
    merged.set(id, normalizeGenerationProject(project, { recoverRunningJobs: true }));
  });
  return [...merged.values()]
    .filter(project => options.includeArchived === true || !project.archived)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getGenerationProject(projectId, options = {}) {
  if (memoryProjects.has(projectId)) {
    return normalizeGenerationProject(memoryProjects.get(projectId), { recoverRunningJobs: true });
  }

  try {
    const database = await openGenerationProjectDatabase(options);
    try {
      const transaction = database.transaction('projects', 'readonly');
      const stored = await requestAsPromise(transaction.objectStore('projects').get(projectId));
      await transactionAsPromise(transaction);
      lastStorageError = null;
      return stored ? normalizeGenerationProject(stored, { recoverRunningJobs: true }) : null;
    } finally {
      database.close();
    }
  } catch (error) {
    storageFailure(error);
    return null;
  }
}

function resolveSaveOptions(optionsOrRevision = {}) {
  if (
    optionsOrRevision
    && typeof optionsOrRevision === 'object'
    && ('kind' in optionsOrRevision || 'forwardOperations' in optionsOrRevision)
    && !('revisionRecord' in optionsOrRevision)
  ) {
    return { revisionRecord: optionsOrRevision };
  }
  return optionsOrRevision || {};
}

export async function saveGenerationProject(inputProject, optionsOrRevision = {}) {
  const options = resolveSaveOptions(optionsOrRevision);
  const project = normalizeGenerationProject(inputProject);
  const revisionRecord =
    cloneGenerationValue(options.revisionRecord || getLastGenerationRevisionRecord(inputProject)) || null;
  const storedProject = cloneGenerationValue(project);

  try {
    const database = await openGenerationProjectDatabase(options);
    try {
      const transaction = database.transaction(['projects', 'revisions'], 'readwrite');
      transaction.objectStore('projects').put(storedProject);
      const revisionStore = transaction.objectStore('revisions');
      if (revisionRecord) revisionStore.put(revisionRecord);
      const allRevisionsRequest = revisionStore.getAll();
      allRevisionsRequest.onsuccess = () => {
        const projectRevisions = allRevisionsRequest.result
          .filter(record => record.projectId === project.id)
          .sort((left, right) => left.revision - right.revision);
        projectRevisions
          .slice(0, Math.max(0, projectRevisions.length - GENERATION_PROJECT_REVISION_LIMIT))
          .forEach(record => revisionStore.delete([record.projectId, record.revision]));
      };
      await transactionAsPromise(transaction);
      memoryProjects.delete(project.id);
      memoryRevisions.delete(project.id);
      lastStorageError = null;
      return project;
    } finally {
      database.close();
    }
  } catch (error) {
    storageFailure(error, project, revisionRecord);
    return project;
  }
}

export async function createStoredGenerationProject(input = {}, options = {}) {
  const project = createGenerationProject(input);
  return saveGenerationProject(project, options);
}

export async function deleteGenerationProject(projectId, options = {}) {
  memoryProjects.delete(projectId);
  memoryRevisions.delete(projectId);
  try {
    const database = await openGenerationProjectDatabase(options);
    try {
      const transaction = database.transaction(['projects', 'revisions'], 'readwrite');
      transaction.objectStore('projects').delete(projectId);
      const revisions = transaction.objectStore('revisions');
      const allRequest = revisions.getAll();
      allRequest.onsuccess = () => {
        allRequest.result
          .filter(record => record.projectId === projectId)
          .forEach(record => revisions.delete([record.projectId, record.revision]));
      };
      await transactionAsPromise(transaction);
      lastStorageError = null;
      return true;
    } finally {
      database.close();
    }
  } catch (error) {
    storageFailure(error);
    return indexedDbFactory(options) === null;
  }
}

export async function archiveGenerationProject(projectId, archived = true, options = {}) {
  const project = await getGenerationProject(projectId, options);
  if (!project) throw new Error('找不到要归档的生成项目');
  project.archived = archived === true;
  project.updatedAt = new Date().toISOString();
  return saveGenerationProject(project, options);
}

export async function duplicateGenerationProject(projectOrId, overrides = {}, options = {}) {
  const source =
    typeof projectOrId === 'string'
      ? await getGenerationProject(projectOrId, options)
      : normalizeGenerationProject(projectOrId);
  if (!source) throw new Error('找不到要复制的生成项目');
  const duplicate = duplicateGenerationProjectSnapshot(source, overrides);
  return saveGenerationProject(duplicate, options);
}

export async function exportGenerationProject(projectOrId, options = {}) {
  const project =
    typeof projectOrId === 'string'
      ? await getGenerationProject(projectOrId, options)
      : normalizeGenerationProject(projectOrId);
  if (!project) throw new Error('找不到要导出的生成项目');
  return JSON.stringify(
    {
      format: 'lorebook-ai-generation-project',
      version: 1,
      exportedAt: new Date().toISOString(),
      project,
    },
    null,
    2,
  );
}

export async function importGenerationProject(input, options = {}) {
  let parsed;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : cloneGenerationValue(input);
  } catch (error) {
    throw new Error(`生成项目 JSON 无法解析：${error.message}`);
  }
  const rawProject = parsed?.format === 'lorebook-ai-generation-project' ? parsed.project : parsed;
  if (!rawProject || typeof rawProject !== 'object') throw new Error('生成项目 JSON 缺少 project 数据');

  let project = normalizeGenerationProject(rawProject, { recoverRunningJobs: true });
  const existing = await getGenerationProject(project.id, options);
  if (existing && options.overwrite !== true) {
    project = {
      ...project,
      id: createGenerationId('project'),
      name: options.name || `${project.name} - 导入`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisionHistory: { undo: [], redo: [] },
    };
  }
  return saveGenerationProject(project, options);
}

export async function listGenerationProjectRevisions(projectId, options = {}) {
  let stored = [];
  try {
    stored = await readAllFromStore('revisions', options);
    lastStorageError = null;
  } catch (error) {
    storageFailure(error);
  }
  const merged = [
    ...stored.filter(record => record.projectId === projectId),
    ...(memoryRevisions.get(projectId) || []),
  ];
  const byRevision = new Map(merged.map(record => [record.revision, cloneGenerationValue(record)]));
  return [...byRevision.values()]
    .sort((left, right) => left.revision - right.revision)
    .slice(-GENERATION_PROJECT_REVISION_LIMIT);
}

export async function clearGenerationProjectStore(options = {}) {
  memoryProjects.clear();
  memoryRevisions.clear();
  lastStorageError = null;
  try {
    const database = await openGenerationProjectDatabase(options);
    try {
      const transaction = database.transaction(['projects', 'revisions'], 'readwrite');
      transaction.objectStore('projects').clear();
      transaction.objectStore('revisions').clear();
      await transactionAsPromise(transaction);
    } finally {
      database.close();
    }
  } catch (error) {
    if (indexedDbFactory(options)) throw error;
  }
}
