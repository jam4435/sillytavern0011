# -*- coding: utf-8 -*-
import io, json, sys
sys.stdout.reconfigure(encoding='utf-8')
rows=json.load(io.open('../现有条目索引.json',encoding='utf-8'))
def cnt(k):
    return sum(1 for r in rows if k in (r.get('key') or '') or k in (r.get('cast') or '') or k in (r.get('summary') or '') or k in (r.get('detailHead') or ''))
for k in ['碧磷洞','桑土公','伏牛派','柯百岁','天灵千裂','椰花岛','采燕功','黎夫人','元元大师','七指头陀','大金刚拳','鲜卑','前燕','大燕','易大彪','榜文','破门','一百三十棍','燃木刀法','黄眉僧','石壁图像','十三绝','空棺']:
    print(k, cnt(k))