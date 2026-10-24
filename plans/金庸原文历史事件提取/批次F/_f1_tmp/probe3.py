t=open('批次F/F1-笑傲第1-20回.md',encoding='utf-8').read()
i=t.find('### EV-')
print(repr(t[i:i+80]))
print(len(t))
