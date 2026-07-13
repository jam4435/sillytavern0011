import type { MartialArt } from '../types';

import buddhistInnerUrl from '../assets/icons/jinyong/martial_buddhist_inner.jpg?url';
import bodyUrl from '../assets/icons/jinyong/martial_body.png?url';
import fingerUrl from '../assets/icons/jinyong/martial_finger.png?url';
import fistUrl from '../assets/icons/jinyong/martial_fist.png?url';
import formationUrl from '../assets/icons/jinyong/martial_formation.png?url';
import grappleUrl from '../assets/icons/jinyong/martial_grapple.png?url';
import hiddenNeedleUrl from '../assets/icons/jinyong/martial_hidden_needle.jpg?url';
import innerYangUrl from '../assets/icons/jinyong/martial_inner_yang.png?url';
import innerYinUrl from '../assets/icons/jinyong/martial_inner_yin.png?url';
import palmUrl from '../assets/icons/jinyong/martial_palm.png?url';
import palmDragonUrl from '../assets/icons/jinyong/martial_palm_dragon.png?url';
import poisonUrl from '../assets/icons/jinyong/martial_poison.png?url';
import qinggongUrl from '../assets/icons/jinyong/martial_qinggong.png?url';
import qinggongWallUrl from '../assets/icons/jinyong/martial_qinggong_wall.png?url';
import saberFireUrl from '../assets/icons/jinyong/martial_saber_fire.jpg?url';
import saberForceUrl from '../assets/icons/jinyong/martial_saber_force.jpg?url';
import soundUrl from '../assets/icons/jinyong/martial_sound.png?url';
import spearUrl from '../assets/icons/jinyong/martial_spear.jpg?url';
import staffUrl from '../assets/icons/jinyong/martial_staff.png?url';
import swordForceUrl from '../assets/icons/jinyong/martial_sword_force.png?url';
import swordFormationUrl from '../assets/icons/jinyong/martial_sword_formation.jpg?url';
import swordSwiftUrl from '../assets/icons/jinyong/martial_sword_swift.jpg?url';
import whipUrl from '../assets/icons/jinyong/martial_whip.jpg?url';

export type MartialVisualMatchReason = 'semantic' | 'type' | 'fallback';

export interface MartialVisualResult {
  src: string;
  label: string;
  category: string;
  matchedBy: MartialVisualMatchReason;
}

interface MartialVisualRule {
  pattern: RegExp;
  src: string;
  label: string;
  category: string;
  types?: string[];
}

const semanticRules: MartialVisualRule[] = [
  { pattern: /阵|互搏|两仪/, src: formationUrl, label: '阵法气机', category: '阵法' },
  { pattern: /吼|啸|音|琴|箫|筝|唱|腹语|潮生曲/, src: soundUrl, label: '音律真气', category: '音律' },
  { pattern: /毒|砂|蜈蚣|腐尸|化血|碧磷|无形粉|三笑/, src: poisonUrl, label: '毒功', category: '毒功' },
  { pattern: /降龙|龙象|龙爪|擒龙|龙/, src: palmDragonUrl, label: '龙形劲力', category: '龙形武学' },
  { pattern: /擒拿|擒|爪|抓|锁喉|错骨|夺白刃/, src: grappleUrl, label: '擒拿手', category: '擒拿' },
  {
    pattern: /易筋|神足|罗汉|金刚|般若|禅|达摩|伏魔|袈裟|韦陀|佛光|须弥|释迦|天竺|拈花|寂灭|因陀罗/,
    src: buddhistInnerUrl,
    label: '佛门真功',
    category: '佛门武学',
  },
  { pattern: /九阳|纯阳|烈|炎|火|阳刚|乾坤/, src: innerYangUrl, label: '纯阳真气', category: '阳刚内功' },
  { pattern: /九阴|玄冥|寒|阴|冰|北冥|化功|葵花/, src: innerYinUrl, label: '阴柔真气', category: '阴柔内功' },
  { pattern: /壁虎|游墙|上天梯|梯云纵/, src: qinggongWallUrl, label: '提纵术', category: '提纵轻功', types: ['轻功'] },
  {
    pattern: /凌波|瞬息|移形|燕子|草上飞|轻功|身法|步法|凭虚临风|水上飘|蛇行狸翻/,
    src: qinggongUrl,
    label: '轻身步法',
    category: '轻功',
    types: ['轻功'],
  },
  {
    pattern: /剑阵|两仪剑|太极剑|全真剑|玉女剑|峨嵋|峨眉/,
    src: swordFormationUrl,
    label: '剑阵',
    category: '剑阵',
    types: ['剑法'],
  },
  {
    pattern: /玄铁|重剑|剑意|破剑|神门|伏魔剑|达摩剑/,
    src: swordForceUrl,
    label: '重剑剑气',
    category: '刚猛剑法',
    types: ['剑法'],
  },
  { pattern: /剑/, src: swordSwiftUrl, label: '流光剑式', category: '剑法', types: ['剑法'] },
  {
    pattern: /火焰刀|阴风刀|圣火令|燃木刀/,
    src: saberFireUrl,
    label: '炽烈刀罡',
    category: '奇门刀法',
    types: ['刀法', '拳掌'],
  },
  { pattern: /刀/, src: saberForceUrl, label: '刚猛刀势', category: '刀法', types: ['刀法'] },
  {
    pattern: /针|钉|镖|菱|银梭|花雨|暗器|生死符/,
    src: hiddenNeedleUrl,
    label: '飞针暗器',
    category: '暗器',
    types: ['暗器'],
  },
  { pattern: /指|点穴/, src: fingerUrl, label: '指劲', category: '指法', types: ['指法'] },
  { pattern: /枪|戟/, src: spearUrl, label: '枪戟锋芒', category: '枪戟', types: ['枪戟'] },
  { pattern: /鞭|索|金铃/, src: whipUrl, label: '长索鞭影', category: '鞭索', types: ['棍锤', '暗器'] },
  { pattern: /杖|棒|棍|锤|铲|拐|牌法|斧|剪/, src: staffUrl, label: '重兵器', category: '棍锤', types: ['棍锤'] },
  { pattern: /拳/, src: fistUrl, label: '拳劲', category: '拳法', types: ['拳掌'] },
  { pattern: /掌|手|腿|脚|摔跤/, src: palmUrl, label: '掌腿招式', category: '掌腿', types: ['拳掌', '外功'] },
];

const typeFallbacks: Record<string, Omit<MartialVisualResult, 'matchedBy'>> = {
  内功: { src: innerYangUrl, label: '周天真气', category: '内功' },
  外功: { src: bodyUrl, label: '护体外功', category: '外功' },
  轻功: { src: qinggongUrl, label: '轻身步法', category: '轻功' },
  剑法: { src: swordSwiftUrl, label: '流光剑式', category: '剑法' },
  刀法: { src: saberForceUrl, label: '刚猛刀势', category: '刀法' },
  拳掌: { src: palmUrl, label: '掌腿招式', category: '拳掌' },
  指法: { src: fingerUrl, label: '指劲', category: '指法' },
  暗器: { src: hiddenNeedleUrl, label: '飞针暗器', category: '暗器' },
  枪戟: { src: spearUrl, label: '枪戟锋芒', category: '枪戟' },
  棍锤: { src: staffUrl, label: '重兵器', category: '棍锤' },
};

const legacyTypeAliases: Record<string, string> = {
  拳脚: '拳掌',
  掌法: '拳掌',
  拳法: '拳掌',
  枪法: '枪戟',
  戟法: '枪戟',
  棍法: '棍锤',
  杖法: '棍锤',
};

export function resolveMartialVisual(name: string, art?: Pick<MartialArt, 'type'>): MartialVisualResult {
  const rawType = art?.type || '';
  const type = legacyTypeAliases[rawType] || rawType;
  const semantic = semanticRules.find(rule => rule.pattern.test(name) && (!rule.types || rule.types.includes(type)));

  if (semantic) {
    return {
      src: semantic.src,
      label: semantic.label,
      category: semantic.category,
      matchedBy: 'semantic',
    };
  }

  const fallback = typeFallbacks[type];
  return fallback
    ? { ...fallback, matchedBy: 'type' }
    : { src: bodyUrl, label: '无名武学', category: '武学', matchedBy: 'fallback' };
}
