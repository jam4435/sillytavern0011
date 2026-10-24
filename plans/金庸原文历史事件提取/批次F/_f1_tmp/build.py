import re
parts = []
for name in ['p1','p2','p3','p4']:
    parts.append(open('批次F/_f1_tmp/%s.md' % name, encoding='utf-8').read())
all_text = "\n".join(parts)
all_text = re.sub(r"### EV-笑傲-@JIANQI@[\s\S]*?\n---\n", "", all_text)

# pass 1: assign ids in header order of first appearance
mapping = {}
for m in re.finditer(r"^### EV-笑傲-@([A-Za-z0-9]+)@", all_text, re.M):
    key = m.group(1)
    if key not in mapping:
        mapping[key] = "EV-笑傲-%04d" % (len(mapping) + 1)

# pass 2: replace everything
def repl(m):
    key = m.group(1)
    return mapping.get(key, "EV-笑傲-????(" + key + ")")
all_text = re.sub(r"EV-笑傲-@([A-Za-z0-9]+)@", repl, all_text)
open('批次F/F1-笑傲第1-20回.md', 'w', encoding='utf-8').write(all_text)

heads = re.findall(r"^### (EV-笑傲-\d{4}) · ", all_text, re.M)
print('headers', len(heads), 'unique ids', len(set(heads)), 'mapping', len(mapping))
print('unresolved', len(re.findall(r"\?\?\?\?", all_text)))
# check referenced ids exist
refs = set(re.findall(r"EV-笑傲-(\d{4})", all_text))
print('ids referenced/defined total', len(refs), 'defined', len(set(heads)))
missing = sorted(refs - set(re.findall(r"EV-笑傲-(\d{4})", all_text)[:0]) - set(x[-4:] for x in heads))
print('dangling count', len(missing), missing[:20])
# duplicate numbers?
import collections
c = collections.Counter(heads)
print('dups', [k for k,v in c.items() if v>1])
