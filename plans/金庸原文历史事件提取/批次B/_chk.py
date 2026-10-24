import re
bounds = [(17436,17856,'四十'),(17857,18263,'四十一'),(18264,18674,'四十二'),(18675,19093,'四十三'),
          (19094,19546,'四十四'),(19547,19997,'四十五'),(19998,20518,'四十六'),(20519,20855,'四十七'),
          (20856,21376,'四十八'),(21377,21793,'四十九'),(21794,22332,'五十')]
def chap(n):
    for a,b,c in bounds:
        if a <= n <= b: return c
    return '?'
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
cards = [(m.group(1), m.group(2)) for m in re.finditer(r'### (EV-天龙-(\d{4}))[^\n]*\n(.*?)(?=\n### |\n---)', t, re.S)]
print('cards', len(cards))
nums = [int(c[0].split('-')[-1]) for c in cards]
print('range', nums[0], nums[-1], 'gaps', [(a,b) for a,b in zip(nums,nums[1:]) if b != a+1])
bad = []
for eid, body in cards:
    line = re.search(r'^- 原文位置: (.+)$', body, re.M).group(1)
    m = re.match(r'《天龙八部》第([一二三四五六七八九十]+)回[^｜]*｜行 (\d+)(?:-(\d+))?（命中行 (\d+)）$', line)
    if not m:
        bad.append((eid, 'FORMAT', line[:70])); continue
    claim, a, b, hit = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2)), int(m.group(4))
    if not (claim == chap(a) == chap(b) == chap(hit)):
        bad.append((eid, 'CHAPTER', line[:60], chap(a), chap(hit)))
print('problems', len(bad))
for x in bad: print(' ', x)
open('/tmp/nums.txt','w').write(','.join(str(n) for n in nums))
