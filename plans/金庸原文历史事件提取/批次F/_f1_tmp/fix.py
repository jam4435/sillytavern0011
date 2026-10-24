import re
t = open('批次F/F1-笑傲第1-20回.md', encoding='utf-8').read()
fix = {
 'JIAPU': '后文林平之在向阳巷老宅佛经中得袈裟（见 F2 段）',
 'ZIJUE': '后文林平之自宫练剑（见 F2 段）',
 'QIAO': '本文 EV-笑傲-0049（劳德诺推演辟邪剑法另有诀窍）',
 'LUOYANG': '本文 EV-笑傲-0121（王元霸与金刀门声势）',
 'ROUEN': '本文 EV-笑傲-0044（罗人杰反刺重伤者被诱杀）',
 'HUASHANRU': '后文岳不群收录林平之于门墙（第七回）',
 'YOUQING': '本文 EV-笑傲-0059（冲灵剑法与青梅竹马）',
 'POGUAN': '本文 EV-笑傲-0073（无招胜有招）',
 'QINPU2': '后文以曲谱赠绿竹翁之姑（第十三回）',
 'RENWOXING2': '后文任我行脱困复出（第二十二回，属 F2 段）',
 'ZUODA': '本文 EV-笑傲-0050（田伯光坐练刀法）',
}
def repl(m):
    key = m.group(1)
    return fix.get(key, '???')
t = re.sub(r"EV-笑傲-\?\?\?\?\(([A-Za-z0-9]+)\)", repl, t)
open('批次F/F1-笑傲第1-20回.md','w',encoding='utf-8').write(t)
print('remaining', len(re.findall(r"\?\?\?", t)))
# list cross refs to ids not defined as headers
heads = [h[-4:] for h in re.findall(r"^### (EV-笑傲-\d{4}) · ", t, re.M)]
refs = set(re.findall(r"EV-笑傲-(\d{4})", t))
print('dangling', sorted(refs - set(heads)))
