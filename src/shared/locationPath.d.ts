export interface ParsedLocationPath {
  area: string;
  region: string;
  location: string;
  scene: string | null;
  scopePath: string;
  fullPath: string;
  segments: string[];
}

export function parseLocationPath(value: unknown): ParsedLocationPath | null;
export function normalizeLocationPath(value: unknown): string;
export function getLocationScopePath(value: unknown): string;
export function getLocationScene(value: unknown): string;
export function getLocationRegionPath(value: unknown): string;
export function isSameLocationScope(left: unknown, right: unknown): boolean;
export function isSameLocationScene(left: unknown, right: unknown): boolean;
