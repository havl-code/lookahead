"""scores.py: the Analytics scores (docs/SCORES.md explains them for users)."""

import pytest

from speedcube import scores
from speedcube.scores import DNF


class TestRoundResult:
    def test_average_of_5_drops_best_and_worst(self):
        assert scores.round_result([10000, 11000, 12000, 13000, 14000], 'average') == 12000

    def test_average_of_5_with_one_dnf(self):
        assert scores.round_result([None, 11000, 12000, 13000, 14000], 'average') == 13000

    def test_average_of_5_with_two_dnfs(self):
        assert scores.round_result([None, 11000, None, 13000, 14000], 'average') == DNF

    def test_mean_of_3_keeps_all_three(self):
        assert scores.round_result([10000, 11000, 15000], 'average') == 12000

    def test_mean_of_3_with_a_dnf(self):
        assert scores.round_result([10000, None, 12000], 'average') == DNF

    def test_best_of_3(self):
        assert scores.round_result([None, 12000, 11000], 'best') == 11000

    def test_best_of_3_all_dnf(self):
        assert scores.round_result([None, None, None], 'best') == DNF


class TestTypicalResult:
    def test_median_of_rounds(self):
        # Rounds of 5: Ao5 12000 and Ao5 22000, so the median is their mean
        results = [10000, 11000, 12000, 13000, 14000, 20000, 21000, 22000, 23000, 24000]
        assert scores.typical_result(results, 'average', 5) == 17000

    def test_leftover_solves_are_left_out(self):
        results = [10000, 11000, 12000, 13000, 14000, 1, 1]
        assert scores.typical_result(results, 'average', 5) == 12000

    def test_needs_a_full_round(self):
        assert scores.typical_result([10000, 11000], 'average', 5) is None

    def test_a_dnf_round_counts_as_slowest(self):
        rounds = [None, None, 10000, 10000, 10000,
                  12000, 12000, 12000, 12000, 12000,
                  13000, 13000, 13000, 13000, 13000]
        assert scores.typical_result(rounds, 'average', 5) == 13000

    def test_median_with_dnf(self):
        assert scores.median_with_dnf([DNF, DNF, 5]) == DNF


class TestSpread:
    def test_back_to_back_gaps_relative_to_the_median(self):
        results = [10000, 11000] * 10 + [10000]  # 20 gaps of 1000; median result 10000
        assert scores.spread(results, 20) == pytest.approx(1000 / scores.MEDIAN_RANGE_TO_SD / 10000)

    def test_pairs_with_a_dnf_are_skipped(self):
        results = [10000, 11000] * 10 + [10000, None]
        assert scores.spread(results, 20) == pytest.approx(1000 / scores.MEDIAN_RANGE_TO_SD / 10000)

    def test_too_few_pairs(self):
        results = [10000, None] * 15  # no back-to-back completed pairs at all
        assert scores.spread(results, 20) is None

    def test_just_short_of_enough_pairs(self):
        assert scores.spread([10000, 11000] * 10, 20) is None  # 19 pairs


class TestShareBelow:
    QUANTILES = [10, 20, 30, 40, 50]

    def test_below_everyone(self):
        assert scores.share_below(self.QUANTILES, 5) == 0.0

    def test_above_everyone(self):
        assert scores.share_below(self.QUANTILES, 60) == 1.0

    def test_between_points(self):
        assert scores.share_below(self.QUANTILES, 25) == pytest.approx(1.5 / 4)

    def test_exactly_on_a_point(self):
        assert scores.share_below(self.QUANTILES, 30) == 0.5

    def test_ties_count_as_half_below(self):
        assert scores.share_below([10, 20, 20, 20, 50], 20) == 0.5


class TestScoresFromReference:
    def test_speed_score(self):
        ref = {'dnf_share': 0.1, 'quantiles_cs': [1000, 2000, 3000]}
        # 15 s is a quarter of the way up, so 75% of finishers are slower, plus every DNF
        assert scores.speed_score(ref, 15000) == pytest.approx(100 * (0.9 * 0.75 + 0.1))

    def test_speed_score_for_a_dnf_typical_result(self):
        assert scores.speed_score({'dnf_share': 0.3, 'quantiles_cs': [1, 2]}, DNF) == pytest.approx(15)

    def test_consistency_score(self):
        assert scores.consistency_score({'quantiles': [0.05, 0.1, 0.2]}, 0.1) == 50

    def test_event_with_no_reference(self):
        out = scores.session_scores('333mbf', [600000] * 30)
        assert out == {'speed_score': None, 'consistency_score': None, 'overall_score': None,
                       'typical_result': None, 'spread': None}

    def test_unknown_event(self):
        assert scores.session_scores('nope', [10000] * 30)['speed_score'] is None

    def test_a_full_session_gets_all_three(self):
        results = [12000 + (i * 733) % 3000 for i in range(25)]
        out = scores.session_scores('333', results)
        assert 0 <= out['speed_score'] <= 100 and 0 <= out['consistency_score'] <= 100
        assert out['overall_score'] == pytest.approx((out['speed_score'] + out['consistency_score']) / 2)
        assert out['typical_result'] is not None and out['spread'] is not None

    def test_too_short_for_consistency(self):
        out = scores.session_scores('333', [12000] * 10)
        assert out['speed_score'] is not None
        assert out['consistency_score'] is None and out['overall_score'] is None

    def test_events_without_a_consistency_reference(self):
        out = scores.session_scores('444bf', [300000 + i for i in range(30)])
        assert out['speed_score'] is not None and out['consistency_score'] is None

    def test_reference_is_loaded_once(self):
        assert scores.reference() is scores.reference()
        assert scores.reference()['min_pairs'] == 20
