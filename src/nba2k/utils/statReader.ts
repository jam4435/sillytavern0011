import type { MatchState } from '../engine/types';

/** 生涯字段（stat_data.生涯） */
export interface CareerState {
  姓名: string;
  球队: string;
  位置: string;
  赛季: string;
  赛程索引: number;
  能力: Record<string, number>;
  徽章: string[];
  赛季统计: Record<string, number>;
  成长点: number;
}

/** 场外字段（stat_data.场外） */
export interface OffCourtState {
  资金: number;
  声望: number;
  粉丝: number;
  经纪人: { 姓名: string; 好感: number; 等级: number } | null;
  代言: { 品牌: string; 年薪: number; 要求: string; 状态: string }[];
  合同: { 球队: string; 年限: number; 年薪: number; 到期赛季: string } | null;
  关系: { 姓名: string; 身份: string; 好感: number; 阶段: string; 事件线: string }[];
  队友好感: Record<string, number>;
  日程: { 日期: string; 下一场: string; 待办: string[] };
}

export interface Nba2kStat {
  比赛: MatchState | null;
  生涯: CareerState | null;
  场外: OffCourtState | null;
}

/** 从酒馆合并变量视图读取 stat_data 投影（只读，不回写） */
export function readStat(): Nba2kStat {
  let raw: Record<string, any> = {};
  try {
    raw = getAllVariables()?.stat_data ?? {};
  } catch (e) {
    console.warn('[nba2k] 读取变量失败', e);
  }
  return {
    比赛: raw.比赛 ?? null,
    生涯: raw.生涯 ?? null,
    场外: raw.场外 ?? null,
  };
}

/** 判断是否处于比赛回合模式 */
export function isInMatch(stat: Nba2kStat): boolean {
  return Boolean(stat.比赛 && stat.比赛.进行中);
}

/** 剥掉思维链/变量块/选项块，取叙事正文 */
export function stripNarrative(message: string): string {
  return message
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<Variable(Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable\1>/gi, '')
    .replace(/<era_data>\{[\s\S]*?\}<\/era_data>/gi, '')
    .replace(/<行动判定>[\s\S]*?<\/行动判定>/gi, '')
    .replace(/<options>[\s\S]*?<\/options>/gi, '')
    .trim();
}

/** 解析 <options> 块为快捷选项 */
export function parseOptions(message: string): string[] {
  const m = message.match(/<options>([\s\S]*?)<\/options>/i);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map(line => line.replace(/^\s*\d+[.、)]\s*/, '').trim())
    .filter(Boolean);
}

/** 读取最近一条 assistant 楼层正文（跳过 loader 壳） */
export async function getLastAssistantNarrative(): Promise<string> {
  try {
    const messages = await getChatMessages('0-{{lastMessageId}}', { role: 'assistant' });
    for (let i = messages.length - 1; i >= 0; i--) {
      const text = messages[i]?.message ?? '';
      if (/\$\(['"]body['"]\)\.load\(/.test(text)) continue;
      if (text.trim()) return text;
    }
  } catch (e) {
    console.warn('[nba2k] 读取楼层失败', e);
  }
  return '';
}
