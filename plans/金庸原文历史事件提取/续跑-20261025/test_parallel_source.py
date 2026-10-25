"""Parallel books share queue ownership and a budget reserved before submission."""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import parallel_source as p
import supervise


class ParallelSourceTest(unittest.TestCase):
    def tasks(self):
        return [dict(id=book+str(n),book=book,status='pending',attempts=0,source_sha256='h')
                for book in ['甲','乙','丙'] for n in range(2)]

    def test_one_window_per_book_in_queue_order(self):
        selected=p.select_wave(self.tasks(),['乙','甲','丙'],6,0)
        self.assertEqual([t['id'] for t in selected],['乙0','甲0','丙0'])

    def test_reserve_whole_wave_and_do_not_advance_blocked_book(self):
        tasks=self.tasks();tasks[0]['status']='running'
        self.assertEqual([t['id'] for t in p.select_wave(tasks,['甲','乙','丙'],6,0,180000)],['乙0','丙0'])
        self.assertEqual(len(p.select_wave(self.tasks(),['甲','乙','丙'],6,1,180000)),1)
        self.assertEqual(p.select_wave(self.tasks(),['甲'],6,90001,180000),[])
        for value in [0,7,True]:
            with self.assertRaises(ValueError):p.select_wave(tasks,['甲'],value,0)
        with self.assertRaises(ValueError):p.select_wave(tasks,['甲','甲'],2,0)

    def test_workers_overlap_one_failure_drains_other_result_and_keeps_unique_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'runs').mkdir()
            tasks=self.tasks()[:1]+self.tasks()[2:3]
            (root/'queue.json').write_text(json.dumps(tasks),encoding='utf-8')
            gate=threading.Barrier(2,timeout=5)
            worker_ids=[]
            owner=threading.get_ident()
            def execute(task,prompt,allowed,corpus,call_id):
                worker_ids.append(threading.get_ident());gate.wait()
                if task['book']=='甲':raise RuntimeError('max-tokens')
                return dict(events=[dict(id='accepted')],validation_issues=[]),12
            real_dump=p.dump
            def dump(path,value):
                self.assertEqual(threading.get_ident(),owner)
                real_dump(path,value)
            with patch.multiple(p,HERE=root,Corpus=lambda:SimpleNamespace(hashes={'甲':'h','乙':'h'}),
                                jsonl=lambda _:[],prompt_for=lambda *args:('prompt',set()),
                                usage_total=lambda:dict(total=100),execute=execute,dump=dump):
                p.run_wave(['甲','乙'],2)
            result=json.loads((root/'queue.json').read_text(encoding='utf-8'))
            self.assertEqual([t['status'] for t in result],['failed','reviewed'])
            self.assertEqual(len(set(worker_ids)),2)
            self.assertTrue((root/'results/乙0.json').exists())
            self.assertFalse((root/'.controller.lock').exists())
            self.assertEqual(len(list((root/'runs').glob('*.prompt.txt'))),2)
            audit=json.loads(next((root/'handoff/parallel-waves').glob('*.json')).read_text(encoding='utf-8'))
            self.assertEqual(audit['reserved_tokens'],180000)
            self.assertEqual(len(audit['outcomes']),2)
            self.assertEqual(json.loads((root/'STOP.json').read_text(encoding='utf-8'))['reason'],'parallel_jobs_failed')

    def test_lock_blocks_duplicate_controller_without_removing_foreign_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);lock=root/'.controller.lock';lock.write_text('foreign',encoding='utf-8')
            with patch.object(p,'HERE',root):
                with self.assertRaises(FileExistsError):p.run_wave(['甲'],2)
            self.assertEqual(lock.read_text(encoding='utf-8'),'foreign')

    def test_bounded_supervisor_runs_one_wave_without_starting_diff(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            tasks=[dict(id='one',book='鹿鼎记',status='pending')]
            with patch.multiple(supervise,HERE=root,assert_freeze=lambda:None,
                                read_queue=lambda _:tasks,usage_total=lambda:dict(total=0),
                                assemble=lambda:dict()), \
                 patch.object(supervise,'state') as state, \
                 patch.object(supervise,'run_wave') as wave, \
                 patch.object(supervise,'prepare_diff') as diff:
                supervise.main(6,1)
                wave.assert_called_once_with(supervise.PRIORITY,6)
                diff.assert_not_called()
                self.assertEqual(state.call_args.args,('paused','source'))
                self.assertFalse((root/'.supervisor.lock').exists())

    def test_repair_rejection_stops_before_parallel_submission(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            tasks=[dict(id='bad',book='鹿鼎记',status='needs_repair')]
            with patch.multiple(supervise,HERE=root,assert_freeze=lambda:None,
                                read_queue=lambda _:tasks,usage_total=lambda:dict(total=0),
                                assemble=lambda:dict()), \
                 patch.object(supervise,'state') as state, \
                 patch.object(supervise,'repair_evidence',side_effect=ValueError('ambiguous')), \
                 patch.object(supervise,'run_wave') as wave:
                with self.assertRaisesRegex(ValueError,'ambiguous'):supervise.main(6)
                wave.assert_not_called()
                self.assertEqual(state.call_args.args,('needs_attention','source'))
                self.assertFalse((root/'.supervisor.lock').exists())

    def test_supplied_id_repair_precedes_next_parallel_wave(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            tasks=[dict(id='old',book='鹿鼎记',status='failed',error=supervise.REVIEW_ID_ERROR),
                   dict(id='next',book='鹿鼎记',status='pending')]
            calls=[]
            def repair():
                calls.append('repair');tasks[0]['status']='reviewed';del tasks[0]['error']
            def wave(*args):calls.append('wave')
            with patch.multiple(supervise,HERE=root,assert_freeze=lambda:None,
                                read_queue=lambda _:tasks,usage_total=lambda:dict(total=0),
                                assemble=lambda:dict(),state=lambda *args,**kwargs:None,
                                repair_review_ids=repair,run_wave=wave):
                supervise.main(6,1)
            self.assertEqual(calls,['repair','wave'])


if __name__=='__main__':
    unittest.main()
