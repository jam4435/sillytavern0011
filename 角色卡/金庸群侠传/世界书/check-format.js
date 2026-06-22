const fs = require('fs');
const path = require('path');

const base = 'F:\\Develop\\AI\\sillytavern\\角色卡\\金庸群侠传\\世界书';

// 找一个无地点改动但格式不同的文件
const files = fs.readdirSync(path.join(base, '射雕\\事件')).filter(f => f.endsWith('.txt'));
let found = false;

for (const file of files) {
  const newFile = path.join(base, '射雕\\事件', file);
  const oldFile = path.join(base, `射雕事件条目-${file}`);

  if (!fs.existsSync(oldFile)) continue;

  const newContent = fs.readFileSync(newFile, 'utf8');
  const oldContent = fs.readFileSync(oldFile, 'utf8');

  try {
    const newObj = JSON.parse(newContent);
    const oldObj = JSON.parse(oldContent);

    // 语义相同但文本不同 = 仅格式差异
    if (JSON.stringify(newObj) === JSON.stringify(oldObj) && newContent !== oldContent) {
      console.log('对比文件:', `射雕事件条目-${file}`);
      console.log('\n===== 原始 JSON 格式 (根目录) =====');
      console.log(oldContent.substring(0, 800));
      console.log('\n===== 修复后 JSON 格式 (射雕\\事件) =====');
      console.log(newContent.substring(0, 800));

      // 行级对比
      const oldLines = oldContent.split('\n');
      const newLines = newContent.split('\n');
      console.log(`\n===== 格式差异统计 =====`);
      console.log(`原始行数: ${oldLines.length}`);
      console.log(`新行数: ${newLines.length}`);

      // 显示缩进变化
      for (let i = 0; i < Math.min(oldLines.length, newLines.length); i++) {
        if (oldLines[i] !== newLines[i]) {
          console.log(`\n第 ${i+1} 行差异:`);
          console.log(`  原始: ${oldLines[i].replace(/\t/g, '\\t').replace(/ /g, '·')}`);
          console.log(`  新:   ${newLines[i].replace(/\t/g, '\\t').replace(/ /g, '·')}`);
          if (i > 5) { console.log('  ...(仅显示前6行差异)'); break; }
        }
      }
      found = true;
      break;
    }
  } catch(e) {}
}

if (!found) console.log('未找到仅格式不同的文件');
