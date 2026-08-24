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
  ['水上飘轻功', '铁掌水上飘'],
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

export function normalizeMastery(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const direct = MASTERY_LEVELS.find(level => trimmed === level || trimmed.startsWith(`${level}（`));
  if (direct) return direct;
  if (trimmed === '略有所成' || trimmed.startsWith('略有所成（')) return '略有小成';
  if (trimmed === '略知皮毛' || trimmed.startsWith('略知皮毛（')) return '初窥门径';
  return null;
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
    const change = {
      功法: canonicalMartialArtName(rawArtName),
      源功法名: rawArtName,
      操作: operation,
      原始操作: event.currentOperation,
      原始角色键: rawCharacterKey,
      旧掌握程度: extractMastery(before),
      新掌握程度: extractMastery(after),
      旧标准掌握程度: normalizeMastery(extractMastery(before)),
      新标准掌握程度: normalizeMastery(extractMastery(after)),
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
    .map(rawName => ({
      变量键: rawName,
      掌握程度: extractMastery(powers[rawName]),
      标准掌握程度: normalizeMastery(extractMastery(powers[rawName])),
      完整变量: cloneJson(powers[rawName]),
    }));
}

function summarizeArtRecord(characterState, artRecord, databaseNames) {
  const changes = artRecord.changes.map(change => cloneJson(change));
  const currentValues = currentValuesForArt(characterState, artRecord);
  return {
    功法: artRecord.canonical,
    源功法名: [...artRecord.rawNames].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    当前存在: currentValues.length > 0,
    当前变量: currentValues,
    功法库状态: databaseNames.has(artRecord.canonical) ? '已收录' : '未收录',
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
      const artRecords = [...record.martialArts.values()]
        .sort((a, b) => a.canonical.localeCompare(b.canonical, 'zh-CN'))
        .map(artRecord => summarizeArtRecord(characterState, artRecord, databaseNames));
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
        功法记录: artRecords,
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
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const art = escapeRegExp(artName);
  return aliases.some(alias => {
    const actor = escapeRegExp(alias);
    const attributedUse = new RegExp(`${art}[^，,。！？；;—]{0,10}(?:由|乃是|是)${actor}(?:所使|所施|施展|使出)`);
    if (attributedUse.test(sentence)) return true;

    let actorIndex = sentence.indexOf(alias);
    while (actorIndex >= 0) {
      const afterActor = sentence.slice(actorIndex + alias.length, actorIndex + alias.length + 48);
      for (const verbMatch of afterActor.matchAll(/使出|施展|使开|使动|运起|运使|催动|用出|使起|施起|改用|以|用/g)) {
        const beforeVerb = afterActor.slice(0, verbMatch.index);
        if (beforeVerb.length > 20 || /[，,。！？；;—]|被|遭|受|中了|说|问|要|令|让|教|传|换|求|命|劝/.test(beforeVerb))
          continue;
        const afterVerb = afterActor.slice(verbMatch.index + verbMatch[0].length);
        const artIndex = afterVerb.indexOf(artName);
        if (artIndex < 0 || artIndex > 16) continue;
        const between = afterVerb.slice(0, artIndex);
        if (/[，,。！？；;—]/.test(between)) continue;
        if (
          /[一-龥]{2,10}(?:身法|步法|轻功|剑法|刀法|杖法|鞭法|掌法|拳法|指法|功|法|掌|拳|剑|刀|杖|鞭|指|手|阵)/.test(
            between,
          )
        )
          continue;
        return true;
      }
      actorIndex = sentence.indexOf(alias, actorIndex + alias.length);
    }
    return false;
  });
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
