
# -*- coding: utf-8 -*-
import io, os, re, json
D='批次D/_d2_tmp/cards'
fix = {
 'cai_xuezhu': '019_quanzhen_rise',       # 实指彩雪蛛→caixuezhu
}
# map wrong key -> correct key
m = {
 'cai_xuezhu':'caixuezhu',
 'cien_qiu_shu':'cien_qiushu',
 'dagaobang_duohui':None,
 'ershi_dou':None,
 'gong_sun_duan_zhi':None,
 'guojing_yang kang_death':'yang_kang_death',
 'jinmao_fuma':'jindao_fuma',
 'lue_gao_duji':None,
 'qing shu':'qingshu',
 'quanzhen_liangyizhangjiao':None,
 'shuangdiao_xunqing':None,
 'tianzhuseng_killed':'yilinmochou_die',
 'tianzhuseng_test':'tianzhuseng_yideng',
 'wangtieqiang_miao':'yangguo_wangtieqiang',
 'xiangyang_defense':None,
 'xiaolongnv_follow':'gumu_fengmen',
 'xiaolongnv_notclean':None,
 'xishan_shanzhuang_dou':'xishan_yikugui',
 'yinggu_yuanwang':'yinggu_buyuan',
 'yinggu_zhoubotong_jiemian':'zhoubotong_yinggu_jiemian',
 'yufeng_zhiyu':'yufeng_zhoubotong',
}
alias = json.load(open('批次D/_d2_tmp/alias.json', encoding='utf-8'))
files = sorted([f for f in os.listdir(D) if re.match(r'^\d{3}_', f)])
titles = []
for f in files:
    body = io.open(os.path.join(D,f), encoding='utf-8').read().strip()
    titles.append(body.split('\n')[0].lstrip('· ').strip())
t2i = {t: 'EV-神雕-%04d' % (600+i) for i,t in enumerate(titles)}
resolved = 0; left = set()
for f in files:
    p = os.path.join(D,f); s = io.open(p, encoding='utf-8').read()
    def f2(mo):
        global resolved
        k = mo.group(1).strip()
        k = m.get(k, k)
        if k is None: return '（见相关主线卡）'
        k2 = alias.get(k, k)
        if k2 in t2i:
            resolved += 1
            return t2i[k2]
        left.add(k); return '（见相关主线卡）'
    s2 = re.sub(r'\[\[([^\]]+)\]\]', f2, s)
    io.open(p,'w',encoding='utf-8').write(s2)
print('resolved', resolved, 'left', sorted(left))
