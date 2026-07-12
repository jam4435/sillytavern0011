import type { InventoryItem } from '../types';

import medicinePill1 from '../assets/icons/jinyong/medicine_pill_1.png?url';
import medicinePill2 from '../assets/icons/jinyong/medicine_pill_2.jpg?url';
import medicinePill3 from '../assets/icons/jinyong/medicine_pill_3.png?url';
import medicinePill4 from '../assets/icons/jinyong/medicine_pill_4.jpg?url';
import medicinePellet1 from '../assets/icons/jinyong/medicine_pellet_1.jpg?url';
import medicinePellet2 from '../assets/icons/jinyong/medicine_pellet_2.jpg?url';
import medicinePellet3 from '../assets/icons/jinyong/medicine_pellet_3.jpg?url';
import medicinePellet4 from '../assets/icons/jinyong/medicine_pellet_4.jpg?url';
import medicinePowder1 from '../assets/icons/jinyong/medicine_powder_1.jpg?url';
import medicinePowder2 from '../assets/icons/jinyong/medicine_powder_2.png?url';
import medicinePowder3 from '../assets/icons/jinyong/medicine_powder_3.jpg?url';
import medicineWine1 from '../assets/icons/jinyong/medicine_wine_1.png?url';
import medicineWine2 from '../assets/icons/jinyong/medicine_wine_2.jpg?url';
import medicineWine3 from '../assets/icons/jinyong/medicine_wine_3.png?url';
import medicineWine4 from '../assets/icons/jinyong/medicine_wine_4.jpg?url';
import medicineSalve1 from '../assets/icons/jinyong/medicine_salve_1.jpg?url';
import medicineSalve2 from '../assets/icons/jinyong/medicine_salve_2.jpg?url';
import medicineSalve3 from '../assets/icons/jinyong/medicine_salve_3.png?url';
import medicineFruit1 from '../assets/icons/jinyong/medicine_fruit_1.jpg?url';
import medicineFruit2 from '../assets/icons/jinyong/medicine_fruit_2.png?url';
import medicineFruit3 from '../assets/icons/jinyong/medicine_fruit_3.jpg?url';
import medicineFruit4 from '../assets/icons/jinyong/medicine_fruit_4.jpg?url';
import medicinePoison1 from '../assets/icons/jinyong/medicine_poison_1.jpg?url';
import medicinePoison2 from '../assets/icons/jinyong/medicine_poison_2.png?url';
import medicinePoison3 from '../assets/icons/jinyong/medicine_poison_3.jpg?url';
import medicinePoison4 from '../assets/icons/jinyong/medicine_poison_4.png?url';
import medicineHerb1 from '../assets/icons/jinyong/medicine_herb_1.png?url';
import medicineHerb2 from '../assets/icons/jinyong/medicine_herb_2.jpg?url';
import medicineHerb3 from '../assets/icons/jinyong/medicine_herb_3.jpg?url';
import medicineHerb4 from '../assets/icons/jinyong/medicine_herb_4.jpg?url';
import medicineIncense1 from '../assets/icons/jinyong/medicine_incense_1.jpg?url';
import medicineIncense2 from '../assets/icons/jinyong/medicine_incense_2.jpg?url';
import medicineIncense3 from '../assets/icons/jinyong/medicine_incense_3.jpg?url';
import medicineIncense4 from '../assets/icons/jinyong/medicine_incense_4.jpg?url';

import equipSword1 from '../assets/icons/jinyong/equip_sword_1.jpg?url';
import equipSword2 from '../assets/icons/jinyong/equip_sword_2.jpg?url';
import equipSword3 from '../assets/icons/jinyong/equip_sword_3.jpg?url';
import equipSword4 from '../assets/icons/jinyong/equip_sword_4.jpg?url';
import equipSaber1 from '../assets/icons/jinyong/equip_saber_1.png?url';
import equipSaber2 from '../assets/icons/jinyong/equip_saber_2.jpg?url';
import equipSaber3 from '../assets/icons/jinyong/equip_saber_3.jpg?url';
import equipSaber4 from '../assets/icons/jinyong/equip_saber_4.jpg?url';
import equipSpear1 from '../assets/icons/jinyong/equip_spear_1.png?url';
import equipSpear2 from '../assets/icons/jinyong/equip_spear_2.png?url';
import equipSpear3 from '../assets/icons/jinyong/equip_spear_3.jpg?url';
import equipSpear4 from '../assets/icons/jinyong/equip_spear_4.png?url';
import equipStaff1 from '../assets/icons/jinyong/equip_staff_1.png?url';
import equipStaff2 from '../assets/icons/jinyong/equip_staff_2.jpg?url';
import equipStaff3 from '../assets/icons/jinyong/equip_staff_3.png?url';
import equipStaff4 from '../assets/icons/jinyong/equip_staff_4.jpg?url';
import equipGlove1 from '../assets/icons/jinyong/equip_glove_1.jpg?url';
import equipGlove2 from '../assets/icons/jinyong/equip_glove_2.jpg?url';
import equipGlove3 from '../assets/icons/jinyong/equip_glove_3.jpg?url';
import equipGlove4 from '../assets/icons/jinyong/equip_glove_4.jpg?url';
import equipHidden1 from '../assets/icons/jinyong/equip_hidden_1.jpg?url';
import equipHidden2 from '../assets/icons/jinyong/equip_hidden_2.jpg?url';
import equipHidden3 from '../assets/icons/jinyong/equip_hidden_3.jpg?url';
import equipHidden4 from '../assets/icons/jinyong/equip_hidden_4.png?url';
import equipArmor1 from '../assets/icons/jinyong/equip_armor_1.jpg?url';
import equipArmor2 from '../assets/icons/jinyong/equip_armor_2.jpg?url';
import equipArmor3 from '../assets/icons/jinyong/equip_armor_3.jpg?url';
import equipArmor4 from '../assets/icons/jinyong/equip_armor_4.jpg?url';
import equipShoes1 from '../assets/icons/jinyong/equip_shoes_1.jpg?url';
import equipShoes2 from '../assets/icons/jinyong/equip_shoes_2.png?url';
import equipShoes3 from '../assets/icons/jinyong/equip_shoes_3.jpg?url';
import equipAccessory1 from '../assets/icons/jinyong/equip_accessory_1.jpg?url';
import equipAccessory2 from '../assets/icons/jinyong/equip_accessory_2.jpg?url';
import equipAccessory3 from '../assets/icons/jinyong/equip_accessory_3.jpg?url';
import equipAccessory4 from '../assets/icons/jinyong/equip_accessory_4.png?url';
import equipFan1 from '../assets/icons/jinyong/equip_fan_1.jpg?url';
import equipFan2 from '../assets/icons/jinyong/equip_fan_2.jpg?url';
import equipAxe from '../assets/icons/jinyong/equip_axe.jpg?url';
import equipHammer from '../assets/icons/jinyong/equip_hammer.jpg?url';
import equipBow from '../assets/icons/jinyong/equip_bow.jpg?url';
import equipWhip from '../assets/icons/jinyong/equip_whip.jpg?url';

import secretInner1 from '../assets/icons/jinyong/secret_inner_1.png?url';
import secretInner2 from '../assets/icons/jinyong/secret_inner_2.png?url';
import secretInner3 from '../assets/icons/jinyong/secret_inner_3.png?url';
import secretInner4 from '../assets/icons/jinyong/secret_inner_4.png?url';
import secretSword1 from '../assets/icons/jinyong/secret_sword_1.png?url';
import secretSword2 from '../assets/icons/jinyong/secret_sword_2.jpg?url';
import secretSword3 from '../assets/icons/jinyong/secret_sword_3.png?url';
import secretSword4 from '../assets/icons/jinyong/secret_sword_4.png?url';
import secretSaber1 from '../assets/icons/jinyong/secret_saber_1.jpg?url';
import secretSaber2 from '../assets/icons/jinyong/secret_saber_2.jpg?url';
import secretSaber3 from '../assets/icons/jinyong/secret_saber_3.png?url';
import secretSaber4 from '../assets/icons/jinyong/secret_saber_4.png?url';
import secretFist1 from '../assets/icons/jinyong/secret_fist_1.jpg?url';
import secretFist2 from '../assets/icons/jinyong/secret_fist_2.jpg?url';
import secretFist3 from '../assets/icons/jinyong/secret_fist_3.png?url';
import secretFist4 from '../assets/icons/jinyong/secret_fist_4.png?url';
import secretQinggong1 from '../assets/icons/jinyong/secret_qinggong_1.jpg?url';
import secretQinggong2 from '../assets/icons/jinyong/secret_qinggong_2.jpg?url';
import secretQinggong3 from '../assets/icons/jinyong/secret_qinggong_3.jpg?url';
import secretQinggong4 from '../assets/icons/jinyong/secret_qinggong_4.jpg?url';
import secretMedicine1 from '../assets/icons/jinyong/secret_medicine_1.jpg?url';
import secretMedicine2 from '../assets/icons/jinyong/secret_medicine_2.jpg?url';
import secretMedicine3 from '../assets/icons/jinyong/secret_medicine_3.jpg?url';
import secretMedicine4 from '../assets/icons/jinyong/secret_medicine_4.jpg?url';
import secretOther1 from '../assets/icons/jinyong/secret_other_1.png?url';
import secretOther2 from '../assets/icons/jinyong/secret_other_2.png?url';
import secretOther3 from '../assets/icons/jinyong/secret_other_3.jpg?url';
import secretOther4 from '../assets/icons/jinyong/secret_other_4.jpg?url';

import miscToken1 from '../assets/icons/jinyong/misc_token_1.png?url';
import miscToken2 from '../assets/icons/jinyong/misc_token_2.jpg?url';
import miscToken3 from '../assets/icons/jinyong/misc_token_3.png?url';
import miscToken4 from '../assets/icons/jinyong/misc_token_4.jpg?url';
import miscDocument1 from '../assets/icons/jinyong/misc_document_1.jpg?url';
import miscDocument2 from '../assets/icons/jinyong/misc_document_2.jpg?url';
import miscDocument3 from '../assets/icons/jinyong/misc_document_3.jpg?url';
import miscDocument4 from '../assets/icons/jinyong/misc_document_4.png?url';
import miscOre1 from '../assets/icons/jinyong/misc_ore_1.jpg?url';
import miscOre2 from '../assets/icons/jinyong/misc_ore_2.jpg?url';
import miscOre3 from '../assets/icons/jinyong/misc_ore_3.jpg?url';
import miscOre4 from '../assets/icons/jinyong/misc_ore_4.jpg?url';
import miscBeast1 from '../assets/icons/jinyong/misc_beast_1.jpg?url';
import miscBeast2 from '../assets/icons/jinyong/misc_beast_2.jpg?url';
import miscBeast3 from '../assets/icons/jinyong/misc_beast_3.jpg?url';
import miscBeast4 from '../assets/icons/jinyong/misc_beast_4.jpg?url';
import miscGem1 from '../assets/icons/jinyong/misc_gem_1.png?url';
import miscGem2 from '../assets/icons/jinyong/misc_gem_2.jpg?url';
import miscGem3 from '../assets/icons/jinyong/misc_gem_3.jpg?url';
import miscGem4 from '../assets/icons/jinyong/misc_gem_4.jpg?url';
import miscContainer1 from '../assets/icons/jinyong/misc_container_1.png?url';
import miscContainer2 from '../assets/icons/jinyong/misc_container_2.png?url';
import miscContainer3 from '../assets/icons/jinyong/misc_container_3.png?url';
import miscContainer4 from '../assets/icons/jinyong/misc_container_4.png?url';
import miscMechanism1 from '../assets/icons/jinyong/misc_mechanism_1.jpg?url';
import miscMechanism2 from '../assets/icons/jinyong/misc_mechanism_2.png?url';
import miscMechanism3 from '../assets/icons/jinyong/misc_mechanism_3.jpg?url';
import miscMechanism4 from '../assets/icons/jinyong/misc_mechanism_4.png?url';
import miscQuest1 from '../assets/icons/jinyong/misc_quest_1.jpg?url';
import miscQuest2 from '../assets/icons/jinyong/misc_quest_2.jpg?url';
import miscQuest3 from '../assets/icons/jinyong/misc_quest_3.jpg?url';
import miscQuest4 from '../assets/icons/jinyong/misc_quest_4.jpg?url';

export type InventoryVisualCategory =
  | '丹药'
  | '药丸'
  | '药散'
  | '药酒'
  | '膏药'
  | '香囊'
  | '灵果'
  | '毒物'
  | '药材'
  | '剑'
  | '刀'
  | '枪戟'
  | '棍棒'
  | '弓'
  | '斧'
  | '锤'
  | '扇'
  | '鞭'
  | '护手'
  | '暗器'
  | '衣甲'
  | '鞋履'
  | '饰品'
  | '内功经诀'
  | '剑谱'
  | '刀谱'
  | '拳掌谱'
  | '轻功身法'
  | '医毒典籍'
  | '阵法杂典'
  | '令牌印玺'
  | '地图'
  | '书信文书'
  | '矿石金属'
  | '兽材'
  | '珠玉'
  | '容器杂具'
  | '机关奇物'
  | '任务信物';

export interface InventoryVisualResult {
  src: string;
  label: string;
  category: InventoryVisualCategory;
  matchedBy: 'name' | 'type' | 'fallback';
}

type RankAssets = readonly [string, string, string, string];

const rankTierByKey: Record<string, number> = {
  WHITE: 0,
  GREEN: 0,
  BLUE: 1,
  PURPLE: 2,
  GOLD: 3,
  RED: 3,
  凡品: 0,
  精品: 0,
  珍品: 1,
  极品: 2,
  絕品: 3,
  绝品: 3,
  神品: 3,
};

const assets: Record<InventoryVisualCategory, RankAssets> = {
  丹药: [medicinePill1, medicinePill2, medicinePill3, medicinePill4],
  药丸: [medicinePellet1, medicinePellet2, medicinePellet3, medicinePellet4],
  药散: [medicinePowder1, medicinePowder2, medicinePowder3, medicinePowder3],
  药酒: [medicineWine1, medicineWine2, medicineWine3, medicineWine4],
  膏药: [medicineSalve1, medicineSalve1, medicineSalve2, medicineSalve3],
  香囊: [medicineIncense1, medicineIncense2, medicineIncense3, medicineIncense4],
  灵果: [medicineFruit1, medicineFruit2, medicineFruit3, medicineFruit4],
  毒物: [medicinePoison1, medicinePoison2, medicinePoison3, medicinePoison4],
  药材: [medicineHerb1, medicineHerb2, medicineHerb3, medicineHerb4],
  剑: [equipSword1, equipSword2, equipSword3, equipSword4],
  刀: [equipSaber1, equipSaber2, equipSaber3, equipSaber4],
  枪戟: [equipSpear1, equipSpear2, equipSpear3, equipSpear4],
  棍棒: [equipStaff1, equipStaff2, equipStaff3, equipStaff4],
  弓: [equipBow, equipBow, equipBow, equipBow],
  斧: [equipAxe, equipAxe, equipAxe, equipAxe],
  锤: [equipHammer, equipHammer, equipHammer, equipHammer],
  扇: [equipFan1, equipFan1, equipFan2, equipFan2],
  鞭: [equipWhip, equipWhip, equipWhip, equipWhip],
  护手: [equipGlove1, equipGlove2, equipGlove3, equipGlove4],
  暗器: [equipHidden1, equipHidden2, equipHidden3, equipHidden4],
  衣甲: [equipArmor1, equipArmor2, equipArmor3, equipArmor4],
  鞋履: [equipShoes1, equipShoes2, equipShoes3, equipShoes3],
  饰品: [equipAccessory1, equipAccessory2, equipAccessory3, equipAccessory4],
  内功经诀: [secretInner1, secretInner2, secretInner3, secretInner4],
  剑谱: [secretSword1, secretSword2, secretSword3, secretSword4],
  刀谱: [secretSaber1, secretSaber2, secretSaber3, secretSaber4],
  拳掌谱: [secretFist1, secretFist2, secretFist3, secretFist4],
  轻功身法: [secretQinggong1, secretQinggong2, secretQinggong3, secretQinggong4],
  医毒典籍: [secretMedicine1, secretMedicine2, secretMedicine3, secretMedicine4],
  阵法杂典: [secretOther1, secretOther2, secretOther3, secretOther4],
  令牌印玺: [miscToken1, miscToken2, miscToken3, miscToken4],
  地图: [miscDocument2, miscDocument2, miscDocument4, miscDocument4],
  书信文书: [miscDocument1, secretQinggong2, miscDocument3, secretOther4],
  矿石金属: [miscOre1, miscOre2, miscOre3, miscOre4],
  兽材: [miscBeast1, miscBeast2, miscBeast3, miscBeast4],
  珠玉: [miscGem1, miscGem2, miscGem3, miscGem4],
  容器杂具: [miscContainer1, miscContainer2, miscContainer3, miscContainer4],
  机关奇物: [miscMechanism1, miscMechanism2, miscMechanism3, miscMechanism4],
  任务信物: [miscQuest1, miscQuest2, miscQuest3, miscQuest4],
};

const normalize = (value: string | undefined): string =>
  (value || '').toLowerCase().replace(/[\s_·・《》<>（）()[\]【】$-]/g, '');

const exactCategoryByType: Partial<Record<InventoryItem['type'], Record<string, InventoryVisualCategory>>> = {
  EQUIP: {
    铁沙掌套: '护手',
    银针药囊: '饰品',
    惊堂木: '锤',
    螺钿团扇: '扇',
  },
  ELIXIR: {
    少林金疮药: '药散',
    华山跌打药: '药散',
    山寨旧藏金创药: '药散',
    三步倒: '毒物',
    定神香: '香囊',
    安神香囊: '香囊',
  },
  MISC: {
    达摩心经残页: '书信文书',
    贴身羊皮残图: '地图',
  },
};

function inferElixirCategory(item: InventoryItem): { category: InventoryVisualCategory; matchedBy: 'name' | 'type' } {
  const name = normalize(item.name);
  const detail = normalize(`${item.name}${item.description}`);
  if (/(毒|蛊|蠱|迷魂|蒙汗|三步倒|尸粉|屍粉|腐骨)/.test(name)) return { category: '毒物', matchedBy: 'name' };
  if (/(酒|酿|釀|醪|露饮|露飲)/.test(name)) return { category: '药酒', matchedBy: 'name' };
  if (/(膏|敷|脂|泥)/.test(name)) return { category: '膏药', matchedBy: 'name' };
  if (/(香囊|熏香|薰香|香$|香丸)/.test(name)) return { category: '香囊', matchedBy: 'name' };
  if (/(果|桃|枣|棗|梨|莓|莲子|蓮子|灵芝|靈芝)/.test(name)) return { category: '灵果', matchedBy: 'name' };
  if (/(散|粉|金创|金創|金疮|金瘡|止血|跌打|行军|行軍)/.test(name)) return { category: '药散', matchedBy: 'name' };
  if (/(丸)/.test(name)) return { category: '药丸', matchedBy: 'name' };
  if (/(丹)/.test(name)) return { category: '丹药', matchedBy: 'name' };
  if (/(草|药材|藥材|参|參|芝|花|根|叶|葉)/.test(name)) return { category: '药材', matchedBy: 'name' };
  if (/(外敷|涂抹|塗抹|药膏|藥膏)/.test(detail)) return { category: '膏药', matchedBy: 'type' };
  if (/(粉末|药散|藥散|油纸包|油紙包)/.test(detail)) return { category: '药散', matchedBy: 'type' };
  return { category: '丹药', matchedBy: 'type' };
}

function inferEquipCategory(item: InventoryItem): { category: InventoryVisualCategory; matchedBy: 'name' | 'type' } {
  const name = normalize(item.name);
  const slot = normalize(item.equipInfo?.slot);
  if (/(药囊|藥囊|香囊|针囊|針囊)/.test(name) && /饰品|飾品/.test(slot)) return { category: '饰品', matchedBy: 'name' };
  if (/(袖箭|袖刃|飞刀|飛刀|飞镖|飛鏢|银针|銀針|毒针|毒針|暗器|弩)/.test(name))
    return { category: '暗器', matchedBy: 'name' };
  if (/(掌套|拳套|手套|护手|護手|护腕|護腕|臂铠|臂鎧|爪套)/.test(name)) return { category: '护手', matchedBy: 'name' };
  if (/(长剑|長劍|铁剑|鐵劍|短剑|短劍|断剑|斷劍|重剑|重劍|剑|劍)/.test(name))
    return { category: '剑', matchedBy: 'name' };
  if (/(朴刀|苗刀|腰刀|弯刀|彎刀|戒刀|陌刀|短刀|长刀|長刀|刃|刀)/.test(name))
    return { category: '刀', matchedBy: 'name' };
  if (/(枪|槍|戟|矛|叉|槊)/.test(name)) return { category: '枪戟', matchedBy: 'name' };
  if (/(棍|棒|杖|锏|鐧)/.test(name)) return { category: '棍棒', matchedBy: 'name' };
  if (/(弓|弩)/.test(name)) return { category: '弓', matchedBy: 'name' };
  if (/(斧|钺|鉞)/.test(name)) return { category: '斧', matchedBy: 'name' };
  if (/(锤|錘|槌|惊堂木|驚堂木)/.test(name)) return { category: '锤', matchedBy: 'name' };
  if (/(扇)/.test(name)) return { category: '扇', matchedBy: 'name' };
  if (/(鞭|索)/.test(name)) return { category: '鞭', matchedBy: 'name' };
  if (/(鞋|靴|履)/.test(name)) return { category: '鞋履', matchedBy: 'name' };
  if (/(鞋履|鞋靴)/.test(slot)) return { category: '鞋履', matchedBy: 'type' };
  if (/(佩|坠|墜|珠|囊|簪|钗|釵|环|環|饰|飾|戒|镯|鐲)/.test(name)) return { category: '饰品', matchedBy: 'name' };
  if (/饰品|飾品/.test(slot)) return { category: '饰品', matchedBy: 'type' };
  if (/(甲|衣|袍|衫|褂|铠|鎧|护心|護心)/.test(name)) return { category: '衣甲', matchedBy: 'name' };
  if (/护甲|護甲/.test(slot)) return { category: '衣甲', matchedBy: 'type' };
  return { category: '剑', matchedBy: 'type' };
}

function inferSecretCategory(item: InventoryItem): { category: InventoryVisualCategory; matchedBy: 'name' | 'type' } {
  const name = normalize(item.name);
  const detail = normalize(`${item.name}${item.martialArtInfo?.description || item.description}`);
  if (/(医|醫|药|藥|毒|丹|经脉|經脈|针灸|針灸)/.test(name)) return { category: '医毒典籍', matchedBy: 'name' };
  if (/(剑|劍)/.test(name)) return { category: '剑谱', matchedBy: 'name' };
  if (/(刀)/.test(name)) return { category: '刀谱', matchedBy: 'name' };
  if (/(拳|掌|指|爪|腿|擒拿)/.test(name)) return { category: '拳掌谱', matchedBy: 'name' };
  if (/(轻功|輕功|步|身法|遁|游墙|遊牆)/.test(name)) return { category: '轻功身法', matchedBy: 'name' };
  if (/(内功|內功|心法|神功|真经|真經|气功|氣功|心经|心經|诀|訣)/.test(name))
    return { category: '内功经诀', matchedBy: 'name' };
  if (/(剑法|劍法|剑诀|劍訣)/.test(detail)) return { category: '剑谱', matchedBy: 'type' };
  if (/(刀法|刀诀|刀訣)/.test(detail)) return { category: '刀谱', matchedBy: 'type' };
  if (/(轻功|輕功|身法|步法)/.test(detail)) return { category: '轻功身法', matchedBy: 'type' };
  if (/(内功|內功|真气|真氣|心法)/.test(detail)) return { category: '内功经诀', matchedBy: 'type' };
  return { category: '阵法杂典', matchedBy: 'type' };
}

function inferMiscCategory(item: InventoryItem): { category: InventoryVisualCategory; matchedBy: 'name' | 'type' } {
  const name = normalize(item.name);
  const detail = normalize(`${item.name}${item.description}`);
  if (/(令牌|腰牌|竹牌|木牌|印玺|印璽|玉玺|玉璽|符牌|借阅牌|借閱牌|度牒)/.test(name))
    return { category: '令牌印玺', matchedBy: 'name' };
  if (/(地图|地圖|舆图|輿圖|残图|殘圖|藏宝图|藏寶圖)/.test(name)) return { category: '地图', matchedBy: 'name' };
  if (/(信|书信|書信|手稿|手札|卷宗|案卷|抄本|残页|殘頁|庚帖|图纸|圖紙|经文|經文|度牒)/.test(name))
    return { category: '书信文书', matchedBy: 'name' };
  if (/(哨|钥匙|鑰匙|机关|機關|锁|鎖|镜|鏡|轮|輪|罗盘|羅盤|火折|火摺)/.test(name))
    return { category: '机关奇物', matchedBy: 'name' };
  if (/(矿|礦|石|铁|鐵|铜|銅|银|銀|金条|金條|陨铁|隕鐵)/.test(name)) return { category: '矿石金属', matchedBy: 'name' };
  if (/(骨|角|爪|皮|鳞|鱗|羽|筋|胆|膽|兽|獸)/.test(name)) return { category: '兽材', matchedBy: 'name' };
  if (/(玉|珠|宝石|寶石|水晶|翡翠|玛瑙|瑪瑙|灵石|靈石)/.test(name)) return { category: '珠玉', matchedBy: 'name' };
  if (/(箱|匣|盒|瓶|罐|壶|壺|碗|篓|簍|篮|籃|囊|袋|坛|罈)/.test(name))
    return { category: '容器杂具', matchedBy: 'name' };
  if (/(草|药材|藥材|芝|花|木|竹|藤)/.test(name)) return { category: '药材', matchedBy: 'name' };
  if (/(凭证|憑證|暗记|暗記|身份|信物|旗|誓|遗物|遺物|残片|殘片|哨|木|碗)/.test(detail))
    return { category: '任务信物', matchedBy: 'type' };
  return { category: '任务信物', matchedBy: 'type' };
}

export function resolveInventoryVisual(item: InventoryItem): InventoryVisualResult {
  const exactCategory = exactCategoryByType[item.type]?.[normalize(item.name)];
  const inferred = exactCategory
    ? { category: exactCategory, matchedBy: 'name' as const }
    : item.type === 'ELIXIR'
      ? inferElixirCategory(item)
      : item.type === 'EQUIP'
        ? inferEquipCategory(item)
        : item.type === 'SECRET'
          ? inferSecretCategory(item)
          : inferMiscCategory(item);
  const tier = rankTierByKey[item.rank] ?? rankTierByKey[item.elixirInfo?.rank || ''] ?? 0;
  return {
    src: assets[inferred.category][tier],
    label: inferred.category,
    category: inferred.category,
    matchedBy: inferred.matchedBy,
  };
}

export const getInventoryVisualCategory = (item: InventoryItem): InventoryVisualCategory =>
  resolveInventoryVisual(item).category;
