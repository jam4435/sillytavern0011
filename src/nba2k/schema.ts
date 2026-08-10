import { z } from 'zod';
import { BADGE_REGISTRY, GROUP_KEYS, HOT_ZONE_IDS, RATING_KEYS } from './engine/development';

const finite = z.number().finite();
const nonNegativeInt = z.number().int().nonnegative();
const rating = z.number().int().min(0).max(99);
const nonEmptyText = z.string().trim().min(1);

export const positionSchema = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export const sideSchema = z.enum(['主', '客']);
export const turnPhaseSchema = z.enum(['常规回合', '篮板争抢', '罚球结算', '死球']);

const ratingShape = Object.fromEntries(RATING_KEYS.map(key => [key, rating])) as Record<(typeof RATING_KEYS)[number], typeof rating>;
export const playerAttrsSchema = z.object(ratingShape).strict();

export const bodyProfileSchema = z.object({
  heightCm: z.number().int().min(150).max(250),
  weightKg: z.number().int().min(50).max(200),
  wingspanCm: z.number().int().min(140).max(260),
}).strict();

export const playerDataSchema = z.object({
  name: nonEmptyText, cn: nonEmptyText, team: nonEmptyText, pos: positionSchema,
  secondaryPos: positionSchema.nullable(), body: bodyProfileSchema,
  height_cm: z.number().int().min(150).max(250), number: z.number().int().min(0).max(99),
  overall: rating, attrs: playerAttrsSchema,
}).strict().superRefine((player, ctx) => {
  if (player.body.heightCm !== player.height_cm) ctx.addIssue({ code: 'custom', path: ['height_cm'], message: 'height_cm 必须等于 body.heightCm' });
});

export const onCourtStatusSchema = z.object({
  体力: z.number().min(0).max(100), 得分: nonNegativeInt, 篮板: nonNegativeInt, 助攻: nonNegativeInt,
  抢断: nonNegativeInt, 盖帽: nonNegativeInt, 失误: nonNegativeInt, 犯规: z.number().int().min(0).max(6),
  投篮命中: nonNegativeInt, 投篮出手: nonNegativeInt, 三分命中: nonNegativeInt, 三分出手: nonNegativeInt,
  罚球命中: nonNegativeInt, 罚球出手: nonNegativeInt, 进攻篮板: nonNegativeInt, 防守篮板: nonNegativeInt,
  上场秒数: nonNegativeInt, 手感: z.enum(['热', '平', '冷']), 连续命中: nonNegativeInt, 连续打铁: nonNegativeInt,
}).strict().superRefine((status, ctx) => {
  if (status.投篮命中 > status.投篮出手) ctx.addIssue({ code: 'custom', path: ['投篮命中'], message: '投篮命中不能大于出手' });
  if (status.三分命中 > status.三分出手) ctx.addIssue({ code: 'custom', path: ['三分命中'], message: '三分命中不能大于出手' });
  if (status.罚球命中 > status.罚球出手) ctx.addIssue({ code: 'custom', path: ['罚球命中'], message: '罚球命中不能大于出手' });
  if (status.三分命中 > status.投篮命中 || status.三分出手 > status.投篮出手) ctx.addIssue({ code: 'custom', path: ['三分出手'], message: '三分统计必须包含于投篮统计' });
  if (status.进攻篮板 + status.防守篮板 !== status.篮板) ctx.addIssue({ code: 'custom', path: ['篮板'], message: '总篮板必须等于前后场篮板之和' });
});

export const courtSpotSchema = z.object({
  球员: nonEmptyText, x: z.number().min(0).max(100), y: z.number().min(0).max(100), 持球: z.boolean().optional(),
}).strict();

const lineupSchema = z.object({ 场上: z.array(nonEmptyText).max(5), 替补: z.array(nonEmptyText).max(20) }).strict().superRefine((lineup, ctx) => {
  const all = [...lineup.场上, ...lineup.替补];
  if (new Set(all).size !== all.length) ctx.addIssue({ code: 'custom', message: '场上与替补阵容中不能出现重复球员' });
});

export const structuredTacticsSchema = z.object({
  offense: z.enum(['基础', '五外', '四外一内', '挡拆', '低位', '动态进攻']),
  defense: z.enum(['人盯人', '二三联防', '换防', '沉退', '延误']),
  pace: z.enum(['慢', '标准', '快']), helpIntensity: z.number().int().min(0).max(100),
  rebound: z.enum(['优先退防', '均衡', '冲抢']),
}).strict();

export const pendingSituationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('rebound'), shootingSide: sideSchema, shooter: nonEmptyText, zone: nonEmptyText }).strict(),
  z.object({ type: z.literal('freeThrow'), shootingSide: sideSchema, shooter: nonEmptyText, remaining: z.number().int().min(1).max(3), total: z.number().int().min(1).max(3) }).strict(),
  z.object({ type: z.literal('deadBall'), reason: nonEmptyText, inboundSide: sideSchema }).strict(),
]);

export const matchStateSchema = z.object({
  进行中: z.boolean(), 对阵: z.object({ 主队: nonEmptyText, 客队: nonEmptyText }).strict(),
  节次: z.number().int().min(1).max(20), 剩余秒数: z.number().int().min(0).max(720),
  投篮时钟: z.number().int().min(0).max(24), 比分: z.object({ 主: nonNegativeInt, 客: nonNegativeInt }).strict(),
  球权: sideSchema, 跳球胜方: sideSchema,
  战术: z.object({ 主: structuredTacticsSchema, 客: structuredTacticsSchema }).strict(),
  站位: z.object({ 主: z.array(courtSpotSchema).max(5), 客: z.array(courtSpotSchema).max(5) }).strict(),
  本节球队犯规: z.object({ 主: z.number().int().min(0).max(99), 客: z.number().int().min(0).max(99) }).strict(),
  暂停: z.object({ 主: z.number().int().min(0).max(7), 客: z.number().int().min(0).max(7) }).strict(),
  阵容: z.object({ 主: lineupSchema, 客: lineupSchema }).strict(), 回合阶段: turnPhaseSchema,
  待处理情境: pendingSituationSchema, 回合情境: z.string(), 球员状态: z.record(nonEmptyText, onCourtStatusSchema), 回合摘要: z.string(),
}).strict().superRefine((match, ctx) => {
  for (const side of ['主', '客'] as const) {
    const onCourt = match.阵容[side].场上;
    const spots = match.站位[side].map(spot => spot.球员);
    if (match.进行中 && onCourt.length !== 5) ctx.addIssue({ code: 'custom', path: ['阵容', side, '场上'], message: '进行中的比赛必须有5名场上球员' });
    if (match.进行中 && spots.length !== 5) ctx.addIssue({ code: 'custom', path: ['站位', side], message: '进行中的比赛必须有5个场上站位' });
    if (new Set(spots).size !== spots.length) ctx.addIssue({ code: 'custom', path: ['站位', side], message: '站位中不能出现重复球员' });
    if (match.进行中 && (onCourt.some(key => !spots.includes(key)) || spots.some(key => !onCourt.includes(key)))) ctx.addIssue({ code: 'custom', path: ['阵容', side, '场上'], message: '场上阵容必须与站位完全一致' });
    for (const key of onCourt) if (!match.球员状态[key]) ctx.addIssue({ code: 'custom', path: ['球员状态', key], message: '场上球员缺少实时状态' });
  }
  const holders = [...match.站位.主, ...match.站位.客].filter(spot => spot.持球);
  if (match.进行中 && match.回合阶段 === '常规回合' && holders.length !== 1) ctx.addIssue({ code: 'custom', path: ['站位'], message: '常规回合必须且只能有一名持球人' });
  if (match.回合阶段 === '篮板争抢' && match.待处理情境.type !== 'rebound') ctx.addIssue({ code: 'custom', path: ['待处理情境'], message: '篮板阶段必须有篮板待处理情境' });
  if (match.回合阶段 === '罚球结算' && match.待处理情境.type !== 'freeThrow') ctx.addIssue({ code: 'custom', path: ['待处理情境'], message: '罚球阶段必须有罚球待处理情境' });
});

const abilitySchema = playerAttrsSchema.extend({ overall: rating }).strict();
const groupShape = Object.fromEntries(GROUP_KEYS.map(key => [key, z.number().int().min(0).max(20)])) as Record<(typeof GROUP_KEYS)[number], z.ZodNumber>;
export const developmentSchema = z.object({
  mode: z.enum(['2K16模式', '自由模拟模式']), style: z.enum(['均衡', '外线', '内线']),
  groups: z.object(groupShape).strict(), growthPoints: nonNegativeInt, lastTrainingDate: nonEmptyText.nullable(),
}).strict();

const tendencySchema = z.object({ value: z.number().min(0).max(100), samples: nonNegativeInt }).strict();
const badgeSchema = z.object({ level: z.enum(['未解锁', '铜', '银', '金']), progress: nonNegativeInt }).strict();
const hotZoneSchema = z.object({ makes: nonNegativeInt, attempts: nonNegativeInt, state: z.enum(['热', '中性', '冷']) }).strict().refine(zone => zone.makes <= zone.attempts, '热区命中不能大于出手');

export const careerStateSchema = z.object({
  姓名: nonEmptyText, 球队: nonEmptyText, 位置: positionSchema, 附身球员: nonEmptyText,
  自定义球员: playerDataSchema.optional(), 赛季: nonEmptyText, 赛程索引: nonNegativeInt,
  能力: abilitySchema, 发展: developmentSchema, 倾向: z.object({ families: z.record(nonEmptyText, tendencySchema) }).strict(),
  动态徽章: z.object({ badges: z.record(nonEmptyText, badgeSchema).superRefine((badges, ctx) => {
    for (const name of BADGE_REGISTRY) if (!badges[name]) ctx.addIssue({ code: 'custom', path: [name], message: '缺少核心徽章' });
  }) }).strict(),
  热区: z.object({ zones: z.record(nonEmptyText, hotZoneSchema).superRefine((zones, ctx) => {
    for (const zone of HOT_ZONE_IDS) if (!zones[zone]) ctx.addIssue({ code: 'custom', path: [zone], message: '缺少热区' });
  }) }).strict(),
  教练信任: z.number().min(0).max(100), 球队角色: z.enum(['边缘轮换', '轮换', '第六人', '首发', '核心']),
  赛季统计: z.record(nonEmptyText, finite.nonnegative()), 成长点: nonNegativeInt,
}).strict();

export const offCourtStateSchema = z.object({
  资金: finite.nonnegative(), 声望: finite.min(0).max(100), 粉丝: nonNegativeInt,
  经纪人: z.object({ 姓名: nonEmptyText, 好感: finite.min(0).max(100), 等级: nonNegativeInt }).strict().nullable(),
  代言: z.array(z.object({ 品牌: nonEmptyText, 年薪: finite.nonnegative(), 要求: z.string(), 状态: z.string() }).strict()),
  合同: z.object({ 球队: nonEmptyText, 年限: nonNegativeInt, 年薪: finite.nonnegative(), 到期赛季: nonEmptyText }).strict().nullable(),
  关系: z.array(z.object({ 姓名: nonEmptyText, 身份: z.string(), 好感: finite.min(0).max(100), 阶段: z.string(), 事件线: z.string() }).strict()),
  队友好感: z.record(nonEmptyText, finite.min(0).max(100)),
  日程: z.object({ 日期: nonEmptyText, 下一场: nonEmptyText, 待办: z.array(z.string()) }).strict(),
}).strict();

export const nba2kStatSchema = z.object({ 版本: z.literal(3), 比赛: matchStateSchema.nullable(), 生涯: careerStateSchema.nullable(), 场外: offCourtStateSchema.nullable() }).strict();
export type ValidatedNba2kStat = z.infer<typeof nba2kStatSchema>;

export function formatStatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${issue.path.length ? issue.path.join('.') : 'stat_data'}：${issue.message}`);
}
