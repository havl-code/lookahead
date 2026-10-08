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


class TestTrimmedAverage:
    def test_drops_the_best_and_worst(self):
        assert stats.trimmed_average([10, 11, 12, 13, 14]) == 12

    def test_one_dnf_is_the_worst(self):
        assert stats.trimmed_average([10, None, 12, 13, 14]) == 13

    def test_two_dnfs_make_a_dnf(self):
        assert stats.trimmed_average([10, None, 12, None, 14]) is None

    def test_a_wider_trim(self):
        # Ao50 and Ao100 drop 5% from each end, so a trim of 3 or 5
        assert stats.trimmed_average([1, 2, 3, 50, 50, 50, 97, 98, 99], trim=3) == 50
        assert stats.trimmed_average([None] * 3 + [10] * 6, trim=3) == 10
        assert stats.trimmed_average([None] * 4 + [10] * 6, trim=3) is None

    def test_matches_wca_average(self):
        rows = solves(10, 'DNF', (12, '+2'), 13, 11)
        results = [stats.effective_time_ms(r) for r in rows]
        assert stats.trimmed_average(results) == stats.wca_average(rows)


class TestRollingWcaAverages:
    def test_windows_fill_up_before_a_value_shows(self):
        assert stats.rolling_wca_averages([1, 2, 3, 4, 5, 6], 5) == [None, None, None, None, 3, 4]
        assert stats.rolling_wca_averages([1, 2, 3, 4, 5, 6], 12) == [None] * 6

    def test_ao12_window(self):
        assert stats.rolling_wca_averages(list(range(1, 13)), 12)[-1] == 6.5

    def test_dnfs_count_the_wca_way(self):
        averages = stats.rolling_wca_averages([10, 20, None, 10, 20, None, 15], 5)
        # 10, 20, DNF, 10, 20: one DNF, dropped as the worst; then 20, DNF, 10, 20, DNF: two DNFs
        assert averages[4] == pytest.approx(50 / 3)
        assert averages[5] is None
        assert averages[6] is None  # DNF, 10, 20, DNF, 15 still has two


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
