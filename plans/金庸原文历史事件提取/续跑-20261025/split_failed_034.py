"""Replace the truncated chapter-34 window with two exact paragraph windows."""
from collections import Counter
from copy import deepcopy
import json
import os
import argparse

from pipeline import HERE, Corpus, dump, sha
from orchestrate import prompt_for, usage_total
from supervise import assert_freeze


def main(parent_id):
    """Back up the failed task and verify coverage before replacing the queue."""
    lock = HERE / '.supervisor.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    try:
        if (HERE / '.controller.lock').exists():
            raise ValueError('controller lock exists')
        tasks = json.loads((HERE / 'queue.json').read_text(encoding='utf-8'))
        expected = {'鹿鼎-034-01': (15263, 15496, 15372),
                    '鹿鼎-034-01b': (15373, 15496, 15434)}
        start_line, end_line, cut_line = expected[parent_id]
        matches = [i for i, task in enumerate(tasks) if task['id'] == parent_id]
        if len(matches) != 1:
            raise ValueError('expected exactly one failed parent')
        index = matches[0]
        parent = tasks[index]
        if (parent['status'], parent.get('error'), parent['start'], parent['end'], parent['legacy_uids']) != (
                'failed', 'dsh failed: {"kind": "max-tokens"}', start_line, end_line, []):
            raise ValueError('unexpected failed parent metadata')
        if any(t['status'] in ['running', 'needs_repair'] or
               (t['status'] == 'failed' and t['id'] != parent_id) for t in tasks):
            raise ValueError('other unresolved task exists')
        assert_freeze()
        corpus = Corpus()
        if corpus.hashes[parent['book']] != parent['source_sha256']:
            raise ValueError('source hash changed')
        if corpus.texts[parent['book']].splitlines()[cut_line - 1].strip():
            raise ValueError('split must follow an empty paragraph separator')
        children = []
        for suffix, start, end in [('a', start_line, cut_line), ('b', cut_line + 1, end_line)]:
            child = deepcopy(parent)
            child.pop('error')
            child.update(id=parent_id + suffix, start=start, end=end, status='pending', attempts=0)
            if any(t['id'] == child['id'] for t in tasks):
                raise ValueError('child id already exists')
            prompt_for(child, corpus, {})
            children.append(child)
        replacement = tasks[:index] + children + tasks[index + 1:]
        def coverage(items):
            return Counter((t['book'], n) for t in items for n in range(t['start'], t['end'] + 1))
        if coverage(tasks) != coverage(replacement):
            raise ValueError('coverage mismatch')
        audit = HERE / 'handoff' / ('max-tokens-' + parent_id)
        audit.mkdir(exist_ok=False)
        (audit / 'queue-before.json').write_bytes((HERE / 'queue.json').read_bytes())
        receipts = {str(p.relative_to(HERE)): sha(p) for p in (HERE / 'runs').glob('*.events.jsonl')}
        parent_files = {str(p.relative_to(HERE)): sha(p) for p in (HERE / 'runs').glob('review-' + parent_id + '-a1.*')}
        total = usage_total()
        dump(audit / 'split.json', dict(parent=parent, children=children,
             reason='max-tokens; balanced character count at original paragraph separator',
             coverage_exact=True, usage=total, historical_receipts=receipts, parent_files=parent_files))
        dump(HERE / 'queue.json', replacement)
        assert usage_total() == total
        assert all(sha(HERE / p) == digest for p, digest in {**receipts, **parent_files}.items())
        print(json.dumps(dict(children=[t['id'] for t in children], coverage_exact=True,
                              historical_usage_unchanged=total, active_windows=len(replacement)), ensure_ascii=False))
    finally:
        lock.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--task-id', choices=['鹿鼎-034-01', '鹿鼎-034-01b'], required=True)
    main(parser.parse_args().task_id)
