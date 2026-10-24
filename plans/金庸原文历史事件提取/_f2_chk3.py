
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for n in [12959,15474,16200,15195,11189,11822]:
    pass
import re
for kw in ['红叶禅师参究','第一道法诀','负心薄幸，好色无厌','白板煞星','数千人聚集','因此我去做了和尚']:
    hits=[(i+1) for i,l in enumerate(lines) if kw in l]
    print('##',kw,hits[:5])
    for h in hits[:2]:
        t=lines[h-1]
        i=t.find(kw)
        print('   ',repr(t[max(0,i-40):i+60]))
