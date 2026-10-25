"""Request targeted semantic repair of rejected entries under unchanged validation.

Only rejected review/event entries may change. New-event indices remain stable;
the model cannot add, remove, reorder, or rewrite previously accepted entries.
"""
from copy import deepcopy
import json
from evidence_reselection import model_json


def targets(issues):
    """Return the exact rejected new-event indices and legacy review identifiers."""
    new=set();uids=set()
    for issue in issues:
        if 'new_event' in issue:
            index=issue['new_event']
            if type(index) is not int or index<1:raise ValueError('invalid rejected event index')
            new.add(index)
        elif 'uid' in issue:
            uids.add(issue['uid'])
        else:raise ValueError('issue does not identify an event or review')
    return new,uids


def apply_repairs(original, patch, issues):
    """Apply exactly the requested entries; all other payload content stays intact."""
    if patch.get('task_id')!=original['task_id']:
        raise ValueError('repair task mismatch')
    if patch.get('unresolved')!=[]:
        raise ValueError('model could not resolve every rejected entry')
    expected_new,expected_uids=targets(issues)
    new=patch.get('new_events');reviews=patch.get('reviews')
    if not isinstance(new,list) or not isinstance(reviews,list):
        raise ValueError('repair lists are required')
    indices=[e.get('index') for e in new]
    uids=[r.get('uid') for r in reviews]
    if any(type(i) is not int for i in indices) or len(indices)!=len(set(indices)) or set(indices)!=expected_new:
        raise ValueError('repair must cover exactly the rejected event indices')
    if len(uids)!=len(set(uids)) or set(uids)!=expected_uids:
        raise ValueError('repair must cover exactly the rejected review UIDs')
    fixed=deepcopy(original)
    for item in new:
        if not 1<=item['index']<=len(fixed['new_events']) or not isinstance(item.get('event'),dict):
            raise ValueError('new event must remain a complete object in its original slot')
        fixed['new_events'][item['index']-1]=item['event']
    for review in reviews:
        if review.get('verdict') not in ['corrected','not_historical','insufficient']:
            raise ValueError('repaired review requires an explicit correction or exclusion')
        matches=[i for i,r in enumerate(fixed['reviews']) if r['uid']==review['uid']]
        if len(matches)!=1:raise ValueError('original review UID is not unique')
        fixed['reviews'][matches[0]]=review
    return fixed


def repair(task, payload, issues, allowed, corpus, cards, call_id):
    """Ask the required model to repair only rejected entries from original material."""
    new,uids=targets(issues)
    source=[]
    for book,line in sorted(allowed):
        source.append(dict(book=book,line=line,text=corpus.texts[book].splitlines()[line-1]))
    request=dict(task_id=task['id'],book=task['book'],chapter=task['chapter'],
        main_range=dict(start=task['start'],end=task['end']),issues=issues,
        rejected_new_events=[dict(index=i,event=payload['new_events'][i-1]) for i in sorted(new)],
        rejected_reviews=[r for r in payload['reviews'] if r['uid'] in uids],
        original_cards=[cards[uid] for uid in sorted(uids)],source=source)
    prompt='''你是六部金庸原文历史事件提取的定向修复模型。只用本次提供的原文，不用外部常识或记忆。只输出JSON，不调用工具。
只修复指定被程序拒绝的条目，不新增条目、不调整索引、不触碰其它成果。原有模型的判断也可能不正确，须按原文重新判定；叙事当下发生的打斗、讲述或心理不是过去事件，旧卡可判 not_historical 并说明依据。因果、性质和人物称谓必须受原文支持。没有姓名时可用原文确有的行动集团称谓，不猜人物；无法修复则在 unresolved 明确说明。
校验不放宽：事件须有title/when/place/people/relationships/description/cause/effect/nature/evidence/uncertain全部字段，字符串字段非空；people非空数组，uncertain数组；evidence必须1至8处，每处book/line/anchor，anchor为所给行内连续逐字4至40字，不能拼接、正字或改标点。nature为客观叙述/人物自述/传闻/揭密/推断。保留来源可信度限制，不把人物指控当已定事实。
返回严格对应指定失败条目：{"task_id":"原ID","reviews":[{"uid":"完整原UID","verdict":"corrected|not_historical|insufficient","reason":"具体原文依据","event":完整修正事件或null}],"new_events":[{"index":原1基索引,"event":完整修正事件}],"unresolved":[]}。
corrected必须给完整事件，另外两个verdict用event:null。new_events不能删除或用空对象占位；若该条其实不是历史事件或原文无法支持，返回unresolved，停止接受它。reviews和new_events只含待修项，每个恰好一次。
'''+json.dumps(request,ensure_ascii=False)
    patch=model_json(prompt,call_id)
    return apply_repairs(payload,patch,issues),patch
