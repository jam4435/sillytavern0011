# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
t=io.open('_final.md',encoding='utf-8').read()
# classify: past-backstory vs present-line
mark={'1215':'当下','1216':'回溯','1230':'当下','1231':'当下','1232':'讲述','1239':'当下','1244':'当下','1245':'当下','1246':'当下','1247':'当下','1248':'当下','1250':'当下','1251':'当下','1252':'当下','1253':'讲述','1254':'当下','1276':'当下','1277':'讲述','1283':'当下'}
entries=re.findall(r'### (EV-天龙-\d+) · ([^\n]*)\n', t)
past=0;pres=0
for eid,title in entries:
    k=eid.split('-')[-1]
    if k in mark: pres+=1
    else: past+=1
print('past-ish',past,'present-ish',pres)