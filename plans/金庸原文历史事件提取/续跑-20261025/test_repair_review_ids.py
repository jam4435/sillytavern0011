"""Identifier recovery must neither invent reviews nor merge ambiguous IDs."""
import unittest
from repair_review_ids import restore_ids


class ReviewIdRepairTest(unittest.TestCase):
    def test_only_omitted_book_segment_changes_and_input_is_preserved(self):
        reviews=[dict(uid='批次E/_body.md#EV-0010',verdict='corrected',reason='reason',event={'title':'event'})]
        fixed,changes=restore_ids(reviews,['批次E/_body.md#EV-倚天-0010'])
        self.assertEqual(fixed[0],{**reviews[0],'uid':'批次E/_body.md#EV-倚天-0010'})
        self.assertEqual(reviews[0]['uid'],'批次E/_body.md#EV-0010')
        self.assertEqual(len(changes),1)

    def test_full_ids_and_order_are_preserved(self):
        expected=['f#EV-甲-0001','f#EV-甲-0002']
        reviews=[dict(uid=expected[1]),dict(uid='f#EV-0001')]
        fixed,_=restore_ids(reviews,expected)
        self.assertEqual([r['uid'] for r in fixed],[expected[1],expected[0]])

    def test_missing_duplicate_unknown_path_ambiguous_or_changed_number_rejects(self):
        cases=[([],['f#EV-甲-0001']),
               ([dict(uid='f#EV-0001')]*2,['f#EV-甲-0001','f#EV-甲-0002']),
               ([dict(uid='g#EV-0001')],['f#EV-甲-0001']),
               ([dict(uid='f#EV-0001'),dict(uid='f#EV-乙-0001')],['f#EV-甲-0001','f#EV-乙-0001']),
               ([dict(uid='f#EV-1')],['f#EV-甲-0001']),
               ([dict(uid='f#EV-0002')],['f#EV-甲-0001'])]
        for reviews,expected in cases:
            with self.subTest(reviews=reviews,expected=expected):
                with self.assertRaises(ValueError):restore_ids(reviews,expected)


if __name__=='__main__':unittest.main()
