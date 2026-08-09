import type { z } from 'zod';
import type { MatchState } from '../engine/types';
import {
  careerStateSchema,
  formatStatValidationIssues,
  nba2kStatSchema,
  offCourtStateSchema,
} from '../schema';

export type CareerState = z.infer<typeof careerStateSchema>;
export type OffCourtState = z.infer<typeof offCourtStateSchema>;

export interface Nba2kStat {
  版本: 2;
  比赛: MatchState | null;
  生涯: CareerState | null;
  场外: OffCourtState | null;
  /** 非持久化字段；非空时 UI 必须进入错误恢复页。 */
  validationErrors: string[];
}

const EMPTY_STAT: Nba2kStat = {
  版本: 2,
  比赛: null,
  生涯: null,
  场外: null,
  validationErrors: [],
};

/** 供 readStat 与单元测试共用的无副作用解析入口。 */
export function parseStatData(raw: unknown): Nba2kStat {
  if (!raw || (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0)) {
    return { ...EMPTY_STAT, validationErrors: [] };
  }

  const result = nba2kStatSchema.safeParse(raw);
  if (!result.success) {
    return {
      ...EMPTY_STAT,
      validationErrors: formatStatValidationIssues(result.error),
    };
  }

  return {
    ...result.data,
    比赛: result.data.比赛 as MatchState | null,
    validationErrors: [],
  };
}

/** 从酒馆合并变量视图读取 stat_data 投影（只读，不回写） */
export function readStat(): Nba2kStat {
  try {
    return parseStatData(getAllVariables()?.stat_data ?? {});
  } catch (e) {
    console.warn('[nba2k] 读取变量失败', e);
    return {
      ...EMPTY_STAT,
      validationErrors: [`stat_data：读取变量失败（${e instanceof Error ? e.message : String(e)}）`],
    };
  }
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
