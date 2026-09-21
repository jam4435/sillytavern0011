#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const IGNORED_ENTRY_DIRECTORIES = new Set([path.normalize('src/顶部工具栏插件')]);
const IGNORED_ENTRY_ROOT_DIRECTORIES = new Set([path.normalize('示例')]);

const EVENT_SOURCE_DIRECTORY = path.join(rootDir, '世界书');
const EVENT_DATA_DIRECTORY = path.join(rootDir, 'src', '事件脚本', 'generated', 'event-data');
const EVENT_SUMMARY_PATH = path.join(rootDir, 'src', '武侠', 'data', '事件信息汇总.json');
const EVENT_GENERATOR_INPUTS = [
  path.join(rootDir, 'scripts', 'generate-wuxia-event-assets.mjs'),
  path.join(rootDir, 'scripts', 'lib', 'wuxia-event-summary.mjs'),
  path.join(rootDir, 'src', '事件脚本', 'era-event-schema.js'),
  path.join(rootDir, 'src', 'shared', 'locationPath.js'),
  path.join(rootDir, 'src', 'shared', 'eventKey.js'),
  path.join(rootDir, 'src', 'shared', 'wuxiaCalendar.js'),
  path.join(rootDir, 'src', '武侠', '武侠地点表.yaml'),
];

function collect_files(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collect_files(entryPath, predicate));
    else if (entry.isFile() && predicate(entryPath)) result.push(entryPath);
  }
  return result;
}

function read_event_output_paths() {
  const manifestPath = path.join(EVENT_DATA_DIRECTORY, 'manifest.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(EVENT_SUMMARY_PATH)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const referenced = [
      ...(Array.isArray(manifest.shards) ? manifest.shards.map(item => item?.file) : []),
      ...(Array.isArray(manifest.checkpoints) ? manifest.checkpoints.map(item => item?.file) : []),
    ]
      .filter(file => typeof file === 'string' && file.length > 0)
      .map(file => path.join(EVENT_DATA_DIRECTORY, file));
    const outputs = [manifestPath, EVENT_SUMMARY_PATH, ...referenced];
    return outputs.every(fs.existsSync) ? outputs : null;
  } catch {
    return null;
  }
}

function get_event_asset_state() {
  const outputs = read_event_output_paths();
  if (!outputs) return { needsGeneration: true, reason: '生成产物缺失或 manifest 不完整' };

  const missingInput = EVENT_GENERATOR_INPUTS.find(file => !fs.existsSync(file));
  if (missingInput) {
    return {
      needsGeneration: true,
      reason: `生成器依赖缺失: ${path.relative(rootDir, missingInput)}`,
    };
  }

  const worldbookYamlFiles = collect_files(EVENT_SOURCE_DIRECTORY, file => /\.ya?ml$/i.test(file));
  const inputs = [...EVENT_GENERATOR_INPUTS, ...worldbookYamlFiles];
  const newestInput = Math.max(...inputs.map(file => fs.statSync(file).mtimeMs));
  const oldestOutput = Math.min(...outputs.map(file => fs.statSync(file).mtimeMs));
  if (oldestOutput < newestInput) {
    return { needsGeneration: true, reason: '事件 YAML / 地点表 / 生成器代码有更新' };
  }
  return { needsGeneration: false, reason: '事件生成输入未变化' };
}

function common_path(lhs, rhs) {
  const lhs_parts = path.normalize(lhs).split(path.sep);
  const rhs_parts = path.normalize(rhs).split(path.sep);
  for (let i = 0; i < Math.min(lhs_parts.length, rhs_parts.length); i++) {
    if (lhs_parts[i] !== rhs_parts[i]) {
      return lhs_parts.slice(0, i).join(path.sep);
    }
  }
  return lhs_parts.join(path.sep);
}

function should_ignore_entry(script_file) {
  const normalized_file = path.normalize(script_file);
  const normalized_dir = path.normalize(path.dirname(script_file));
  if (
    [...IGNORED_ENTRY_ROOT_DIRECTORIES].some(
      ignored_dir => normalized_file === ignored_dir || normalized_file.startsWith(`${ignored_dir}${path.sep}`),
    )
  ) {
    return true;
  }
  return [...IGNORED_ENTRY_DIRECTORIES].some(
    ignored_dir => normalized_dir === ignored_dir || normalized_dir.startsWith(`${ignored_dir}${path.sep}`),
  );
}

function glob_entries() {
  const results = [];
  const files = fs
    .globSync(`src/**/index.{ts,tsx,js,jsx}`, { cwd: rootDir })
    .filter(file => !should_ignore_entry(file))
    .filter(file => process.env.CI !== 'true' || !fs.readFileSync(path.join(rootDir, file), 'utf8').includes('@no-ci'));

  for (const file of files) {
    const file_dirname = path.normalize(path.dirname(file));
    let keep = true;
    for (const [index, result] of results.entries()) {
      const result_dirname = path.normalize(path.dirname(result));
      const common = common_path(result_dirname, file_dirname);
      if (common === result_dirname) {
        keep = false;
        break;
      }
      if (common === file_dirname) {
        results.splice(index, 1, file);
        keep = false;
        break;
      }
    }
    if (keep) {
      results.push(file);
    }
  }

  return results.map(script => {
    const normalizedScript = script.split(path.sep).join('/');
    const parsed = path.parse(script);
    const configName = `${parsed.dir}-${parsed.name}`.replaceAll(/[\\/]/g, '-');
    const relativeDir = parsed.dir.replace(/^src[\\/]?/, '').split(path.sep).join('/');
    return {
      script: normalizedScript,
      configName,
      relativeDir: relativeDir || parsed.dir,
      dir: parsed.dir.split(path.sep).join('/'),
      name: parsed.name,
    };
  });
}

function printHelp(allEntries) {
  console.log('\n\x1b[36m[build:only]\x1b[0m 请指定要构建的插件/模块名称。');
  console.log('\n\x1b[1m使用示例:\x1b[0m');
  console.log('  pnpm build:only ck                # 生产构建 ck 模块');
  console.log('  pnpm fast:only ck                 # 快速构建 ck 模块 (跳过压缩，极速调试)');
  console.log('  pnpm watch:only 武侠              # 监听构建武侠模块');
  console.log('  pnpm fast:only JM                 # 匹配构建 JM 目录下全部入口');
  console.log('\n\x1b[1m当前检测到的可用模块列表:\x1b[0m');

  const grouped = new Map();
  for (const entry of allEntries) {
    const topFolder = entry.relativeDir.split('/')[0];
    if (!grouped.has(topFolder)) {
      grouped.set(topFolder, []);
    }
    grouped.get(topFolder).push(entry);
  }

  for (const [folder, entries] of grouped.entries()) {
    const configNames = entries.map(e => `\x1b[33m${e.configName}\x1b[0m (${e.script})`).join('\n      ');
    console.log(`  \x1b[32m• ${folder}\x1b[0m\n      ${configNames}`);
  }
  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  const allEntries = glob_entries();

  let isFast = false;
  let isWatch = false;
  let isDev = false;
  const targets = [];

  for (const arg of args) {
    if (arg === '--fast' || arg === '-f') {
      isFast = true;
    } else if (arg === '--watch' || arg === '-w') {
      isWatch = true;
    } else if (arg === '--dev' || arg === '-d') {
      isDev = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp(allEntries);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      targets.push(arg);
    }
  }

  if (targets.length === 0) {
    printHelp(allEntries);
    process.exit(1);
  }

  const matchedEntries = [];
  for (const target of targets) {
    const targetNorm = target.toLowerCase().replace(/^[\\/]+|[\\/]+$/g, '');

    // 1. 优先精准匹配（相对路径、配置名、src路径、一级目录分组）
    const exactMatched = allEntries.filter(entry => {
      const configNameNorm = entry.configName.toLowerCase();
      const dirNorm = entry.dir.toLowerCase();
      const relNorm = entry.relativeDir.toLowerCase();
      const topFolderNorm = entry.relativeDir.split('/')[0].toLowerCase();

      return (
        configNameNorm === targetNorm ||
        relNorm === targetNorm ||
        dirNorm === targetNorm ||
        dirNorm === `src/${targetNorm}` ||
        topFolderNorm === targetNorm
      );
    });

    if (exactMatched.length > 0) {
      matchedEntries.push(...exactMatched);
      continue;
    }

    // 2. 无精准匹配时进行模糊/包含匹配
    const fuzzyMatched = allEntries.filter(entry => {
      const scriptNorm = entry.script.toLowerCase();
      const configNameNorm = entry.configName.toLowerCase();
      const relNorm = entry.relativeDir.toLowerCase();

      return (
        relNorm.includes(targetNorm) ||
        configNameNorm.includes(targetNorm) ||
        scriptNorm.includes(targetNorm)
      );
    });

    matchedEntries.push(...fuzzyMatched);
  }

  // Deduplicate
  const uniqueMatched = [...new Map(matchedEntries.map(e => [e.configName, e])).values()];

  if (uniqueMatched.length === 0) {
    console.error(`\x1b[31m[build:only]\x1b[0m 未找到匹配 "${targets.join(', ')}" 的构建入口！\n`);
    printHelp(allEntries);
    process.exit(1);
  }

  console.log(`\x1b[36m[build:only]\x1b[0m 目标匹配到 ${uniqueMatched.length} 个构建配置:`);
  for (const e of uniqueMatched) {
    console.log(`  - \x1b[32m${e.configName}\x1b[0m (${e.script})`);
  }

  // Check if events generation is needed. Only Wuxia / event-script targets depend on it.
  const needsEvents = uniqueMatched.some(e => e.script.includes('武侠') || e.script.includes('事件脚本'));

  if (needsEvents) {
    const eventAssetState = get_event_asset_state();
    if (eventAssetState.needsGeneration) {
      console.log(
        `\x1b[36m[build:only]\x1b[0m 正在生成事件资产 (generate:events)：${eventAssetState.reason}...`,
      );
      try {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'generate-wuxia-event-assets.mjs')], {
          cwd: rootDir,
          stdio: 'inherit',
        });
      } catch (err) {
        console.error('\x1b[31m[build:only]\x1b[0m generate:events 执行失败');
        process.exit(1);
      }
    } else {
      console.log(`\x1b[36m[build:only]\x1b[0m 跳过 generate:events（${eventAssetState.reason}）`);
    }
  } else {
    console.log('\x1b[36m[build:only]\x1b[0m 跳过 generate:events（当前构建目标不依赖事件资产）');
  }

  // Build webpack command arguments
  const webpackArgs = [];
  if (isDev) {
    webpackArgs.push('--mode', 'development');
  } else {
    webpackArgs.push('--mode', 'production');
  }

  webpackArgs.push('--env', 'srcOnly=true');
  if (isFast) {
    webpackArgs.push('--env', 'fast=true');
  }
  if (isWatch) {
    webpackArgs.push('--watch', '--progress');
  }

  for (const e of uniqueMatched) {
    webpackArgs.push('--config-name', e.configName);
  }

  console.log(`\x1b[36m[build:only]\x1b[0m 启动 Webpack 构建 [mode: ${isDev ? 'dev' : 'prod'}, fast: ${isFast}, watch: ${isWatch}]...\n`);

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(npxCmd, ['webpack', ...webpackArgs], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', code => {
    process.exit(code ?? 0);
  });
}

main();
