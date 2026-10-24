
import io,difflib
lines=io.open('原文UTF8/笑傲江湖.txt',encoding='utf-8').read().split('\n')
tests={
 '红叶':('红叶禅师参究多年，直到逝世，始终就没起始练宝典上所载的武功。',12959),
 '法诀':('这辟邪剑谱的第一道法诀，便是：‘武林称雄，挥剑自宫。’',15474),
 '负心':('那便是‘负心薄幸，好色无厌’这八个字了。',16192),
 '白板':('这‘白板煞星’是个大恶人',14079),
 '五霸冈':('毕竟旁门左道中有数千人聚集五霸冈',10940),
 '和尚':('倘若让菩萨怪上了她，累她死后在地狱里受苦，我如何对得住她？因此我去做了和尚。',16182),
}
out=io.open('_f2_diag.txt','w',encoding='utf-8')
for k,(ex,ln) in tests.items():
    src=lines[ln-1]
    i=src.find(ex[:6])
    out.write('## %s line %d\n@EX  %s\n@SRC %s\n'%(k,ln,ex,src[max(0,i-10):i+len(ex)+10]))
    # find first difference
    seg=src[i:i+len(ex)]
    sm=difflib.SequenceMatcher(None,ex,seg)
    for tag,i1,i2,j1,j2 in sm.get_opcodes():
        if tag!='equal':
            out.write('   DIFF %s ex[%d:%d]=%s src[%d:%d]=%s\n'%(tag,i1,i2,ex[i1:i2],j1,j2,seg[j1:j2]))
out.close()
print('ok')
