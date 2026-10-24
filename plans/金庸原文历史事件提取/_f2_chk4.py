
import io
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
tests=['红叶禅师参究多年，直到逝世，始终就没起始练宝典中所载的武功。',
'这辟邪剑谱的第一道法诀，便是：‘武林称雄，挥剑自宫’。',
'‘负心薄幸，好色无厌’这八个字了',
'白板煞星’是个大恶人',
'数千人聚集五霸冈',
'累她死后在地狱中受苦，我如何对得住她？因此我去做了和尚。']
for t in tests:
    print([i+1 for i,l in enumerate(lines) if t in l][:5], t[:24])
