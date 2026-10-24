
# -*- coding: utf-8 -*-
import json, io, sys
d = json.load(open('现有条目索引.json', encoding='utf-8'))
def show(kws, n=12, w=90):
    out = []
    for r in d:
        blob = r.get('key','')+'|'+r.get('cast','')+'|'+r.get('summary','')+'|'+r.get('detailHead','')
        if any(k in blob for k in kws):
            out.append(r)
    print('### %s  hits=%d' % ('/'.join(kws), len(out)))
    for r in out[:n]:
        print('   - %s | %s' % (r['key'], r['summary'][:w]))
    if len(out) > n: print('   ... (%d more)' % (len(out)-n))
groups = [
 ['上天梯','马钰'],
 ['拖雷'],
 ['潇湘子'],
 ['烟雨楼'],
 ['丘处机','成吉思汗'],
 ['彩雪蛛'],
 ['左右互搏','分心二用'],
 ['七星聚会','天罡北斗'],
 ['孙婆婆'],
 ['王重阳','林朝英'],
 ['寒玉'],
 ['耶律齐'],
 ['铁掌帮'],
 ['情花'],
 ['柔儿'],
 ['断肠崖'],
 ['王惟忠','丁大全'],
 ['西山一窟鬼','史伯威'],
 ['君山'],
 ['南阳'],
 ['霍都'],
 ['沙通天','彭连虎','灵智上人'],
 ['华山论剑'],
 ['楞伽','九阳'],
 ['羊祜'],
 ['拔都','蒙哥'],
 ['独孤求败'],
 ['绿萼'],
 ['一灯'],
 ['周伯通'],
]
for g in groups:
    show(g)
