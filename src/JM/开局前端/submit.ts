import { queryRequired } from './dom';
import type { FinalMessageOptions, SelectionState } from './types';

export async function submitSelections(selections: SelectionState) {
  const genderValue = selections.gender === '男' ? 'man' : 'female';
  const description = buildDescription(selections);

  if (typeof insertOrAssignVariables === 'function' && typeof triggerSlash === 'function') {
    try {
      await insertOrAssignVariables({ gender: genderValue });
      triggerSlash([`/send ${description}`, '/trigger'].join('|'));
      renderFinalMessage({
        title: '档案已发送',
        text: '[档案已生成并注入聊天栏...]',
      });
    } catch (error) {
      console.error('执行指令时出错:', error);
      alert('发送指令失败！');
    }
    return;
  }

  console.log('--- 角色卡生成数据 ---');
  console.log(description);
  console.log('--------------------------');
  console.log(
    '错误：外部接口(insertOrAssignVariables 或 triggerSlash)未找到。如果这不是在SillyTavern等应用中加载的，请在浏览器开发者工具的控制台中查看生成的数据。',
  );

  renderFinalMessage({
    title: '档案已生成',
    text: '[请在浏览器控制台(F12)查看数据]',
  });
}

export function buildDescription(selections: SelectionState) {
  let description = `创建角色：性别${selections.gender}，姓名为{{user}},身份为${selections.status}，`;

  if (selections.professionCategory) {
    description += `职业大类为${selections.professionCategory}，`;
  }

  description += `具体职业是${selections.profession}。`;

  if (selections.feature) {
    const featuresDesc = Object.entries(selections.feature)
      .map(([category, value]) => `${category}为“${value}”`)
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
  return description;
}

function renderFinalMessage(options: FinalMessageOptions) {
  const finalDiv = document.createElement('div');
  finalDiv.style.padding = '20px';
  finalDiv.style.textAlign = 'center';

  const title = document.createElement('h2');
  title.className = 'screen-header';
  title.style.cssText = 'margin-bottom:1rem;border:none;';
  title.textContent = options.title;

  const text = document.createElement('p');
  text.style.color = 'var(--accent-color)';
  text.style.fontSize = '1.2rem';
  text.textContent = options.text;

  finalDiv.appendChild(title);
  finalDiv.appendChild(text);

  const container = queryRequired<HTMLDivElement>('.generator-container');
  container.innerHTML = '';
  container.appendChild(finalDiv);
}
