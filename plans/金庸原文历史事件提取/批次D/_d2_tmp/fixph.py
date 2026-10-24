
# -*- coding: utf-8 -*-
import io, os, re, json
D='批次D/_d2_tmp/cards'
fix = {
 '010_wu_sanniang.md': [('（见相关主线卡）', 'EV-神雕-0611；二子长成后荒谷相斗为当下事件，不另建卡'),
                        ('（二子长成后自相残杀）', '')],
 '011_wu_santong_qingnie.md': [('（见相关主线卡）', '（二武为郭芙相斗为当下事件，不另建卡）')],
 '013_yangguo_taohua_grudge.md': [('（见相关主线卡）', '（二武与杨过重逢后冲突为当下事件，不另建卡）')],
 '015_yinzhiping_confession.md': [('（见相关主线卡）', '（小龙女自此追踪尹赵二人，为当下事件）')],
 '024_quanzhen_biguan.md': [('（见相关主线卡）', '（掌教虚悬为当下事件）')],
 '026_quanzhen_withdraw.md': [('（见相关主线卡）', 'EV-神雕-0601；襄阳攻防见本批第 21 回诸卡')],
 '036_shuangdiao_needle.md': [('（见相关主线卡）', '（双雕之死为其后事件）')],
 '055_qiuchi_qiujin.md': [('（见相关主线卡）', '（公孙止打断其四肢、囚于地底，详叙在《神雕》第十六回裘千尺自述，不在本批范围）')],
 '056_rouer.md': [('（见相关主线卡）', '（公孙止为讨好李莫愁而图谋亲女为当下事件，见《神雕》第三十一回）')],
 '057_lveduo_jiefu.md': [('（见相关主线卡）', '（裘千尺被囚事见《神雕》第十六、十九回，本批仅侧面提及）')],
 '058_lveduo_zijin.md': [('（见相关主线卡）', '（公孙止图谋以女换丹为当下事件）')],
 '061_qiuchi_gongshun_zhisi.md': [('（见相关主线卡）', '（纵火焚庄、设穴为同回当下事件）')],
 '079_huodu_panshi.md': [('（见相关主线卡）', '（鲁有脚遇害见本批第 36 回卡）')],
 '086_huangrong_shuowangshi.md': [('（见相关主线卡）', '（黄蓉随即说出南海神尼是杜撰，见 EV-神雕-0686）')],
 '113_huodu_zhi_si.md': [('（见相关主线卡）', '（打狗棒被夺见本批第 37 回卡）')],
}
for f, subs in fix.items():
    p = os.path.join(D,f); s = io.open(p,encoding='utf-8').read()
    for a,b in subs: s = s.replace(a,b)
    io.open(p,'w',encoding='utf-8').write(s)
print('ok')
