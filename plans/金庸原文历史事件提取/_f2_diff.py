
import json,io
d=json.load(open('现有条目索引.json',encoding='utf-8'))
KW=['葵花宝典','辟邪剑谱','林远图','渡元','红叶','岳肃','蔡子峰','气宗','剑宗','风清扬','任我行','东方不败','吸星大法','梅庄','向问天','三尸脑神丹','杨莲亭','童百熊','左冷禅','五岳并派','五岳派','封禅台','岳不群','定闲','定逸','定静','恒山','仪琳','不戒','田伯光','哑婆婆','劳德诺','林平之','岳灵珊','余沧海','木高峰','长青子','黑木令','千秋万载','林震南','福威镖局','令狐冲']
out=io.open('_f2_diff.txt','w',encoding='utf-8')
for k in KW:
    hits=[e for e in d if k in (e.get('key','')+e.get('summary','')+e.get('detailHead','')+e.get('cast',''))]
    out.write('### %s  hits=%d\n'%(k,len(hits)))
    for e in hits[:14]:
        out.write('  - %s | cast=%s | %s\n'%(e['key'], e.get('cast','')[:30], e.get('summary','')[:70]))
out.close()
print('done')
