
# -*- coding: utf-8 -*-
import io, re
body = io.open('批次D/_d2_tmp/body.md', encoding='utf-8').read()
open('批次D/_d2_tmp/tmpbody.md','w',encoding='utf-8').write(body)
print(len(body))
print(body[:600])
