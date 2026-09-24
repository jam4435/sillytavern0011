const WUXIA_REMOTE_ASSET_REVISION = 'b031956fe5e21e28b6de41d86a14ce2eaa7c9a28';
const WUXIA_REMOTE_ASSET_BASE_URL =
  `https://cdn.jsdelivr.net/gh/jam4435/my-image-hosting@${WUXIA_REMOTE_ASSET_REVISION}/wuxia`;

export type RemoteAvatarCollection = 'generated' | 'jinyong';

/**
 * Remote image assets are version-pinned so an update to the image-hosting branch
 * cannot silently change an already released frontend.
 */
export function getRemoteAvatarUrl(collection: RemoteAvatarCollection, fileName: string): string {
  return `${WUXIA_REMOTE_ASSET_BASE_URL}/avatars/v1/${collection}/${encodeURIComponent(fileName)}`;
}

/**
 * Generated NPC portraits are flat WebP assets: the normalized NPC name is
 * the filename. This deliberately avoids maintaining a per-character path
 * registry as the portrait archive grows.
 */
export function getGeneratedNpcAvatarUrl(name: string): string {
  return `${WUXIA_REMOTE_ASSET_BASE_URL}/avatars/v2/generated/${encodeURIComponent(name.trim())}.webp`;
}

export function getRemoteMapUrl(fileName: string): string {
  return `${WUXIA_REMOTE_ASSET_BASE_URL}/maps/v1/${encodeURIComponent(fileName)}`;
}
