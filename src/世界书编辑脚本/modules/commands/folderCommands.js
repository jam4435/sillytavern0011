import {
  assignEntriesToFolder,
  createFolder,
  deleteFolder,
  removeEntriesFromFolder,
  renameFolder,
} from '../features/folderMeta.js';
import { allEntriesData, getFolderMetaSession, getSelectedEntries } from '../state.js';
import { registerCommands } from './index.js';

function promptFolderName(message, defaultValue = '') {
  const value = window.prompt(message, defaultValue);
  if (value == null) {
    return null;
  }
  const normalizedValue = `${value}`.trim();
  return normalizedValue || null;
}

async function createFolderAction({ lorebookName, isGlobal, refreshList }) {
  const folderName = promptFolderName('输入新文件夹名称');
  if (!folderName) {
    return;
  }

  const selectedEntries = getSelectedEntries(lorebookName);
  const result =
    selectedEntries.length > 0
      ? await assignEntriesToFolder(lorebookName, selectedEntries, folderName)
      : await createFolder(lorebookName, folderName);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '创建文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(
    selectedEntries.length > 0 ? `已创建文件夹并放入 ${selectedEntries.length} 个条目：${folderName}` : `已创建文件夹：${folderName}`,
  );
}

async function moveSelectedToFolderAction({ lorebookName, isGlobal, refreshList }) {
  const selectedEntries = getSelectedEntries(lorebookName);
  if (selectedEntries.length === 0) {
    window.toastr?.warning('请先选择至少一个条目');
    return;
  }

  const folderMeta = getFolderMetaSession(lorebookName);
  const folderNames = (folderMeta?.folders || []).map(folder => folder.name);
  const hint = folderNames.length > 0 ? `已有文件夹：${folderNames.join('、')}` : '输入文件夹名称，不存在会自动创建';
  const folderName = promptFolderName(`把 ${selectedEntries.length} 个条目移动到文件夹。\n${hint}`);
  if (!folderName) {
    return;
  }

  const result = await assignEntriesToFolder(lorebookName, selectedEntries, folderName);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '移动到文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(`已移动到文件夹：${folderName}`);
}

async function removeSelectedFromFolderAction({ lorebookName, isGlobal, refreshList }) {
  const selectedEntries = getSelectedEntries(lorebookName);
  if (selectedEntries.length === 0) {
    window.toastr?.warning('请先选择至少一个条目');
    return;
  }

  const result = await removeEntriesFromFolder(lorebookName, selectedEntries);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '移出文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success('已将选中条目移出文件夹');
}

async function renameFolderAction({ lorebookName, isGlobal, refreshList, folderId, folderName }) {
  const nextFolderName = promptFolderName('输入新的文件夹名称', folderName || '');
  if (!nextFolderName || nextFolderName === folderName) {
    return;
  }

  const result = await renameFolder(lorebookName, folderId, nextFolderName);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '重命名文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(`已重命名为：${nextFolderName}`);
}

async function deleteFolderAction({ lorebookName, isGlobal, refreshList, folderId, folderName }) {
  if (!window.confirm(`确定删除文件夹“${folderName}”吗？其中条目会回到顶层列表。`)) {
    return;
  }

  const result = await deleteFolder(lorebookName, folderId);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '删除文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(`已删除文件夹：${folderName}`);
}

function getEntriesForFolder(lorebookName, folderId) {
  const entries = allEntriesData[lorebookName] || [];
  const folderMeta = getFolderMetaSession(lorebookName);
  const entryFolderMap = folderMeta?.entryFolderMap || {};

  return entries.filter(entry => entryFolderMap[String(entry.uid)] === folderId);
}

async function importFolderEntriesAction({ lorebookName, isGlobal, refreshList, folderName }) {
  const selectedEntries = getSelectedEntries(lorebookName);
  if (selectedEntries.length === 0) {
    window.toastr?.warning('请先选择至少一个要导入文件夹的条目');
    return;
  }

  const result = await assignEntriesToFolder(lorebookName, selectedEntries, folderName);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '导入文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(`已将 ${selectedEntries.length} 个条目导入文件夹：${folderName}`);
}

async function exportFolderEntriesAction({ lorebookName, isGlobal, refreshList, folderId, folderName }) {
  const selectedEntries = new Set(getSelectedEntries(lorebookName));
  const folderEntries = getEntriesForFolder(lorebookName, folderId);
  const entryUidsToExport = folderEntries
    .map(entry => Number(entry.uid))
    .filter(uid => selectedEntries.has(uid));

  if (entryUidsToExport.length === 0) {
    window.toastr?.warning('请先选中文件夹内至少一个条目，再执行导出');
    return;
  }

  const result = await removeEntriesFromFolder(lorebookName, entryUidsToExport);
  if (!result.success) {
    window.toastr?.error(result.error?.message || '导出文件夹失败');
    return;
  }

  await refreshList(lorebookName, isGlobal);
  window.toastr?.success(`已将 ${entryUidsToExport.length} 个条目从文件夹“${folderName}”导出到顶层`);
}

registerCommands({
  'create-folder': createFolderAction,
  'move-selected-to-folder': moveSelectedToFolderAction,
  'remove-selected-from-folder': removeSelectedFromFolderAction,
  'rename-folder': renameFolderAction,
  'delete-folder': deleteFolderAction,
  'export-folder-entries': exportFolderEntriesAction,
  'import-folder-entries': importFolderEntriesAction,
});
