"""Reject malformed model evidence before it can become a generated citation."""
import unittest
from orchestrate import materialize_event, validate
from test_pipeline import FixtureCorpus


class ModelEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.corpus=FixtureCorpus('甲收乙为徒，传授绝艺。\n另一行文字。').real
        self.event=dict(title='甲收乙为徒',when='未知',place='未知',people=['甲','乙'],
            relationships='师徒关系建立',description='甲收乙为徒并传艺。',cause='未知',
            effect='乙学艺',nature='客观叙述',uncertain=[],
            evidence=[dict(book='天龙八部',line=1,anchor='甲收乙为徒')])

    def test_quote_is_generated_from_source(self):
        e=materialize_event(self.event,{('天龙八部',1)},self.corpus,'test')
        self.assertEqual(e['evidence'][0]['quote'],'甲收乙为徒，传授绝艺。')

    def test_invented_anchor_is_rejected(self):
        self.event['evidence'][0]['anchor']='甲杀乙为仇'
        with self.assertRaisesRegex(ValueError,'verbatim'):
            materialize_event(self.event,{('天龙八部',1)},self.corpus,'test')

    def test_unsupplied_line_is_rejected(self):
        self.event['evidence'][0]=dict(book='天龙八部',line=2,anchor='另一行文字')
        with self.assertRaisesRegex(ValueError,'outside supplied'):
            materialize_event(self.event,{('天龙八部',1)},self.corpus,'test')

    def test_missing_legacy_review_is_rejected(self):
        task=dict(id='t',start=1,end=1,legacy_uids=['a'])
        payload=dict(task_id='t',coverage=dict(start=1,end=1,complete=True),reviews=[],new_events=[])
        with self.assertRaisesRegex(ValueError,'legacy review'):
            validate(task,payload,{('天龙八部',1)},self.corpus)

    def test_incomplete_coverage_is_rejected(self):
        task=dict(id='t',start=1,end=1,legacy_uids=[])
        payload=dict(task_id='t',coverage=dict(start=1,end=1,complete=False),reviews=[],new_events=[])
        with self.assertRaisesRegex(ValueError,'coverage'):
            validate(task,payload,{('天龙八部',1)},self.corpus)


if __name__=='__main__':
    unittest.main()
