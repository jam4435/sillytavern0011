
import json, io, sys
d = json.load(open('旧事线索扫描.json', encoding='utf-8'))
sub = [x for x in d if x['book'] == '神雕侠侣' and 6876 <= x['line'] <= 14340]
out = io.open('批次D/_d2_tmp/clue_21_40.txt','w',encoding='utf-8')
from collections import Counter
c = Counter(x['chapter'] for x in sub)
out.write('TOTAL %d\n' % len(sub))
for k,v in sorted(c.items(), key=lambda t: str(t[0])):
    out.write('%s : %d\n' % (k, v))
out.write('----\n')
for x in sub:
    out.write('%d\t%s\t%s\n' % (x['line'], x['markers'], x['text'][:70]))
out.close()
print('ok')
