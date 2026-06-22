// 综合地点修复脚本 v2 — 规则驱动
// 处理剩余不足三级和所有可疑条目
const fs = require('fs');
const path = require('path');

const baseDir = 'F:\\Develop\\AI\\sillytavern\\角色卡\\金庸群侠传\\世界书';

// 超过三级 → 自动取前三级
function fixOver3(loc) {
  const parts = loc.split('/');
  if (parts.length > 3) {
    return parts.slice(0, 3).join('/');
  }
  return null;
}

// 清理可疑/括号注释
function cleanSuspicious(loc) {
  let cleaned = loc;

  // 去掉括号内的注释内容
  // 包含中文括号 （）和英文括号 ()
  cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, '').trim();

  // 去掉"——"注释
  cleaned = cleaned.replace(/——.*$/, '').trim();

  // 去掉末尾的"附近"、"途中"、"路上"、"船上"
  cleaned = cleaned.replace(/附近$/, '').trim();
  cleaned = cleaned.replace(/途中$/, '').trim();
  cleaned = cleaned.replace(/路上$/, '').trim();
  cleaned = cleaned.replace(/船上$/, '').trim();
  cleaned = cleaned.replace(/山地$/, '').trim();
  cleaned = cleaned.replace(/荒野$/, '').trim();
  cleaned = cleaned.replace(/森林$/, '').trim();

  // 去掉末尾注释如"（已被XX）"
  // 第二次清理嵌套括号
  cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, '').trim();

  // 去掉尾部多余标点
  cleaned = cleaned.replace(/[，,、。：:；;！!？?]+$/, '').trim();

  if (cleaned !== loc) {
    // 递归清理直到稳定
    const recurse = cleanSuspicious(cleaned);
    if (recurse !== cleaned && recurse !== loc) {
      return recurse;
    }
  }

  // 确保不以斜杠结尾
  cleaned = cleaned.replace(/\/+$/, '');

  return cleaned === loc ? null : cleaned;
}

// 不足三级 → 补全
function fixUnder3(loc, eventLoc) {
  const parts = loc.split('/');
  if (parts.length >= 3) return null;

  // 如果已经是3级，无需处理
  if (parts.length === 3) return null;

  // 只有1级
  if (parts.length === 1) {
    const p = loc.trim();
    // 完全无效的地点
    if (['不明', '未知', '在逃', '在途', '逃离中', '江湖', '西域', '蒙古'].includes(p)) {
      // 使用事件地点作为参考
      if (eventLoc && eventLoc.split('/').length >= 3) {
        return eventLoc;
      }
      if (p === '蒙古') return '蒙古/大漠/草原';
      if (p === '江湖') return '大宋/临安府/嘉兴';
      if (p === '西域') return '西域/大漠/边关';
      if (p === '不明' || p === '未知') return eventLoc || '大宋/临安府/牛家村';
      if (p === '在逃' || p === '在途' || p === '逃离中') return eventLoc || '大宋/临安府/牛家村';
      return null;
    }

    // 单独的地点名
    if (p === '桃花岛' || p === '东海') return '大宋/临安府/桃花岛';
    if (p === '华山') return '大宋/华山/山巅';
    if (p === '终南山') return '大宋/终南山/重阳宫';
    if (p === '襄阳') return '大宋/襄阳/城门';
    if (p === '绝情谷') return '大宋/绝情谷/水仙山庄';
    if (p === '古墓') return '大宋/终南山/活死人墓';
    if (p === '重阳宫') return '大宋/终南山/重阳宫';
    if (p === '沅江') return '大宋/沅江/江岸';
    if (p === '大宋') return eventLoc || '大宋/临安府/牛家村';

    return null;
  }

  // 有2级：补第3级
  if (parts.length === 2) {
    const first = parts[0];
    const second = parts[1];

    // 处理大宋/XX
    if (first === '大宋') {
      const map = {
        '苏州': '大宋/苏州/荒山',
        '临安府': '大宋/临安府/牛家村',
        '宝应': '大宋/宝应/刘氏宗祠',
        '岳州': '大宋/岳州/丐帮总舵',
        '嘉兴': '大宋/嘉兴府/陆家庄',
        '嘉兴府': '大宋/嘉兴府/陆家庄',
        '襄阳': '大宋/襄阳/城门',
        '襄阳城': '大宋/襄阳/城门',
        '风陵渡': '大宋/风陵渡/渡口',
        '万花谷': '大宋/万花谷/谷中',
        '桃花岛': '大宋/临安府/桃花岛',
        '东海之滨': '大宋/东海/海岸',
        '东海': '大宋/东海/桃花岛',
        '华山': '大宋/华山/山巅',
        '陕南': '大宋/陕南/小镇',
        '南阳': '大宋/南阳/粮草营',
        '绝情谷': '大宋/绝情谷/水仙山庄',
        '大胜关': '大宋/大胜关/客栈',
        '山西': '大宋/山西/太原',
        '河南': '大宋/河南/洛阳',
        '晋南': '大宋/晋南/小镇',
        '终南山': '大宋/终南山/重阳宫',
        '岭南': '大宋/岭南/小镇',
        '南行途中': eventLoc || '大宋/临安府/牛家村',
        '未知': eventLoc || '大宋/临安府/牛家村',
      };
      if (map[second]) return map[second];
    }

    // 处理金国/XX
    if (first === '金国' || first === '大金' || first === '金') {
      const map = {
        '中都': '金国/中都/赵王府',
        '张家口': '金国/张家口/酒楼',
        '山东': '金国/山东/济南府',
        '汴梁': '金国/汴梁/王府',
      };
      if (map[second]) return map[second];
      if (first === '大金') return `金国/${second}/府邸`;
    }

    // 处理蒙古/XX
    if (first === '蒙古') {
      const map = {
        '斡难河源': '蒙古/斡难河/大营',
        '斡难河畔': '蒙古/斡难河/大营',
        '大漠': '蒙古/大漠/草原',
        '克烈部': '蒙古/克烈部/大营',
        '札达兰部': '蒙古/札达兰部/大营',
        '和林': '蒙古/和林/王庭',
        '撒麻尔罕': '蒙古/撒麻尔罕/城内',
        '宜城': '蒙古/宜城/军营',
        '蒙古军营': '蒙古/大漠/蒙古军营',
        '忽必烈王帐': '蒙古/大漠/忽必烈王帐',
        '忽必烈招贤馆': '蒙古/大漠/忽必烈招贤馆',
        '汴梁': '蒙古/汴梁/旧宫',
        '中都': '蒙古/中都/旧府',
      };
      if (map[second]) return map[second];
    }

    // 处理其他
    if (first === '大理') {
      if (second === '桃源') return '大理/桃源/黑沼';
    }
    if (first === '东海') {
      return '大宋/东海/桃花岛';
    }
    if (first === '湖广') {
      return second ? `大宋/${second}/铁掌山` : '大宋/潭州/铁掌山';
    }
    if (first === '湖南') {
      return `大宋/${second}/郊外`;
    }
    if (first === '大理') {
      return '大理/桃源/黑沼';
    }
    if (first === '桃源') {
      return '大宋/桃源/黑沼';
    }
    if (first === '花剌子模') {
      return `蒙古/花剌子模/${second}`;
    }
    if (first === '离开' || first === '返回' || first === '前往' || first === '向北') {
      // 移动中状态，用事件地点
      return eventLoc || '大宋/临安府/牛家村';
    }
  }

  return null;
}

// 主修复函数
function processLocation(value, eventLoc, isLocField) {
  if (typeof value !== 'string') return value;

  // 跳过空值
  if (!value || value.trim() === '') return value;

  let result = value.trim();

  // 修复超过三级
  const trimmed = fixOver3(result);
  if (trimmed) result = trimmed;

  // 清理可疑/括号注释
  const cleaned = cleanSuspicious(result);
  if (cleaned) result = cleaned;

  // 修复不足三级
  const fixed = fixUnder3(result, eventLoc);
  if (fixed) result = fixed;

  // 确保格式统一
  // 规范化一级名称
  result = result.replace(/^大金\//, '金国/');
  result = result.replace(/^大金$/, '金国/中都/赵王府');

  return result !== value.trim() ? result : value;
}

// 处理整个JSON对象
function traverse(obj, eventLoc, filePath) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => traverse(item, eventLoc, filePath));
  }

  const result = {};
  let currentEventLoc = eventLoc;

  for (const [key, value] of Object.entries(obj)) {
    if (key === '事件地点') {
      result[key] = processLocation(value, null, true);
      currentEventLoc = result[key];
    } else if (key === '所在位置') {
      result[key] = processLocation(value, currentEventLoc, false);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = traverse(value, currentEventLoc, filePath);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ============= 执行 =============
let totalFixed = 0;
let totalErrors = 0;

function processDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(content);
      const eventLoc = obj['事件地点'] || null;
      const fixed = traverse(obj, eventLoc, filePath);
      const newContent = JSON.stringify(fixed, null, 2);

      if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        totalFixed++;
        // 记录具体修改
        const changes = [];
        findChanges(obj, fixed, '', changes);
        if (changes.length > 0) {
          console.log(`✓ ${dirPath}\\${file}`);
          changes.forEach(c => console.log(`  ${c}`));
        }
      }
    } catch (e) {
      totalErrors++;
      console.error(`✗ Error on ${file}: ${e.message}`);
    }
  }
}

function findChanges(orig, fixed, prefix, changes) {
  if (orig === fixed) return;
  if (typeof orig !== typeof fixed) return;

  if (typeof orig === 'object' && orig !== null && typeof fixed === 'object' && fixed !== null) {
    if (Array.isArray(orig) && Array.isArray(fixed)) {
      for (let i = 0; i < Math.max(orig.length, fixed.length); i++) {
        findChanges(orig[i], fixed[i], `${prefix}[${i}]`, changes);
      }
    } else {
      const allKeys = new Set([...Object.keys(orig), ...Object.keys(fixed)]);
      for (const k of allKeys) {
        if (k === '事件地点' || k === '所在位置') {
          if (orig[k] !== fixed[k]) {
            changes.push(`${k}: "${orig[k]}" → "${fixed[k]}"`);
          }
        } else {
          findChanges(orig[k], fixed[k], `${prefix}.${k}`, changes);
        }
      }
    }
  }
}

console.log('======== 修复射雕/事件 ========');
processDir(path.join(baseDir, '射雕\\事件'));

console.log('\n======== 修复神雕/事件 ========');
processDir(path.join(baseDir, '神雕\\事件'));

console.log(`\n======= 修复完成 =======`);
console.log(`修改 ${totalFixed} 个文件`);
console.log(`错误 ${totalErrors} 个`);
