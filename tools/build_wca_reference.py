"""Build speedcube/wca_reference.json, the table the Analytics scores compare against.

This is a maintainer tool, not part of normal use: the app ships with the table it builds, so
it works offline. Rebuild it now and then from a fresh WCA results export:

    uv run tools/build_wca_reference.py path/to/WCA_export_v2_..._tsv.zip

Download the TSV export from https://www.worldcubeassociation.org/export/results. The method
is explained for users in docs/SCORES.md, and speedcube/scores.py measures a session the same
way; keep all three in step.

For each timed event, it looks at official results from the WINDOW_YEARS before the export
date and records, for every competitor in that time:

- Typical result (for Speed): the median of their round results. A round's result is what the
  WCA ranks it by: the average for average of 5 and mean of 3 rounds, and the best single for
  best of 3 rounds (the blindfolded events). A DNF counts as slower than any time.
- Spread (for Consistency): how much their back-to-back completed attempts within a round
  differ, relative to their typical attempt. Only competitors with at least MIN_PAIRS such
  pairs are included, so each person's spread is reasonably well measured.

The table keeps where those values fall (the value at every 0.1% of competitors), which is all
the app needs to place a session among them. An event needs at least MIN_COMPETITORS people
for each score; otherwise the app shows no score for it.
"""

import csv
import json
import statistics
import sys
import zipfile
from array import array
from collections import defaultdict
from datetime import date
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent

# The same rules the app uses on a session (src/lib/scores.ts), so competitors and sessions are
# measured alike.
DNF = float('inf')  # a DNF counts as slower than any time
# For normally distributed times, the median gap between two independent solves is
# 0.9539 standard deviations (the square root of 2, times 0.6745), so dividing a median gap by
# this estimates the standard deviation. It's the median moving range estimate used in
# statistical process control.
MEDIAN_RANGE_TO_SD = 0.9539


def median_with_dnf(values):
    """The median, where a DNF counts as slower than any time, so it can be a DNF."""
    values = sorted(values)
    n = len(values)
    return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2


OUTPUT = PROJECT_DIR / 'speedcube' / 'wca_reference.json'
WINDOW_YEARS = 2
QUANTILE_STEPS = 1000        # one point per 0.1% of competitors
MIN_PAIRS = 20               # back-to-back completed attempts needed to measure someone's spread
MIN_COMPETITORS = 100        # fewer than this is too few people to compare a session with
# Results that aren't times (Fewest Moves counts moves, Multi-Blind scores points)
NOT_TIMED = {'333fm', '333mbf', '333mbo'}
# format_id -> (what a round is ranked by, attempts per round)
FORMATS = {'a': ('average', 5), 'm': ('average', 3),
           '1': ('best', 1), '2': ('best', 2), '3': ('best', 3)}

csv.field_size_limit(1 << 30)


def read_tsv(archive, name):
    with archive.open(name) as raw:
        lines = (line.decode('utf-8') for line in raw)
        yield from csv.DictReader(lines, delimiter='\t', quoting=csv.QUOTE_NONE)


def spread_quantiles(values):
    values = sorted(values)
    inner = statistics.quantiles(values, n=QUANTILE_STEPS, method='inclusive')
    return [values[0], *inner, values[-1]]


def main(export_path):
    archive = zipfile.ZipFile(export_path)
    metadata = json.loads(archive.read('metadata.json'))
    export_day = date.fromisoformat(metadata['export_date'][:10])
    window_start = export_day.replace(year=export_day.year - WINDOW_YEARS)

    competition_dates = {
        row['id']: date(int(row['end_year']), int(row['end_month']), int(row['end_day']))
        for row in read_tsv(archive, 'WCA_export_competitions.tsv') if row['cancelled'] != '1'
    }
    timed_events = {
        row['id'] for row in read_tsv(archive, 'WCA_export_events.tsv')
        if row['format'] == 'time' and row['id'] not in NOT_TIMED
    }

    # ---- Round results, for Speed ----
    round_results = defaultdict(lambda: {'average': defaultdict(list), 'best': defaultdict(list)})
    format_counts = defaultdict(lambda: defaultdict(int))
    result_owner = {}  # results.id -> (event, person), for matching up attempts below
    for row in read_tsv(archive, 'WCA_export_results.tsv'):
        event = row['event_id']
        held = competition_dates.get(row['competition_id'])
        if event not in timed_events or held is None or not window_start < held <= export_day:
            continue
        result_owner[int(row['id'])] = (event, row['person_id'])
        if row['format_id'] in FORMATS:
            format_counts[event][FORMATS[row['format_id']]] += 1
        for kind in ('average', 'best'):
            value = int(row[kind])
            if value in (0, -2):  # none recorded for this round, or did not start
                continue
            round_results[event][kind][row['person_id']].append(DNF if value == -1 else value)

    # ---- Attempts, for Consistency ----
    # Each person's completed attempts, and the gaps between back-to-back completed attempts in
    # the same round. Arrays keep the millions of numbers small in memory.
    attempts = defaultdict(lambda: array('i'))
    gaps = defaultdict(lambda: array('i'))

    def add_round(result_id, round_attempts):
        owner = result_owner.get(result_id)
        if owner is None:
            return
        values = [value for _, value in sorted(round_attempts)]
        attempts[owner].extend(v for v in values if v > 0)
        gaps[owner].extend(abs(b - a) for a, b in zip(values, values[1:]) if a > 0 and b > 0)

    # The file lists each round's attempts together, so handle one round at a time.
    current_id, current = None, []
    seen = set()
    for row in read_tsv(archive, 'WCA_export_result_attempts.tsv'):
        result_id = int(row['result_id'])
        if result_id != current_id:
            if current_id is not None:
                add_round(current_id, current)
                if current_id in result_owner:
                    seen.add(current_id)
            if result_id in seen:
                sys.exit(f'Attempts for result {result_id} are split up; this script needs '
                         'each round\'s attempts listed together.')
            current_id, current = result_id, []
        current.append((int(row['attempt_number']), int(row['value'])))
    if current_id is not None:
        add_round(current_id, current)

    spreads = defaultdict(list)
    for (event, _person), person_gaps in gaps.items():
        if len(person_gaps) >= MIN_PAIRS:
            sd = statistics.median(person_gaps) / MEDIAN_RANGE_TO_SD
            spreads[event].append(sd / statistics.median(attempts[(event, _person)]))

    # ---- The table ----
    events = {}
    for event in sorted(round_results):
        # Compare each event the way it's officially ranked, using its most common format.
        kind, solves = max(format_counts[event], key=format_counts[event].get)
        typical = [median_with_dnf(v) for v in round_results[event][kind].values()]
        times = [t for t in typical if t != DNF]
        if len(times) < MIN_COMPETITORS:
            continue
        entry = {
            'result': kind,
            'solves_per_round': solves,
            'speed': {
                'competitors': len(typical),
                'dnf_share': round((len(typical) - len(times)) / len(typical), 6),
                # Typical results in centiseconds, fastest first: [i] is i/1000 of the way through
                'quantiles_cs': [round(q) for q in spread_quantiles(times)],
            },
        }
        if len(spreads[event]) >= MIN_COMPETITORS:
            entry['consistency'] = {
                'competitors': len(spreads[event]),
                # Spreads as a fraction of the typical attempt, steadiest first
                'quantiles': [round(q, 4) for q in spread_quantiles(spreads[event])],
            }
        events[event] = entry
        consistency = entry.get('consistency')
        print(f'{event}: {kind} of {solves}; speed: {len(typical)} competitors, median '
              f'{statistics.median(times) / 100:.2f}s, DNF {entry["speed"]["dnf_share"]:.1%}; '
              + (f'consistency: {consistency["competitors"]} competitors, median spread '
                 f'{consistency["quantiles"][500]:.1%}' if consistency else 'no consistency data'))

    reference = {
        'source': 'WCA results export, format ' + metadata['export_format_version'],
        'export_date': export_day.isoformat(),
        'window_start': window_start.isoformat(),
        'min_pairs': MIN_PAIRS,
        'notice': (
            'This information is based on competition results owned and maintained by the '
            'World Cube Association, published at https://worldcubeassociation.org/results '
            f'as of {export_day.strftime("%B")} {export_day.day}, {export_day.year}.'
        ),
        'events': events,
    }
    OUTPUT.write_text(json.dumps(reference, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Wrote {OUTPUT}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
