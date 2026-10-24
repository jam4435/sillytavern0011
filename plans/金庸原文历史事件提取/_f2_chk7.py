
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for kw in ['白板煞星','岱宗如何','黑木令']:
    hs=[i+1 for i,l in enumerate(lines) if kw in l]
    print('##',kw,hs)
    for h in hs[:6]:
        t=lines[h-1]; i=t.find(kw)
        print('  ',h,repr(t[max(0,i-25):i+35]))
