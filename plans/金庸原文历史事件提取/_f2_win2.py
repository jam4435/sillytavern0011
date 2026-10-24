
import re,io,sys
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
KW = ['当年','那时候','从前','昔日','早年','少年之时','少年时','小时候','自幼','往事','旧事','旧日','当初','起先','后来','此后','其后','传说','据说','相传','听说','数百年前','百余年前','数十年前','二十五年','十二年','这些年来','多年来','向来','历来','拜师','收为','入门','立誓','重誓','遗命','遗嘱','临死','临终','死前','身世','秘密','真相','已死','逝世','亡故','传书','传授','窃','偷','盗','篡位','失踪','囚禁','囚于','关在','幽禁','禁闭','接任','继任','掌门之位','教主之位','祖师','师祖','开派','创立','创派','自尽','自杀','殉','害死','杀死','所杀','死于','丧命','受伤','断腿','残废','逐出','开革','背叛','叛','认错','误会','解破','缺陷','隐患','走火入魔','反噬']
pat=re.compile('|'.join(KW))
a,b=int(sys.argv[1]),int(sys.argv[2])
marks=[i for i in range(a,b+1) if pat.search(lines[i-1])]
blocks=[]
for i in marks:
    s,e=i-4,i+4
    if blocks and s<=blocks[-1][1]+1: blocks[-1][1]=max(blocks[-1][1],e)
    else: blocks.append([s,e])
a2=max(a,1); tot=0
for s,e in blocks:
    s=max(s,a); e=min(e,b)
    tot+=e-s+1
    for j in range(s,e+1):
        if j<len(lines): print('%d|%s'%(j,lines[j-1]))
    print('...')
print('## blocks',len(blocks),'lines',tot,file=sys.stderr)
