// 激活条目追踪模块
// 用于追踪哪些世界书条目在AI生成时被激活

// 存储当前激活的条目，格式: "worldbook:uid"
const activeEntryKeys = new Set();

/**
 * 生成条目的唯一键
 * @param {string} worldbook - 世界书名称
 * @param {string|number} uid - 条目UID
 * @returns {string} 唯一键
 */
function makeEntryKey(worldbook, uid) {
  return `${worldbook}:${uid}`;
}

/**
 * 更新激活的条目列表（基于 WORLD_INFO_ACTIVATED 事件）
 * @param {Array} entries - 激活的条目数组，每个条目包含 uid 和 world 信息
 */
export function updateActiveEntries(entries) {
  // 清空之前的激活状态
  activeEntryKeys.clear();

  if (!Array.isArray(entries)) {
    console.log('角色世界书: ⚠️ 激活追踪 - 条目数据无效（不是数组）');
    return;
  }

  // 遍历激活的条目，记录它们的世界书名称和 UID
  for (const entry of entries) {
    if (entry && entry.uid !== undefined && entry.world) {
      const uid = String(entry.uid);
      const worldbook = entry.world;
      const key = makeEntryKey(worldbook, uid);
      activeEntryKeys.add(key);
      // 尝试多个可能的名称字段
      const entryName = entry.name || entry.comment || entry.key || '未命名';
    }
  }

  console.log(`角色世界书: ✅ 激活追踪 - 检测到 ${activeEntryKeys.size} 个激活条目`);
  console.log('角色世界书: [调试] 激活的条目键列表:', Array.from(activeEntryKeys));
  console.log(
    '角色世界书: [调试] 条目详情:',
    entries.map(e => ({
      uid: e.uid,
      name: e.name || e.comment,
      world: e.world,
    })),
  );
}

/**
 * 检查指定条目是否处于激活状态
 * @param {string|number} uid - 条目UID
 * @param {string} worldbook - 世界书名称
 * @returns {boolean} 是否激活
 */
export function isEntryActive(uid, worldbook) {
  const key = makeEntryKey(worldbook, uid);
  return activeEntryKeys.has(key);
}

/**
 * 清空所有激活状态
 */
export function clearActiveEntries() {
  activeEntryKeys.clear();
  console.log('角色世界书: 激活追踪 - 已清空激活状态');
}

/**
 * 获取当前激活的条目数量
 * @returns {number}
 */
export function getActiveEntriesCount() {
  return activeEntryKeys.size;
}
