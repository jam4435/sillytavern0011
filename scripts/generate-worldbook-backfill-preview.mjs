import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const assignmentDoc = JSON.parse(fs.readFileSync('plans/武侠角色功法审计/门派角色功法分配候选.json', 'utf-8'));
const dir = '世界书/金庸群侠传1/世界书';
const debutFiles = new Map();

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
  const fullPath = path.join(dir, file);
  try {
    const doc = yaml.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (doc?.insert && typeof doc.insert === 'object') {
      for (const [charName, val] of Object.entries(doc.insert)) {
        if (!debutFiles.has(charName) && val && typeof val === 'object') {
          debutFiles.set(charName, {
            charName,
            fileName: file,
            fullPath,
            eventName: doc.事件名称 || file,
            currentPowers: (val.功法 && typeof val.功法 === 'object') ? { ...val.功法 } : {},
            realm: val.境界 || '未知',
            identity: val.身份 || {}
          });
        }
      }
    }
  } catch (e) {}
}

const previewList = [];

// 特殊原著角色开局排除清单（不应在开局就预装门派武功）
const SKIP_CHARACTERS = new Set([
  '段誉', // 开局厌恶武学、无内力，后机缘学北冥/凌波/六脉
  '游坦之', // 开局聚贤庄纨绔子弟无武功，后学神足经/冰蚕毒掌
  '郭破虏', // 幼年
]);

for (const candidate of assignmentDoc.候选角色) {
  const charName = candidate.角色;
  if (SKIP_CHARACTERS.has(charName)) continue;

  const debut = debutFiles.get(charName);
  if (!debut) continue;

  const currentArtNames = new Set(Object.keys(debut.currentPowers));
  const toAdd = [];

  for (const suggestion of candidate.建议分配) {
    const artName = suggestion.功法;
    if (!currentArtNames.has(artName)) {
      let mastery = suggestion.建议掌握程度;

      // 境界与身份校准掌握程度
      if (charName === '虚竹') {
        mastery = '略有小成';
      } else if (charName === '鸠摩智' || charName === '扫地僧' || charName === '天山童姥' || charName === '无崖子' || charName === '李秋水') {
        mastery = '出神入化';
      } else if (charName === '郭芙' || charName === '郭襄' || charName === '武敦儒' || charName === '武修文') {
        mastery = '略有小成';
      }

      toAdd.push({
        功法: artName,
        传承层级: suggestion.传承层级,
        建议掌握程度: mastery,
        门派ID: suggestion.来源门派ID || candidate.门派归属候选?.[0]?.门派ID || '通用',
        置信度: suggestion.置信度?.分值 || 0.8
      });
    }
  }

  if (toAdd.length > 0) {
    const sectName = candidate.门派归属候选?.[0]?.门派 || '江湖门派';
    const sectRelation = candidate.门派归属候选?.[0]?.归属类型 || '门人';
    previewList.push({
      角色: charName,
      门派: sectName,
      门派ID: candidate.门派归属候选?.[0]?.门派ID || '通用',
      门派关系: sectRelation,
      登场境界: debut.realm,
      登场文件: debut.fileName,
      当前已有功法: Object.entries(debut.currentPowers).map(([k, v]) => `${k}: ${v}`),
      拟补全功法: toAdd
    });
  }
}

previewList.sort((a, b) => (a.门派 || '').localeCompare(b.门派 || '', 'zh-CN') || a.角色.localeCompare(b.角色, 'zh-CN'));

fs.writeFileSync('plans/武侠角色功法审计/世界书功法回填预览表.json', JSON.stringify(previewList, null, 2), 'utf-8');

let md = `# 世界书人物登场功法回填预览表 (Diff Preview)\n\n`;
md += `> 本表根据已审核通过的 **17 大门派武学谱系**、**角色分配建议** 以及 **原著开局生平考据** 严格生成。\n`;
md += `> 统计：涉及 **${previewList.length}** 位角色，拟在首次登场事件 YAML 中回填 **${previewList.reduce((acc, x) => acc + x.拟补全功法.length, 0)}** 项正统门派功法。\n\n`;

// 按门派分组
const bySect = new Map();
for (const p of previewList) {
  if (!bySect.has(p.门派)) bySect.set(p.门派, []);
  bySect.get(p.门派).push(p);
}

for (const [sect, chars] of bySect.entries()) {
  md += `## 【${sect}】 (${chars.length} 人)\n\n`;
  for (const c of chars) {
    md += `### ${c.角色} \n`;
    md += `- **登场事件文件**：\`世界书/金庸群侠传1/世界书/${c.登场文件}\`\n`;
    md += `- **登场境界 / 身份**：\`${c.登场境界}\` / \`${c.门派关系}\`\n`;
    md += `- **当前已有功法**：${c.当前已有功法.length ? c.当前已有功法.map(x => `\`${x}\``).join(', ') : '*(无)*'}\n`;
    md += `- **拟回填补全功法**：\n`;
    for (const a of c.拟补全功法) {
      md += `  + **\`${a.功法}\`** —— 掌握程度：\`${a.建议掌握程度}\` (${a.传承层级})\n`;
    }
    md += `\n`;
  }
}

fs.writeFileSync('plans/武侠角色功法审计/世界书功法回填预览表.md', md, 'utf-8');
console.log(`生成完成！已输出：
- plans/武侠角色功法审计/世界书功法回填预览表.json
- plans/武侠角色功法审计/世界书功法回填预览表.md
共涉及 ${previewList.length} 位角色，回填 ${previewList.reduce((acc, x) => acc + x.拟补全功法.length, 0)} 门功法。`);
