import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'plans', '武侠角色功法审计', '门派功法谱系.json');
const templatePath = path.join(scriptDirectory, 'templates', 'wuxia-sect-lineage-review.template.html');
const outputPath = path.join(projectRoot, 'plans', '武侠角色功法审计', '门派功法谱系审核台.html');

function assertLineageData(data) {
  if (!data || typeof data !== 'object') throw new Error('门派功法谱系必须是 JSON 对象');
  if (!Array.isArray(data.功法目录)) throw new Error('门派功法谱系缺少“功法目录”数组');
  if (!Array.isArray(data.门派列表)) throw new Error('门派功法谱系缺少“门派列表”数组');

  const artIds = new Set(data.功法目录.map(art => art.功法ID));
  const nodeIds = new Set();
  for (const sect of data.门派列表) {
    if (!sect.门派ID || !Array.isArray(sect.传承节点)) {
      throw new Error(`门派记录结构无效：${sect.门派ID || '(无 ID)'}`);
    }
    for (const node of sect.传承节点) {
      if (!node.节点ID || nodeIds.has(node.节点ID)) throw new Error(`节点 ID 缺失或重复：${node.节点ID}`);
      if (!artIds.has(node.功法ID)) throw new Error(`节点引用了不存在的功法：${node.节点ID} -> ${node.功法ID}`);
      nodeIds.add(node.节点ID);
    }
  }
}

function escapeEmbeddedJson(data) {
  return JSON.stringify(data)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

const [sourceText, template] = await Promise.all([readFile(sourcePath, 'utf8'), readFile(templatePath, 'utf8')]);
const data = JSON.parse(sourceText);
assertLineageData(data);

const generatedAt = new Date().toISOString();
const html = template
  .replace('__GENERATED_AT__', generatedAt)
  .replace('__SOURCE_GENERATED_AT__', data.生成信息?.生成时间 || '未知')
  .replace('__LINEAGE_DATA__', escapeEmbeddedJson(data));

if (html.includes('__LINEAGE_DATA__')) throw new Error('审核台数据占位符替换失败');
await writeFile(outputPath, html, 'utf8');

const nodeCount = data.门派列表.reduce((total, sect) => total + sect.传承节点.length, 0);
console.info(`已生成门派功法谱系审核台：${path.relative(projectRoot, outputPath)}`);
console.info(`内嵌 ${data.门派列表.length} 个体系、${nodeCount} 个传承节点、${data.功法目录.length} 项功法本体。`);
