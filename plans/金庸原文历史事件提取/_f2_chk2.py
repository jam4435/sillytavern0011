
import json
d=json.load(open('现有条目索引.json',encoding='utf-8'))
for k in ['北冥神功','化功大法','逍遥派','星宿派','风清扬','剑宗','渡元','红叶','葵花宝典','林远图','自宫','挥剑自宫','三仙剑','寒冰真气','真武剑','太极拳经','不戒','哑婆婆','田伯光']:
    hits=[e['key'] for e in d if k in (e.get('key','')+e.get('summary','')+e.get('detailHead','')+e.get('cast',''))]
    print(k, len(hits), hits[:4])
