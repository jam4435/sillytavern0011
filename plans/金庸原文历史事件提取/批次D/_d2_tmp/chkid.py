
import io, re
t = io.open('批次D/D2-神雕第21-40回.md', encoding='utf-8').read()
ids = re.findall(r'^### (EV-神雕-\d{4})', t, re.M)
print(ids[0], ids[1], ids[-1])
