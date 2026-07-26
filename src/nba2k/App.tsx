import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionChoice } from './components/ActionPanel';
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
import type { MatchState, OnCourtStatus, Side, SituationContext } from './engine/types';
import { getPlayer, getTeam, pickStarters, registerCustomPlayer, starterEntriesWith } from './utils/rosters';
import { TEAMS } from './data/teams';
import type { Nba2kStat } from './utils/statReader';
import { getLastAssistantNarrative, isInMatch, parseOptions, readStat, stripNarrative } from './utils/statReader';

function freshStatus(): OnCourtStatus {
  return { 体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0, 手感: '平' };
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
    const regs = [
      eventOn(tavern_events.MESSAGE_RECEIVED, () => void refresh()),
      eventOn(tavern_events.MESSAGE_UPDATED, () => void refresh()),
      eventOn(tavern_events.MESSAGE_SWIPED, () => void refresh()),
      eventOn(tavern_events.CHAT_CHANGED, () => void refresh()),
    ];
    return () => regs.forEach(r => r.stop?.());
  }, [refresh]);

  /** 发送一回合：user 楼层 + 生成，完成后兜底重读 */
  const sendTurn = useCallback(
    async (text: string) => {
      if (busyRef.current || !text.trim()) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await createChatMessages([{ role: 'user', message: text }]);
        await generate({ user_input: text, should_stream: true });
      } catch (e) {
        console.error('[nba2k] 生成失败', e);
        toastr.error('生成失败，请重试');
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
            生涯: {
              姓名: r.playerName,
              球队: r.teamId,
              位置: p?.pos ?? 'SG',
              附身球员: r.protagonistKey,
              赛季: '2015-16',
              赛程索引: 1,
              能力: { overall: p?.overall ?? 75, ...p?.attrs },
              徽章: [],
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
            比赛: { 进行中: false },
          },
        },
        { type: 'chat' },
      );
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
            生涯: {
              姓名: form.name,
              球队: form.teamId,
              位置: form.pos,
              附身球员: player.name,
              自定义球员: player,
              赛季: '2015-16',
              赛程索引: 1,
              能力: { overall: player.overall, ...player.attrs },
              徽章: [],
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
            比赛: { 进行中: false },
          },
        },
        { type: 'chat' },
      );
      await sendTurn(
        `【开局】我是${form.name}，一名${form.height_cm}cm 的${form.pos}新秀（总评${player.overall}，潜力${player.attrs.potential}），` +
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
    // 开局主队球权、向右进攻
    const 站位 = buildFormation({
      offense: homeEntries,
      defense: awayEntries,
      offenseSide: '主',
      tactic: '基础',
      defenseScheme: '人盯人',
      ballHolder: homeEntries[0]?.key ?? '',
      attackRight: true,
    });
    const 球员状态: Record<string, OnCourtStatus> = {};
    [...homeEntries, ...awayEntries].forEach(e => {
      球员状态[e.key] = freshStatus();
    });
    const match: MatchState = {
      进行中: true,
      对阵: { 主队: homeId, 客队: awayId },
      节次: 1,
      剩余秒数: 720,
      比分: { 主: 0, 客: 0 },
      球权: '主',
      战术: { 主: '基础', 客: '人盯人' },
      站位,
      球员状态,
      回合摘要: '比赛开始，跳球',
    };
    await insertOrAssignVariables({ stat_data: { 比赛: match } }, { type: 'chat' });
    setStat(s => ({ ...s, 比赛: match }));
    await sendTurn(
      `【开赛】${getTeam(homeId)?.cn} vs ${getTeam(awayId)?.cn}，我效力于${mySide}队。` +
        `请演出赛前入场、首发介绍与跳球（跳球结果按双方中锋身高与弹跳合理判断，主队球权已预设，如客队赢跳球请更新变量），然后把镜头交给我。`,
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

      const actor = getPlayer(choice.actorKey);
      if (!actor) return;
      const partner = choice.partnerKey ? (getPlayer(choice.partnerKey) ?? null) : null;

      // 对位者：距行动人最近的对方球员
      const actorSpot = match.站位[mySide]?.find(s => s.球员 === choice.actorKey);
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

      const situation: SituationContext = {
        isHome: mySide === '主',
        isClutch: match.节次 >= 4 && match.剩余秒数 <= 120 && Math.abs(match.比分.主 - match.比分.客) <= 5,
        coverage: nearestDist > 18 ? 'open' : nearestDist < 8 ? 'tight' : 'normal',
        mismatch: false,
        defenderFouls: defenderStatus?.犯规 ?? 0,
      };

      const resolution = resolveAction({
        action: choice.action,
        actor,
        actorStatus: match.球员状态[choice.actorKey] ?? freshStatus(),
        defender,
        partner,
        situation,
      });

      await sendTurn(buildTurnPrompt({ match, resolution }));
    },
    [stat, sendTurn],
  );

  // ---------- 渲染 ----------

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
          <ActionPanel match={match} mySide={mySide} protagonist={protagonist} disabled={busy} onChoose={c => void handleAction(c)} />
        </>
      ) : (
        <CareerPanel
          career={stat.生涯}
          offCourt={stat.场外}
          disabled={busy}
          onAction={t => void sendTurn(t)}
          onStartMatch={() => void handleStartMatch()}
        />
      )}

      <div className="narrative">
        {busy ? <div className="narrative-loading">比赛进行中…</div> : null}
        <div className="narrative-text">{narrative || '（等待剧情）'}</div>
        {options.length > 0 && !busy && (
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
              void sendTurn(freeText);
              setFreeText('');
            }
          }}
        />
        <button
          disabled={busy || !freeText.trim()}
          onClick={() => {
            void sendTurn(freeText);
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
