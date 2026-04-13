
      window.JM_StatusDataManager =
        window.JM_StatusDataManager ||
        (() => {
          let dataPromise = null;
          async function fetchDataInternal() {
            const baseUrl = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
            const imageIndexUrl = `${baseUrl}imageIndex.json`;
            const synonymsUrl = `${baseUrl}synonyms.json`;
            const faceIndexUrl = `${baseUrl.replace('/jm/', '/face/')}face_index.json`;
            const [imageResponse, synonymResponse, faceResponse] = await Promise.all([
              fetch(imageIndexUrl),
              fetch(synonymsUrl),
              fetch(faceIndexUrl),
            ]);
            const data = { imageIndex: {}, synonymMap: {}, fallbackAvatars: [], allKeywords: [], keywordRegex: null };
            if (!imageResponse.ok) throw new Error(`图片索引加载失败: ${imageResponse.status}`);
            data.imageIndex = await imageResponse.json();
            if (synonymResponse.ok) {
              const synonymData = await synonymResponse.json();
              for (const mainKeyword in synonymData) {
                synonymData[mainKeyword].forEach(alias => {
                  data.synonymMap[alias] = mainKeyword;
                });
              }
            }
            if (faceResponse.ok) {
              data.fallbackAvatars = await faceResponse.json();
            }
            data.allKeywords = [...Object.keys(data.imageIndex), ...Object.keys(data.synonymMap)];
            if (data.allKeywords.length > 0) {
              const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              data.allKeywords.sort((a, b) => b.length - a.length);
              data.keywordRegex = new RegExp(`(${data.allKeywords.map(escapeRegExp).join('|')})`, 'g');
            }
            return data;
          }
          return {
            getData() {
              if (!dataPromise) dataPromise = fetchDataInternal();
              return dataPromise;
            },
          };
        })();

      const idbHelper = {
        db: null,
        openDB() {
          if (this.db) return Promise.resolve(this.db);
          return new Promise((resolve, reject) => {
            const request = indexedDB.open('JM_UserData', 1);
            request.onupgradeneeded = event => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains('portraits')) db.createObjectStore('portraits', { keyPath: 'id' });
            };
            request.onsuccess = event => {
              this.db = event.target.result;
              resolve(this.db);
            };
            request.onerror = event => reject(new Error(`IndexedDB error: ${event.target.errorCode}`));
          });
        },
        async set(id, value) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const request = db.transaction(['portraits'], 'readwrite').objectStore('portraits').put({ id, value });
            request.onsuccess = () => resolve();
            request.onerror = event => reject(event.target.error);
          });
        },
        async get(id) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const request = db.transaction(['portraits'], 'readonly').objectStore('portraits').get(id);
            request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
            request.onerror = event => reject(event.target.error);
          });
        },
        async delete(id) {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const request = db.transaction(['portraits'], 'readwrite').objectStore('portraits').delete(id);
            request.onsuccess = () => resolve();
            request.onerror = event => reject(event.target.error);
          });
        },
      };

      const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/jam4435/my-image-hosting/main/jm/';
      const panelStates = new WeakMap();
      const collapsedStateByName = new Map();
      const DYNAMIC_CONTENT_CONFIG = {
        Affection: { label: '好感度' },
        Libido: { label: '性欲值' },
        Thoughts: { label: '🧠 内心想法' },
        RecentSex: { label: '📋 最近性行为' },
        ModificationsAndRestraints: { label: '身体改造与束具' },
      };
      const DYNAMIC_CONTENT_MAP = {
        Status: {
          title: '身份与当前状态',
          icon: '🎖️',
          labels: { Identity: '身份', Occupation: '职业', Affiliation: '从属', Temperament: '气质', Posture: '姿势' },
        },
        Outfit: {
          title: '服装与内衣',
          icon: '👗',
          labels: { Top: '上装', Bottom: '下装', Underwear: '内衣', Footwear: '鞋履' },
        },
        BodyDetails: {
          title: '身体与性器细节',
          icon: '🩸',
          labels: { Mouth: '口腔', Breasts: '胸部', WombAndVagina: '子宫与阴道', Anus: '后庭', Hands: '手部', Legs: '腿部', Feet: '足部' },
        },
      };

      let root;
      let imageIndex = {};
      let synonymMap = {};
      let allKeywords = [];
      let keywordRegex = null;
      let fallbackAvatars = [];
      let refreshTimer = null;

      const safeGet = (obj, path, defaultValue = undefined) => {
        const keys = Array.isArray(path) ? path : path.split('.');
        let result = obj;
        for (const key of keys) {
          result = result?.[key];
          if (result === undefined) return defaultValue;
        }
        return result;
      };
      const uniq = arr => Array.from(new Set(arr));
      const ensureString = value => (value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value));
      const ensureArray = value => (Array.isArray(value) ? value : []);
      const ensureObject = value => (_.isPlainObject(value) ? value : {});
      const EDIT_PENCIL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a.996.996 0 0 0 0-1.41L18.37 3.3a.996.996 0 1 0-1.41 1.41l2.34 2.33a.996.996 0 0 0 1.41 0z"/></svg>';
      const DISPLAY_TEXT_REPLACEMENTS = [['__DOT__', '.']];
      function normalizeDisplayValue(value) {
        if (typeof value === 'string') {
          return DISPLAY_TEXT_REPLACEMENTS.reduce((text, [token, replacement]) => text.split(token).join(replacement), value);
        }
        if (Array.isArray(value)) return value.map(item => normalizeDisplayValue(item));
        if (_.isPlainObject(value)) {
          return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeDisplayValue(nestedValue)]));
        }
        return value;
      }
      function escapeHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }
      function splitCharacterNames(rawText) {
        return uniq(String(rawText ?? '').split(/[，,、|/]/).map(name => name.trim()).filter(Boolean));
      }
      function replaceDelimitedCharacterName(content, oldName, newName) {
        const parts = String(content ?? '').split(/([，,、|/])/);
        let replaced = false;
        for (let index = 0; index < parts.length; index += 2) {
          const originalPart = parts[index];
          const trimmedPart = originalPart.trim();
          if (trimmedPart !== oldName) continue;
          parts[index] = originalPart.replace(trimmedPart, newName);
          replaced = true;
        }
        return { content: parts.join(''), replaced };
      }
      function replaceCurrentCharacterNameInMessage(message, oldName, newName) {
        let replaced = false;
        const updatedMessage = String(message ?? '').replace(/<当前(人物|角色)>([\s\S]*?)<\/当前\1>/g, (full, tagName, content) => {
          const result = replaceDelimitedCharacterName(content, oldName, newName);
          if (!result.replaced) return full;
          replaced = true;
          return `<当前${tagName}>${result.content}</当前${tagName}>`;
        });
        return { message: updatedMessage, replaced };
      }
      function renameKeyInObject(target, oldKey, newKey, newValue) {
        const entries = Object.entries(ensureObject(target));
        if (oldKey !== newKey && entries.some(([key]) => key === newKey)) {
          throw new Error(`变量中已存在人物“${newKey}”。`);
        }
        let found = false;
        const nextEntries = entries.map(([key, value]) => {
          if (key !== oldKey) return [key, value];
          found = true;
          return [newKey, newValue];
        });
        if (!found) throw new Error(`未找到人物“${oldKey}”对应的变量。`);
        return Object.fromEntries(nextEntries);
      }
      function buildUpdatedStatData(statData, oldName, newName, newIdentity) {
        const nextStatData = _.cloneDeep(ensureObject(statData));
        if (_.has(nextStatData, ['角色数据', oldName])) {
          const roleMap = ensureObject(_.get(nextStatData, '角色数据', {}));
          const updatedCharacter = _.cloneDeep(ensureObject(roleMap[oldName]));
          updatedCharacter.Status = ensureObject(updatedCharacter.Status);
          updatedCharacter.Status.Identity = newIdentity;
          nextStatData.角色数据 = renameKeyInObject(roleMap, oldName, newName, updatedCharacter);
          return nextStatData;
        }
        if (_.has(nextStatData, oldName)) {
          const updatedCharacter = _.cloneDeep(ensureObject(nextStatData[oldName]));
          updatedCharacter.Status = ensureObject(updatedCharacter.Status);
          updatedCharacter.Status.Identity = newIdentity;
          return renameKeyInObject(nextStatData, oldName, newName, updatedCharacter);
        }
        throw new Error(`未找到人物“${oldName}”对应的变量。`);
      }
      function getLatestAssistantMessage() {
        const messages = getChatMessages('0-{{lastMessageId}}', { role: 'assistant', hide_state: 'all' }) || [];
        return messages.length > 0 ? messages[messages.length - 1] : null;
      }
      async function migratePortraitStorage(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        const oldKey = `jm_user_portrait_${oldName}`;
        const newKey = `jm_user_portrait_${newName}`;
        const existingPortrait = await idbHelper.get(oldKey);
        if (!existingPortrait) return;
        await idbHelper.set(newKey, existingPortrait);
        await idbHelper.delete(oldKey);
      }
      function getPanelState(panel) {
        if (!panelStates.has(panel)) {
          panelStates.set(panel, { currentGalleryImages: [], currentGalleryIndex: 0, currentGalleryBaseUrl: '', portraitClickListener: null });
        }
        return panelStates.get(panel);
      }
      function getDeterministicRandomIndex(seed, max) {
        if (!seed || max === 0) return 0;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
          hash = (hash << 5) - hash + seed.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash) % max;
      }
      function displayRootError(message, details = '') {
        if (!root) return;
        console.error('[变量状态栏] ' + message, details);
        root.innerHTML = `<div class="status-feedback error"><h3>状态栏错误</h3><p>${message}</p><details><summary>详细信息</summary><p>${details}</p></details></div>`;
      }
      async function fetchData() {
        try {
          const sharedData = await window.JM_StatusDataManager.getData();
          imageIndex = sharedData.imageIndex;
          synonymMap = sharedData.synonymMap;
          fallbackAvatars = sharedData.fallbackAvatars;
          allKeywords = sharedData.allKeywords;
          keywordRegex = sharedData.keywordRegex;
          return true;
        } catch (error) {
          console.warn('[变量状态栏] 核心图片数据加载失败，图片相关功能将退化。', error);
          imageIndex = {};
          synonymMap = {};
          fallbackAvatars = [];
          allKeywords = [];
          keywordRegex = null;
          return false;
        }
      }
      function loadCurrentCharacterNames() {
        try {
          const latestMessage = getChatMessages(-1)?.[0]?.message ?? '';
          const match = typeof latestMessage === 'string' ? latestMessage.match(/<当前(人物|角色)>([\s\S]*?)<\/当前\1>/) : null;
          if (!match) return [];
          return splitCharacterNames(match[2]);
        } catch (error) {
          console.warn('[变量状态栏] 读取最新楼层失败:', error);
          return [];
        }
      }
      function loadStatData() {
        try {
          return ensureObject(_.get(getVariables({ type: 'chat' }), 'stat_data', {}));
        } catch (error) {
          console.warn('[变量状态栏] 读取 chat 变量失败:', error);
          return {};
        }
      }
      function resolveCharacterSource(name, statData) {
        const fromCharacterMap = safeGet(statData, ['角色数据', name], undefined);
        if (_.isPlainObject(fromCharacterMap)) return fromCharacterMap;
        const fromRoot = safeGet(statData, name, undefined);
        return _.isPlainObject(fromRoot) ? fromRoot : null;
      }
      function buildPanelDataFromCharacter(name, statData) {
        const source = resolveCharacterSource(name, statData);
        if (!source) return null;
        const normalizedSource = normalizeDisplayValue(source);
        const mergedModifications = uniq([
          ...ensureArray(safeGet(normalizedSource, 'ModificationsAndRestraints', [])).filter(Boolean),
          ...ensureArray(safeGet(normalizedSource, 'Modifications', [])).filter(Boolean),
        ]);
        return {
          ..._.omit(normalizedSource, ['Modifications', 'ModificationsAndRestraints']),
          Name: normalizeDisplayValue(name),
          Location: ensureString(safeGet(normalizedSource, 'Location', '')),
          Time: ensureString(safeGet(normalizedSource, 'Time', '')),
          Affection: ensureString(safeGet(normalizedSource, 'Affection', '')),
          Libido: ensureString(safeGet(normalizedSource, 'Libido', '')),
          Thoughts: ensureString(safeGet(normalizedSource, 'Thoughts', '')),
          RecentSex: ensureString(safeGet(normalizedSource, 'RecentSex', '')),
          ModificationsAndRestraints: mergedModifications,
          Status: ensureObject(safeGet(normalizedSource, 'Status', {})),
          Outfit: ensureObject(safeGet(normalizedSource, 'Outfit', {})),
          BodyDetails: ensureObject(safeGet(normalizedSource, 'BodyDetails', {})),
        };
      }
      function findImagesByKeyword(textToSearch) {
        if (!textToSearch || typeof textToSearch !== 'string') return [];
        const preliminaryMatches = allKeywords.filter(keyword => textToSearch.includes(keyword));
        const preciseMatches = preliminaryMatches.filter(shortMatch => !preliminaryMatches.some(longMatch => longMatch.length > shortMatch.length && longMatch.includes(shortMatch)));
        const mainKeywordMatches = preciseMatches.map(match => ({ keyword: synonymMap[match] || match, index: textToSearch.indexOf(match) })).sort((a, b) => a.index - b.index);
        let foundImages = [];
        mainKeywordMatches.forEach(match => {
          const imageList = imageIndex[match.keyword];
          if (Array.isArray(imageList)) foundImages = foundImages.concat(imageList.filter(img => img !== '非头像.abc'));
        });
        return uniq(foundImages);
      }
      function linkifyAllText(panel) {
        if (!keywordRegex) return;
        panel.querySelectorAll('.details-value, .narrative-content').forEach(el => {
          if (el.querySelector('a.image-link') || !el.textContent) return;
          const originalText = el.textContent;
          keywordRegex.lastIndex = 0;
          if (!keywordRegex.test(originalText)) return;
          keywordRegex.lastIndex = 0;
          el.innerHTML = originalText.replace(keywordRegex, match => (imageIndex[synonymMap[match] || match] ? `<a href="#" class="image-link" data-keyword="${match}">${match}</a>` : match));
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
      const renderStat = (label, value) => {
        const parsed = parseStat(value);
        const valueHtml = parsed
          ? parsed.mode === 'range'
            ? `<div><span class="red">${parsed.from}</span> <span class="arrow">→</span> <span class="green">${parsed.to}</span></div>${parsed.reason ? `<div class="stat-change-reason">(${parsed.reason})</div>` : ''}`
            : `<div><span class="${Number(parsed.value) < 0 ? 'red' : 'green'}">${parsed.value}</span></div>${parsed.reason ? `<div class="stat-change-reason">(${parsed.reason})</div>` : ''}`
          : String(value);
        return `<div class="stat-box"><div class="stat-label">${label}</div><div class="stat-value">${valueHtml}</div></div>`;
      };
      const renderNarrative = (label, value) => `<div class="narrative-block"><span class="narrative-label">${label}</span><p class="narrative-content">${String(value)}</p></div>`;
      function renderList(label, items) {
        if (!Array.isArray(items) || items.length === 0) return '';
        const itemsHtml = items.map(item => `<li class="modifications-item"><span class="details-value" data-keyword="${item}">${item}</span></li>`).join('');
        return `<div class="details-block"><div class="details-header">${label}</div><ul class="modifications-list">${itemsHtml}</ul></div>`;
      }
      function generateDynamicTabsAndContent(panel, data) {
        const excludedKeys = new Set(['Name', 'Location', 'Time', 'Affection', 'Libido', 'Thoughts', 'RecentSex', 'ModificationsAndRestraints', 'Modifications']);
        const panelKey = panel.dataset.panelKey || '0';
        let tabsHtml = '<div class="tabs">';
        let contentsHtml = '';
        let tabIndex = 0;
        for (const key in data) {
          if (!excludedKeys.has(key) && _.isPlainObject(data[key])) {
            const tabId = `dynamic-tab-${panelKey}-${tabIndex}`;
            const isActive = tabIndex === 0 ? 'active' : '';
            const tabInfo = DYNAMIC_CONTENT_MAP[key] || { title: key, icon: '📋', labels: {} };
            tabsHtml += `<button class="tab-button ${isActive}" data-tab="${tabId}">${tabInfo.icon} ${tabInfo.title}</button>`;
            contentsHtml += `<div id="${tabId}" class="tab-content ${isActive}"><ul class="details-list">`;
            for (const subKey in data[key]) {
              const label = tabInfo.labels[subKey] || subKey;
              const rawValue = data[key][subKey];
              const valueHtml = key === 'Status' && subKey === 'Identity'
                ? `<span class="inline-editable-value"><span class="details-value">${escapeHtml(rawValue)}</span><button class="edit-trigger jm-edit-character-trigger" type="button" title="编辑名字与身份">${EDIT_PENCIL_ICON}</button></span>`
                : `<span class="details-value">${escapeHtml(rawValue)}</span>`;
              contentsHtml += `<li class="details-item"><span class="details-label">${label}</span>${valueHtml}</li>`;
            }
            contentsHtml += '</ul></div>';
            tabIndex++;
          }
        }
        tabsHtml += '</div>';
        return tabIndex === 0 ? { tabsHtml: '', contentsHtml: '' } : { tabsHtml, contentsHtml };
      }
      function renderDynamicContent(panel, data) {
        const container = panel.querySelector('.jm-dynamic-content-area');
        if (!container) return;
        const headerFields = new Set(['Name', 'Location', 'Time']);
        const itemsToRender = Object.keys(data)
          .filter(key => (!headerFields.has(key) && typeof data[key] !== 'object') || Array.isArray(data[key]))
          .map(key => ({ key, label: DYNAMIC_CONTENT_CONFIG[key] ? DYNAMIC_CONTENT_CONFIG[key].label : key, value: data[key] }));
        const statItems = [];
        let dynamicHtml = '';
        itemsToRender.forEach(item => {
          let type = 'narrative';
          if (isStatField(item.key)) type = 'stat';
          else if (Array.isArray(item.value)) type = 'list';
          if (type === 'stat') {
            statItems.push(item);
            return;
          }
          if (statItems.length > 0) {
            dynamicHtml += `<div class="core-stats">${statItems.map(statItem => renderStat(statItem.label, statItem.value)).join('')}</div>`;
            statItems.length = 0;
          }
          dynamicHtml += type === 'list' ? renderList(item.label, item.value) : renderNarrative(item.label, item.value);
        });
        if (statItems.length > 0) {
          dynamicHtml += `<div class="core-stats">${statItems.map(statItem => renderStat(statItem.label, statItem.value)).join('')}</div>`;
        }
        container.innerHTML = dynamicHtml;
      }
      function updatePanel(panel, data) {
        panel.dataset.characterName = data.Name;
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
            <div class="collapse-toggle" title="展开/折叠"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg></div>
          </div>
          <div class="collapsible-section">
            <div class="jm-dynamic-content-area"></div>
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
          </div>`;
        ['Name', 'Location', 'Time'].forEach(field => {
          const el = panel.querySelector(`[data-field="${field}"]`);
          if (el) el.textContent = data[field] || '';
        });
        renderDynamicContent(panel, data);
        const { tabsHtml, contentsHtml } = generateDynamicTabsAndContent(panel, data);
        panel.querySelector('.tabs-container').innerHTML = tabsHtml;
        panel.querySelector('.tab-content-container').innerHTML = contentsHtml;
        const shouldCollapse = collapsedStateByName.has(data.Name) ? collapsedStateByName.get(data.Name) : true;
        panel.classList.toggle('collapsed', shouldCollapse);
      }
      async function updatePortrait(panel, data) {
        const portraitImg = panel.querySelector('[data-field="portrait"]');
        if (!portraitImg) return;
        const state = getPanelState(panel);
        if (state.portraitClickListener) {
          portraitImg.removeEventListener('click', state.portraitClickListener);
          state.portraitClickListener = null;
        }
        const charName = safeGet(data, 'Name', '');
        const storageKey = `jm_user_portrait_${charName}`;
        try {
          const savedPortraitBlob = await idbHelper.get(storageKey);
          if (savedPortraitBlob) {
            const objectURL = URL.createObjectURL(savedPortraitBlob);
            portraitImg.src = objectURL;
            portraitImg.onload = () => URL.revokeObjectURL(portraitImg.src);
            state.portraitClickListener = () => openGallery(panel, [URL.createObjectURL(savedPortraitBlob)], 0, '');
            portraitImg.addEventListener('click', state.portraitClickListener);
            return;
          }
        } catch (error) {
          console.error('从 IndexedDB 加载头像失败:', error);
        }
        const textToSearch = `${safeGet(data, 'Status.Occupation', '')} ${safeGet(data, 'Name', '')}`.trim();
        let matchedImages = [];
        if (textToSearch) {
          let potentialKeywords = allKeywords.filter(keyword => textToSearch.includes(keyword));
          potentialKeywords = potentialKeywords.filter(shortMatch => !potentialKeywords.some(longMatch => longMatch.length > shortMatch.length && longMatch.includes(shortMatch)));
          const portraitKeywords = potentialKeywords.filter(keyword => {
            const mainKeyword = synonymMap[keyword] || keyword;
            const imageList = imageIndex[mainKeyword] || [];
            return Array.isArray(imageList) && !imageList.includes('非头像.abc');
          });
          const conceptKeywords = potentialKeywords.filter(keyword => {
            const mainKeyword = synonymMap[keyword] || keyword;
            const imageList = imageIndex[mainKeyword] || [];
            return Array.isArray(imageList) && imageList.includes('非头像.abc');
          });
          const keywordsToUse = portraitKeywords.length > 0 ? portraitKeywords : conceptKeywords;
          keywordsToUse.sort((a, b) => textToSearch.indexOf(a) - textToSearch.indexOf(b));
          keywordsToUse.forEach(keyword => {
            const mainKeyword = synonymMap[keyword] || keyword;
            const imageList = imageIndex[mainKeyword] || [];
            if (Array.isArray(imageList)) matchedImages = matchedImages.concat(imageList.filter(img => img !== '非头像.abc'));
          });
          matchedImages = uniq(matchedImages);
        }
        if (matchedImages.length > 0) {
          portraitImg.src = GITHUB_BASE_URL + matchedImages[0];
          state.portraitClickListener = () => openGallery(panel, matchedImages, 0, GITHUB_BASE_URL);
          portraitImg.addEventListener('click', state.portraitClickListener);
          return;
        }
        if (fallbackAvatars.length > 0) {
          const faceBaseUrl = GITHUB_BASE_URL.replace('/jm/', '/face/');
          const fallbackAvatar = fallbackAvatars[getDeterministicRandomIndex(charName || 'default', fallbackAvatars.length)];
          portraitImg.src = faceBaseUrl + fallbackAvatar;
          state.portraitClickListener = () => openGallery(panel, [fallbackAvatar], 0, faceBaseUrl);
          portraitImg.addEventListener('click', state.portraitClickListener);
          return;
        }
        portraitImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
      function openGallery(panel, images, startIndex, baseUrl) {
        const gallery = panel.querySelector('.jm-image-gallery');
        if (!gallery) return;
        const state = getPanelState(panel);
        state.currentGalleryImages = images;
        state.currentGalleryIndex = startIndex;
        state.currentGalleryBaseUrl = baseUrl;
        updateGalleryImage(panel);
        gallery.style.display = 'flex';
        gallery.querySelector('.gallery-prev').style.display = images.length <= 1 ? 'none' : 'block';
        gallery.querySelector('.gallery-next').style.display = images.length <= 1 ? 'none' : 'block';
      }
      function updateGalleryImage(panel) {
        const state = getPanelState(panel);
        const galleryImage = panel.querySelector('.gallery-image');
        if (!galleryImage || state.currentGalleryImages.length === 0) return;
        galleryImage.src = state.currentGalleryBaseUrl + state.currentGalleryImages[state.currentGalleryIndex];
        galleryImage.style.transform = 'scale(1) translate(0, 0)';
      }
      function setupPortraitUpload(panel, data) {
        const uploadTrigger = panel.querySelector('.portrait-upload-trigger');
        const resetTrigger = panel.querySelector('.portrait-reset-trigger');
        const uploadInput = panel.querySelector('.jm-portrait-upload');
        const portraitImg = panel.querySelector('[data-field="portrait"]');
        if (!uploadTrigger || !resetTrigger || !uploadInput || !portraitImg) return;
        const storageKey = `jm_user_portrait_${safeGet(data, 'Name', '')}`;
        (async () => {
          try {
            resetTrigger.style.display = (await idbHelper.get(storageKey)) ? 'flex' : 'none';
          } catch {
            resetTrigger.style.display = 'none';
          }
        })();
        uploadTrigger.onclick = () => uploadInput.click();
        resetTrigger.onclick = async () => {
          try {
            await idbHelper.delete(storageKey);
            resetTrigger.style.display = 'none';
            portraitImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            await updatePortrait(panel, data);
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
              canvas.toBlob(async blob => {
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
                  await updatePortrait(panel, data);
                  resetTrigger.style.display = 'flex';
                } catch (error) {
                  console.error('保存头像到 IndexedDB 失败:', error);
                  alert(error.name === 'QuotaExceededError' ? '浏览器存储空间不足。' : `头像保存失败: ${error.message}`);
                } finally {
                  uploadInput.value = '';
                }
              }, 'image/jpeg', 0.7);
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
      function toggleEditModal(panel, visible) {
        const modal = panel.querySelector('.jm-edit-modal');
        if (!modal) return;
        modal.classList.toggle('visible', visible);
        modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
      function setEditError(panel, message = '') {
        const errorBox = panel.querySelector('.jm-edit-error');
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.classList.toggle('visible', Boolean(message));
      }
      function openCharacterEditor(panel, data) {
        const nameInput = panel.querySelector('.jm-edit-name-input');
        const identityInput = panel.querySelector('.jm-edit-identity-input');
        if (!nameInput || !identityInput) return;
        nameInput.value = ensureString(data.Name);
        identityInput.value = ensureString(safeGet(data, 'Status.Identity', ''));
        setEditError(panel, '');
        toggleEditModal(panel, true);
        nameInput.focus();
        nameInput.select();
      }
      async function saveCharacterEdits(panel, data) {
        const nameInput = panel.querySelector('.jm-edit-name-input');
        const identityInput = panel.querySelector('.jm-edit-identity-input');
        const saveButton = panel.querySelector('.jm-edit-save-button');
        const cancelButton = panel.querySelector('.jm-edit-cancel-button');
        if (!nameInput || !identityInput || !saveButton || !cancelButton) return;
        const oldName = ensureString(data.Name).trim();
        const oldIdentity = ensureString(safeGet(data, 'Status.Identity', '')).trim();
        const newName = normalizeDisplayValue(nameInput.value.trim());
        const newIdentity = normalizeDisplayValue(identityInput.value.trim());
        if (!newName) {
          setEditError(panel, '名字不能为空。');
          nameInput.focus();
          return;
        }
        setEditError(panel, '');
        const originalVariables = _.cloneDeep(getVariables({ type: 'chat' }));
        const originalStatData = ensureObject(_.get(originalVariables, 'stat_data', {}));
        const nextStatData = buildUpdatedStatData(originalStatData, oldName, newName, newIdentity);
        const nextVariables = _.cloneDeep(originalVariables);
        nextVariables.stat_data = nextStatData;
        const latestAssistantMessage = newName !== oldName ? getLatestAssistantMessage() : null;
        let originalAssistantText = '';
        let updatedAssistantText = '';
        if (newName !== oldName) {
          if (!latestAssistantMessage) {
            setEditError(panel, '未找到最新 AI 回复，无法同步 <当前人物>/<当前角色> 中的名字。');
            return;
          }
          originalAssistantText = ensureString(latestAssistantMessage.message);
          const messageReplacement = replaceCurrentCharacterNameInMessage(originalAssistantText, oldName, newName);
          if (!messageReplacement.replaced) {
            setEditError(panel, '未在最新 AI 回复的 <当前人物>/<当前角色> 标签中找到当前名字。');
            return;
          }
          updatedAssistantText = messageReplacement.message;
        }
        saveButton.disabled = true;
        cancelButton.disabled = true;
        saveButton.textContent = '保存中...';
        try {
          replaceVariables(nextVariables, { type: 'chat' });
          if (latestAssistantMessage && updatedAssistantText !== originalAssistantText) {
            await setChatMessages([{ message_id: latestAssistantMessage.message_id, message: updatedAssistantText }], { refresh: 'affected' });
          }
          if (newName !== oldName) {
            const collapsedState = collapsedStateByName.get(oldName);
            if (collapsedState !== undefined) {
              collapsedStateByName.set(newName, collapsedState);
              collapsedStateByName.delete(oldName);
            }
            await migratePortraitStorage(oldName, newName);
          }
          data.Name = newName;
          data.Status = ensureObject(data.Status);
          data.Status.Identity = newIdentity;
          toggleEditModal(panel, false);
          scheduleRefresh();
        } catch (error) {
          try {
            replaceVariables(originalVariables, { type: 'chat' });
            if (latestAssistantMessage && updatedAssistantText !== originalAssistantText) {
              await setChatMessages([{ message_id: latestAssistantMessage.message_id, message: originalAssistantText }], { refresh: 'affected' });
            }
          } catch (rollbackError) {
            console.error('[变量状态栏] 回滚编辑失败:', rollbackError);
          }
          setEditError(panel, error?.message || '保存失败，请重试。');
        } finally {
          saveButton.disabled = false;
          cancelButton.disabled = false;
          saveButton.textContent = '保存';
        }
      }
      function setupEventListeners(panel, data) {
        const collapseToggle = panel.querySelector('.collapse-toggle');
        if (collapseToggle) {
          collapseToggle.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            collapsedStateByName.set(data.Name, panel.classList.contains('collapsed'));
          });
        }
        panel.addEventListener('click', e => {
          const link = e.target.closest('.image-link');
          if (!link) return;
          e.preventDefault();
          const matchedImages = findImagesByKeyword(link.dataset.keyword || '');
          if (matchedImages.length > 0) openGallery(panel, matchedImages, 0, GITHUB_BASE_URL);
        });
        panel.querySelectorAll('.tab-button').forEach(button => {
          button.addEventListener('click', () => {
            const targetTabId = button.dataset.tab;
            panel.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            panel.querySelector(`#${targetTabId}`)?.classList.add('active');
          });
        });
        const gallery = panel.querySelector('.jm-image-gallery');
        if (gallery) {
          gallery.querySelector('.gallery-close').addEventListener('click', () => {
            const galleryImage = gallery.querySelector('.gallery-image');
            if (galleryImage.src.startsWith('blob:')) URL.revokeObjectURL(galleryImage.src);
            gallery.style.display = 'none';
          });
          gallery.querySelector('.gallery-prev').addEventListener('click', () => {
            const state = getPanelState(panel);
            state.currentGalleryIndex = (state.currentGalleryIndex - 1 + state.currentGalleryImages.length) % state.currentGalleryImages.length;
            updateGalleryImage(panel);
          });
          gallery.querySelector('.gallery-next').addEventListener('click', () => {
            const state = getPanelState(panel);
            state.currentGalleryIndex = (state.currentGalleryIndex + 1) % state.currentGalleryImages.length;
            updateGalleryImage(panel);
          });
          const galleryImage = gallery.querySelector('.gallery-image');
          let isDragging = false;
          let startX;
          let startY;
          let lastX = 0;
          let lastY = 0;
          let scale = 1;
          let lastTouchDistance = null;
          const updateTransform = () => {
            const canPan = scale > 1;
            const translateX = canPan ? lastX : 0;
            const translateY = canPan ? lastY : 0;
            if (!canPan) {
              lastX = 0;
              lastY = 0;
            }
            galleryImage.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
          };
          const resetTransform = () => {
            scale = 1;
            lastX = 0;
            lastY = 0;
            updateTransform();
          };
          galleryImage.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = galleryImage.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            const oldScale = scale;
            scale = Math.min(Math.max(scale + e.deltaY * -0.001, 0.5), 5);
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
          ['mouseleave', 'mouseup'].forEach(eventName => galleryImage.addEventListener(eventName, () => {
            isDragging = false;
            galleryImage.classList.remove('dragging');
          }));
          galleryImage.addEventListener('mousemove', e => {
            if (!isDragging) return;
            e.preventDefault();
            lastX = e.pageX - startX;
            lastY = e.pageY - startY;
            updateTransform();
          });
          galleryImage.addEventListener('dblclick', () => resetTransform());
          galleryImage.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
              isDragging = true;
              galleryImage.classList.add('dragging');
              startX = e.touches[0].pageX - lastX;
              startY = e.touches[0].pageY - lastY;
            } else if (e.touches.length === 2) {
              isDragging = false;
              lastTouchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            }
          });
          galleryImage.addEventListener('touchend', () => {
            isDragging = false;
            galleryImage.classList.remove('dragging');
            lastTouchDistance = null;
          });
          galleryImage.addEventListener('touchmove', e => {
            e.preventDefault();
            if (isDragging && e.touches.length === 1) {
              lastX = e.touches[0].pageX - startX;
              lastY = e.touches[0].pageY - startY;
              updateTransform();
            } else if (e.touches.length === 2 && lastTouchDistance) {
              const rect = galleryImage.getBoundingClientRect();
              const touch1 = { x: e.touches[0].pageX, y: e.touches[0].pageY };
              const touch2 = { x: e.touches[1].pageX, y: e.touches[1].pageY };
              const centerX = (touch1.x + touch2.x) / 2 - rect.left;
              const centerY = (touch1.y + touch2.y) / 2 - rect.top;
              const newTouchDistance = Math.hypot(touch1.x - touch2.x, touch1.y - touch2.y);
              const oldScale = scale;
              scale = Math.min(Math.max(scale * (newTouchDistance / lastTouchDistance), 0.5), 5);
              lastTouchDistance = newTouchDistance;
              lastX = centerX - (centerX - lastX) * (scale / oldScale);
              lastY = centerY - (centerY - lastY) * (scale / oldScale);
              updateTransform();
            }
          });
        }
        panel.querySelectorAll('.jm-edit-character-trigger').forEach(trigger => {
          trigger.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openCharacterEditor(panel, data);
          });
        });
        const editModal = panel.querySelector('.jm-edit-modal');
        const editCancelButton = panel.querySelector('.jm-edit-cancel-button');
        const editSaveButton = panel.querySelector('.jm-edit-save-button');
        if (editModal) {
          editModal.addEventListener('click', event => {
            if (event.target === editModal) toggleEditModal(panel, false);
          });
        }
        if (editCancelButton) {
          editCancelButton.addEventListener('click', () => toggleEditModal(panel, false));
        }
        if (editSaveButton) {
          editSaveButton.addEventListener('click', () => {
            saveCharacterEdits(panel, data).catch(error => {
              console.error('[变量状态栏] 保存角色信息失败:', error);
              setEditError(panel, error?.message || '保存失败，请重试。');
            });
          });
        }
        setupPortraitUpload(panel, data);
      }
      function persistCollapsedStates() {
        if (!root) return;
        root.querySelectorAll('.jm-state-panel').forEach(panel => {
          const name = panel.dataset.characterName;
          if (name) collapsedStateByName.set(name, panel.classList.contains('collapsed'));
        });
      }
      const renderFeedback = (message, type = '') => `<div class="status-feedback${type ? ` ${type}` : ''}">${message}</div>`;
      async function refreshPanels() {
        if (!root) return;
        persistCollapsedStates();
        const names = loadCurrentCharacterNames();
        const statData = loadStatData();
        const panelDataList = [];
        const missingNames = [];
        names.forEach(name => {
          const panelData = buildPanelDataFromCharacter(name, statData);
          if (panelData) panelDataList.push(panelData);
          else missingNames.push(name);
        });
        let rootHtml = '';
        if (missingNames.length > 0) rootHtml += renderFeedback(`未找到变量人物：${missingNames.join('、')}`, 'warning');
        if (panelDataList.length === 0) {
          rootHtml += renderFeedback(names.length === 0 ? '未找到当前人物。请在最新楼层加入 <当前人物>人物名</当前人物> 或 <当前角色>人物名</当前角色>。' : '未找到当前人物对应的变量数据。');
          root.innerHTML = rootHtml;
          return;
        }
        rootHtml += panelDataList.map((data, index) => `<div class="status-container jm-state-panel" data-panel-key="${index}" data-character-name="${data.Name}"></div>`).join('');
        root.innerHTML = rootHtml;
        const panels = Array.from(root.querySelectorAll('.jm-state-panel'));
        panels.forEach((panel, index) => {
          updatePanel(panel, panelDataList[index]);
          setupEventListeners(panel, panelDataList[index]);
        });
        await Promise.all(panels.map((panel, index) => updatePortrait(panel, panelDataList[index]).catch(error => console.error(`[变量状态栏 ${panelDataList[index].Name}] 头像更新失败:`, error))));
        panels.forEach(panel => linkifyAllText(panel));
      }
      function scheduleRefresh() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          refreshTimer = null;
          refreshPanels().catch(error => displayRootError('刷新状态栏失败。', error?.stack || error?.message || String(error)));
        }, 150);
      }
      function setupGlobalEventListeners() {
        eventOn(tavern_events.MESSAGE_RECEIVED, () => scheduleRefresh());
        eventOn(tavern_events.MESSAGE_UPDATED, () => scheduleRefresh());
        eventOn(tavern_events.MESSAGE_SWIPED, () => scheduleRefresh());
        eventOn(tavern_events.CHAT_CHANGED, () => scheduleRefresh());
        eventOn('era:writeDone', () => scheduleRefresh());
      }
      async function init() {
        root = document.querySelector('.jm-state-panel-list');
        if (!root) throw new Error('未找到变量状态栏根容器。');
        await fetchData();
        await refreshPanels();
        setupGlobalEventListeners();
      }
      $(() => {
        errorCatched(init)();
      });
    
