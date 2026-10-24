
import json,io,sys
d=json.load(open('现有条目索引.json',encoding='utf-8'))
keys=['笑傲第三十回01','笑傲第三十五回08','笑傲第九回03','笑傲第三回01','笑傲第二十八回02','笑傲第二十九回05','笑傲第三十一回04','笑傲第三十二回06','笑傲第三十六回10','笑傲第二十二回05','笑傲第二十一回03','笑傲第二十七回02']
out=io.open('_f2_full.txt','w',encoding='utf-8')
for k in keys:
    for e in d:
        if e['key'].startswith(k):
            out.write('=== %s\nSummary: %s\nDetail: %s\n\n'%(e['key'],e.get('summary',''),e.get('detailHead','')))
out.close()
print('ok')
