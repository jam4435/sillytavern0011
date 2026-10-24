
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
t=lines[16191]
i=t.find('负心薄幸，好色无厌')
print(repr(t[i-20:i+20]))
for c in t[i-3:i+20]:
    print(hex(ord(c)), c)
