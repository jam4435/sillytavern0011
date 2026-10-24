
# -*- coding: utf-8 -*-
import os, io, shutil
d = '批次D/_d2_tmp/cards'
order = [
 'rouer','lveduo_jiefu','qiuchi_qiujin',
 'cien_chujia','cien_10nian','cien_shamen','cien_yangguo_xiangfu','cien_zhongshang','cien_qiushu',
 'yinggu_buyuan','yinggu_yuanqi',
 'yilinmochou_die','juedan_duan','duanchangcao','lveduo_zijin','qiuchi_gongshun_zhisi','limochou_si',
]
# map current filenames to keys
cur = {}
for f in os.listdir(d):
    if not f.endswith('.md') or f.startswith('_'): continue
    key = f.split('_',1)[1][:-3]
    cur.setdefault(key, []).append(f)
for k in order:
    print(k, cur.get(k))
