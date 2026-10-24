
# -*- coding: utf-8 -*-
import os, io
d = '批次D/_d2_tmp/cards'
plan = [
 ('051','cien_chujia'),('052','cien_10nian'),('053','cien_shamen'),('054','cien_yangguo_xiangfu'),
 ('055','qiuchi_qiujin'),('056','rouer'),('057','lveduo_jiefu'),('058','lveduo_zijin'),
 ('059','yilinmochou_die'),('060','juedan_duan'),('061','qiuchi_gongshun_zhisi'),('062','limochou_si'),
 ('063','duanchangcao'),('064','yinggu_yuanqi'),('065','cien_zhongshang'),('066','cien_qiushu'),
 ('067','yinggu_buyuan'),
]
# find each key's file
files = {}
for f in os.listdir(d):
    if not f.endswith('.md') or f.startswith('_'): continue
    key = f.split('_',1)[1][:-3]
    files[key] = f
# two-phase rename to avoid collisions
tmp = []
for i,(num,key) in enumerate(plan):
    src = os.path.join(d, files[key])
    dst = os.path.join(d, 'tmp_rn_%02d.md' % i)
    os.rename(src, dst)
    tmp.append((dst, os.path.join(d, '%s_%s.md' % (num,key))))
for a,b in tmp:
    os.rename(a,b)
for num,key in plan:
    print(num, key, os.path.exists(os.path.join(d,'%s_%s.md'%(num,key))))
