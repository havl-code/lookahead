"""The Analytics scores: Speed, Consistency and Overall, each from 0 to 100.

docs/SCORES.md explains them for users, and tools/build_wca_reference.py builds the WCA table
in wca_reference.json that they compare against. All three measure things the same way; keep
them in step.

Both scores place one session among WCA competitors in the same event over the two years up to
the export date, as the share of those competitors the session beats:

- Speed: the session's typical result, scored the way the WCA ranks the event. The session's
  solves are taken in consecutive groups the size of an official round (5 for an average of 5,
  3 for a mean of 3 or best of 3), each group is scored like a round, and the median is taken.
- Consistency: how much back-to-back completed solves differ, relative to the typical solve.
  Comparing neighbouring solves means a session's long-term improvement isn't mistaken for
  inconsistency, and taking the median gap means one lockup doesn't dominate.

Overall is the average of the two.
"""

import bisect
import json
import statistics
from functools import cache
from pathlib import Path

DNF = float('inf')  # a DNF counts as slower than any time
# For normally distributed times, the median gap between two independent solves is
# 0.9539 standard deviations (the square root of 2, times 0.6745), so dividing a median gap by
# this estimates the standard deviation. It's the median moving range estimate used in
# statistical process control.
MEDIAN_RANGE_TO_SD = 0.9539


@cache
def reference():
    path = Path(__file__).resolve().with_name('wca_reference.json')
    return json.loads(path.read_text(encoding='utf-8'))


def median_with_dnf(values):
    """The median, where a DNF counts as slower than any time, so it can be a DNF."""
    values = sorted(values)
    n = len(values)
    return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2


def round_result(attempts, kind):
    """One group of results (ms, None for a DNF) scored like a WCA round: the best single for a
    best of N, otherwise the average, which drops the best and worst of 5 (none of 3) and is a
    DNF if a DNF is left in."""
    times = sorted(DNF if a is None else a for a in attempts)
    if kind == 'best':
        return times[0]
    trim = 1 if len(times) == 5 else 0
    kept = times[trim:len(times) - trim]
    return DNF if DNF in kept else sum(kept) / len(kept)


def typical_result(results, kind, size):
    """The median round result over consecutive groups of `size` results, or None if there
    isn't a full group. A last group that isn't full is left out."""
    rounds = [results[i:i + size] for i in range(0, len(results) - size + 1, size)]
    if not rounds:
        return None
    return median_with_dnf([round_result(group, kind) for group in rounds])


def spread(results, min_pairs):
    """Back-to-back variation as a fraction of the typical (median) completed result, or None
    with fewer than `min_pairs` pairs of back-to-back completed results."""
    gaps = [abs(b - a) for a, b in zip(results, results[1:]) if a is not None and b is not None]
    if len(gaps) < min_pairs:
        return None
    sd = statistics.median(gaps) / MEDIAN_RANGE_TO_SD
    return sd / statistics.median(r for r in results if r is not None)


def share_below(quantiles, value):
    """Where `value` falls among the competitors these quantiles describe (from 0, below
    everyone, to 1, above everyone), counting anyone exactly level as half below."""
    lo = bisect.bisect_left(quantiles, value)
    hi = bisect.bisect_right(quantiles, value)
    steps = len(quantiles) - 1
    if lo < hi:
        return (lo + hi - 1) / 2 / steps
    if lo == 0:
        return 0.0
    if lo == len(quantiles):
        return 1.0
    below, above = quantiles[lo - 1], quantiles[lo]
    return (lo - 1 + (value - below) / (above - below)) / steps


def speed_score(speed_ref, typical_ms):
    """The percentage of competitors whose typical result is slower."""
    dnf_share = speed_ref['dnf_share']
    if typical_ms == DNF:
        return 100 * dnf_share / 2  # level with everyone else whose typical result is a DNF
    faster = share_below(speed_ref['quantiles_cs'], typical_ms / 10)
    return 100 * ((1 - dnf_share) * (1 - faster) + dnf_share)


def consistency_score(consistency_ref, session_spread):
    """The percentage of competitors whose solves vary more."""
    return 100 * (1 - share_below(consistency_ref['quantiles'], session_spread))


def session_scores(event_id, results):
    """Scores for one session's results (ms in solve order, None for a DNF). A score is None
    when there's no WCA comparison for the event or not enough solves to measure it."""
    ref = reference()
    event = ref['events'].get(event_id)
    out = {'speed_score': None, 'consistency_score': None, 'overall_score': None,
           'typical_result': None, 'spread': None}
    if event is None:
        return out

    typical = typical_result(results, event['result'], event['solves_per_round'])
    if typical is not None:
        out['typical_result'] = None if typical == DNF else typical / 1000
        out['speed_score'] = speed_score(event['speed'], typical)

    session_spread = spread(results, ref['min_pairs'])
    if session_spread is not None and 'consistency' in event:
        out['spread'] = session_spread
        out['consistency_score'] = consistency_score(event['consistency'], session_spread)

    if out['speed_score'] is not None and out['consistency_score'] is not None:
        out['overall_score'] = (out['speed_score'] + out['consistency_score']) / 2
    return out
