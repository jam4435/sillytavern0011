
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for ln in [14083,14500,16487]:
    t=lines[ln-1]
    for kw in ['白板煞星','岱宗如何','黑木令']:
        i=t.find(kw)
        if i>=0:
            print(ln, kw, [hex(ord(c)) for c in t[i-2:i+2]], repr(t[max(0,i-30):i+30]))
