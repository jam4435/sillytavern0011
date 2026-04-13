const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const files = [
  path.join(repoRoot, 'src', 'JM', '老变量状态栏.txt'),
  path.join(repoRoot, 'src', 'JM', '变量状态栏.html'),
];

function extractScript(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`未找到脚本块: ${filePath}`);
  return match[1];
}

function resolveAcorn() {
  const pnpmRoot = path.join(repoRoot, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmRoot)) return null;
  const candidates = fs
    .readdirSync(pnpmRoot)
    .filter(name => name.startsWith('acorn@'))
    .sort()
    .reverse();
  for (const name of candidates) {
    const candidatePath = path.join(pnpmRoot, name, 'node_modules', 'acorn');
    if (fs.existsSync(candidatePath)) return require(candidatePath);
  }
  return null;
}

function parseWithVm(code) {
  try {
    new vm.Script(code);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function parseWithAcorn(acorn, code) {
  if (!acorn) return [];
  const results = [];
  for (const version of [2024, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015]) {
    try {
      acorn.parse(code, { ecmaVersion: version, sourceType: 'script' });
      results.push({ version, ok: true });
    } catch (error) {
      results.push({ version, ok: false, error });
      break;
    }
  }
  return results;
}

function findHelperUsages(code) {
  const helpers = ['getChatMessages', 'setChatMessages', 'getVariables', 'replaceVariables', 'eventOn', 'errorCatched'];
  return helpers
    .map(name => {
      const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
      const matches = code.match(regex);
      return { name, count: matches ? matches.length : 0 };
    })
    .filter(item => item.count > 0);
}

function main() {
  const acorn = resolveAcorn();
  console.log('=== 变量状态栏诊断 ===');
  console.log('acorn:', acorn ? 'available' : 'missing');

  for (const filePath of files) {
    const relativePath = path.relative(repoRoot, filePath);
    const code = extractScript(filePath);
    const vmResult = parseWithVm(code);
    const acornResults = parseWithAcorn(acorn, code);
    console.log(`\nFILE ${relativePath}`);
    console.log('vm.Script:', vmResult.ok ? 'OK' : `FAIL ${vmResult.error.message}`);
    if (acornResults.length > 0) {
      const summary = acornResults.map(item => {
        if (item.ok) return `OK ${item.version}`;
        return `FAIL ${item.version} @ ${item.error.loc.line}:${item.error.loc.column} ${item.error.message}`;
      });
      summary.forEach(line => console.log(line));
    }
    const usages = findHelperUsages(code);
    usages.forEach(item => console.log(`helper ${item.name}: ${item.count}`));
  }
}

main();
