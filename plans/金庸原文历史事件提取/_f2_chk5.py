
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for ln in [16192,16168]:
    print(ln, lines[ln-1][:400])
