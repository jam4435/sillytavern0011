const WUXIA_AVATAR_ASSET_REVISION = '68edb1c301a67990c4b14b726cbddde406756149';
const WUXIA_AVATAR_ASSET_BASE_URL =
  `https://raw.githubusercontent.com/jam4435/my-image-hosting/${WUXIA_AVATAR_ASSET_REVISION}/wuxia/avatars/v1`;

export type RemoteAvatarCollection = 'generated' | 'jinyong';

/**
 * Avatar assets are version-pinned so an update to the image-hosting branch
 * cannot silently change an already released frontend.
 */
export function getRemoteAvatarUrl(collection: RemoteAvatarCollection, fileName: string): string {
  return `${WUXIA_AVATAR_ASSET_BASE_URL}/${collection}/${encodeURIComponent(fileName)}`;
}
