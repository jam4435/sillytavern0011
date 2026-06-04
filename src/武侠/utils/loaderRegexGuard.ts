import { initLogger } from './logger';

type RegexScope =
  | { type: 'global' }
  | { type: 'character'; name: 'current' }
  | { type: 'preset'; name: 'in_use' };

const LOADER_REGEX_SCOPES: RegexScope[] = [
  { type: 'character', name: 'current' },
  { type: 'global' },
  { type: 'preset', name: 'in_use' },
];

const LOADER_REPLACEMENT_HINTS = [
  /localhost:5500\/dist\/武侠\/index\.html/i,
  /127\.0\.0\.1:5500\/dist\/武侠\/index\.html/i,
  /\$\(['"]body['"]\)\.load\(/i,
];

function shouldSkipLoaderRegexGuard(): boolean {
  try {
    return localStorage.getItem('wuxia_skip_loader_regex_guard') === '1';
  } catch {
    return false;
  }
}

function isWuxiaLoaderRegex(regex: TavernRegex): boolean {
  const scriptName = regex.script_name || '';
  const replacement = regex.replace_string || '';

  if (scriptName === '游戏页面') {
    return true;
  }

  return LOADER_REPLACEMENT_HINTS.some(pattern => pattern.test(replacement));
}

function getScopeLabel(scope: RegexScope): string {
  if (scope.type === 'character') return 'character(current)';
  if (scope.type === 'preset') return 'preset(in_use)';
  return 'global';
}

export async function ensureLoaderRegexSafety(): Promise<boolean> {
  if (shouldSkipLoaderRegexGuard()) {
    return false;
  }

  if (typeof getTavernRegexes !== 'function' || typeof updateTavernRegexesWith !== 'function') {
    initLogger.warn('缺少酒馆正则接口，跳过加载正则安全修正');
    return false;
  }

  let changed = false;

  for (const scope of LOADER_REGEX_SCOPES) {
    const regexes = getTavernRegexes(scope);
    const matchedRegexes = regexes.filter(regex => regex.enabled && regex.run_on_edit && isWuxiaLoaderRegex(regex));

    if (matchedRegexes.length === 0) {
      continue;
    }

    initLogger.warn(
      `检测到 ${getScopeLabel(scope)} 中 ${matchedRegexes.length} 条游戏页面加载正则开启了 run_on_edit，正在关闭以避免编辑确认污染楼层`,
    );

    await updateTavernRegexesWith(
      currentRegexes => {
        currentRegexes.forEach(regex => {
          if (regex.enabled && regex.run_on_edit && isWuxiaLoaderRegex(regex)) {
            regex.run_on_edit = false;
          }
        });
        return currentRegexes;
      },
      scope,
    );

    changed = true;
  }

  return changed;
}
