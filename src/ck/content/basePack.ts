import { addDays } from '../domain/date';
import { GameStateSchema, type Character, type GameState } from '../domain/schema';

export const zhCN: Record<string, string> = {
  'campaign.title': '布列塔尼与诺曼边区',
  'situation.liberty': '裂冠危机',
  'county.rennes': '雷恩', 'county.nantes': '南特', 'county.broerec': '布罗埃雷克／瓦讷',
  'county.cornouaille': '科努瓦耶', 'county.leon': '莱昂', 'county.penthievre': '潘蒂耶夫尔',
  'county.avranches': '阿夫朗什', 'county.mortain': '莫尔坦', 'county.bayeux': '贝桑／巴约',
  'county.evreux': '埃夫勒', 'county.rouen': '鲁昂', 'county.eu': '厄', 'county.maine': '缅因',
  'county.anjou': '安茹', 'county.perche': '佩尔什', 'county.alencon': '阿朗松',
  'character.conan': '科南二世', 'character.hawise': '阿维丝', 'character.hoel': '霍埃尔',
  'character.alanIV': '阿兰·费尔让', 'character.geoffroy': '若弗鲁瓦·博特雷尔',
  'character.eudes': '厄德·德·潘蒂耶夫尔', 'character.morvan': '莫尔万·德·莱昂',
  'character.jeanDol': '让·德·多勒', 'character.alan': '阿兰·德·雷恩', 'character.mael': '马埃尔院长',
  'character.isabeau': '伊莎博·德·雷', 'character.yves': '伊夫·德·雷恩', 'character.guethenoc': '盖特诺克·德·瓦讷',
  'character.rhiwallon': '里瓦隆·德·多勒', 'character.william': '诺曼底的威廉',
  'character.matilda': '佛兰德斯的玛蒂尔达', 'character.robertCurthose': '罗贝尔·柯索斯',
  'character.robertMortain': '莫尔坦的罗贝尔', 'character.emmaMortain': '蒙哥马利的埃玛',
  'character.odo': '巴约的厄德', 'character.richardEvreux': '埃夫勒的理查',
  'character.williamEu': '厄的威廉', 'character.geoffreyAnjou': '安茹的若弗鲁瓦三世',
  'character.ermengarde': '安茹的埃芒加德', 'character.philip': '法兰西的腓力一世',
  'character.bertha': '荷兰的贝尔塔', 'character.baldwin': '佛兰德斯的博杜安五世',
  'character.richilda': '埃诺的里希尔德', 'character.harold': '哈罗德·戈德温森',
  'character.edith': '伊迪丝·斯万内莎', 'character.malcolm': '苏格兰的马尔科姆三世',
  'character.guillaumeAquitaine': '阿基坦的纪尧姆八世', 'character.agnes': '勃艮第的阿涅丝',
  'title.brittany': '布列塔尼公国', 'title.normandy': '诺曼底公国', 'title.france': '法兰西王国',
  'title.england': '英格兰王国', 'title.anjou': '安茹伯爵领', 'faction.liberty': '多勒—孔堡降权派系',
  'external.england': '英格兰', 'external.france': '法兰西王室', 'external.flanders': '佛兰德斯',
  'external.aquitaine': '阿基坦', 'external.scotland': '苏格兰', 'external.papacy': '罗马教廷',
};

export function t(key: string): string { return zhCN[key] ?? key; }

type CountyInput = {
  id: string; originalName: string; polygon: Array<[number, number]>; centroid: [number, number];
  adjacent: string[]; holderId: string; deJureLiegeId: string; terrain: GameState['counties'][string]['terrain'];
  tax: number; levies: number;
};

// 自行绘制的简化战略几何，不使用 Paradox 地图资产。海岸与边界会由地图组件再叠加表现。
const countyInputs: CountyInput[] = [
  { id: 'leon', originalName: 'Léon', polygon: [[42,132],[63,74],[168,60],[192,117],[145,153],[67,163]], centroid:[111,112], adjacent:['cornouaille','penthievre'], holderId:'char_morvan', deJureLiegeId:'d_brittany', terrain:'coastal', tax:2.1, levies:330 },
  { id: 'penthievre', originalName: 'Penthièvre', polygon: [[168,60],[286,78],[336,137],[303,201],[192,191],[145,153],[192,117]], centroid:[240,133], adjacent:['leon','cornouaille','rennes'], holderId:'char_geoffroy', deJureLiegeId:'d_brittany', terrain:'hills', tax:2.4, levies:390 },
  { id: 'cornouaille', originalName: 'Cornouaille', polygon: [[67,163],[145,153],[192,191],[207,267],[141,300],[51,256]], centroid:[128,224], adjacent:['leon','penthievre','rennes','broerec'], holderId:'char_hoel', deJureLiegeId:'d_brittany', terrain:'coastal', tax:2.6, levies:350 },
  { id: 'rennes', originalName: 'Rennes', polygon: [[303,201],[336,137],[437,161],[480,225],[417,290],[311,271]], centroid:[382,221], adjacent:['penthievre','cornouaille','broerec','nantes','avranches','maine'], holderId:'char_conan', deJureLiegeId:'d_brittany', terrain:'farmlands', tax:4.2, levies:520 },
  { id: 'broerec', originalName: 'Broërec / Vannes', polygon: [[141,300],[207,267],[311,271],[326,345],[244,401],[145,374]], centroid:[235,334], adjacent:['cornouaille','rennes','nantes'], holderId:'char_conan', deJureLiegeId:'d_brittany', terrain:'coastal', tax:3.2, levies:410 },
  { id: 'nantes', originalName: 'Nantes', polygon: [[311,271],[417,290],[458,372],[392,434],[326,420],[244,401],[326,345]], centroid:[360,354], adjacent:['broerec','rennes','maine','anjou'], holderId:'char_hoel', deJureLiegeId:'d_brittany', terrain:'farmlands', tax:4.8, levies:480 },
  { id: 'avranches', originalName: 'Avranches', polygon: [[437,161],[505,129],[568,178],[548,247],[480,225]], centroid:[508,190], adjacent:['rennes','mortain','bayeux','maine'], holderId:'char_william', deJureLiegeId:'d_normandy', terrain:'coastal', tax:2.8, levies:360 },
  { id: 'mortain', originalName: 'Mortain', polygon: [[480,225],[548,247],[594,310],[552,370],[458,372],[417,290]], centroid:[510,305], adjacent:['avranches','bayeux','alencon','maine','rennes'], holderId:'char_robert_mortain', deJureLiegeId:'d_normandy', terrain:'forest', tax:2.4, levies:440 },
  { id: 'bayeux', originalName: 'Bessin / Bayeux', polygon: [[505,129],[618,89],[679,140],[645,208],[568,178]], centroid:[594,144], adjacent:['avranches','mortain','rouen','evreux'], holderId:'char_odo', deJureLiegeId:'d_normandy', terrain:'coastal', tax:3.6, levies:410 },
  { id: 'rouen', originalName: 'Rouen', polygon: [[618,89],[752,63],[804,119],[764,196],[679,140]], centroid:[714,126], adjacent:['bayeux','evreux','eu'], holderId:'char_william', deJureLiegeId:'d_normandy', terrain:'farmlands', tax:5.1, levies:510 },
  { id: 'eu', originalName: 'Eu', polygon: [[752,63],[875,76],[911,148],[804,173],[804,119]], centroid:[836,113], adjacent:['rouen','evreux'], holderId:'char_william_eu', deJureLiegeId:'d_normandy', terrain:'coastal', tax:2.7, levies:320 },
  { id: 'evreux', originalName: 'Évreux', polygon: [[645,208],[679,140],[764,196],[804,173],[836,265],[748,315],[663,286]], centroid:[747,245], adjacent:['bayeux','rouen','eu','perche','alencon'], holderId:'char_richard_evreux', deJureLiegeId:'d_normandy', terrain:'farmlands', tax:3.5, levies:390 },
  { id: 'alencon', originalName: 'Alençon', polygon: [[594,310],[663,286],[748,315],[731,398],[642,431],[552,370]], centroid:[651,357], adjacent:['mortain','evreux','perche','maine'], holderId:'char_geoffrey_anjou', deJureLiegeId:'k_france', terrain:'hills', tax:2.5, levies:380 },
  { id: 'perche', originalName: 'Perche', polygon: [[748,315],[836,265],[908,335],[870,427],[731,398]], centroid:[822,355], adjacent:['evreux','alencon','maine','anjou'], holderId:'char_geoffrey_anjou', deJureLiegeId:'k_france', terrain:'forest', tax:2.2, levies:340 },
  { id: 'maine', originalName: 'Maine', polygon: [[458,372],[552,370],[642,431],[618,515],[505,543],[412,482]], centroid:[526,455], adjacent:['rennes','nantes','avranches','mortain','alencon','perche','anjou'], holderId:'char_geoffrey_anjou', deJureLiegeId:'k_france', terrain:'farmlands', tax:3.9, levies:460 },
  { id: 'anjou', originalName: 'Anjou', polygon: [[392,434],[458,372],[412,482],[505,543],[449,588],[334,553],[326,420]], centroid:[412,501], adjacent:['nantes','maine','perche'], holderId:'char_geoffrey_anjou', deJureLiegeId:'k_france', terrain:'farmlands', tax:4.4, levies:470 },
];

const defaultAttributes = { diplomacy: 8, martial: 8, stewardship: 8, intrigue: 8, learning: 8, prowess: 8 };
const defaultPersonality = { boldness: 0, compassion: 0, honor: 0 };

type CharacterInput = Omit<Character, 'alive'|'deathDate'|'imprisonedById'|'knowledgeIds'|'memoryIds'|'parentIds'|'childIds'|'spouseIds'|'betrothedIds'|'titleIds'|'attributes'|'personality'|'health'|'fertility'|'stress'|'shortTermGoal'|'ambition'> & Partial<Character>;
function character(input: CharacterInput): Character {
  const { attributes, personality, ...rest } = input;
  return {
    alive:true, deathDate:null, imprisonedById:null, knowledgeIds:[], memoryIds:[], parentIds:[], childIds:[], spouseIds:[], betrothedIds:[], titleIds:[],
    health:5, fertility:0.5, stress:0, shortTermGoal:null, ambition:null,
    ...rest,
    attributes:{...defaultAttributes, ...(attributes ?? {})}, personality:{...defaultPersonality, ...(personality ?? {})},
  } as Character;
}

export function createInitialState(seed = 10660915): GameState {
  const C: GameState['characters'] = {
    char_conan: character({ id:'char_conan', nameKey:'character.conan', originalName:'Conan II de Bretagne', birthDate:'1033-01-01', sex:'male', houseId:'house_rennes', dynastyId:'dynasty_rennes', parentIds:['char_alan_iii'], childIds:[], titleIds:['d_brittany','c_rennes','c_broerec'], liegeId:null, locationId:'loc_rennes_castle', traits:['果断','多疑','勇武'], attributes:{diplomacy:9,martial:14,stewardship:10,intrigue:11,learning:7,prowess:15}, personality:{boldness:55,compassion:-10,honor:25}, stress:20, goals:['维护公爵权威','压制叛乱'], shortTermGoal:'重建议会', ambition:'统一布列塔尼', sourceType:'attested' }),
    char_hawise: character({ id:'char_hawise', nameKey:'character.hawise', originalName:'Hawise de Bretagne', birthDate:'1037-01-01', sex:'female', houseId:'house_rennes', dynastyId:'dynasty_rennes', parentIds:['char_alan_iii'], childIds:['char_alan_iv'], spouseIds:['char_hoel'], liegeId:'char_conan', locationId:'loc_nantes_castle', traits:['谨慎','宗族纽带','耐心'], attributes:{diplomacy:13,martial:5,stewardship:12,intrigue:10,learning:10,prowess:3}, personality:{boldness:-20,compassion:35,honor:50}, goals:['保护家族继承'], ambition:'确保阿兰继承', sourceType:'attested' }),
    char_hoel: character({ id:'char_hoel', nameKey:'character.hoel', originalName:'Hoël de Cornouaille', birthDate:'1030-01-01', sex:'male', houseId:'house_cornouaille', dynastyId:'dynasty_cornouaille', spouseIds:['char_hawise'], childIds:['char_alan_iv'], titleIds:['c_cornouaille','c_nantes'], liegeId:'char_conan', locationId:'loc_nantes_castle', traits:['务实','耐心','重视继承'], attributes:{diplomacy:13,martial:10,stewardship:14,intrigue:9,learning:9,prowess:8}, personality:{boldness:10,compassion:10,honor:45}, goals:['获得继承承认','进入核心议会'], shortTermGoal:'主持南特宴会', ambition:'让儿子继承布列塔尼', sourceType:'attested' }),
    char_alan_iv: character({ id:'char_alan_iv', nameKey:'character.alanIV', originalName:'Alan Fergant', birthDate:'1063-01-01', sex:'male', houseId:'house_cornouaille', dynastyId:'dynasty_cornouaille', parentIds:['char_hoel','char_hawise'], liegeId:'char_hoel', locationId:'loc_nantes_castle', traits:['幼童'], health:5.6, fertility:0, goals:['成长'], sourceType:'attested' }),
    char_geoffroy: character({ id:'char_geoffroy', nameKey:'character.geoffroy', originalName:'Geoffroy Boterel', birthDate:'1035-01-01', sex:'male', houseId:'house_penthievre', dynastyId:'dynasty_rennes', parentIds:['char_eudes_penthievre'], titleIds:['c_penthievre'], liegeId:'char_conan', locationId:'loc_penthievre_castle', traits:['骄傲','记仇','坦率'], attributes:{diplomacy:8,martial:13,stewardship:9,intrigue:8,learning:6,prowess:14}, personality:{boldness:45,compassion:-20,honor:30}, goals:['家族平反','减轻征召'], ambition:'恢复潘蒂耶夫尔影响', sourceType:'attested' }),
    char_eudes_penthievre: character({ id:'char_eudes_penthievre', nameKey:'character.eudes', originalName:'Eudes de Penthièvre', birthDate:'0999-01-01', sex:'male', houseId:'house_penthievre', dynastyId:'dynasty_rennes', childIds:['char_geoffroy'], liegeId:'char_conan', locationId:'loc_penthievre_castle', traits:['年迈','老练','家族本位'], health:2.4, fertility:0.15, attributes:{diplomacy:12,martial:9,stewardship:10,intrigue:14,learning:8,prowess:5}, personality:{boldness:5,compassion:-5,honor:20}, goals:['守住家族遗产'], sourceType:'attested' }),
    char_morvan: character({ id:'char_morvan', nameKey:'character.morvan', originalName:'Morvan de Léon', birthDate:'1028-01-01', sex:'male', houseId:'house_leon', dynastyId:'dynasty_leon', titleIds:['c_leon'], liegeId:'char_conan', locationId:'loc_leon_castle', traits:['尚武','地方主义','勇敢'], attributes:{diplomacy:7,martial:15,stewardship:8,intrigue:7,learning:5,prowess:16}, personality:{boldness:70,compassion:-5,honor:25}, goals:['军事自治','边防补贴'], ambition:'成为布列塔尼元帅', sourceType:'composite' }),
    char_jean_dol: character({ id:'char_jean_dol', nameKey:'character.jeanDol', originalName:'Jean de Dol', birthDate:'1025-01-01', sex:'male', houseId:'house_dol', dynastyId:'dynasty_dol', liegeId:'char_conan', locationId:'loc_penthievre_abbey', traits:['煽动者','老练','狡猾'], attributes:{diplomacy:12,martial:7,stewardship:8,intrigue:16,learning:10,prowess:6}, personality:{boldness:35,compassion:-30,honor:-25}, goals:['限制公爵征税与征召'], ambition:'迫使公爵接受降权', sourceType:'composite' }),
    char_alan: character({ id:'char_alan', nameKey:'character.alan', originalName:'Alain de Rennes', birthDate:'1020-01-01', sex:'male', houseId:'house_rennes_minor', dynastyId:'dynasty_rennes_minor', liegeId:'char_conan', locationId:'loc_rennes_castle', traits:['忠诚','守成','诚实'], attributes:{diplomacy:10,martial:12,stewardship:9,intrigue:6,learning:7,prowess:11}, personality:{boldness:5,compassion:25,honor:75}, goals:['维持宫廷秩序'], ambition:'守护雷恩', sourceType:'original' }),
    char_mael: character({ id:'char_mael', nameKey:'character.mael', originalName:'Maël, abbé de Saint-Melaine', birthDate:'1018-01-01', sex:'male', houseId:'house_church', dynastyId:'dynasty_none', liegeId:'char_conan', locationId:'loc_rennes_abbey', traits:['博学','野心','冷静'], attributes:{diplomacy:11,martial:4,stewardship:10,intrigue:12,learning:17,prowess:3}, personality:{boldness:10,compassion:15,honor:15}, goals:['扩大教会影响'], ambition:'成为公爵首席顾问', sourceType:'original' }),
    char_isabeau: character({ id:'char_isabeau', nameKey:'character.isabeau', originalName:'Isabeau de Retz', birthDate:'1044-03-02', sex:'female', houseId:'house_retz', dynastyId:'dynasty_retz', liegeId:'char_hoel', locationId:'loc_nantes_castle', traits:['敏锐','宫廷诗人','善辩'], attributes:{diplomacy:15,martial:3,stewardship:9,intrigue:13,learning:12,prowess:2}, personality:{boldness:15,compassion:20,honor:5}, goals:['获得稳定宫廷职位'], ambition:'成为布列塔尼编年史家', sourceType:'original' }),
    char_yves: character({ id:'char_yves', nameKey:'character.yves', originalName:'Yves de Rennes', birthDate:'1031-01-01', sex:'male', houseId:'house_rennes_minor', dynastyId:'dynasty_rennes_minor', liegeId:'char_conan', locationId:'loc_rennes_town', traits:['善辩','圆滑','勤勉'], attributes:{diplomacy:15,martial:5,stewardship:12,intrigue:10,learning:10,prowess:5}, personality:{boldness:-5,compassion:15,honor:20}, goals:['维持封臣关系'], sourceType:'original' }),
    char_guethenoc: character({ id:'char_guethenoc', nameKey:'character.guethenoc', originalName:'Guéthenoc de Vannes', birthDate:'1029-01-01', sex:'male', houseId:'house_vannes', dynastyId:'dynasty_vannes', liegeId:'char_conan', locationId:'loc_broerec_castle', traits:['节俭','谨慎','地方通'], attributes:{diplomacy:8,martial:7,stewardship:16,intrigue:8,learning:9,prowess:6}, personality:{boldness:-25,compassion:5,honor:35}, goals:['发展瓦讷港'], sourceType:'original' }),
    char_rhiwallon: character({ id:'char_rhiwallon', nameKey:'character.rhiwallon', originalName:'Rhiwallon de Dol', birthDate:'1038-01-01', sex:'male', houseId:'house_dol', dynastyId:'dynasty_dol', liegeId:'char_jean_dol', locationId:'loc_penthievre_abbey', traits:['激进','年轻','多疑'], attributes:{diplomacy:7,martial:10,stewardship:6,intrigue:12,learning:6,prowess:10}, personality:{boldness:60,compassion:-20,honor:-5}, goals:['壮大降权派系'], sourceType:'composite' }),
    char_william: character({ id:'char_william', nameKey:'character.william', originalName:'William of Normandy', birthDate:'1028-01-01', sex:'male', houseId:'house_normandy', dynastyId:'dynasty_normandy', spouseIds:['char_matilda'], childIds:['char_robert_curthose'], titleIds:['d_normandy','c_avranches','c_rouen'], liegeId:'char_philip', locationId:'loc_rouen_castle', traits:['雄心','军事家','坚韧'], attributes:{diplomacy:12,martial:18,stewardship:14,intrigue:13,learning:9,prowess:15}, personality:{boldness:75,compassion:-20,honor:30}, goals:['渡海争夺英格兰'], ambition:'成为英格兰国王', sourceType:'attested' }),
    char_matilda: character({ id:'char_matilda', nameKey:'character.matilda', originalName:'Matilda of Flanders', birthDate:'1031-01-01', sex:'female', houseId:'house_flanders', dynastyId:'dynasty_flanders', spouseIds:['char_william'], childIds:['char_robert_curthose'], liegeId:'char_william', locationId:'loc_rouen_castle', traits:['威严','聪慧','家族本位'], attributes:{diplomacy:15,martial:6,stewardship:14,intrigue:11,learning:11,prowess:3}, personality:{boldness:25,compassion:20,honor:45}, goals:['巩固诺曼王朝'], sourceType:'attested' }),
    char_robert_curthose: character({ id:'char_robert_curthose', nameKey:'character.robertCurthose', originalName:'Robert Curthose', birthDate:'1051-01-01', sex:'male', houseId:'house_normandy', dynastyId:'dynasty_normandy', parentIds:['char_william','char_matilda'], liegeId:'char_william', locationId:'loc_rouen_castle', traits:['躁动','勇武','骄傲'], attributes:{diplomacy:8,martial:12,stewardship:7,intrigue:6,learning:6,prowess:13}, personality:{boldness:55,compassion:5,honor:20}, goals:['获得自己的领地'], sourceType:'attested' }),
    char_robert_mortain: character({ id:'char_robert_mortain', nameKey:'character.robertMortain', originalName:'Robert de Mortain', birthDate:'1031-01-01', sex:'male', houseId:'house_conteville', dynastyId:'dynasty_conteville', spouseIds:['char_emma_mortain'], titleIds:['c_mortain'], liegeId:'char_william', locationId:'loc_mortain_castle', traits:['忠诚','军事家','谨慎'], attributes:{diplomacy:9,martial:14,stewardship:10,intrigue:8,learning:6,prowess:13}, personality:{boldness:30,compassion:0,honor:60}, goals:['支持威廉远征'], sourceType:'attested' }),
    char_emma_mortain: character({ id:'char_emma_mortain', nameKey:'character.emmaMortain', originalName:'Emma de Montgomery', birthDate:'1038-01-01', sex:'female', houseId:'house_montgomery', dynastyId:'dynasty_montgomery', spouseIds:['char_robert_mortain'], liegeId:'char_robert_mortain', locationId:'loc_mortain_castle', traits:['谨慎','虔诚','勤勉'], attributes:{diplomacy:10,martial:3,stewardship:13,intrigue:8,learning:11,prowess:2}, personality:{boldness:-20,compassion:25,honor:55}, goals:['维护家族'], sourceType:'attested' }),
    char_odo: character({ id:'char_odo', nameKey:'character.odo', originalName:'Odo of Bayeux', birthDate:'1036-01-01', sex:'male', houseId:'house_conteville', dynastyId:'dynasty_conteville', titleIds:['c_bayeux'], liegeId:'char_william', locationId:'loc_bayeux_abbey', traits:['野心','神职','奢华'], attributes:{diplomacy:12,martial:10,stewardship:11,intrigue:15,learning:13,prowess:8}, personality:{boldness:45,compassion:-20,honor:-15}, goals:['从征服中获利'], sourceType:'attested' }),
    char_richard_evreux: character({ id:'char_richard_evreux', nameKey:'character.richardEvreux', originalName:'Richard d’Évreux', birthDate:'1037-01-01', sex:'male', houseId:'house_evreux', dynastyId:'dynasty_normandy', titleIds:['c_evreux'], liegeId:'char_william', locationId:'loc_evreux_castle', traits:['谨慎','尽责','守成'], goals:['守卫诺曼东境'], sourceType:'composite' }),
    char_william_eu: character({ id:'char_william_eu', nameKey:'character.williamEu', originalName:'Guillaume d’Eu', birthDate:'1034-01-01', sex:'male', houseId:'house_eu', dynastyId:'dynasty_normandy', titleIds:['c_eu'], liegeId:'char_william', locationId:'loc_eu_castle', traits:['好战','骄傲','野心'], goals:['获得英格兰领地'], sourceType:'composite' }),
    char_geoffrey_anjou: character({ id:'char_geoffrey_anjou', nameKey:'character.geoffreyAnjou', originalName:'Geoffroy III d’Anjou', birthDate:'1040-01-01', sex:'male', houseId:'house_anjou', dynastyId:'dynasty_gatinais', spouseIds:['char_ermengarde'], titleIds:['c_anjou','c_maine','c_perche','c_alencon'], liegeId:'char_philip', locationId:'loc_anjou_castle', traits:['迟疑','温和','守成'], attributes:{diplomacy:10,martial:7,stewardship:11,intrigue:8,learning:8,prowess:6}, personality:{boldness:-35,compassion:25,honor:20}, goals:['维持边区影响'], ambition:'稳定安茹继承', sourceType:'attested' }),
    char_ermengarde: character({ id:'char_ermengarde', nameKey:'character.ermengarde', originalName:'Ermengarde d’Anjou', birthDate:'1042-01-01', sex:'female', houseId:'house_anjou', dynastyId:'dynasty_gatinais', spouseIds:['char_geoffrey_anjou'], liegeId:'char_geoffrey_anjou', locationId:'loc_anjou_castle', traits:['敏锐','果断','家族本位'], goals:['保护安茹'], sourceType:'composite' }),
    char_philip: character({ id:'char_philip', nameKey:'character.philip', originalName:'Philippe I de France', birthDate:'1052-05-23', sex:'male', houseId:'house_capet', dynastyId:'dynasty_capet', spouseIds:['char_bertha'], titleIds:['k_france'], liegeId:null, locationId:'loc_evreux_castle', traits:['年轻国王','谨慎','享乐'], goals:['维护王室宗主权'], sourceType:'attested' }),
    char_bertha: character({ id:'char_bertha', nameKey:'character.bertha', originalName:'Bertha of Holland', birthDate:'1055-01-01', sex:'female', houseId:'house_holland', dynastyId:'dynasty_gerulfing', spouseIds:['char_philip'], liegeId:'char_philip', locationId:'loc_evreux_castle', traits:['年轻','虔诚','温和'], goals:['建立王室家庭'], sourceType:'attested' }),
    char_baldwin: character({ id:'char_baldwin', nameKey:'character.baldwin', originalName:'Baldwin V of Flanders', birthDate:'1012-01-01', sex:'male', houseId:'house_flanders', dynastyId:'dynasty_flanders', childIds:['char_matilda'], liegeId:'char_philip', locationId:'loc_eu_castle', traits:['老练','富有','外交家'], goals:['维护佛兰德斯平衡'], sourceType:'attested' }),
    char_richilda: character({ id:'char_richilda', nameKey:'character.richilda', originalName:'Richilde of Hainaut', birthDate:'1018-01-01', sex:'female', houseId:'house_hainaut', dynastyId:'dynasty_reginar', liegeId:'char_baldwin', locationId:'loc_eu_castle', traits:['强势','精明','护子'], goals:['扩大埃诺影响'], sourceType:'attested' }),
    char_harold: character({ id:'char_harold', nameKey:'character.harold', originalName:'Harold Godwinson', birthDate:'1022-01-01', sex:'male', houseId:'house_godwin', dynastyId:'dynasty_godwin', spouseIds:['char_edith'], titleIds:['k_england'], liegeId:null, locationId:'loc_rouen_port', traits:['果断','军事家','受欢迎'], goals:['守住英格兰王位'], sourceType:'attested' }),
    char_edith: character({ id:'char_edith', nameKey:'character.edith', originalName:'Edith Swannesha', birthDate:'1025-01-01', sex:'female', houseId:'house_godwin', dynastyId:'dynasty_godwin', spouseIds:['char_harold'], liegeId:'char_harold', locationId:'loc_rouen_port', traits:['忠诚','坚韧','家族本位'], goals:['保护子女'], sourceType:'attested' }),
    char_malcolm: character({ id:'char_malcolm', nameKey:'character.malcolm', originalName:'Malcolm III of Scotland', birthDate:'1031-01-01', sex:'male', houseId:'house_dunkeld', dynastyId:'dynasty_dunkeld', liegeId:null, locationId:'loc_avranches_port', traits:['强硬','雄心','好战'], goals:['巩固苏格兰'], sourceType:'attested' }),
    char_guillaume_aquitaine: character({ id:'char_guillaume_aquitaine', nameKey:'character.guillaumeAquitaine', originalName:'Guillaume VIII d’Aquitaine', birthDate:'1025-01-01', sex:'male', houseId:'house_poitiers', dynastyId:'dynasty_ramnulfid', spouseIds:['char_agnes'], liegeId:'char_philip', locationId:'loc_anjou_town', traits:['富有','文化赞助者','独立'], goals:['维持南方自治'], sourceType:'attested' }),
    char_agnes: character({ id:'char_agnes', nameKey:'character.agnes', originalName:'Agnès de Bourgogne', birthDate:'1035-01-01', sex:'female', houseId:'house_burgundy', dynastyId:'dynasty_ivrea', spouseIds:['char_guillaume_aquitaine'], liegeId:'char_guillaume_aquitaine', locationId:'loc_anjou_town', traits:['虔诚','善辩','谨慎'], goals:['维护阿基坦家族'], sourceType:'attested' }),
  };

  const titleHolders: Record<string,string> = Object.fromEntries(countyInputs.map(item => [`c_${item.id}`, item.holderId]));
  const titles: GameState['titles'] = {
    d_brittany:{id:'d_brittany',nameKey:'title.brittany',rank:'duchy',holderId:'char_conan',deJureLiegeId:'k_france',deFactoLiegeId:null,countyId:null,successionLaw:'partition'},
    d_normandy:{id:'d_normandy',nameKey:'title.normandy',rank:'duchy',holderId:'char_william',deJureLiegeId:'k_france',deFactoLiegeId:'k_france',countyId:null,successionLaw:'primogeniture'},
    k_france:{id:'k_france',nameKey:'title.france',rank:'kingdom',holderId:'char_philip',deJureLiegeId:null,deFactoLiegeId:null,countyId:null,successionLaw:'primogeniture'},
    k_england:{id:'k_england',nameKey:'title.england',rank:'kingdom',holderId:'char_harold',deJureLiegeId:null,deFactoLiegeId:null,countyId:null,successionLaw:'primogeniture'},
  };
  for (const county of countyInputs) titles[`c_${county.id}`] = { id:`c_${county.id}`, nameKey:`county.${county.id}`, rank:'county', holderId:titleHolders[`c_${county.id}`], deJureLiegeId:county.deJureLiegeId, deFactoLiegeId:county.deJureLiegeId, countyId:county.id, successionLaw:'partition' };

  const counties: GameState['counties'] = {};
  const locations: GameState['locations'] = {};
  for (const input of countyInputs) {
    const locationIds = [`loc_${input.id}_castle`,`loc_${input.id}_town`,`loc_${input.id}_abbey`];
    if (['nantes','broerec','rouen','avranches','eu','leon'].includes(input.id)) locationIds.push(`loc_${input.id}_port`);
    counties[input.id] = { id:input.id,nameKey:`county.${input.id}`,originalName:input.originalName,titleId:`c_${input.id}`,polygon:input.polygon,centroid:input.centroid,adjacentCountyIds:input.adjacent,locationIds,controllerTitleId:`c_${input.id}`,occupation:null,control:100,terrain:input.terrain,development:Math.round(input.tax*4),baseTax:input.tax,baseLevies:input.levies,buildingIds:[] };
    const [x,y] = input.centroid;
    locations[locationIds[0]]={id:locationIds[0],countyId:input.id,nameKey:`${t(`county.${input.id}`)}城堡`,kind:'castle',position:[x,y]};
    locations[locationIds[1]]={id:locationIds[1],countyId:input.id,nameKey:`${t(`county.${input.id}`)}市镇`,kind:'city',position:[x+10,y+13]};
    locations[locationIds[2]]={id:locationIds[2],countyId:input.id,nameKey:`${t(`county.${input.id}`)}修道院`,kind:'temple',position:[x-11,y+14]};
    if (locationIds[3]) locations[locationIds[3]]={id:locationIds[3],countyId:input.id,nameKey:`${t(`county.${input.id}`)}港`,kind:'port',position:[x-15,y-11]};
  }

  const characterResources: GameState['characterResources'] = {};
  for (const person of Object.values(C)) {
    const countiesHeld = person.titleIds.filter(id => id.startsWith('c_')).length;
    characterResources[person.id] = { gold: person.id==='char_conan'?180:60+countiesHeld*35, prestige: person.id==='char_conan'?320:80+person.titleIds.length*50, piety: person.traits.includes('神职')?260:40, levies: 250+countiesHeld*420, income: 1.5+countiesHeld*2 };
  }
  characterResources.char_conan={gold:180,prestige:320,piety:55,levies:1400,income:5.5};

  return GameStateSchema.parse({
    schemaVersion:2, saveId:`brittany-sandbox-${seed}`, revision:0, rngState:seed,
    contentPackIds:['ck.core','ck.sandbox.brittany1066'], contentPackVersions:{'ck.core':'2.0.0','ck.sandbox.brittany1066':'2.0.0'},
    clock:{date:'1066-09-15',segment:'morning'}, currentDate:'1066-09-15', nextRegularPulseAt:'1066-09-22', worldActionCredit:0,
    playerCharacterId:'char_conan', regentId:null, activeTravelId:null,
    resources:{gold:180,prestige:320,piety:55,legitimacy:58,stress:20,levies:1400}, characterResources, settings:{},
    characters:C,titles,counties,locations,
    knowledge:{fact_jean_rebel:{id:'fact_jean_rebel',subjectId:'char_jean_dol',predicate:'organized_faction',value:true,certainty:'confirmed',sourceId:'council',observedAt:'1066-09-15',visibility:'public'}}, memories:{},relationshipModifiers:[],promises:{},supportCommitments:{},
    factions:{faction_liberty:{id:'faction_liberty',nameKey:'faction.liberty',kind:'liberty',leaderId:'char_jean_dol',memberIds:['char_jean_dol','char_rhiwallon'],targetId:'char_conan',issueId:'ducal_authority',power:67,threshold:60,deadline:'1066-09-29',status:'organizing',createdAt:'1066-09-01'}},
    activities:{activity_feast_nantes_1066:{id:'activity_feast_nantes_1066',type:'feast',hostId:'char_hoel',participantIds:['char_hoel','char_hawise','char_isabeau'],invitedIds:['char_conan','char_geoffroy','char_morvan'],locationId:'loc_nantes_castle',phase:'planned',startedAt:'1066-09-20',endsAt:null,status:'planned',intent:'political_reconciliation',memoryIds:[]}},
    communications:{},travels:{},projects:{},wars:{},
    council:{
      council_chancellor:{id:'council_chancellor',liegeId:'char_conan',kind:'chancellor',holderId:'char_yves',task:'改善封臣关系',appointedAt:'1066-09-15'},
      council_marshal:{id:'council_marshal',liegeId:'char_conan',kind:'marshal',holderId:'char_alan',task:'组织军队',appointedAt:'1066-09-15'},
      council_steward:{id:'council_steward',liegeId:'char_conan',kind:'steward',holderId:'char_guethenoc',task:'管理亲领',appointedAt:'1066-09-15'},
      council_spymaster:{id:'council_spymaster',liegeId:'char_conan',kind:'spymaster',holderId:null,task:null,appointedAt:null},
      council_chaplain:{id:'council_chaplain',liegeId:'char_conan',kind:'chaplain',holderId:'char_mael',task:'宗教关系',appointedAt:'1066-09-15'},
      council_regent:{id:'council_regent',liegeId:'char_conan',kind:'regent',holderId:null,task:null,appointedAt:null},
    },
    contracts:{
      contract_hoel:{id:'contract_hoel',liegeId:'char_conan',vassalId:'char_hoel',taxLevel:'normal',levyLevel:'normal',privileges:[],modifiedAt:'1066-09-15'},
      contract_geoffroy:{id:'contract_geoffroy',liegeId:'char_conan',vassalId:'char_geoffroy',taxLevel:'normal',levyLevel:'high',privileges:[],modifiedAt:'1066-09-15'},
      contract_morvan:{id:'contract_morvan',liegeId:'char_conan',vassalId:'char_morvan',taxLevel:'low',levyLevel:'high',privileges:['local_command'],modifiedAt:'1066-09-15'},
    },
    claims:{
      claim_william_england:{id:'claim_william_england',claimantId:'char_william',titleId:'k_england',strength:'pressed',inherited:true,createdAt:'1066-01-05'},
      claim_hawise_brittany:{id:'claim_hawise_brittany',claimantId:'char_hawise',titleId:'d_brittany',strength:'implicit',inherited:true,createdAt:'1066-09-15'},
      claim_geoffroy_brittany:{id:'claim_geoffroy_brittany',claimantId:'char_geoffroy',titleId:'d_brittany',strength:'weak',inherited:true,createdAt:'1066-09-15'},
      claim_conan_avranches:{id:'claim_conan_avranches',claimantId:'char_conan',titleId:'c_avranches',strength:'weak',inherited:false,createdAt:'1066-09-15'},
      claim_geoffroy_rennes:{id:'claim_geoffroy_rennes',claimantId:'char_geoffroy',titleId:'c_rennes',strength:'weak',inherited:true,createdAt:'1066-09-15'},
    },
    marriages:{
      marriage_hoel_hawise:{id:'marriage_hoel_hawise',partnerIds:['char_hoel','char_hawise'],status:'married',allianceIds:['alliance_cornouaille_rennes'],createdAt:'1058-01-01',resolvedAt:'1058-01-01'},
      marriage_william_matilda:{id:'marriage_william_matilda',partnerIds:['char_william','char_matilda'],status:'married',allianceIds:['alliance_normandy_flanders'],createdAt:'1051-01-01',resolvedAt:'1051-01-01'},
      marriage_philip_bertha:{id:'marriage_philip_bertha',partnerIds:['char_philip','char_bertha'],status:'married',allianceIds:[],createdAt:'1064-01-01',resolvedAt:'1064-01-01'},
      marriage_mortain:{id:'marriage_mortain',partnerIds:['char_robert_mortain','char_emma_mortain'],status:'married',allianceIds:[],createdAt:'1058-01-01',resolvedAt:'1058-01-01'},
      marriage_anjou:{id:'marriage_anjou',partnerIds:['char_geoffrey_anjou','char_ermengarde'],status:'married',allianceIds:[],createdAt:'1060-01-01',resolvedAt:'1060-01-01'},
    },
    succession:{
      succession_brittany:{titleId:'d_brittany',law:'partition',heirIds:['char_hawise','char_alan_iv'],updatedAt:'1066-09-15'},
      succession_normandy:{titleId:'d_normandy',law:'primogeniture',heirIds:['char_robert_curthose'],updatedAt:'1066-09-15'},
      succession_france:{titleId:'k_france',law:'primogeniture',heirIds:[],updatedAt:'1066-09-15'},
    },
    externalRealms:{
      realm_england:{id:'realm_england',nameKey:'external.england',rulerId:'char_harold',heirId:null,strength:8200,stability:54,stanceToPlayer:'neutral',warSummary:'诺曼宣称正在形成',pressure:78,lastSimulatedAt:'1066-09-15'},
      realm_france:{id:'realm_france',nameKey:'external.france',rulerId:'char_philip',heirId:null,strength:6500,stability:61,stanceToPlayer:'wary',warSummary:null,pressure:35,lastSimulatedAt:'1066-09-15'},
      realm_flanders:{id:'realm_flanders',nameKey:'external.flanders',rulerId:'char_baldwin',heirId:null,strength:4200,stability:77,stanceToPlayer:'neutral',warSummary:null,pressure:22,lastSimulatedAt:'1066-09-15'},
      realm_aquitaine:{id:'realm_aquitaine',nameKey:'external.aquitaine',rulerId:'char_guillaume_aquitaine',heirId:null,strength:5800,stability:70,stanceToPlayer:'neutral',warSummary:null,pressure:12,lastSimulatedAt:'1066-09-15'},
      realm_scotland:{id:'realm_scotland',nameKey:'external.scotland',rulerId:'char_malcolm',heirId:null,strength:3900,stability:58,stanceToPlayer:'neutral',warSummary:null,pressure:18,lastSimulatedAt:'1066-09-15'},
      realm_papacy:{id:'realm_papacy',nameKey:'external.papacy',rulerId:'char_mael',heirId:null,strength:1200,stability:80,stanceToPlayer:'neutral',warSummary:null,pressure:15,lastSimulatedAt:'1066-09-15'},
    },
    situations:{situation_liberty_1066:{id:'situation_liberty_1066',definitionId:'situation.liberty_crisis_1066',nameKey:'situation.liberty',participantIds:['char_conan','char_jean_dol','char_hoel','char_geoffroy','char_morvan'],phase:'organizing',startedAt:'1066-09-15',deadline:'1066-09-29',status:'active',metrics:{requiredSupport:2,currentSupport:0,factionPower:67},flags:{feastOptional:true},resolution:null,sourcePackId:'ck.sandbox.brittany1066'}},
    pendingEvents:{},
    notifications:{
      alert_liberty:{id:'alert_liberty',kind:'situation',title:'降权派系正在组织',body:'多勒集团将在两周内提出限制公爵权力的最后通牒。赴宴只是其中一种解决方式。',createdAt:'1066-09-15',severity:'danger',relatedIds:['situation_liberty_1066','faction_liberty'],read:false},
      alert_spymaster:{id:'alert_spymaster',kind:'task',title:'间谍总管职位空缺',body:'空缺职位会削弱秘密与阴谋防御。',createdAt:'1066-09-15',severity:'warning',relatedIds:['council_spymaster'],read:false},
      invite_feast:{id:'invite_feast',kind:'message',title:'南特宴会邀请',body:'霍埃尔邀请你在九月二十日赴南特。你可以赴宴，也可以完全忽略。',createdAt:'1066-09-15',severity:'info',relatedIds:['activity_feast_nantes_1066','char_hoel'],read:false},
    },
    interactions:{},signals:[],eventLog:[],
  });
}

export const countyIds = countyInputs.map(item=>item.id);
export const initialSandboxDate = '1066-09-15';
export const initialLibertyDeadline = addDays(initialSandboxDate, 14);
