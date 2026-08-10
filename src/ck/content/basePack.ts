import type { Character, GameState } from '../domain/schema';
import { GameStateSchema } from '../domain/schema';

export const zhCN: Record<string, string> = {
  'scenario.title': '布列塔尼：裂冠前夜',
  'county.rennes': '雷恩',
  'county.nantes': '南特',
  'county.broerec': '布罗埃雷克／瓦讷',
  'county.cornouaille': '科努瓦耶',
  'county.leon': '莱昂',
  'county.penthievre': '潘蒂耶夫尔',
  'county.avranches': '阿夫朗什',
  'county.mortain': '莫尔坦',
  'county.bayeux': '贝桑／巴约',
  'county.evreux': '埃夫勒',
  'county.rouen': '鲁昂',
  'county.eu': '厄',
  'county.maine': '缅因',
  'county.anjou': '安茹',
  'county.perche': '佩尔什',
  'county.alencon': '阿朗松',
  'character.conan': '科南二世',
  'character.hawise': '阿维丝',
  'character.hoel': '霍埃尔',
  'character.geoffroy': '若弗鲁瓦·博特雷尔',
  'character.morvan': '莫尔万·德·莱昂',
  'character.jeanDol': '让·德·多勒',
  'character.alan': '阿兰·德·雷恩',
  'character.mael': '马埃尔院长',
  'character.william': '诺曼底的威廉',
  'character.geoffreyAnjou': '安茹的若弗鲁瓦',
  'character.isabeau': '伊莎博·德·雷',
  'title.brittany': '布列塔尼公国',
  'title.normandy': '诺曼底公国',
  'title.anjou': '安茹伯爵领',
  'faction.liberty': '多勒—孔堡降权派系',
};

export function t(key: string): string {
  return zhCN[key] ?? key;
}

type CountyInput = {
  id: string;
  originalName: string;
  polygon: Array<[number, number]>;
  centroid: [number, number];
  adjacent: string[];
  holderId: string;
  deJureLiegeId: string;
};

const countyInputs: CountyInput[] = [
  { id: 'leon', originalName: 'Léon', polygon: [[70, 74], [184, 62], [210, 125], [154, 171], [68, 145]], centroid: [132, 116], adjacent: ['cornouaille', 'penthievre'], holderId: 'char_morvan', deJureLiegeId: 'd_brittany' },
  { id: 'penthievre', originalName: 'Penthièvre', polygon: [[210, 125], [326, 94], [376, 153], [330, 215], [230, 205], [154, 171]], centroid: [277, 158], adjacent: ['leon', 'cornouaille', 'rennes'], holderId: 'char_geoffroy', deJureLiegeId: 'd_brittany' },
  { id: 'cornouaille', originalName: 'Cornouaille', polygon: [[68, 145], [154, 171], [230, 205], [219, 290], [119, 305], [48, 243]], centroid: [143, 232], adjacent: ['leon', 'penthievre', 'rennes', 'broerec'], holderId: 'char_hoel', deJureLiegeId: 'd_brittany' },
  { id: 'rennes', originalName: 'Rennes', polygon: [[330, 215], [376, 153], [467, 184], [493, 271], [414, 318], [318, 284]], centroid: [399, 241], adjacent: ['penthievre', 'cornouaille', 'broerec', 'nantes', 'avranches', 'maine'], holderId: 'char_conan', deJureLiegeId: 'd_brittany' },
  { id: 'broerec', originalName: 'Broërec / Vannes', polygon: [[119, 305], [219, 290], [318, 284], [331, 372], [236, 416], [130, 384]], centroid: [225, 348], adjacent: ['cornouaille', 'rennes', 'nantes'], holderId: 'char_conan', deJureLiegeId: 'd_brittany' },
  { id: 'nantes', originalName: 'Nantes', polygon: [[318, 284], [414, 318], [454, 410], [371, 470], [236, 416], [331, 372]], centroid: [363, 379], adjacent: ['broerec', 'rennes', 'maine', 'anjou'], holderId: 'char_hoel', deJureLiegeId: 'd_brittany' },
  { id: 'avranches', originalName: 'Avranches', polygon: [[467, 184], [545, 154], [598, 210], [563, 287], [493, 271]], centroid: [532, 223], adjacent: ['rennes', 'mortain', 'bayeux', 'maine'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'mortain', originalName: 'Mortain', polygon: [[493, 271], [563, 287], [602, 353], [546, 408], [454, 410], [414, 318]], centroid: [514, 343], adjacent: ['avranches', 'bayeux', 'alencon', 'maine', 'rennes'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'bayeux', originalName: 'Bessin / Bayeux', polygon: [[545, 154], [648, 111], [709, 168], [677, 235], [598, 210]], centroid: [629, 172], adjacent: ['avranches', 'mortain', 'rouen', 'evreux'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'rouen', originalName: 'Rouen', polygon: [[648, 111], [775, 83], [830, 143], [787, 217], [709, 168]], centroid: [746, 145], adjacent: ['bayeux', 'evreux', 'eu'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'eu', originalName: 'Eu', polygon: [[775, 83], [895, 98], [925, 176], [830, 193], [830, 143]], centroid: [850, 137], adjacent: ['rouen', 'evreux'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'evreux', originalName: 'Évreux', polygon: [[677, 235], [709, 168], [787, 217], [830, 193], [854, 290], [763, 335], [682, 306]], centroid: [761, 261], adjacent: ['bayeux', 'rouen', 'eu', 'perche', 'alencon'], holderId: 'char_william', deJureLiegeId: 'd_normandy' },
  { id: 'alencon', originalName: 'Alençon', polygon: [[602, 353], [682, 306], [763, 335], [744, 422], [658, 452], [584, 411]], centroid: [672, 381], adjacent: ['mortain', 'evreux', 'perche', 'maine'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france' },
  { id: 'perche', originalName: 'Perche', polygon: [[763, 335], [854, 290], [922, 360], [881, 449], [744, 422]], centroid: [832, 378], adjacent: ['evreux', 'alencon', 'maine', 'anjou'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france' },
  { id: 'maine', originalName: 'Maine', polygon: [[454, 410], [546, 408], [584, 411], [658, 452], [632, 535], [515, 557], [429, 499]], centroid: [544, 481], adjacent: ['rennes', 'nantes', 'avranches', 'mortain', 'alencon', 'perche', 'anjou'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france' },
  { id: 'anjou', originalName: 'Anjou', polygon: [[371, 470], [454, 410], [429, 499], [515, 557], [452, 604], [342, 575]], centroid: [423, 523], adjacent: ['nantes', 'maine', 'perche'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france' },
];

function character(input: Omit<Character, 'alive' | 'imprisonedById' | 'knowledgeIds' | 'parentIds' | 'spouseIds' | 'titleIds'> & Partial<Pick<Character, 'parentIds' | 'spouseIds' | 'titleIds'>>): Character {
  return {
    ...input,
    alive: true,
    imprisonedById: null,
    knowledgeIds: [],
    parentIds: input.parentIds ?? [],
    spouseIds: input.spouseIds ?? [],
    titleIds: input.titleIds ?? [],
  };
}

export function createInitialState(seed = 10660915): GameState {
  const characters: GameState['characters'] = {
    char_conan: character({ id: 'char_conan', nameKey: 'character.conan', originalName: 'Conan II de Bretagne', birthDate: '1033-01-01', sex: 'male', houseId: 'house_rennes', dynastyId: 'dynasty_rennes', parentIds: ['char_alan_iii'], spouseIds: [], titleIds: ['d_brittany', 'c_rennes', 'c_broerec'], liegeId: null, locationId: 'loc_rennes_castle', traits: ['果断', '多疑', '年轻的公爵'], goals: ['瓦解降权派系', '维护公爵权威'], sourceType: 'attested' }),
    char_hawise: character({ id: 'char_hawise', nameKey: 'character.hawise', originalName: 'Hawise de Bretagne', birthDate: '1037-01-01', sex: 'female', houseId: 'house_rennes', dynastyId: 'dynasty_rennes', parentIds: ['char_alan_iii'], spouseIds: ['char_hoel'], titleIds: [], liegeId: 'char_conan', locationId: 'loc_nantes_castle', traits: ['谨慎', '宗族纽带'], goals: ['保护家族继承'], sourceType: 'attested' }),
    char_hoel: character({ id: 'char_hoel', nameKey: 'character.hoel', originalName: 'Hoël de Cornouaille', birthDate: '1030-01-01', sex: 'male', houseId: 'house_cornouaille', dynastyId: 'dynasty_cornouaille', spouseIds: ['char_hawise'], titleIds: ['c_cornouaille', 'c_nantes'], liegeId: 'char_conan', locationId: 'loc_nantes_castle', traits: ['务实', '重视继承'], goals: ['获得继承承认', '进入公爵核心议会'], sourceType: 'attested' }),
    char_geoffroy: character({ id: 'char_geoffroy', nameKey: 'character.geoffroy', originalName: 'Geoffroy Boterel', birthDate: '1035-01-01', sex: 'male', houseId: 'house_penthievre', dynastyId: 'dynasty_rennes', titleIds: ['c_penthievre'], liegeId: 'char_conan', locationId: 'loc_penthievre_castle', traits: ['骄傲', '记仇'], goals: ['家族平反', '减轻征召义务'], sourceType: 'attested' }),
    char_morvan: character({ id: 'char_morvan', nameKey: 'character.morvan', originalName: 'Morvan de Léon', birthDate: '1028-01-01', sex: 'male', houseId: 'house_leon', dynastyId: 'dynasty_leon', titleIds: ['c_leon'], liegeId: 'char_conan', locationId: 'loc_leon_castle', traits: ['尚武', '地方主义'], goals: ['取得军事自治', '获得边防补贴'], sourceType: 'composite' }),
    char_jean_dol: character({ id: 'char_jean_dol', nameKey: 'character.jeanDol', originalName: 'Jean de Dol', birthDate: '1025-01-01', sex: 'male', houseId: 'house_dol', dynastyId: 'dynasty_dol', titleIds: [], liegeId: 'char_conan', locationId: 'loc_penthievre_abbey', traits: ['煽动者', '老练'], goals: ['限制公爵征税与征召'], sourceType: 'composite' }),
    char_alan: character({ id: 'char_alan', nameKey: 'character.alan', originalName: 'Alain de Rennes', birthDate: '1020-01-01', sex: 'male', houseId: 'house_rennes_minor', dynastyId: 'dynasty_rennes_minor', titleIds: [], liegeId: 'char_conan', locationId: 'loc_rennes_castle', traits: ['忠诚', '守成'], goals: ['维持宫廷秩序'], sourceType: 'original' }),
    char_mael: character({ id: 'char_mael', nameKey: 'character.mael', originalName: 'Maël, abbé de Saint-Melaine', birthDate: '1018-01-01', sex: 'male', houseId: 'house_church', dynastyId: 'dynasty_none', titleIds: [], liegeId: 'char_conan', locationId: 'loc_rennes_abbey', traits: ['博学', '野心'], goals: ['扩大教会影响'], sourceType: 'original' }),
    char_william: character({ id: 'char_william', nameKey: 'character.william', originalName: 'William of Normandy', birthDate: '1028-01-01', sex: 'male', houseId: 'house_normandy', dynastyId: 'dynasty_normandy', titleIds: ['d_normandy', 'c_avranches', 'c_mortain', 'c_bayeux', 'c_evreux', 'c_rouen', 'c_eu'], liegeId: 'char_philip', locationId: 'loc_rouen_castle', traits: ['雄心', '军事家'], goals: ['渡海争夺英格兰'], sourceType: 'attested' }),
    char_geoffrey_anjou: character({ id: 'char_geoffrey_anjou', nameKey: 'character.geoffreyAnjou', originalName: 'Geoffroy III d’Anjou', birthDate: '1040-01-01', sex: 'male', houseId: 'house_anjou', dynastyId: 'dynasty_gatinais', titleIds: ['c_anjou', 'c_maine', 'c_perche', 'c_alencon'], liegeId: 'char_philip', locationId: 'loc_anjou_castle', traits: ['迟疑'], goals: ['维持边区影响'], sourceType: 'attested' }),
    char_isabeau: character({ id: 'char_isabeau', nameKey: 'character.isabeau', originalName: 'Isabeau de Retz', birthDate: '1044-03-02', sex: 'female', houseId: 'house_retz', dynastyId: 'dynasty_retz', titleIds: [], liegeId: 'char_hoel', locationId: 'loc_nantes_castle', traits: ['敏锐', '宫廷诗人'], goals: ['在南特宫廷获得稳定地位'], sourceType: 'original' }),
  };

  const titles: GameState['titles'] = {
    d_brittany: { id: 'd_brittany', nameKey: 'title.brittany', rank: 'duchy', holderId: 'char_conan', deJureLiegeId: 'k_france', deFactoLiegeId: null, countyId: null },
    d_normandy: { id: 'd_normandy', nameKey: 'title.normandy', rank: 'duchy', holderId: 'char_william', deJureLiegeId: 'k_france', deFactoLiegeId: 'k_france', countyId: null },
    k_france: { id: 'k_france', nameKey: '法兰西王国', rank: 'kingdom', holderId: 'char_philip', deJureLiegeId: null, deFactoLiegeId: null, countyId: null },
  };
  for (const county of countyInputs) {
    const titleId = `c_${county.id}`;
    titles[titleId] = { id: titleId, nameKey: `county.${county.id}`, rank: 'county', holderId: county.holderId, deJureLiegeId: county.deJureLiegeId, deFactoLiegeId: county.deJureLiegeId, countyId: county.id };
  }

  const counties: GameState['counties'] = {};
  const locations: GameState['locations'] = {};
  for (const input of countyInputs) {
    const locationIds = [`loc_${input.id}_castle`, `loc_${input.id}_town`, `loc_${input.id}_abbey`];
    counties[input.id] = {
      id: input.id,
      nameKey: `county.${input.id}`,
      originalName: input.originalName,
      titleId: `c_${input.id}`,
      polygon: input.polygon,
      centroid: input.centroid,
      adjacentCountyIds: input.adjacent,
      locationIds,
      controllerTitleId: `c_${input.id}`,
      occupation: null,
      control: 100,
    };
    const [x, y] = input.centroid;
    locations[locationIds[0]] = { id: locationIds[0], countyId: input.id, nameKey: `${t(`county.${input.id}`)}城堡`, kind: 'castle', position: [x, y] };
    locations[locationIds[1]] = { id: locationIds[1], countyId: input.id, nameKey: `${t(`county.${input.id}`)}市集`, kind: input.id === 'nantes' || input.id === 'broerec' ? 'port' : 'city', position: [x + 12, y + 13] };
    locations[locationIds[2]] = { id: locationIds[2], countyId: input.id, nameKey: `${t(`county.${input.id}`)}修道院`, kind: 'temple', position: [x - 13, y + 15] };
  }

  return GameStateSchema.parse({
    schemaVersion: 1,
    saveId: `brittany-${seed}`,
    revision: 0,
    rngState: seed,
    scenarioId: 'brittany_1066_prologue',
    contentPackIds: ['ck.core', 'ck.prologue.brittany1066'],
    contentPackVersions: {
      'ck.core': '1.0.0',
      'ck.prologue.brittany1066': '1.0.0',
    },
    currentDate: '1066-09-15',
    nextRegularPulseAt: '1066-09-22',
    worldActionCredit: 0,
    playerCharacterId: 'char_conan',
    regentId: null,
    resources: { gold: 180, prestige: 320, legitimacy: 58, stress: 20, levies: 1400 },
    settings: {},
    characters,
    titles,
    counties,
    locations,
    knowledge: {},
    relationshipModifiers: [],
    promises: {},
    supportCommitments: {},
    factions: {
      faction_liberty: { id: 'faction_liberty', nameKey: 'faction.liberty', leaderId: 'char_jean_dol', memberIds: ['char_jean_dol'], targetId: 'char_conan', issueId: 'ducal_authority', power: 67, threshold: 60, deadline: '1066-09-29', status: 'organizing' },
    },
    activities: {
      feast_nantes: { id: 'feast_nantes', type: 'feast', hostId: 'char_hoel', participantIds: ['char_hoel', 'char_hawise', 'char_geoffroy', 'char_morvan', 'char_isabeau'], locationId: 'loc_nantes_castle', phase: 'planned', startedAt: '1066-09-20', status: 'planned', memoryIds: [] },
    },
    communications: {},
    travels: {},
    projects: {},
    wars: {},
    signals: [],
    eventLog: [],
    scenario: { id: 'brittany_1066_prologue', phase: 'council', deadline: '1066-09-29', feastId: 'feast_nantes', supportTargetIds: ['char_hoel', 'char_geoffroy', 'char_morvan'], requiredSupport: 2, selectedRegentId: null, activeTravelId: null, sceneCount: 0, result: 'pending', flags: {} },
  });
}

export const countyIds = countyInputs.map(item => item.id);
