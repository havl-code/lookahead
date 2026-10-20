"""tools/build_wca_reference.py, run on a small made-up WCA export.

The expected table (fixtures/wca_reference_small.json) was written by the tool as it was
in 3.3, so any change to how it measures competitors shows up here. Rewrite it only when the
scoring method changes on purpose, and docs/SCORES.md with it.
"""

import importlib.util
import json
import random
import re
import zipfile
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'wca_reference_small.json'


def load_tool():
    spec = importlib.util.spec_from_file_location(
        'build_wca_reference', PROJECT_DIR / 'tools' / 'build_wca_reference.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tsv(rows):
    return '\n'.join('\t'.join(str(value) for value in row) for row in rows) + '\n'


def made_up_export(path):
    """120 people with seven rounds each of 3x3x3 (average of 5) and 3x3x3 Blindfolded (best of
    3), some DNFs and rounds with no average, plus results the tool must skip: Fewest Moves, a
    cancelled competition, and one from before the two-year window."""
    rng = random.Random(2026)
    competitions = [('Recent2026', 2026, 3, 1, 0), ('Cancelled2026', 2026, 4, 1, 1),
                    ('Old2020', 2020, 5, 1, 0)]
    results, attempts = [], []
    result_id = 0
    for person in range(120):
        person_id = f'2020TEST{person:02d}'
        skill = 900 + person * 20
        for event, format_id, count in (('333', 'a', 5), ('333bf', '3', 3), ('333fm', 'm', 3)):
            for competition in ['Recent2026'] * 7 + ['Cancelled2026', 'Old2020']:
                result_id += 1
                values = [-1 if rng.random() < 0.05 else round(skill * rng.uniform(0.85, 1.2))
                          for _ in range(count)]
                done = sorted(v for v in values if v > 0)
                best = done[0] if done else -1
                if format_id == 'a' and len(done) >= 4:
                    average = round(sum(done[1:4]) / 3)
                elif format_id == 'a':
                    average = -1
                else:
                    average = 0
                results.append((result_id, event, competition, person_id, format_id, average,
                                best))
                attempts.extend((result_id, n + 1, value) for n, value in enumerate(values))
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('metadata.json', json.dumps(
            {'export_date': '2026-10-01T00:00:00Z', 'export_format_version': 'v2.0.0'}))
        archive.writestr('WCA_export_competitions.tsv', tsv(
            [('id', 'end_year', 'end_month', 'end_day', 'cancelled'), *competitions]))
        archive.writestr('WCA_export_events.tsv', tsv(
            [('id', 'format'), ('333', 'time'), ('333bf', 'time'), ('333fm', 'number')]))
        archive.writestr('WCA_export_results.tsv', tsv(
            [('id', 'event_id', 'competition_id', 'person_id', 'format_id', 'average', 'best'),
             *results]))
        archive.writestr('WCA_export_result_attempts.tsv', tsv(
            [('result_id', 'attempt_number', 'value'), *attempts]))


def test_builds_the_same_table_as_before(tmp_path, monkeypatch, capsys):
    tool = load_tool()
    output = tmp_path / 'wca_reference.json'
    monkeypatch.setattr(tool, 'OUTPUT', output)
    made_up_export(tmp_path / 'export.zip')
    tool.main(tmp_path / 'export.zip')
    built = json.loads(output.read_text(encoding='utf-8'))
    assert set(built['events']) == {'333', '333bf'}
    assert built == json.loads(FIXTURE.read_text(encoding='utf-8'))


def test_measures_spread_as_the_app_does():
    """The tool and the app (src/lib/scores.ts) each keep a copy of the constant that turns a
    median gap into a standard deviation, so a change to one must be made to both."""
    scores = (PROJECT_DIR / 'src' / 'lib' / 'scores.ts').read_text(encoding='utf-8')
    app_value = float(re.search(r'const medianRangeToSd = ([\d.]+);', scores).group(1))
    assert load_tool().MEDIAN_RANGE_TO_SD == app_value
