"""Offline evidence repair and exact parent-window replacement for the October 25 handoff.

Original model output and call receipts remain unchanged. Backups precede writes;
all five repaired batches must validate before any result or queue is replaced.
"""
from copy import deepcopy
import argparse
import json
from pathlib import Path
from pipeline import HERE, Corpus, dump, sha
from orchestrate import decode, prompt_for, validate, usage_total

AUDIT = HERE / 'handoff' / 'resume-repair'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def backup(path):
    target = AUDIT / 'before' / path.relative_to(HERE)
    if target.exists():
        if sha(target) != sha(path):
            raise ValueError('existing backup differs: ' + str(path))
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())


def check_idle():
    for name in ['.controller.lock', '.supervisor.lock']:
        if (HERE / name).exists():
            raise ValueError('controller lock exists: ' + name)


def repair():
    check_idle()
    cases = load(HERE / 'handoff/repair-cases.json')
    tasks = load(HERE / 'queue.json')
    corpus = Corpus()
    before_usage = usage_total()
    prepared, records = [], []
    for case in cases:
        task = next(t for t in tasks if t['id'] == case['task_id'])
        if task['status'] != 'needs_repair':
            raise ValueError('repair requires original needs_repair state')
        if corpus.hashes[task['book']] != task['source_sha256']:
            raise ValueError('source hash changed')
        raw = HERE / case['raw_output']
        payload = decode(raw.read_text(encoding='utf-8'))
        index = case['issue']['new_event'] - 1
        event = payload['new_events'][index]
        if event != case['event']:
            raise ValueError('raw event differs from handoff case')
        changes = []
        for bad in case['bad_references']:
            refs = [r for r in event['evidence'] if r['line'] == bad['claimed_line'] and r['anchor'] == bad['anchor']]
            if len(refs) != 1:
                raise ValueError('expected exactly one bad reference')
            ref = refs[0]
            old = deepcopy(ref)
            if bad['exact_match_lines']:
                matches = corpus.matches(task['book'], ref['anchor'])
                if len(matches) != 1 or matches[0]['start'] != bad['exact_match_lines'][0]:
                    raise ValueError('line correction is not uniquely exact')
                ref['line'] = matches[0]['start']
            else:
                # These two replacements are selected verbatim from the recorded source line.
                anchors = {'鹿鼎-014-02': '但她差遣瑞栋去处死宗人府的镶红旗旗主和察博',
                           '鹿鼎-018-02': '那头陀哪知柳燕已死'}
                ref['anchor'] = anchors[task['id']]
            line = corpus.texts[task['book']].splitlines()[ref['line']-1]
            if ref['anchor'] not in line:
                raise ValueError('corrected reference is not verbatim')
            changes.append(dict(before=old, after=deepcopy(ref), source_line=line))
        _, allowed = prompt_for(task, corpus, {})
        checked = validate(task, payload, allowed, corpus)
        if checked['validation_issues']:
            raise ValueError(checked['validation_issues'])
        old_result = load(HERE / case['result'])
        old_events = {e['id']: e for e in old_result['events']}
        new_events = {e['id']: e for e in checked['events']}
        if any(new_events.get(k) != v for k, v in old_events.items()) or len(new_events) != len(old_events)+1:
            raise ValueError('repair must preserve existing events and restore exactly one')
        prepared.append((case, payload, checked))
        records.append(dict(task_id=task['id'], raw_sha256=sha(raw), changes=changes,
                            restored_event=new_events[f'NEW:{task["id"]}:{index+1:03d}']['id'],
                            semantic_scope='Evidence coordinates only; original model claims remain subject to semantic review.'))
    backup(HERE / 'queue.json')
    for case, payload, checked in prepared:
        backup(HERE / case['result'])
        dump(AUDIT / 'payloads' / (case['task_id']+'.json'), payload)
    dump(AUDIT / 'evidence-repair.json', dict(usage_before=before_usage, repairs=records,
         semantic_limits=['贞妃事件依海老公转述，不独立确认其指控。', '柳燕已死是否独立历史节点仍待语义审阅。']))
    for case, payload, checked in prepared:
        dump(HERE / case['result'], checked)
        task = next(t for t in tasks if t['id'] == case['task_id'])
        task.update(status='reviewed', event_count=len(checked['events']), issue_count=0)
    dump(HERE / 'queue.json', tasks)
    assert usage_total() == before_usage
    print(json.dumps(dict(repaired=len(records), usage=before_usage), ensure_ascii=False))


def split():
    check_idle()
    tasks = load(HERE / 'queue.json')
    index = next(i for i,t in enumerate(tasks) if t['id'] == '鹿鼎-024-02')
    parent = tasks[index]
    if parent['status'] != 'failed' or (parent['start'],parent['end']) != (10875,11009) or parent['legacy_uids']:
        raise ValueError('unexpected failed parent metadata')
    if any(t['status']=='needs_repair' for t in tasks):
        raise ValueError('finish evidence repairs before splitting')
    corpus = Corpus()
    if corpus.hashes[parent['book']] != parent['source_sha256']:
        raise ValueError('source hash changed')
    children = []
    for suffix,start,end in [('a',10875,10938),('b',10939,11009)]:
        child = {k:v for k,v in parent.items() if k not in ['error','duration_ms','event_count','issue_count']}
        child.update(id=parent['id']+suffix,start=start,end=end,status='pending',attempts=0)
        prompt, _ = prompt_for(child,corpus,{})
        children.append(child)
        print(json.dumps(dict(child=child['id'],start=start,end=end,prompt_chars=len(prompt)),ensure_ascii=False))
    covered = [n for c in children for n in range(c['start'],c['end']+1)]
    if covered != list(range(parent['start'],parent['end']+1)):
        raise ValueError('split leaves overlaps or gaps')
    if any(t['id'] in [c['id'] for c in children] for t in tasks):
        raise ValueError('child ID already exists')
    dump(AUDIT / 'queue-before-split.json', tasks)
    paths = sorted((HERE/'runs').glob('review-鹿鼎-024-02-a1.*'))
    dump(AUDIT / 'split-parent.json', dict(parent=parent,children=children,
         reason='max-tokens; split at source scene separator without raising output limit',
         original_call_files=[dict(path=str(p.relative_to(HERE)),sha256=sha(p)) for p in paths],
         coverage_exact=True,usage=usage_total()))
    dump(HERE / 'queue.json', tasks[:index]+children+tasks[index+1:])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['repair','split'])
    args = parser.parse_args()
    repair() if args.command == 'repair' else split()
