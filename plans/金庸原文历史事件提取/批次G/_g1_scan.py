# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout.reconfigure(encoding='utf-8')
nov = open('原文UTF8/鹿鼎记.txt', encoding='utf-8').read().split('\n')
MARK = ['当年','从前','那时','当年间','原来','据说','听说','相传','昔日','起先','本来','先是','后来','从前','曾','自小','幼时','小时候','二十年前','十年前','数十年','多年','日前','上个月','去年','前年','崇祯','顺治','康熙','太祖','太宗','世祖','鳌拜','多尔衮','洪承畴','吴三桂','史可法','明史','庄廷','查继佐','吕留良','顾炎武','黄宗羲','陈近南','陈永华','天地会','沐王府','李自成','吴六奇','董鄂','端敬','清凉寺','五台山','出家','文字狱','降清','归降','入关','摄政','康熙','小皇帝','鳌少保']
# chapter ranges 1-17
rng=[(32,376),(377,899),(900,1190),(1191,1527),(1528,2062),(2063,2495),(2496,2908),(2909,3225),(3226,3762),(3763,4313),(4314,4634),(4635,5047),(5048,5652),(5653,6177),(6178,6712),(6713,7229),(7230,7692)]
for i,(a,b) in enumerate(rng,1):
    hits=[]
    for n in range(a,b+1):
        t=nov[n-1]
        if any(m in t for m in MARK):
            hits.append(n)
    # cluster
    clusters=[]
    for n in hits:
        if clusters and n-clusters[-1][-1]<=3: clusters[-1].append(n)
        else: clusters.append([n])
    cov=sum(c[-1]-c[0]+1 for c in clusters)
    print('CH%02d %d-%d lines=%d hitlines=%d clusters=%d covLines=%d'%(i,a,b,b-a+1,len(hits),len(clusters),cov))
