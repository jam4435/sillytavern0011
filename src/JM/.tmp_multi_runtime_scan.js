
      // --- 全局数据管理器，确保数据只加载一次 ---
      window.JM_StatusDataManager =
        window.JM_StatusDataManager ||
        (function () {
          let dataPromise = null;

          async function fetchDataInternal() {
            const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
            const IMAGE_INDEX_URL =
              'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/imageIndex.json';
            const SYNONYMS_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/synonyms.json';
            const FACE_INDEX_URL = GITHUB_BASE_URL.replace('/jm/', '/face/') + 'face_index.json';

            console.log('[状态栏 全局] 开始加载核心数据...');

            try {
              const [imageResponse, synonymResponse, faceResponse] = await Promise.all([
                fetch(IMAGE_INDEX_URL),
                fetch(SYNONYMS_URL),
                fetch(FACE_INDEX_URL),
              ]);

              const data = {
                imageIndex: {},
                synonymMap: {},
                fallbackAvatars: [],
                allKeywords: [],
                keywordRegex: null,
              };

              if (!imageResponse.ok) throw new Error(`图片索引加载失败: ${imageResponse.status}`);
              data.imageIndex = await imageResponse.json();

              if (synonymResponse.ok) {
                const synonymData = await synonymResponse.json();
                for (const mainKeyword in synonymData) {
                  synonymData[mainKeyword].forEach(alias => {
                    data.synonymMap[alias] = mainKeyword;
                  });
                }
              } else {
                console.warn(`[状态栏 全局] 警告: 同义词文件 (synonyms.json) 加载失败: ${synonymResponse.status}.`);
              }

              if (faceResponse.ok) {
                data.fallbackAvatars = await faceResponse.json();
                console.log(`[状态栏 全局] 备用头像列表加载成功，共计 ${data.fallbackAvatars.length} 个头像。`);
              } else {
                console.warn(`[状态栏 全局] 警告: 备用头像索引 (face_index.json) 加载失败: ${faceResponse.status}.`);
              }

              data.allKeywords = [...Object.keys(data.imageIndex), ...Object.keys(data.synonymMap)];

              if (data.allKeywords.length > 0) {
                const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                data.allKeywords.sort((a, b) => b.length - a.length);
                data.keywordRegex = new RegExp(`(${data.allKeywords.map(escapeRegExp).join('|')})`, 'g');
              }

              console.log('[状态栏 全局] 核心数据加载并处理完成。');
              return data;
            } catch (error) {
              console.error('[状态栏 全局] 核心数据加载失败:', error);
              throw error;
            }
          }

          return {
            getData: function () {
              if (!dataPromise) {
                dataPromise = fetchDataInternal();
              }
              return dataPromise;
            },
          };
        })();

      // --- IndexedDB 助手，用于存储用户上传的头像 ---
      const idbHelper = {
        db: null,
        openDB: function () {
          if (this.db) return Promise.resolve(this.db);
          return new Promise((resolve, reject) => {
            const request = indexedDB.open('JM_UserData', 1);
            request.onupgradeneeded = event => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains('portraits')) {
                db.createObjectStore('portraits', { keyPath: 'id' });
              }
            };
            request.onsuccess = event => {
              this.db = event.target.result;
              resolve(this.db);
            };
            request.onerror = event => {
              console.error('IndexedDB error:', event.target.errorCode);
              reject('IndexedDB error: ' + event.target.errorCode);
            };
          });
        },
        set: async function (id, value) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(['portraits'], 'readwrite');
            const store = transaction.objectStore('portraits');
            const request = store.put({ id, value });
            request.onsuccess = () => resolve();
            request.onerror = event => reject('Error saving to IndexedDB: ' + event.target.error);
          });
        },
        get: async function (id) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(['portraits'], 'readonly');
            const store = transaction.objectStore('portraits');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
            request.onerror = event => reject('Error getting from IndexedDB: ' + event.target.error);
          });
        },
        delete: async function (id) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(['portraits'], 'readwrite');
            const store = transaction.objectStore('portraits');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = event => reject('Error deleting from IndexedDB: ' + event.target.error);
          });
        },
      };

      document.addEventListener('DOMContentLoaded', () => {
        // 查找所有状态栏面板并为每个初始化
        const panels = document.querySelectorAll('.jm-state-panel');

        panels.forEach(panel => {
          function displayError(message, details = '') {
            const panelId = panel.id || '未知';
            console.error(`[状态栏 ${panelId}] ` + message, details);
            panel.innerHTML = `<div style="color: var(--red-color); padding: 20px; font-family: monospace; white-space: pre-wrap;"><h3>状态栏错误</h3><p>${message}</p><details><summary>详细信息</summary><p>${details}</p></details></div>`;
          }

          try {
            const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
            const rawData = `{
  "Name": "爱丽丝",
  "Location": "图书馆",
  "Time": "下午 3:00",
  "Affection": "60 → 65 (送了她一本书)",
  "Libido": "20",
  "Thoughts": "他似乎对我有好感... 这本书正是我需要的。",
  "RecentSex": "无",
  "ModificationsAndRestraints": [
    "银色项圈",
    "手腕上的细链"
  ],
  "Status": {
    "Identity": "皇家魔法学院学生",
    "Occupation": "图书管理员助理",
    "Affiliation": "白魔法协会",
    "Temperament": "文静、有点害羞",
    "Posture": "优雅地站着"
  },
  "Outfit": {
    "Top": "白色蕾丝边衬衫",
    "Bottom": "及膝的蓝色格子裙",
    "Underwear": "纯棉白色内衣",
    "Footwear": "黑色玛丽珍鞋"
  },
  "BodyDetails": {
    "Mouth": "自然的粉色，带着一丝微笑",
    "Breasts": "被衬衫包裹得很好，不大不小",
    "WombAndVagina": "纯洁而健康",
    "Anus": "紧致",
    "Hands": "纤细的手指，指甲修剪得很干净",
    "Legs": "修长而白皙",
    "Feet": "小巧玲珑"
  }
}`;
            const jsonData = JSON.parse(rawData.trim());

            function safeGet(obj, path, defaultValue = undefined) {
              const keys = Array.isArray(path) ? path : path.split('.');
              let result = obj;
              for (const key of keys) {
                result = result?.[key];
                if (result === undefined) return defaultValue;
              }
              return result;
            }

            function uniq(arr) {
              return Array.from(new Set(arr));
            }

            function ensureObject(value) {
              return _.isPlainObject(value) ? value : {};
            }

            function escapeHtml(value) {
              return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#39;');
            }

            const EDIT_PENCIL_ICON =
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a.996.996 0 0 0 0-1.41L18.37 3.3a.996.996 0 1 0-1.41 1.41l2.34 2.33a.996.996 0 0 0 1.41 0z"/></svg>';

            async function migratePortraitStorage(oldName, newName) {
              if (!oldName || !newName || oldName === newName) return;
              const oldKey = `jm_user_portrait_${oldName}`;
              const newKey = `jm_user_portrait_${newName}`;
              const existingPortrait = await idbHelper.get(oldKey);
              if (!existingPortrait) return;
              await idbHelper.set(newKey, existingPortrait);
              await idbHelper.delete(oldKey);
            }

            function findStateBlocks(messageText) {
              const blocks = [];
              const stateRegex = /<(state\d+)>\s*([\s\S]*?)\s*<\/\1>/g;
              let match;
              while ((match = stateRegex.exec(String(messageText ?? ''))) !== null) {
                try {
                  blocks.push({
                    tag: match[1],
                    start: match.index,
                    end: stateRegex.lastIndex,
                    data: JSON.parse(match[2].trim()),
                  });
                } catch (error) {
                  console.warn(`[状态栏 ${panel.id}] 跳过无法解析的 ${match[1]}:`, error);
                }
              }
              return blocks;
            }

            function findMatchingStateBlock(messageText, currentData) {
              const stateBlocks = findStateBlocks(messageText);
              if (stateBlocks.length === 0) throw new Error('当前楼层未找到 <stateN> 状态数据。');
              const oldName = safeGet(currentData, 'Name', '');
              const oldIdentity = safeGet(currentData, 'Status.Identity', '');
              const exactMatches = stateBlocks.filter(
                block =>
                  safeGet(block.data, 'Name', '') === oldName &&
                  safeGet(block.data, 'Status.Identity', '') === oldIdentity,
              );
              if (exactMatches.length > 0) return exactMatches[0];
              const nameMatches = stateBlocks.filter(block => safeGet(block.data, 'Name', '') === oldName);
              if (nameMatches.length > 0) return nameMatches[0];
              throw new Error('未在当前楼层找到与当前状态栏对应的 <stateN> 条目。');
            }

            function buildUpdatedStateMessage(messageText, currentData, newName, newIdentity) {
              const stateBlock = findMatchingStateBlock(messageText, currentData);
              const nextData = _.cloneDeep(ensureObject(stateBlock.data));
              nextData.Name = newName;
              nextData.Status = ensureObject(nextData.Status);
              nextData.Status.Identity = newIdentity;
              const replacement = `<${stateBlock.tag}>\n${JSON.stringify(nextData, null, 2)}\n</${stateBlock.tag}>`;
              return {
                message: `${messageText.slice(0, stateBlock.start)}${replacement}${messageText.slice(stateBlock.end)}`,
                nextData,
              };
            }

            // --- 数据现在由全局管理器提供 ---
            let imageIndex, synonymMap, allKeywords, keywordRegex, fallbackAvatars;

            // --- 每个面板实例独有的状态 ---
            let currentGalleryImages = [];
            let currentGalleryIndex = 0;
            let currentGalleryBaseUrl = '';
            let portraitClickListener = null; // 用于管理头像点击事件

            function getDeterministicRandomIndex(seed, max) {
              if (!seed || max === 0) return 0;
              let hash = 0;
              for (let i = 0; i < seed.length; i++) {
                const char = seed.charCodeAt(i);
                hash = (hash << 5) - hash + char;
                hash |= 0; // Convert to 32bit integer
              }
              return Math.abs(hash) % max;
            }

            async function fetchData() {
              try {
                const sharedData = await window.JM_StatusDataManager.getData();
                // 将共享数据赋值给面板实例的变量
                imageIndex = sharedData.imageIndex;
                synonymMap = sharedData.synonymMap;
                fallbackAvatars = sharedData.fallbackAvatars;
                allKeywords = sharedData.allKeywords;
                keywordRegex = sharedData.keywordRegex;

                console.log(`[状态栏 ${panel.id}] 已从全局管理器获取数据。`);
                return true;
              } catch (error) {
                const panelId = panel.id || '未知';
                console.error(`[状态栏 ${panelId}] 从全局管理器获取数据失败:`, error);
                displayError('核心数据加载失败', `错误: ${error.message}`);
                return false;
              }
            }

            function findImagesByKeyword(textToSearch) {
              if (!textToSearch || typeof textToSearch !== 'string') {
                return [];
              }
              let preliminaryMatches = [];
              for (const keyword of allKeywords) {
                if (textToSearch.includes(keyword)) {
                  preliminaryMatches.push(keyword);
                }
              }
              const preciseMatches = preliminaryMatches.filter(shortMatch => {
                return !preliminaryMatches.some(
                  longMatch => longMatch.length > shortMatch.length && longMatch.includes(shortMatch),
                );
              });
              const mainKeywordMatches = preciseMatches.map(match => {
                const mainKeyword = synonymMap[match] || match;
                return { keyword: mainKeyword, index: textToSearch.indexOf(match) };
              });
              mainKeywordMatches.sort((a, b) => a.index - b.index);

              let foundImages = [];
              for (const match of mainKeywordMatches) {
                const imageList = imageIndex[match.keyword];
                if (Array.isArray(imageList)) {
                  const filteredList = imageList.filter(img => img !== '非头像.abc');
                  foundImages = foundImages.concat(filteredList);
                }
              }
              return uniq(foundImages);
            }

            function linkifyAllText() {
              if (!keywordRegex) return;

              panel.querySelectorAll('.details-value, .narrative-content').forEach(el => {
                // 如果已经有链接，或者没有文本内容，则跳过
                if (el.querySelector('a.image-link') || !el.textContent) return;

                const originalText = el.textContent;

                // 使用预编译的正则表达式进行替换
                // 重置正则表达式的 lastIndex 以确保从头开始搜索
                keywordRegex.lastIndex = 0;

                // 仅当实际存在匹配时才进行替换操作，避免不必要的innerHTML重写
                if (keywordRegex.test(originalText)) {
                  keywordRegex.lastIndex = 0; // 重置以进行替换
                  const newHtml = originalText.replace(keywordRegex, match => {
                    const mainKeyword = synonymMap[match] || match;
                    if (imageIndex[mainKeyword]) {
                      return `<a href="#" class="image-link" data-keyword="${match}">${match}</a>`;
                    }
                    return match; // 如果关键词在 imageIndex 中没有对应项，则不创建链接
                  });
                  el.innerHTML = newHtml;
                }
              });
            }

            function parseStat(statValue) {
              if (statValue === null || statValue === undefined) return null;
              const normalizedValue = String(statValue)
                .trim()
                .replace(/（/g, '(')
                .replace(/）/g, ')')
                .replace(/[－−—–]/g, '-');
              if (!normalizedValue) return null;
              const rangeMatch = normalizedValue.match(
                /^([+-]?\d+(?:\.\d+)?)\s*(?:→|->|=>|➡|⟶|➜)\s*([+-]?\d+(?:\.\d+)?)\s*(?:\((.*?)\))?$/,
              );
              if (rangeMatch) {
                return {
                  mode: 'range',
                  from: rangeMatch[1],
                  to: rangeMatch[2],
                  reason: rangeMatch[3]?.trim() ?? '',
                };
              }
              const singleMatch = normalizedValue.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:\((.*?)\))?$/);
              if (singleMatch) {
                return {
                  mode: 'single',
                  value: singleMatch[1],
                  reason: singleMatch[2]?.trim() ?? '',
                };
              }
              return null;
            }

            function isStatField(key) {
              return key === 'Affection' || key === 'Libido';
            }

            // --- 新增：动态内容配置 ---
            const DYNAMIC_CONTENT_CONFIG = {
              // 格式 a: 数字变化 -> stat-box UI
              Affection: { label: '好感度' },
              Libido: { label: '性欲值' },
              // 格式 b: 字符串 -> narrative-block UI
              Thoughts: { label: '🧠 内心想法' },
              RecentSex: { label: '📋 最近性行为' },
              // 格式 c: 列表 -> modifications-list UI
              ModificationsAndRestraints: { label: '身体改造与束具' },
            };

            // --- 新增：UI渲染函数 ---

            // 渲染 "stat-box" (用于好感度等)
            function renderStat(label, value) {
              const parsed = parseStat(value); // parseStat 是已有的函数
              let valueHtml = '';
              if (parsed) {
                valueHtml =
                  parsed.mode === 'range'
                    ? `<div><span class="red">${parsed.from}</span> <span class="arrow">→</span> <span class="green">${parsed.to}</span></div>${parsed.reason ? `<div class="stat-change-reason">(${parsed.reason})</div>` : ''}`
                    : `<div><span class="${Number(parsed.value) < 0 ? 'red' : 'green'}">${parsed.value}</span></div>${parsed.reason ? `<div class="stat-change-reason">(${parsed.reason})</div>` : ''}`;
              } else {
                valueHtml = String(value);
              }
              return `
              <div class="stat-box">
                <div class="stat-label">${label}</div>
                <div class="stat-value">${valueHtml}</div>
              </div>
            `;
            }

            // 渲染 "narrative-block" (用于内心想法等)
            function renderNarrative(label, value) {
              return `
              <div class="narrative-block">
                <span class="narrative-label">${label}</span>
                <p class="narrative-content">${String(value)}</p>
              </div>
            `;
            }

            // 渲染 "list" (用于改造与束具等)
            function renderList(label, items) {
              if (!Array.isArray(items) || items.length === 0) return '';
              const itemsHtml = items
                .map(
                  item => `
              <li class="modifications-item">
                <span class="details-value" data-keyword="${item}">${item}</span>
              </li>
            `,
                )
                .join('');
              return `
              <div class="details-block">
                <div class="details-header">${label}</div>
                <ul class="modifications-list">${itemsHtml}</ul>
              </div>
            `;
            }

            const DYNAMIC_CONTENT_MAP = {
              Status: {
                title: '身份与当前状态',
                icon: '🎖️',
                labels: {
                  Identity: '身份',
                  Occupation: '职业',
                  Affiliation: '从属',
                  Temperament: '气质',
                  Posture: '姿势',
                },
              },
              Outfit: {
                title: '服装与内衣',
                icon: '👗',
                labels: {
                  Top: '上装',
                  Bottom: '下装',
                  Underwear: '内衣',
                  Footwear: '鞋履',
                },
              },
              BodyDetails: {
                title: '身体与性器细节',
                icon: '🩸',
                labels: {
                  Mouth: '口腔',
                  Breasts: '胸部',
                  WombAndVagina: '子宫与阴道',
                  Anus: '后庭',
                  Hands: '手部',
                  Legs: '腿部',
                  Feet: '足部',
                },
              },
            };

            function generateDynamicTabsAndContent(data) {
              const EXCLUDED_KEYS = new Set([
                'Name',
                'Location',
                'Time',
                'Affection',
                'Libido',
                'Thoughts',
                'RecentSex',
                'ModificationsAndRestraints',
                'Modifications',
              ]);

              let tabsHtml = '<div class="tabs">';
              let contentsHtml = '';
              let tabIndex = 0;

              for (const key in data) {
                if (
                  !EXCLUDED_KEYS.has(key) &&
                  typeof data[key] === 'object' &&
                  data[key] !== null &&
                  !Array.isArray(data[key])
                ) {
                  const tabId = `dynamic-tab-${tabIndex}`;
                  const isActive = tabIndex === 0 ? 'active' : '';
                  const tabInfo = DYNAMIC_CONTENT_MAP[key] || { title: key, icon: '📋', labels: {} };

                  tabsHtml += `<button class="tab-button ${isActive}" data-tab="${tabId}">${tabInfo.icon} ${tabInfo.title}</button>`;

                  contentsHtml += `<div id="${tabId}" class="tab-content ${isActive}"><ul class="details-list">`;

                  for (const subKey in data[key]) {
                    const label = tabInfo.labels[subKey] || subKey;
                    const value = data[key][subKey];
                    const valueHtml =
                      key === 'Status' && subKey === 'Identity'
                        ? `<span class="inline-editable-value"><span class="details-value">${escapeHtml(value)}</span><button class="edit-trigger jm-edit-character-trigger" type="button" title="编辑名字与身份">${EDIT_PENCIL_ICON}</button></span>`
                        : `<span class="details-value">${escapeHtml(value)}</span>`;
                    contentsHtml += `
                    <li class="details-item">
                      <span class="details-label">${label}</span>
                      ${valueHtml}
                    </li>
                  `;
                  }

                  contentsHtml += '</ul></div>';
                  tabIndex++;
                }
              }

              tabsHtml += '</div>';

              return { tabsHtml, contentsHtml };
            }

            function updatePanel(data) {
              // 1. 设置只包含静态部分的HTML框架
              panel.innerHTML = `
                        <div class="header">
                            <div class="portrait">
                                <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="角色肖像" data-field="portrait" />
                                <div class="portrait-upload-trigger" title="上传新头像"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div>
                                <div class="portrait-reset-trigger" title="重置为默认头像"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></div>
                                <input type="file" class="jm-portrait-upload" style="display:none" accept="image/*" />
                            </div>
                            <div class="header-info">
                                <div class="char-name-row">
                                    <div class="char-name" data-field="Name"></div>
                                    <button class="edit-trigger jm-edit-character-trigger" type="button" title="编辑名字与身份">${EDIT_PENCIL_ICON}</button>
                                </div>
                                <div class="meta-info">
                                    <span class="location">📍 <span data-field="Location"></span></span>
                                    <span class="timestamp">🕰️ <span data-field="Time"></span></span>
                                </div>
                            </div>
                            <div class="collapse-toggle" title="展开/折叠">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                                </svg>
                            </div>
                        </div>

                        <!-- 可折叠内容区域 -->
                        <div class="collapsible-section">
                            <!-- 新的动态内容容器 -->
                            <div id="jm-dynamic-content-area"></div>

                            <!-- 动态Tab页容器 -->
                            <div class="tabs-container"></div>
                            <div class="tab-content-container"></div>
                        </div>

                        <div class="jm-image-gallery gallery-modal">
                            <div class="gallery-content">
                                <span class="gallery-close">&times;</span>
                                <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="gallery-image" />
                                <a class="gallery-prev">&#10094;</a>
                                <a class="gallery-next">&#10095;</a>
                            </div>
                        </div>
                        <div class="jm-edit-modal" aria-hidden="true">
                            <div class="jm-edit-dialog" role="dialog" aria-modal="true" aria-label="编辑角色信息">
                                <div class="jm-edit-title">编辑角色信息</div>
                                <div class="jm-edit-form">
                                    <label class="jm-edit-label">
                                        名字
                                        <input class="jm-edit-input jm-edit-name-input" type="text" />
                                    </label>
                                    <label class="jm-edit-label">
                                        身份
                                        <input class="jm-edit-input jm-edit-identity-input" type="text" />
                                    </label>
                                    <div class="jm-edit-error"></div>
                                    <div class="jm-edit-actions">
                                        <button class="jm-edit-button cancel jm-edit-cancel-button" type="button">取消</button>
                                        <button class="jm-edit-button save jm-edit-save-button" type="button">保存</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;

              // 2. 填充静态头部数据
              const staticFields = {
                Name: data.Name,
                Location: data.Location,
                Time: data.Time,
              };

              for (const field in staticFields) {
                const el = panel.querySelector(`[data-field="${field}"]`);
                if (el && staticFields[field] !== undefined) {
                  el.textContent = staticFields[field];
                }
              }

              // 3. 渲染所有动态内容
              renderDynamicContent(data);

              // 4. 生成并插入动态的Tabs和内容 (这部分逻辑不变)
              const { tabsHtml, contentsHtml } = generateDynamicTabsAndContent(data);
              panel.querySelector('.tabs-container').innerHTML = tabsHtml;
              panel.querySelector('.tab-content-container').innerHTML = contentsHtml;
            }

            // --- 修改：主渲染循环 (支持自动格式检测和原始顺序) ---
            function renderDynamicContent(data) {
              const container = panel.querySelector('#jm-dynamic-content-area');
              if (!container) return;

              // 定义哪些字段是头部信息，需要被排除
              const HEADER_FIELDS = new Set(['Name', 'Location', 'Time']);

              // 收集所有需要渲染的字段，并保持原始顺序
              const itemsToRender = Object.keys(data)
                .filter(
                  key =>
                    (!HEADER_FIELDS.has(key) && // 排除头部字段
                      typeof data[key] !== 'object') ||
                    Array.isArray(data[key]), // 排除对象（留给Tab），但保留数组
                )
                .map(key => {
                  // 从配置中获取标签，如果没有则使用字段名
                  const config = DYNAMIC_CONTENT_CONFIG[key];
                  return {
                    key,
                    label: config ? config.label : key,
                    value: data[key],
                  };
                });

              // 用于收集所有 stat 项，以便统一渲染
              const statItems = [];
              let dynamicHtml = '';

              itemsToRender.forEach(item => {
                let type = 'narrative'; // 默认类型
                let value = item.value;

                // 自动检测UI类型
                if (isStatField(item.key)) {
                  type = 'stat';
                } else if (Array.isArray(value)) {
                  type = 'list';
                }

                if (type === 'stat') {
                  statItems.push(item);
                } else {
                  // 如果遇到非 stat 项，且之前有 stat 项，则先渲染 stat 容器
                  if (statItems.length > 0) {
                    dynamicHtml += `<div class="core-stats">${statItems.map(statItem => renderStat(statItem.label, statItem.value)).join('')}</div>`;
                    statItems.length = 0; // 清空 stat 项
                  }
                  // 渲染当前项
                  switch (type) {
                    case 'narrative':
                      dynamicHtml += renderNarrative(item.label, item.value);
                      break;
                    case 'list':
                      dynamicHtml += renderList(item.label, item.value);
                      break;
                  }
                }
              });

              // 确保最后的 stat 项也被渲染
              if (statItems.length > 0) {
                dynamicHtml += `<div class="core-stats">${statItems.map(statItem => renderStat(statItem.label, statItem.value)).join('')}</div>`;
              }

              container.innerHTML = dynamicHtml;
            }

            async function updatePortrait(data) {
              const portraitImg = panel.querySelector('[data-field="portrait"]');
              if (!portraitImg) return;

              // 统一管理事件监听器，先移除旧的
              if (portraitClickListener) {
                portraitImg.removeEventListener('click', portraitClickListener);
                portraitClickListener = null;
              }

              const charName = safeGet(data, 'Name', '');
              const storageKey = `jm_user_portrait_${charName}`;

              try {
                const savedPortraitBlob = await idbHelper.get(storageKey);
                if (savedPortraitBlob) {
                  const objectURL = URL.createObjectURL(savedPortraitBlob);
                  portraitImg.src = objectURL;
                  // 浏览器加载后立即释放，避免内存泄漏
                  portraitImg.onload = () => URL.revokeObjectURL(portraitImg.src);

                  portraitClickListener = () => {
                    // 每次点击都创建一个新的URL给画廊使用
                    const galleryURL = URL.createObjectURL(savedPortraitBlob);
                    openGallery([galleryURL], 0, '');
                  };
                  portraitImg.addEventListener('click', portraitClickListener);
                  return; // 找到用户头像后，终止函数
                }
              } catch (error) {
                console.error('从 IndexedDB 加载头像失败:', error);
              }

              const occupationText = safeGet(data, 'Status.Occupation', '');
              const nameText = safeGet(data, 'Name', '');
              const textToSearch = occupationText + ' ' + nameText;

              let matchedImages = [];

              if (textToSearch.trim() && allKeywords) {
                // 1. 找到所有精确匹配的关键词
                let potentialKeywords = allKeywords.filter(k => textToSearch.includes(k));
                potentialKeywords = potentialKeywords.filter(
                  shortMatch =>
                    !potentialKeywords.some(
                      longMatch => longMatch.length > shortMatch.length && longMatch.includes(shortMatch),
                    ),
                );

                // 2. 将关键词分为“头像”和“概念”两类
                const portraitKeywords = potentialKeywords.filter(k => {
                  const mainKeyword = synonymMap[k] || k;
                  const imageList = imageIndex[mainKeyword] || [];
                  return Array.isArray(imageList) && !imageList.includes('非头像.abc');
                });

                const conceptKeywords = potentialKeywords.filter(k => {
                  const mainKeyword = synonymMap[k] || k;
                  const imageList = imageIndex[mainKeyword] || [];
                  return Array.isArray(imageList) && imageList.includes('非头像.abc');
                });

                // 3. 优先使用“头像”类关键词，否则使用“概念”类作为后备
                const keywordsToUse = portraitKeywords.length > 0 ? portraitKeywords : conceptKeywords;

                // 4. 按出现顺序排序并提取图片
                if (keywordsToUse.length > 0) {
                  keywordsToUse.sort((a, b) => textToSearch.indexOf(a) - textToSearch.indexOf(b));
                  for (const keyword of keywordsToUse) {
                    const mainKeyword = synonymMap[keyword] || keyword;
                    const imageList = imageIndex[mainKeyword] || [];
                    if (Array.isArray(imageList)) {
                      const filtered = imageList.filter(img => img !== '非头像.abc');
                      matchedImages = matchedImages.concat(filtered);
                    }
                  }
                  matchedImages = uniq(matchedImages);
                }
              }

              // 5. 更新图片源或使用备用头像
              if (matchedImages.length > 0) {
                portraitImg.src = GITHUB_BASE_URL + matchedImages[0];
                portraitClickListener = () => openGallery(matchedImages, 0, GITHUB_BASE_URL);
                portraitImg.addEventListener('click', portraitClickListener);
              } else if (fallbackAvatars.length > 0) {
                const charName = safeGet(data, 'Name', 'default');
                const fallbackIndex = getDeterministicRandomIndex(charName, fallbackAvatars.length);
                const fallbackAvatar = fallbackAvatars[fallbackIndex];
                const FACE_BASE_URL = GITHUB_BASE_URL.replace('/jm/', '/face/');
                portraitImg.src = FACE_BASE_URL + fallbackAvatar;
                portraitClickListener = () => openGallery([fallbackAvatar], 0, FACE_BASE_URL);
                portraitImg.addEventListener('click', portraitClickListener);
              } else {
                portraitImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
              }
            }

            function openGallery(images, startIndex, baseUrl) {
              const gallery = panel.querySelector('.jm-image-gallery');
              const prevArrow = gallery.querySelector('.gallery-prev');
              const nextArrow = gallery.querySelector('.gallery-next');

              currentGalleryImages = images;
              currentGalleryIndex = startIndex;
              currentGalleryBaseUrl = baseUrl; // 设置当前图库的基础URL
              updateGalleryImage();
              gallery.style.display = 'flex';

              // 根据图片数量决定是否显示箭头
              if (currentGalleryImages.length <= 1) {
                prevArrow.style.display = 'none';
                nextArrow.style.display = 'none';
              } else {
                prevArrow.style.display = 'block';
                nextArrow.style.display = 'block';
              }
            }

            function updateGalleryImage() {
              if (currentGalleryImages.length > 0) {
                const galleryImage = panel.querySelector('.gallery-image');
                galleryImage.src = currentGalleryBaseUrl + currentGalleryImages[currentGalleryIndex];
                // 重置缩放和位置
                galleryImage.style.transform = 'scale(1) translate(0, 0)';
              }
            }

            function setupPortraitUpload(data) {
              const uploadTrigger = panel.querySelector('.portrait-upload-trigger');
              const resetTrigger = panel.querySelector('.portrait-reset-trigger');
              const uploadInput = panel.querySelector('.jm-portrait-upload');
              const portraitImg = panel.querySelector('[data-field="portrait"]');

              if (!uploadTrigger || !uploadInput || !portraitImg || !resetTrigger) return;

              const charName = safeGet(data, 'Name', '');
              const storageKey = `jm_user_portrait_${charName}`;

              // 异步检查 IndexedDB 中是否存在头像，并更新重置按钮状态
              (async () => {
                try {
                  if (await idbHelper.get(storageKey)) {
                    resetTrigger.style.display = 'flex';
                  } else {
                    resetTrigger.style.display = 'none';
                  }
                } catch (e) {
                  console.error('检查头像是否存在时出错:', e);
                  resetTrigger.style.display = 'none';
                }
              })();

              uploadTrigger.onclick = () => uploadInput.click();

              resetTrigger.onclick = async () => {
                try {
                  await idbHelper.delete(storageKey);
                  resetTrigger.style.display = 'none';
                  portraitImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                  await updatePortrait(jsonData); // 重新加载默认头像
                } catch (error) {
                  alert(`无法重置头像: ${error.name}: ${error.message}`);
                }
              };

              uploadInput.onchange = event => {
                const file = event.target.files?.[0];
                if (!file) {
                  uploadInput.value = '';
                  return;
                }

                if (file.size > 1000 * 1024) {
                  alert('图片文件太大 (最大 1000KB)。请选择一张小一点的图片，或使用图片压缩工具。');
                  uploadInput.value = '';
                  return;
                }

                const reader = new FileReader();
                reader.onload = e => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    const maxSize = 400;

                    if (width > height && width > maxSize) {
                      height = (height * maxSize) / width;
                      width = maxSize;
                    } else if (height > maxSize) {
                      width = (width * maxSize) / height;
                      height = maxSize;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // 将 Canvas 内容转换为 Blob 对象，而不是 Base64
                    canvas.toBlob(
                      async blob => {
                        if (!blob) {
                          alert('图片处理失败，无法创建 Blob 对象。');
                          uploadInput.value = '';
                          return;
                        }

                        if (blob.size > 800 * 1024) {
                          alert('压缩后的图片仍然太大。请选择一张更小的图片。');
                          uploadInput.value = '';
                          return;
                        }

                        try {
                          await idbHelper.set(storageKey, blob);
                          await updatePortrait(jsonData); // 重新加载头像以应用更改和事件
                          resetTrigger.style.display = 'flex';
                          console.log(`头像已保存，压缩后大小约 ${Math.round(blob.size / 1024)}KB`);
                        } catch (error) {
                          console.error('保存头像到 IndexedDB 失败:', error);
                          if (error.name === 'QuotaExceededError') {
                            alert('浏览器存储空间不足。IndexedDB 也已满。\n请清理浏览器数据或使用更小的图片。');
                          } else {
                            alert(`头像保存失败: ${error.message}`);
                          }
                        } finally {
                          uploadInput.value = ''; // 无论成功失败都清空，以便再次选择同个文件
                        }
                      },
                      'image/jpeg',
                      0.7,
                    );
                  };
                  img.onerror = () => {
                    alert('无法加载所选文件，可能不是有效的图片格式。');
                    uploadInput.value = '';
                  };
                  img.src = e.target.result;
                };
                reader.onerror = () => {
                  alert('读取文件失败。');
                  uploadInput.value = '';
                };
                reader.readAsDataURL(file);
              };
            }

            function toggleEditModal(visible) {
              const modal = panel.querySelector('.jm-edit-modal');
              if (!modal) return;
              modal.classList.toggle('visible', visible);
              modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
            }

            function setEditError(message = '') {
              const errorBox = panel.querySelector('.jm-edit-error');
              if (!errorBox) return;
              errorBox.textContent = message;
              errorBox.classList.toggle('visible', Boolean(message));
            }

            function openCharacterEditor() {
              const nameInput = panel.querySelector('.jm-edit-name-input');
              const identityInput = panel.querySelector('.jm-edit-identity-input');
              if (!nameInput || !identityInput) return;
              nameInput.value = safeGet(jsonData, 'Name', '');
              identityInput.value = safeGet(jsonData, 'Status.Identity', '');
              setEditError('');
              toggleEditModal(true);
              nameInput.focus();
              nameInput.select();
            }

            async function saveCharacterEdits() {
              const nameInput = panel.querySelector('.jm-edit-name-input');
              const identityInput = panel.querySelector('.jm-edit-identity-input');
              const saveButton = panel.querySelector('.jm-edit-save-button');
              const cancelButton = panel.querySelector('.jm-edit-cancel-button');
              if (!nameInput || !identityInput || !saveButton || !cancelButton) return;
              const oldName = String(safeGet(jsonData, 'Name', '')).trim();
              const newName = nameInput.value.trim();
              const newIdentity = identityInput.value.trim();
              if (!newName) {
                setEditError('名字不能为空。');
                nameInput.focus();
                return;
              }
              const messageId = typeof getCurrentMessageId === 'function' ? getCurrentMessageId() : null;
              if (typeof messageId !== 'number') {
                setEditError('无法获取当前楼层号。');
                return;
              }
              const currentMessage = getChatMessages(messageId)?.[0];
              if (!currentMessage) {
                setEditError('无法读取当前楼层正文。');
                return;
              }
              let updatedPayload;
              try {
                updatedPayload = buildUpdatedStateMessage(String(currentMessage.message ?? ''), jsonData, newName, newIdentity);
              } catch (error) {
                setEditError(error?.message || '无法定位当前状态栏对应的 <stateN>。');
                return;
              }
              saveButton.disabled = true;
              cancelButton.disabled = true;
              saveButton.textContent = '保存中...';
              try {
                await setChatMessages(
                  [{ message_id: currentMessage.message_id ?? messageId, message: updatedPayload.message }],
                  { refresh: 'affected' },
                );
                if (newName !== oldName) {
                  await migratePortraitStorage(oldName, newName);
                }
                jsonData.Name = updatedPayload.nextData.Name;
                jsonData.Status = ensureObject(updatedPayload.nextData.Status);
                jsonData.Status.Identity = safeGet(updatedPayload.nextData, 'Status.Identity', '');
                toggleEditModal(false);
                if (typeof reloadIframe === 'function') reloadIframe();
              } catch (error) {
                setEditError(error?.message || '保存失败，请重试。');
              } finally {
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.textContent = '保存';
              }
            }

            function setupEventListeners() {
              // 折叠/展开功能
              const collapseToggle = panel.querySelector('.collapse-toggle');
              if (collapseToggle) {
                collapseToggle.addEventListener('click', () => {
                  panel.classList.toggle('collapsed');
                });
              }

              // 使用事件委托，高效处理所有图片链接点击
              panel.addEventListener('click', function (e) {
                const link = e.target.closest('.image-link');
                if (link) {
                  e.preventDefault();
                  const keyword = link.dataset.keyword;
                  if (keyword) {
                    const matchedImages = findImagesByKeyword(keyword);
                    if (matchedImages.length > 0) {
                      openGallery(matchedImages, 0, GITHUB_BASE_URL);
                    }
                  }
                }
              });

              panel.querySelectorAll('.tab-button').forEach(button => {
                button.addEventListener('click', () => {
                  const targetTabId = button.dataset.tab;
                  panel.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                  panel.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                  button.classList.add('active');
                  panel.querySelector(`#${targetTabId}`).classList.add('active');
                });
              });
              panel.querySelectorAll('.jm-edit-character-trigger').forEach(trigger => {
                trigger.addEventListener('click', event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openCharacterEditor();
                });
              });
              const editModal = panel.querySelector('.jm-edit-modal');
              const editCancelButton = panel.querySelector('.jm-edit-cancel-button');
              const editSaveButton = panel.querySelector('.jm-edit-save-button');
              if (editModal) {
                editModal.addEventListener('click', event => {
                  if (event.target === editModal) toggleEditModal(false);
                });
              }
              if (editCancelButton) {
                editCancelButton.addEventListener('click', () => toggleEditModal(false));
              }
              if (editSaveButton) {
                editSaveButton.addEventListener('click', () => {
                  saveCharacterEdits().catch(error => {
                    console.error(`[状态栏 ${panel.id}] 保存角色信息失败:`, error);
                    setEditError(error?.message || '保存失败，请重试。');
                  });
                });
              }
              const gallery = panel.querySelector('.jm-image-gallery');
              gallery.querySelector('.gallery-close').addEventListener('click', () => {
                const galleryImage = gallery.querySelector('.gallery-image');
                // 如果是 Object URL, 释放它以防止内存泄漏
                if (galleryImage.src.startsWith('blob:')) {
                  URL.revokeObjectURL(galleryImage.src);
                }
                gallery.style.display = 'none';
              });
              gallery.querySelector('.gallery-prev').addEventListener('click', () => {
                currentGalleryIndex =
                  (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
                updateGalleryImage();
              });
              gallery.querySelector('.gallery-next').addEventListener('click', () => {
                currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
                updateGalleryImage();
              });

              // --- 新增：图片缩放和拖动功能 ---
              const galleryImage = gallery.querySelector('.gallery-image');
              let isDragging = false;
              let startX,
                startY,
                lastX = 0,
                lastY = 0;
              let scale = 1;
              let lastTouchDistance = null;

              // --- 桌面端：鼠标事件 ---
              galleryImage.addEventListener('wheel', e => {
                e.preventDefault();
                const rect = galleryImage.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;

                const oldScale = scale;
                scale += e.deltaY * -0.001;
                scale = Math.min(Math.max(0.5, scale), 5);

                lastX = offsetX - (offsetX - lastX) * (scale / oldScale);
                lastY = offsetY - (offsetY - lastY) * (scale / oldScale);

                updateTransform();
              });

              galleryImage.addEventListener('mousedown', e => {
                e.preventDefault();
                isDragging = true;
                galleryImage.classList.add('dragging');
                startX = e.pageX - lastX;
                startY = e.pageY - lastY;
              });

              galleryImage.addEventListener('mouseleave', () => {
                isDragging = false;
                galleryImage.classList.remove('dragging');
              });

              galleryImage.addEventListener('mouseup', () => {
                isDragging = false;
                galleryImage.classList.remove('dragging');
              });

              galleryImage.addEventListener('mousemove', e => {
                if (isDragging) {
                  e.preventDefault();
                  lastX = e.pageX - startX;
                  lastY = e.pageY - startY;
                  updateTransform();
                }
              });

              galleryImage.addEventListener('dblclick', () => {
                resetTransform();
              });

              // --- 移动端：触摸事件 ---
              galleryImage.addEventListener('touchstart', e => {
                if (e.touches.length === 1) {
                  isDragging = true;
                  galleryImage.classList.add('dragging');
                  startX = e.touches.pageX - lastX;
                  startY = e.touches.pageY - lastY;
                } else if (e.touches.length === 2) {
                  isDragging = false; // 捏合时停止拖动
                  lastTouchDistance = Math.hypot(e.touches.pageX - e.touches.pageX, e.touches.pageY - e.touches.pageY);
                }
              });

              galleryImage.addEventListener('touchend', e => {
                isDragging = false;
                galleryImage.classList.remove('dragging');
                lastTouchDistance = null;
              });

              galleryImage.addEventListener('touchmove', e => {
                e.preventDefault();
                if (isDragging && e.touches.length === 1) {
                  lastX = e.touches.pageX - startX;
                  lastY = e.touches.pageY - startY;
                  updateTransform();
                } else if (e.touches.length === 2 && lastTouchDistance) {
                  const rect = galleryImage.getBoundingClientRect();
                  const touch1 = { x: e.touches.pageX, y: e.touches.pageY };
                  const touch2 = { x: e.touches.pageX, y: e.touches.pageY };
                  const centerX = (touch1.x + touch2.x) / 2 - rect.left;
                  const centerY = (touch1.y + touch2.y) / 2 - rect.top;

                  const newTouchDistance = Math.hypot(touch1.x - touch2.x, touch1.y - touch2.y);

                  const oldScale = scale;
                  const scaleChange = newTouchDistance / lastTouchDistance;
                  scale *= scaleChange;
                  scale = Math.min(Math.max(0.5, scale), 5);
                  lastTouchDistance = newTouchDistance;

                  lastX = centerX - (centerX - lastX) * (scale / oldScale);
                  lastY = centerY - (centerY - lastY) * (scale / oldScale);

                  updateTransform();
                }
              });

              function updateTransform() {
                // 只有当缩放大于1时才应用位移
                const canPan = scale > 1;
                const translateX = canPan ? lastX : 0;
                const translateY = canPan ? lastY : 0;
                if (!canPan) {
                  lastX = 0;
                  lastY = 0;
                }
                galleryImage.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
              }

              function resetTransform() {
                scale = 1;
                lastX = 0;
                lastY = 0;
                updateTransform();
              }
              setupPortraitUpload(jsonData);
            }

            async function main() {
              updatePanel(jsonData);
              // 设置默认折叠状态
              panel.classList.add('collapsed');

              const dataLoaded = await fetchData();
              if (dataLoaded) {
                await updatePortrait(jsonData); // 等待头像加载完成
                linkifyAllText();
              } else {
                console.warn(`[状态栏 ${panel.id}] 无法加载图片索引，图片相关功能将不可用。`);
              }
              setupEventListeners();
            }

            main();
          } catch (error) {
            displayError(
              '脚本执行失败。这通常是由于AI输出的JSON格式不正确导致的。',
              `错误信息: ${error.message}. 捕获到的原始数据: ${rawData}`,
            );
          }
        }); // 结束 forEach 循环
      });
    
