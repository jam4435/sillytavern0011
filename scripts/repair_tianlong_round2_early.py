raise SystemExit('一次性内容迁移已完成，禁止复跑；当前排期请使用 scripts/repair-tianlong-causal-timeline.mjs')

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
book = root / '世界书/金庸群侠传1/世界书'
cache = {}

def get(prefix):
    matches = list(book.glob(prefix + '*.yaml'))
    assert len(matches) == 1, (prefix, matches)
    path = matches[0]
    if path not in cache:
        cache[path] = json.loads(path.read_text(encoding='utf-8-sig'))
    return cache[path]

def replace_all(obj, old, new):
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = replace_all(v, old, new)
    elif isinstance(obj, list):
        obj = [replace_all(v, old, new) for v in obj]
    elif isinstance(obj, str):
        obj = obj.replace(old, new)
    return obj

def exp(j, person, key):
    return j['insert'][person]['人物经历'][key]

j = get('天龙第十三回01-')
replace_all(j, '蓦然得见容颜绝俗的王语嫣', '仍凝望方才在花树下见到的王语嫣')
replace_all(j, '在茶花树下蓦见王语嫣', '在茶花树下再望王语嫣')

j = get('天龙第十四回02-')
target = next(iter(get('天龙第十五回01-')['insert']['乔峰']['人物经历']))
j['后续事件'] = {target: '全冠清虽已被制，四大长老仍率众围聚，乔峰继续质询众人。'}

j = get('天龙第十五回01-')
replace_all(j, '全冠清按捺不住越众而出', '受制的全冠清仍出言煽动')
j = get('天龙第十五回02-')
replace_all(j, '神色阴冷地自丐帮人群中大步迈出', '虽气脉被封，仍在众人面前高声发难')
replace_all(j, '毅然迈步出列公开发难', '虽受制仍公开发难')
replace_all(j, '惊见全冠清越众发难', '听见受制的全冠清发难')
replace_all(j, '全冠清当众发难撕破脸皮', '全冠清虽被封住气脉仍当众发难')
j = get('天龙第十五回05-')
j['update']['乔峰'] = {'状态': '重伤'}
j = get('天龙第十五回06-')
j['事件详情'] = j['事件详情'].replace('此前失联的执法长老白世镜、传功长老吕章，携同', '此前失联的执法长老白世镜、传功长老吕章，与徐长老携同')
j['insert']['徐长老'] = {'人物经历': {next(iter(j['insert']['乔峰']['人物经历'])): '率武林宿老抵达杏林，见乔峰负伤、长老伏罪，准备就先帮主遗命质询。'}}
j = get('天龙第十六回01-')
j['insert']['徐长老'] = {'重要物品': {'染血青布帕': '马大元遗物', '漆黑蜡丸': '封存遗书箱匙的蜡丸'}, '人物经历': {next(iter(j['insert']['康敏']['人物经历'])): '接过马夫人呈交的血帕与蜡丸，准备核验遗书。'}}
j = get('天龙第十六回02-')
j['update']['乔峰'] = {'关系网': {'徐长老': '信任破裂/20'}}
j['update']['徐长老'] = {'重要物品': {'汪剑通绝密遗书': '已拆封的防辽共诛遗命密函'}, '关系网': {'乔峰': '胡虏仇防/10'}}
get('天龙第十六回04-')['update'].pop('智光', None)

j = get('天龙第二十回07-')
j['事件地点'] = '大宋/信阳府/客栈'
j['事件引子'] = '客栈灯影摇曳，阿朱独自思索身世与乔峰的复仇誓言。'
j['事件详情'] = '阿朱从金锁与锦帕辨知自己的身世，想到乔峰誓杀段正淳，心中痛苦难当。生父与爱侣之间，她既不愿任何一人丧命，也不敢轻易吐露真相。她反复思索如何化解仇怨，决定先随乔峰寻访段正淳，再见机劝阻这场可能发生的厮杀。'
j['事件概要'] = '阿朱获知身世后陷入两难，忧虑乔峰与生父相残，决定同行寻访并设法劝阻。'
key = next(iter(j['insert']['阿朱']['人物经历']))
j['insert']['阿朱']['人物经历'][key] = '辨知段正淳是生父，忧虑乔峰复仇伤及父亲与自身，反复思索如何保全二人，决定同行并见机劝阻。'
j['后续事件'] = {next(iter(get('天龙第二十一回01-')['insert']['阿紫']['人物经历'])): '阿朱与乔峰尚在寻访段正淳，另一边阿紫携神木王鼎来到小镜湖。'}

j = get('天龙第二十二回04-')
replace_all(j, '恳请乔峰答应今后无论如何都莫要伤害其父段正淳。', '恳请乔峰莫伤害其父段正淳，并托他日后照顾妹妹阿紫。')
replace_all(j, '含泪苦求乔大哥莫再伤害生父，终', '含泪苦求乔大哥莫再伤害生父，并托付他照顾妹妹阿紫，终')
replace_all(j, '并苦求乔峰莫加害其父。', '并苦求乔峰莫加害其父、照顾妹妹阿紫。')
j = get('天龙第二十二回07-')
replace_all(j, '青石桥边的惨烈痕迹、横死在地的阿朱以及新建的凄凉坟茔', '青石桥边的惨烈痕迹和阿朱新建的凄凉坟茔')
replace_all(j, '亲眼看到自己的亲姐姐惨死在乔峰掌下', '得知自己的亲姐姐惨死在乔峰掌下')
replace_all(j, '惊见亲姐横死新坟', '得知亲姐惨死，见其新坟')

j = get('天龙第二十三回01-')
replace_all(j, '携重伤初愈的阿紫', '携阿紫')
j = get('天龙第二十三回06-')
j['事件详情'] += '混乱中数只毒蚁反噬阿紫，咬伤了她的手腕；她强忍疼痛继续逼供，毒素已悄然侵入体内。'
j['事件概要'] += '混乱间毒蚁反噬阿紫，她手腕受咬中毒。'
key = next(iter(j['insert']['阿紫']['人物经历']))
j['insert']['阿紫']['人物经历'][key] += '混乱间被毒蚁咬伤手腕，毒素侵入体内。'
j['update']['阿紫'] = {'状态': '毒蚁咬伤中毒'}
j = get('天龙第二十三回09-')
replace_all(j, '此前被星宿派毒掌所伤，体内剧毒与阴寒内劲交织反噬', '先前被毒蚁咬伤，体内毒素发作')
replace_all(j, '体内剧毒与阴寒内劲反噬交织', '毒蚁咬伤后毒素发作')
j = get('天龙第二十六回08-')
replace_all(j, '向丐帮执掌刑罚的白世镜追问蛛丝马迹', '继续搜寻雁门关旧案的其他线索')
replace_all(j, '向玄慈方丈与白世镜查证旧事', '向玄慈方丈查证旧事并寻找其他线索')

j = get('天龙第七回04-')
replace_all(j, '当夜', '傍晚')
j = get('天龙第十二回02-')
j['事件详情'] = '宾主在听香水榭歇宿一夜，次日，' + j['事件详情']
j['事件引子'] = '一夜过去，听香水榭中宾客仍在，阿朱暗中筹备营救。' + j['事件引子']
j = get('天龙第十七回01-')
replace_all(j, '众人无力抵御尽数受制被擒，随后被西夏军士以牛皮索反剪串联，悉数押往天宁寺囚禁', '群丐及阿朱、阿碧等人无力抵御被擒，随后被西夏军士押往天宁寺；王语嫣虽中毒倒地，尚未被押走')
replace_all(j, '杏林群雄悉数遭擒押往天宁寺', '杏林群丐及阿朱、阿碧遭擒押往天宁寺')

aliases = {}
for n, dest in [('03', '天龙第十五回05-'), ('04', '天龙第十五回06-'), ('05', '天龙第十六回07-'), ('06', '天龙第十六回02-')]:
    source = list(book.glob('天龙第十四回' + n + '-*.yaml'))
    target = list(book.glob(dest + '*.yaml'))
    assert len(source) == len(target) == 1
    aliases[source[0].stem] = target[0].stem
    source[0].unlink()

for path, data in cache.items():
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
out = root / 'scripts/data/tianlong-round2-early-aliases.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(aliases, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
