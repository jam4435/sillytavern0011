
import re,io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
KW = ['当年','那时','那时候','从前','往年','早年','少年','年轻','小时候','自幼','记得','回忆','往事','旧事','旧日','昔日','当初','本来','原来','曾经','曾听','师父说','师祖','祖师','遗命','遗嘱','临死','死前','身世','秘密','真相','竟是','不料','才知','方知','后来','此后','其后','传说','据说','相传','听说','收为','门下','师父','师哥','师姊','师兄','师妹','师弟','前辈','掌门','教主','篡位','失踪','囚','禁闭','拜师','入门','立誓','发誓','决意','为了','只因','许久','多年','这些年来','向来','历来','早已','先后','起先','先是','随即','终于','为此','险些','几乎']
pat=re.compile('|'.join(KW))
ch=[l.strip().split('|') for l in io.open('章节索引.tsv',encoding='utf-8') if l.startswith('笑傲江湖')]
tot=0
for x in ch:
    s=int(x[1])
    if not (21<=s<=40): continue
    a,b=map(int,x[4].split('-'))
    idx=[i for i in range(a,b+1) if i-1<len(lines) and pat.search(lines[i-1])]
    win=set()
    for i in idx:
        for j in range(i-4,i+5): win.add(j)
    chars=sum(len(lines[j-1]) for j in win if 1<=j<=len(lines))
    tot+=chars
    print(s, x[3], a,b,'hit',len(idx),'win',len(win),'chars',chars)
print('TOTAL chars',tot)
