# -*- coding: utf-8 -*-
import io, re
p='批次E/_cards_d.py'
src=io.open(p,encoding='utf-8').read()
m=re.search(r"C\(id='0101'.*?\n\s*ex=\[(.*?)\],\n", src, re.S)
new = ", ".join(["S(8026,'我成昆立誓要竭尽所能，覆灭明教')","S(8030,'唯一的指望，只有从中挑拨，令它自相残杀，自己毁了自己')","S(8034,'我忽然假装醉酒，意欲逼奸我徒儿谢逊的妻子')","S(8038,'他是我手中的杀人之刀')"])
src=src[:m.start(1)]+new+src[m.end(1):]
io.open(p,'w',encoding='utf-8').write(src)
print('ok')
