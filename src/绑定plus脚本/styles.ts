/**
 * 用户设定脚本 - 样式定义
 */

import { PERSONA_BUTTON_ID, PERSONA_PANEL_ID } from './types';

// ==================== 样式定义 ====================

/**
 * 面板和按钮的 CSS 样式
 */
export const styles = `
<style>
  /* ===== 面板主容器 ===== */
  #${PERSONA_PANEL_ID} {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--SmartThemeBlurTintColor, rgba(26, 26, 46, 0.98));
    border: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    border-radius: 12px;
    z-index: 10000;
    width: 900px;
    height: 650px;
    max-width: 95vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
    font-family: var(--mainFontFamily, sans-serif);
    color: var(--SmartThemeBodyColor, #e0e0e0);
    backdrop-filter: blur(10px);
    overflow: hidden;
  }

  /* ===== 内容区域 ===== */
  #${PERSONA_PANEL_ID} .persona-tab-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ===== 标题区域 ===== */
  #${PERSONA_PANEL_ID} .persona-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    background: rgba(0, 0, 0, 0.2);
  }

  #${PERSONA_PANEL_ID} h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--SmartThemeBodyColor, #fff);
  }

  #${PERSONA_PANEL_ID} .persona-status-bar {
    font-size: 13px;
    opacity: 0.9;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .status-value {
    color: var(--SmartThemeEmColor, #a0a0ff);
    font-weight: bold;
  }

  /* ===== 全局操作区（默认用户人设绑定操作） ===== */
  #${PERSONA_PANEL_ID} .persona-global-actions {
    padding: 16px 20px;
    border-bottom: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    background: linear-gradient(135deg, rgba(218, 165, 32, 0.08), rgba(184, 134, 11, 0.05));
  }

  #${PERSONA_PANEL_ID} .global-actions-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
    color: #daa520;
  }

  #${PERSONA_PANEL_ID} .global-actions-icon {
    font-size: 18px;
  }

  #${PERSONA_PANEL_ID} .global-actions-label {
    color: #daa520;
  }

  #${PERSONA_PANEL_ID} .global-actions-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .global-action-btn {
    border: 1px solid #b8860b;
    background: linear-gradient(135deg, rgba(218, 165, 32, 0.15), rgba(184, 134, 11, 0.1));
    box-shadow: 0 0 0 1px rgba(218, 165, 32, 0.3), inset 0 0 10px rgba(218, 165, 32, 0.05);
    color: #ffd700;
    padding: 10px 16px;
  }

  #${PERSONA_PANEL_ID} .global-action-btn:hover {
    background: linear-gradient(135deg, rgba(218, 165, 32, 0.25), rgba(184, 134, 11, 0.2));
    border-color: #daa520;
    box-shadow: 0 0 0 2px rgba(218, 165, 32, 0.4), 0 4px 12px rgba(218, 165, 32, 0.2);
  }

  /* ===== 关闭按钮 ===== */
  #${PERSONA_PANEL_ID} .close-btn {
    cursor: pointer;
    font-size: 24px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    opacity: 0.9;
    color: rgba(248, 250, 252, 0.92);
    background: rgba(2, 6, 23, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.18);
    transition: all 0.2s ease;
  }

  #${PERSONA_PANEL_ID} .close-btn:hover {
    opacity: 1;
    color: #ffffff;
    background: rgba(226, 232, 240, 0.14);
    border-color: rgba(226, 232, 240, 0.28);
  }

  /* ===== 主内容区域 (双栏布局) ===== */
  #${PERSONA_PANEL_ID} .persona-content-wrapper {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* 左侧列表面板 */
  #${PERSONA_PANEL_ID} .persona-list-panel {
    width: 250px;
    background: rgba(0, 0, 0, 0.15);
    border-right: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    display: flex;
    flex-direction: column;
  }

  #${PERSONA_PANEL_ID} .panel-title {
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--SmartThemeBodyColor, #ccc);
    border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(74, 74, 106, 0.3));
  }

  #${PERSONA_PANEL_ID} .panel-title.compact {
    padding: 0;
    border-bottom: none;
    margin-bottom: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  #${PERSONA_PANEL_ID} .list-actions {
    padding: 8px;
    border-top: 1px solid var(--SmartThemeBorderColor, rgba(74, 74, 106, 0.3));
  }

  /* 右侧编辑面板 */
  #${PERSONA_PANEL_ID} .persona-edit-panel {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* ===== 列表项样式 ===== */
  #${PERSONA_PANEL_ID} .persona-list-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    margin-bottom: 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  #${PERSONA_PANEL_ID} .persona-list-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  #${PERSONA_PANEL_ID} .persona-list-item.active {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
  }

  #${PERSONA_PANEL_ID} .persona-list-item.is-default {
    background: rgba(0, 0, 0, 0.15);
  }

  #${PERSONA_PANEL_ID} .persona-list-item.is-default .item-name {
    color: #ffd700;
  }

  #${PERSONA_PANEL_ID} .persona-default-badge {
    font-size: 12px;
    margin-left: 4px;
  }

  /* ===== 人设头像样式 ===== */
  #${PERSONA_PANEL_ID} .item-avatar-wrapper {
    position: relative;
    width: 50px;
    height: 50px;
    flex-shrink: 0;
  }

  #${PERSONA_PANEL_ID} .item-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--SmartThemeBorderColor, #4a4a6a);
  }

  /* 默认人设的金圈 */
  #${PERSONA_PANEL_ID} .default-avatar-ring {
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    border: 2px solid #daa520;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(218, 165, 32, 0.3), 0 0 6px rgba(218, 165, 32, 0.4);
    pointer-events: none;
  }

  /* 列表项选中时的头像高亮 */
  #${PERSONA_PANEL_ID} .persona-list-item.active .item-avatar {
    border-color: rgba(255, 255, 255, 1);
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
  }
  
  #${PERSONA_PANEL_ID} .item-info {
    flex: 1;
    overflow: hidden;
  }
  
  #${PERSONA_PANEL_ID} .item-name {
    font-weight: 500;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  #${PERSONA_PANEL_ID} .item-desc {
    font-size: 11px;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== 表单样式 ===== */
  #${PERSONA_PANEL_ID} .form-group {
    margin-bottom: 16px;
  }
  
  #${PERSONA_PANEL_ID} label {
    display: block;
    font-size: 13px;
    opacity: 0.8;
    margin-bottom: 8px;
    font-weight: 500;
  }

  #${PERSONA_PANEL_ID} .persona-input,
  #${PERSONA_PANEL_ID} .persona-textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    color: var(--SmartThemeBodyColor, #e0e0e0);
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.2s ease;
    font-family: inherit;
  }
  
  #${PERSONA_PANEL_ID} .persona-textarea {
    min-height: 120px;
    resize: vertical;
    line-height: 1.5;
  }

  #${PERSONA_PANEL_ID} .persona-input:focus,
  #${PERSONA_PANEL_ID} .persona-textarea:focus {
    outline: none;
    border-color: var(--SmartThemeEmColor, #7a7aff);
    box-shadow: 0 0 0 2px rgba(122, 122, 255, 0.15);
  }

  /* ===== 按钮样式 ===== */
  #${PERSONA_PANEL_ID} .persona-btn {
    padding: 8px 14px;
    border-radius: 6px;
    background: var(--SmartThemeBlurTintColor, rgba(42, 42, 78, 0.8));
    border: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    color: var(--SmartThemeBodyColor, #e0e0e0);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  
  #${PERSONA_PANEL_ID} .persona-btn.small {
    padding: 4px 8px;
    font-size: 12px;
    width: 100%;
  }

  #${PERSONA_PANEL_ID} .persona-btn.small.persona-prompt-preview-btn,
  #${PERSONA_PANEL_ID} .persona-btn.small.persona-worldbook-entry-preview-btn {
    width: auto;
    min-width: 64px;
    padding: 2px 8px;
    min-height: 28px;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }

  #${PERSONA_PANEL_ID} .persona-btn:hover {
    background: var(--SmartThemeQuoteColor, rgba(100, 100, 150, 0.4));
    border-color: var(--SmartThemeEmColor, #7a7aaa);
  }
  
  #${PERSONA_PANEL_ID} .persona-btn.primary {
    background: linear-gradient(135deg, rgba(80, 120, 200, 0.6), rgba(100, 80, 180, 0.6));
    border-color: #5080c0;
    color: #fff;
    padding: 10px 20px;
  }
  
  #${PERSONA_PANEL_ID} .persona-btn.success {
    background: linear-gradient(135deg, rgba(60, 150, 100, 0.5), rgba(40, 120, 80, 0.5));
    border-color: #4cae4c;
    color: #fff;
    padding: 10px 20px;
  }

  /* ===== 动作条 ===== */
  #${PERSONA_PANEL_ID} .edit-actions-bar {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    justify-content: flex-end;
  }

  #${PERSONA_PANEL_ID} .persona-inline-search {
    flex: 1 1 auto;
    min-width: 0;
  }
  
  #${PERSONA_PANEL_ID} .quick-actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }

  /* ===== 分隔线 ===== */
  #${PERSONA_PANEL_ID} .persona-divider {
    border: none;
    border-top: 1px solid var(--SmartThemeBorderColor, rgba(74, 74, 106, 0.5));
    margin: 20px 0;
    width: 100%;
  }

  /* ===== 扩展菜单按钮 ===== */
  #${PERSONA_BUTTON_ID} {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  #${PERSONA_BUTTON_ID}:hover {
    background: var(--SmartThemeQuoteColor, rgba(100, 100, 150, 0.3));
  }

  #${PERSONA_BUTTON_ID}.active {
    background-color: #6a4a7e !important;
    color: #fff !important;
  }

  /* ===== 遮罩层 ===== */
  .persona-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    backdrop-filter: blur(2px);
  }

  .empty-list {
    text-align: center;
    padding: 20px;
    opacity: 0.5;
    font-size: 13px;
  }

  /* ===== 角色设定区域 ===== */
  #${PERSONA_PANEL_ID} .persona-traits-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-traits-section .panel-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .inline-actions {
    display: flex;
    gap: 8px;
    min-width: 240px;
  }

  #${PERSONA_PANEL_ID} .persona-traits-container {
    min-height: 0;
  }

  #${PERSONA_PANEL_ID} .persona-traits-md {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 16px;
    min-height: 440px;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-panel,
  #${PERSONA_PANEL_ID} .persona-folder-detail-panel {
    min-height: 0;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(9, 14, 24, 0.78);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-title {
    padding: 14px 16px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    font-size: 12px;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(226, 232, 240, 0.74);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    overflow-y: auto;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    padding: 6px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(255, 255, 255, 0.02);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-row:hover {
    border-color: rgba(125, 211, 252, 0.28);
    background: rgba(125, 211, 252, 0.08);
    transform: translateY(-1px);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-item {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: none;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-item:hover {
    background: transparent;
    transform: none;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-row.selected {
    border-color: rgba(125, 211, 252, 0.42);
    background: rgba(125, 211, 252, 0.12);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-name,
  #${PERSONA_PANEL_ID} .persona-folder-nav-meta {
    display: block;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-name {
    font-size: 13px;
    line-height: 1.45;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-meta {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.68);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 18px 20px 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    background: rgba(255, 255, 255, 0.02);
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-eyebrow {
    font-size: 11px;
    line-height: 1.4;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.88);
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-title {
    margin-top: 6px;
    font-size: 18px;
    line-height: 1.35;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-meta {
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.7);
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  #${PERSONA_PANEL_ID} .persona-folder-detail-list {
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
  }

  /* 角色设定条目 */
  #${PERSONA_PANEL_ID} .persona-trait-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    margin-bottom: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  #${PERSONA_PANEL_ID} .persona-trait-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  #${PERSONA_PANEL_ID} .persona-trait-item.enabled {
    border-color: rgba(160, 200, 120, 0.5);
  }

  #${PERSONA_PANEL_ID} .persona-folder-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    margin-bottom: 8px;
    background: rgba(90, 120, 170, 0.12);
    border-radius: 8px;
    border: 1px solid rgba(120, 160, 220, 0.35);
  }

  #${PERSONA_PANEL_ID} .persona-folder-item.auto-bound {
    border-color: rgba(228, 186, 74, 0.95);
    box-shadow: inset 3px 0 0 rgba(243, 201, 86, 0.95), 0 0 0 1px rgba(228, 186, 74, 0.35);
    background: rgba(168, 130, 30, 0.12);
  }

  #${PERSONA_PANEL_ID} .folder-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    opacity: 0.9;
  }

  #${PERSONA_PANEL_ID} .nested-trait {
    margin-left: 18px;
    border-left: 2px solid rgba(120, 160, 220, 0.3);
  }

  #${PERSONA_PANEL_ID} .persona-trait-item.auto-bound {
    border-left: 3px solid rgba(243, 201, 86, 0.95);
    box-shadow: inset 2px 0 0 rgba(243, 201, 86, 0.35);
  }

  #${PERSONA_PANEL_ID} .persona-trait-item.disabled {
    opacity: 0.5;
  }

  #${PERSONA_PANEL_ID} .trait-item-main {
    flex: 1;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID} .trait-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  #${PERSONA_PANEL_ID} .trait-item-state {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .trait-item-name {
    font-weight: 500;
    font-size: 14px;
  }

  #${PERSONA_PANEL_ID} .trait-toggle-checkbox {
    cursor: pointer;
    transform: scale(1.2);
  }

  #${PERSONA_PANEL_ID} .trait-item-desc {
    font-size: 12px;
    opacity: 0.7;
    white-space: normal;
    line-height: 1.65;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  #${PERSONA_PANEL_ID} .trait-item-actions {
    display: flex;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .trait-btn {
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    color: var(--SmartThemeBodyColor, #e0e0e0);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 12px;
  }

  #${PERSONA_PANEL_ID} .trait-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  #${PERSONA_PANEL_ID} .folder-bind-btn {
    min-width: 42px;
    text-align: center;
  }

  #${PERSONA_PANEL_ID} .folder-bind-btn.active {
    color: #ffd86a;
    border-color: rgba(243, 201, 86, 0.8);
    background: rgba(168, 130, 30, 0.28);
  }

  #${PERSONA_PANEL_ID} .trait-btn.delete:hover {
    background: rgba(200, 80, 80, 0.3);
    border-color: #c86060;
  }

  #${PERSONA_PANEL_ID} .state-tag {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 11px;
    line-height: 18px;
    border: 1px solid transparent;
  }

  #${PERSONA_PANEL_ID} .state-tag.manual {
    color: #9ad1ff;
    border-color: rgba(90, 170, 255, 0.4);
    background: rgba(90, 170, 255, 0.12);
  }

  #${PERSONA_PANEL_ID} .state-tag.auto {
    color: #9ef0af;
    border-color: rgba(120, 210, 130, 0.45);
    background: rgba(120, 210, 130, 0.14);
  }

  #${PERSONA_PANEL_ID} .state-tag.off {
    color: #bbb;
    border-color: rgba(180, 180, 180, 0.3);
    background: rgba(180, 180, 180, 0.08);
  }

  #${PERSONA_PANEL_ID} .persona-hint-row {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.8;
  }

  #${PERSONA_PANEL_ID} .profile-toolbar {
    display: grid;
    grid-template-columns: minmax(120px, 1.6fr) repeat(4, minmax(70px, 1fr));
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 8px;
  }

  #${PERSONA_PANEL_ID} .profile-select {
    min-width: 140px;
    padding: 7px 10px;
    min-height: 34px;
  }

  #${PERSONA_PANEL_ID} .text-note {
    font-size: 12px;
    line-height: 1.5;
    opacity: 0.85;
  }

  #${PERSONA_PANEL_ID} .persona-rules-container {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-rule-item {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(150, 150, 150, 0.2);
  }

  #${PERSONA_PANEL_ID} .rule-main {
    flex: 1;
    min-width: 0;
  }

  #${PERSONA_PANEL_ID} .rule-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .rule-name {
    font-size: 13px;
    font-weight: 600;
  }

  #${PERSONA_PANEL_ID} .rule-enable {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    opacity: 0.9;
  }

  #${PERSONA_PANEL_ID} .rule-pattern {
    margin-top: 6px;
    font-size: 12px;
    opacity: 0.85;
    word-break: break-all;
  }

  #${PERSONA_PANEL_ID} .rule-tags {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  #${PERSONA_PANEL_ID} .rule-tag {
    font-size: 11px;
    border-radius: 999px;
    padding: 1px 7px;
    border: 1px solid rgba(120, 120, 120, 0.4);
    background: rgba(255, 255, 255, 0.06);
  }

  #${PERSONA_PANEL_ID} .rule-actions {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  #${PERSONA_PANEL_ID} .compat-status-mini {
    margin-left: auto;
    font-size: 12px;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid transparent;
  }

  #${PERSONA_PANEL_ID} .compat-status-mini.ok {
    color: #99e0aa;
    border-color: rgba(80, 180, 90, 0.4);
    background: rgba(80, 180, 90, 0.15);
  }

  #${PERSONA_PANEL_ID} .compat-status-mini.warn {
    color: #ffd08f;
    border-color: rgba(220, 160, 60, 0.4);
    background: rgba(220, 160, 60, 0.14);
  }

  #${PERSONA_PANEL_ID} .persona-compat-details {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
  }

  #${PERSONA_PANEL_ID} .persona-plus-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 10px;
    margin-bottom: 12px;
  }

  #${PERSONA_PANEL_ID} .plus-probe-title {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.78;
    margin-bottom: 8px;
    letter-spacing: 0.02em;
  }

  #${PERSONA_PANEL_ID} .persona-plus-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .plus-probe-item {
    border-radius: 8px;
    border: 1px solid rgba(120, 120, 140, 0.28);
    background: rgba(0, 0, 0, 0.18);
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.5;
  }

  #${PERSONA_PANEL_ID} .plus-probe-item.ok {
    border-color: rgba(90, 170, 110, 0.35);
    background: rgba(70, 140, 80, 0.12);
  }

  #${PERSONA_PANEL_ID} .plus-probe-item.warn {
    border-color: rgba(200, 150, 60, 0.35);
    background: rgba(160, 120, 40, 0.12);
  }

  #${PERSONA_PANEL_ID} .plus-probe-meta {
    opacity: 0.78;
    word-break: break-word;
  }

  #${PERSONA_PANEL_ID} .plus-binding-row {
    border: 1px solid rgba(120, 120, 140, 0.25);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 10px;
    background: rgba(255, 255, 255, 0.03);
  }

  #${PERSONA_PANEL_ID} .plus-entry-checkbox-list {
    max-height: 180px;
    margin-top: 8px;
  }

  #${PERSONA_PANEL_ID} .plus-extension-patch-json {
    min-height: 110px;
    font-family: Consolas, Monaco, monospace;
  }

  #${PERSONA_PANEL_ID} .compat-item.ok {
    color: #9ad8a6;
  }

  #${PERSONA_PANEL_ID} .compat-item.warn {
    color: #f5cf8d;
  }

  #${PERSONA_PANEL_ID} .compat-item.danger {
    color: #ff9a9a;
  }

  #${PERSONA_PANEL_ID} .checkbox-list {
    max-height: 220px;
    overflow-y: auto;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid rgba(120, 120, 140, 0.4);
    background: rgba(0, 0, 0, 0.2);
  }

  #${PERSONA_PANEL_ID} .binding-group-checkbox-list {
    min-height: 96px;
  }

  #${PERSONA_PANEL_ID} .binding-group-multiselect {
    width: 100%;
    min-height: 168px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(120, 120, 140, 0.4);
    background: rgba(0, 0, 0, 0.2);
    color: #e2e8f0;
  }

  #${PERSONA_PANEL_ID} .binding-group-multiselect option {
    padding: 4px 6px;
  }

  #${PERSONA_PANEL_ID} .inline-check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
    font-size: 13px;
  }

  #${PERSONA_PANEL_ID} .two-col-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .binding-group-sections {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  #${PERSONA_PANEL_ID} .binding-group-header-meta {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.72);
    margin-top: 4px;
  }

  #${PERSONA_PANEL_ID} .binding-group-management-actions {
    flex-wrap: wrap;
  }

  #${PERSONA_PANEL_ID} .binding-group-top-actions {
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  #${PERSONA_PANEL_ID} .binding-group-empty-state {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  #${PERSONA_PANEL_ID} .snapshot-list {
    margin: 0;
    padding-left: 18px;
    max-height: 280px;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.7;
  }

  /* ===== Master-detail override ===== */
  #${PERSONA_PANEL_ID} {
    width: min(1380px, 96vw);
    height: min(860px, 94vh);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 22%),
      linear-gradient(135deg, rgba(12, 15, 22, 0.98), rgba(24, 29, 40, 0.98));
    border-color: rgba(150, 162, 190, 0.28);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  #${PERSONA_PANEL_ID} .persona-content-wrapper {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(380px, 440px) minmax(0, 1fr);
    gap: 0;
  }

  #${PERSONA_PANEL_ID} .persona-list-panel {
    width: auto;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid rgba(148, 162, 184, 0.16);
    background:
      radial-gradient(circle at top, rgba(148, 163, 184, 0.12), transparent 34%),
      linear-gradient(180deg, rgba(12, 15, 22, 0.94), rgba(20, 24, 35, 0.98));
    padding: 18px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-body {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: 128px minmax(240px, 1fr);
    gap: 0;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-edit-panel {
    min-width: 0;
    min-height: 0;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      radial-gradient(circle at top right, rgba(91, 115, 161, 0.15), transparent 26%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 18%);
  }

  #${PERSONA_PANEL_ID} .persona-detail-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 12px;
    min-height: 0;
  }

  #${PERSONA_PANEL_ID} .persona-detail-toolbar,
  #${PERSONA_PANEL_ID} .persona-page-card {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 22%),
      rgba(9, 12, 18, 0.74);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  #${PERSONA_PANEL_ID} .persona-detail-toolbar {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  #${PERSONA_PANEL_ID} .persona-detail-toolbar-primary {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .persona-mobile-drawer-toggle-btn,
  #${PERSONA_PANEL_ID} .persona-mobile-folder-toggle-btn,
  #${PERSONA_PANEL_ID} .persona-drawer-backdrop,
  #${PERSONA_PANEL_ID} .persona-folder-mobile-drawer,
  #${PERSONA_PANEL_ID} .persona-folder-mobile-drawer-backdrop {
    display: none;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-subtitle,
  #${PERSONA_PANEL_ID} .persona-workspace-note,
  #${PERSONA_PANEL_ID} .persona-detail-meta {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.72);
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-header,
  #${PERSONA_PANEL_ID} .persona-workspace-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-title {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-tools,
  #${PERSONA_PANEL_ID} .persona-detail-actions,
  #${PERSONA_PANEL_ID} .persona-workspace-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  #${PERSONA_PANEL_ID} .persona-detail-actions {
    justify-content: flex-end;
    flex: 1;
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav,
  #${PERSONA_PANEL_ID} .persona-sidebar-secondary {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav {
    padding-right: 12px;
    border-right: 1px solid rgba(148, 163, 184, 0.12);
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    text-align: center;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    padding: 10px 12px;
    color: rgba(241, 245, 249, 0.84);
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: all 0.18s ease;
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item:hover,
  #${PERSONA_PANEL_ID} .persona-resource-nav-item.active {
    border-color: rgba(248, 250, 252, 0.6);
    background: linear-gradient(135deg, rgba(125, 211, 252, 0.14), rgba(255, 255, 255, 0.04));
    color: #fff;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-secondary {
    flex: 1;
    overflow: hidden;
    padding-left: 14px;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-secondary > .panel-title,
  #${PERSONA_PANEL_ID} .persona-sidebar-secondary > .persona-sidebar-section-note,
  #${PERSONA_PANEL_ID} .persona-sidebar-secondary > .persona-sidebar-tools {
    flex: 0 0 auto;
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-section-note,
  #${PERSONA_PANEL_ID} .persona-index-item-meta {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.68);
  }

  #${PERSONA_PANEL_ID} .persona-search-input {
    flex: 1;
    min-width: 0;
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-selection {
    min-width: 0;
    flex: 0 1 340px;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-selection.active {
    padding: 0 2px;
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-binding-lines {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-binding-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-binding-line.selected {
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(59, 130, 246, 0.14);
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-binding-key {
    flex: 0 0 56px;
    font-size: 12px;
    line-height: 1.4;
    color: rgba(226, 232, 240, 0.68);
  }

  #${PERSONA_PANEL_ID} .persona-toolbar-binding-value {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    line-height: 1.3;
    font-weight: 600;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-index-item {
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    padding: 9px 11px;
    background: rgba(255, 255, 255, 0.02);
  }

  #${PERSONA_PANEL_ID} .persona-index-item.selected {
    border-color: rgba(248, 250, 252, 0.45);
    background: rgba(125, 211, 252, 0.1);
  }

  #${PERSONA_PANEL_ID} .persona-index-item.interactive {
    cursor: pointer;
    transition: all 0.18s ease;
  }

  #${PERSONA_PANEL_ID} .persona-index-item.interactive:hover {
    border-color: rgba(125, 211, 252, 0.4);
    background: rgba(125, 211, 252, 0.08);
  }

  #${PERSONA_PANEL_ID} .persona-index-item-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-page-tab {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 999px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(241, 245, 249, 0.78);
    cursor: pointer;
    transition: all 0.18s ease;
    font-size: 13px;
    line-height: 1;
  }

  #${PERSONA_PANEL_ID} .persona-page-tab:hover,
  #${PERSONA_PANEL_ID} .persona-page-tab.active {
    border-color: rgba(248, 250, 252, 0.56);
    color: #fff;
    background: rgba(125, 211, 252, 0.14);
  }

  #${PERSONA_PANEL_ID} .persona-page-panel {
    display: none;
    gap: 16px;
  }

  #${PERSONA_PANEL_ID} .persona-page-panel.active {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-page-bodies {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 12px;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-page-card {
    padding: 16px;
  }

  #${PERSONA_PANEL_ID} .persona-resource-summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .persona-resource-name {
    font-size: 22px;
    line-height: 1.2;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-resource-name.persona-resource-name-compact {
    font-size: 18px;
    line-height: 1.35;
  }

  #${PERSONA_PANEL_ID} .persona-resource-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  #${PERSONA_PANEL_ID} .persona-embedded-detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(255, 255, 255, 0.025);
  }

  #${PERSONA_PANEL_ID} .persona-detail-section-title {
    font-size: 12px;
    line-height: 1.5;
    font-weight: 700;
    color: rgba(226, 232, 240, 0.8);
  }

  #${PERSONA_PANEL_ID} .persona-detail-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-detail-list-item {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(255, 255, 255, 0.02);
  }

  #${PERSONA_PANEL_ID} .persona-detail-list-title {
    font-size: 13px;
    line-height: 1.45;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-detail-list-meta,
  #${PERSONA_PANEL_ID} .persona-detail-list-preview {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.72);
  }

  #${PERSONA_PANEL_ID} .persona-resource-meta-line,
  #${PERSONA_PANEL_ID} .persona-binding-item-meta {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.72);
  }

  #${PERSONA_PANEL_ID} .persona-binding-inline-status {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(255, 255, 255, 0.025);
  }

  #${PERSONA_PANEL_ID} .persona-binding-inline-label {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.68);
  }

  #${PERSONA_PANEL_ID} .persona-binding-inline-value {
    font-size: 14px;
    line-height: 1.5;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-binding-inline-meta {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.72);
  }

  #${PERSONA_PANEL_ID} .persona-binding-item-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  #${PERSONA_PANEL_ID} .persona-binding-item-list.compact {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-binding-item {
    min-width: 210px;
    max-width: 280px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  #${PERSONA_PANEL_ID} .persona-binding-item:hover,
  #${PERSONA_PANEL_ID} .persona-binding-item.active {
    background: rgba(125, 211, 252, 0.09);
    border-color: rgba(125, 211, 252, 0.36);
  }

  #${PERSONA_PANEL_ID} .persona-binding-item-list.compact .persona-binding-item {
    min-width: 0;
    max-width: none;
    padding: 10px 12px;
  }

  #${PERSONA_PANEL_ID} .persona-prompt-check-card,
  #${PERSONA_PANEL_ID} .persona-worldbook-entry-check-card {
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
  }

  #${PERSONA_PANEL_ID} .persona-binding-item-title {
    font-size: 14px;
    line-height: 1.35;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }

  #${PERSONA_PANEL_ID} .persona-json-preview {
    margin: 0;
    padding: 12px;
    max-height: 220px;
    overflow: auto;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(3, 7, 18, 0.45);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  #${PERSONA_PANEL_ID} .persona-page-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  #${PERSONA_PANEL_ID} .persona-binding-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  #${PERSONA_PANEL_ID} .persona-empty-card {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
  }

  #${PERSONA_PANEL_ID} .persona-list-container {
    padding: 4px 0 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
  }

  #${PERSONA_PANEL_ID} .persona-list-item {
    margin-bottom: 8px;
    padding: 10px;
    border-radius: 14px;
    border-color: rgba(148, 163, 184, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }

  #${PERSONA_PANEL_ID} .persona-list-item.active {
    border: 1px solid rgba(248, 250, 252, 0.7);
    background: linear-gradient(135deg, rgba(125, 211, 252, 0.16), rgba(255, 255, 255, 0.05));
    box-shadow: none;
  }

  #${PERSONA_PANEL_ID} .panel-title {
    padding: 0 0 10px;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  #${PERSONA_PANEL_ID} .standoutHeader {
    font-size: 18px;
    line-height: 1.2;
    font-weight: 700;
    color: #f8fafc;
  }

  #${PERSONA_PANEL_ID} .persona-btn {
    min-height: 36px;
    padding: 8px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(148, 163, 184, 0.22);
  }

  #${PERSONA_PANEL_ID} .persona-btn:hover {
    background: rgba(125, 211, 252, 0.1);
    border-color: rgba(125, 211, 252, 0.38);
  }

  /* ===== 编辑弹窗 ===== */
  .pool-edit-modal {
    position: fixed;
    inset: 0;
    z-index: 10001;
    display: flex;
    width: 100vw;
    height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    isolation: isolate;
  }

  .pool-edit-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1;
  }

  .pool-edit-content {
    position: relative;
    z-index: 2;
    background: var(--SmartThemeBlurTintColor, rgba(26, 26, 46, 0.98));
    border: 1px solid var(--SmartThemeBorderColor, #4a4a6a);
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .pool-edit-content h3 {
    margin: 0 0 20px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .pool-edit-content .persona-textarea {
    min-height: 150px;
  }

  .pool-edit-content .form-group {
    margin-bottom: 16px;
  }

  .pool-edit-content label {
    display: block;
    font-size: 13px;
    opacity: 0.86;
    margin-bottom: 8px;
    font-weight: 500;
    color: rgba(226, 232, 240, 0.88);
  }

  .pool-edit-content .persona-input,
  .pool-edit-content .persona-textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(7, 12, 22, 0.92);
    border: 1px solid rgba(80, 110, 160, 0.22);
    color: #e2e8f0;
    font-size: 14px;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    font-family: inherit;
    position: relative;
    z-index: 3;
    pointer-events: auto;
  }

  .pool-edit-content .persona-textarea {
    resize: vertical;
    line-height: 1.6;
  }

  .pool-edit-content .persona-input:focus,
  .pool-edit-content .persona-textarea:focus {
    outline: none;
    background: rgba(10, 16, 29, 0.98);
    border-color: rgba(125, 211, 252, 0.5);
    box-shadow: 0 0 0 2px rgba(125, 211, 252, 0.14);
  }

  .pool-edit-content .persona-btn {
    min-height: 38px;
    padding: 8px 14px;
    border-radius: 10px;
    background: rgba(8, 13, 24, 0.96);
    border: 1px solid rgba(80, 110, 160, 0.24);
    color: #e2e8f0;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;
    z-index: 3;
    pointer-events: auto;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .pool-edit-content .persona-btn:hover {
    color: #ffffff;
    background: rgba(25, 42, 70, 0.92);
    border-color: rgba(125, 211, 252, 0.32);
    transform: translateY(-1px);
  }

  .pool-edit-content .persona-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .pool-edit-content .edit-actions-bar {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    align-items: center;
  }

  .pool-edit-content.persona-modal-content {
    width: min(1120px, calc(100vw - 32px));
    max-height: min(92vh, 900px);
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background:
      linear-gradient(180deg, rgba(9, 14, 24, 0.99), rgba(17, 24, 39, 0.97)),
      var(--SmartThemeBlurTintColor, rgba(26, 26, 46, 0.98));
    border-color: rgba(90, 110, 150, 0.36);
    box-shadow: 0 28px 72px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(148, 163, 184, 0.08);
  }

  .pool-edit-content.persona-modal-content .edit-actions-bar {
    margin-top: 0;
    padding: 18px 24px 24px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(5, 9, 17, 0.9);
  }

  .persona-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    padding: 24px 24px 18px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
    background: linear-gradient(180deg, rgba(36, 52, 84, 0.46), rgba(10, 15, 26, 0.18));
  }

  .persona-modal-eyebrow {
    font-size: 11px;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.9);
  }

  .persona-modal-subtitle {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.72);
  }

  .persona-modal-stat {
    min-width: 180px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(8, 12, 21, 0.78);
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .persona-modal-stat span {
    font-size: 12px;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.7);
  }

  .persona-modal-stat strong {
    font-size: 15px;
    line-height: 1.4;
    color: #f8fafc;
  }

  .persona-modal-grid {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }

  .persona-import-grid {
    grid-template-columns: minmax(0, 1.35fr) 320px;
  }

  .persona-modal-sidebar,
  .persona-modal-main {
    min-height: 0;
    padding: 20px 24px 24px;
  }

  .persona-modal-sidebar {
    border-right: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(6, 10, 18, 0.88);
    overflow-y: auto;
  }

  .persona-modal-main {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: rgba(10, 15, 26, 0.72);
  }

  .persona-modal-tip-card {
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(80, 110, 160, 0.22);
    background: rgba(9, 14, 24, 0.9);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .persona-modal-tip-card + .persona-modal-tip-card {
    margin-top: 12px;
  }

  .persona-modal-tip-title,
  .persona-modal-section-title {
    font-size: 13px;
    line-height: 1.5;
    font-weight: 700;
    color: #f8fafc;
  }

  .persona-modal-tip-copy,
  .persona-modal-section-note {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.7;
    color: rgba(226, 232, 240, 0.72);
  }

  .persona-modal-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }

  .persona-modal-toolbar-copy {
    min-width: 0;
  }

  .persona-modal-toolbar-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .persona-modal-search {
    margin-bottom: 0;
  }

  .persona-modal-checkbox-list {
    min-height: 0;
    max-height: 440px;
    overflow-y: auto;
    padding-right: 4px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .persona-modal-check-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(80, 110, 160, 0.18);
    background: rgba(7, 12, 22, 0.88);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .persona-modal-check-card:hover {
    background: rgba(25, 42, 70, 0.84);
    border-color: rgba(125, 211, 252, 0.3);
    transform: translateY(-1px);
  }

  .persona-modal-check-card input[type='checkbox'] {
    margin-top: 3px;
    transform: scale(1.1);
  }

  .persona-modal-check-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .persona-modal-check-title {
    font-size: 13px;
    line-height: 1.45;
    font-weight: 700;
    color: #f8fafc;
  }

  .persona-modal-check-desc {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.72);
  }

  .persona-modal-empty {
    margin-top: 12px;
  }

  .persona-import-textarea {
    min-height: 260px !important;
  }

  .persona-import-status {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(8, 12, 21, 0.82);
    font-size: 12px;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.78);
  }

  .persona-import-status.success {
    border-color: rgba(134, 239, 172, 0.34);
    background: rgba(34, 197, 94, 0.1);
    color: #dcfce7;
  }

  .persona-import-status.error {
    border-color: rgba(252, 165, 165, 0.34);
    background: rgba(239, 68, 68, 0.1);
    color: #fee2e2;
  }

  .persona-import-preview {
    margin-top: 16px;
    min-height: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .persona-modal-code {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(3, 7, 18, 0.45);
    color: rgba(226, 232, 240, 0.84);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ===== 绑定plus 主题系统 ===== */
  #${PERSONA_PANEL_ID},
  .bindingplus-theme-scope {
    --bp-panel-bg: #101826;
    --bp-panel-bg-secondary: #152133;
    --bp-card-bg: #1c2b40;
    --bp-card-bg-strong: #223554;
    --bp-text-primary: #edf4ff;
    --bp-text-secondary: #b5c5dd;
    --bp-accent: #48b9ff;
    --bp-accent-hover: #79ccff;
    --bp-border: rgba(116, 147, 192, 0.34);
    --bp-input-bg: #0f1826;
    --bp-input-border: rgba(98, 132, 180, 0.36);
    --bp-button-bg: #13243b;
    --bp-button-border: rgba(98, 132, 180, 0.4);
    --bp-button-text: #edf4ff;
    --bp-button-hover-bg: #1b3657;
    --bp-button-hover-border: rgba(72, 185, 255, 0.46);
    --bp-selected-bg: rgba(72, 185, 255, 0.18);
    --bp-selected-border: rgba(72, 185, 255, 0.68);
    --bp-hover-bg: rgba(72, 185, 255, 0.1);
    --bp-success: #38b38a;
    --bp-warning: #f0b24d;
    --bp-danger: #ea6a7a;
    --bp-overlay-bg: rgba(7, 11, 18, 0.76);
    --bp-code-bg: rgba(7, 13, 23, 0.72);
    --bp-code-border: rgba(116, 147, 192, 0.26);
  }

  #persona-overlay.bindingplus-theme-scope,
  .bindingplus-theme-scope .pool-edit-overlay {
    background: var(--bp-overlay-bg);
  }

  #${PERSONA_PANEL_ID} {
    background: var(--bp-panel-bg);
    border-color: var(--bp-border);
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-list-panel,
  #${PERSONA_PANEL_ID} .persona-edit-panel,
  #${PERSONA_PANEL_ID} .persona-resource-nav,
  #${PERSONA_PANEL_ID} .persona-sidebar-secondary,
  #${PERSONA_PANEL_ID} .persona-sidebar-header,
  #${PERSONA_PANEL_ID} .persona-detail-toolbar,
  #${PERSONA_PANEL_ID} .persona-toolbar-selection,
  #${PERSONA_PANEL_ID} .persona-folder-nav-panel,
  #${PERSONA_PANEL_ID} .persona-folder-detail-panel,
  #${PERSONA_PANEL_ID} .persona-page-card,
  #${PERSONA_PANEL_ID} .persona-index-group,
  .bindingplus-theme-scope .pool-edit-content,
  .bindingplus-theme-scope .persona-modal-header,
  .bindingplus-theme-scope .persona-modal-sidebar,
  .bindingplus-theme-scope .persona-modal-main,
  .bindingplus-theme-scope .persona-modal-toolbar,
  .bindingplus-theme-scope .edit-actions-bar,
  .bindingplus-theme-scope .persona-modal-tip-card,
  .bindingplus-theme-scope .persona-modal-check-card,
  .bindingplus-theme-scope .persona-import-status,
  .bindingplus-theme-scope .persona-modal-stat {
    background: var(--bp-panel-bg-secondary);
    border-color: var(--bp-border);
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-page-card,
  #${PERSONA_PANEL_ID} .persona-folder-detail-panel,
  #${PERSONA_PANEL_ID} .persona-folder-nav-panel,
  #${PERSONA_PANEL_ID} .persona-toolbar-selection,
  #${PERSONA_PANEL_ID} .persona-index-item,
  #${PERSONA_PANEL_ID} .persona-list-item,
  #${PERSONA_PANEL_ID} .persona-trait-item,
  .bindingplus-theme-scope .persona-modal-tip-card,
  .bindingplus-theme-scope .persona-modal-check-card,
  .bindingplus-theme-scope .persona-import-status,
  .bindingplus-theme-scope .persona-modal-code {
    background: var(--bp-card-bg);
    border-color: var(--bp-border);
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-title,
  #${PERSONA_PANEL_ID} .standoutHeader,
  #${PERSONA_PANEL_ID} .panel-title,
  #${PERSONA_PANEL_ID} .persona-folder-detail-title,
  #${PERSONA_PANEL_ID} .persona-index-item-title,
  #${PERSONA_PANEL_ID} .persona-toolbar-binding-value,
  .bindingplus-theme-scope h3,
  .bindingplus-theme-scope label,
  .bindingplus-theme-scope strong {
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-sidebar-subtitle,
  #${PERSONA_PANEL_ID} .persona-sidebar-section-note,
  #${PERSONA_PANEL_ID} .persona-toolbar-binding-key,
  #${PERSONA_PANEL_ID} .persona-folder-detail-eyebrow,
  #${PERSONA_PANEL_ID} .persona-folder-detail-meta,
  #${PERSONA_PANEL_ID} .persona-index-item-meta,
  #${PERSONA_PANEL_ID} .persona-hint-row,
  #${PERSONA_PANEL_ID} .text-note,
  .bindingplus-theme-scope .persona-modal-subtitle,
  .bindingplus-theme-scope .persona-modal-tip-copy,
  .bindingplus-theme-scope .persona-modal-check-desc,
  .bindingplus-theme-scope .persona-modal-stat span {
    color: var(--bp-text-secondary);
  }

  #${PERSONA_PANEL_ID} .persona-input,
  #${PERSONA_PANEL_ID} .persona-textarea,
  .bindingplus-theme-scope .persona-input,
  .bindingplus-theme-scope .persona-textarea {
    background: var(--bp-input-bg);
    border-color: var(--bp-input-border);
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-input:focus,
  #${PERSONA_PANEL_ID} .persona-textarea:focus,
  .bindingplus-theme-scope .persona-input:focus,
  .bindingplus-theme-scope .persona-textarea:focus {
    background: var(--bp-input-bg);
    border-color: var(--bp-accent);
    box-shadow: 0 0 0 2px rgba(72, 185, 255, 0.16);
  }

  #${PERSONA_PANEL_ID} .persona-btn,
  #${PERSONA_PANEL_ID} .close-btn,
  .bindingplus-theme-scope .persona-btn {
    background: var(--bp-button-bg);
    border-color: var(--bp-button-border);
    color: var(--bp-button-text);
  }

  #${PERSONA_PANEL_ID} .persona-btn:hover,
  #${PERSONA_PANEL_ID} .close-btn:hover,
  .bindingplus-theme-scope .persona-btn:hover {
    background: var(--bp-button-hover-bg);
    border-color: var(--bp-button-hover-border);
    color: var(--bp-button-text);
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item {
    color: var(--bp-text-secondary);
  }

  #${PERSONA_PANEL_ID} .persona-btn.primary,
  .bindingplus-theme-scope .persona-btn.primary {
    background: var(--bp-accent);
    border-color: var(--bp-accent);
    color: #ffffff;
  }

  #${PERSONA_PANEL_ID} .persona-btn.primary:hover,
  .bindingplus-theme-scope .persona-btn.primary:hover {
    background: var(--bp-accent-hover);
    border-color: var(--bp-accent-hover);
    color: #ffffff;
  }

  #${PERSONA_PANEL_ID} .persona-btn.success,
  .bindingplus-theme-scope .persona-btn.success {
    background: var(--bp-success);
    border-color: var(--bp-success);
    color: #ffffff;
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item:hover,
  #${PERSONA_PANEL_ID} .persona-folder-nav-item:hover,
  #${PERSONA_PANEL_ID} .persona-index-item.interactive:hover,
  #${PERSONA_PANEL_ID} .persona-list-item:hover,
  #${PERSONA_PANEL_ID} .persona-trait-item:hover,
  .bindingplus-theme-scope .persona-modal-check-card:hover {
    background: var(--bp-hover-bg);
    border-color: var(--bp-button-hover-border);
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item:hover,
  #${PERSONA_PANEL_ID} .persona-resource-nav-item.active {
    color: var(--bp-text-primary);
  }

  #${PERSONA_PANEL_ID} .persona-resource-nav-item.active,
  #${PERSONA_PANEL_ID} .persona-folder-nav-item.active,
  #${PERSONA_PANEL_ID} .persona-index-item.selected,
  #${PERSONA_PANEL_ID} .persona-toolbar-binding-line.selected,
  #${PERSONA_PANEL_ID} .persona-list-item.active,
  #${PERSONA_PANEL_ID} .persona-trait-item.enabled {
    background: var(--bp-selected-bg);
    border-color: var(--bp-selected-border);
  }

  #${PERSONA_PANEL_ID} .persona-folder-nav-actions,
  #${PERSONA_PANEL_ID} .persona-folder-nav-action,
  #${PERSONA_PANEL_ID} .trait-btn,
  .bindingplus-theme-scope .trait-btn {
    border-color: var(--bp-button-border);
    color: var(--bp-text-secondary);
  }

  #${PERSONA_PANEL_ID} .compat-item.ok {
    border-color: rgba(56, 179, 138, 0.34);
    background: rgba(56, 179, 138, 0.12);
    color: var(--bp-success);
  }

  #${PERSONA_PANEL_ID} .compat-item.warn {
    border-color: rgba(240, 178, 77, 0.34);
    background: rgba(240, 178, 77, 0.12);
    color: var(--bp-warning);
  }

  #${PERSONA_PANEL_ID} .compat-item.danger,
  .bindingplus-theme-scope .persona-import-status.error {
    border-color: rgba(234, 106, 122, 0.34);
    background: rgba(234, 106, 122, 0.12);
    color: var(--bp-danger);
  }

  .bindingplus-theme-scope .persona-import-status.success {
    border-color: rgba(56, 179, 138, 0.34);
    background: rgba(56, 179, 138, 0.12);
    color: var(--bp-success);
  }

  .bindingplus-theme-scope .persona-modal-code {
    background: var(--bp-code-bg);
    border-color: var(--bp-code-border);
    color: var(--bp-text-primary);
  }

  .bindingplus-theme-card .bindingplus-theme-summary {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .bindingplus-theme-card .bindingplus-theme-current {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bindingplus-theme-card .bindingplus-theme-current-title {
    font-size: 15px;
    line-height: 1.5;
    font-weight: 700;
    color: var(--bp-text-primary);
  }

  .bindingplus-theme-card .bindingplus-theme-current-note,
  .bindingplus-theme-card .bindingplus-theme-help {
    color: var(--bp-text-secondary);
  }

  .bindingplus-theme-card .bindingplus-theme-top-grid {
    align-items: end;
  }

  .bindingplus-theme-card .bindingplus-theme-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .bindingplus-theme-card .bindingplus-theme-group + .bindingplus-theme-group {
    margin-top: 16px;
  }

  .bindingplus-theme-card .bindingplus-theme-group-title {
    margin-bottom: 10px;
    font-size: 12px;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--bp-text-secondary);
  }

  .bindingplus-theme-card .bindingplus-theme-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .bindingplus-theme-card .bindingplus-theme-preset-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--bp-button-border);
    background: var(--bp-button-bg);
    color: var(--bp-button-text);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
  }

  .bindingplus-theme-card .bindingplus-theme-preset-chip:hover {
    background: var(--bp-button-hover-bg);
    border-color: var(--bp-button-hover-border);
    transform: translateY(-1px);
  }

  .bindingplus-theme-card .bindingplus-theme-preset-chip.active {
    background: var(--bp-selected-bg);
    border-color: var(--bp-selected-border);
  }

  .bindingplus-theme-card .bindingplus-theme-swatch {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    flex: 0 0 auto;
  }

  .bindingplus-theme-card .bindingplus-theme-color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
    margin-top: 8px;
  }

  .bindingplus-theme-card .bindingplus-theme-color-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--bp-border);
    background: var(--bp-card-bg);
  }

  .bindingplus-theme-card .bindingplus-theme-color-field span {
    font-size: 12px;
    line-height: 1.5;
    color: var(--bp-text-secondary);
  }

  .bindingplus-theme-card .bindingplus-theme-color-input {
    width: 100%;
    min-height: 42px;
    border: 1px solid var(--bp-input-border);
    border-radius: 10px;
    background: var(--bp-input-bg);
    padding: 4px;
    cursor: pointer;
  }

  .bindingplus-theme-card .bindingplus-theme-color-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] {
    position: fixed;
    inset: 0;
    top: 0;
    left: 0;
    transform: none;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
    margin: 0;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-content-wrapper {
    position: relative;
    display: block;
    height: 100%;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-drawer-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 24;
    border: none;
    padding: 0;
    margin: 0;
    background: rgba(0, 0, 0, 0.56);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'].drawer-open .persona-drawer-backdrop {
    opacity: 1;
    pointer-events: auto;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-list-panel {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 32;
    width: min(88vw, 420px);
    min-width: 0;
    max-height: none;
    border-right: 1px solid rgba(148, 162, 184, 0.16);
    border-bottom: none;
    transform: translateX(-104%);
    transition: transform 0.22s ease;
    box-shadow: 18px 0 40px rgba(0, 0, 0, 0.34);
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'].drawer-open .persona-list-panel {
    transform: translateX(0);
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-sidebar-body {
    grid-template-columns: 112px minmax(0, 1fr);
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-edit-panel {
    height: 100%;
    padding: 12px;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-shell {
    min-height: 0;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-toolbar {
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-toolbar-primary {
    width: 100%;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-mobile-drawer-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-height: 42px;
    padding-inline: 14px;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-toolbar-selection {
    flex: 1 1 auto;
    min-height: 48px;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-actions {
    width: 100%;
    justify-content: stretch;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-actions .persona-btn {
    flex: 1 1 calc(50% - 6px);
    min-height: 42px;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-page-grid,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .profile-toolbar,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .two-col-grid,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-plus-grid,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .bindingplus-theme-top-grid {
    grid-template-columns: 1fr;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .inline-actions {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-traits-md {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-nav-panel {
    display: none;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-detail-header {
    align-items: center;
    flex-wrap: wrap;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-mobile-folder-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-detail-tools {
    width: 100%;
    justify-content: space-between;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-detail-panel {
    position: relative;
    overflow: hidden;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-mobile-drawer-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 4;
    background: rgba(0, 0, 0, 0.46);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-mobile-drawer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    max-height: min(56vh, 420px);
    padding: 14px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    background:
      linear-gradient(180deg, rgba(11, 16, 26, 0.98), rgba(17, 24, 39, 0.98));
    transform: translateY(-104%);
    transition: transform 0.22s ease;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'].folder-drawer-open .persona-folder-mobile-drawer-backdrop {
    opacity: 1;
    pointer-events: auto;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'].folder-drawer-open .persona-folder-mobile-drawer {
    transform: translateY(0);
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-mobile-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-mobile-drawer-title {
    font-size: 12px;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.74);
  }

  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-folder-mobile-drawer-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
  }

  .pool-edit-modal.bindingplus-mobile-modal {
    inset: 0;
    top: 0;
    left: 0;
    transform: none;
    width: 100dvw;
    height: 100dvh;
    min-height: 100dvh;
    padding: 0;
    align-items: flex-start;
    justify-content: flex-start;
    overflow-y: auto;
  }

  .pool-edit-modal.bindingplus-mobile-modal .pool-edit-content {
    width: 100dvw;
    min-width: 0;
    max-width: none;
    height: auto;
    min-height: 0;
    max-height: none;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    margin: 0;
  }

  .pool-edit-modal.bindingplus-mobile-modal .pool-edit-content.persona-modal-content {
    width: 100dvw;
    max-height: none;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-modal-header {
    flex-direction: column;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-modal-grid,
  .pool-edit-modal.bindingplus-mobile-modal .persona-import-grid {
    grid-template-columns: 1fr;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-modal-sidebar {
    border-right: none;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    order: 2;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-modal-toolbar {
    flex-direction: column;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-modal-toolbar-actions,
  .pool-edit-modal.bindingplus-mobile-modal .edit-actions-bar {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .pool-edit-modal.bindingplus-mobile-modal .edit-actions-bar .persona-btn {
    flex: 1 1 calc(50% - 6px);
    min-height: 42px;
  }

  #${PERSONA_PANEL_ID} .persona-detail-list-header,
  #${PERSONA_PANEL_ID} .persona-prompt-check-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  #${PERSONA_PANEL_ID} .persona-detail-list-header > div,
  #${PERSONA_PANEL_ID} .persona-prompt-check-header > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  #${PERSONA_PANEL_ID} .persona-prompt-check-header .persona-btn,
  #${PERSONA_PANEL_ID} .persona-detail-list-header .persona-btn {
    flex-shrink: 0;
  }

  #${PERSONA_PANEL_ID} .persona-prompt-checkbox-list,
  #${PERSONA_PANEL_ID} #persona-worldbook-entry-checkboxes {
    gap: 6px;
  }

  #${PERSONA_PANEL_ID} .persona-check-title-block {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  #${PERSONA_PANEL_ID} .persona-check-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  #${PERSONA_PANEL_ID} .persona-check-title-row .persona-modal-check-title {
    min-width: 0;
  }

  #${PERSONA_PANEL_ID} .persona-prompt-check-card input[type='checkbox'],
  #${PERSONA_PANEL_ID} .persona-worldbook-entry-check-card input[type='checkbox'] {
    margin: 0;
    flex-shrink: 0;
  }

  #${PERSONA_PANEL_ID} .persona-prompt-check-header .persona-btn.small,
  #${PERSONA_PANEL_ID} .persona-detail-list-header .persona-btn.small {
    min-height: 28px;
    padding: 4px 8px;
  }

  .bindingplus-theme-scope .persona-prompt-preview-content .persona-textarea {
    min-height: 320px;
    white-space: pre-wrap;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-detail-list-header,
  .pool-edit-modal.bindingplus-mobile-modal .persona-prompt-check-header,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-detail-list-header,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-prompt-check-header {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-prompt-check-card,
  .pool-edit-modal.bindingplus-mobile-modal .persona-worldbook-entry-check-card,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-prompt-check-card,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-worldbook-entry-check-card {
    gap: 8px;
    padding: 8px 10px;
  }

  .pool-edit-modal.bindingplus-mobile-modal .persona-check-title-row,
  #${PERSONA_PANEL_ID}[data-device-mode='mobile'] .persona-check-title-row {
    gap: 6px;
  }
</style>
`;

/**
 * 注入样式到文档
 * @param doc 目标文档对象
 */
export function injectStyles(doc: Document = document): void {
  if ($('#persona-panel-styles', doc).length === 0) {
    const styleElement = styles.replace('<style>', '<style id="persona-panel-styles">');
    $('head', doc).append(styleElement);
  }
}
/**
 * 移除样式
 * @param doc 目标文档对象
 * @param styleId 样式标签的 ID
 */
export function removeStyles(doc: Document, styleId: string = 'persona-panel-styles'): void {
  $(`#${styleId}`, doc).remove();
}
