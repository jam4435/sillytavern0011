"""Write small handoff receipts and an explicit cleanup plan; never execute models."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

from pipeline import HERE, SOURCE, dump, sha
from orchestrate import jsonl, usage_total


def main():
    out=HERE/'handoff'
    out.mkdir(exist_ok=True)
    queue=json.loads((HERE/'queue.json').read_text(encoding='utf-8'))
    cases=[]
    for task in queue:
        if task['status']!='needs_repair':
            continue
        result=json.loads((HERE/'results'/(task['id']+'.json')).read_text(encoding='utf-8'))
        call_id='review-'+task['id']+'-a'+str(task['attempts'])
        payload=json.loads((HERE/'runs'/(call_id+'.stdout.txt')).read_text(encoding='utf-8'))
        source_lines=(SOURCE/'原文UTF8'/(task['book']+'.txt')).read_text(encoding='utf-8').splitlines()
        for issue in result['validation_issues']:
            event=payload['new_events'][issue['new_event']-1]
            bad=[]
            for ref in event['evidence']:
                n,anchor=ref['line'],ref['anchor']
                if anchor not in source_lines[n-1]:
                    matches=[i+1 for i,line in enumerate(source_lines) if anchor in line]
                    bad.append(dict(claimed_line=n,anchor=anchor,exact_match_lines=matches,
                        claimed_source_text=source_lines[n-1]))
            cases.append(dict(task_id=task['id'],task=task,issue=issue,event=event,bad_references=bad,
                raw_output='runs/'+call_id+'.stdout.txt',prompt='runs/'+call_id+'.prompt.txt',
                result='results/'+task['id']+'.json',source_sha256=task['source_sha256']))
    dump(out/'repair-cases.json',cases)
    run_index=[]
    for p in sorted((HERE/'runs').glob('*.events.jsonl')):
        es=jsonl(p)
        item=dict(call_id=p.name.removesuffix('.events.jsonl'),receipt=p.relative_to(HERE).as_posix(),
                  session_ids=sorted({e['sessionId'] for e in es}),usage=dict(inputTokens=0,cacheReadTokens=0,outputTokens=0),
                  end_reasons=[e['data']['reason'] for e in es if e['type']=='turn/end'],
                  headers=[e['data'] for e in es if e['type']=='request/header'])
        for e in es:
            if e['type']=='assistant/message':
                for k in item['usage']:
                    item['usage'][k]+=e.get('data',{}).get('usage',{}).get(k,0)
        for suffix in ['.prompt.txt','.stdout.txt','.stderr.txt','.patch.yml']:
            sibling=p.with_name(item['call_id']+suffix)
            if sibling.exists():
                item.setdefault('file_hashes',{})[sibling.name]=sha(sibling)
        run_index.append(item)
    dump(out/'run-index.json',run_index)
    state=dict(generated_at=datetime.now().astimezone().isoformat(),queue_sha256=sha(HERE/'queue.json'),
        statuses=dict(Counter(t['status'] for t in queue)),usage=usage_total(),
        supervisor=json.loads((HERE/'supervisor-state.json').read_text(encoding='utf-8')),
        failed_tasks=[t for t in queue if t['status']=='failed'],repair_case_count=len(cases),
        progress=json.loads((HERE/'deliverables/progress.json').read_text(encoding='utf-8')))
    dump(out/'status.json',state)
    candidates={}
    def add(p,reason):
        if p.is_file():
            candidates[str(p.resolve())]=dict(path=str(p.resolve()),bytes=p.stat().st_size,sha256=sha(p),reason=reason)
    for cache in SOURCE.rglob('__pycache__'):
        for p in cache.rglob('*'):
            add(p,'regenerable Python bytecode cache')
    for p in (SOURCE/'%SystemDrive%').rglob('*'):
        add(p,'Windows cache accidentally materialized beneath the task directory')
    for p in (HERE/'runs').glob('*.patch.yml'):
        add(p,'generated overlay reproducible by dsh_calls.prepare_overlay')
    for p in (HERE/'runs').glob('*.stderr.txt'):
        if 'dsh: reasoning:' in p.read_text(encoding='utf-8'):
            add(p,'reasoning transcript; input, output, usage and end reason retained separately')
    for name in ['diff-queue-first-draft.json','dsh-bounded.patch.yml','smoke.stdout.txt',
                 'smoke.stderr.txt','supervisor.stderr.log']:
        p=HERE/name
        if name!='supervisor.stderr.log' or (p.exists() and p.stat().st_size==0):
            add(p,'obsolete calibration draft or empty log; active queue and receipts retained')
    codex=Path('C:/Users/DELL/.codex')
    for p in codex.glob('audit-af2f-*.json'):
        if re.fullmatch(r'audit-af2f-(?:session-)?[0-9a-f-]{36}\.json',p.name):
            add(p,'decoded Session duplicate; original compressed log, audit script and summary retained')
    add(codex/'session-af2f3281-audit.jsonl','decoded main Session duplicate; original compressed log retained')
    directories=set()
    for cache in SOURCE.rglob('__pycache__'):
        directories.update(p for p in cache.rglob('*') if p.is_dir())
        directories.add(cache)
    artifact=SOURCE/'%SystemDrive%'
    if artifact.exists():
        directories.update(p for p in artifact.rglob('*') if p.is_dir())
        directories.add(artifact)
    plan=dict(allowed_roots=[str(SOURCE.resolve()),str(codex.resolve())],files=list(candidates.values()),
        empty_directories=[str(p.resolve()) for p in sorted(directories,key=lambda p:len(p.parts),reverse=True)],
        file_count=len(candidates),bytes=sum(c['bytes'] for c in candidates.values()),
        retained='All novel sources, legacy batch files, current queues, structured call receipts, prompts, raw JSON outputs, results, scripts and tests.')
    dump(out/'cleanup-plan.json',plan)
    print(json.dumps(dict(repair_cases=len(cases),run_receipts=len(run_index),cleanup_files=plan['file_count'],
                         cleanup_bytes=plan['bytes'],usage=state['usage']),ensure_ascii=False))


if __name__=='__main__':
    main()
