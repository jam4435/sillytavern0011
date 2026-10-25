"""Model-assisted locators cannot alter event claims or bypass exact source checks."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from test_pipeline import FixtureCorpus
import evidence_reselection as e


class ReselectionTest(unittest.TestCase):
    def setUp(self):
        self.event=dict(title='甲收乙为徒',description='原有事件文字',evidence=[dict(book='天龙八部',line=1,anchor='错写的定位锚')])
        self.source={('天龙八部',1):'甲收乙为徒，传授绝艺。'}
        self.payload=dict(task_id='t',event_index=2,references=[dict(evidence_index=1,book='天龙八部',line=1,anchor='甲收乙为徒')])

    def test_only_rejected_evidence_changes(self):
        before=deepcopy(self.event)
        fixed,changes=e.validate_selection(self.payload,'t',2,self.event,[0],self.source)
        self.assertEqual(self.event,before)
        self.assertEqual({k:v for k,v in fixed.items() if k!='evidence'},
                         {k:v for k,v in before.items() if k!='evidence'})
        self.assertEqual(fixed['evidence'][0]['anchor'],'甲收乙为徒')
        self.assertEqual(len(changes),1)

    def test_mismatch_duplicate_outside_or_nonverbatim_choices_reject(self):
        mutations=[lambda p:p.update(task_id='other'),lambda p:p.update(event_index=1),
                   lambda p:p.update(references=[]),
                   lambda p:p['references'].append(p['references'][0]),
                   lambda p:p['references'][0].update(evidence_index=2),
                   lambda p:p['references'][0].update(line=2),
                   lambda p:p['references'][0].update(book='鹿鼎记'),
                   lambda p:p['references'][0].update(anchor='甲收乙為徒'),
                   lambda p:p['references'][0].update(anchor='甲收')]
        for mutate in mutations:
            p=deepcopy(self.payload);mutate(p)
            with self.subTest(payload=p):
                with self.assertRaises(ValueError):e.validate_selection(p,'t',2,self.event,[0],self.source)

    def test_context_cannot_include_unsupplied_neighbor(self):
        corpus=FixtureCorpus('甲收乙为徒。\n不允许的邻接内容。').real
        source=e.candidate_lines(self.event,[0],{('天龙八部',1)},corpus)
        self.assertEqual(set(source),{('天龙八部',1)})

    def receipt(self):
        return [dict(type='step/start'),dict(type='request/header',data=dict(toolCount=0,config=dict(provider='buddy',model='deepseek-v4.1-flash',reasoningEffort='low',maxTokens=32768))),
                dict(type='assistant/message',data=dict(usage=dict(outputTokens=10))),dict(type='turn/end',data=dict(reason=dict(kind='completed')))]

    def test_receipt_requires_completed_fixed_route_single_step(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'receipt.jsonl'
            good=self.receipt()
            path.write_text('\n'.join(json.dumps(x) for x in good),encoding='utf-8');e.verify_receipt(path)
            for mutate in [lambda x:x[1]['data']['config'].update(model='other'),
                           lambda x:x[1]['data'].update(toolCount=1),
                           lambda x:x[-1]['data'].update(reason=dict(kind='max-tokens')),
                           lambda x:x.append(dict(type='step/start'))]:
                bad=deepcopy(good);mutate(bad);path.write_text('\n'.join(json.dumps(x) for x in bad),encoding='utf-8')
                with self.assertRaises(ValueError):e.verify_receipt(path)

    def test_budget_or_incomplete_prior_call_never_starts_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'runs').mkdir();corpus=FixtureCorpus('甲收乙为徒。').real
            with patch.object(e,'HERE',root),patch.object(e,'usage_total',return_value=dict(total=e.TOTAL_TOKEN_LIMIT)),patch.object(e,'call') as call:
                with self.assertRaisesRegex(ValueError,'token limit'):
                    e.reselect(dict(id='t'),2,self.event,[0],{('天龙八部',1)},corpus,'repair')
                call.assert_not_called()
            (root/'runs/repair.prompt.txt').write_text('old',encoding='utf-8')
            with patch.object(e,'HERE',root),patch.object(e,'call') as call:
                with self.assertRaisesRegex(ValueError,'incomplete'):
                    e.reselect(dict(id='t'),2,self.event,[0],{('天龙八部',1)},corpus,'repair')
                call.assert_not_called()

    def test_successful_repair_receipt_reuses_output_without_new_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'runs').mkdir();corpus=FixtureCorpus('甲收乙为徒，传授绝艺。').real
            def call(prompt,**kwargs):
                path=root/'runs/repair.events.jsonl'
                path.write_text('\n'.join(json.dumps(x) for x in self.receipt()),encoding='utf-8')
                return SimpleNamespace(success=True,text=json.dumps(self.payload,ensure_ascii=False),stderr='')
            with patch.object(e,'HERE',root),patch.object(e,'usage_total',return_value=dict(total=0)),patch.object(e,'call',side_effect=call) as model:
                first=e.reselect(dict(id='t'),2,self.event,[0],{('天龙八部',1)},corpus,'repair')
                second=e.reselect(dict(id='t'),2,self.event,[0],{('天龙八部',1)},corpus,'repair')
                self.assertEqual(first,second);self.assertEqual(model.call_count,1)


if __name__=='__main__':unittest.main()
