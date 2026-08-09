import { z } from 'zod';

const finite = z.number().finite();
const nonNegativeInt = z.number().int().nonnegative();
const rating = z.number().int().min(0).max(99);
const nonEmptyText = z.string().trim().min(1);

export const positionSchema = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export const sideSchema = z.enum(['主', '客']);
export const turnPhaseSchema = z.enum(['常规回合', '篮板争抢', '死球']);

export const playerAttrsSchema = z
  .object({
    insideScoring: rating,
    outsideScoring: rating,
    threePoint: rating,
    midRange: rating,
    freeThrow: rating,
    layup: rating,
    dunk: rating,
    speed: rating,
    ballHandle: rating,
    passing: rating,
    perimeterD: rating,
    interiorD: rating,
    steal: rating,
    block: rating,
    offRebound: rating,
    defRebound: rating,
    stamina: rating,
    strength: rating,
    potential: rating,
  })
  .strict();

export const playerDataSchema = z
  .object({
    name: nonEmptyText,
    cn: nonEmptyText,
    team: nonEmptyText,
    pos: positionSchema,
    secondaryPos: positionSchema.nullable(),
    height_cm: z.number().int().min(150).max(250),
    number: z.number().int().min(0).max(99),
    overall: rating,
    attrs: playerAttrsSchema,
  })
  .strict();

export const onCourtStatusSchema = z
  .object({
    体力: z.number().min(0).max(100),
    得分: nonNegativeInt,
    篮板: nonNegativeInt,
    助攻: nonNegativeInt,
    抢断: nonNegativeInt,
    盖帽: nonNegativeInt,
    失误: nonNegativeInt,
    犯规: z.number().int().min(0).max(6),
    手感: z.enum(['热', '平', '冷']),
    连续命中: nonNegativeInt,
    连续打铁: nonNegativeInt,
  })
  .strict();

export const courtSpotSchema = z
  .object({
    球员: nonEmptyText,
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    持球: z.boolean().optional(),
  })
  .strict();

const lineupSchema = z
  .object({
    场上: z.array(nonEmptyText).max(5),
    替补: z.array(nonEmptyText).max(20),
  })
  .strict()
  .superRefine((lineup, ctx) => {
    const all = [...lineup.场上, ...lineup.替补];
    if (new Set(all).size !== all.length) {
      ctx.addIssue({ code: 'custom', message: '场上与替补阵容中不能出现重复球员' });
    }
  });

export const matchStateSchema = z
  .object({
    进行中: z.boolean(),
    对阵: z.object({ 主队: nonEmptyText, 客队: nonEmptyText }).strict(),
    节次: z.number().int().min(1).max(20),
    剩余秒数: z.number().int().min(0).max(720),
    比分: z.object({ 主: nonNegativeInt, 客: nonNegativeInt }).strict(),
    球权: sideSchema,
    战术: z.object({ 主: z.string(), 客: z.string() }).strict(),
    站位: z.object({ 主: z.array(courtSpotSchema).max(5), 客: z.array(courtSpotSchema).max(5) }).strict(),
    本节球队犯规: z
      .object({ 主: z.number().int().min(0).max(99), 客: z.number().int().min(0).max(99) })
      .strict(),
    暂停: z.object({ 主: z.number().int().min(0).max(7), 客: z.number().int().min(0).max(7) }).strict(),
    阵容: z.object({ 主: lineupSchema, 客: lineupSchema }).strict(),
    回合阶段: turnPhaseSchema,
    回合情境: z.string(),
    球员状态: z.record(nonEmptyText, onCourtStatusSchema),
    回合摘要: z.string(),
  })
  .strict()
  .superRefine((match, ctx) => {
    for (const side of ['主', '客'] as const) {
      const onCourt = match.阵容[side].场上;
      const spots = match.站位[side].map(spot => spot.球员);
      if (match.进行中 && onCourt.length !== 5) {
        ctx.addIssue({ code: 'custom', path: ['阵容', side, '场上'], message: '进行中的比赛必须有 5 名场上球员' });
      }
      if (match.进行中 && spots.length !== 5) {
        ctx.addIssue({ code: 'custom', path: ['站位', side], message: '进行中的比赛必须有 5 个场上站位' });
      }
      if (new Set(spots).size !== spots.length) {
        ctx.addIssue({ code: 'custom', path: ['站位', side], message: '站位中不能出现重复球员' });
      }
      if (match.进行中 && (onCourt.some(key => !spots.includes(key)) || spots.some(key => !onCourt.includes(key)))) {
        ctx.addIssue({ code: 'custom', path: ['阵容', side, '场上'], message: '场上阵容必须与站位球员完全一致' });
      }
      for (const key of onCourt) {
        if (!match.球员状态[key]) {
          ctx.addIssue({ code: 'custom', path: ['球员状态', key], message: '场上球员缺少实时状态' });
        }
      }
    }
    const holders = [...match.站位.主, ...match.站位.客].filter(spot => spot.持球);
    if (match.进行中 && match.回合阶段 === '常规回合' && holders.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['站位'], message: '常规回合必须且只能有一名持球人' });
    }
  });

const abilitySchema = playerAttrsSchema.extend({ overall: rating }).strict();

export const careerStateSchema = z
  .object({
    姓名: nonEmptyText,
    球队: nonEmptyText,
    位置: positionSchema,
    附身球员: nonEmptyText,
    自定义球员: playerDataSchema.optional(),
    赛季: nonEmptyText,
    赛程索引: nonNegativeInt,
    能力: abilitySchema,
    徽章: z.array(nonEmptyText),
    赛季统计: z.record(nonEmptyText, finite.nonnegative()),
    成长点: nonNegativeInt,
  })
  .strict();

export const offCourtStateSchema = z
  .object({
    资金: finite.nonnegative(),
    声望: finite.min(0).max(100),
    粉丝: nonNegativeInt,
    经纪人: z
      .object({ 姓名: nonEmptyText, 好感: finite.min(0).max(100), 等级: nonNegativeInt })
      .strict()
      .nullable(),
    代言: z.array(
      z.object({ 品牌: nonEmptyText, 年薪: finite.nonnegative(), 要求: z.string(), 状态: z.string() }).strict(),
    ),
    合同: z
      .object({ 球队: nonEmptyText, 年限: nonNegativeInt, 年薪: finite.nonnegative(), 到期赛季: nonEmptyText })
      .strict()
      .nullable(),
    关系: z.array(
      z.object({ 姓名: nonEmptyText, 身份: z.string(), 好感: finite.min(0).max(100), 阶段: z.string(), 事件线: z.string() }).strict(),
    ),
    队友好感: z.record(nonEmptyText, finite.min(0).max(100)),
    日程: z.object({ 日期: nonEmptyText, 下一场: nonEmptyText, 待办: z.array(z.string()) }).strict(),
  })
  .strict();

export const nba2kStatSchema = z
  .object({
    版本: z.literal(2),
    比赛: matchStateSchema.nullable(),
    生涯: careerStateSchema.nullable(),
    场外: offCourtStateSchema.nullable(),
  })
  .strict();

export type ValidatedNba2kStat = z.infer<typeof nba2kStatSchema>;

export function formatStatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${issue.path.length ? issue.path.join('.') : 'stat_data'}：${issue.message}`);
}
