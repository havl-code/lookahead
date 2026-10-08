"""stats.py: rounding, the WCA-style Ao5 and Ao12, and the chart maths."""

import math

import pytest

from speedcube import stats


def solve(seconds=None, penalty=None, dnf=False):
    """A solve row as stats.py sees it (time in ms)."""
    return {'time_ms': round((seconds or 10) * 1000), 'penalty': penalty, 'dnf': dnf}


def solves(*results):
    rows = []
    for r in results:
        if r == 'DNF':
            rows.append(solve(dnf=True, penalty='DNF'))
        elif isinstance(r, tuple):
            rows.append(solve(r[0], r[1]))
        else:
            rows.append(solve(r))
    return rows


class TestRounding:
    @pytest.mark.parametrize('value, expected', [(12.5, 13), (13.5, 14), (2.4999, 2), (0.5, 1), (7, 7)])
    def test_round_half_up_sends_halves_up(self, value, expected):
        assert stats.round_half_up(value) == expected

    def test_round_half_up_differs_from_bankers_rounding(self):
        assert round(12.5) == 12 and stats.round_half_up(12.5) == 13

    def test_round_to_passes_none_through(self):
        assert stats.round_to(None) is None

    def test_round2_rounds_halves_up(self):
        assert stats.round2(2.125) == 2.13  # 2.125 is exact in binary, so this is a true half

    def test_ms_to_seconds(self):
        assert stats.ms_to_seconds(12340) == 12.34
        assert stats.ms_to_seconds(None) is None


class TestEffectiveTime:
    def test_ok(self):
        assert stats.effective_time_ms(solve(12)) == 12000

    def test_plus_two_adds_two_seconds(self):
        assert stats.effective_time_ms(solve(12, '+2')) == 14000

    def test_dnf_has_no_time(self):
        assert stats.effective_time_ms(solve(12, 'DNF', dnf=True)) is None


class TestWcaAverage:
    def test_ao5_drops_best_and_worst(self):
        assert stats.wca_average(solves(10, 11, 12, 13, 14)) == 12000

    def test_ao5_one_dnf_counts_as_the_worst(self):
        assert stats.wca_average(solves(10, 'DNF', 12, 13, 14)) == 13000

    def test_ao5_two_dnfs_make_a_dnf(self):
        assert stats.wca_average(solves(10, 'DNF', 12, 'DNF', 14)) is None

    def test_ao5_includes_plus_two(self):
        # 11 + 2 = 13, so the window is 10, 12, 13, 13, 14 and the middle three are 12, 13, 13
        assert stats.wca_average(solves(10, (11, '+2'), 12, 13, 14)) == pytest.approx(38000 / 3)

    def test_ao12_drops_one_best_and_one_worst(self):
        assert stats.wca_average(solves(*range(1, 13))) == 6500

    def test_ao12_one_dnf(self):
        # Drop the 1 and the DNF, and average 2 to 11
        assert stats.wca_average(solves(*range(1, 12), 'DNF')) == 6500

    def test_ao12_two_dnfs(self):
        assert stats.wca_average(solves(*range(1, 11), 'DNF', 'DNF')) is None


class TestRollingAverages:
    def test_windows_fill_up_before_a_value_shows(self):
        rolling5, rolling12 = stats.rolling_averages([1, 2, 3, 4, 5, 6])
        assert rolling5 == [None, None, None, None, 3, 4]
        assert rolling12 == [None] * 6

    def test_ao12_window(self):
        _, rolling12 = stats.rolling_averages(list(range(1, 13)))
        assert rolling12[-1] == 6.5


class TestStdDev:
    def test_sample_needs_two_values(self):
        assert stats.sample_std_dev([5]) == 0
        assert stats.sample_std_dev([1, 3]) == pytest.approx(math.sqrt(2))

    def test_population(self):
        assert stats.population_std_dev([]) == 0
        assert stats.population_std_dev([1, 3]) == 1


class TestQuantile:
    def test_empty(self):
        assert stats.quantile([], 0.5) is None

    def test_single_value(self):
        assert stats.quantile([5], 0.9) == 5

    @pytest.mark.parametrize('q, expected', [(0, 1), (0.25, 1.75), (0.5, 2.5), (1, 4)])
    def test_interpolates(self, q, expected):
        assert stats.quantile([1, 2, 3, 4], q) == expected


class TestBoxStats:
    def test_summary_and_whiskers(self):
        box = stats.box_stats([1, 2, 3, 4, 100])
        assert (box['count'], box['q1'], box['median'], box['q3']) == (5, 2, 3, 4)
        # Whiskers reach the furthest times within 1.5 box heights (3) of the box: 1 and 4
        assert (box['lowerfence'], box['upperfence']) == (1, 4)
        assert box['mean'] == 22
        assert box['sd'] == pytest.approx(stats.population_std_dev([1, 2, 3, 4, 100]))


class TestDistributionOutliers:
    def test_identical_times_are_kept(self):
        assert stats.filter_distribution_outliers([10.0] * 5) == [10.0] * 5

    def test_a_far_outlier_is_dropped(self):
        times = [10.0] * 20 + [10.5] * 20 + [100.0]
        assert stats.filter_distribution_outliers(times) == [10.0] * 20 + [10.5] * 20

    def test_percentiles_are_used_when_too_many_would_go(self):
        # 10.6% of times sit just beyond 3 standard deviations, more than the 10% limit, so
        # the 1st to 99th percentile is kept instead (which here is everything)
        times = [0.0] * 53 + [20.0] * 53 + [10.0] * 894
        assert len(stats.filter_distribution_outliers(times)) == 1000
