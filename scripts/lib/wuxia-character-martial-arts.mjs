const MASTERY_LEVELS = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];

export const CHARACTER_ALIAS_TO_CANONICAL = new Map([
  ['完颜康', '杨康'],
  ['馬光佐', '马光佐'],
  ['渔夫', '泗水渔隐'],
  ['点苍渔隐', '泗水渔隐'],
  ['农夫', '武三通'],
  ['书生', '朱子柳'],
  ['天竺僧人', '天竺僧'],
]);

export const MARTIAL_ART_ALIAS_TO_CANONICAL = new Map([
  ['双手互搏', '左右互搏之术'],
  ['双手互搏之术', '左右互搏之术'],
  ['左右互搏', '左右互搏之术'],
  ['辽东野狐拳', '辽东野狐拳法'],
  ['落英神剑掌', '落英神剑掌法'],
  ['全真教内功', '全真派内功'],
  ['全真内功', '全真派内功'],
  ['全真入门拳法', '全真掌法'],
  ['全真入门剑法', '全真剑法'],
  ['水上飘轻功', '铁掌水上飘'],
  ['大关门式', '全真掌法'],
  ['虎门手', '全真掌法'],
  ['三连环', '全真剑法'],
  ['玉女投梭', '玉女剑法'],
  ['大风袖', '狂风迅雷功'],
  ['一阳指基础', '段氏基础指法'],
  ['段氏内功', '大理段氏内功'],
  ['段家剑法', '段家剑'],
  ['玉女心经外功', '玉女心经'],
  ['玉女心经内功', '玉女心经'],
  ['玉女心经口诀', '玉女心经'],
  ['古墓派入门内功', '古墓吐纳诀'],
  ['古墓派剑法', '玉女剑法'],
  ['玉女素心剑', '玉女素心剑法'],
  ['古墓派轻功', '捕雀功'],
  ['古墓派拳法', '美女拳法'],
  ['古墓派掌法', '天罗地网势'],
  ['打狗阵法', '打狗阵'],
  ['叫化棒法', '打狗棒法'],
  ['打狗棒法实战运用', '打狗棒法'],
  ['打狗棒法(招式)', '打狗棒法'],
  ['丐帮心法', '叫花行气诀'],
  ['少林吐纳心法', '童子功'],
  ['少林龙爪手', '龙爪手'],
  ['金刚不坏体神功', '金刚不坏神功'],
  ['金刚不坏体', '金刚不坏神功'],
  ['慕容家传剑法', '慕容剑法'],
  ['慕容氏剑法', '慕容剑法'],
  ['六脉神剑-少冲剑', '六脉神剑'],
  ['六脉神剑-少商剑', '六脉神剑'],
  ['六脉神剑-商阳剑', '六脉神剑'],
  ['六脉神剑-中冲剑', '六脉神剑'],
  ['六脉神剑-关冲剑', '六脉神剑'],
  ['六脉神剑-少泽剑', '六脉神剑'],
  ['九阴真经(逆)', '九阴假经'],
  ['密宗心法', '西藏密宗内功'],
  ['北冥真气', '北冥神功'],
  ['逍遥心法', '北冥神功'],
]);

// These mappings are useful leads for an audit, but are not evidence that the
// runtime's exact-name lookup will work.  In particular, they either collapse
// a broad category into one technique or make a substantive canonical choice.
export const MARTIAL_ART_ALIASES_REQUIRING_SEMANTIC_REVIEW = new Set([
  '太祖长拳',
  '少林七十二绝技',
  '少林神功',
  '慕容氏家传掌法',
  '全真教武功',
  '古墓派武功',
  '桃花岛基础武学',
  '桃花岛武学',
  '逍遥心法',
  '大理段氏家传武学',
  '大理段氏武功',
  '丐帮杖法',
  '少林内功',
  '少林长拳',
  '降龙二十八掌',
  '降龙廿八掌',
]);

const GENERIC_CHARACTER_ALIASES = new Set(['书生', '渔夫', '农夫']);
const GENERIC_ART_PHRASES = new Set([
  '武功',
  '功夫',
  '拳法',
  '掌法',
  '剑法',
  '刀法',
  '杖法',
  '鞭法',
  '轻功',
  '身法',
  '内功',
  '外功',
  '招式',
  '绝技',
]);
const GENERIC_ART_PHRASE_PATTERN =
  /^(?:(?:绝顶|上乘|高深|精妙|独门|本门|一门|这门|那门)?(?:轻功|武功|功夫|内功|外功|拳法|掌法|剑法|刀法|身法))$/;

const MARTIAL_IDENTITY_PATTERN =
  /武林|武学|高手|名宿|弟子|掌门|帮主|长老|护法|侠|剑|刀|枪|戟|棍|棒|杖|鞭|拳|掌|指|力士|勇士|将军|将领|军士|卫士|道士|道人|头陀|师太|僧|丐帮|全真|桃花岛|古墓|铁掌|少林|大理|南帝|一灯|密宗|天竺|回疆/;
const MARTIAL_REALM_PATTERN = /三流|二流|一流|后天|先天|绝顶|五绝|宗师|大宗师/;
const NON_MARTIAL_REALM_PATTERN = /^(?:凡人|不入流|未入流|不通武艺|不会武功|不懂武功|无|无武功)$/;
const WEAPON_PATTERN = /(剑|刀|枪|戟|棍|棒|杖|鞭|斧|锤|桨|锄)/;
const ART_NAME_ENDING_PATTERN =
  /(?:身法|步法|轻功|剑法|刀法|杖法|鞭法|掌法|拳法|指法|功|法|掌|拳|剑|刀|杖|鞭|指|手|阵)$/;

const IDENTITY_SUGGESTION_RULES = [
  { pattern: /全真/, arts: ['全真剑法', '金雁功'] },
  { pattern: /丐帮/, arts: ['逍遥游'] },
  { pattern: /桃花岛/, arts: ['落英神剑掌'] },
  { pattern: /古墓/, arts: ['天罗地网势', '古墓派入门内功'] },
  { pattern: /铁掌/, arts: ['铁掌功'] },
  { pattern: /大理|南帝|一灯/, arts: ['一阳指'] },
  { pattern: /少林/, arts: ['少林长拳', '罗汉拳'] },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function mergePlainObject(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (isPlainObject(target[key]) && isPlainObject(value)) mergePlainObject(target[key], value);
    else target[key] = cloneJson(value);
  }
  return target;
}

export function deleteByObject(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      if (isPlainObject(target[key])) deleteByObject(target[key], value);
      if (isPlainObject(target[key]) && Object.keys(target[key]).length === 0) delete target[key];
    } else {
      delete target[key];
    }
  }
}

export function canonicalCharacterName(name) {
  return CHARACTER_ALIAS_TO_CANONICAL.get(name) ?? name;
}

export function canonicalMartialArtName(name) {
  return MARTIAL_ART_ALIAS_TO_CANONICAL.get(name) ?? name;
}

export const NON_MARTIAL_SPECIALTY_NAMES = new Set([
  '游泳',
  '驯兽术',
  '驭兽术',
  '射艺',
  '易容术',
  '变声绝技',
  '岐黄医道',
  '本草医道',
  '金匮针法',
  '辨药施毒',
  '星宿毒术',
  '伏地听声',
  '腹语术',
  '武穆遗书阵法',
  '未知内功',
]);

export const NON_MARTIAL_EQUIPMENT_NAMES = new Set([
  '白金丝手套',
  '白绸带金球兵器',
  '绸带金球兵器',
  '君子剑',
  '淑女剑',
  '特制铁杖',
  '青铜杵',
  '八角铜锤',
  '判官双笔',
  '烂银点钢管',
  '双鞭',
  '双枪',
  '虎头双钩',
  '毒蒺藜',
  '毒菱',
  '毒雾',
  '麻袋秘术',
]);

export function normalizeMasteryPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return null;
  const p = prefix.trim();
  if (MASTERY_LEVELS.includes(p)) return p;
  if (['略有所成', '小成'].includes(p)) return '略有小成';
  if (['略知皮毛', '初学', '入门'].includes(p)) return '初窥门径';
  if (['大成', '纯熟', '精熟'].includes(p)) return '融会贯通';
  if (['圆满', '精深'].includes(p)) return '炉火纯青';
  if (['化境', '登峰造极', '通神'].includes(p)) return '出神入化';
  return null;
}

export function parseMasteryDetails(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { 标准掌握程度: null, 掌握程度: null, 掌握程度说明: null, 原始掌握程度: null };
  }
  const trimmed = value.trim();
  let standard = null;
  let extra = null;

  const parenMatch = trimmed.match(/^([^（(]+)[（(]([\s\S]+)[）)]$/);
  if (parenMatch) {
    const prefix = parenMatch[1].trim();
    extra = parenMatch[2].trim();
    standard = normalizeMasteryPrefix(prefix);
  } else {
    const dashMatch = trimmed.match(/^([^\s—:：]+)[—:：\s]+([\s\S]+)$/);
    if (dashMatch && normalizeMasteryPrefix(dashMatch[1].trim())) {
      standard = normalizeMasteryPrefix(dashMatch[1].trim());
      extra = dashMatch[2].trim();
    } else {
      standard = normalizeMasteryPrefix(trimmed);
      if (!standard) {
        extra = trimmed;
      }
    }
  }

  return {
    标准掌握程度: standard,
    掌握程度: standard,
    掌握程度说明: extra || null,
    原始掌握程度: trimmed,
  };
}

export function normalizeMastery(value) {
  return parseMasteryDetails(value).标准掌握程度;
}

function extractMastery(value) {
  return isPlainObject(value) && typeof value.掌握程度 === 'string' ? value.掌握程度 : null;
}

function compareJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function eventReference(event) {
  return {
    事件: event.runtimeKey,
    原文件: event.sourceName,
    事件类型: event.kind,
    原始操作: event.currentOperation,
    触发时间: cloneJson(event.triggerTime),
    结算时间: cloneJson(event.endTime),
    生效时间: cloneJson(event.effectTime),
  };
}

function aliasesForCanonical(canonical) {
  return [...CHARACTER_ALIAS_TO_CANONICAL.entries()]
    .filter(([, value]) => value === canonical)
    .map(([alias]) => alias)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function ensureCharacterRecord(records, canonical) {
  if (!records.has(canonical)) {
    records.set(canonical, {
      canonical,
      rawKeys: new Set(),
      aliases: new Set(aliasesForCanonical(canonical)),
      firstAppearance: null,
      martialArts: new Map(),
      changes: [],
      involvedEvents: new Map(),
    });
  }
  return records.get(canonical);
}

function ensureArtRecord(characterRecord, rawArtName) {
  const canonicalArt = canonicalMartialArtName(rawArtName);
  if (!characterRecord.martialArts.has(canonicalArt)) {
    characterRecord.martialArts.set(canonicalArt, {
      canonical: canonicalArt,
      rawNames: new Set(),
      changes: [],
    });
  }
  const record = characterRecord.martialArts.get(canonicalArt);
  record.rawNames.add(rawArtName);
  return record;
}

function classifyPowerChange(before, after) {
  if (before === undefined && after !== undefined) return '获得';
  if (before !== undefined && after === undefined) return '删除';
  const beforeMastery = normalizeMastery(extractMastery(before));
  const afterMastery = normalizeMastery(extractMastery(after));
  const beforeIndex = MASTERY_LEVELS.indexOf(beforeMastery);
  const afterIndex = MASTERY_LEVELS.indexOf(afterMastery);
  if (beforeIndex >= 0 && afterIndex > beforeIndex) return '升级';
  if (afterIndex >= 0 && beforeIndex > afterIndex) return '降级';
  return '更新';
}

function recordPowerDiff(characterRecord, beforePowers, afterPowers, event, rawCharacterKey) {
  const rawArtNames = [...new Set([...Object.keys(beforePowers), ...Object.keys(afterPowers)])].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  for (const rawArtName of rawArtNames) {
    const before = beforePowers[rawArtName];
    const after = afterPowers[rawArtName];
    if (compareJson(before, after)) continue;
    const operation = classifyPowerChange(before, after);
    const beforeRaw = extractMastery(before);
    const afterRaw = extractMastery(after);
    const beforeDetails = parseMasteryDetails(beforeRaw);
    const afterDetails = parseMasteryDetails(afterRaw);
    const change = {
      功法: canonicalMartialArtName(rawArtName),
      源功法名: rawArtName,
      操作: operation,
      原始操作: event.currentOperation,
      原始角色键: rawCharacterKey,
      旧掌握程度: beforeDetails.掌握程度,
      新掌握程度: afterDetails.掌握程度,
      旧掌握程度说明: beforeDetails.掌握程度说明,
      新掌握程度说明: afterDetails.掌握程度说明,
      旧标准掌握程度: beforeDetails.标准掌握程度,
      新标准掌握程度: afterDetails.标准掌握程度,
      原始旧掌握程度: beforeRaw,
      原始新掌握程度: afterRaw,
      旧值: cloneJson(before),
      新值: cloneJson(after),
      ...eventReference(event),
    };
    characterRecord.changes.push(change);
    const artRecord = ensureArtRecord(characterRecord, rawArtName);
    artRecord.changes.push(change);
  }
}

function recordInvolvement(records, event) {
  const names = new Set([
    ...Object.keys(event.definition.insert || {}),
    ...Object.keys(event.definition.update || {}),
    ...Object.keys(event.definition.delete || {}),
    ...(Array.isArray(event.definition.参与人物) ? event.definition.参与人物 : []),
  ]);
  for (const rawName of names) {
    const canonical = canonicalCharacterName(rawName);
    const record = ensureCharacterRecord(records, canonical);
    record.rawKeys.add(rawName);
    if (rawName !== canonical) record.aliases.add(rawName);
    record.involvedEvents.set(event.runtimeKey, event);
  }
}

export function compareEffectOrder(left, right) {
  const leftHour = Number.isFinite(left.effectHour) ? left.effectHour : Number.MAX_SAFE_INTEGER;
  const rightHour = Number.isFinite(right.effectHour) ? right.effectHour : Number.MAX_SAFE_INTEGER;
  if (leftHour !== rightHour) return leftHour - rightHour;
  if (left.triggerHour !== right.triggerHour)
    return (left.triggerHour ?? Number.MAX_SAFE_INTEGER) - (right.triggerHour ?? Number.MAX_SAFE_INTEGER);
  if (left.series !== right.series) return left.series.localeCompare(right.series, 'zh-CN');
  if (left.chapterNumber !== right.chapterNumber) return left.chapterNumber - right.chapterNumber;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.runtimeKey.localeCompare(right.runtimeKey, 'zh-CN');
}

export function materializeCharacterMartialArts(events) {
  const deterministicEvents = events
    .filter(event => !event.conditional && Number.isFinite(event.effectHour))
    .sort(compareEffectOrder);
  const skippedConditionalEvents = events.filter(event => event.conditional || !Number.isFinite(event.effectHour));
  const state = {};
  const records = new Map();

  for (const event of deterministicEvents) {
    recordInvolvement(records, event);
    for (const operation of ['insert', 'update', 'delete']) {
      for (const [rawCharacterKey, delta] of Object.entries(event.definition[operation] || {})) {
        const canonical = canonicalCharacterName(rawCharacterKey);
        const characterRecord = ensureCharacterRecord(records, canonical);
        characterRecord.rawKeys.add(rawCharacterKey);
        if (rawCharacterKey !== canonical) characterRecord.aliases.add(rawCharacterKey);
        if (event.kind === 'debut' && operation === 'insert' && characterRecord.firstAppearance === null) {
          characterRecord.firstAppearance = {
            事件: event.runtimeKey,
            原文件: event.sourceName,
            原始角色键: rawCharacterKey,
            时间: cloneJson(event.effectTime),
          };
        }

        const target = (state[canonical] ||= {});
        const beforePowers = cloneJson(isPlainObject(target.功法) ? target.功法 : {});
        const eventWithOperation = { ...event, currentOperation: operation };
        if (operation === 'delete') deleteByObject(target, delta);
        else mergePlainObject(target, delta);
        const afterPowers = cloneJson(isPlainObject(target.功法) ? target.功法 : {});
        recordPowerDiff(characterRecord, beforePowers, afterPowers, eventWithOperation, rawCharacterKey);
      }
    }
  }

  return { state, records, deterministicEvents, skippedConditionalEvents };
}

function currentValuesForArt(characterState, artRecord) {
  const powers = isPlainObject(characterState?.功法) ? characterState.功法 : {};
  return [...artRecord.rawNames]
    .filter(rawName => Object.prototype.hasOwnProperty.call(powers, rawName))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(rawName => {
      const rawMastery = extractMastery(powers[rawName]);
      const details = parseMasteryDetails(rawMastery);
      return {
        变量键: rawName,
        掌握程度: details.掌握程度,
        标准掌握程度: details.标准掌握程度,
        掌握程度说明: details.掌握程度说明,
        原始掌握程度: rawMastery,
        完整变量: cloneJson(powers[rawName]),
      };
    });
}

function summarizeArtRecord(characterState, artRecord, databaseNames) {
  const changes = artRecord.changes.map(change => cloneJson(change));
  const currentValues = currentValuesForArt(characterState, artRecord);
  const isSpecialty = NON_MARTIAL_SPECIALTY_NAMES.has(artRecord.canonical);
  const isEquipment = NON_MARTIAL_EQUIPMENT_NAMES.has(artRecord.canonical);
  return {
    功法: artRecord.canonical,
    源功法名: [...artRecord.rawNames].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    当前存在: currentValues.length > 0,
    当前变量: currentValues,
    功法库状态: databaseNames.has(artRecord.canonical) ? '已收录' : isSpecialty ? '生活专长' : isEquipment ? '装备道具' : '未收录',
    类别: isSpecialty ? '生活与杂学专长' : isEquipment ? '误挂装备或道具' : '战斗功法',
    获得事件: changes.filter(change => change.操作 === '获得'),
    升级或更新事件: changes.filter(change => ['升级', '降级', '更新'].includes(change.操作)),
    删除事件: changes.filter(change => change.操作 === '删除'),
    完整变更记录: changes,
  };
}

export function createMartialArtsAuditDocument(materialized, martialArtsDatabase, metadata = {}) {
  const databaseNames = new Set((martialArtsDatabase.功法 || []).map(item => item.功法名称));
  const characters = [...materialized.records.values()]
    .sort((a, b) => a.canonical.localeCompare(b.canonical, 'zh-CN'))
    .map(record => {
      const characterState = materialized.state[record.canonical] || {};
      const allRecords = [...record.martialArts.values()]
        .sort((a, b) => a.canonical.localeCompare(b.canonical, 'zh-CN'))
        .map(artRecord => summarizeArtRecord(characterState, artRecord, databaseNames));
      const martialArtRecords = allRecords.filter(item => item.类别 === '战斗功法');
      const specialtyRecords = allRecords.filter(item => item.类别 === '生活与杂学专长');
      const equipmentRecords = allRecords.filter(item => item.类别 === '误挂装备或道具');
      const currentPowers = isPlainObject(characterState.功法) ? characterState.功法 : {};
      return {
        角色: record.canonical,
        原始角色键: [...record.rawKeys].sort((a, b) => a.localeCompare(b, 'zh-CN')),
        已确认别名: [...record.aliases]
          .filter(alias => alias !== record.canonical)
          .sort((a, b) => a.localeCompare(b, 'zh-CN')),
        首次登场: cloneJson(record.firstAppearance),
        人物信息: {
          性别: characterState.性别 ?? null,
          境界: characterState.境界 ?? null,
          身份: cloneJson(characterState.身份 ?? {}),
          重要物品: cloneJson(characterState.重要物品 ?? {}),
        },
        当前原始功法变量: cloneJson(currentPowers),
        功法记录: martialArtRecords,
        生活与杂学专长: specialtyRecords,
        误挂装备或道具: equipmentRecords,
        功法变更数: record.changes.length,
      };
    });

  const allArtRecords = characters.flatMap(character => character.功法记录);
  const allChanges = allArtRecords.flatMap(record => record.完整变更记录);
  return {
    schemaVersion: 1,
    生成信息: {
      事实源: metadata.sourceRoot,
      功法库: metadata.databasePath,
      重放语义: 'generated-checkpoint-v1',
      时间口径: '普通事件按事件结束时间生效；登场事件按触发时间生效；同刻按规范事件顺序稳定排序',
      角色别名映射: Object.fromEntries(CHARACTER_ALIAS_TO_CANONICAL),
      功法别名映射: Object.fromEntries(MARTIAL_ART_ALIAS_TO_CANONICAL),
      条件事件处理: '不纳入确定性终局快照，单独计数',
      生成时间: metadata.generatedAt,
      Git提交: metadata.gitCommit ?? null,
      功法库SHA256: metadata.databaseSha256 ?? null,
      世界书源SHA256: metadata.eventSourceSha256 ?? null,
      审计工具SHA256: metadata.auditToolSha256 ?? null,
      可重复生成: '输出不写入墙钟时间；相同提交与相同输入应得到相同 JSON。',
    },
    统计: {
      源事件数: metadata.eventCount,
      确定性重放事件数: materialized.deterministicEvents.length,
      跳过条件或无确定时间事件数: materialized.skippedConditionalEvents.length,
      角色数: characters.length,
      当前有功法角色数: characters.filter(character => Object.keys(character.当前原始功法变量).length > 0).length,
      当前无功法角色数: characters.filter(character => Object.keys(character.当前原始功法变量).length === 0).length,
      规范功法记录数: allArtRecords.length,
      功法变更数: allChanges.length,
      获得记录数: allChanges.filter(change => change.操作 === '获得').length,
      升级记录数: allChanges.filter(change => change.操作 === '升级').length,
      更新或降级记录数: allChanges.filter(change => ['更新', '降级'].includes(change.操作)).length,
      删除记录数: allChanges.filter(change => change.操作 === '删除').length,
      当前未被功法库收录的规范功法数: new Set(
        allArtRecords.filter(record => record.当前存在 && record.功法库状态 === '未收录').map(record => record.功法),
      ).size,
    },
    跳过事件: materialized.skippedConditionalEvents.map(event => ({
      事件: event.runtimeKey,
      原文件: event.sourceName,
      原因: event.conditional ? '条件事件无唯一确定结算时点' : '缺少确定生效时间',
    })),
    角色列表: characters,
  };
}

function strictNameMatch(rawName, databaseNames) {
  const auditAlias = canonicalMartialArtName(rawName);
  const exact = databaseNames.has(rawName);
  const aliasHit = rawName !== auditAlias && databaseNames.has(auditAlias);
  const requiresSemanticReview = aliasHit && MARTIAL_ART_ALIASES_REQUIRING_SEMANTIC_REVIEW.has(rawName);
  return {
    原始名称: rawName,
    数据库精确命中: exact,
    审计别名候选: rawName === auditAlias ? null : auditAlias,
    审计别名命中: aliasHit,
    语义待核查: requiresSemanticReview,
    运行时结论: exact ? '精确命中' : aliasHit ? '运行时不匹配，审计别名可指向候选' : '数据库未精确收录',
  };
}

function compactChangeSources(artRecord) {
  return artRecord.完整变更记录.map(change => ({
    事件: change.事件,
    原文件: change.原文件,
    时间: change.生效时间,
    操作: change.操作,
    原始角色键: change.原始角色键,
    原始功法名称: change.源功法名,
  }));
}

const REASONABLE_EMPTY_CHARACTER_RULES = new Map([
  ['段誉', '当前阶段设定为尚未习武；不可仅因空功法认定遗漏。'],
  ['王语嫣', '主要定位为武学见识与辨析，不以实战功法作为必备字段。'],
  ['钟灵', '主要战力线索为闪电貂，空功法本身不足以认定遗漏。'],
]);

const CHARACTER_IDENTITY_REVIEW_PAIRS = [{ 名称一: '乔峰', 名称二: '萧峰', 关系: '原著改名关系，不能仅凭名称自动合并运行时状态' }];

/**
 * Produces a conservative, review-oriented report.  It deliberately does not
 * turn broad identity/realm guesses into "missing martial arts" findings.
 */
export function createFourCategoryMartialArtsAuditDocument(materialized, martialArtsDatabase, metadata = {}) {
  const total = createMartialArtsAuditDocument(materialized, martialArtsDatabase, metadata);
  const completion = createCompletionCandidatesDocument(materialized, martialArtsDatabase, metadata);
  const databaseNames = new Set((martialArtsDatabase.功法 || []).map(item => item.功法名称));
  const nameMismatches = [];
  const historicalNameMismatches = [];
  const nonMartialItems = [];
  const reasonableEmpty = [];
  const missingRepresentativeArts = [];
  const manualReview = [];
  const identityReviews = CHARACTER_IDENTITY_REVIEW_PAIRS.map(pair => {
    const left = materialized.records.get(pair.名称一);
    const right = materialized.records.get(pair.名称二);
    const leftState = materialized.state[pair.名称一] || null;
    const rightState = materialized.state[pair.名称二] || null;
    const eventsFor = record =>
      record
        ? [...record.involvedEvents.values()]
            .sort(compareEffectOrder)
            .map(event => ({ 事件: event.runtimeKey, 原文件: event.sourceName, 时间: cloneJson(event.effectTime) }))
        : [];
    const bothPresent = Boolean(left && right);
    const provenSingleKey = Boolean(left && !right && leftState?.身份?.契丹本姓?.includes(pair.名称二));
    return {
      ...pair,
      名称一是否出现: Boolean(left),
      名称二是否出现: Boolean(right),
      名称一涉及事件: eventsFor(left),
      名称二涉及事件: eventsFor(right),
      最终状态一致: bothPresent ? compareJson(leftState, rightState) : null,
      结论: bothPresent
        ? '两个原始键都在确定性重放中出现，且最终状态不同；本审计保持为两个运行时记录，不自动合并，需由世界书明确提供迁移/删除链后再处理。'
        : provenSingleKey
          ? '已确认仅保留乔峰为原始状态键，契丹本姓注明萧峰，全部事件差分写入原角色；无需运行时合并。'
          : '当前确定性事件只出现其中一个原始键；还需核查是否确实完成别名归一。',
      需要人工审核: !provenSingleKey,
    };
  });

  for (const character of total.角色列表) {
    const allArtRecords = [...character.功法记录, ...character.生活与杂学专长, ...character.误挂装备或道具];
    for (const artRecord of allArtRecords) {
      const source = compactChangeSources(artRecord);
      for (const rawName of artRecord.源功法名) {
        const match = strictNameMatch(rawName, databaseNames);
        const rawNameStillExists = Object.hasOwn(character.当前原始功法变量 || {}, rawName);
        const item = {
          人物: character.角色,
          原始人物键: character.原始角色键,
          原始功法名称: rawName,
          审计归并名称: artRecord.功法,
          当前存在: rawNameStillExists,
          ...match,
          事件来源: source.filter(change => change.原始功法名称 === rawName),
          判断依据: match.数据库精确命中
            ? '前端精确名称查询可直接命中正式功法库。'
            : match.审计别名命中
              ? '仅审计别名可指向数据库候选；前端精确名称查询仍会失败。'
              : '正式功法库没有该原始名称的精确记录。',
          置信度: match.数据库精确命中 ? '确定' : match.审计别名命中 ? '确定（运行时不匹配）' : '确定（未收录）',
          需要人工审核: !match.数据库精确命中,
        };
        if (artRecord.类别 !== '战斗功法') {
          nonMartialItems.push({
            ...item,
            问题类别: '非武学项目混入',
            非武学类别: artRecord.类别,
            判断依据: `当前审计分类为${artRecord.类别}；应保留事实记录，但不作为独立战斗功法进行数据库缺失统计。`,
            置信度: '确定',
          });
        } else if (!match.数据库精确命中) {
          if (rawNameStillExists) nameMismatches.push({ ...item, 问题类别: '功法名称不一致' });
          else historicalNameMismatches.push({ ...item, 问题类别: '历史功法名称不一致' });
        }
      }
    }

    const hasCurrentMartialArt = character.功法记录.some(record => record.当前存在);
    const directCandidate = completion.候选角色.find(item => item.角色 === character.角色);
    const directSuggestions = (directCandidate?.建议功法 || []).filter(
      suggestion =>
        !suggestion.是否原创 &&
        suggestion.置信度?.等级 === '高' &&
        suggestion.来源类型 === '世界书明示功法' &&
        suggestion.功法库状态 === '精确命中' &&
        suggestion.依据?.some(item => item.类型 === '事件明示施展'),
    );
    if (directSuggestions.length > 0) {
      missingRepresentativeArts.push({
        问题类别: '真正漏掉的代表武学',
        人物: character.角色,
        原始人物键: character.原始角色键,
        当前境界: character.人物信息.境界,
        当前身份: character.人物信息.身份,
        当前已掌握战斗功法: character.功法记录.filter(record => record.当前存在).map(record => record.功法),
        代表武学证据: directSuggestions,
        判断依据: '世界书事件存在疑似该人物主动施展、且数据库收录的武学；即使人物已有其他功法也需核查遗漏。事件动词归属仍须人工核对，不自动回写。',
        置信度: '高',
        需要人工审核: true,
      });
    } else if (hasCurrentMartialArt) {
      continue;
    } else if (REASONABLE_EMPTY_CHARACTER_RULES.has(character.角色)) {
      reasonableEmpty.push({
        问题类别: '合理没有武功',
        人物: character.角色,
        原始人物键: character.原始角色键,
        当前境界: character.人物信息.境界,
        当前身份: character.人物信息.身份,
        判断依据: REASONABLE_EMPTY_CHARACTER_RULES.get(character.角色),
        置信度: '中（角色定位规则，仍须按具体时间线复核）',
        需要人工审核: true,
      });
    } else if (/^(?:凡人|不入流|未入流|不通武艺|不会武功|不懂武功|无|无武功)$/.test(character.人物信息.境界 || '')) {
      reasonableEmpty.push({
        问题类别: '合理没有武功',
        人物: character.角色,
        原始人物键: character.原始角色键,
        当前境界: character.人物信息.境界,
        当前身份: character.人物信息.身份,
        判断依据: '最终状态明确标注为凡人、不入流或不通武艺，且无直接代表武学证据。',
        置信度: '高',
        需要人工审核: false,
      });
    } else {
      manualReview.push({
        人物: character.角色,
        原始人物键: character.原始角色键,
        当前境界: character.人物信息.境界,
        当前身份: character.人物信息.身份,
        判断依据: '当前无战斗功法，但没有世界书主动施展的直接证据；功法库描述中的人物提及、境界或身份均不足以自动补写。',
        需要人工审核: true,
      });
    }
  }

  const sortByPerson = (left, right) => left.人物.localeCompare(right.人物, 'zh-CN') || left.原始功法名称?.localeCompare(right.原始功法名称 || '', 'zh-CN');
  for (const items of [nameMismatches, historicalNameMismatches, nonMartialItems, reasonableEmpty, missingRepresentativeArts, manualReview]) items.sort(sortByPerson);
  return {
    schemaVersion: 3,
    生成信息: {
      ...total.生成信息,
      审计范围: '仅重放具有唯一确定生效时间的世界书事件；条件事件不代表所有玩家分支状态。',
      严格匹配口径: '数据库精确命中只比较原始功法变量键与正式功法名称。审计别名仅作人工审核候选，绝不视为运行时命中。',
      缺漏口径: '从所有人物（含已有功法者）识别高置信世界书主动施展候选；人物动作归属需人工复核，原著/功法库人物提及另行核对。',
    },
    统计: {
      NPC总数: total.统计.角色数,
      真正漏掉的代表武学: missingRepresentativeArts.length,
      功法名称不一致: nameMismatches.length,
      历史功法名称不一致: historicalNameMismatches.length,
      合理没有武功: reasonableEmpty.length,
      非武学项目混入: nonMartialItems.length,
      需人工审核的空功法人物: manualReview.length,
      人物身份归一待核查: identityReviews.filter(review => review.需要人工审核).length,
    },
    全体NPC状态: total.角色列表.map(character => ({
      人物: character.角色,
      原始人物键: character.原始角色键,
      当前境界: character.人物信息.境界,
      当前战斗功法数: character.功法记录.filter(record => record.当前存在).length,
      当前非武学项目数: character.生活与杂学专长.filter(record => record.当前存在).length + character.误挂装备或道具.filter(record => record.当前存在).length,
    })),
    真正漏掉的代表武学: missingRepresentativeArts,
    功法名称不一致: nameMismatches,
    历史功法名称不一致: historicalNameMismatches,
    合理没有武功: reasonableEmpty,
    非武学项目混入: nonMartialItems,
    尚不能确定的人工审核项目: manualReview,
    人物身份归一核查: identityReviews,
  };
}

function masteryForRealm(realm) {
  if (typeof realm !== 'string') return '初窥门径';
  if (/五绝|绝顶|大宗师/.test(realm)) return '出神入化';
  if (/一流|宗师|先天/.test(realm)) return '炉火纯青';
  if (/二流|后天/.test(realm)) return '融会贯通';
  if (/三流/.test(realm)) return '略有小成';
  return '初窥门径';
}

function characterAliases(record) {
  return [record.canonical, ...record.aliases, ...record.rawKeys].filter(Boolean);
}

function splitEvidenceText(event) {
  const definition = event.definition || {};
  return [definition.事件详情, definition.事件概要, definition.事件引子]
    .filter(value => typeof value === 'string')
    .flatMap(value => value.split(/[。！？；\n]/))
    .map(value => value.trim())
    .filter(Boolean);
}

export function isActiveUseSentence(sentence, aliases, artName) {
  // “以空手夺白刃手法抢刀” describes a generic disarming action in
  // the novel, not evidence that Yelü Yan learned the database's
  // specifically attributed Quanzhen technique. Preserve the event prose.
  if (artName === '空手夺白刃' && /空手夺白刃(?:的)?手法/.test(sentence) && !/[《“‘]空手夺白刃/.test(sentence))
    return false;
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Some event prose says “古墓派美女拳法” although the exact database key is “美女拳法”.
  const art = `(?:古墓派)?${escapeRegExp(artName)}`;
  const actionVerbs = /施展|使出|使开|使动|运起|运使|催动|用出|使起|施起|利用|以|用/g;
  for (const alias of aliases) {
    // Descriptive aliases, e.g. "书生", do not identify a unique actor.
    if (!alias || GENERIC_CHARACTER_ALIASES.has(alias)) continue;
    const actor = escapeRegExp(alias);
    const attributedUse = new RegExp(`${art}[^，,。！？；;—]{0,10}(?:由|乃是|是)${actor}(?:所使|所施|施展|使出)`);
    if (attributedUse.test(sentence)) return true;
    let actorIndex = sentence.indexOf(alias);
    while (actorIndex >= 0) {
      const prefix = sentence.slice(Math.max(0, actorIndex - 24), actorIndex).split(/[，,。！？；;—：:]/).at(-1);
      const tail = sentence.slice(actorIndex + alias.length).split(/[，,。！？；;—：:]/)[0];
      // A joint subject does not prove that every named actor learned a technique.
      if (/[与和及跟同]$/.test(prefix) || /^[与和及跟同][\u3400-\u9fff]{2,8}(?:联袂|一同|共同|齐齐|合力|并肩)/.test(tail)) {
        actorIndex = sentence.indexOf(alias, actorIndex + alias.length);
        continue;
      }
      for (const verbMatch of tail.matchAll(actionVerbs)) {
        const beforeVerb = tail.slice(0, verbMatch.index);
        // Reporting/perception and changed subjects are not proof of use.
        if (beforeVerb.length > 20 || /[、，,。！？；;—]|被|遭|受|中了|说|问|要|令|让|教|传|换|求|命|劝|知|闻|听|见|望|想|省起|提醒|发现|以为|记起|回忆/.test(beforeVerb))
          continue;
        if (verbMatch[0] === '用' && /改$/.test(beforeVerb)) continue;
        const afterVerb = tail.slice(verbMatch.index + verbMatch[0].length);
        // Taking a hit from an art is not using it; broad "某经武功" is ambiguous.
        const start = verbMatch[0] === '以' || verbMatch[0] === '用'
          ? new RegExp(`^(?:[“‘《])?${art}(?!武功|功夫)`)
          : verbMatch[0] === '利用'
            ? new RegExp(`^(?:《[^》]{2,16}》中的[“‘]?|[“‘]?)${art}(?!武功|功夫)`)
            : new RegExp(`^(?:了|着|一招|一式|一记|[“‘《]){0,2}${art}(?!武功|功夫)`);
        if (start.test(afterVerb)) return true;
      }
      actorIndex = sentence.indexOf(alias, actorIndex + alias.length);
    }
  }
  return false;
}
function extractActionPhrases(sentence, aliases) {
  if (!aliases.some(alias => sentence.includes(alias))) return [];
  const phrases = [];
  const quoted = /(?:使出|施展|使开|使动|运起|运使|催动|用出|使起|施起)[“‘'\"]([^”’'\"]{2,16})[”’'\"]/g;
  const unquoted =
    /(?:使出|施展|使开|使动|运起|运使|催动|用出|使起|施起)([一-龥]{2,12}?(?:身法|步法|轻功|剑法|刀法|杖法|鞭法|掌法|拳法|指法|功|法|掌|拳|剑|刀|杖|鞭|指|手|阵))(?=的|[，,。！？；;—\s]|$)/g;
  for (const pattern of [quoted, unquoted]) {
    for (const match of sentence.matchAll(pattern)) {
      const phrase = match[1]
        .trim()
        .replace(/^['“‘]|['”’]$/g, '')
        .replace(/^(?:了|的|其|将|把|本门|一招|一式)+/, '');
      if (
        !GENERIC_ART_PHRASES.has(phrase) &&
        !GENERIC_ART_PHRASE_PATTERN.test(phrase) &&
        ART_NAME_ENDING_PATTERN.test(phrase) &&
        isActiveUseSentence(sentence, aliases, phrase)
      )
        phrases.push(phrase);
    }
  }
  return [...new Set(phrases)];
}

function addSuggestion(suggestions, suggestion) {
  const canonical = canonicalMartialArtName(suggestion.功法);
  if (!suggestions.has(canonical) || suggestions.get(canonical).置信度.分值 < suggestion.置信度.分值) {
    suggestions.set(canonical, { ...suggestion, 功法: canonical });
  } else {
    const existing = suggestions.get(canonical);
    existing.依据 = [...existing.依据, ...suggestion.依据].filter(
      (item, index, array) =>
        array.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(item)) === index,
    );
  }
}

function buildEvidenceSuggestions(record, characterState, database) {
  const suggestions = new Map();
  const knownArts = new Set([...record.martialArts.keys()].map(canonicalMartialArtName));
  const aliases = characterAliases(record);
  const searchableAliases = aliases.filter(alias => !GENERIC_CHARACTER_ALIASES.has(alias));
  const mastery = masteryForRealm(characterState.境界);
  const dbArts = database.功法 || [];
  const dbNames = new Set(dbArts.map(item => item.功法名称));

  for (const art of dbArts) {
    const artName = canonicalMartialArtName(art.功法名称);
    if (knownArts.has(artName)) continue;
    const namedInDescription = searchableAliases.some(alias => {
      if (alias.length < 2 || typeof art.功法描述 !== 'string') return false;
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(
        `${escapedAlias}[^，。；]{0,10}(?:的(?:独门|成名)?绝技|所创|使用|所用|精于|擅长|修炼|练成|传授)|(?:由|为)${escapedAlias}(?:所创|所用|使用)`,
      ).test(art.功法描述);
    });
    if (namedInDescription) {
      addSuggestion(suggestions, {
        功法: artName,
        建议掌握程度: mastery,
        依据: [{ 类型: '功法库人物归属', 描述: `功法库“${art.功法名称}”的描述明确提及${record.canonical}` }],
        置信度: { 等级: '高', 分值: 0.85 },
        是否原创: false,
        需新增功法库: false,
        来源类型: '功法库角色绑定',
        功法库状态: '精确命中',
        建议挂载时间点: null,
      });
    }
  }

  for (const event of record.involvedEvents.values()) {
    for (const sentence of splitEvidenceText(event)) {
      for (const art of dbArts) {
        const artName = canonicalMartialArtName(art.功法名称);
        if (
          knownArts.has(artName) ||
          !sentence.includes(art.功法名称) ||
          !isActiveUseSentence(sentence, aliases, art.功法名称)
        )
          continue;
        addSuggestion(suggestions, {
          功法: artName,
          建议掌握程度: mastery,
          依据: [
            { 类型: '事件明示施展', 事件: event.runtimeKey, 时间: cloneJson(event.effectTime), 原文证据: sentence },
          ],
          置信度: { 等级: '高', 分值: 0.98 },
          是否原创: false,
          需新增功法库: false,
          来源类型: '世界书明示功法',
          功法库状态: '精确命中',
          建议挂载时间点: { 事件: event.runtimeKey, 时间: cloneJson(event.effectTime) },
        });
      }
      for (const phrase of extractActionPhrases(sentence, aliases)) {
        const matchedDatabaseName = [...dbNames]
          .sort((a, b) => b.length - a.length)
          .find(databaseName => phrase.includes(databaseName));
        const sourceArtName = (matchedDatabaseName ?? phrase).replace(/^的/, '');
        const artName = canonicalMartialArtName(sourceArtName);
        if (knownArts.has(artName)) continue;
        addSuggestion(suggestions, {
          功法: artName,
          建议掌握程度: mastery,
          依据: [
            { 类型: '事件明示招式', 事件: event.runtimeKey, 时间: cloneJson(event.effectTime), 原文证据: sentence },
          ],
          置信度: { 等级: '高', 分值: 0.92 },
          是否原创: false,
          需新增功法库: !dbNames.has(artName),
          来源类型: '世界书明示功法',
          功法库状态: dbNames.has(artName) ? (sourceArtName === artName ? '精确命中' : '别名命中') : '数据库缺失',
          建议挂载时间点: { 事件: event.runtimeKey, 时间: cloneJson(event.effectTime) },
        });
      }
    }
  }
  return suggestions;
}

function identityText(characterState) {
  return JSON.stringify(characterState.身份 || {});
}

function martialityAssessment(characterState, record) {
  const realm = typeof characterState.境界 === 'string' ? characterState.境界 : '';
  const identity = identityText(characterState);
  const items = JSON.stringify(characterState.重要物品 || {});
  const realmMartial = MARTIAL_REALM_PATTERN.test(realm);
  const identityMartial = MARTIAL_IDENTITY_PATTERN.test(identity);
  const weapon = WEAPON_PATTERN.test(items);
  const hasHistory = record.martialArts.size > 0;
  const score = Number(realmMartial) * 2 + Number(identityMartial) * 2 + Number(weapon) + Number(hasHistory) * 2;
  const intentionalEmpty = NON_MARTIAL_REALM_PATTERN.test(realm) && !hasHistory;
  return {
    score,
    intentionalEmpty,
    evidence: [
      ...(realmMartial ? [`境界“${realm}”属于明确武学层级`] : []),
      ...(identityMartial ? ['身份中含有武林、门派、军职或高手线索'] : []),
      ...(weapon ? ['重要物品中存在可用于武学的兵器'] : []),
      ...(hasHistory ? ['事件时间线中曾出现功法记录'] : []),
    ],
  };
}

function addIdentitySuggestions(suggestions, characterState, database, knownArts) {
  const identity = identityText(characterState);
  const dbNames = new Set((database.功法 || []).map(item => item.功法名称));
  for (const rule of IDENTITY_SUGGESTION_RULES) {
    if (!rule.pattern.test(identity)) continue;
    for (const art of rule.arts) {
      const canonical = canonicalMartialArtName(art);
      if (knownArts.has(canonical) || !dbNames.has(canonical)) continue;
      addSuggestion(suggestions, {
        功法: canonical,
        建议掌握程度: masteryForRealm(characterState.境界),
        依据: [{ 类型: '门派身份推定', 描述: `身份信息“${identity}”与该功法所属体系相符` }],
        置信度: { 等级: '中', 分值: 0.7 },
        是否原创: false,
        需新增功法库: false,
        来源类型: '门派推断',
        功法库状态: '精确命中',
        建议挂载时间点: null,
      });
    }
  }
}

function addOriginalFallback(suggestions, record, characterState, knownArts) {
  if (suggestions.size > 0) return;
  const itemNames = Object.keys(characterState.重要物品 || {});
  const weaponName = itemNames.find(item => WEAPON_PATTERN.test(item));
  const weaponType = weaponName?.match(WEAPON_PATTERN)?.[1];
  const identityName = Object.keys(characterState.身份 || {})[0];
  const identity = identityText(characterState);
  let artName = null;
  let basis = null;
  if (weaponType) {
    artName = `${record.canonical}${weaponType}法`;
    basis = `重要物品“${weaponName}”表明角色长期使用${weaponType}类兵器`;
  } else if (/医者|医师|医生|医术|药师|药童|药材|草药|郎中/.test(identity)) {
    artName = `${record.canonical}医家养生功`;
    basis = `身份“${identityName}”显示角色精于医药、养生或草木之学`;
  } else if (/信使|传信|斥候/.test(identity)) {
    artName = `${record.canonical}轻身功`;
    basis = `身份“${identityName}”要求长途奔走、传信与脱身能力`;
  } else if (/厨|庖/.test(identity)) {
    artName = `${record.canonical}庖丁刀法`;
    basis = `身份“${identityName}”可合理转化为短刀与解切技法`;
  } else if (/力士|勇士/.test(identity)) {
    artName = `${record.canonical}摔跤术`;
    basis = `身份“${identityName}”显示角色以力量与近身搏斗见长`;
  } else if (/将军|大将|将领|领兵|统领|元帅|军士|卫士|侍卫|武士|首领|大汗/.test(identity)) {
    artName = `${record.canonical}军中武艺`;
    basis = `身份“${identityName}”显示角色受过军阵武艺训练`;
  } else if (/道士|道人|全真/.test(identity)) {
    artName = `${record.canonical}玄门剑法`;
    basis = `身份“${identityName}”显示角色出自玄门武学体系`;
  } else if (/僧|和尚|头陀|师太/.test(identity)) {
    artName = `${record.canonical}护体功`;
    basis = `身份“${identityName}”显示角色可能修习佛门或苦行护体功夫`;
  } else if (/丐帮|乞丐|丐者/.test(identity)) {
    artName = `${record.canonical}丐帮拳脚`;
    basis = `身份“${identityName}”显示角色具备丐帮或江湖底层拳脚传承`;
  } else if (/江湖|武林|高手|名宿|侠|弟子|掌门|帮主|长老/.test(identity)) {
    artName = `${record.canonical}独门掌法`;
    basis = `身份“${identityName}”确认其为武林人物，但现有资料未留下招式正式名称`;
  } else if (MARTIAL_REALM_PATTERN.test(characterState.境界 || '')) {
    artName = `${record.canonical}基础武学`;
    basis = `境界“${characterState.境界}”表明角色具备稳定武学修为，但现有资料不足以确定门派与兵器`;
  }
  if (!artName || knownArts.has(artName)) return;
  addSuggestion(suggestions, {
    功法: artName,
    建议掌握程度: masteryForRealm(characterState.境界),
    依据: [{ 类型: '人物信息原创推定', 描述: basis }],
    置信度: { 等级: '低', 分值: 0.35 },
    是否原创: true,
    需新增功法库: true,
    来源类型: '原创设计',
    功法库状态: '数据库缺失',
    建议挂载时间点: cloneJson(record.firstAppearance),
  });
}

function suggestedMinimumForRealm(realm, identity) {
  if (typeof realm === 'string') {
    if (/五绝|绝顶|陆地神仙|大宗师|宗师/.test(realm)) return 3;
    if (/一流|先天/.test(realm)) return 2;
    if (/二流|三流|后天/.test(realm)) return 1;
  }
  return MARTIAL_IDENTITY_PATTERN.test(identity) ? 1 : 0;
}

export function createCompletionCandidatesDocument(materialized, martialArtsDatabase, metadata = {}) {
  const candidates = [];
  const excluded = [];
  for (const record of [...materialized.records.values()].sort((a, b) =>
    a.canonical.localeCompare(b.canonical, 'zh-CN'),
  )) {
    const characterState = materialized.state[record.canonical] || {};
    const currentPowers = isPlainObject(characterState.功法) ? characterState.功法 : {};
    const currentCanonicalArts = new Set(Object.keys(currentPowers).map(canonicalMartialArtName));
    const knownArts = new Set([...record.martialArts.keys(), ...currentCanonicalArts]);
    const assessment = martialityAssessment(characterState, record);
    if (assessment.intentionalEmpty) {
      excluded.push({ 角色: record.canonical, 原因: '凡人或不入流且无武林身份、兵器和功法历史，判定为合理空值' });
      continue;
    }

    const suggestions = buildEvidenceSuggestions(record, characterState, martialArtsDatabase);
    const completelyMissing = currentCanonicalArts.size === 0 && record.martialArts.size === 0;
    if (completelyMissing && assessment.score >= 2) {
      if (metadata.useLegacySectInference)
        addIdentitySuggestions(suggestions, characterState, martialArtsDatabase, knownArts);
      addOriginalFallback(suggestions, record, characterState, knownArts);
    }
    for (const knownArt of knownArts) suggestions.delete(knownArt);

    if (!completelyMissing && suggestions.size === 0) continue;
    if (completelyMissing && assessment.score < 2) {
      excluded.push({ 角色: record.canonical, 原因: '缺少足够的武学身份、境界、兵器或事件证据' });
      continue;
    }

    const sortedSuggestions = [...suggestions.values()]
      .sort((a, b) => b.置信度.分值 - a.置信度.分值 || a.功法.localeCompare(b.功法, 'zh-CN'))
      .slice(0, 3);
    const suggestedMinimum = suggestedMinimumForRealm(characterState.境界, identityText(characterState));
    candidates.push({
      角色: record.canonical,
      原始角色键: [...record.rawKeys].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      已确认别名: [...record.aliases]
        .filter(alias => alias !== record.canonical)
        .sort((a, b) => a.localeCompare(b, 'zh-CN')),
      缺失类型: completelyMissing ? '完全缺失' : '疑似漏项',
      当前境界: characterState.境界 ?? null,
      当前身份: cloneJson(characterState.身份 ?? {}),
      当前功法: [...currentCanonicalArts].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      缺失判定: {
        境界: characterState.境界 ?? null,
        建议最低数量: suggestedMinimum,
        当前规范功法数量: currentCanonicalArts.size,
        数量缺口: Math.max(0, suggestedMinimum - currentCanonicalArts.size),
        结论: completelyMissing ? '明确缺漏' : '正文或功法库显示疑似漏项',
      },
      判定依据: assessment.evidence,
      建议功法: sortedSuggestions,
      需要人工复核: true,
      备注:
        sortedSuggestions.length > 0
          ? '仅生成审核候选，不自动回写世界书；高置信建议仍需核对是否应在登场时拥有或在后续事件中获得。'
          : '人物高度疑似缺失功法，但现有事件、功法库与人物信息不足以可靠命名，需人工创作。',
    });
  }

  return {
    schemaVersion: 1,
    生成信息: {
      事实源: metadata.sourceRoot,
      功法库: metadata.databasePath,
      候选原则: [
        '先完整重放所有确定性事件，再判断最终状态与完整功法历史',
        '合理空值和后续才获得功法者不作为完全缺失',
        '优先采用事件明示与功法库中明确归属于该人物的功法',
        '门派共通与层级分配拆分至“门派角色功法分配候选.json”，本表不再用宽泛身份关键词套用门派功法',
        '原创推定只给低置信度并要求补充功法库',
        '不自动回写任何世界书条目',
      ],
      置信度口径: {
        高: '事件明确施展，或功法库描述明确点名该角色',
        中: '保留给显式启用的旧版门派推定；默认生成流程不使用',
        低: '依据兵器或职业创作的待审原创功法',
      },
      生成时间: metadata.generatedAt,
    },
    统计: {
      候选角色数: candidates.length,
      完全缺失角色数: candidates.filter(item => item.缺失类型 === '完全缺失').length,
      疑似漏项角色数: candidates.filter(item => item.缺失类型 === '疑似漏项').length,
      有建议角色数: candidates.filter(item => item.建议功法.length > 0).length,
      无法自动命名角色数: candidates.filter(item => item.建议功法.length === 0).length,
      高置信建议数: candidates.flatMap(item => item.建议功法).filter(item => item.置信度.等级 === '高').length,
      中置信建议数: candidates.flatMap(item => item.建议功法).filter(item => item.置信度.等级 === '中').length,
      低置信原创建议数: candidates.flatMap(item => item.建议功法).filter(item => item.是否原创).length,
      排除角色数: excluded.length,
    },
    候选角色: candidates,
    排除记录: excluded,
  };
}
