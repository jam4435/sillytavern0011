import { useCallback, useEffect, useRef, useState } from 'react';
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
import { settleAssistantResponse } from './engine/settlement';
import { createDevelopment, defaultBadges, defaultHotZones, defaultTendencies, initialGroups } from './engine/development';
import type { MatchState, OnCourtStatus, Side, SituationContext, StructuredTeamTactics, UpgradeGroupKey } from './engine/types';
import { getPlayer, getRoster, getTeam, pickStarters, registerCustomPlayer, starterEntriesWith } from './utils/rosters';
import { TEAMS } from './data/teams';
import type { Nba2kStat } from './utils/statReader';
import { getLastAssistantNarrative, isInMatch, parseOptions, readStat, stripNarrative } from './utils/statReader';
import { runTurnTransaction } from './utils/turnTransaction';
import type { TurnTransactionOptions } from './utils/turnTransaction';
import { trainCareer, updateCareerDynamics, upgradeCareer } from './utils/careerProgress';

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
    手感: '平',
    连续命中: 0,
    连续打铁: 0,
  };
}

const DEFAULT_TACTICS: StructuredTeamTactics = { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' };

function generatedText(result: string | GenerateToolCallResult): string {
  return (typeof result === 'string' ? result : result.content).trim();
}

function badgeModifier(levels: string[]): number {
  const value = levels.reduce((sum, level) => sum + (level === '金' ? 6 : level === '银' ? 4 : level === '铜' ? 2 : 0), 0);
  return Math.max(-8, Math.min(8, value));
}

function stripMatchVariableBlocks(text: string, patch: Record<string, unknown>): string {
  const narrative = text.replace(/<NBASettlement>[\s\S]*?<\/NBASettlement>/gi, '').replace(/<Variable(Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable\1>/gi, '').trim();
  return `${narrative}\n<VariableThink>确定性操作由前端完成。</VariableThink>\n<VariableEdit>${JSON.stringify(patch)}</VariableEdit>`;
}

const App: React.FC = () => {
  const [stat, setStat] = useState<Nba2kStat>(() => readStat());
  const [startScreen, setStartScreen] = useState<'splash' | StartMode>('splash');
  const [narrative, setNarrative] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [showBoxScore, setShowBoxScore] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = readStat();
    // 自定义球员随存档恢复时重新注册进球员库
    const custom = (next.生涯 as any)?.自定义球员;
    if (custom?.name) registerCustomPlayer(custom);
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
      const opponents = TEAMS.filter(t => t.id !== r.teamId);
      const firstOpponent = opponents[Math.floor(Math.random() * opponents.length)];
      await insertOrAssignVariables(
        {
          stat_data: {
            版本: 3,
            生涯: {
              姓名: r.playerName,
              球队: r.teamId,
              位置: p?.pos ?? 'SG',
              附身球员: r.protagonistKey,
              赛季: '2015-16',
              赛程索引: 1,
              能力: { overall: p?.overall ?? 75, ...p?.attrs },
              发展: createDevelopment('2K16模式', '均衡', initialGroups('2K16模式', '均衡')),
              倾向: defaultTendencies(),
              动态徽章: defaultBadges(),
              热区: defaultHotZones(),
              教练信任: 45,
              球队角色: '首发',
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
                pickStarters(r.teamId)
                  .filter(sp => sp.name !== r.protagonistKey)
                  .map(sp => [sp.name, 50]),
              ),
              日程: { 日期: '2015-10-27', 下一场: `vs ${firstOpponent.id}`, 待办: ['赛季首战'] },
            },
            比赛: null,
          },
        },
        { type: 'chat' },
      );
      setStat(readStat());
      await sendTurn(
        `【开局】我是${r.playerName}，以${p?.cn ?? r.protagonistKey}的身份效力于${team?.cn}（${p?.pos}，总评${p?.overall}）。` +
          `2015-16 赛季即将开始，首战 ${firstOpponent.cn}。请以生涯纪录片的口吻开场，介绍我的处境（更衣室、教练、媒体期待），最后给出行动选项。`,
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
      const opponents = TEAMS.filter(t => t.id !== form.teamId);
      const firstOpponent = opponents[Math.floor(Math.random() * opponents.length)];
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
              赛季: '2015-16',
              赛程索引: 1,
              能力: { overall: player.overall, ...player.attrs },
              发展: createDevelopment(form.mode, form.style, form.groups),
              倾向: defaultTendencies(),
              动态徽章: defaultBadges(),
              热区: defaultHotZones(),
              教练信任: 30,
              球队角色: '轮换',
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
                pickStarters(form.teamId)
                  .slice(0, 5)
                  .map(sp => [sp.name, 45]),
              ),
              日程: { 日期: '2015-10-27', 下一场: `vs ${firstOpponent.id}`, 待办: ['新秀首秀'] },
            },
            比赛: null,
          },
        },
        { type: 'chat' },
      );
      setStat(readStat());
      await sendTurn(
        `【开局】我是${form.name}，一名${form.height_cm}cm、${form.weight_kg}kg、臂展${form.wingspan_cm}cm 的${form.pos}新秀（${form.mode}，总评${player.overall}，潜力${player.attrs.potential}），` +
          `刚与${team?.cn}签下新秀合同，球衣号码 ${form.number} 号。2015-16 赛季即将开始，首战 ${firstOpponent.cn}。` +
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
    const next = offCourt?.日程?.下一场 ?? 'vs LAL';
    const isHome = !next.startsWith('@');
    const oppId = next.replace(/^(vs|@)\s*/i, '').trim() || 'LAL';
    const homeId = isHome ? myTeamId : oppId;
    const awayId = isHome ? oppId : myTeamId;
    const mySide: Side = isHome ? '主' : '客';

    const protagonistKey = (career as any).附身球员 ?? '';
    const homeEntries = homeId === myTeamId ? starterEntriesWith(homeId, protagonistKey) : starterEntriesWith(homeId, '');
    const awayEntries = awayId === myTeamId ? starterEntriesWith(awayId, protagonistKey) : starterEntriesWith(awayId, '');
    const homeCenter = getPlayer(homeEntries.find(entry => entry.pos === 'C')?.key ?? homeEntries.at(-1)?.key ?? '');
    const awayCenter = getPlayer(awayEntries.find(entry => entry.pos === 'C')?.key ?? awayEntries.at(-1)?.key ?? '');
    const jumpScore = (player: typeof homeCenter) =>
      player ? player.height_cm * 0.6 + player.attrs.strength * 0.3 + player.overall * 0.1 : 0;
    const openingPossession: Side = jumpScore(homeCenter) >= jumpScore(awayCenter) ? '主' : '客';
    const offenseEntries = openingPossession === '主' ? homeEntries : awayEntries;
    const defenseEntries = openingPossession === '主' ? awayEntries : homeEntries;
    const 站位 = buildFormation({
      offense: offenseEntries,
      defense: defenseEntries,
      offenseSide: openingPossession,
      tactic: '基础',
      defenseScheme: '人盯人',
      ballHolder: offenseEntries[0]?.key ?? '',
      attackRight: openingPossession === '主',
    });
    const homeOnCourt = homeEntries.map(entry => entry.key);
    const awayOnCourt = awayEntries.map(entry => entry.key);
    const homeBench = getRoster(homeId).map(player => player.name).filter(key => !homeOnCourt.includes(key));
    const awayBench = getRoster(awayId).map(player => player.name).filter(key => !awayOnCourt.includes(key));
    const 球员状态: Record<string, OnCourtStatus> = {};
    [...homeOnCourt, ...homeBench, ...awayOnCourt, ...awayBench].forEach(key => {
      球员状态[key] = freshStatus();
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
      战术: { 主: { ...DEFAULT_TACTICS }, 客: { ...DEFAULT_TACTICS } },
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
    await insertOrAssignVariables({ stat_data: { 比赛: match } }, { type: 'chat' });
    setStat(s => ({ ...s, 比赛: match }));
    await sendTurn(
      `【开赛】${getTeam(homeId)?.cn} vs ${getTeam(awayId)?.cn}，我效力于${mySide}队。` +
        `前端已按双方中锋身高、力量与总评判定由${openingPossession}队赢得跳球。请演出赛前入场、首发介绍与这个既定跳球结果；不得修改球权、比分、时间或其他比赛变量，然后把镜头交给我。`,
    );
  }, [stat, sendTurn]);

  /** 场上动作：判定 → 拼指令 → 发送 */
  const handleAction = useCallback(
    async (choice: ActionChoice) => {
      const match = stat.比赛;
      const career = stat.生涯;
      if (!match || !career) return;
      const mySide: Side = match.对阵.主队 === career.球队 ? '主' : '客';
      const oppSide: Side = mySide === '主' ? '客' : '主';
      // v3 只允许控制主角；忽略任何伪造的 actorKey。
      const actorKey = career.附身球员;
      const actor = getPlayer(actorKey);
      if (!actor) return;
      const partner = choice.partnerKey ? (getPlayer(choice.partnerKey) ?? null) : null;

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
      const defender = defenderKey ? (getPlayer(defenderKey) ?? null) : null;
      const defenderStatus = defenderKey ? match.球员状态[defenderKey] : undefined;
      const defenders = oppSpots.map(spot => getPlayer(spot.球员)).filter((player): player is NonNullable<typeof player> => Boolean(player));

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
          partnerDefender = nearest ? (getPlayer(nearest.球员) ?? null) : null;
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
        hotZoneModifier: Object.values(career.热区.zones).some(zone => zone.state === '热') ? 4 : Object.values(career.热区.zones).some(zone => zone.state === '冷') ? -4 : 0,
        badgeModifier: badgeModifier(Object.values(career.动态徽章.badges).map(badge => badge.level)),
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
            normalized => ({ 生涯: updateCareerDynamics(career, resolution, normalized) }),
          );
          if (settled.validationErrors.length) console.warn('[nba2k] settlement repaired/fallback', settled.validationErrors);
          return settled.assistantText;
        },
      });
    },
    [stat, sendTurn],
  );

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
        回合摘要: `${getPlayer(outKey)?.cn ?? outKey}被${getPlayer(inKey)?.cn ?? inKey}换下`,
        回合阶段: '常规回合',
        待处理情境: { type: 'none' },
      };
      await insertOrAssignVariables({ stat_data: { 比赛: nextMatch } }, { type: 'chat' });
      setStat(current => ({ ...current, 比赛: nextMatch }));
      await sendTurn(
        `【比赛管理】前端已完成${side}队换人：${getPlayer(outKey)?.cn ?? outKey}下，${getPlayer(inKey)?.cn ?? inKey}上。` +
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
    const shooter = getPlayer(pending.shooter);
    const made = Math.floor(Math.random() * 100) + 1 <= (shooter?.attrs.freeThrow ?? 70);
    const shooterStatus = match.球员状态[pending.shooter] ?? freshStatus();
    const remaining = pending.remaining - 1;
    const nextPossession: Side = remaining > 0 ? pending.shootingSide : pending.shootingSide === '主' ? '客' : '主';
    const nextSpots = {
      主: match.站位.主.map(spot => ({ ...spot, 持球: false })),
      客: match.站位.客.map(spot => ({ ...spot, 持球: false })),
    };
    if (remaining === 0 && nextSpots[nextPossession][0]) nextSpots[nextPossession][0].持球 = true;
    const nextMatch: MatchState = {
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
          disabled={busy}
          onAction={t => void sendTurn(t)}
          onStartMatch={() => void handleStartMatch()}
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
