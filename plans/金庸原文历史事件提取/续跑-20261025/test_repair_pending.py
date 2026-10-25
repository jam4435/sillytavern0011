"""Exact coordinate repair must not guess ambiguity or expand supplied evidence."""
import unittest
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
from repair_pending import corrected_reference, check_repair_ownership
from test_pipeline import FixtureCorpus


class ExactRepairTest(unittest.TestCase):
    def test_repair_only_between_calls_of_owning_supervisor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch('repair_pending.HERE',root):
                check_repair_ownership()
                lock=root/'.supervisor.lock'
                lock.write_text(str(os.getpid()),encoding='utf-8')
                check_repair_ownership()
                lock.write_text(str(os.getpid()+1),encoding='utf-8')
                with self.assertRaisesRegex(ValueError,'another supervisor'):
                    check_repair_ownership()
                lock.write_text(str(os.getpid()),encoding='utf-8')
                (root/'.controller.lock').write_text(str(os.getpid()),encoding='utf-8')
                with self.assertRaisesRegex(ValueError,'still running'):
                    check_repair_ownership()

    def test_unique_exact_line_is_repaired_without_mutating_input(self):
        corpus=FixtureCorpus('另一行文字。\n甲收乙为徒，传授绝艺。').real
        ref=dict(book='天龙八部',line=1,anchor='甲收乙为徒')
        self.assertEqual(corrected_reference(ref,{('天龙八部',2)},corpus),
                         dict(book='天龙八部',line=2,anchor='甲收乙为徒'))
        self.assertEqual(ref['line'],1)

    def test_missing_ambiguous_or_unsupplied_anchor_rejects(self):
        for source,anchor,allowed in [
            ('甲收乙为徒。','甲收乙為徒',{('天龙八部',1)}),
            ('甲收乙为徒。\n甲收乙为徒。','甲收乙为徒',{('天龙八部',1)}),
            ('甲收乙为徒。','甲收乙为徒',set()),
            ('甲收乙\n为徒。','甲收乙\n为徒',{('天龙八部',1),('天龙八部',2)})]:
            with self.subTest(source=source,anchor=anchor):
                with self.assertRaises(ValueError):
                    corrected_reference(dict(book='天龙八部',line=1,anchor=anchor),allowed,FixtureCorpus(source).real)


if __name__ == '__main__':
    unittest.main()
