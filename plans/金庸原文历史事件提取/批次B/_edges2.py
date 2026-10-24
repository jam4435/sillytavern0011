import re, json
t = open('批次B/B4-天龙第41-50回.md', encoding='utf-8').read()
ms = list(re.finditer(r'### (EV-天龙-(\d{4})) · ([^\n]*)\n((?:(?!\n### |\n## ).)*?)(?=\n### |\n## |\Z)', t, re.S))
out = {}
for m in ms:
    body = m.group(4)
    pre = re.search(r'^- 前因: (.+)$', body, re.M)
    con = re.search(r'^- 后果: (.+)$', body, re.M)
    out[m.group(2)] = (m.group(3)[:20], pre.group(1) if pre else '', con.group(1) if con else '')
for k in ['1720','1721','1722','1723','1724','1725','1726','1727','1728','1729','1730','1731','1732','1733','1734','1735','1736','1737','1738','1739','1740','1741','1742','1743','1744','1745','1746','1747','1748','1749','1750','1751','1752','1753','1754','1755','1756']:
    if k in out:
        print(k, out[k][0], '|前', out[k][1][:52], '|后', out[k][2][:52])
