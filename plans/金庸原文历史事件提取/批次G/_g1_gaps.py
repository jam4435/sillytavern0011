# -*- coding: utf-8 -*-
import re, sys
sys.stdout.reconfigure(encoding='utf-8')
nov = open('原文UTF8/鹿鼎记.txt', encoding='utf-8').read().split('\n')
MARK = ['当年','从前','那时','原来','据说','听说','相传','昔日','起先','本来','先是','后来','曾','自小','幼时','小时候','二十年前','十年前','数十年','多年','崇祯','顺治','康熙','太祖','太宗','世祖','鳌拜','多尔衮','洪承畴','吴三桂','史可法','明史','庄廷','查继佐','吕留良','顾炎武','黄宗羲','陈近南','陈永华','天地会','沐王府','李自成','吴六奇','董鄂','端敬','清凉寺','五台山','出家','文字狱','降清','入关','摄政','先帝','父皇','太后','老皇','神龙','海老公','小桂子','茅十八']
rng=[(32,376),(377,899),(900,1190),(1191,1527),(1528,2062),(2063,2495),(2496,2908),(2909,3225),(3226,3762),(3763,4313),(4314,4634),(4635,5047),(5048,5652),(5653,6177),(6178,6712),(6713,7229),(7230,7692)]
for i,(a,b) in enumerate(rng,1):
    marks=[n for n in range(a,b+1) if any(m in nov[n-1] for m in MARK)]
    # find gaps between marks > 35
    gaps=[]
    prev=a
    for n in marks:
        if n-prev>35: gaps.append((prev,n-1))
        prev=n
    if b+1-prev>35: gaps.append((prev,b))
    tot=sum(g[1]-g[0]+1 for g in gaps)
    print('CH%02d %d-%d gapLines=%d  gaps=%s'%(i,a,b,tot,gaps))
