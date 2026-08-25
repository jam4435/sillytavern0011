const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

const maleFrontBase64 =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(rootDir, 'src/武侠/assets/ui/bronze/male-front.png')).toString('base64');
const maleBackBase64 =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(rootDir, 'src/武侠/assets/ui/bronze/male-back.png')).toString('base64');
const femaleFrontBase64 =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(rootDir, 'src/武侠/assets/ui/bronze/female-front.png')).toString('base64');
const femaleBackBase64 =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(rootDir, 'src/武侠/assets/ui/bronze/female-back.png')).toString('base64');

const meridians = {
  ren: {
    name: '任脉',
    view: 'front',
    path: 'M120 400 V70',
    seal: '任',
    labelPoint: [120, 58],
    points: [
      [120, 84, '天突'],
      [120, 156, '膻中'],
      [120, 228, '神阙'],
      [120, 300, '气海'],
      [120, 378, '会阴'],
    ],
  },
  du: {
    name: '督脉',
    view: 'back',
    path: 'M120 405 V38',
    seal: '督',
    labelPoint: [120, 24],
    points: [
      [120, 72, '大椎'],
      [120, 150, '神道'],
      [120, 226, '命门'],
      [120, 304, '腰阳关'],
      [120, 390, '长强'],
    ],
  },
  chong: {
    name: '冲脉',
    view: 'front',
    path: 'M96 440 C97 400, 101 340, 101 322 C101 280, 101 200, 101 176 C101 140, 101 120, 101 95',
    seal: '冲',
    labelPoint: [101, 78],
    points: [
      [101, 102, '幽门'],
      [101, 176, '商曲'],
      [101, 248, '阴交'],
      [101, 322, '大赫'],
      [93, 430, '公孙'],
    ],
  },
  dai: {
    name: '带脉',
    view: 'front',
    path: 'M56 244 C76 232, 100 228, 120 228 C140 228, 164 232, 184 244',
    seal: '带',
    labelPoint: [52, 248],
    points: [
      [60, 242, '五枢'],
      [88, 231, '带脉'],
      [120, 228, '神阙'],
      [152, 231, '维道'],
      [180, 242, '足临泣'],
    ],
  },
  yinqiao: {
    name: '阴跷脉',
    view: 'front',
    path: 'M78 450 C78 410, 81 375, 83 356 C85 320, 86 295, 87 278 C89 240, 90 220, 91 198 C93 160, 95 135, 96 116',
    seal: '阴跷',
    labelPoint: [96, 94],
    points: [
      [79, 434, '照海'],
      [83, 356, '交信'],
      [87, 278, '阴谷'],
      [91, 198, '横骨'],
      [96, 116, '睛明'],
    ],
  },
  yinwei: {
    name: '阴维脉',
    view: 'front',
    path: 'M162 450 C162 410, 159 375, 157 350 C155 320, 154 295, 153 270 C151 240, 150 220, 149 190 C147 160, 145 135, 144 110',
    seal: '阴维',
    labelPoint: [144, 94],
    points: [
      [161, 432, '筑宾'],
      [157, 350, '府舍'],
      [153, 270, '期门'],
      [149, 190, '天突'],
      [144, 110, '廉泉'],
    ],
  },
  yangqiao: {
    name: '阳跷脉',
    view: 'back',
    path: 'M70 450 C71 410, 74 375, 76 356 C78 320, 79 295, 80 278 C82 240, 83 220, 84 198 C86 160, 89 135, 91 112',
    seal: '阳跷',
    labelPoint: [91, 88],
    points: [
      [72, 434, '申脉'],
      [76, 356, '仆参'],
      [80, 278, '居髎'],
      [84, 198, '肩髃'],
      [91, 112, '风池'],
    ],
  },
  yangwei: {
    name: '阳维脉',
    view: 'back',
    path: 'M170 450 C169 410, 166 375, 164 350 C162 320, 161 295, 160 270 C158 240, 157 220, 156 190 C154 160, 151 135, 149 108',
    seal: '阳维',
    labelPoint: [149, 88],
    points: [
      [168, 432, '金门'],
      [164, 350, '阳交'],
      [160, 270, '臑会'],
      [156, 190, '肩井'],
      [149, 108, '哑门'],
    ],
  },
};

function generateSVG(view, gender) {
  const isFront = view === 'front';
  const idPrefix = 'meridian-export-' + view + '-' + gender;
  const currentMeridians = Object.entries(meridians).filter(([, v]) => v.view === view);

  let imgBase64 = '';
  if (gender === '女') {
    imgBase64 = isFront ? femaleFrontBase64 : femaleBackBase64;
  } else {
    imgBase64 = isFront ? maleFrontBase64 : maleBackBase64;
  }

  let pathsHtml = '';
  for (const [id, m] of currentMeridians) {
    const pointsStr = m.points.map(p => p[0] + ',' + p[1]).join(' ');

    pathsHtml +=
      '<g class="meridian-channel-group" data-id="' +
      id +
      '">\n' +
      '  <path class="meridian-track" d="' +
      m.path +
      '" />\n' +
      '  <polyline class="meridian-base" points="' +
      pointsStr +
      '" />\n' +
      m.points
        .slice(1)
        .map((p, i) => {
          const prev = m.points[i];
          return (
            '<line class="meridian-seg is-opened" x1="' +
            prev[0] +
            '" y1="' +
            prev[1] +
            '" x2="' +
            p[0] +
            '" y2="' +
            p[1] +
            '" />'
          );
        })
        .join('\n') +
      '\n  <g class="meridian-badge">\n' +
      '    <rect x="' +
      (m.labelPoint[0] - 9) +
      '" y="' +
      (m.labelPoint[1] - 6.5) +
      '" width="18" height="13" rx="2" />\n' +
      '    <text x="' +
      m.labelPoint[0] +
      '" y="' +
      (m.labelPoint[1] + 3) +
      '">' +
      m.seal +
      '</text>\n' +
      '  </g>\n' +
      '</g>\n';
  }

  let nodesHtml = '';
  for (const [, m] of currentMeridians) {
    for (const [x, y, name] of m.points) {
      nodesHtml +=
        '<g class="meridian-node is-opened" transform="translate(' +
        x +
        ', ' +
        y +
        ')">\n' +
        '  <circle class="node-glow" r="6" />\n' +
        '  <circle class="node-ring" r="4.2" />\n' +
        '  <circle class="node-core" r="1.2" />\n' +
        '  <g class="node-callout">\n' +
        '    <line x1="8" y1="-1" x2="18" y2="-1" />\n' +
        '    <text x="21" y="2">' +
        name +
        '</text>\n' +
        '  </g>\n' +
        '</g>\n';
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 500" width="480" height="1000" style="background: #140d09; font-family: 'STKaiti', 'KaiTi', 'LXGW WenKai', serif;">
  <defs>
    <radialGradient id="${idPrefix}-halo" cx="50%" cy="48%" r="48%">
      <stop offset="0%" stop-color="#cda462" stop-opacity="0.25" />
      <stop offset="40%" stop-color="#8d6032" stop-opacity="0.1" />
      <stop offset="80%" stop-color="#3d2a1a" stop-opacity="0.03" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="${idPrefix}-dantian" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe4a0" stop-opacity="0.7" />
      <stop offset="35%" stop-color="#ee6a4f" stop-opacity="0.35" />
      <stop offset="75%" stop-color="#b43a2d" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <filter id="${idPrefix}-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <style>
    .halo { fill: url(#${idPrefix}-halo); }
    .axis { stroke: rgba(217, 173, 91, 0.3); stroke-width: 0.8; stroke-dasharray: 2 6; fill: none; }
    .ruler { stroke: rgba(217, 173, 91, 0.2); stroke-width: 0.8; fill: none; }
    .bronze-photo { filter: contrast(1.12) brightness(1.26) saturate(1.1); }
    .meridian-track { fill: none; stroke: rgba(217, 173, 91, 0.16); stroke-width: 2.2; stroke-linecap: round; }
    .meridian-base { fill: none; stroke: rgba(185, 140, 75, 0.28); stroke-width: 1.2; stroke-linecap: round; }
    .meridian-seg.is-opened { stroke: rgba(255, 228, 160, 0.75); stroke-width: 1.8; stroke-dasharray: 6 3; filter: drop-shadow(0 0 2.5px rgba(255, 228, 160, 0.45)); }
    .meridian-badge rect { fill: rgba(60, 24, 18, 0.75); stroke: rgba(217, 173, 91, 0.45); stroke-width: 0.8; }
    .meridian-badge text { fill: rgba(255, 228, 160, 0.9); font-size: 7.5px; font-weight: bold; text-anchor: middle; }
    .node-glow { fill: rgba(255, 228, 160, 0.15); }
    .node-ring { fill: #cda462; stroke: #ffe4a0; stroke-width: 1.2; filter: drop-shadow(0 0 2.5px rgba(245, 188, 91, 0.6)); }
    .node-core { fill: #ffffff; }
    .node-callout line { stroke: rgba(255, 228, 160, 0.5); stroke-width: 0.7; }
    .node-callout text { fill: var(--meridian-gold-bright, #ffe4a0); font-size: 8px; paint-order: stroke; stroke: rgba(19, 12, 8, 0.95); stroke-width: 2.2px; stroke-linejoin: round; }
  </style>

  <!-- 1. 背景光晕与刻度 -->
  <ellipse class="halo" cx="120" cy="245" rx="114" ry="240" />
  <ellipse cx="120" cy="245" rx="108" ry="232" fill="none" stroke="rgba(217, 173, 91, 0.14)" stroke-width="0.8" stroke-dasharray="3 7" />
  <path class="axis" d="M120 12V486" />
  <g class="ruler">
    ${Array.from({ length: 15 }, (_, i) => {
      const y = 24 + i * 32;
      return `<line x1="14" y1="${y}" x2="${i % 2 === 0 ? 24 : 19}" y2="${y}" /><line x1="226" y1="${y}" x2="${i % 2 === 0 ? 216 : 221}" y2="${y}" />`;
    }).join('')}
  </g>

  <!-- 2. AI 针灸铜人全身立绘 -->
  <g class="bronze-figure">
    <image class="bronze-photo" href="${imgBase64}" x="25" y="15" width="190" height="470" preserveAspectRatio="xMidYMid meet" />
    ${
      isFront
        ? `<circle cx="120" cy="228" r="11" fill="url(#${idPrefix}-dantian)" />`
        : `<circle cx="120" cy="226" r="10" fill="url(#${idPrefix}-dantian)" />`
    }
  </g>

  <!-- 3. 经脉流注层 -->
  <g class="meridian-paths">
    ${pathsHtml}
  </g>

  <!-- 4. 穴位关窍层 -->
  <g class="meridian-nodes">
    ${nodesHtml}
  </g>
</svg>`;
}

const maleFrontSvg = generateSVG('front', '男');
const maleBackSvg = generateSVG('back', '男');
const femaleFrontSvg = generateSVG('front', '女');
const femaleBackSvg = generateSVG('back', '女');

fs.writeFileSync(path.join(rootDir, 'src/武侠/docs/奇经八脉-男铜人-正面.svg'), maleFrontSvg, 'utf-8');
fs.writeFileSync(path.join(rootDir, 'src/武侠/docs/奇经八脉-男铜人-背面.svg'), maleBackSvg, 'utf-8');
fs.writeFileSync(path.join(rootDir, 'src/武侠/docs/奇经八脉-女铜人-正面.svg'), femaleFrontSvg, 'utf-8');
fs.writeFileSync(path.join(rootDir, 'src/武侠/docs/奇经八脉-女铜人-背面.svg'), femaleBackSvg, 'utf-8');

const htmlPreview = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>AI 奇经八脉铜人图鉴 · 视觉预览</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #19120e;
      color: #dfd4c1;
      font-family: "STKaiti", "KaiTi", "LXGW WenKai", "Noto Serif SC", serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    h1 {
      font-size: 2.2rem;
      letter-spacing: 0.3em;
      color: #ffe4a0;
      text-shadow: 0 0 12px rgba(217, 173, 91, 0.5);
      margin-bottom: 0.5rem;
    }
    .subtitle {
      font-size: 0.95rem;
      color: #a18b6f;
      letter-spacing: 0.15em;
      margin-bottom: 2rem;
    }
    .section-title {
      font-size: 1.4rem;
      color: #f5bc5b;
      letter-spacing: 0.25em;
      margin: 1.5rem 0 1rem;
      border-bottom: 1px solid rgba(217, 173, 91, 0.35);
      padding-bottom: 0.4rem;
      width: 100%;
      max-width: 960px;
      text-align: center;
    }
    .gallery {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 2.5rem;
      max-width: 980px;
      width: 100%;
      margin-bottom: 2rem;
    }
    .figure-card {
      flex: 1 1 380px;
      max-width: 440px;
      background: radial-gradient(circle at center, rgba(35, 25, 18, 0.95), rgba(18, 12, 8, 0.98));
      border: 1px solid rgba(217, 173, 91, 0.3);
      box-shadow: 0 12px 36px rgba(0,0,0,0.6), inset 0 0 40px rgba(0,0,0,0.5);
      border-radius: 8px;
      padding: 1.2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .figure-title {
      font-size: 1.15rem;
      color: #f5bc5b;
      letter-spacing: 0.2em;
      margin-bottom: 1rem;
      border-bottom: 1px solid rgba(217, 173, 91, 0.25);
      padding-bottom: 0.4rem;
      width: 100%;
      text-align: center;
    }
    .svg-container {
      width: 100%;
      aspect-ratio: 12 / 25;
      display: flex;
      justify-content: center;
    }
    .svg-container svg {
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 10px 20px rgba(0,0,0,0.6));
    }
    .files-list {
      margin-top: 1rem;
      background: rgba(30, 22, 16, 0.6);
      padding: 0.8rem 1.5rem;
      border-radius: 6px;
      border: 1px solid rgba(217, 173, 91, 0.15);
      font-size: 0.85rem;
      max-width: 960px;
      text-align: center;
    }
    .files-list a {
      color: #e5c178;
      text-decoration: none;
      margin: 0 0.5rem;
    }
    .files-list a:hover {
      text-decoration: underline;
      color: #ffe4a0;
    }
  </style>
</head>
<body>
  <h1>奇经八脉 · AI 针灸铜人图鉴</h1>
  <p class="subtitle">AI 真实针灸铜人原画 · 奇经八脉周天流注 · 男女专属立绘</p>

  <div class="section-title">【 男角色 · 针灸铜人 】</div>
  <div class="gallery">
    <div class="figure-card">
      <div class="figure-title">男铜人 · 阳面（任/冲/带/阴跷/阴维）</div>
      <div class="svg-container">
        ${maleFrontSvg.replace(/<\?xml.*?\?>/, '')}
      </div>
    </div>
    <div class="figure-card">
      <div class="figure-title">男铜人 · 阴面（督/阳跷/阳维）</div>
      <div class="svg-container">
        ${maleBackSvg.replace(/<\?xml.*?\?>/, '')}
      </div>
    </div>
  </div>

  <div class="section-title">【 女角色 · 针灸铜人 】</div>
  <div class="gallery">
    <div class="figure-card">
      <div class="figure-title">女铜人 · 阳面（任/冲/带/阴跷/阴维）</div>
      <div class="svg-container">
        ${femaleFrontSvg.replace(/<\?xml.*?\?>/, '')}
      </div>
    </div>
    <div class="figure-card">
      <div class="figure-title">女铜人 · 阴面（督/阳跷/阳维）</div>
      <div class="svg-container">
        ${femaleBackSvg.replace(/<\?xml.*?\?>/, '')}
      </div>
    </div>
  </div>

  <div class="files-list">
    <span>独立图片文件：</span>
    <a href="./奇经八脉-男铜人-正面.svg" target="_blank">男铜人-正面.svg</a> |
    <a href="./奇经八脉-男铜人-背面.svg" target="_blank">男铜人-背面.svg</a> |
    <a href="./奇经八脉-女铜人-正面.svg" target="_blank">女铜人-正面.svg</a> |
    <a href="./奇经八脉-女铜人-背面.svg" target="_blank">女铜人-背面.svg</a>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(rootDir, 'src/武侠/docs/奇经八脉铜人图鉴预览.html'), htmlPreview, 'utf-8');
console.log('Successfully generated all SVGs and HTML preview!');
