const WUXIA_REMOTE_ASSET_REVISION = 'de2963e30b7e9a02d9c953d84fa8eb7d447d1ddc';
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

export function getRemoteMapUrl(fileName: string): string {
  return `${WUXIA_REMOTE_ASSET_BASE_URL}/maps/v1/${encodeURIComponent(fileName)}`;
}
