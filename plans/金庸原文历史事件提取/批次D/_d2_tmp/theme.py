
# -*- coding: utf-8 -*-
import io, re, json, collections
LINES = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
N = len(LINES)
chap = []
for row in io.open('章节索引.tsv', encoding='utf-8'):
    f = row.rstrip('\n').split('|')
    if f[0]=='神雕侠侣':
        a,b = f[4].split('-')
        chap.append((int(f[1]), f[3], int(a), int(b)))
def chapof(i):
    for s,t,a,b in chap:
        if a <= i <= b: return (s,t)
    return (0,'')
GROUPS = {
 '公孙止裘千尺': ['公孙止','裘千尺','绝情谷','绝情丹','鳄鱼','渔网阵','公孙绿萼'],
 '裘千仞慈恩': ['裘千仞','慈恩','铁掌','一灯','瑛姑','周伯通','段智兴','天龙寺','渔樵耕读'],
 '九阴真经古墓': ['九阴真经','玉女心经','古墓','活死人墓','王重阳','林朝英','石壁','重阳宫','全真'],
 '杨过断臂小龙女': ['断臂','小龙女','南海神尼','情花','十六年','玉蜂','守宫砂'],
 '郭襄郭破虏': ['郭襄','郭破虏','黄蓉','襄阳','郭芙','耶律齐'],
 '觉远张君宝': ['觉远','张君宝','少林','楞伽经','九阳真经','无色','天鸣','罗汉堂','达摩','尹克西','潇湘子'],
 '蒙古阵营': ['金轮法王','法王','尼摩星','尹克西','潇湘子','马光佐','达尔巴','霍都','蒙古','忽必烈','大汗','蒙哥'],
 '其他旧事': ['独孤求败','剑冢','神雕','大雕','五绝','东邪','西毒','南帝','北丐','中神通','华山论剑','洪七公','欧阳锋','黄药师','一阳指','先天功','蛤蟆功'],
}
out = io.open('批次D/_d2_tmp/theme_index.txt','w',encoding='utf-8')
for g, ks in GROUPS.items():
    ls = sorted({i for i in range(6876,14341) for k in ks if k in LINES[i-1]})
    clusters = []
    for x in ls:
        if clusters and x - clusters[-1][1] <= 12:
            clusters[-1][1] = x
        else:
            clusters.append([x,x])
    tot = sum(b-a+1 for a,b in clusters)
    out.write('## %s  hitlines=%d  clusters=%d  clusterspan=%d\n' % (g, len(ls), len(clusters), tot))
    for a,b in clusters:
        s,t = chapof(a)
        out.write('  %d-%d (%d) 第%d回 %s\n' % (a,b,b-a+1,s,t))
out.close()
print('ok')
