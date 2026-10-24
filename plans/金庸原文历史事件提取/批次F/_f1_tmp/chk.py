import re, collections
t = open('批次F/F1-笑傲第1-20回.md', encoding='utf-8').read()
bad = re.findall(r"EV-笑傲-\?\?\?\?\(([A-Za-z0-9]+)\)", t)
print(collections.Counter(bad))
