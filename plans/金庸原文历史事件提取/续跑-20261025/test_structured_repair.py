"""Targeted semantic repairs keep accepted entries and event IDs unchanged."""
from copy import deepcopy
import unittest
from structured_repair import apply_repairs


class StructuredRepairTest(unittest.TestCase):
    def setUp(self):
        self.original=dict(task_id='t',coverage=dict(start=1,end=2,complete=True),
            new_events=[dict(title='accepted'),dict(title='rejected',people=[])],
            reviews=[dict(uid='keep',verdict='supported'),dict(uid='fix',verdict='corrected')],
            unresolved=['original question'],cross_links=[])
        self.issues=[dict(new_event=2,error='missing people'),dict(uid='fix',error='too many references')]
        self.patch=dict(task_id='t',new_events=[dict(index=2,event=dict(title='repaired',people=['原文集团']))],
                        reviews=[dict(uid='fix',verdict='not_historical',reason='当前场景',event=None)],unresolved=[])

    def test_only_rejected_slots_change_without_shifting_ids(self):
        before=deepcopy(self.original)
        repaired=apply_repairs(self.original,self.patch,self.issues)
        self.assertEqual(self.original,before)
        self.assertEqual(len(repaired['new_events']),2)
        self.assertEqual(repaired['new_events'][0],before['new_events'][0])
        self.assertEqual(repaired['reviews'][0],before['reviews'][0])
        for key in ['coverage','unresolved','cross_links']:self.assertEqual(repaired[key],before[key])
        self.assertEqual(repaired['reviews'][1]['verdict'],'not_historical')

    def test_missing_duplicate_unknown_or_unresolved_targets_reject(self):
        mutations=[lambda p:p.update(task_id='wrong'),lambda p:p.update(unresolved=['cannot support']),
            lambda p:p.update(new_events=[]),lambda p:p['new_events'].append(p['new_events'][0]),
            lambda p:p['new_events'][0].update(index=1),lambda p:p['new_events'][0].update(event=None),
            lambda p:p.update(reviews=[]),lambda p:p['reviews'][0].update(uid='keep'),
            lambda p:p['reviews'].append(p['reviews'][0]),lambda p:p['reviews'][0].update(verdict='supported')]
        for mutate in mutations:
            patch=deepcopy(self.patch);mutate(patch)
            with self.subTest(patch=patch):
                with self.assertRaises(ValueError):apply_repairs(self.original,patch,self.issues)


if __name__=='__main__':unittest.main()
