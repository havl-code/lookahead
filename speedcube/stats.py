"""The WCA-style Ao5/Ao12 calculation, and the small numeric helpers the chart routes use.

Solve times are stored in milliseconds as the raw attempt time; a +2 penalty is added on top
wherever a result is shown or averaged, as in WCA competitions. (Session totals such as best
and mean are worked out in SQL; see db.recompute_session_stats.)
"""

import math


def round_half_up(value):
    """Round to the nearest whole number, with halves going up (12.5 to 13), the way people
    expect times to round. Python's round() sends halves to the nearest even number instead."""
    return math.floor(value + 0.5)


def round_to(value, decimals=2):
    if value is None:
        return None
    factor = 10 ** decimals
    return round_half_up(value * factor) / factor


def round2(value):
    return round_to(value, 2)


# Results are written the way the WCA records them. Regulation 9f1: a single under 10 minutes is
# truncated (cut off, not rounded) to the hundredth of a second, and an average or mean under 10
# minutes is rounded to the nearest hundredth. Regulation 9f2: from 10 minutes up, singles are
# truncated and averages rounded to the whole second. Averages are worked out from the truncated
# singles, as they are from the times recorded in a competition.
TEN_MINUTES_MS = 10 * 60 * 1000


def wca_single_ms(ms):
    """A single as the WCA records it, in ms: truncated to the hundredth, or the second from 10
    minutes up. None (a DNF) passes through."""
    if ms is None:
        return None
    ms = int(ms)
    return ms - ms % 1000 if ms >= TEN_MINUTES_MS else ms - ms % 10


def single_seconds(ms):
    """A single result in seconds, as the WCA records it (Regulations 9f1 and 9f2)."""
    return round2(wca_single_ms(ms) / 1000) if ms is not None else None


def average_seconds(ms):
    """An average or mean in seconds, as the WCA records it: rounded to the hundredth, or to the
    second from 10 minutes up, with halves going up."""
    if ms is None:
        return None
    if ms >= TEN_MINUTES_MS:
        return float(round_half_up(ms / 1000))
    return round_half_up(ms / 10) / 100


def effective_time_ms(solve):
    """A solve's result in ms: None for a DNF, the raw time plus 2000 for a +2 penalty."""
    if solve['dnf']:
        return None
    return solve['time_ms'] + 2000 if solve['penalty'] == '+2' else solve['time_ms']


def wca_average(window):
    """WCA-style average of an Ao5 or Ao12 window of solves, in ms.

    The best and worst results are dropped (a DNF counts as the worst) and the rest are
    averaged. Two or more DNFs make the whole average a DNF, which is returned as None.
    """
    # Averaged from the singles as the WCA records them (truncated, Regulation 9f1)
    times = [wca_single_ms(effective_time_ms(s)) for s in window if not s['dnf']]
    if len(window) - len(times) > 1:
        return None
    middle = sorted(times)[1:len(window) - 1]
    return sum(middle) / len(middle)


def trimmed_average(results, trim=1):
    """A WCA-style average of results (ms, None for a DNF): drop the best `trim` and the worst
    `trim`, where a DNF counts as slower than any time, and average the rest. More DNFs than
    `trim` make it a DNF, returned as None. With trim=1 over 5 results this is Regulations 9f8
    and 9f9."""
    dnfs = sum(r is None for r in results)
    if dnfs > trim:
        return None
    times = sorted(wca_single_ms(r) for r in results if r is not None)
    kept = times[trim:len(results) - trim]
    return sum(kept) / len(kept)


def rolling_wca_averages(results, size):
    """The WCA-style average of each run of `size` results in a row (ms, None for a DNF), in
    order, for the charts' rolling Ao5 and Ao12. None until a window fills, and None for a window
    that's a DNF; DNFs count the WCA way rather than being skipped."""
    return [trimmed_average(results[i - size + 1:i + 1]) if i >= size - 1 else None
            for i in range(len(results))]


def sample_std_dev(values):
    n = len(values)
    if n < 2:
        return 0
    mean = sum(values) / n
    return math.sqrt(sum((x - mean) ** 2 for x in values) / (n - 1))


def population_std_dev(values):
    n = len(values)
    if n == 0:
        return 0
    mean = sum(values) / n
    return math.sqrt(sum((x - mean) ** 2 for x in values) / n)


def quantile(sorted_values, q):
    """Linear-interpolated quantile of an already sorted list."""
    n = len(sorted_values)
    if n == 0:
        return None
    index = q * (n - 1)
    lower, upper = math.floor(index), math.ceil(index)
    if lower == upper:
        return sorted_values[lower]
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * (index - lower)


def box_stats(sorted_times):
    """Box plot summary of an already sorted list: quartiles, whiskers (the furthest times
    within 1.5 times the box height of the box), mean and standard deviation."""
    q1, median, q3 = (quantile(sorted_times, q) for q in (0.25, 0.5, 0.75))
    reach = 1.5 * (q3 - q1)
    return {
        'count': len(sorted_times),
        'q1': q1,
        'median': median,
        'q3': q3,
        'lowerfence': next(t for t in sorted_times if t >= q1 - reach),
        'upperfence': next(t for t in reversed(sorted_times) if t <= q3 + reach),
        'mean': sum(sorted_times) / len(sorted_times),
        'sd': population_std_dev(sorted_times),
    }


def filter_distribution_outliers(times):
    """Drop times more than 3 standard deviations from the mean. If that would throw away
    more than 10% of them, keep the 1st to 99th percentile instead."""
    std_dev = sample_std_dev(times)
    if std_dev <= 0:
        return times

    mean = sum(times) / len(times)
    filtered = [t for t in times if mean - 3 * std_dev <= t <= mean + 3 * std_dev]

    if len(filtered) < len(times) * 0.9:
        ordered = sorted(times)
        p1, p99 = quantile(ordered, 0.01), quantile(ordered, 0.99)
        filtered = [t for t in times if p1 <= t <= p99]
    return filtered
