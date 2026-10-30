declare const __WUXIA_BUILD_COMMIT__: string;

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const GITHUB_MAIN_REF_API =
  'https://api.github.com/repos/jam4435/sillytavern0011/git/ref/heads/main';

export type WuxiaBuildComparison = 'latest' | 'outdated' | 'unknown';

export const WUXIA_BUILD_COMMIT =
  typeof __WUXIA_BUILD_COMMIT__ === 'string' && COMMIT_SHA_PATTERN.test(__WUXIA_BUILD_COMMIT__)
    ? __WUXIA_BUILD_COMMIT__.toLowerCase()
    : 'unknown';

export function compareWuxiaBuildCommit(currentCommit: string, remoteCommit: string): WuxiaBuildComparison {
  const current = currentCommit.trim().toLowerCase();
  const remote = remoteCommit.trim().toLowerCase();

  if (!COMMIT_SHA_PATTERN.test(current) || !COMMIT_SHA_PATTERN.test(remote)) {
    return 'unknown';
  }

  return current === remote ? 'latest' : 'outdated';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function fetchLatestWuxiaCommit(signal?: AbortSignal): Promise<string> {
  const response = await fetch(GITHUB_MAIN_REF_API, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败：HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.object)) {
    throw new Error('GitHub API 返回的分支信息格式无效');
  }

  const sha = payload.object.sha;
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    throw new Error('GitHub API 返回的提交 SHA 无效');
  }

  return sha.toLowerCase();
}
