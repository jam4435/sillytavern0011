import type { InventoryItem, MartialArt } from '../types';

import anranXiaohunZhangUrl from '../assets/icons/jinyong/anran_xiaohun_zhang.png?url';
import bafangCangdaoUrl from '../assets/icons/jinyong/bafang_cangdao.png?url';
import baiheShuchiUrl from '../assets/icons/jinyong/baihe_shuchi.png?url';
import beidouGangjianUrl from '../assets/icons/jinyong/beidou_gangjian.png?url';
import beimingZhenqiUrl from '../assets/icons/jinyong/beiming_zhenqi.png?url';
import bihaiChaoshengUrl from '../assets/icons/jinyong/bihai_chaosheng.png?url';
import bingxinJueUrl from '../assets/icons/jinyong/bingxin_jue.jpg?url';
import busiYinfaUrl from '../assets/icons/jinyong/busi_yinfa.png?url';
import cangqiongXuejiaUrl from '../assets/icons/jinyong/cangqiong_xuejia.png?url';
import canheJianqiUrl from '../assets/icons/jinyong/canhe_jianqi.png?url';
import chuanguoYuxiUrl from '../assets/icons/jinyong/chuanguo_yuxi.jpg?url';
import dahuandanUrl from '../assets/icons/jinyong/dahuandan.png?url';
import dangtouBangheUrl from '../assets/icons/jinyong/dangtou_banghe.jpg?url';
import daoqiZonghengUrl from '../assets/icons/jinyong/daoqi_zongheng.jpg?url';
import huangdiNeijingUrl from '../assets/icons/jinyong/huangdi_neijing.png?url';
import huayanMiaoyinUrl from '../assets/icons/jinyong/huayan_miaoyin.png?url';
import hujiaDaofaUrl from '../assets/icons/jinyong/hujia_daofa.png?url';
import hunyuanZhangUrl from '../assets/icons/jinyong/hunyuan_zhang.png?url';
import hutiZhenqiUrl from '../assets/icons/jinyong/huti_zhenqi.jpg?url';
import jifengDanUrl from '../assets/icons/jinyong/jifeng_dan.png?url';
import jinchuangYaoUrl from '../assets/icons/jinyong/jinchuang_yao.jpg?url';
import jiuhuaYuluWanUrl from '../assets/icons/jinyong/jiuhua_yulu_wan.png?url';
import jiuyangShengongUrl from '../assets/icons/jinyong/jiuyang_shengong.jpg?url';
import jiuyinZhenjingUrl from '../assets/icons/jinyong/jiuyin_zhenjing.png?url';
import kuihuaBaoyuUrl from '../assets/icons/jinyong/kuihua_baoyu.png?url';
import lingbieBuUrl from '../assets/icons/jinyong/lingbie_bu.png?url';
import longjiaoJianUrl from '../assets/icons/jinyong/longjiao_jian.png?url';
import longxiangBanruoGongUrl from '../assets/icons/jinyong/longxiang_banruo_gong.png?url';
import mianliCangzhenUrl from '../assets/icons/jinyong/mianli_cangzhen.jpg?url';
import nianzhuUrl from '../assets/icons/jinyong/nianzhu.png?url';
import pikongZhangUrl from '../assets/icons/jinyong/pikong_zhang.png?url';
import poluLingUrl from '../assets/icons/jinyong/polu_ling.jpg?url';
import poqiangShiUrl from '../assets/icons/jinyong/poqiang_shi.jpg?url';
import qiankunDanuoyiUrl from '../assets/icons/jinyong/qiankun_danuoyi.png?url';
import shengsiFuUrl from '../assets/icons/jinyong/shengsi_fu.png?url';
import shexingLifanUrl from '../assets/icons/jinyong/shexing_lifan.png?url';
import sunvJingUrl from '../assets/icons/jinyong/sunv_jing.png?url';
import tanzhiQingUrl from '../assets/icons/jinyong/tanzhi_qing.png?url';
import visitedMapUrl from '../assets/icons/jinyong/visited_map.png?url';
import yijinJingUrl from '../assets/icons/jinyong/yijin_jing.jpg?url';
import yunvXinjingUrl from '../assets/icons/jinyong/yunv_xinjing.png?url';

export type CatalogIconKind = 'martial' | 'inventory' | 'fallback';
export type IconMatchReason = 'name' | 'alias' | 'type' | 'fallback';

export interface CatalogIcon {
  id: string;
  src: string;
  label: string;
  names: string[];
  aliases: string[];
  kind: CatalogIconKind;
  categories: string[];
}

export interface ResolvedIcon {
  src: string;
  label: string;
  matchedBy: IconMatchReason;
}

export interface RankVisual {
  key: string;
  color: string;
  label: string;
  shortLabel: string;
  glow: string;
}

const rankVisuals: Record<string, RankVisual> = {
  WHITE: { key: 'WHITE', color: '#a8a29e', label: '凡品', shortLabel: '凡', glow: 'rgba(168, 162, 158, 0.18)' },
  GREEN: { key: 'GREEN', color: '#4ade80', label: '精品', shortLabel: '精', glow: 'rgba(74, 222, 128, 0.18)' },
  BLUE: { key: 'BLUE', color: '#60a5fa', label: '珍品', shortLabel: '珍', glow: 'rgba(96, 165, 250, 0.18)' },
  PURPLE: { key: 'PURPLE', color: '#c084fc', label: '极品', shortLabel: '极', glow: 'rgba(192, 132, 252, 0.18)' },
  GOLD: { key: 'GOLD', color: '#fbbf24', label: '绝品', shortLabel: '绝', glow: 'rgba(251, 191, 36, 0.18)' },
  RED: { key: 'RED', color: '#f87171', label: '神品', shortLabel: '神', glow: 'rgba(248, 113, 113, 0.18)' },
};

const martialRankToGenericKey: Record<string, keyof typeof rankVisuals> = {
  粗浅: 'WHITE',
  传家: 'GREEN',
  上乘: 'BLUE',
  镇派: 'PURPLE',
  绝世: 'GOLD',
  传说: 'RED',
};

const genericRankToMartialLabel: Record<string, { label: string; shortLabel: string }> = {
  WHITE: { label: '粗浅', shortLabel: '粗' },
  GREEN: { label: '传家', shortLabel: '传' },
  BLUE: { label: '上乘', shortLabel: '上' },
  PURPLE: { label: '镇派', shortLabel: '镇' },
  GOLD: { label: '绝世', shortLabel: '绝' },
  RED: { label: '传说', shortLabel: '说' },
};

const normalizeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_·・《》<>（）()[\]【】$-]/g, '');

const createIcon = (icon: CatalogIcon): CatalogIcon => icon;

export const iconCatalog: CatalogIcon[] = [
  createIcon({
    id: 'anran_xiaohun_zhang',
    src: anranXiaohunZhangUrl,
    label: '黯然销魂掌',
    names: ['黯然銷魂掌', '黯然销魂掌'],
    aliases: ['黯然', '黯然掌'],
    kind: 'martial',
    categories: ['拳掌'],
  }),
  createIcon({
    id: 'beiming_zhenqi',
    src: beimingZhenqiUrl,
    label: '北冥真气',
    names: ['北冥真氣', '北冥真气'],
    aliases: ['北冥神功', '北冥'],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'bihai_chaosheng',
    src: bihaiChaoshengUrl,
    label: '碧海潮生',
    names: ['碧海潮生', '碧海潮生曲'],
    aliases: ['碧海潮生功'],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'baihe_shuchi',
    src: baiheShuchiUrl,
    label: '白鹤舒翅',
    names: ['白鶴舒翅', '白鹤舒翅'],
    aliases: [],
    kind: 'martial',
    categories: ['拳掌', '轻功'],
  }),
  createIcon({
    id: 'bingxin_jue',
    src: bingxinJueUrl,
    label: '冰心诀',
    names: ['冰心訣', '冰心诀'],
    aliases: [],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'busi_yinfa',
    src: busiYinfaUrl,
    label: '不死印法',
    names: ['不死印法'],
    aliases: [],
    kind: 'martial',
    categories: ['内功', '外功'],
  }),
  createIcon({
    id: 'canhe_jianqi',
    src: canheJianqiUrl,
    label: '参合剑气',
    names: ['參合劍氣', '参合剑气'],
    aliases: ['参合指'],
    kind: 'martial',
    categories: ['剑法', '指法'],
  }),
  createIcon({
    id: 'pikong_zhang',
    src: pikongZhangUrl,
    label: '劈空掌',
    names: ['劈空掌'],
    aliases: [],
    kind: 'martial',
    categories: ['拳掌'],
  }),
  createIcon({
    id: 'lingbie_bu',
    src: lingbieBuUrl,
    label: '灵鳖步',
    names: ['靈鱉步', '灵鳖步'],
    aliases: ['凌波微步', '瞬息千里'],
    kind: 'martial',
    categories: ['轻功'],
  }),
  createIcon({
    id: 'huayan_miaoyin',
    src: huayanMiaoyinUrl,
    label: '华严妙音',
    names: ['華嚴妙音', '华严妙音'],
    aliases: ['狮子吼'],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'jiuyang_shengong',
    src: jiuyangShengongUrl,
    label: '九阳神功',
    names: ['九陽神功', '九阳神功'],
    aliases: ['九阳真经', '九陽真經', '少林九阳功', '武当九阳功', '峨嵋九阳功'],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'jiuyin_zhenjing',
    src: jiuyinZhenjingUrl,
    label: '九阴真经',
    names: ['九陰真經', '九阴真经'],
    aliases: ['九阴白骨爪', '九陰白骨爪', '逆练九阴真经', '逆練九陰真經'],
    kind: 'martial',
    categories: ['内功', '拳掌'],
  }),
  createIcon({
    id: 'yijin_jing',
    src: yijinJingUrl,
    label: '易筋经',
    names: ['易筋經', '易筋经'],
    aliases: ['易筋锻骨篇', '易筋鍛骨篇'],
    kind: 'martial',
    categories: ['内功', '外功'],
  }),
  createIcon({
    id: 'qiankun_danuoyi',
    src: qiankunDanuoyiUrl,
    label: '乾坤大挪移',
    names: ['乾坤大挪移'],
    aliases: [],
    kind: 'martial',
    categories: ['内功'],
  }),
  createIcon({
    id: 'longxiang_banruo_gong',
    src: longxiangBanruoGongUrl,
    label: '龙象般若功',
    names: ['龍象般若功', '龙象般若功'],
    aliases: [],
    kind: 'martial',
    categories: ['外功'],
  }),
  createIcon({
    id: 'shengsi_fu',
    src: shengsiFuUrl,
    label: '生死符',
    names: ['生死符'],
    aliases: [],
    kind: 'martial',
    categories: ['暗器'],
  }),
  createIcon({
    id: 'hujia_daofa',
    src: hujiaDaofaUrl,
    label: '胡家刀法',
    names: ['胡家刀法'],
    aliases: [],
    kind: 'martial',
    categories: ['刀法'],
  }),
  createIcon({
    id: 'shexing_lifan',
    src: shexingLifanUrl,
    label: '蛇行狸翻',
    names: ['蛇行狸翻'],
    aliases: [],
    kind: 'martial',
    categories: ['轻功'],
  }),
  createIcon({
    id: 'huti_zhenqi',
    src: hutiZhenqiUrl,
    label: '护体真气',
    names: ['護體真氣', '护体真气'],
    aliases: ['金钟罩', '铁布衫'],
    kind: 'martial',
    categories: ['外功', '内功'],
  }),
  createIcon({
    id: 'beidou_gangjian',
    src: beidouGangjianUrl,
    label: '北斗罡剑',
    names: ['北斗罡劍', '北斗罡剑'],
    aliases: ['全真剑法', '同归剑法'],
    kind: 'martial',
    categories: ['剑法'],
  }),
  createIcon({
    id: 'daoqi_zongheng',
    src: daoqiZonghengUrl,
    label: '刀气纵横',
    names: ['刀氣縱橫', '刀气纵横'],
    aliases: ['火焰刀', '阴风刀'],
    kind: 'martial',
    categories: ['刀法'],
  }),
  createIcon({
    id: 'hunyuan_zhang',
    src: hunyuanZhangUrl,
    label: '混元掌',
    names: ['混元掌'],
    aliases: ['混元功'],
    kind: 'martial',
    categories: ['拳掌'],
  }),
  createIcon({
    id: 'tanzhi_qing',
    src: tanzhiQingUrl,
    label: '弹指顷',
    names: ['彈指頃', '弹指顷'],
    aliases: ['弹指神通', '彈指神通'],
    kind: 'martial',
    categories: ['指法'],
  }),
  createIcon({
    id: 'mianli_cangzhen',
    src: mianliCangzhenUrl,
    label: '绵里藏针',
    names: ['綿裡藏針', '绵里藏针'],
    aliases: ['满天花雨掷金针', '玉蜂针'],
    kind: 'martial',
    categories: ['暗器'],
  }),
  createIcon({
    id: 'poqiang_shi',
    src: poqiangShiUrl,
    label: '破枪式',
    names: ['破槍式', '破枪式'],
    aliases: [],
    kind: 'martial',
    categories: ['枪戟'],
  }),
  createIcon({
    id: 'dangtou_banghe',
    src: dangtouBangheUrl,
    label: '当头棒喝',
    names: ['當頭棒喝', '当头棒喝'],
    aliases: ['伏魔杖法', '打狗棒法', '大力金刚杖法'],
    kind: 'martial',
    categories: ['棍锤'],
  }),
  createIcon({
    id: 'dahuandan',
    src: dahuandanUrl,
    label: '大还丹',
    names: ['大还丹', '大還丹'],
    aliases: ['还丹', '還丹'],
    kind: 'inventory',
    categories: ['ELIXIR', '药品', '丹药'],
  }),
  createIcon({
    id: 'jiuhua_yulu_wan',
    src: jiuhuaYuluWanUrl,
    label: '九花玉露丸',
    names: ['九花玉露丸'],
    aliases: [],
    kind: 'inventory',
    categories: ['ELIXIR', '药品', '丹药'],
  }),
  createIcon({
    id: 'jinchuang_yao',
    src: jinchuangYaoUrl,
    label: '金创药',
    names: ['金創藥', '金创药'],
    aliases: [],
    kind: 'inventory',
    categories: ['ELIXIR', '药品', '丹药'],
  }),
  createIcon({
    id: 'jifeng_dan',
    src: jifengDanUrl,
    label: '疾风丹',
    names: ['疾風丹', '疾风丹'],
    aliases: [],
    kind: 'inventory',
    categories: ['ELIXIR', '药品', '丹药'],
  }),
  createIcon({
    id: 'longjiao_jian',
    src: longjiaoJianUrl,
    label: '龙角剑',
    names: ['龙角剑', '龍角劍'],
    aliases: ['长剑', '寶劍', '宝剑'],
    kind: 'inventory',
    categories: ['EQUIP', '兵甲', '剑'],
  }),
  createIcon({
    id: 'bafang_cangdao',
    src: bafangCangdaoUrl,
    label: '八方藏刀',
    names: ['八方藏刀'],
    aliases: ['刀', '宝刀', '寶刀'],
    kind: 'inventory',
    categories: ['EQUIP', '兵甲', '刀'],
  }),
  createIcon({
    id: 'cangqiong_xuejia',
    src: cangqiongXuejiaUrl,
    label: '苍穹血甲',
    names: ['蒼穹血甲', '苍穹血甲'],
    aliases: ['甲', '护甲', '護甲'],
    kind: 'inventory',
    categories: ['EQUIP', '兵甲', '甲'],
  }),
  createIcon({
    id: 'huangdi_neijing',
    src: huangdiNeijingUrl,
    label: '黄帝内经',
    names: ['黃帝內經', '黄帝内经'],
    aliases: ['经书', '經書'],
    kind: 'inventory',
    categories: ['SECRET', '秘籍'],
  }),
  createIcon({
    id: 'yunv_xinjing',
    src: yunvXinjingUrl,
    label: '玉女心经',
    names: ['玉女心經', '玉女心经'],
    aliases: [],
    kind: 'inventory',
    categories: ['SECRET', '秘籍'],
  }),
  createIcon({
    id: 'sunv_jing',
    src: sunvJingUrl,
    label: '素女经',
    names: ['素女經', '素女经'],
    aliases: ['秘籍', '秘笈'],
    kind: 'inventory',
    categories: ['SECRET', '秘籍'],
  }),
  createIcon({
    id: 'chuanguo_yuxi',
    src: chuanguoYuxiUrl,
    label: '传国玉玺',
    names: ['傳國玉璽', '传国玉玺'],
    aliases: ['玉玺', '玉璽', '玉佩'],
    kind: 'inventory',
    categories: ['MISC', '杂物'],
  }),
  createIcon({
    id: 'polu_ling',
    src: poluLingUrl,
    label: '破虏令',
    names: ['破虜令', '破虏令'],
    aliases: ['令牌', '令'],
    kind: 'inventory',
    categories: ['MISC', '杂物'],
  }),
  createIcon({
    id: 'nianzhu',
    src: nianzhuUrl,
    label: '念珠',
    names: ['念珠'],
    aliases: ['佛珠', '珠'],
    kind: 'inventory',
    categories: ['MISC', '杂物'],
  }),
  createIcon({
    id: 'visited_map',
    src: visitedMapUrl,
    label: '舆图',
    names: ['去過的地圖', '去过的地图'],
    aliases: ['地图', '地圖', '舆图', '輿圖'],
    kind: 'inventory',
    categories: ['MISC', '杂物'],
  }),
  createIcon({
    id: 'kuihua_baoyu',
    src: kuihuaBaoyuUrl,
    label: '葵花宝玉',
    names: ['葵花寶玉', '葵花宝玉'],
    aliases: ['宝玉', '寶玉'],
    kind: 'inventory',
    categories: ['MISC', '杂物'],
  }),
];

const normalizedNames = (icon: CatalogIcon): string[] => icon.names.map(normalizeName);
const normalizedAliases = (icon: CatalogIcon): string[] => icon.aliases.map(normalizeName);

function findIconByName(name: string): ResolvedIcon | null {
  const normalized = normalizeName(name);
  const exact = iconCatalog.find(icon => normalizedNames(icon).includes(normalized));
  if (exact) {
    return { src: exact.src, label: exact.label, matchedBy: 'name' };
  }

  const alias = iconCatalog.find(icon => normalizedAliases(icon).includes(normalized));
  if (alias) {
    return { src: alias.src, label: alias.label, matchedBy: 'alias' };
  }

  return null;
}

function findIconByCategory(category: string): CatalogIcon | undefined {
  return iconCatalog.find(icon => icon.categories.includes(category));
}

const fallbackIcon = iconCatalog.find(icon => icon.id === 'chuanguo_yuxi')!;

const inventoryTypeFallback: Record<InventoryItem['type'], string> = {
  EQUIP: 'EQUIP',
  SECRET: 'SECRET',
  ELIXIR: 'ELIXIR',
  MISC: 'MISC',
};

const martialTypeFallback: Record<string, string> = {
  内功: '内功',
  外功: '外功',
  轻功: '轻功',
  剑法: '剑法',
  刀法: '刀法',
  拳掌: '拳掌',
  指法: '指法',
  暗器: '暗器',
  枪戟: '枪戟',
  棍锤: '棍锤',
};

export function resolveInventoryIcon(item: InventoryItem): ResolvedIcon {
  const byName = findIconByName(item.name);
  if (byName) {
    return byName;
  }

  const fallbackCategory = inventoryTypeFallback[item.type];
  const typeIcon = findIconByCategory(fallbackCategory);
  if (typeIcon) {
    return { src: typeIcon.src, label: typeIcon.label, matchedBy: 'type' };
  }

  return { src: fallbackIcon.src, label: fallbackIcon.label, matchedBy: 'fallback' };
}

export function resolveMartialArtIcon(name: string, art?: Pick<MartialArt, 'type'>): ResolvedIcon {
  const byName = findIconByName(name);
  if (byName) {
    return byName;
  }

  const fallbackCategory = art?.type ? martialTypeFallback[art.type] : undefined;
  const typeIcon = fallbackCategory ? findIconByCategory(fallbackCategory) : undefined;
  if (typeIcon) {
    return { src: typeIcon.src, label: typeIcon.label, matchedBy: 'type' };
  }

  return { src: fallbackIcon.src, label: fallbackIcon.label, matchedBy: 'fallback' };
}

export function getRankVisual(rank?: string, variant: 'item' | 'secret' | 'martial' = 'item'): RankVisual {
  const key = rank && rankVisuals[rank] ? rank : martialRankToGenericKey[rank || ''] || 'WHITE';
  const base = rankVisuals[key];

  if (variant === 'secret' || variant === 'martial') {
    const martialLabel = genericRankToMartialLabel[key];
    return { ...base, label: martialLabel.label, shortLabel: martialLabel.shortLabel };
  }

  return base;
}
