const fs = require('fs');
const path = require('path');

const base = 'F:\\Develop\\AI\\sillytavern\\角色卡\\金庸群侠传\\世界书';

function compareFiles(newDir, oldPrefix, label) {
  let changed = 0, same = 0, errors = 0;

  const files = fs.readdirSync(newDir).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    const newFile = path.join(newDir, file);
    const oldFile = path.join(base, `${oldPrefix}${file}`);

    if (!fs.existsSync(oldFile)) { errors++; continue; }

    try {
      const newObj = JSON.parse(fs.readFileSync(newFile, 'utf8'));
      const oldObj = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
      const newStr = JSON.stringify(newObj);
      const oldStr = JSON.stringify(oldObj);

      if (newStr !== oldStr) {
        changed++;
      } else {
        same++;
      }
    } catch (e) {
      errors++;
    }
  }

  console.log(`\n【${label}】`);
  console.log(`  有地点改动: ${changed}`);
  console.log(`  内容完全相同: ${same}`);
  console.log(`  错误: ${errors}`);
  return changed;
}

const c1 = compareFiles(path.join(base, '射雕\\事件'), '射雕事件条目-', '射雕');
const c2 = compareFiles(path.join(base, '神雕\\事件'), '神雕事件条目-', '神雕');
console.log(`\n总计有地点改动的文件: ${c1 + c2}`);
