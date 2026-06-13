import React, { useMemo } from 'react';
import type { DisplaySettings } from '../utils/settingsManager';
import type { VariableChangeSummary } from '../utils/variableChanges';
import { Icons } from './Icons';
import { uiLogger } from '../utils/logger';
import VariableChangeBar from './VariableChangeBar';

interface GameContentProps {
  /** 主文本内容（完整的 AI 回复正文） */
  maintext?: string;
  /** 选项列表 */
  options: string[];
  /** 选项点击回调 */
  onSelectOption?: (option: string) => void;
  /** 显示设置 */
  settings?: DisplaySettings;
  /** 本轮变量变更摘要 */
  variableChanges?: VariableChangeSummary | null;
}

/**
 * 解析选项文本，提取序号和内容
 * 支持格式：A. xxx, B. xxx 等
 */
const parseOptionText = (option: string): { letter: string; text: string } => {
  const match = option.match(/^([A-Z])\.\s*(.*)$/);
  if (match) {
    return { letter: match[1], text: match[2] };
  }
  return { letter: '', text: option };
};

const normalizeMaintextForDisplay = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const STYLE_BLOCK_REGEX = /<style\b[\s\S]*?<\/style>/gi;
const STYLE_ONLY_HTML_REGEX = /^(?:\s*<!--[\s\S]*?-->\s*)*<style\b[\s\S]*?<\/style>\s*$/i;
const HTML_BLOCK_START_REGEX = /^(?:\s*<!--[\s\S]*?-->\s*)*(?:<style\b[\s\S]*?<\/style>\s*)*<(?:div|details|section|article|ul|ol|li|table|pre|blockquote|h[1-6]|p)\b/i;
const STYLE_BLOCK_TOKEN_PREFIX = '\uE000STYLE_BLOCK_';
const STYLE_BLOCK_TOKEN_SUFFIX = '\uE000';

function protectStyleBlocks(html: string): { protectedHtml: string; styleBlocks: string[] } {
  const styleBlocks: string[] = [];
  const protectedHtml = html.replace(STYLE_BLOCK_REGEX, match => {
    const token = `${STYLE_BLOCK_TOKEN_PREFIX}${styleBlocks.length}${STYLE_BLOCK_TOKEN_SUFFIX}`;
    styleBlocks.push(match);
    return token;
  });

  return { protectedHtml, styleBlocks };
}

function restoreStyleBlocks(html: string, styleBlocks: string[]): string {
  return html.replace(
    new RegExp(`${STYLE_BLOCK_TOKEN_PREFIX}(\\d+)${STYLE_BLOCK_TOKEN_SUFFIX}`, 'g'),
    (_, index: string) => styleBlocks[Number(index)] || '',
  );
}

/**
 * 游戏内容显示组件
 * 显示从楼层读取的内容：
 * - maintext（正文）：完整显示
 * - options（选项）：显示为可点击按钮
 * 
 * 武侠风格优化版
 */
const GameContent: React.FC<GameContentProps> = ({
  maintext,
  options,
  onSelectOption,
  settings,
  variableChanges,
}) => {
  // 调试日志 - 组件渲染
  uiLogger.log('');
  uiLogger.log('🎨 [GameContent] 组件渲染');
  uiLogger.log('   maintext 是否有值:', !!maintext);
  uiLogger.log('   maintext 长度:', maintext?.length || 0);
  uiLogger.log('   maintext 前 100 字符:', maintext?.substring(0, 100) || '(无内容)');
  uiLogger.log('   options 数量:', options.length);
  uiLogger.log('   options 内容:', options);
  uiLogger.log('   settings:', settings ? '有设置' : '无设置');

  // 计算内联样式（基于设置）
  const contentStyle = useMemo<React.CSSProperties>(() => settings ? {
      fontSize: `${settings.fontSize}px`,
      color: settings.fontColor,
      lineHeight: settings.lineHeight,
    } : {},
    [settings]
  );

  // 检测内容是否包含 HTML 标签
  const normalizedMaintext = useMemo(
    () => normalizeMaintextForDisplay(maintext || ''),
    [maintext],
  );
  const containsHTML = useMemo(() => /<[^>]+>/.test(normalizedMaintext), [normalizedMaintext]);
  uiLogger.log('   内容是否包含 HTML:', containsHTML);

  // 处理内容：如果包含 HTML 则保留，否则按行分割
  const renderedContent = useMemo(() => {
    if (!normalizedMaintext) return null;

    if (containsHTML) {
      // 内容包含 HTML，使用 dangerouslySetInnerHTML 渲染
      // 保留换行结构：将连续的换行转换为段落分隔，单个换行转换为 <br>
      const { protectedHtml, styleBlocks } = protectStyleBlocks(normalizedMaintext);
      const htmlContent = protectedHtml
        .split(/\n{2,}/) // 先按连续换行（段落分隔）分割
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph) // 过滤空段落
        .map(paragraph => {
          const restoredParagraph = restoreStyleBlocks(paragraph, styleBlocks);

          if (STYLE_ONLY_HTML_REGEX.test(restoredParagraph)) {
            return restoredParagraph;
          }

          const blockClass = HTML_BLOCK_START_REGEX.test(restoredParagraph) ? ' maintext-paragraph--html-block' : '';
          if (blockClass) {
            return `<div class="maintext-paragraph${blockClass}">${restoredParagraph}</div>`;
          }

          // 段落内的单个换行转换为 <br>
          const lines = restoredParagraph.split('\n').map(line => line.trim()).filter(line => line);
          return `<div class="maintext-paragraph">${lines.join('<br />')}</div>`;
        })
        .join('');
      return (
        <div
          className="maintext-html"
          style={contentStyle}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    } else {
      // 纯文本内容，按段落分割渲染（连续换行为段落分隔）
      const paragraphs = normalizedMaintext
        .split(/\n{2,}/) // 连续换行分割为段落
        .map(p => p.trim())
        .filter(p => p);
      
      return paragraphs.map((paragraph, pIndex) => {
        const lines = paragraph.split('\n').map(l => l.trim()).filter(l => l);
        return (
          <p key={pIndex} className="maintext-line" style={contentStyle}>
            {lines.map((line, lIndex) => (
              <React.Fragment key={lIndex}>
                {line}
                {lIndex < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      });
    }
  }, [containsHTML, contentStyle, normalizedMaintext]);

  const parsedOptions = useMemo(() =>
    options.map(option => ({
      option,
      ...parseOptionText(option),
    })),
    [options]
  );

  // 如果没有任何内容，显示占位符
  if (!maintext) {
    uiLogger.log('⚠️ [GameContent] maintext 为空，显示占位符');
    return (
      <div className="game-content-placeholder">
        <Icons.Scroll className="placeholder-icon" />
        <p className="placeholder-text">江湖风云，待你书写...</p>
      </div>
    );
  }

  uiLogger.log('✅ [GameContent] 渲染正文内容');

  return (
    <div className="game-content">
      {/* 主文本区域（完整显示，支持 HTML 渲染） */}
      {maintext && (
        <div className="maintext-container">
          <div className="maintext-content">
            {renderedContent}
          </div>
        </div>
      )}

      <VariableChangeBar summary={variableChanges || null} />

      {/* 选项区域 */}
      {options.length > 0 && (
        <div className="options-container">
          <div className="options-label">抉择时刻</div>
          <div className="options-list">
            {parsedOptions.map(({ option, letter, text }, index) => {
              return (
                <button
                  key={index}
                  className="option-btn"
                  onClick={() => onSelectOption?.(option)}
                >
                  {letter && <span className="option-letter">{letter}</span>}
                  <span className="option-text">{text || option}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameContent;
