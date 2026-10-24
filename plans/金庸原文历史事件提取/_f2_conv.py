
import json,io
p='信息/武侠卡的预加入内容/预加入事件/笑傲江湖/笑傲第三十回01-方证冲虚悬空寺密议结盟.json'
d=json.load(io.open(p,encoding='utf-8'))
io.open('plans/金庸原文历史事件提取/_f2_ev30.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False,indent=1))
print(list(d)[:20])
