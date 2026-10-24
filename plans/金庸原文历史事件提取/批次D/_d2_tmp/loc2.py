
# -*- coding: utf-8 -*-
import io
L = io.open('原文UTF8/神雕侠侣.txt', encoding='utf-8').read().split('\n')
for kw in ['韩小莹','越女剑','江南七怪','柯镇恶','飞天蝙蝠','梅超风','桃花岛','黄蓉当年','郭靖当年','成吉思汗','金刀驸马','哲别','全真六子','尹志平','赵志敬','小龙女','孙婆婆','郝大通']:
    hits=[i for i in range(6876,14341) if kw in L[i-1]]
    print(kw, len(hits), hits[:14])
