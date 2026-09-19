import type { TraitRank } from '../types';

import cardRankFlaw from '../wuxia-sprites/cards/card_rank_flaw.webp?url';
import cardRankWhite from '../wuxia-sprites/cards/card_rank_white.webp?url';
import cardRankGreen from '../wuxia-sprites/cards/card_rank_green.webp?url';
import cardRankBlue from '../wuxia-sprites/cards/card_rank_blue.webp?url';
import cardRankPurple from '../wuxia-sprites/cards/card_rank_purple.webp?url';
import cardRankGold from '../wuxia-sprites/cards/card_rank_gold.webp?url';
import cardRankRed from '../wuxia-sprites/cards/card_rank_red.webp?url';

/**
 * 获取指定品阶的真实高清卡牌底图（用户专属七阶素材包）
 */
export function getCardBackgroundImage(rank: TraitRank, isNegative: boolean): string {
  if (isNegative) {
    return cardRankFlaw;
  }
  switch (rank) {
    case '传说':
      return cardRankRed;
    case '绝世':
      return cardRankGold;
    case '镇派':
      return cardRankPurple;
    case '上乘':
      return cardRankBlue;
    case '传家':
      return cardRankGreen;
    case '粗浅':
    default:
      return cardRankWhite;
  }
}
