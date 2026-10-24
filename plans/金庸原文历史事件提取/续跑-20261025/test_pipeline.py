"""Acceptance paths for literal source evidence, including legacy false positives."""
import unittest
import pipeline as p


class FixtureCorpus:
    def __init__(self, text):
        self.real = p.Corpus.__new__(p.Corpus)
        self.real.texts = {'天龙八部': text}
        self.real.offsets = {'天龙八部': [0] + [i + 1 for i, c in enumerate(text) if c == '\n']}
        self.real.chapters = {'天龙八部': [dict(start=1, end=20, seq=1)]}
        self.real.hashes = {'天龙八部': 'fixture'}


class EvidenceTest(unittest.TestCase):
    def bind(self, excerpt, position, text):
        card = dict(book='天龙八部', fields={f: '无' for f in p.FIELDS})
        card['fields'].update(原文摘录=excerpt, 原文位置=position)
        return p.bind_card(card, FixtureCorpus(text).real)

    def test_nested_quotes_are_preserved(self):
        self.assertEqual(p.quotes('“他说“小无相功”只传了一人”'), (['他说“小无相功”只传了一人'], None))

    def test_natural_ellipsis_is_not_an_omission(self):
        c = self.bind('“我……我没有”', '行 1（命中行 1）', '我……我没有\n我\n我')
        self.assertEqual(c['mechanical_status'], 'exact')
        self.assertEqual(len(c['evidence']), 1)

    def test_short_fabricated_segment_is_not_ignored(self):
        c = self.bind('“原文已有的话……编造”', '行 1（命中行 1）', '原文已有的话')
        self.assertEqual(c['mechanical_status'], 'needs_review')
        self.assertIn('excerpt_not_found', c['mechanical_issues'])

    def test_punctuation_changes_fail(self):
        c = self.bind('“他说：不是。”', '行 1（命中行 1）', '他说，不是。')
        self.assertEqual(c['mechanical_status'], 'needs_review')

    def test_ambiguous_matches_are_not_guessed(self):
        c = self.bind('“同一句话”', '行 3（命中行 3）', '同一句话\n同一句话\n其他')
        self.assertEqual(c['mechanical_status'], 'needs_review')

    def test_unique_match_repairs_wrong_coordinate(self):
        c = self.bind('“唯一证据”', '行 1（命中行 1）', '其他\n唯一证据')
        self.assertTrue(c['hit_line_changed'])
        self.assertEqual(c['evidence'][0]['start'], 2)

    def test_multiline_exact_excerpt_keeps_range(self):
        c = self.bind('“第一行\n第二行”', '行 1（命中行 1）', '第一行\n第二行')
        self.assertEqual((c['evidence'][0]['start'], c['evidence'][0]['end']), (1, 2))

    def test_missing_field_prevents_pass(self):
        card = dict(book='天龙八部', fields={'原文摘录': '“证据”', '原文位置': '行 1'})
        c = p.bind_card(card, FixtureCorpus('证据').real)
        self.assertEqual(c['mechanical_status'], 'needs_review')

    def test_unbalanced_quotes_require_review(self):
        self.assertEqual(p.quotes('“外层“内层”')[1], 'unbalanced_quotes')


if __name__ == '__main__':
    unittest.main()
