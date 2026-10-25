"""Split the truncated Tianlong chapter-7 task without changing card ownership rules."""
from collections import Counter
from copy import deepcopy
import json
import os

from pipeline import HERE, Corpus, dump, sha
from orchestrate import anchor_for, jsonl, prompt_for, usage_total
from supervise import assert_freeze


def main():
    """Back up history and replace one failed task with four exact windows."""
    lock = HERE / '.supervisor.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    try:
        if (HERE / '.controller.lock').exists():
            raise ValueError('controller lock exists')
        tasks = json.loads((HERE / 'queue.json').read_text(encoding='utf-8'))
        parent_id = '天龙-007-01'
        matches = [i for i, task in enumerate(tasks) if task['id'] == parent_id]
        if len(matches) != 1:
            raise ValueError('expected exactly one parent')
        index = matches[0]
        parent = tasks[index]
        if (parent['status'], parent.get('error'), parent['start'], parent['end']) != (
                'failed', 'dsh failed: {"kind": "max-tokens"}', 2615, 2858):
            raise ValueError('unexpected failed parent')
        if any(t['status'] in ['running', 'needs_repair'] or
               (t['status'] == 'failed' and t['id'] != parent_id) for t in tasks):
            raise ValueError('other unresolved task exists')
        assert_freeze()
        corpus = Corpus()
        if corpus.hashes[parent['book']] != parent['source_sha256']:
            raise ValueError('source hash changed')
        lines = corpus.texts[parent['book']].splitlines()
        if any(lines[n - 1].strip() for n in [2674, 2736, 2802]):
            raise ValueError('split must follow original paragraph separators')
        cards = {c['uid']: c for c in jsonl(HERE / 'inventory/cards.jsonl')
                 if c['uid'] in parent['legacy_uids']}
        if set(cards) != set(parent['legacy_uids']):
            raise ValueError('missing parent cards')
        children = []
        prompt_lengths = {}
        for suffix, start, end in [('a', 2615, 2674), ('b', 2675, 2736),
                                   ('c', 2737, 2802), ('d', 2803, 2858)]:
            child = deepcopy(parent)
            child.pop('error')
            child.update(id=parent_id + suffix, start=start, end=end, status='pending', attempts=0,
                         legacy_uids=[uid for uid in parent['legacy_uids']
                                      if start <= anchor_for(cards[uid]) <= end])
            if any(t['id'] == child['id'] for t in tasks):
                raise ValueError('child id already exists')
            prompt, _ = prompt_for(child, corpus, cards)
            prompt_lengths[child['id']] = len(prompt)
            children.append(child)
        if Counter(uid for c in children for uid in c['legacy_uids']) != Counter(parent['legacy_uids']):
            raise ValueError('card ownership mismatch')
        replacement = tasks[:index] + children + tasks[index + 1:]
        def coverage(items):
            return Counter((t['book'], n) for t in items for n in range(t['start'], t['end'] + 1))
        if coverage(tasks) != coverage(replacement):
            raise ValueError('coverage mismatch')
        audit = HERE / 'handoff' / 'max-tokens-天龙-007-01'
        audit.mkdir(exist_ok=False)
        (audit / 'queue-before.json').write_bytes((HERE / 'queue.json').read_bytes())
        receipt_hashes = {str(p.relative_to(HERE)): sha(p) for p in (HERE / 'runs').glob('*.events.jsonl')}
        parent_files = {str(p.relative_to(HERE)): sha(p) for p in (HERE / 'runs').glob('review-' + parent_id + '-a1.*')}
        total = usage_total()
        dump(audit / 'split.json', dict(parent=parent, children=children, prompt_lengths=prompt_lengths,
             reason='max-tokens; four smaller windows at original paragraph separators',
             card_anchor_lines={uid: anchor_for(c) for uid, c in cards.items()},
             coverage_exact=True, card_ownership_exact=True, usage=total,
             historical_receipts=receipt_hashes, parent_files=parent_files))
        dump(HERE / 'queue.json', replacement)
        assert usage_total() == total
        assert all(sha(HERE / p) == h for p, h in {**receipt_hashes, **parent_files}.items())
        print(json.dumps(dict(children=[dict(id=c['id'], start=c['start'], end=c['end'],
                          cards=len(c['legacy_uids']), prompt_chars=prompt_lengths[c['id']]) for c in children],
                          coverage_exact=True, card_ownership_exact=True, usage=total), ensure_ascii=False))
    finally:
        lock.unlink()


if __name__ == '__main__':
    main()
