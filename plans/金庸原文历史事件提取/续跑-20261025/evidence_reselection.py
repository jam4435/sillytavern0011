"""Ask the fixed dsh model to reselect rejected locators from supplied local lines.

The model can replace only named evidence references, never event assertions.
Every proposed anchor still requires exact matching and the original validator.
Successful repair outputs can be reused after an interrupted batch without a
second model call; rejected or incomplete calls are not retried automatically.
"""
from copy import deepcopy
import json
from pipeline import HERE
from orchestrate import decode, jsonl, usage_total, TOTAL_TOKEN_LIMIT, MAX_PROMPT_CHARS
from dsh_calls import call


def candidate_lines(event, indices, allowed, corpus):
    """Supply only previously allowed lines within three lines of rejected claims."""
    selected={}
    for index in indices:
        ref=event['evidence'][index]
        lines=corpus.texts[ref['book']].splitlines()
        for n in range(max(1,ref['line']-3),min(len(lines),ref['line']+3)+1):
            if (ref['book'],n) in allowed:
                selected[(ref['book'],n)]=lines[n-1]
    return selected


def validate_selection(payload, task_id, event_index, event, indices, source):
    """Apply only exact, uniquely indexed locator replacements from supplied lines."""
    if payload.get('task_id')!=task_id or payload.get('event_index')!=event_index:
        raise ValueError('repair task or event mismatch')
    refs=payload.get('references')
    if not isinstance(refs,list) or len(refs)!=len(indices):
        raise ValueError('repair must replace exactly the rejected references')
    expected={i+1 for i in indices};seen=set();fixed=deepcopy(event);changes=[]
    for ref in refs:
        index=ref.get('evidence_index')
        if type(index) is not int or index not in expected or index in seen:
            raise ValueError('unexpected or duplicate evidence index')
        seen.add(index)
        book,line,anchor=ref.get('book'),ref.get('line'),ref.get('anchor')
        old=event['evidence'][index-1]
        if book!=old['book'] or type(line) is not int or (book,line) not in source:
            raise ValueError('repair outside supplied local source')
        if not isinstance(anchor,str) or not 4<=len(anchor)<=40 or anchor not in source[(book,line)]:
            raise ValueError('repair anchor must be verbatim and 4..40 characters')
        replacement=dict(book=book,line=line,anchor=anchor)
        fixed['evidence'][index-1]=replacement
        changes.append(dict(evidence_index=index,before=old,after=replacement,source_line=source[(book,line)]))
    return fixed,changes


def verify_receipt(path):
    """Require a single completed tool-free call to the specified provider and model."""
    events=jsonl(path)
    headers=[e['data'] for e in events if e['type']=='request/header']
    messages=[e['data'] for e in events if e['type']=='assistant/message']
    ends=[e['data'].get('reason') for e in events if e['type']=='turn/end']
    if (len(headers)!=1 or headers[0]['toolCount']!=0
        or headers[0]['config']['provider']!='buddy'
        or headers[0]['config']['model']!='deepseek-v4.1-flash'
        or headers[0]['config'].get('reasoningEffort')!='low'
        or headers[0]['config'].get('maxTokens')!=32768
        or sum(e['type']=='step/start' for e in events)!=1
        or len(messages)!=1 or not isinstance(messages[0].get('usage'),dict)
        or ends!=[dict(kind='completed')]):
        raise ValueError('repair receipt must confirm required completed model call')


def reselect(task, event_index, event, indices, allowed, corpus, call_id):
    """Make at most one fresh model call for this event, recording input and output."""
    source=candidate_lines(event,indices,allowed,corpus)
    prompt='''你只修复原文定位锚，不改事件的任何事实、性质或语义。工具和外部知识不可用。
原锚未逐字命中，可能有错字、字序或标点问题。仅从下面已供原文行重新选连续4至40字定位锚，支持同一事件。不要纠正原文中的错别字，不拼接不改写。不能支持则返回 references:[]，不要猜。
只输出JSON：{"task_id":"原任务ID","event_index":原事件1基序号,"references":[{"evidence_index":待修证据1基序号,"book":"原书名","line":所供行号,"anchor":"连续逐字原文"}]}。
只返回指定待修证据，每个恰好一次；其它证据和事件字段不返回。
'''+json.dumps(dict(task_id=task['id'],event_index=event_index,event=event,
    rejected_evidence_indices=[i+1 for i in indices],
    source=[dict(book=b,line=n,text=text) for (b,n),text in sorted(source.items())]),ensure_ascii=False)
    payload=model_json(prompt,call_id)
    return validate_selection(payload,task['id'],event_index,event,indices,source)


def model_json(prompt, call_id):
    """Use one budgeted fixed-route call, retaining and verifying its receipt."""
    if len(prompt)>MAX_PROMPT_CHARS:
        raise ValueError('repair prompt exceeds bounded input limit')
    base=HERE/'runs'/call_id
    prompt_path=base.with_suffix('.prompt.txt');stdout=base.with_suffix('.stdout.txt')
    receipt=base.with_suffix('.events.jsonl')
    if stdout.exists():
        if not prompt_path.exists() or prompt_path.read_text(encoding='utf-8')!=prompt+'\n':
            raise ValueError('existing repair prompt differs')
        verify_receipt(receipt)
        text=stdout.read_text(encoding='utf-8')
    else:
        if prompt_path.exists() or receipt.exists():
            raise ValueError('incomplete prior repair call requires inspection; no automatic retry')
        if usage_total()['total']+90000>TOTAL_TOKEN_LIMIT:
            raise ValueError('aggregate token limit prevents evidence reselection')
        prompt_path.write_text(prompt+'\n',encoding='utf-8')
        result=call(prompt,timeout=300,call_id=call_id)
        stdout.write_text(result.text+'\n',encoding='utf-8')
        base.with_suffix('.stderr.txt').write_text(result.stderr+'\n',encoding='utf-8')
        if not result.success:
            raise ValueError('evidence reselection model call failed; inspect retained receipt')
        verify_receipt(receipt)
        text=result.text
    return decode(text)
