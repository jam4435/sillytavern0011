lines=open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
for n in [300,5143,3053,2377,2742,2531,8334,2339,5292,543]:
    print(n, repr(lines[n-1][:200]))
