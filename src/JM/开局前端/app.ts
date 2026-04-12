import { data } from './data';

export function init() {
  const selections = {};
        const selectionOrder = [
          'gender',
          'status',
          'professionCategory',
          'profession',
          'feature',
          'modification',
          'customFeature',
          'customModification',
          'customScene',
        ];
  
        function getRandomElement(arr) {
          return arr[Math.floor(Math.random() * arr.length)];
        }
        function navigateTo(screenId) {
          document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
          document.getElementById(screenId).classList.add('active');
        }
  
        function renderCardOptions(containerId, options, type) {
          const container = document.getElementById(containerId);
          container.innerHTML = '';
          const grid = document.createElement('div');
          grid.className = 'selection-grid';
          if (Array.isArray(options)) {
            options.forEach(opt => grid.appendChild(createCard(type, opt, '')));
          } else {
            for (const [key, value] of Object.entries(options)) {
              grid.appendChild(createCard(type, key, value.description || ''));
            }
          }
          container.appendChild(grid);
          const nextButton = container.closest('.screen').querySelector('.btn-primary');
          if (nextButton) {
            if (type === 'profession' && document.getElementById('custom-profession-input').value.trim()) {
              nextButton.disabled = false;
            } else {
              nextButton.disabled = !selections[type];
            }
          }
        }
  
        function createCard(type, value, description) {
          const el = document.createElement('div');
          el.className = 'card';
          el.dataset.type = type;
          el.dataset.value = value;
          if (selections[type] === value) el.classList.add('selected');
          const title = document.createElement('h3');
          title.textContent = value;
          el.appendChild(title);
          if (description) {
            const p = document.createElement('p');
            p.textContent = description;
            el.appendChild(p);
          }
          return el;
        }
  
        function renderFeaturesScreen() {
          const container = document.getElementById('features-container');
          container.innerHTML = '';
          selections.feature = selections.feature || {};
          const isDeteriorated = selections.status?.includes('劣化人');
          const featureSet = data.gender[selections.gender].features;
          for (const category in featureSet) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'feature-category';
            const title = document.createElement('h4');
            title.textContent = category;
            categoryDiv.appendChild(title);
            const optionsGrid = document.createElement('div');
            optionsGrid.className = 'feature-options-grid';
            const levels = featureSet[category];
            levels.forEach(level => {
              const optionDiv = document.createElement('div');
              optionDiv.className = 'feature-option';
              optionDiv.dataset.category = category;
              optionDiv.dataset.value = level;
              optionDiv.textContent = level;
              optionsGrid.appendChild(optionDiv);
            });
            categoryDiv.appendChild(optionsGrid);
            container.appendChild(categoryDiv);
            if (isDeteriorated) {
              const lowestLevel = levels[levels.length - 1];
              selections.feature[category] = lowestLevel;
              optionsGrid.querySelectorAll('.feature-option').forEach(o => o.classList.add('disabled'));
              const selectedOpt = optionsGrid.querySelector(`[data-value="${lowestLevel}"]`);
              if (selectedOpt) selectedOpt.classList.add('selected');
            } else if (selections.feature[category]) {
              const selectedOpt = optionsGrid.querySelector(`[data-value="${selections.feature[category]}"]`);
              if (selectedOpt) selectedOpt.classList.add('selected');
            }
          }
          checkAllFeaturesSelected();
        }
  
        function checkAllFeaturesSelected() {
          const featureSet = data.gender[selections.gender].features;
          const allSelected = Object.keys(featureSet).every(cat => selections.feature && selections.feature[cat]);
          document.getElementById('to-modification').disabled = !allSelected;
        }
  
        function renderModificationScreen() {
          const container = document.getElementById('modification-container');
          container.innerHTML = '';
          selections.modification = selections.modification || [];
          const profession = selections.profession;
          const allMods = data.gender[selections.gender].modifications;
  
          // Handle required mods first
          const requiredMods = allMods.filter(m => m.requires?.includes(profession));
          if (requiredMods.length > 0) {
            const info = document.createElement('div');
            info.className = 'required-mod-info';
            const modNames = requiredMods.map(m => `<strong>${m.name}</strong>`).join('、');
            info.innerHTML = `根据你的职业 [${profession}]，以下改造为强制执行：${modNames}`;
            container.appendChild(info);
            requiredMods.forEach(mod => {
              if (!selections.modification.includes(mod.name)) {
                selections.modification.push(mod.name);
              }
            });
          }
  
          // Render all options
          allMods.forEach(mod => {
            const option = createModOption(mod);
            const isForbidden = mod.forbids?.includes(profession);
  
            if (isForbidden) {
              option.classList.add('disabled');
            } else if (requiredMods.some(rm => rm.name === mod.name)) {
              option.classList.add('selected', 'disabled');
            } else if (Array.isArray(selections.modification) && selections.modification.includes(mod.name)) {
              option.classList.add('selected');
            }
            container.appendChild(option);
          });
          document.getElementById('to-summary').disabled = false;
        }
  
        function createModOption(mod) {
          const opt = document.createElement('div');
          opt.className = 'mod-option';
          opt.dataset.value = mod.name;
          opt.title = mod.description || mod.name;
          opt.textContent = mod.name;
          return opt;
        }
  
        function handleRandomize(screenId) {
          const screenElement = document.getElementById(screenId);
          if (!screenElement) return;
          switch (screenId) {
            case 'screen-gender':
            case 'screen-status':
            case 'screen-profession-category':
              const cards = screenElement.querySelectorAll('.card:not(.disabled)');
              if (cards.length > 0) getRandomElement(Array.from(cards)).click();
              break;
            case 'screen-profession':
              document.getElementById('custom-profession-input').value = '';
              delete selections.profession;
              const profCards = screenElement.querySelectorAll('.card:not(.disabled)');
              if (profCards.length > 0) getRandomElement(Array.from(profCards)).click();
              break;
            case 'screen-features':
              if (selections.status?.includes('劣化人')) return;
              document.getElementById('custom-features-input').value = '';
              delete selections.customFeature;
              screenElement.querySelectorAll('.feature-category').forEach(cat => {
                const opts = cat.querySelectorAll('.feature-option:not(.disabled)');
                if (opts.length > 0) getRandomElement(Array.from(opts)).click();
              });
              break;
            case 'screen-modification':
              document.getElementById('custom-modification-input').value = '';
              delete selections.customModification;
              selections.modification = selections.modification.filter(mName => {
                const modEl = screenElement.querySelector(`.mod-option[data-value="${mName}"]`);
                return modEl?.classList.contains('disabled');
              });
              const optMods = Array.from(screenElement.querySelectorAll('.mod-option:not(.disabled)'));
              optMods.forEach(m => m.classList.remove('selected'));
              if (optMods.length > 0) {
                const num = 1 + Math.floor(Math.random() * Math.min(3, optMods.length));
                const shuffled = optMods.sort(() => 0.5 - Math.random());
                for (let i = 0; i < num; i++) shuffled[i].click();
              }
              break;
          }
        }
  
        function updateSelection(type, value) {
          if (selections[type] === value) return;
          selections[type] = value;
          const currentIndex = selectionOrder.indexOf(type);
          for (let i = currentIndex + 1; i < selectionOrder.length; i++) {
            // Clear all subsequent selections, including custom ones
            const key = selectionOrder[i];
            delete selections[key];
            if (document.getElementById(`custom-${key}-input`)) {
              document.getElementById(`custom-${key}-input`).value = '';
            }
          }
        }
  
        // --- SINGLE EVENT LISTENER FOR THE ENTIRE BODY ---
        document.body.addEventListener('click', function (e) {
          const card = e.target.closest('.card');
          const featureOption = e.target.closest('.feature-option');
          const modOption = e.target.closest('.mod-option');
          const backBtn = e.target.closest('.back-btn');
          const randomizeBtn = e.target.closest('.randomize-btn');
          const nextBtn = e.target.closest('.btn-primary');
  
          if (randomizeBtn) {
            handleRandomize(randomizeBtn.dataset.screenId);
            return;
          }
  
          if (card) {
            if (card.dataset.type === 'profession') {
              document.getElementById('custom-profession-input').value = '';
            }
            updateSelection(card.dataset.type, card.dataset.value);
            card.parentElement.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            card.closest('.screen').querySelector('.btn-primary').disabled = false;
          }
  
          if (featureOption && !featureOption.classList.contains('disabled')) {
            selections.feature = selections.feature || {};
            selections.feature[featureOption.dataset.category] = featureOption.dataset.value;
            featureOption.parentElement
              .querySelectorAll('.feature-option')
              .forEach(opt => opt.classList.remove('selected'));
            featureOption.classList.add('selected');
            checkAllFeaturesSelected();
          }
  
          if (modOption && !modOption.classList.contains('disabled')) {
            selections.modification = Array.isArray(selections.modification) ? selections.modification : [];
            const modName = modOption.dataset.value;
            const index = selections.modification.indexOf(modName);
            if (index > -1) {
              selections.modification.splice(index, 1);
              modOption.classList.remove('selected');
            } else {
              selections.modification.push(modName);
              modOption.classList.add('selected');
            }
          }
  
          if (backBtn) {
            navigateTo(backBtn.dataset.target);
          }
          if (nextBtn && !nextBtn.disabled) {
            handleNext(nextBtn.id);
          }
        });
  
        document.getElementById('custom-profession-input').addEventListener('input', e => {
          const value = e.target.value.trim();
          if (value) {
            updateSelection('profession', value);
            document.querySelectorAll('#profession-options .card').forEach(c => c.classList.remove('selected'));
            document.getElementById('to-features').disabled = false;
          } else {
            delete selections.profession;
            document.getElementById('to-features').disabled = true;
          }
        });
  
        document.getElementById('custom-features-input').addEventListener('input', e => {
          selections.customFeature = e.target.value.trim();
        });
  
        document.getElementById('custom-modification-input').addEventListener('input', e => {
          selections.customModification = e.target.value.trim();
        });
  
        document.getElementById('custom-scene-input').addEventListener('input', e => {
          selections.customScene = e.target.value.trim();
        });
  
        async function handleNext(nextBtnId) {
          switch (nextBtnId) {
            case 'to-status':
              renderCardOptions('status-options', data.gender[selections.gender].status, 'status');
              navigateTo('screen-status');
              break;
            case 'to-profession-or-category':
              const statusInfo = data.gender[selections.gender].status[selections.status];
              if (statusInfo.professionCategories) {
                document.querySelector('#screen-profession .back-btn').dataset.target = 'screen-profession-category';
                renderCardOptions('profession-category-options', statusInfo.professionCategories, 'professionCategory');
                navigateTo('screen-profession-category');
              } else {
                document.querySelector('#screen-profession .back-btn').dataset.target = 'screen-status';
                renderCardOptions('profession-options', statusInfo.professions, 'profession');
                navigateTo('screen-profession');
              }
              break;
            case 'to-profession':
              const categoryInfo =
                data.gender[selections.gender].status[selections.status].professionCategories[
                  selections.professionCategory
                ];
              if (categoryInfo.professions?.length === 1) {
                selections.profession = categoryInfo.professions[0];
                renderFeaturesScreen();
                navigateTo('screen-features');
              } else {
                renderCardOptions('profession-options', categoryInfo.professions, 'profession');
                navigateTo('screen-profession');
              }
              break;
            case 'to-features':
              renderFeaturesScreen();
              navigateTo('screen-features');
              break;
            case 'to-modification':
              renderModificationScreen();
              navigateTo('screen-modification');
              break;
            case 'to-summary':
              const summaryContainer = document.getElementById('summary-content');
              summaryContainer.innerHTML = '';
              summaryContainer.className = 'summary-section';
              const fields = {
                性别: 'gender',
                社会身份: 'status',
                职业大类: 'professionCategory',
                具体职业: 'profession',
              };
              for (const [label, key] of Object.entries(fields)) {
                if (selections[key]) {
                  const item = document.createElement('div');
                  item.className = 'summary-item';
                  item.innerHTML = `<span class="summary-label">${label}</span><span class="summary-value">${selections[key]}</span>`;
                  summaryContainer.appendChild(item);
                }
              }
              if (selections.feature) {
                for (const [cat, lvl] of Object.entries(selections.feature)) {
                  const item = document.createElement('div');
                  item.className = 'summary-item';
                  item.innerHTML = `<span class="summary-label">${cat}</span><span class="summary-value">${lvl}</span>`;
                  summaryContainer.appendChild(item);
                }
              }
              if (selections.customFeature) {
                const item = document.createElement('div');
                item.className = 'summary-item';
                item.innerHTML = `<span class="summary-label">补充特征</span><span class="summary-value">${selections.customFeature}</span>`;
                summaryContainer.appendChild(item);
              }
              if (Array.isArray(selections.modification) && selections.modification.length > 0) {
                const item = document.createElement('div');
                item.className = 'summary-item';
                item.innerHTML = `<span class="summary-label">身体改造</span><span class="summary-value">${selections.modification.join(', ')}</span>`;
                summaryContainer.appendChild(item);
              }
              if (selections.customModification) {
                const item = document.createElement('div');
                item.className = 'summary-item';
                item.innerHTML = `<span class="summary-label">补充改造</span><span class="summary-value">${selections.customModification}</span>`;
                summaryContainer.appendChild(item);
              }
              navigateTo('screen-summary');
              break;
            case 'confirm-and-start':
              const genderValue = selections.gender === '男' ? 'man' : 'female';
              let description = `创建角色：性别${selections.gender}，姓名为{{user}},身份为${selections.status}，`;
              if (selections.professionCategory) description += `职业大类为${selections.professionCategory}，`;
              description += `具体职业是${selections.profession}。`;
              if (selections.feature) {
                const featuresDesc = Object.entries(selections.feature)
                  .map(([cat, val]) => `${cat}为“${val}”`)
                  .join('，');
                description += ` 生理特征：${featuresDesc}。`;
              }
              if (selections.customFeature) {
                description += ` 补充特征：${selections.customFeature}。`;
              }
              if (Array.isArray(selections.modification) && selections.modification.length > 0) {
                description += ` 并接受了以下改造：${selections.modification.join('、')}。`;
              }
              if (selections.customModification) {
                description += ` 补充改造：${selections.customModification}。`;
              }
              if (selections.customScene) {
                description += ` 自定义开场：${selections.customScene}`;
              }
              description += ' 请根据世界观，生成符合人物的身份和设定的开局。';
  
              if (typeof insertOrAssignVariables === 'function' && typeof triggerSlash === 'function') {
                try {
                  await insertOrAssignVariables({ gender: genderValue });
                  const commandPayload = [`/send ${description}`, '/trigger'].join('|');
                  triggerSlash(commandPayload);
  
                  const finalDiv = document.createElement('div');
                  finalDiv.style.padding = '20px';
                  finalDiv.style.textAlign = 'center';
                  const finalTitle = document.createElement('h2');
                  finalTitle.className = 'screen-header';
                  finalTitle.style.cssText = 'margin-bottom:1rem;border:none;';
                  finalTitle.textContent = '档案已发送';
                  const finalText = document.createElement('p');
                  finalText.style.color = 'var(--accent-color)';
                  finalText.style.fontSize = '1.2rem';
                  finalText.textContent = `[档案已生成并注入聊天栏...]`;
                  finalDiv.appendChild(finalTitle);
                  finalDiv.appendChild(finalText);
                  document.querySelector('.generator-container').innerHTML = '';
                  document.querySelector('.generator-container').appendChild(finalDiv);
                } catch (error) {
                  console.error('执行指令时出错:', error);
                  alert('发送指令失败！');
                }
              } else {
                console.log('--- 角色卡生成数据 ---');
                console.log(description);
                console.log('--------------------------');
                console.log(
                  '错误：外部接口(insertOrAssignVariables 或 triggerSlash)未找到。如果这不是在SillyTavern等应用中加载的，请在浏览器开发者工具的控制台中查看生成的数据。',
                );
  
                const finalDiv = document.createElement('div');
                finalDiv.style.padding = '20px';
                finalDiv.style.textAlign = 'center';
                const finalTitle = document.createElement('h2');
                finalTitle.className = 'screen-header';
                finalTitle.style.cssText = 'margin-bottom:1rem;border:none;';
                finalTitle.textContent = '档案已生成';
                const finalText = document.createElement('p');
                finalText.style.color = 'var(--accent-color)';
                finalText.style.fontSize = '1.2rem';
                finalText.textContent = `[请在浏览器控制台(F12)查看数据]`;
                finalDiv.appendChild(finalTitle);
                finalDiv.appendChild(finalText);
                document.querySelector('.generator-container').innerHTML = '';
                document.querySelector('.generator-container').appendChild(finalDiv);
              }
              break;
          }
        }
}

