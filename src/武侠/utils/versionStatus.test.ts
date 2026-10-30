import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareWuxiaBuildCommit, fetchLatestWuxiaCommit } from './versionStatus';

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);

describe('compareWuxiaBuildCommit', () => {
  it('recognizes an exact match as latest', () => {
    expect(compareWuxiaBuildCommit(COMMIT_A, COMMIT_A)).toBe('latest');
  });

  it('recognizes a different remote commit as outdated', () => {
    expect(compareWuxiaBuildCommit(COMMIT_A, COMMIT_B)).toBe('outdated');
  });

  it('returns unknown when either commit is unavailable or malformed', () => {
    expect(compareWuxiaBuildCommit('unknown', COMMIT_A)).toBe('unknown');
    expect(compareWuxiaBuildCommit(COMMIT_A, 'not-a-sha')).toBe('unknown');
  });
});

describe('fetchLatestWuxiaCommit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the latest main ref SHA from GitHub', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ object: { sha: COMMIT_A.toUpperCase() } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLatestWuxiaCommit()).resolves.toBe(COMMIT_A);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/jam4435/sillytavern0011/git/ref/heads/main',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects an invalid SHA returned by GitHub', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ object: { sha: 'not-a-sha' } }),
      }),
    );

    await expect(fetchLatestWuxiaCommit()).rejects.toThrow('提交 SHA 无效');
  });
});
