# -*- coding: utf-8 -*-
import io

NOV = io.open('原文UTF8/倚天屠龙记.txt', encoding='utf-8').read().splitlines()
CARDS = []

def S(line, a, b=None):
    t = NOV[line-1]
    i = t.index(a)
    j = i + len(a) if b is None else t.index(b, i) + len(b)
    return t[i:j]

def C(**kw):
    CARDS.append(kw)

def excerpt(c):
    return '“……'.join([]) if False else '“' + '……'.join(c['ex']) + '”'
