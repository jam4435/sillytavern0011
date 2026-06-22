// 地点修复 v3 — 处理剩余不足三级 + 可疑条目全面清洗
const fs = require('fs');
const path = require('path');

const baseDir = 'F:\\Develop\\AI\\sillytavern\\角色卡\\金庸群侠传\\世界书';

// 修复规则
function smartFix(loc, eventLoc) {
  let result = loc.trim();
  const original = result;

  // ---- Step 1: 处理超过三级 ----
  const parts = result.split('/');
  if (parts.length > 3) {
    result = parts.slice(0, 3).join('/');
  }

  // ---- Step 2: 清理注释 ----
  // 去掉括号及内容 (中文和英文括号)
  while (/[（(][^）)]*[）)]/.test(result)) {
    result = result.replace(/[（(][^）)]*[）)]/g, '').trim();
  }
  // 去掉"——"及后续
  result = result.replace(/——.*$/, '').trim();
  // 去掉前后空格
  result = result.replace(/\s+/g, '');

  // ---- Step 3: 处理尾部可疑词 ----
  // "途中" → 去掉，看看还剩什么
  result = result.replace(/途中$/, '');
  // "路上" → 去掉
  result = result.replace(/路上$/, '');
  // "船上" → 去掉
  result = result.replace(/船上$/, '');
  // "附近" → 去掉
  result = result.replace(/附近$/, '');
  // "外围" → 去掉
  result = result.replace(/外围$/, '');
  // "附近[区域]" → 去掉
  result = result.replace(/附近.*$/, '');
  // "（附近）" → 去掉(已在上面的括号清理中处理)
  // "（隐藏）" → 去掉
  // "（逃亡中）" → 去掉
  // "山道"、"街巷" → 保留 (是具体场所)

  // ---- Step 4: 处理特殊不足三级模式 ----
  // 去掉尾部多余内容，但保留最后一部分
  result = result.replace(/([^/]+?)(?:方向|途中|之地|所在|一带|深处|附近).*$/, '$1');

  // 处理"往XX途中" → 直接去掉"往XX"
  result = result.replace(/\/往[^/]*$/, '');

  // 处理"赴XX途中" → 直接去掉
  result = result.replace(/\/赴[^/]*$/, '');

  // 处理"返回XX途中" → 去掉
  result = result.replace(/\/返回[^/]*$/, '');

  // 处理"前往XX途中" → 去掉
  result = result.replace(/\/前往[^/]*$/, '');

  // 处理"从XX"模式
  result = result.replace(/\/从[^/]*$/, '');

  // 处理"被XX"模式
  result = result.replace(/\/被[^/]*$/, '');

  // 处理"（随XX）" - 已在步骤2中处理

  // ---- Step 5: 补全不足三级 ----
  const newParts = result.split('/');

  // 1段 → 需要完整补全
  if (newParts.length === 1) {
    const p = result;
    const map = {
      '不明': eventLoc || '大宋/临安府/牛家村',
      '未知': eventLoc || '大宋/临安府/牛家村',
      '在逃': eventLoc || '大宋/临安府/牛家村',
      '在途': eventLoc || '大宋/临安府/牛家村',
      '逃离中': eventLoc || '大宋/临安府/牛家村',
      '江湖': '大宋/临安府/嘉兴',
      '西域': '蒙古/西域/边城',
      '蒙古': '蒙古/大漠/草原',
      '大宋': '大宋/临安府/牛家村',
      '华山': '大宋/华山/山巅',
      '终南山': '大宋/终南山/重阳宫',
      '桃花岛': '大宋/临安府/桃花岛',
    };
    if (map[p]) return map[p];
    return eventLoc || '大宋/临安府/牛家村';
  }

  // 2段 → 补第3段
  if (newParts.length === 2) {
    const p0 = newParts[0];  // 一级
    const p1 = newParts[1];  // 二级

    // 大宋
    if (p0 === '大宋') {
      // 处理"襄阳城外" → "襄阳/城外"
      if (p1.endsWith('城外')) {
        const city = p1.replace('城外', '');
        return `大宋/${city || '襄阳'}/城外`;
      }
      const map = {
        '苏州': '大宋/苏州/荒山',
        '临安府': '大宋/临安府/牛家村',
        '宝应': '大宋/宝应/刘氏宗祠',
        '岳州': '大宋/岳州/丐帮总舵',
        '嘉兴': '大宋/嘉兴府/陆家庄',
        '嘉兴府': '大宋/嘉兴府/陆家庄',
        '襄阳': '大宋/襄阳/城门',
        '襄阳城': '大宋/襄阳/城门',
        '襄阳城外': '大宋/襄阳/城外',
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
        '潭州': '大宋/潭州/铁掌山',
        '桃源': '大宋/桃源/黑沼',
        '沅江': '大宋/沅江/江岸',
        '太湖': '大宋/太湖/归云庄',
        '黑沼': '大宋/桃源/黑沼',
      };
      if (map[p1]) return map[p1];

      // 如果以"途中"结尾(已经被去掉)，用事件地点
      if (p1.includes('途') || p1.includes('离') || p1.includes('返回')) {
        return eventLoc || '大宋/临安府/牛家村';
      }

      // 如果是"江南东路"这种 → 取事件地点或默认
      if (p1 === '江南东路') return '大宋/临安府/牛家村';
    }

    // 金国/大金
    if (p0 === '金国' || p0 === '大金' || p0 === '金') {
      const map = {
        '中都': '金国/中都/赵王府',
        '张家口': '金国/张家口/酒楼',
        '山东': '金国/山东/济南府',
        '汴梁': '金国/汴梁/王府',
      };
      if (map[p1]) return map[p1];
      return `金国/${p1}/府邸`;
    }

    // 蒙古
    if (p0 === '蒙古') {
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
        '襄阳城外': '蒙古/襄阳/城外',
        '西域': '蒙古/西域/边城',
        '花剌子模': '蒙古/花剌子模/撒马尔罕',
      };
      if (map[p1]) return map[p1];
    }

    // 东海
    if (p0 === '东海') {
      return '大宋/东海/桃花岛';
    }

    // 湖广
    if (p0 === '湖广') {
      return p1 ? `大宋/${p1}/铁掌山` : '大宋/潭州/铁掌山';
    }

    // 湖南
    if (p0 === '湖南') {
      return `大宋/${p1}/郊外`;
    }

    // 大理
    if (p0 === '大理') {
      if (p1 === '桃源') return '大理/桃源/黑沼';
      return '大理/桃源/黑沼';
    }

    // 桃源
    if (p0 === '桃源') {
      return '大宋/桃源/黑沼';
    }

    // 花剌子模
    if (p0 === '花剌子模') {
      return `蒙古/花剌子模/${p1 || '撒马尔罕'}`;
    }

    // 离开/返回/前往/向北 (移动状态)
    if (['离开', '返回', '前往', '向北'].includes(p0)) {
      return eventLoc || '大宋/临安府/牛家村';
    }

    // 默认补全
    if (p0 === '大宋') return `${p0}/${p1}/郊外`;
    if (p0 === '金国') return `${p0}/${p1}/府邸`;
    if (p0 === '蒙古') return `${p0}/${p1}/大营`;
  }

  // ---- Step 6: 最终清理 ----
  // 去掉尾部标点
  result = result.replace(/[，,、。：:；;！!？?]+$/, '');
  // 去掉尾部空格
  result = result.trim();
  // 确保不以/结尾
  result = result.replace(/\/+$/, '');
  // 规范化国家名
  result = result.replace(/^大金\//, '金国/');

  return result !== original.trim() ? result : result;
}

function processObj(obj, eventLoc, filePath) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => processObj(item, eventLoc, filePath));

  const result = {};
  let currentEventLoc = eventLoc;

  for (const [key, value] of Object.entries(obj)) {
    if (key === '事件地点') {
      result[key] = smartFix(value, null);
      currentEventLoc = result[key];
    } else if (key === '所在位置') {
      result[key] = smartFix(value, currentEventLoc);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = processObj(value, currentEventLoc, filePath);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// 执行
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
      const fixed = processObj(obj, eventLoc, filePath);
      const newContent = JSON.stringify(fixed, null, 2);
      if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        totalFixed++;
        // Show changes
        const changes = [];
        findChanges(obj, fixed, '', changes);
        if (changes.length > 0) {
          console.log(`✓ ${path.relative(baseDir, filePath)}`);
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
  if (typeof orig !== 'object' || orig === null || typeof fixed !== 'object' || fixed === null) return;
  if (Array.isArray(orig) && Array.isArray(fixed)) {
    for (let i = 0; i < Math.max(orig.length, fixed.length); i++) {
      findChanges(orig[i], fixed[i], `${prefix}[${i}]`, changes);
    }
    return;
  }
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

console.log('======== 修复射雕/事件 ========');
processDir(path.join(baseDir, '射雕\\事件'));
console.log('\n======== 修复神雕/事件 ========');
processDir(path.join(baseDir, '神雕\\事件'));
console.log(`\n======= 修复完成: ${totalFixed} files, ${totalErrors} errors =======`);
