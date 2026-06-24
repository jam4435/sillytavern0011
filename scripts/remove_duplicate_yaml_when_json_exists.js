#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join('世界书', '金庸群侠传1', '金庸群侠传1');
const PREVIEW_LIMIT = 20;

function parseArgs(argv) {
  const options = {
    dir: DEFAULT_DIR,
    apply: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dir' && argv[i + 1]) {
      options.dir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function collectTargets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const jsonBaseNames = new Set();
  const yamlFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    const baseName = path.basename(entry.name, path.extname(entry.name));

    if (extension === '.json') {
      jsonBaseNames.add(baseName);
      continue;
    }

    if (extension === '.yaml') {
      yamlFiles.push(entry.name);
    }
  }

  return yamlFiles
    .filter(fileName => jsonBaseNames.has(path.basename(fileName, '.yaml')))
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function printPreview(targets) {
  const preview = targets.slice(0, PREVIEW_LIMIT);
  if (preview.length === 0) {
    return;
  }

  console.log(`Preview (${preview.length}/${targets.length}):`);
  for (const fileName of preview) {
    console.log(`- ${fileName}`);
  }

  if (targets.length > preview.length) {
    console.log(`... ${targets.length - preview.length} more`);
  }
}

function removeTargets(dir, targets, verbose) {
  for (const fileName of targets) {
    const fullPath = path.join(dir, fileName);
    fs.unlinkSync(fullPath);
    if (verbose) {
      console.log(`Deleted: ${fileName}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(options.dir);

  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const targets = collectTargets(dir);

  console.log(`Directory: ${dir}`);
  console.log(`Matching YAML files: ${targets.length}`);

  if (targets.length === 0) {
    return;
  }

  printPreview(targets);

  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to delete the files.');
    return;
  }

  removeTargets(dir, targets, options.verbose);
  console.log(`Deleted ${targets.length} YAML files.`);
}

main();
