import { describe, expect, it } from 'vitest';
import { deriveTeamTactics } from './teamStyle';
import { createLeagueState } from './season';
import {
  applyMarketOffer,
  evaluateTeamNeeds,
  generateContractOffers,
  prepareOffseasonMarket,
  registerExistingContract,
} from './transactions';
import type { MarketOffer } from './transactionTypes';
import {
  getAllPlayersForLeague,
  getPlayerForLeague,
  getRosterForLeague,
} from '../utils/rosters';

describe('roster transaction chain', () => {
  it('交易落地后双方Roster立即变化，动态球队体系读取新名单', () => {
    const league = createLeagueState('GSW');
    const before = deriveTeamTactics(getRosterForLeague('GSW', league), league.教练.GSW);
    const offer: MarketOffer = {
      id: 'test-trade-klay-love',
      playerKey: 'Klay Thompson',
      type: '交易',
      teamId: 'CLE',
      annualSalary: 15_000_000,
      years: 2,
      fitScore: 80,
      needScore: 70,
      createdDate: league.日期,
      status: '待定',
      outgoingPlayerKey: 'Kevin Love',
    };
    const offered = { ...league, 市场报价: [offer] };
    const next = applyMarketOffer(offered, offer, getPlayerForLeague);
    const gsw = getRosterForLeague('GSW', next).map(player => player.name);
    const cle = getRosterForLeague('CLE', next).map(player => player.name);
    expect(gsw).toContain('Kevin Love');
    expect(gsw).not.toContain('Klay Thompson');
    expect(cle).toContain('Klay Thompson');
    expect(cle).not.toContain('Kevin Love');
    expect(next.交易记录.at(-1)?.type).toBe('交易');

    const after = deriveTeamTactics(getRosterForLeague('GSW', next), next.教练.GSW);
    expect(after).not.toEqual(before);
  });

  it('球队需求由当前Roster计算，自由市场能生成多支球队固定报价', () => {
    const league = createLeagueState('GSW');
    const needs = evaluateTeamNeeds('PHI', league, getRosterForLeague);
    expect(needs.strongestNeedScore).toBeGreaterThan(0);
    const offers = generateContractOffers(
      league,
      'Stephen Curry',
      '自由市场',
      getPlayerForLeague,
      getRosterForLeague,
      3,
    );
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map(offer => offer.teamId)).size).toBe(3);
    expect(offers.every(offer => offer.status === '待定' && offer.annualSalary > 0)).toBe(true);
  });

  it('自由市场签约会写合同册并让球员进入新球队Roster', () => {
    const league = createLeagueState('GSW');
    const offers = generateContractOffers(
      league,
      'Stephen Curry',
      '自由市场',
      getPlayerForLeague,
      getRosterForLeague,
      6,
    );
    const offer = offers.find(item => item.teamId !== 'GSW');
    expect(offer).toBeTruthy();
    const withOffer = { ...league, 市场报价: offer ? [offer] : [] };
    const next = applyMarketOffer(withOffer, offer!, getPlayerForLeague);
    expect(next.合同册['Stephen Curry']?.teamId).toBe(offer!.teamId);
    expect(getRosterForLeague(offer!.teamId, next).some(player => player.name === 'Stephen Curry')).toBe(true);
    expect(getRosterForLeague('GSW', next).some(player => player.name === 'Stephen Curry')).toBe(false);
  });

  it('主角合同到期时必须先从多报价中签约，NPC自由市场同时完成', () => {
    let league = createLeagueState('GSW');
    league = registerExistingContract(league, 'Stephen Curry', 'GSW', 1, 18_000_000);
    league.阶段 = '休赛期';
    const result = prepareOffseasonMarket(
      league,
      'Stephen Curry',
      getPlayerForLeague,
      getRosterForLeague,
      getAllPlayersForLeague,
    );
    expect(result.protagonistMustSign).toBe(true);
    expect(result.protagonistOffers).toHaveLength(3);
    expect(result.npcMoves).toBeGreaterThan(0);
    expect(result.league.市场报价.filter(offer => offer.playerKey === 'Stephen Curry' && offer.status === '待定')).toHaveLength(3);
  });
});
