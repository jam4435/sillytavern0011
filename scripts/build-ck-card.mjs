import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardRoot = path.join(projectRoot, '角色卡', 'CK领主RPG');
const regexDirectory = path.join(cardRoot, '正则');
const scriptDirectory = path.join(cardRoot, '脚本');
const frontendPath = path.join(projectRoot, 'dist', 'ck', 'index.html');
const runtimePath = path.join(projectRoot, 'dist', 'ck-runtime', 'index.js');
const schemaPath = path.join(projectRoot, 'src', 'ck', 'schema.json');

for (const required of [frontendPath, runtimePath]) {
  if (!existsSync(required)) throw new Error(`缺少构建产物：${required}`);
}

mkdirSync(regexDirectory, { recursive: true });
mkdirSync(scriptDirectory, { recursive: true });

const frontend = readFileSync(frontendPath, 'utf8').trim();
const runtime = readFileSync(runtimePath, 'utf8').replace(/\n?\/\/# sourceMappingURL=.*$/u, '').trim();
writeFileSync(path.join(regexDirectory, '游戏页面.txt'), `\`\`\`\n${frontend}\n\`\`\`\n`, 'utf8');
writeFileSync(path.join(scriptDirectory, '运行时桥接.js'), `${runtime}\n`, 'utf8');
if (existsSync(schemaPath)) writeFileSync(path.join(cardRoot, 'schema.json'), readFileSync(schemaPath));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

function placeholderAvatar() {
  const width = 512;
  const height = 512;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const shield = (x, y) => {
    const nx = (x - width / 2) / 154;
    const ny = (y - 245) / 190;
    return ny > -0.92 && ny < 1.08 && Math.abs(nx) < (ny < 0.35 ? 1 : 1.35 - ny * 0.72);
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const distance = Math.hypot(x - width / 2, y - height / 2) / 360;
      let red = Math.round(45 - distance * 18 + y * 0.018);
      let green = Math.round(29 - distance * 11 + y * 0.012);
      let blue = Math.round(20 - distance * 7);
      if (shield(x, y)) {
        const border = !shield(x - 8, y) || !shield(x + 8, y) || !shield(x, y - 8) || !shield(x, y + 8);
        if (border) [red, green, blue] = [158, 111, 55];
        else if (x < width / 2) [red, green, blue] = [26, 24, 21];
        else [red, green, blue] = [218, 202, 166];
      }
      const crown = y > 92 && y < 138 && x > 176 && x < 336
        && (y > 122 || (x > 188 && x < 214) || (x > 243 && x < 269) || (x > 298 && x < 324));
      if (crown) [red, green, blue] = [184, 132, 62];
      raw[offset] = Math.max(0, red);
      raw[offset + 1] = Math.max(0, green);
      raw[offset + 2] = Math.max(0, blue);
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const avatarPath = path.join(cardRoot, '头像.png');
if (!existsSync(avatarPath)) writeFileSync(avatarPath, placeholderAvatar());

console.info(`CK 角色卡资源已生成：${cardRoot}`);
