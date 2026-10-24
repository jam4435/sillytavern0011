
# -*- coding: utf-8 -*-
import io
head = io.open('批次D/_d2_tmp/head.md', encoding='utf-8').read()
main = io.open('批次D/_d2_tmp/main.md', encoding='utf-8').read()
tail = io.open('批次D/_d2_tmp/tail.md', encoding='utf-8').read()
io.open('批次D/D2-神雕第21-40回.md','w',encoding='utf-8').write(head + '\n' + main + '\n' + tail)
print('written')
