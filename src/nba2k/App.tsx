import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionChoice, SubstitutionChoice } from './components/ActionPanel';
import { ActionPanel } from './components/ActionPanel';
import { BoxScore } from './components/BoxScore';
import { CareerPanel } from './components/CareerPanel';
import { CourtView } from './components/CourtView';
import { ScoreBoard } from './components/ScoreBoard';
import type { SetupResult } from './components/SetupScreen';
import { SetupScreen } from './components/SetupScreen';
import type { StartMode } from './components/SplashScreen';
import { SplashScreen } from './components/SplashScreen';
import { CreatePlayer } from './components/CreatePlayer';
import type { CustomPlayerForm } from './utils/customPlayer';
import { buildCustomPlayer } from './utils/customPlayer';
import { buildTurnPrompt } from './engine/promptBuilder';
import { buildFormation } from './engine/positioning';
import { resolveAction } from './engine/resolveAction';
import { advancePeriodIfNeeded, buildCanonicalAssistant, settleAssistantResponse } from './engine/settlement';
import { createDevelopment, defaultBadges, defaultHotZones, defaultTendencies, initialGroups } from './engine/development';
import type { MatchState, OnCourtStatus, PlayerData, Side, SituationContext, StructuredTeamTactics, UpgradeGroupKey } from './engine/types';
import {
  buildLeagueRosterSnapshot,
  createLeaguePlayerResolver,
  getAllPlayersForLeague,
  getBasePlayer,
  getPlayer,
  getPlayerForLeague,
  getRosterForLeague,
  getTeam,
  registerCustomPlayer,
} from './utils/rosters';
import type { Nba2kStat } from './utils/statReader';
import { getLastAssistantNarrative, isInMatch, parseOptions, readStat, stripNarrative } from './utils/statReader';
import { runTurnTransaction } from './utils/turnTransaction';
import type { TurnTransactionOptions } from './utils/turnTransaction';
import { finishCareerGame, trainCareer, updateCareerDynamics, upgradeCareer } from './utils/careerProgress';
import { continuePossessionAfterAdvantage, simulatePossession } from './engine/possession';
import type { SimulationMode } from './engine/simulationMode';
import { simulateUntilInterruption } from './engine/simulationMode';
import {
  advanceLeagueAfterGame,
  beginNextSeason,
  createLeagueState,
  formatScheduledOpponent,
  getScheduledGame,
} from './engine/season';
import {
  advanceInjuryRecovery,
  collectOffCourtHooks,
  isTradeDeadlinePeriod,
  isTradeWindowOpen,
} from './engine/offCourtSystems';
import { deriveTeamTactics } from './engine/teamStyle';
import { applyAutomaticRotation } from './engine/rotation';
import { createRotationPlan } from './engine/rotationPlan';
import { getPlayerAvailability } from './engine/availability';
import { buildDynamicDepthChart } from './engine/depthChart';
import {
  advanceCareerLifecycleOneSeason,
  estimateInitialAge,
  estimatePeakAge,
  seasonLabelFromOffset,
} from './engine/lifecycle';
import {
  applyMarketOffer,
  contractForPlayer,
  prepareOffseasonMarket,
  preparePlayerTradeMarket,
  registerExistingContract,
  runCpuTradeDeadline,
} from './engine/transactions';
import type { MarketOffer } from './engine/transactionTypes';
import { runAnnualDraft } from './engine/draft';
import { buildLeagueSimulationProfiles } from './engine/teamPower';

function freshStatus(): OnCourtStatus {
  return {
    体力: 100,
    得分: 0,
    篮板: 0,
    助攻: 0,
    抢断: 0,
    盖帽: 0,
    失误: 0,
    犯规: 0,
    投篮命中: 0,
    投篮出手: 0,
    三分命中: 0,
    三分出手: 0,
    罚球命中: 0,
    罚球出手: 0,
    进攻篮板: 0,
    防守篮板: 0,
    上场秒数: 0,
    垃圾时间秒数: 0,
    手感: '平',
    连续命中: 0,
    连续打铁: 0,
  };
}

const SIMULATION_MODE_KEY = 'nba2k_simulation_mode_v1';

function readSimulationMode(): SimulationMode {
  try {
    const value = localStorage.getItem(SIMULATION_MODE_KEY);
    if (value === '全回合' || value === '精简比赛' || value === '关键时刻') return value;
  } catch {}
  return '精简比赛';
}

function careerPlayerProjection(career: NonNullable<Nba2kStat['生涯']>): PlayerData | undefined {
  const base = career.自定义球员 ?? getBasePlayer(career.附身球员);
  if (!base) return undefined;
  const { overall, ...attrs } = career.能力;
  return {
    ...base,
    team: career.球队,
    pos: career.位置,
    overall,
    attrs,
  };
}

function playerResolverForStat(stat: Nba2kStat): (key: string) => PlayerData | undefined {
  const leagueResolver = createLeaguePlayerResolver(stat.联盟);
  const career = stat.生涯;
  const protagonist = career ? careerPlayerProjection(career) : undefined;
  return key => career && key === career.附身球员 ? protagonist : leagueResolver(key);
}

function contractExpirySeason(expiresAfterSeason: number): string {
  return seasonLabelFromOffset(expiresAfterSeason + 1);
}

function roleAfterRosterChange(
  playerKey: string,
  teamId: string,
  league: NonNullable<Nba2kStat['联盟']>,
): NonNullable<Nba2kStat['生涯']>['球队角色'] {
  const roster = getRosterForLeague(teamId, league).sort((a, b) => b.overall - a.overall);
  const rank = roster.findIndex(player => player.name === playerKey);
  if (rank <= 1 && rank >= 0) return '核心';
  if (rank <= 4 && rank >= 0) return '首发';
  if (rank === 5) return '第六人';
  if (rank <= 9 && rank >= 0) return '轮换';
  return '边缘轮换';
}

function draftSummary(
  picks: ReturnType<typeof runAnnualDraft>['picks'],
  playerTeamId: string,
): string {
  const top = picks.slice(0, 5).map(pick =>
    `#${pick.overallPick} ${getTeam(pick.teamId)?.cn ?? pick.teamId}：${pick.playerName}（${pick.pos}，${pick.template}，OVR ${pick.overallAtDraft}/POT ${pick.potential}）`
  );
  const mine = picks
    .filter(pick => pick.teamId === playerTeamId)
    .map(pick => `本队#${pick.overallPick}：${pick.playerName}（${pick.pos}，${pick.template}）`);
  return [...top, ...mine].join('\n');
}

function ensureOffseasonDraft(
  league: NonNullable<Nba2kStat['联盟']>,
  playerTeamId: string,
): { league: NonNullable<Nba2kStat['联盟']>; picks: ReturnType<typeof runAnnualDraft>['picks']; newlyCompleted: boolean } {
  const entrySeason = league.赛季序号 + 1;
  const alreadyCompleted = league.选秀历史.some(pick => pick.entrySeason === entrySeason);
  const snapshot = buildLeagueRosterSnapshot(league);
  const result = runAnnualDraft(league, getRosterForLeague, snapshot.byTeam);
  let nextLeague = result.league;
  const hookId = `draft-${entrySeason}`;
  if (!alreadyCompleted && result.picks.length && !nextLeague.故事钩子.some(hook => hook.id === hookId)) {
    nextLeague = {
      ...nextLeague,
      故事钩子: [...nextLeague.故事钩子, {
        id: hookId,
        type: '选秀' as const,
        title: `${seasonLabelFromOffset(entrySeason)} 新秀选秀完成`,
        detail: draftSummary(result.picks, playerTeamId),
        createdDate: nextLeague.日期,
      }],
    };
  }
  return { league: nextLeague, picks: result.picks, newlyCompleted: !alreadyCompleted };
}

function offerSummary(offer: MarketOffer): string {
  const team = getTeam(offer.teamId)?.cn ?? offer.teamId;
  if (offer.type === '交易') {
    const outgoing = offer.outgoingPlayerKey ? (getBasePlayer(offer.outgoingPlayerKey)?.cn ?? offer.outgoingPlayerKey) : '待定筹码';
    return `${team}：交易，主要回报 ${outgoing}，需求分${Math.round(offer.needScore)}，适配${Math.round(offer.fitScore)}`;
  }
  return `${team}：${offer.type} ${offer.years}年 / 年薪${Math.round(offer.annualSalary / 10_000)}万美元，适配${Math.round(offer.fitScore)}`;
}

function generatedText(result: string | GenerateToolCallResult): string {
  return (typeof result === 'string' ? result : result.content).trim();
}

function badgeModifier(levels: string[]): number {
  const value = levels.reduce((sum, level) => sum + (level === '金' ? 6 : level === '银' ? 4 : level === '铜' ? 2 : 0), 0);
  return Math.max(-8, Math.min(8, value));
}

function actionBadgeLevels(career: NonNullable<Nba2kStat['生涯']>, action: ActionChoice['action']): string[] {
  const names = action.includes('投篮') || action === '后撤步' || action === '突破急停' ? ['高难度投篮', '抗干扰', '关键射手']
    : action.includes('突破') || action === '背身单打' ? ['强力终结', '杂技', '造犯规']
    : action.includes('传球') || action.includes('挡拆') ? ['十美分', '挡拆大师']
    : action.includes('篮板') || action === '卡位' ? ['篮板精英', '卡位']
    : ['外线封锁', '拦截者', '护框', '绕掩护'];
  return names.map(name => career.动态徽章.badges[name]?.level ?? '未解锁');
}

function actionHotZone(career: NonNullable<Nba2kStat['生涯']>, action: ActionChoice['action']): number {
  const zone = action === '定点投篮' ? '三分弧顶' : action === '后撤步' ? '三分右翼' : action === '突破终结' ? '篮下' : action === '背身单打' ? '油漆中' : '中投正面';
  const state = career.热区.zones[zone]?.state ?? '中性';
  return state === '热' ? 4 : state === '冷' ? -4 : 0;
}

function stripMatchVariableBlocks(text: string, patch: Record<string, unknown>): string {
  const narrative = text.replace(/<NBASettlement>[\s\S]*?<\/NBASettlement>/gi, '').replace(/<Variable(Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable\1>/gi, '').trim();
  return `${narrative}\n<VariableThink>确定性操作由前端完成。</VariableThink>\n<VariableEdit>${JSON.stringify(patch)}</VariableEdit>`;
}

function buildPostGamePatch(
  stat: Nba2kStat,
  nextCareer: NonNullable<Nba2kStat['生涯']>,
  nextMatch: MatchState,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { 生涯: nextCareer };
  if (!stat.场外) return patch;

  const baseLeague = stat.联盟 ?? createLeagueState(nextCareer.球队);
  // 后台29队与非玩家季后赛系列赛共用当前世界Roster的即时球队画像。
  // 不持久化球队总评；交易/伤病/成长/退役/新秀会在下一轮自然改变画像。
  const leagueSnapshot = buildLeagueRosterSnapshot(baseLeague);
  const simulationProfiles = buildLeagueSimulationProfiles(baseLeague, leagueSnapshot.byTeam);
  const advanced = advanceLeagueAfterGame(
    baseLeague,
    nextCareer.球队,
    nextMatch,
    Math.random,
    simulationProfiles,
    leagueSnapshot.byTeam,
    { key: nextCareer.附身球员, age: nextCareer.年龄 },
  );
  let nextLeague = advanceInjuryRecovery(advanced.league);

  const deadlineHookId = `cpu-deadline-market-${nextLeague.赛季}`;
  if (
    isTradeDeadlinePeriod(nextLeague.日期) &&
    !nextLeague.故事钩子.some(hook => hook.id === deadlineHookId)
  ) {
    const deadline = runCpuTradeDeadline(
      nextLeague,
      nextCareer.附身球员,
      getPlayerForLeague,
      getRosterForLeague,
    );
    nextLeague = deadline.league;
    const detail = deadline.trades.length
      ? deadline.trades.map(record => {
          const incoming = getBasePlayer(record.playerKey)?.cn ?? record.playerKey;
          const outgoing = record.outgoingPlayerKey
            ? (getBasePlayer(record.outgoingPlayerKey)?.cn ?? record.outgoingPlayerKey)
            : '筹码';
          return `${record.fromTeam}送出${incoming}，${record.toTeam}送出${outgoing}`;
        }).join('；')
      : '本赛季截止日前没有出现满足球队需求与价值匹配条件的CPU交易。';
    nextLeague = {
      ...nextLeague,
      故事钩子: [...nextLeague.故事钩子, {
        id: deadlineHookId,
        type: '交易',
        title: '交易截止日结算',
        detail,
        createdDate: nextLeague.日期,
      }],
    };
  }

  const previousRole = stat.生涯?.球队角色;
  if (previousRole && previousRole !== nextCareer.球队角色) {
    nextLeague = {
      ...nextLeague,
      故事钩子: [
        ...nextLeague.故事钩子,
        {
          id: `coach-role-${nextLeague.赛程索引}-${nextCareer.球队角色}`,
          type: '球队关系',
          title: '教练调整球队角色',
          detail: `根据最近比赛、教练信任与队内竞争，球队角色由“${previousRole}”调整为“${nextCareer.球队角色}”。这是前端规则结论，后续叙事只能解释原因，不得改判。`,
          createdDate: nextLeague.日期,
        },
      ],
    };
  }
  const nextOffCourt = {
    ...stat.场外,
    日程: {
      日期: nextLeague.日期,
      下一场: formatScheduledOpponent(advanced.nextGame),
      待办: advanced.nextGame ? ['恢复训练', '下一场比赛'] : ['常规赛总结', '季后赛准备'],
    },
  };
  const hooks = collectOffCourtHooks(nextCareer, nextOffCourt, nextLeague);
  if (hooks.length) nextLeague = { ...nextLeague, 故事钩子: [...nextLeague.故事钩子, ...hooks] };

  patch.场外 = nextOffCourt;
  patch.联盟 = nextLeague;
  return patch;
}

const App: React.FC = () => {
  const [stat, setStat] = useState<Nba2kStat>(() => readStat());
  const [startScreen, setStartScreen] = useState<'splash' | StartMode>('splash');
  const [narrative, setNarrative] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>(() => readSimulationMode());
  const [freeText, setFreeText] = useState('');
  const [showBoxScore, setShowBoxScore] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = readStat();
    // 主角始终以生涯中的“当季能力”覆盖静态球员种子；训练/衰退才能真实进入比赛。
    if (next.生涯) {
      const projection = careerPlayerProjection(next.生涯);
      if (projection) registerCustomPlayer(projection);
    }
    setStat(next);
    const last = await getLastAssistantNarrative();
    setNarrative(stripNarrative(last));
    setOptions(parseOptions(last));
  }, []);

  useEffect(() => {
    void refresh();
    let activeChatId = SillyTavern.getCurrentChatId();
    const regs = [
      eventOn(tavern_events.MESSAGE_RECEIVED, () => void refresh()),
      eventOn(tavern_events.MESSAGE_UPDATED, () => void refresh()),
      eventOn(tavern_events.MESSAGE_SWIPED, () => void refresh()),
      eventOn(tavern_events.CHAT_CHANGED, chatId => {
        if (chatId !== activeChatId) {
          activeChatId = chatId;
          window.location.reload();
          return;
        }
        void refresh();
      }),
    ];
    return () => regs.forEach(r => r.stop?.());
  }, [refresh]);

  /** 发送一回合：user 楼层 + 生成，完成后兜底重读 */
  const sendTurn = useCallback(
    async (text: string, transactionOptions: TurnTransactionOptions = {}) => {
      if (busyRef.current || !text.trim()) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await runTurnTransaction(text, transactionOptions);
        setNarrative(stripNarrative(result.assistantText));
        setOptions(parseOptions(result.assistantText));
      } catch (e) {
        console.error('[nba2k] 回合失败', e);
        toastr.error(e instanceof Error ? e.message : '回合失败，请重试');
      } finally {
        busyRef.current = false;
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  /** 新开局：写入生涯/场外初值 */
  const handleSetup = useCallback(
    async (r: SetupResult) => {
      const p = getPlayer(r.protagonistKey);
      const team = getTeam(r.teamId);
      const league = registerExistingContract(
        createLeagueState(r.teamId),
        r.protagonistKey,
        r.teamId,
        2,
        2_000_000,
      );
      const firstGame = getScheduledGame(r.teamId, 0, league.赛季序号);
      const firstOpponent = firstGame ? getTeam(firstGame.opponent) : undefined;
      await insertOrAssignVariables(
        {
          stat_data: {
            版本: 3,
            生涯: {
              姓名: r.playerName,
              球队: r.teamId,
              位置: p?.pos ?? 'SG',
              附身球员: r.protagonistKey,
              赛季: league.赛季,
              赛程索引: 1,
              年龄: p ? estimateInitialAge(p) : 24,
              巅峰年龄: p ? estimatePeakAge(p) : 28,
              生涯赛季数: 0,
              退役状态: '现役',
              能力: { overall: p?.overall ?? 75, ...p?.attrs },
              发展: createDevelopment('2K16模式', '均衡', initialGroups('2K16模式', '均衡')),
              倾向: defaultTendencies(),
              动态徽章: defaultBadges(),
              热区: defaultHotZones(),
              教练信任: 45,
              球队角色: '首发',
              教练评估: { 最近评分: [], 上次角色调整场次: 0 },
              赛季统计: { 场均得分: 0, 场均篮板: 0, 场均助攻: 0, 出场数: 0 },
              成长点: 0,
            },
            场外: {
              资金: 500000,
              声望: Math.max(10, (p?.overall ?? 75) - 50),
              粉丝: (p?.overall ?? 75) * 3000,
              经纪人: null,
              代言: [],
              合同: { 球队: r.teamId, 年限: 2, 年薪: 2000000, 到期赛季: '2017-18' },
              关系: [],
              队友好感: Object.fromEntries(
                getRosterForLeague(r.teamId, league)
                  .slice(0, 5)
                  .filter(sp => sp.name !== r.protagonistKey)
                  .map(sp => [sp.name, 50]),
              ),
              日程: { 日期: league.日期, 下一场: formatScheduledOpponent(firstGame), 待办: ['赛季首战'] },
            },
            联盟: league,
            比赛: null,
          },
        },
        { type: 'chat' },
      );
      setStat(readStat());
      await sendTurn(
        `【开局】我是${r.playerName}，以${p?.cn ?? r.protagonistKey}的身份效力于${team?.cn}（${p?.pos}，总评${p?.overall}）。` +
          `2015-16 赛季即将开始，首战 ${firstOpponent?.cn ?? firstGame?.opponent ?? '待定'}。请以生涯纪录片的口吻开场，介绍我的处境（更衣室、教练、媒体期待），最后给出行动选项。`,
      );
    },
    [sendTurn],
  );

  /** 自定义新秀开局：注册球员并写入生涯/场外初值 */
  const handleCreateCustom = useCallback(
    async (form: CustomPlayerForm) => {
      const player = buildCustomPlayer(form);
      registerCustomPlayer(player);
      const team = getTeam(form.teamId);
      const league = registerExistingContract(
        createLeagueState(form.teamId),
        player.name,
        form.teamId,
        2,
        1_100_000,
      );
      const firstGame = getScheduledGame(form.teamId, 0, league.赛季序号);
      const firstOpponent = firstGame ? getTeam(firstGame.opponent) : undefined;
      await insertOrAssignVariables(
        {
          stat_data: {
            版本: 3,
            生涯: {
              姓名: form.name,
              球队: form.teamId,
              位置: form.pos,
              附身球员: player.name,
              自定义球员: player,
              赛季: league.赛季,
              赛程索引: 1,
              年龄: 19,
              巅峰年龄: estimatePeakAge(player),
              生涯赛季数: 0,
              退役状态: '现役',
              能力: { overall: player.overall, ...player.attrs },
              发展: createDevelopment(form.mode, form.style, form.groups),
              倾向: defaultTendencies(),
              动态徽章: defaultBadges(),
              热区: defaultHotZones(),
              教练信任: 30,
              球队角色: '轮换',
              教练评估: { 最近评分: [], 上次角色调整场次: 0 },
              赛季统计: { 场均得分: 0, 场均篮板: 0, 场均助攻: 0, 出场数: 0 },
              成长点: 0,
            },
            场外: {
              资金: 120000,
              声望: 8,
              粉丝: 12000,
              经纪人: null,
              代言: [],
              合同: { 球队: form.teamId, 年限: 2, 年薪: 1100000, 到期赛季: '2017-18' },
              关系: [],
              队友好感: Object.fromEntries(
                getRosterForLeague(form.teamId, league)
                  .slice(0, 5)
                  .map(sp => [sp.name, 45]),
              ),
              日程: { 日期: league.日期, 下一场: formatScheduledOpponent(firstGame), 待办: ['新秀首秀'] },
            },
            联盟: league,
            比赛: null,
          },
        },
        { type: 'chat' },
      );
      setStat(readStat());
      await sendTurn(
        `【开局】我是${form.name}，一名${form.height_cm}cm、${form.weight_kg}kg、臂展${form.wingspan_cm}cm 的${form.pos}新秀（${form.mode}，总评${player.overall}，潜力${player.attrs.potential}），` +
          `刚与${team?.cn}签下新秀合同，球衣号码 ${form.number} 号。2015-16 赛季即将开始，首战 ${firstOpponent?.cn ?? firstGame?.opponent ?? '待定'}。` +
          `请以生涯纪录片口吻开场：选秀夜的回忆、初进更衣室面对老大哥们的场面、教练对我的期待与质疑，最后给出行动选项。`,
      );
    },
    [sendTurn],
  );

  /** 开赛：前端构造初始比赛状态并直写变量，然后让 AI 演出跳球 */
  const handleStartMatch = useCallback(async () => {
    const career = stat.生涯;
    const offCourt = stat.场外;
    if (!career) return;
    const myTeamId = career.球队;
    const next = offCourt?.日程?.下一场 ?? '';
    if (!/^(vs|@)\s+/i.test(next)) {
      toastr.warning('当前没有可进入的正式比赛。');
      return;
    }
    const isHome = !next.startsWith('@');
    const oppId = next.replace(/^(vs|@)\s*/i, '').trim();
    const homeId = isHome ? myTeamId : oppId;
    const awayId = isHome ? oppId : myTeamId;
    const mySide: Side = isHome ? '主' : '客';

    const protagonistKey = (career as any).附身球员 ?? '';
    const league = stat.联盟;
    const projection = careerPlayerProjection(career);
    if (projection) registerCustomPlayer(projection);
    const resolvePlayer = playerResolverForStat(stat);
    const homeFullRoster = getRosterForLeague(homeId, league);
    const awayFullRoster = getRosterForLeague(awayId, league);
    const homeAvailable = homeFullRoster.filter(player => getPlayerAvailability(player.name, league).available);
    const awayAvailable = awayFullRoster.filter(player => getPlayerAvailability(player.name, league).available);
    if (homeAvailable.length < 5 || awayAvailable.length < 5) {
      toastr.error('可出战球员不足5人，无法开始比赛。');
      return;
    }

    const protagonistStarts = career.球队角色 === '首发' || career.球队角色 === '核心';
    const protagonistAvailable = getPlayerAvailability(protagonistKey, league).available;
    const homeCoach = league?.教练?.[homeId] ?? null;
    const awayCoach = league?.教练?.[awayId] ?? null;
    const homeTactics = deriveTeamTactics(homeAvailable, homeCoach);
    const awayTactics = deriveTeamTactics(awayAvailable, awayCoach);
    const entriesFor = (
      teamId: string,
      roster: typeof homeAvailable,
      tactics: StructuredTeamTactics,
      coachProfile: typeof homeCoach,
    ) =>
      buildDynamicDepthChart(roster, {
        tactics,
        coachProfile,
        forcedStarter: teamId === myTeamId && protagonistStarts && protagonistAvailable ? protagonistKey : null,
      }).starters;
    const homeEntries = entriesFor(homeId, homeAvailable, homeTactics, homeCoach);
    const awayEntries = entriesFor(awayId, awayAvailable, awayTactics, awayCoach);
    const homeCenter = resolvePlayer(homeEntries.find(entry => entry.pos === 'C')?.key ?? homeEntries.at(-1)?.key ?? '');
    const awayCenter = resolvePlayer(awayEntries.find(entry => entry.pos === 'C')?.key ?? awayEntries.at(-1)?.key ?? '');
    const jumpScore = (player: typeof homeCenter) =>
      player ? player.height_cm * 0.6 + player.attrs.strength * 0.3 + player.overall * 0.1 : 0;
    const openingPossession: Side = jumpScore(homeCenter) >= jumpScore(awayCenter) ? '主' : '客';
    const offenseEntries = openingPossession === '主' ? homeEntries : awayEntries;
    const defenseEntries = openingPossession === '主' ? awayEntries : homeEntries;
    const offenseTactics = openingPossession === '主' ? homeTactics : awayTactics;
    const defenseTactics = openingPossession === '主' ? awayTactics : homeTactics;
    const 站位 = buildFormation({
      offense: offenseEntries,
      defense: defenseEntries,
      offenseSide: openingPossession,
      tactic: offenseTactics.offense,
      defenseScheme: defenseTactics.defense,
      ballHolder: offenseEntries[0]?.key ?? '',
      attackRight: openingPossession === '主',
    });
    const homeOnCourt = homeEntries.map(entry => entry.key);
    const awayOnCourt = awayEntries.map(entry => entry.key);
    const homeBench = homeAvailable.map(player => player.name).filter(key => !homeOnCourt.includes(key));
    const awayBench = awayAvailable.map(player => player.name).filter(key => !awayOnCourt.includes(key));
    const 球员状态: Record<string, OnCourtStatus> = {};
    [...homeFullRoster, ...awayFullRoster].forEach(player => {
      球员状态[player.name] = freshStatus();
    });
    const match: MatchState = {
      进行中: true,
      对阵: { 主队: homeId, 客队: awayId },
      节次: 1,
      剩余秒数: 720,
      投篮时钟: 24,
      比分: { 主: 0, 客: 0 },
      球权: openingPossession,
      跳球胜方: openingPossession,
      战术: { 主: homeTactics, 客: awayTactics },
      站位,
      本节球队犯规: { 主: 0, 客: 0 },
      暂停: { 主: 7, 客: 7 },
      阵容: {
        主: { 场上: homeOnCourt, 替补: homeBench },
        客: { 场上: awayOnCourt, 替补: awayBench },
      },
      回合阶段: '常规回合',
      待处理情境: { type: 'none' },
      回合情境: `${openingPossession}队赢得跳球，常规对位`,
      球员状态,
      回合摘要: `${openingPossession}队赢得跳球`,
    };
    match.轮换 = createRotationPlan(match, resolvePlayer, {
      league,
      phase: league?.阶段,
      protagonist: { teamId: myTeamId, key: protagonistKey, role: career.球队角色 },
    });
    await insertOrAssignVariables({ stat_data: { 比赛: match } }, { type: 'chat' });
    setStat(s => ({ ...s, 比赛: match }));
    await sendTurn(
      `【开赛】${getTeam(homeId)?.cn} vs ${getTeam(awayId)?.cn}，我效力于${mySide}队。` +
        (protagonistAvailable ? '' : `我因${getPlayerAvailability(protagonistKey, league).reason ?? '伤病'}本场休战，只能在场边观察；不得安排我登场。`) +
        `前端已按双方中锋身高、力量与总评判定由${openingPossession}队赢得跳球。请演出赛前入场、首发介绍与这个既定跳球结果；不得修改球权、比分、时间或其他比赛变量，然后把镜头交给我。`,
    );
  }, [stat, sendTurn]);

  /** 场上动作：判定 → 拼指令 → 发送 */
  const handleAction = useCallback(
    async (choice: ActionChoice) => {
      const match = stat.比赛;
      const career = stat.生涯;
      if (!match || !career) return;
      const resolvePlayer = playerResolverForStat(stat);

      if (choice.action === '观察' || choice.action === '模拟一个回合') {
        const cpu = simulatePossession(match, resolvePlayer);
        const rotated = cpu.possessionsCompleted ? applyAutomaticRotation(cpu.match, resolvePlayer) : cpu.match;
        const patch: Record<string, unknown> = { 比赛: rotated };
        if (match.进行中 && !rotated.进行中) {
          const nextCareer = finishCareerGame(career, rotated);
          Object.assign(patch, buildPostGamePatch(stat, nextCareer, rotated));
        }
        await sendTurn(
          `【CPU回合模拟】主角当前不直接控制这一攻。前端已完整模拟一个 possession：${cpu.summary}。请用100-220字简要演出这次攻防，不得改判或修改数值。`,
          { transformAssistant: async raw => stripMatchVariableBlocks(raw, patch) },
        );
        return;
      }

      const mySide: Side = match.对阵.主队 === career.球队 ? '主' : '客';
      const oppSide: Side = mySide === '主' ? '客' : '主';
      // v3 只允许控制主角；忽略任何伪造的 actorKey。
      const actorKey = career.附身球员;
      const actor = resolvePlayer(actorKey);
      if (!actor) return;
      const partner = choice.partnerKey ? (resolvePlayer(choice.partnerKey) ?? null) : null;

      // 对位者：距行动人最近的对方球员
      const actorSpot = match.站位[mySide]?.find(s => s.球员 === actorKey);
      const oppSpots = match.站位[oppSide] ?? [];
      let defenderKey: string | null = null;
      let nearestDist = Infinity;
      if (actorSpot) {
        for (const os of oppSpots) {
          const d = Math.hypot(os.x - actorSpot.x, os.y - actorSpot.y);
          if (d < nearestDist) {
            nearestDist = d;
            defenderKey = os.球员;
          }
        }
      }
      const defender = defenderKey ? (resolvePlayer(defenderKey) ?? null) : null;
      const defenderStatus = defenderKey ? match.球员状态[defenderKey] : undefined;
      const defenders = oppSpots.map(spot => resolvePlayer(spot.球员)).filter((player): player is NonNullable<typeof player> => Boolean(player));

      let partnerDefender = null;
      if (['挡拆突破', '顺下传球', '外弹传球'].includes(choice.action) && choice.partnerKey) {
        const partnerSpot = match.站位[mySide]?.find(spot => spot.球员 === choice.partnerKey);
        if (partnerSpot) {
          const candidates = oppSpots.filter(spot => spot.球员 !== defenderKey);
          const nearest = [...candidates].sort(
            (a, b) =>
              Math.hypot(a.x - partnerSpot.x, a.y - partnerSpot.y) -
              Math.hypot(b.x - partnerSpot.x, b.y - partnerSpot.y),
          )[0];
          partnerDefender = nearest ? (resolvePlayer(nearest.球员) ?? null) : null;
        }
      }

      const situation: SituationContext = {
        isHome: mySide === '主',
        isClutch: match.节次 >= 4 && match.剩余秒数 <= 120 && Math.abs(match.比分.主 - match.比分.客) <= 5,
        coverage: nearestDist > 18 ? 'open' : nearestDist < 8 ? 'tight' : 'normal',
        mismatch: match.回合情境.includes('错位'),
        defenderFouls: defenderStatus?.犯规 ?? 0,
        actorSpot,
        defenderSpots: oppSpots,
        teammateSpots: match.站位[mySide],
        offenseTactic: match.战术[match.球权],
        defenseTactic: match.战术[match.球权 === '主' ? '客' : '主'],
        hotZoneModifier: actionHotZone(career, choice.action),
        badgeModifier: badgeModifier(actionBadgeLevels(career, choice.action)),
      };

      const resolution = resolveAction({
        action: choice.action,
        actor,
        actorStatus: match.球员状态[actorKey] ?? freshStatus(),
        defender,
        defenders,
        partner,
        partnerDefender,
        actionSide: mySide,
        match,
        situation,
      });

      await sendTurn(buildTurnPrompt({ match, resolution }), {
        transformAssistant: async raw => {
          const settled = await settleAssistantResponse(
            raw,
            resolution.contract,
            match,
            async repairPrompt => generatedText(await generate({ should_stream: false, user_input: repairPrompt })),
          );
          if (settled.validationErrors.length) console.warn('[nba2k] settlement repaired/fallback', settled.validationErrors);

          let finalMatch = settled.nextMatch;
          let continuationSummary = '';
          const family = resolution.intent.family;
          const branchScored = Boolean(settled.settlement.branch.scoreDelta.主 || settled.settlement.branch.scoreDelta.客);
          const offenseStillOurs =
            finalMatch.进行中 &&
            finalMatch.球权 === mySide &&
            finalMatch.回合阶段 === '常规回合' &&
            !branchScored &&
            (family === '传球' || family === '挡拆' || family === '无球' || choice.action === '突破分球');
          const opponentStillAttacking =
            finalMatch.进行中 &&
            family === '防守' &&
            finalMatch.球权 === oppSide &&
            finalMatch.回合阶段 === '常规回合' &&
            !branchScored;

          if (offenseStillOurs || opponentStillAttacking) {
            const continuationSide = offenseStillOurs ? mySide : oppSide;
            const passLike = offenseStillOurs &&
              (family === '传球' || choice.action === '突破分球' || choice.action === '顺下传球' || choice.action === '外弹传球');
            const preferredActor = opponentStillAttacking
              ? defenderKey
              : choice.action === '挡拆突破' || family === '无球'
                ? actorKey
                : choice.partnerKey;
            const scoreBefore = finalMatch.比分[continuationSide];
            const continuation = continuePossessionAfterAdvantage(finalMatch, continuationSide, preferredActor, resolvePlayer);
            finalMatch = continuation.match;
            continuationSummary = continuation.summary;

            if (passLike && finalMatch.比分[mySide] > scoreBefore) {
              const passerStatus = finalMatch.球员状态[actorKey];
              if (passerStatus) {
                finalMatch = {
                  ...finalMatch,
                  球员状态: {
                    ...finalMatch.球员状态,
                    [actorKey]: { ...passerStatus, 助攻: passerStatus.助攻 + 1 },
                  },
                };
              }
            }
          }

          if (finalMatch.进行中 && finalMatch.回合阶段 === '常规回合' && finalMatch.投篮时钟 >= 20) {
            finalMatch = applyAutomaticRotation(finalMatch, resolvePlayer);
          }

          let nextCareer = updateCareerDynamics(career, resolution, settled.settlement);
          let extras: Record<string, unknown> = { 生涯: nextCareer };
          if (match.进行中 && !finalMatch.进行中) {
            nextCareer = finishCareerGame(nextCareer, finalMatch);
            extras = buildPostGamePatch(stat, nextCareer, finalMatch);
          }

          const narrativeSource = continuationSummary
            ? `${raw}\n\n随后这一攻继续完成：${continuationSummary}。`
            : raw;
          return buildCanonicalAssistant(narrativeSource, settled.settlement, finalMatch, extras);
        },
      });
    },
    [stat, sendTurn],
  );

  const handleAutoSimulation = useCallback(async () => {
    const match = stat.比赛;
    const career = stat.生涯;
    if (!match || !career || !match.进行中 || simulationMode === '全回合' || busyRef.current) return;
    if (match.回合阶段 !== '常规回合') return;

    const resolvePlayer = playerResolverForStat(stat);
    const segment = simulateUntilInterruption(match, simulationMode, career.附身球员, resolvePlayer);
    if (segment.possessions <= 0) {
      if (segment.match !== match) setStat(current => ({ ...current, 比赛: segment.match }));
      return;
    }

    const patch: Record<string, unknown> = { 比赛: segment.match };
    if (match.进行中 && !segment.match.进行中) {
      const nextCareer = finishCareerGame(career, segment.match);
      Object.assign(patch, buildPostGamePatch(stat, nextCareer, segment.match));
    }

    const digest = segment.summaries.slice(-8).join('\n');
    await sendTurn(
      `【CPU连续模拟】当前比赛节奏：${simulationMode}。前端使用同一 PossessionEngine 连续模拟了 ${segment.possessions} 个真实回合，不得重算。\n` +
        `回合摘要：\n${digest}\n` +
        `${segment.interruptionReason ? `暂停原因：${segment.interruptionReason}。` : ''}请用150-320字把这段比赛压缩成连贯现场叙事；比分、技术统计、球权、时间与体力全部以变量结果为准。`,
      { transformAssistant: async raw => stripMatchVariableBlocks(raw, patch) },
    );
  }, [stat, simulationMode, sendTurn]);

  useEffect(() => {
    const match = stat.比赛;
    if (simulationMode === '全回合' || busy || !match?.进行中 || match.回合阶段 !== '常规回合') return;
    const timer = window.setTimeout(() => void handleAutoSimulation(), 120);
    return () => window.clearTimeout(timer);
  }, [simulationMode, busy, stat.比赛, handleAutoSimulation]);

  /** 暂停与换人是确定性管理操作：先写状态，再让 AI 只演出既定结果。 */
  const handleTimeout = useCallback(
    async (side: Side) => {
      const match = stat.比赛;
      if (!match || match.暂停[side] <= 0 || busyRef.current) return;
      const nextMatch: MatchState = {
        ...match,
        暂停: { ...match.暂停, [side]: match.暂停[side] - 1 },
        球员状态: Object.fromEntries(Object.entries(match.球员状态).map(([key, status]) => [key, { ...status, 体力: Math.min(100, status.体力 + (match.阵容[side].场上.includes(key) ? 5 : 3)) }])),
        回合阶段: '常规回合',
        待处理情境: { type: 'none' },
        回合情境: `${side}队请求暂停并完成布置`,
        回合摘要: `${side}队请求暂停（剩余 ${match.暂停[side] - 1} 次）`,
      };
      await insertOrAssignVariables({ stat_data: { 比赛: nextMatch } }, { type: 'chat' });
      setStat(current => ({ ...current, 比赛: nextMatch }));
      await sendTurn(
        `【比赛管理】${side}队已由前端确定性扣除一次暂停，当前剩余${nextMatch.暂停[side]}次。` +
          `请演出教练布置与球员反应；不得修改任何比赛数值。`,
        { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 比赛: nextMatch }) },
      );
    },
    [stat, sendTurn],
  );

  const handleSubstitution = useCallback(
    async ({ side, outKey, inKey }: SubstitutionChoice) => {
      const match = stat.比赛;
      if (!match || match.回合阶段 !== '死球' || busyRef.current) return;
      const resolvePlayer = playerResolverForStat(stat);
      const rotation = match.阵容[side];
      if (!rotation.场上.includes(outKey) || !rotation.替补.includes(inKey)) return;

      const nextLineup = {
        场上: rotation.场上.map(key => (key === outKey ? inKey : key)),
        替补: rotation.替补.map(key => (key === inKey ? outKey : key)),
      };
      const nextSpots = match.站位[side].map(spot => (spot.球员 === outKey ? { ...spot, 球员: inKey } : spot));
      const nextMatch: MatchState = {
        ...match,
        阵容: { ...match.阵容, [side]: nextLineup },
        站位: { ...match.站位, [side]: nextSpots },
        球员状态: {
          ...match.球员状态,
          [inKey]: match.球员状态[inKey] ?? freshStatus(),
        },
        回合情境: `${side}队死球换人：${outKey}下，${inKey}上`,
        回合摘要: `${resolvePlayer(outKey)?.cn ?? outKey}被${resolvePlayer(inKey)?.cn ?? inKey}换下`,
        回合阶段: '常规回合',
        待处理情境: { type: 'none' },
      };
      await insertOrAssignVariables({ stat_data: { 比赛: nextMatch } }, { type: 'chat' });
      setStat(current => ({ ...current, 比赛: nextMatch }));
      await sendTurn(
        `【比赛管理】前端已完成${side}队换人：${resolvePlayer(outKey)?.cn ?? outKey}下，${resolvePlayer(inKey)?.cn ?? inKey}上。` +
          `请简短演出换人，不得修改比赛数值。`,
        { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 比赛: nextMatch }) },
      );
    },
    [stat, sendTurn],
  );

  const handleFreeThrow = useCallback(async () => {
    const match = stat.比赛;
    if (!match || match.待处理情境.type !== 'freeThrow' || busyRef.current) return;
    const pending = match.待处理情境;
    const resolvePlayer = playerResolverForStat(stat);
    const shooter = resolvePlayer(pending.shooter);
    const made = Math.floor(Math.random() * 100) + 1 <= (shooter?.attrs.freeThrow ?? 70);
    const shooterStatus = match.球员状态[pending.shooter] ?? freshStatus();
    const remaining = pending.remaining - 1;
    const nextPossession: Side = remaining > 0 ? pending.shootingSide : pending.shootingSide === '主' ? '客' : '主';
    const nextSpots = {
      主: match.站位.主.map(spot => ({ ...spot, 持球: false })),
      客: match.站位.客.map(spot => ({ ...spot, 持球: false })),
    };
    if (remaining === 0 && nextSpots[nextPossession][0]) nextSpots[nextPossession][0].持球 = true;
    let nextMatch: MatchState = {
      ...match,
      比分: { ...match.比分, [pending.shootingSide]: match.比分[pending.shootingSide] + (made ? 1 : 0) },
      球权: nextPossession,
      投篮时钟: remaining > 0 ? match.投篮时钟 : 24,
      站位: nextSpots,
      球员状态: {
        ...match.球员状态,
        [pending.shooter]: { ...shooterStatus, 得分: shooterStatus.得分 + (made ? 1 : 0), 罚球出手: shooterStatus.罚球出手 + 1, 罚球命中: shooterStatus.罚球命中 + (made ? 1 : 0) },
      },
      回合阶段: remaining > 0 ? '罚球结算' : '常规回合',
      待处理情境: remaining > 0 ? { ...pending, remaining } : { type: 'none' },
      回合情境: `${shooter?.cn ?? pending.shooter}罚球${made ? '命中' : '不中'}`,
      回合摘要: `罚球${made ? '命中' : '不中'}，${remaining > 0 ? `还剩${remaining}罚` : `${nextPossession}队球权`}`,
    };
    nextMatch = advancePeriodIfNeeded(nextMatch);
    await insertOrAssignVariables({ stat_data: { 比赛: nextMatch } }, { type: 'chat' });
    setStat(current => ({ ...current, 比赛: nextMatch }));
    await sendTurn(`【罚球】前端按${shooter?.cn ?? pending.shooter}的罚球能力完成骰子判定：${made ? '命中' : '不中'}。请简短演出，不修改任何数值。`, { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 比赛: nextMatch }) });
  }, [stat, sendTurn]);

  const handleTacticRequest = useCallback(async (patch: Partial<StructuredTeamTactics>) => {
    const match = stat.比赛;
    const career = stat.生涯;
    if (!match || !career || match.回合阶段 !== '死球' || busyRef.current) return;
    const mySide: Side = match.对阵.主队 === career.球队 ? '主' : '客';
    const accepted = Math.floor(Math.random() * 100) + 1 <= career.教练信任;
    const nextMatch: MatchState = {
      ...match,
      战术: accepted ? { ...match.战术, [mySide]: { ...match.战术[mySide], ...patch } } : match.战术,
      回合阶段: '常规回合', 待处理情境: { type: 'none' },
      回合情境: accepted ? `教练接受主角战术建议：${JSON.stringify(patch)}` : '教练拒绝战术建议并维持原方案',
      回合摘要: accepted ? '战术调整获批' : '教练维持原战术',
    };
    await insertOrAssignVariables({ stat_data: { 比赛: nextMatch } }, { type: 'chat' });
    setStat(current => ({ ...current, 比赛: nextMatch }));
    await sendTurn(`【战术建议】我向教练提出${JSON.stringify(patch)}，按教练信任${career.教练信任}进行前端骰子后，结果为${accepted ? '接受' : '拒绝'}。请演出沟通，不修改数值。`, { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 比赛: nextMatch }) });
  }, [stat, sendTurn]);

  const handleUpgrade = useCallback(async (group: UpgradeGroupKey) => {
    const career = stat.生涯;
    if (!career || busyRef.current) return;
    const nextCareer = upgradeCareer(career, group);
    if (nextCareer === career) { toastr.warning('成长点不足或已达到潜力上限'); return; }
    await insertOrAssignVariables({ stat_data: { 生涯: nextCareer } }, { type: 'chat' });
    setStat(current => ({ ...current, 生涯: nextCareer }));
    toastr.success(`升级完成，总评 ${nextCareer.能力.overall}`);
  }, [stat]);

  const handleTrain = useCallback(async () => {
    const career = stat.生涯;
    const offCourt = stat.场外;
    if (!career || !offCourt || busyRef.current) return;
    const result = trainCareer(career, offCourt);
    if (!result.trained) { toastr.warning('今天已经完成训练'); return; }
    await insertOrAssignVariables({ stat_data: { 生涯: result.career, 场外: result.offCourt } }, { type: 'chat' });
    setStat(current => ({ ...current, 生涯: result.career, 场外: result.offCourt }));
    await sendTurn('【训练】我完成了今天的专项训练，前端已确定性增加1成长点并推进日期。请简短描写训练内容与教练反馈，不再修改数值。', { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 生涯: result.career, 场外: result.offCourt }) });
  }, [stat, sendTurn]);

  const handlePrepareMarket = useCallback(async () => {
    const career = stat.生涯;
    const league = stat.联盟;
    if (!career || !league || busyRef.current) return;

    const projection = careerPlayerProjection(career);
    if (projection) registerCustomPlayer(projection);

    let nextLeague = league;
    let offers: MarketOffer[] = [];
    let label = '';
    let draftNote = '';
    if (league.阶段 === '休赛期') {
      const drafted = ensureOffseasonDraft(league, career.球队);
      const result = prepareOffseasonMarket(
        drafted.league,
        career.附身球员,
        getPlayerForLeague,
        getRosterForLeague,
        getAllPlayersForLeague,
      );
      nextLeague = result.league;
      offers = result.protagonistOffers;
      label = result.protagonistMustSign ? '自由市场' : '续约市场';
      if (drafted.newlyCompleted) {
        draftNote = `\n【本届选秀】\n${draftSummary(drafted.picks, career.球队)}\n`;
      }
    } else {
      if (!isTradeWindowOpen(league.日期)) {
        toastr.warning('当前不在交易窗口。');
        return;
      }
      nextLeague = preparePlayerTradeMarket(
        league,
        career.附身球员,
        getPlayerForLeague,
        getRosterForLeague,
      );
      offers = nextLeague.市场报价.filter(
        offer => offer.playerKey === career.附身球员 && offer.type === '交易' && offer.status === '待定',
      );
      label = '交易市场';
    }

    await insertOrAssignVariables({ stat_data: { 联盟: nextLeague } }, { type: 'chat' });
    setStat(current => ({ ...current, 联盟: nextLeague }));
    if (!offers.length) {
      if (draftNote) {
        await sendTurn(
          draftNote + '\n本次没有生成需要我处理的续约/自由市场正式报价。请只演出选秀夜和球队新秀加入后的联盟反应，不得改动选秀结果。',
          { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 联盟: nextLeague }) },
        );
      } else {
        toastr.info('当前没有满足球队需求与价值条件的正式报价。');
      }
      return;
    }
    await sendTurn(
      draftNote +
      `【${label}】前端根据球队位置需求、阵容深度、战绩、球员市场价值与合同条件生成了固定报价：\n` +
      offers.map(offer => `- ${offerSummary(offer)}`).join('\n') +
      '\n这些报价已经写入联盟状态，不得由叙事模型新增、删除或改价；只需演出经纪人/管理层如何把报价摆到我面前。',
      { transformAssistant: async raw => stripMatchVariableBlocks(raw, { 联盟: nextLeague }) },
    );
  }, [stat, sendTurn]);

  const handleAcceptOffer = useCallback(async (offerId: string) => {
    const career = stat.生涯;
    const offCourt = stat.场外;
    const league = stat.联盟;
    if (!career || !offCourt || !league || busyRef.current) return;
    const offer = league.市场报价.find(item => item.id === offerId && item.status === '待定');
    if (!offer || offer.playerKey !== career.附身球员) return;

    const projection = careerPlayerProjection(career);
    if (projection) registerCustomPlayer(projection);
    let nextLeague = applyMarketOffer(league, offer, getPlayerForLeague);
    const previousTeam = career.球队;
    const moved = offer.teamId !== previousTeam;
    const nextRole = moved
      ? roleAfterRosterChange(career.附身球员, offer.teamId, nextLeague)
      : career.球队角色;
    const nextCareer = {
      ...career,
      球队: offer.teamId,
      球队角色: nextRole,
      教练信任: moved ? 40 : career.教练信任,
    };

    const contract = contractForPlayer(career.附身球员, nextLeague, getPlayerForLeague);
    const nextGame = moved && league.阶段 === '常规赛'
      ? getScheduledGame(offer.teamId, nextLeague.赛程索引, nextLeague.赛季序号)
      : null;
    const nextOffCourt = {
      ...offCourt,
      合同: contract ? {
        球队: offer.teamId,
        年限: Math.max(
          0,
          contract.expiresAfterSeason - nextLeague.赛季序号 + (league.阶段 === '休赛期' ? 0 : 1),
        ),
        年薪: contract.annualSalary,
        到期赛季: contractExpirySeason(contract.expiresAfterSeason),
      } : offCourt.合同,
      队友好感: moved
        ? Object.fromEntries(
            getRosterForLeague(offer.teamId, nextLeague)
              .filter(player => player.name !== career.附身球员)
              .slice(0, 10)
              .map(player => [player.name, 45]),
          )
        : offCourt.队友好感,
      日程: moved && nextGame
        ? { ...offCourt.日程, 下一场: formatScheduledOpponent(nextGame) }
        : offCourt.日程,
    };

    const hook = {
      id: `player-market-${offer.id}`,
      type: offer.type === '交易' ? '交易' as const : '合同' as const,
      title: offer.type === '交易' ? '交易正式完成' : offer.type === '续约' ? '续约正式完成' : '自由市场签约',
      detail: offer.type === '交易'
        ? `${career.姓名}从${previousTeam}被交易至${offer.teamId}；主要回报为${offer.outgoingPlayerKey ?? '筹码'}。阵容、轮换与球队体系从下一场开始按新名单自动重算。`
        : `${career.姓名}与${offer.teamId}签下${offer.years}年合同，年薪${Math.round(offer.annualSalary / 10_000)}万美元。`,
      createdDate: nextLeague.日期,
    };
    nextLeague = { ...nextLeague, 故事钩子: [...nextLeague.故事钩子, hook] };

    const nextProjection = careerPlayerProjection(nextCareer);
    if (nextProjection) registerCustomPlayer(nextProjection);
    const patch = { 生涯: nextCareer, 场外: nextOffCourt, 联盟: nextLeague };
    await insertOrAssignVariables({ stat_data: patch }, { type: 'chat' });
    setStat(current => ({ ...current, ...patch }));
    await sendTurn(
      `【正式落地】我接受了这份${offer.type}报价：${offerSummary(offer)}。前端已经完成合同和Roster变更，当前球队为${getTeam(offer.teamId)?.cn ?? offer.teamId}，球队角色为${nextRole}。请演出签字、官宣或更衣室反应，不得改动交易/签约结果。`,
      { transformAssistant: async raw => stripMatchVariableBlocks(raw, patch) },
    );
  }, [stat, sendTurn]);

  const handleNextSeason = useCallback(async () => {
    const career = stat.生涯;
    const offCourt = stat.场外;
    const league = stat.联盟;
    if (!career || !offCourt || !league || league.阶段 !== '休赛期' || busyRef.current) return;

    const currentProjection = careerPlayerProjection(career);
    if (currentProjection) registerCustomPlayer(currentProjection);

    const drafted = ensureOffseasonDraft(league, career.球队);
    const market = prepareOffseasonMarket(
      drafted.league,
      career.附身球员,
      getPlayerForLeague,
      getRosterForLeague,
      getAllPlayersForLeague,
    );
    let marketLeague = market.league;
    if (market.npcMoves > 0 && !marketLeague.故事钩子.some(hook => hook.id === `offseason-market-${league.赛季}`)) {
      marketLeague = {
        ...marketLeague,
        故事钩子: [...marketLeague.故事钩子, {
          id: `offseason-market-${league.赛季}`,
          type: '合同',
          title: '联盟自由市场开始重组阵容',
          detail: `本轮共有${market.npcMoves}名到期球员完成确定性签约/续约；球队依据位置需求、阵容深度、竞争力和市场价值做选择。`,
          createdDate: marketLeague.日期,
        }],
      };
    }

    if (market.protagonistMustSign) {
      const patch = { 联盟: marketLeague };
      await insertOrAssignVariables({ stat_data: patch }, { type: 'chat' });
      setStat(current => ({ ...current, ...patch }));
      const offers = market.protagonistOffers;
      await sendTurn(
        (drafted.newlyCompleted ? `【选秀夜】前端已完成本届两轮选秀：\n${draftSummary(drafted.picks, career.球队)}\n\n` : '') +
        '【自由市场必须决策】我的上一份合同已经到期，前端已完成其他球队的休赛期市场，并生成了固定的正式报价：\n' +
          offers.map(offer => `- ${offerSummary(offer)}`).join('\n') +
          '\n在接受其中一份合同前不能进入下一赛季。报价已写入存档，叙事模型不得重新报价。',
        { transformAssistant: async raw => stripMatchVariableBlocks(raw, patch) },
      );
      return;
    }

    // 未接受的提前续约报价视为暂不续约，但原合同继续有效。
    marketLeague = {
      ...marketLeague,
      市场报价: marketLeague.市场报价.map(offer =>
        offer.playerKey === career.附身球员 && offer.status === '待定'
          ? { ...offer, status: '拒绝' as const }
          : offer,
      ),
    };

    const severeInjuries = marketLeague.伤病.filter(
      item => item.球员 === career.附身球员 && item.严重度 === '严重',
    ).length;
    const agedCareer = advanceCareerLifecycleOneSeason(career, severeInjuries);
    const advanced = beginNextSeason(marketLeague, career.球队);
    let nextLeague = advanced.league;
    const nextCareer = {
      ...agedCareer,
      赛季: nextLeague.赛季,
      赛程索引: 1,
      教练评估: { 最近评分: [], 上次角色调整场次: 0 },
      赛季统计: { 场均得分: 0, 场均篮板: 0, 场均助攻: 0, 出场数: 0 },
    };
    if (agedCareer.退役状态 !== career.退役状态) {
      nextLeague = {
        ...nextLeague,
        故事钩子: [
          ...nextLeague.故事钩子,
          {
            id: `career-retirement-${nextLeague.赛季序号}-${agedCareer.退役状态}`,
            type: '球队关系' as const,
            title: agedCareer.退役状态 === '退役' ? '生涯走到终点' : '退役话题升温',
            detail: agedCareer.退役状态 === '退役'
              ? `${career.姓名}在${agedCareer.年龄}岁正式结束球员生涯。`
              : `${career.姓名}进入生涯暮年，年龄、能力、耐久与球队角色让退役成为现实议题。`,
            createdDate: nextLeague.日期,
          },
        ],
      };
    }

    const nextContract = contractForPlayer(career.附身球员, nextLeague, getPlayerForLeague);
    const nextOffCourt = {
      ...offCourt,
      合同: nextContract ? {
        球队: career.球队,
        年限: Math.max(0, nextContract.expiresAfterSeason - nextLeague.赛季序号 + 1),
        年薪: nextContract.annualSalary,
        到期赛季: contractExpirySeason(nextContract.expiresAfterSeason),
      } : offCourt.合同,
      日程: {
        日期: nextLeague.日期,
        下一场: agedCareer.退役状态 === '退役'
          ? '生涯已退役'
          : formatScheduledOpponent(advanced.nextGame),
        待办: agedCareer.退役状态 === '退役' ? ['生涯总结'] : ['新赛季报到'],
      },
    };

    const projection = careerPlayerProjection(nextCareer);
    if (projection) registerCustomPlayer(projection);
    const patch = { 生涯: nextCareer, 场外: nextOffCourt, 联盟: nextLeague, 比赛: null };
    await insertOrAssignVariables({ stat_data: patch }, { type: 'chat' });
    setStat(current => ({ ...current, ...patch }));
    await sendTurn(
      agedCareer.退役状态 === '退役'
        ? `【休赛期结算】前端生命周期系统已判定我在${agedCareer.年龄}岁正式退役。请以生涯纪录片口吻总结，不得改变退役结论或能力数值。`
        : (drafted.newlyCompleted ? `【选秀夜】本届选秀已由前端完成：\n${draftSummary(drafted.picks, career.球队)}\n\n` : '') + `【新赛季】休赛期阵容市场与生命周期结算已经完成，进入${nextLeague.赛季}赛季。我现在${agedCareer.年龄}岁，总评${agedCareer.能力.overall}，效力${getTeam(nextCareer.球队)?.cn ?? nextCareer.球队}。请演出训练营报到和新赛季期待，不得重新计算合同、Roster或能力。`,
      { transformAssistant: async raw => stripMatchVariableBlocks(raw, patch) },
    );
  }, [stat, sendTurn]);

  const handleReset = useCallback(() => {
    if (!window.confirm('确定清除这段聊天中的 NBA2K 存档并重新开始吗？此操作不可撤销。')) return;
    const variables = getVariables({ type: 'chat' });
    delete variables.stat_data;
    replaceVariables(variables, { type: 'chat' });
    setStat(readStat());
    setStartScreen('splash');
    setNarrative('');
    setOptions([]);
    setFreeText('');
    setShowBoxScore(false);
  }, []);

  const sendFreeText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (isInMatch(stat)) {
        await sendTurn(
          `<场上对话>${trimmed}</场上对话>\n这是对话、垃圾话或战术表达，不是比赛动作；只回应交流，不推进时钟、比分、球权、体力、站位或其他比赛变量。`,
        );
        return;
      }
      await sendTurn(trimmed);
    },
    [stat, sendTurn],
  );

  const currentTeamPower = useMemo(() => {
    if (!stat.联盟 || !stat.生涯) return null;
    const snapshot = buildLeagueRosterSnapshot(stat.联盟);
    const profiles = buildLeagueSimulationProfiles(stat.联盟, snapshot.byTeam);
    const profile = profiles[stat.生涯.球队];
    if (!profile) return null;
    const ranking = Object.values(profiles).sort((a, b) => b.power - a.power || b.netRating - a.netRating);
    return {
      profile,
      rank: ranking.findIndex(item => item.teamId === profile.teamId) + 1,
      total: ranking.length,
    };
  }, [stat.联盟, stat.生涯]);

  // ---------- 渲染 ----------

  if (stat.validationErrors.length > 0) {
    return (
      <div className="nba2k-app state-recovery">
        <div className="recovery-kicker">SAVE DATA REJECTED</div>
        <h2>存档格式与 NBA2K v3 不兼容</h2>
        <p>为防止错误变量让比赛界面崩溃，本次没有载入旧状态。</p>
        <pre>{stat.validationErrors.join('\n')}</pre>
        <button onClick={handleReset}>清除存档并重新开始</button>
      </div>
    );
  }

  if (!stat.生涯) {
    if (startScreen === 'splash') return <SplashScreen onSelect={m => setStartScreen(m)} />;
    if (startScreen === 'custom')
      return <CreatePlayer onCreate={f => void handleCreateCustom(f)} onBack={() => setStartScreen('splash')} />;
    return <SetupScreen onStart={r => void handleSetup(r)} onBack={() => setStartScreen('splash')} />;
  }

  const match = stat.比赛;
  const inMatch = isInMatch(stat);
  const mySide: Side = match && match.对阵.主队 === stat.生涯.球队 ? '主' : '客';
  const protagonist = (stat.生涯 as any).附身球员 ?? '';

  return (
    <div className="nba2k-app">
      <div className="game-utility-bar">
        <span>MYCAREER · SAVE V{stat.版本}</span>
        <button disabled={busy} onClick={handleReset}>重新开始</button>
      </div>
      {inMatch && match ? (
        <>
          <div className="simulation-mode-bar">
            <span>比赛节奏</span>
            {(['全回合', '精简比赛', '关键时刻'] as SimulationMode[]).map(mode => (
              <button
                key={mode}
                className={simulationMode === mode ? 'active' : ''}
                disabled={busy}
                onClick={() => {
                  setSimulationMode(mode);
                  try { localStorage.setItem(SIMULATION_MODE_KEY, mode); } catch {}
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          <ScoreBoard match={match} />
          <CourtView
            站位={match.站位}
            主队={match.对阵.主队}
            客队={match.对阵.客队}
            球员状态={match.球员状态}
            主角={protagonist}
          />
          <div className="round-summary">{match.回合摘要}</div>
          <button className="toggle-box-score" onClick={() => setShowBoxScore(v => !v)}>
            {showBoxScore ? '收起数据' : '技术统计'}
          </button>
          {showBoxScore && <BoxScore match={match} />}
          <ActionPanel
            match={match}
            mySide={mySide}
            protagonist={protagonist}
            disabled={busy}
            onChoose={c => void handleAction(c)}
            onTimeout={side => void handleTimeout(side)}
            onSubstitution={choice => void handleSubstitution(choice)}
            onFreeThrow={() => void handleFreeThrow()}
            onTacticRequest={patch => void handleTacticRequest(patch)}
          />
        </>
      ) : (
        <CareerPanel
          career={stat.生涯}
          offCourt={stat.场外}
          league={stat.联盟}
          teamPower={currentTeamPower}
          disabled={busy}
          onAction={t => void sendTurn(t)}
          onStartMatch={() => void handleStartMatch()}
          onNextSeason={() => void handleNextSeason()}
          onPrepareMarket={() => void handlePrepareMarket()}
          onAcceptOffer={offerId => void handleAcceptOffer(offerId)}
          onTrain={() => void handleTrain()}
          onUpgrade={group => void handleUpgrade(group)}
        />
      )}

      <div className="narrative">
        {busy ? <div className="narrative-loading">比赛进行中…</div> : null}
        <div className="narrative-text">{narrative || '（等待剧情）'}</div>
        {options.length > 0 && !busy && !inMatch && (
          <div className="narrative-options">
            {options.map(o => (
              <button key={o} onClick={() => void sendTurn(o)}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="free-input">
        <input
          value={freeText}
          placeholder="自由行动 / 对话（垃圾话回应、战术要求…）"
          disabled={busy}
          onChange={e => setFreeText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && freeText.trim()) {
              void sendFreeText(freeText);
              setFreeText('');
            }
          }}
        />
        <button
          disabled={busy || !freeText.trim()}
          onClick={() => {
            void sendFreeText(freeText);
            setFreeText('');
          }}
        >
          发送
        </button>
      </div>
    </div>
  );
};

export default App;
