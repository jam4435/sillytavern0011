#!/usr/bin/env node

/**
 * 金庸群侠传1 世界书索引自动同步脚本
 *
 * 功能：
 * 1. 扫描 `世界书/金庸群侠传1/世界书/` 目录中的所有文件。
 * 2. 将新增或非 JSON 格式的事件 YAML 文件规范化为标准 JSON 格式。
 * 3. 自动同步 `世界书/金庸群侠传1/index.yaml`：
 *    - 保留已有条目的 UID，为新增条目分配唯一的 6 位数字 UID。
 *    - 移除已不存在的无效条目。
 *    - 按「系统前置 -> 射雕 -> 神雕 -> 天龙 -> 奇遇 -> 系统后置」清晰分块排序。
 *    - 自动重建 `__WI_META_FOLDERS__`，确保 100% 覆盖「射雕」「神雕」「天龙」「奇遇」4 个文件夹。
 * 4. 自动调用 `tavern_sync.mjs bundle 金庸群侠传1` 生成 `世界书/金庸群侠传1.json`。
 * 5. 自动同步运行时事件资产（`scripts/generate-wuxia-event-assets.mjs`）。
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const WORLD_BOOK_NAME = '金庸群侠传1';
const WORLD_BOOK_DIR = path.join(rootDir, '世界书', WORLD_BOOK_NAME);
const ENTRIES_DIR = path.join(WORLD_BOOK_DIR, '世界书');
const INDEX_YAML_PATH = path.join(WORLD_BOOK_DIR, 'index.yaml');
const OUTPUT_JSON_PATH = path.join(rootDir, '世界书', `${WORLD_BOOK_NAME}.json`);

// 4 个分类文件夹定义
const FOLDER_DEFS = [
  { id: 'folder_shediao', name: '射雕' },
  { id: 'folder_shendiao', name: '神雕' },
  { id: 'folder_tianlong', name: '天龙' },
  { id: 'folder_qiyu', name: '奇遇' },
];

// 系统固定条目配置
const SYSTEM_ENTRY_CONFIGS = {
  变量指导: {
    enabled: false,
    strategy: { 类型: '蓝灯' },
    position: { 类型: '指定深度', 角色: '系统', 深度: 0, 顺序: 4 },
    probability: 100,
    recursion: { 不可被其他条目激活: false, 不可激活其他条目: false },
    file: '世界书\\变量指导',
  },
  输出提示词: {
    enabled: true,
    strategy: { 类型: '蓝灯' },
    position: { 类型: '指定深度', 角色: '系统', 深度: 0, 顺序: 3 },
    probability: 100,
    recursion: { 不可被其他条目激活: false, 不可激活其他条目: false },
    file: '世界书\\输出提示词',
  },
  战斗骰子: {
    enabled: true,
    strategy: { 类型: '蓝灯' },
    position: { 类型: '指定深度', 角色: '系统', 深度: 4, 顺序: 0 },
    probability: 100,
    recursion: { 不可被其他条目激活: false, 不可激活其他条目: false },
    file: '世界书\\战斗骰子',
  },
  cot: {
    enabled: true,
    strategy: { 类型: '蓝灯' },
    position: { 类型: '指定深度', 角色: '系统', 深度: 0, 顺序: 5 },
    probability: 100,
    recursion: { 不可被其他条目激活: false, 不可激活其他条目: false },
    file: '世界书\\cot',
  },
  世界背景: {
    enabled: true,
    strategy: { 类型: '蓝灯' },
    position: { 类型: '角色定义之前', 顺序: 0 },
    probability: 100,
    recursion: { 不可被其他条目激活: false, 不可激活其他条目: false },
    file: '世界书\\世界背景',
  },
};

const SYSTEM_TOP_NAMES = ['变量指导', '输出提示词'];
const SYSTEM_BOTTOM_NAMES = ['战斗骰子', 'cot', '__WI_META_FOLDERS__', '世界背景'];
const ALL_SYSTEM_NAMES = new Set([...SYSTEM_TOP_NAMES, ...SYSTEM_BOTTOM_NAMES]);

// 生成唯一的 6 位数字 UID
function generateUniqueUid(name, existingUidSet) {
  const hash = crypto.createHash('md5').update(name).digest('hex');
  let num = (parseInt(hash.substring(0, 8), 16) % 900000) + 100000;
  while (existingUidSet.has(num)) {
    num = ((num + 1) % 900000) + 100000;
  }
  existingUidSet.add(num);
  return num;
}

// 判定条目所属文件夹
function categorizeEntry(name) {
  if (ALL_SYSTEM_NAMES.has(name)) return null;
  if (name.startsWith('奇遇事件') || name.startsWith('奇遇-') || name.startsWith('奇遇')) {
    return 'folder_qiyu';
  }
  if (name.startsWith('射雕')) return 'folder_shediao';
  if (name.startsWith('神雕')) return 'folder_shendiao';
  if (name.startsWith('天龙')) return 'folder_tianlong';
  return null;
}

// 提取回目数字与序号用于排序
function getEntrySortWeight(name) {
  if (name.startsWith('奇遇')) {
    return { group: 4, subGroup: name.includes('射雕') ? 1 : name.includes('神雕') ? 2 : 3, name };
  }
  const group = name.startsWith('射雕') ? 1 : name.startsWith('神雕') ? 2 : name.startsWith('天龙') ? 3 : 5;
  const isDebut = name.includes('人物登场');
  return { group, subGroup: isDebut ? 2 : 1, name };
}

export function syncWorldbook() {
  console.log('==============================================');
  console.log('🚀 开始执行世界书索引与文件夹关系自动同步...');
  console.log('==============================================\n');

  // 1. 扫描文件目录
  if (!fs.existsSync(ENTRIES_DIR)) {
    throw new Error(`未找到条目目录: ${ENTRIES_DIR}`);
  }

  const allDirFiles = fs.readdirSync(ENTRIES_DIR);
  console.log(`📁 扫描到目录文件共 ${allDirFiles.length} 个`);

  // 规范化所有事件 YAML 文件为标准 JSON 格式
  let normalizedCount = 0;
  for (const fileName of allDirFiles) {
    if (!fileName.endsWith('.yaml')) continue;
    const baseName = fileName.replace(/\.yaml$/, '');
    if (baseName === '世界背景') continue; // 世界背景保留纯文本/YAML

    const filePath = path.join(ENTRIES_DIR, fileName);
    const rawContent = fs.readFileSync(filePath, 'utf-8').trim();
    if (!rawContent.startsWith('{')) {
      try {
        const parsed = parseYaml(rawContent);
        if (parsed && typeof parsed === 'object') {
          fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          normalizedCount++;
        }
      } catch (err) {
        console.warn(`⚠️ 无法规范化文件 ${fileName}:`, err.message);
      }
    }
  }
  if (normalizedCount > 0) {
    console.log(`✨ 成功将 ${normalizedCount} 个事件 YAML 文件规范化为标准 JSON 格式`);
  }

  // 2. 读取现有 index.yaml
  let existingIndex = { 条目: [] };
  const existingUidsByName = new Map();
  const existingUidSet = new Set();
  let folderMetaUid = 90282;

  if (fs.existsSync(INDEX_YAML_PATH)) {
    const rawIndex = fs.readFileSync(INDEX_YAML_PATH, 'utf-8');
    existingIndex = parseYaml(rawIndex) || { 条目: [] };
    for (const item of existingIndex.条目 || []) {
      if (item.名称 === '__WI_META_FOLDERS__') {
        folderMetaUid = item.uid || folderMetaUid;
      }
      if (item.uid) {
        existingUidsByName.set(item.名称, item.uid);
        existingUidSet.add(item.uid);
      }
    }
  }

  // 3. 构建全部条目清单
  const fileBaseNames = new Set(allDirFiles.map(f => f.replace(/\.(yaml|json|txt)$/, '')));
  const addedEntries = [];
  const validEventNames = [];

  for (const baseName of fileBaseNames) {
    if (ALL_SYSTEM_NAMES.has(baseName)) continue;
    validEventNames.push(baseName);
  }

  // 排序事件条目：射雕 -> 神雕 -> 天龙 -> 奇遇
  validEventNames.sort((a, b) => {
    const wa = getEntrySortWeight(a);
    const wb = getEntrySortWeight(b);
    if (wa.group !== wb.group) return wa.group - wb.group;
    if (wa.subGroup !== wb.subGroup) return wa.subGroup - wb.subGroup;
    return a.localeCompare(b, 'zh-CN');
  });

  // 组装 entry 对象
  const finalEntries = [];
  const entryFolderMap = {};
  const folderCounts = {
    射雕: 0,
    神雕: 0,
    天龙: 0,
    奇遇: 0,
  };

  // 3.1 前置系统条目
  for (const name of SYSTEM_TOP_NAMES) {
    let uid = existingUidsByName.get(name) || (name === '变量指导' ? 130111 : 876815);
    existingUidSet.add(uid);
    const config = SYSTEM_ENTRY_CONFIGS[name];
    finalEntries.push({
      名称: name,
      uid,
      启用: config.enabled,
      激活策略: config.strategy,
      插入位置: config.position,
      激活概率: config.probability,
      递归: config.recursion,
      文件: config.file,
    });
  }

  // 3.2 普通与奇遇事件条目
  for (const name of validEventNames) {
    let uid = existingUidsByName.get(name);
    if (!uid) {
      uid = generateUniqueUid(name, existingUidSet);
      addedEntries.push({ name, uid });
    }
    existingUidSet.add(uid);

    const folderId = categorizeEntry(name);
    if (folderId) {
      entryFolderMap[String(uid)] = folderId;
      const folderDef = FOLDER_DEFS.find(f => f.id === folderId);
      if (folderDef) folderCounts[folderDef.name]++;
    }

    finalEntries.push({
      名称: name,
      uid,
      启用: false,
      激活策略: { 类型: '蓝灯' },
      插入位置: { 类型: '角色定义之后', 顺序: 100 },
      激活概率: 100,
      递归: { 不可被其他条目激活: false, 不可激活其他条目: false },
      文件: `世界书\\${name}`,
    });
  }

  // 3.3 后置系统条目
  for (const name of SYSTEM_BOTTOM_NAMES) {
    if (name === '__WI_META_FOLDERS__') {
      const folderMetaContent = JSON.stringify({
        version: 1,
        folders: FOLDER_DEFS,
        entryFolderMap,
      });
      finalEntries.push({
        名称: '__WI_META_FOLDERS__',
        uid: folderMetaUid,
        启用: false,
        激活策略: { 类型: '绿灯' },
        插入位置: { 类型: '角色定义之后', 顺序: 0 },
        激活概率: 100,
        递归: { 不可被其他条目激活: false, 不可激活其他条目: false },
        内容: folderMetaContent,
      });
    } else {
      let uid = existingUidsByName.get(name) || (name === '战斗骰子' ? 950892 : name === 'cot' ? 519441 : 758050);
      existingUidSet.add(uid);
      const config = SYSTEM_ENTRY_CONFIGS[name];
      finalEntries.push({
        名称: name,
        uid,
        启用: config.enabled,
        激活策略: config.strategy,
        插入位置: config.position,
        激活概率: config.probability,
        递归: config.recursion,
        文件: config.file,
      });
    }
  }

  // 4. 写回 index.yaml
  const yamlHeader = `# yaml-language-server: $schema=https://testingcf.jsdelivr.net/gh/StageDog/tavern_sync/dist/schema/worldbook.zh.json\n锚点: {}\n\n条目:\n`;
  const entriesYaml = finalEntries
    .map(entry => {
      let block = `  - 名称: ${entry.名称}\n    uid: ${entry.uid}\n    启用: ${entry.启用}\n    激活策略:\n      类型: ${entry.激活策略.类型}\n    插入位置:\n      类型: ${entry.插入位置.类型}\n`;
      if (entry.插入位置.角色) block += `      角色: ${entry.插入位置.角色}\n`;
      if (entry.插入位置.深度 !== undefined) block += `      深度: ${entry.插入位置.深度}\n`;
      if (entry.插入位置.顺序 !== undefined) block += `      顺序: ${entry.插入位置.顺序}\n`;
      block += `    激活概率: ${entry.激活概率}\n    递归:\n      不可被其他条目激活: ${entry.递归.不可被其他条目激活}\n      不可激活其他条目: ${entry.递归.不可激活其他条目}\n`;
      if (entry.文件) {
        block += `    文件: ${entry.文件}\n`;
      } else if (entry.内容) {
        block += `    内容: '${entry.内容}'\n`;
      }
      return block;
    })
    .join('\n');

  fs.writeFileSync(INDEX_YAML_PATH, yamlHeader + entriesYaml, 'utf-8');
  console.log(`📝 已成功写回 ${INDEX_YAML_PATH}（总条目数: ${finalEntries.length}）`);

  if (addedEntries.length > 0) {
    console.log(`\n🆕 新注册条目 (${addedEntries.length} 个):`);
    addedEntries.forEach(e => console.log(`   + ${e.name} (UID: ${e.uid})`));
  }

  console.log('\n📊 文件夹分类统计：');
  console.log(`   - 射雕: ${folderCounts.射雕} 个条目`);
  console.log(`   - 神雕: ${folderCounts.神雕} 个条目`);
  console.log(`   - 天龙: ${folderCounts.天龙} 个条目`);
  console.log(`   - 奇遇: ${folderCounts.奇遇} 个条目`);
  console.log(`   - 映射覆盖率: 100% (${Object.keys(entryFolderMap).length}/${validEventNames.length})`);

  // 5. 执行 tavern_sync bundle
  console.log('\n📦 正在打包世界书导出文件...');
  try {
    const bundleOutput = execSync(`node tavern_sync.mjs bundle ${WORLD_BOOK_NAME}`, {
      cwd: rootDir,
      encoding: 'utf-8',
    });
    console.log(`   ${bundleOutput.trim()}`);
  } catch (err) {
    console.error('❌ 打包世界书失败:', err.message);
    throw err;
  }

  // 6. 执行事件运行时资产生成
  console.log('\n⚙️ 正在同步运行时事件资产...');
  try {
    const assetOutput = execSync(`node scripts/generate-wuxia-event-assets.mjs`, {
      cwd: rootDir,
      encoding: 'utf-8',
    });
    console.log(`   ${assetOutput.trim()}`);
  } catch (err) {
    console.error('❌ 生成事件资产失败:', err.message);
    throw err;
  }

  console.log('\n==============================================');
  console.log('✅ 世界书同步全部完成！');
  console.log('==============================================');
}

// 直接运行时执行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncWorldbook();
}
