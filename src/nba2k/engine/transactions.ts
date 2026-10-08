import { TEAMS } from '../data/teams';
import type { PlayerData, Position } from './types';
import type { LeagueState } from './season';
import type { LeagueContract, MarketOffer, TransactionRecord } from './transactionTypes';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

type RosterGetter = (teamId: string, league: LeagueState) => PlayerData[];
type PlayerGetter = (playerKey: string, league: LeagueState) => PlayerData | undefined;
type AllPlayersGetter = (league: LeagueState) => PlayerData[];

export interface TeamNeeds {
  byPosition: Record<Position, number>;
  strongestNeed: Position;
  strongestNeedScore: number;
}

export interface OffseasonMarketResult {
  league: LeagueState;
  protagonistOffers: MarketOffer[];
  protagonistMustSign: boolean;
  npcMoves: number;
}

function hash(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function deterministicUnit(seed: string): number {
  return (hash(seed) % 10001) / 10000;
}

function winPct(league: LeagueState, teamId: string): number {
  const row = league.战绩[teamId];
  if (!row) return .5;
  const games = row.胜 + row.负;
  return games ? row.胜 / games : .5;
}

export function currentTeamOf(player: PlayerData, league: LeagueState): string | null {
  if (Object.prototype.hasOwnProperty.call(league.球员归属, player.name)) {
    return league.球员归属[player.name] ?? null;
  }
  return player.team || null;
}

function eligibleFor(player: PlayerData, pos: Position): boolean {
  return player.pos === pos || player.secondaryPos === pos;
}

export function evaluateTeamNeeds(
  teamId: string,
  league: LeagueState,
  getRoster: RosterGetter,
): TeamNeeds {
  const roster = getRoster(teamId, league);
  const byPosition = Object.fromEntries(POSITIONS.map(pos => {
    const options = roster.filter(player => eligibleFor(player, pos)).sort((a, b) => b.overall - a.overall);
    const starter = options[0]?.overall ?? 55;
    const backup = options[1]?.overall ?? 52;
    const depth = options.length;
    const need =
      42 +
      Math.max(0, 82 - starter) * 1.55 +
      Math.max(0, 73 - backup) * .72 +
      Math.max(0, 2 - depth) * 13 -
      Math.max(0, starter - 88) * .8;
    return [pos, Math.round(clamp(need, 8, 98))];
  })) as Record<Position, number>;
  const strongestNeed = [...POSITIONS].sort((a, b) => byPosition[b] - byPosition[a])[0];
  return { byPosition, strongestNeed, strongestNeedScore: byPosition[strongestNeed] };
}

export function playerMarketValue(player: PlayerData): number {
  const upside = Math.max(0, player.attrs.potential - player.overall);
  const declineSignal = Math.max(0, player.overall - player.attrs.potential);
  return Math.round((player.overall + upside * .34 - declineSignal * .12) * 10) / 10;
}

function salaryFor(player: PlayerData, league: LeagueState, needScore = 50, teamId = ''): number {
  const value = playerMarketValue(player);
  const marketScore = value * .82 + needScore * .18;
  const inflation = Math.pow(1.045, league.赛季序号);
  const variation = .94 + deterministicUnit(`${player.name}:${teamId}:${league.赛季}:salary`) * .12;
  const raw = (900_000 + Math.pow(Math.max(0, marketScore - 57), 1.67) * 64_000) * inflation * variation;
  return Math.round(clamp(raw, 850_000 * inflation, 31_000_000 * inflation) / 50_000) * 50_000;
}

function yearsFor(player: PlayerData, fitScore: number): number {
  const value = playerMarketValue(player);
  if (value >= 88 && fitScore >= 66) return 4;
  if (value >= 80 || player.attrs.potential >= 88) return 3;
  if (value >= 72) return 2;
  return 1;
}

/**
 * 初始历史名单没有真实合同数据，运行时按球员种子确定性生成合同期限。
 * 真实历史合同不会作为未来模拟依赖。
 */
export function registerExistingContract(
  league: LeagueState,
  playerKey: string,
  teamId: string,
  years: number,
  annualSalary: number,
): LeagueState {
  const safeYears = Math.max(1, Math.min(5, Math.round(years)));
  return {
    ...league,
    球员归属: { ...league.球员归属, [playerKey]: teamId },
    合同册: {
      ...league.合同册,
      [playerKey]: {
        playerKey,
        teamId,
        signedSeason: league.赛季序号,
        expiresAfterSeason: league.赛季序号 + safeYears - 1,
        annualSalary,
        years: safeYears,
        status: '有效',
      },
    },
  };
}

export function derivedInitialContract(player: PlayerData, league: LeagueState): LeagueContract {
  const termIndex = hash(`${player.name}:initial-contract`) % 3;
  const teamId = currentTeamOf(player, league);
  return {
    playerKey: player.name,
    teamId,
    signedSeason: 0,
    expiresAfterSeason: termIndex,
    annualSalary: salaryFor(player, { ...league, 赛季序号: 0 }, 50, teamId ?? 'FA'),
    years: termIndex + 1,
    status: teamId ? '有效' : '自由球员',
  };
}

export function contractForPlayer(
  playerKey: string,
  league: LeagueState,
  getPlayer: PlayerGetter,
): LeagueContract | null {
  const override = league.合同册[playerKey];
  if (override) return override;
  const player = getPlayer(playerKey, league);
  if (!player) return null;
  return derivedInitialContract(player, league);
}

export function contractExpiresThisOffseason(contract: LeagueContract, league: LeagueState): boolean {
  return contract.status === '有效' && contract.expiresAfterSeason <= league.赛季序号;
}

export function contractHasOneSeasonLeft(contract: LeagueContract, league: LeagueState): boolean {
  return contract.status === '有效' && contract.expiresAfterSeason === league.赛季序号 + 1;
}

function playerNeedForTeam(player: PlayerData, needs: TeamNeeds): number {
  const primary = needs.byPosition[player.pos];
  const secondary = player.secondaryPos ? needs.byPosition[player.secondaryPos] : primary;
  return Math.max(primary, secondary * .92);
}

function teamOfferScore(
  player: PlayerData,
  teamId: string,
  league: LeagueState,
  needs: TeamNeeds,
): { fitScore: number; needScore: number } {
  const needScore = playerNeedForTeam(player, needs);
  const competitiveness = winPct(league, teamId) * 100;
  const incumbentBonus = currentTeamOf(player, league) === teamId ? 4 : 0;
  const variance = (deterministicUnit(`${player.name}:${teamId}:${league.赛季}:fit`) - .5) * 5;
  const fitScore = clamp(
    needScore * .56 +
    competitiveness * .20 +
    playerMarketValue(player) * .19 +
    incumbentBonus +
    variance,
    0,
    100,
  );
  return { fitScore: Math.round(fitScore * 10) / 10, needScore: Math.round(needScore) };
}

export function generateContractOffers(
  league: LeagueState,
  playerKey: string,
  type: '续约' | '自由市场',
  getPlayer: PlayerGetter,
  getRoster: RosterGetter,
  maxOffers = 3,
): MarketOffer[] {
  const player = getPlayer(playerKey, league);
  if (!player) return [];
  const current = currentTeamOf(player, league);
  const teams = type === '续约'
    ? TEAMS.filter(team => team.id === current)
    : TEAMS;

  return teams
    .map(team => {
      const roster = getRoster(team.id, league);
      if (team.id !== current && roster.length >= 15) return null;
      const needs = evaluateTeamNeeds(team.id, league, getRoster);
      const { fitScore, needScore } = teamOfferScore(player, team.id, league, needs);
      const years = yearsFor(player, fitScore);
      return {
        id: `${type}-${league.赛季序号}-${playerKey}-${team.id}`,
        playerKey,
        type,
        teamId: team.id,
        annualSalary: salaryFor(player, league, needScore, team.id),
        years,
        fitScore,
        needScore,
        createdDate: league.日期,
        status: '待定' as const,
      };
    })
    .filter((offer): offer is MarketOffer => Boolean(offer))
    .sort((a, b) => b.fitScore - a.fitScore || b.annualSalary - a.annualSalary)
    .slice(0, maxOffers);
}

function rankInTeam(playerKey: string, roster: PlayerData[]): number {
  return roster
    .slice()
    .sort((a, b) => playerMarketValue(b) - playerMarketValue(a))
    .findIndex(player => player.name === playerKey);
}

export function generateTradeOffers(
  league: LeagueState,
  playerKey: string,
  getPlayer: PlayerGetter,
  getRoster: RosterGetter,
  maxOffers = 3,
): MarketOffer[] {
  const player = getPlayer(playerKey, league);
  if (!player) return [];
  const fromTeam = currentTeamOf(player, league);
  if (!fromTeam) return [];
  const oldTeamNeeds = evaluateTeamNeeds(fromTeam, league, getRoster);
  const targetValue = playerMarketValue(player);
  const currentContract = contractForPlayer(playerKey, league, getPlayer);

  const offers: MarketOffer[] = [];
  for (const team of TEAMS) {
    if (team.id === fromTeam) continue;
    const buyerRoster = getRoster(team.id, league);
    const buyerNeeds = evaluateTeamNeeds(team.id, league, getRoster);
    const needScore = playerNeedForTeam(player, buyerNeeds);
    if (needScore < 42) continue;

    const outgoing = buyerRoster
      .filter(candidate => candidate.name !== playerKey)
      .map(candidate => {
        const gap = Math.abs(playerMarketValue(candidate) - targetValue);
        const oldTeamNeed = playerNeedForTeam(candidate, oldTeamNeeds);
        const buyerRank = rankInTeam(candidate.name, buyerRoster);
        const corePenalty = buyerRank >= 0 && buyerRank < 2 ? 18 : 0;
        const score = 100 - gap * 5 + oldTeamNeed * .45 - corePenalty;
        return { candidate, gap, score };
      })
      .filter(item => item.gap <= 9.5)
      .sort((a, b) => b.score - a.score)[0];
    if (!outgoing) continue;

    const competitiveness = winPct(league, team.id) * 100;
    const balance = 100 - Math.abs(playerMarketValue(outgoing.candidate) - targetValue) * 7;
    const fitScore = clamp(needScore * .48 + competitiveness * .18 + balance * .28 +
      deterministicUnit(`${player.name}:${team.id}:trade:${league.赛季}`) * 6);

    offers.push({
      id: `交易-${league.赛季序号}-${playerKey}-${team.id}-${outgoing.candidate.name}`,
      playerKey,
      type: '交易',
      teamId: team.id,
      annualSalary: currentContract?.annualSalary ?? salaryFor(player, league, needScore, team.id),
      years: currentContract?.years ?? 1,
      fitScore: Math.round(fitScore * 10) / 10,
      needScore: Math.round(needScore),
      createdDate: league.日期,
      status: '待定',
      outgoingPlayerKey: outgoing.candidate.name,
    });
  }

  return offers.sort((a, b) => b.fitScore - a.fitScore).slice(0, maxOffers);
}

function appendTransaction(league: LeagueState, record: TransactionRecord): LeagueState {
  const history = [...league.交易记录, record].slice(-240);
  return { ...league, 交易记录: history };
}

function markOfferDecision(league: LeagueState, offer: MarketOffer): LeagueState {
  return {
    ...league,
    市场报价: league.市场报价.map(item => {
      if (item.playerKey !== offer.playerKey) return item;
      return { ...item, status: item.id === offer.id ? '接受' : '拒绝' };
    }),
  };
}

export function applyMarketOffer(
  league: LeagueState,
  offer: MarketOffer,
  getPlayer: PlayerGetter,
): LeagueState {
  const player = getPlayer(offer.playerKey, league);
  if (!player) return league;
  const fromTeam = currentTeamOf(player, league);
  let next = markOfferDecision(league, offer);

  if (offer.type === '交易') {
    if (!fromTeam || !offer.outgoingPlayerKey) return league;
    const outgoing = getPlayer(offer.outgoingPlayerKey, league);
    if (!outgoing || currentTeamOf(outgoing, league) !== offer.teamId) return league;

    next = {
      ...next,
      球员归属: {
        ...next.球员归属,
        [offer.playerKey]: offer.teamId,
        [offer.outgoingPlayerKey]: fromTeam,
      },
      合同册: {
        ...next.合同册,
        ...(next.合同册[offer.playerKey]
          ? { [offer.playerKey]: { ...next.合同册[offer.playerKey], teamId: offer.teamId } }
          : {}),
        ...(next.合同册[offer.outgoingPlayerKey]
          ? { [offer.outgoingPlayerKey]: { ...next.合同册[offer.outgoingPlayerKey], teamId: fromTeam } }
          : {}),
      },
    };
    return appendTransaction(next, {
      id: `tx-${offer.id}`,
      type: '交易',
      playerKey: offer.playerKey,
      fromTeam,
      toTeam: offer.teamId,
      outgoingPlayerKey: offer.outgoingPlayerKey,
      season: league.赛季,
      date: league.日期,
    });
  }

  const existing = contractForPlayer(offer.playerKey, league, getPlayer);
  const expiresAfterSeason = offer.type === '续约'
    ? Math.max(existing?.expiresAfterSeason ?? league.赛季序号, league.赛季序号) + offer.years
    : league.赛季序号 + offer.years;
  const contract: LeagueContract = {
    playerKey: offer.playerKey,
    teamId: offer.teamId,
    signedSeason: league.赛季序号,
    expiresAfterSeason,
    annualSalary: offer.annualSalary,
    years: offer.years,
    status: '有效',
  };
  next = {
    ...next,
    球员归属: { ...next.球员归属, [offer.playerKey]: offer.teamId },
    合同册: { ...next.合同册, [offer.playerKey]: contract },
  };
  return appendTransaction(next, {
    id: `tx-${offer.id}`,
    type: offer.type === '续约' ? '续约' : '签约',
    playerKey: offer.playerKey,
    fromTeam,
    toTeam: offer.teamId,
    season: league.赛季,
    date: league.日期,
    annualSalary: offer.annualSalary,
    years: offer.years,
  });
}

export function setPlayerFreeAgent(
  league: LeagueState,
  playerKey: string,
  getPlayer: PlayerGetter,
): LeagueState {
  const player = getPlayer(playerKey, league);
  if (!player) return league;
  const fromTeam = currentTeamOf(player, league);
  const previous = contractForPlayer(playerKey, league, getPlayer);
  let next: LeagueState = {
    ...league,
    球员归属: { ...league.球员归属, [playerKey]: null },
    合同册: {
      ...league.合同册,
      [playerKey]: {
        playerKey,
        teamId: null,
        signedSeason: previous?.signedSeason ?? 0,
        expiresAfterSeason: previous?.expiresAfterSeason ?? league.赛季序号,
        annualSalary: previous?.annualSalary ?? 0,
        years: previous?.years ?? 0,
        status: '自由球员',
      },
    },
  };
  next = appendTransaction(next, {
    id: `fa-${league.赛季序号}-${playerKey}`,
    type: '自由球员',
    playerKey,
    fromTeam,
    toTeam: null,
    season: league.赛季,
    date: league.日期,
  });
  return next;
}

export function preparePlayerTradeMarket(
  league: LeagueState,
  playerKey: string,
  getPlayer: PlayerGetter,
  getRoster: RosterGetter,
): LeagueState {
  const offers = generateTradeOffers(league, playerKey, getPlayer, getRoster, 3);
  return {
    ...league,
    市场报价: [
      ...league.市场报价.filter(offer => offer.playerKey !== playerKey || offer.type !== '交易'),
      ...offers,
    ],
  };
}

function offerFromNeedSnapshot(
  league: LeagueState,
  player: PlayerData,
  type: '续约' | '自由市场',
  needsByTeam: Record<string, TeamNeeds>,
  rosterCounts: Record<string, number>,
  maxOffers: number,
): MarketOffer[] {
  const current = currentTeamOf(player, league);
  const candidateTeams = type === '续约'
    ? TEAMS.filter(team => team.id === current)
    : TEAMS;

  return candidateTeams
    .map(team => {
      if (team.id !== current && (rosterCounts[team.id] ?? 0) >= 15) return null;
      const needs = needsByTeam[team.id];
      if (!needs) return null;
      const { fitScore, needScore } = teamOfferScore(player, team.id, league, needs);
      const years = yearsFor(player, fitScore);
      return {
        id: `${type}-${league.赛季序号}-${player.name}-${team.id}`,
        playerKey: player.name,
        type,
        teamId: team.id,
        annualSalary: salaryFor(player, league, needScore, team.id),
        years,
        fitScore,
        needScore,
        createdDate: league.日期,
        status: '待定' as const,
      };
    })
    .filter((offer): offer is MarketOffer => Boolean(offer))
    .sort((a, b) => b.fitScore - a.fitScore || b.annualSalary - a.annualSalary)
    .slice(0, maxOffers);
}

function reduceNeedAfterSigning(needs: TeamNeeds, player: PlayerData): TeamNeeds {
  const byPosition = { ...needs.byPosition };
  byPosition[player.pos] = Math.max(8, byPosition[player.pos] - 13);
  if (player.secondaryPos) byPosition[player.secondaryPos] = Math.max(8, byPosition[player.secondaryPos] - 7);
  const strongestNeed = [...POSITIONS].sort((a, b) => byPosition[b] - byPosition[a])[0];
  return { byPosition, strongestNeed, strongestNeedScore: byPosition[strongestNeed] };
}

export function prepareOffseasonMarket(
  league: LeagueState,
  protagonistKey: string,
  getPlayer: PlayerGetter,
  getRoster: RosterGetter,
  getAllPlayers: AllPlayersGetter,
): OffseasonMarketResult {
  let next = {
    ...league,
    市场报价: league.市场报价.filter(offer => offer.createdDate === league.日期 && offer.status === '待定'),
  };
  let npcMoves = 0;

  // 先一次性找出到期者并释放，再建立30队需求快照；避免每名FA重复重算整个联盟。
  const expiringKeys = getAllPlayers(next)
    .filter(player => player.name !== protagonistKey)
    .filter(player => {
      const contract = contractForPlayer(player.name, next, getPlayer);
      return Boolean(contract && contractExpiresThisOffseason(contract, next));
    })
    .map(player => player.name)
    .sort((a, b) => a.localeCompare(b));

  for (const playerKey of expiringKeys) next = setPlayerFreeAgent(next, playerKey, getPlayer);

  const needsByTeam = Object.fromEntries(
    TEAMS.map(team => [team.id, evaluateTeamNeeds(team.id, next, getRoster)]),
  ) as Record<string, TeamNeeds>;
  const rosterCounts = Object.fromEntries(
    TEAMS.map(team => [team.id, getRoster(team.id, next).length]),
  ) as Record<string, number>;

  for (const playerKey of expiringKeys) {
    const player = getPlayer(playerKey, next);
    if (!player) continue;
    const offers = offerFromNeedSnapshot(next, player, '自由市场', needsByTeam, rosterCounts, 4);
    const best = offers[0];
    if (!best) continue;
    next = applyMarketOffer(next, best, getPlayer);
    rosterCounts[best.teamId] = (rosterCounts[best.teamId] ?? 0) + 1;
    needsByTeam[best.teamId] = reduceNeedAfterSigning(needsByTeam[best.teamId], player);
    npcMoves += 1;
  }

  const protagonist = getPlayer(protagonistKey, next);
  if (!protagonist) return { league: next, protagonistOffers: [], protagonistMustSign: false, npcMoves };
  const contract = contractForPlayer(protagonistKey, next, getPlayer);
  if (!contract) return { league: next, protagonistOffers: [], protagonistMustSign: false, npcMoves };

  let offers: MarketOffer[] = [];
  let protagonistMustSign = false;
  if (contractExpiresThisOffseason(contract, next)) {
    protagonistMustSign = true;
    offers = offerFromNeedSnapshot(next, protagonist, '自由市场', needsByTeam, rosterCounts, 3);
  } else if (contractHasOneSeasonLeft(contract, next)) {
    offers = offerFromNeedSnapshot(next, protagonist, '续约', needsByTeam, rosterCounts, 1);
  }

  next = {
    ...next,
    市场报价: [
      ...next.市场报价.filter(offer => offer.playerKey !== protagonistKey || offer.status !== '待定'),
      ...offers,
    ],
  };
  return { league: next, protagonistOffers: offers, protagonistMustSign, npcMoves };
}

function needsAtPosition(teamId: string, pos: Position, league: LeagueState, getRoster: RosterGetter): number {
  return evaluateTeamNeeds(teamId, league, getRoster).byPosition[pos];
}

/**
 * 轻量 CPU 截止日：只交换中层轮换球员，避免无交易市场也避免明星每年乱飞。
 * 只需每赛季调用一次；调用者用 StoryHook id 保证幂等。
 */
export function runCpuTradeDeadline(
  league: LeagueState,
  protagonistKey: string,
  getPlayer: PlayerGetter,
  getRoster: RosterGetter,
): { league: LeagueState; trades: TransactionRecord[] } {
  let next = league;
  const before = league.交易记录.length;
  const buyers = TEAMS
    .map(team => ({ team, pct: winPct(league, team.id) }))
    .filter(item => item.pct >= .50)
    .sort((a, b) => b.pct - a.pct || a.team.id.localeCompare(b.team.id));
  const sellers = TEAMS
    .map(team => ({ team, pct: winPct(league, team.id) }))
    .filter(item => item.pct <= .47)
    .sort((a, b) => a.pct - b.pct || a.team.id.localeCompare(b.team.id));

  const usedTeams = new Set<string>();
  for (const buyer of buyers) {
    if (next.交易记录.length - before >= 2) break;
    if (usedTeams.has(buyer.team.id)) continue;
    const need = evaluateTeamNeeds(buyer.team.id, next, getRoster);
    const pos = need.strongestNeed;
    if (need.strongestNeedScore < 48) continue;

    let executed = false;
    for (const seller of sellers) {
      if (seller.team.id === buyer.team.id || usedTeams.has(seller.team.id)) continue;
      const sellerRoster = getRoster(seller.team.id, next).sort((a, b) => b.overall - a.overall);
      const targets = sellerRoster.filter((player, index) =>
        player.name !== protagonistKey &&
        index >= 2 &&
        player.overall >= 70 &&
        player.overall <= 84 &&
        eligibleFor(player, pos),
      );
      for (const target of targets) {
        const buyerRoster = getRoster(buyer.team.id, next).sort((a, b) => b.overall - a.overall);
        const targetValue = playerMarketValue(target);
        const sellerNeed = evaluateTeamNeeds(seller.team.id, next, getRoster);
        const outgoing = buyerRoster
          .filter((candidate, index) =>
            candidate.name !== protagonistKey &&
            index >= 2 &&
            Math.abs(playerMarketValue(candidate) - targetValue) <= 6.5 &&
            needsAtPosition(seller.team.id, candidate.pos, next, getRoster) >= 40,
          )
          .sort((a, b) =>
            sellerNeed.byPosition[b.pos] - sellerNeed.byPosition[a.pos] ||
            Math.abs(playerMarketValue(a) - targetValue) - Math.abs(playerMarketValue(b) - targetValue),
          )[0];
        if (!outgoing) continue;

        const offer: MarketOffer = {
          id: `cpu-${next.赛季序号}-${target.name}-${buyer.team.id}-${outgoing.name}`,
          playerKey: target.name,
          type: '交易',
          teamId: buyer.team.id,
          annualSalary: contractForPlayer(target.name, next, getPlayer)?.annualSalary ?? 0,
          years: contractForPlayer(target.name, next, getPlayer)?.years ?? 1,
          fitScore: need.strongestNeedScore,
          needScore: need.strongestNeedScore,
          createdDate: next.日期,
          status: '待定',
          outgoingPlayerKey: outgoing.name,
        };
        next = {
          ...next,
          市场报价: [...next.市场报价.filter(item => item.playerKey !== target.name), offer],
        };
        next = applyMarketOffer(next, offer, getPlayer);
        usedTeams.add(buyer.team.id);
        usedTeams.add(seller.team.id);
        executed = true;
        break;
      }
      if (executed) break;
    }
  }

  return { league: next, trades: next.交易记录.slice(before) };
}
