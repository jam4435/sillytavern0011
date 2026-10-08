export type MarketOfferType = '交易' | '续约' | '自由市场';
export type MarketOfferStatus = '待定' | '接受' | '拒绝';

export interface LeagueContract {
  playerKey: string;
  teamId: string | null;
  signedSeason: number;
  /** 在该赛季结束后的休赛期到期；0=2015-16结束后到期。 */
  expiresAfterSeason: number;
  annualSalary: number;
  years: number;
  status: '有效' | '自由球员';
}

export interface MarketOffer {
  id: string;
  playerKey: string;
  type: MarketOfferType;
  teamId: string;
  annualSalary: number;
  years: number;
  fitScore: number;
  needScore: number;
  createdDate: string;
  status: MarketOfferStatus;
  /** 交易报价时由对方送出的主要球员。 */
  outgoingPlayerKey?: string | null;
}

export interface TransactionRecord {
  id: string;
  type: '交易' | '签约' | '续约' | '自由球员';
  playerKey: string;
  fromTeam: string | null;
  toTeam: string | null;
  season: string;
  date: string;
  annualSalary?: number;
  years?: number;
  outgoingPlayerKey?: string | null;
}
