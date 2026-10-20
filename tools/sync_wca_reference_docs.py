"""Bring the docs in step with src/lib/wca_reference.json after it's rebuilt.

The README and docs/SCORES.md quote the WCA's notice, with the date of the export the scores
compare against, and SCORES.md gives the number of 3x3x3 competitors. Run this after
tools/build_wca_reference.py (the monthly GitHub Actions workflow runs both):

    uv run tools/sync_wca_reference_docs.py

It only rewrites those quotes; tools/tests/test_docs.py checks that they match the table.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
REFERENCE = PROJECT_DIR / 'src' / 'lib' / 'wca_reference.json'
NOTICE_DATE = re.compile(r'(<https://worldcubeassociation\.org/results>\s+as of )[A-Z][a-z]+ \d{1,2}, \d{4}\.')
COMPETITORS_333 = re.compile(r'about [\d,]+ for 3x3x3')


def notice_date(reference):
    """The export date as the WCA's notice writes it, for example September 30, 2026."""
    day = date.fromisoformat(reference['export_date'])
    return f'{day.strftime("%B")} {day.day}, {day.year}'


def competitors_333(reference):
    """3x3x3's competitors, to the nearest thousand, as SCORES.md writes them."""
    return f'about {round(reference["events"]["333"]["speed"]["competitors"], -3):,} for 3x3x3'


def replace_once(path, pattern, replacement):
    text = path.read_text(encoding='utf-8')
    text, count = pattern.subn(replacement, text)
    if count != 1:
        sys.exit(f'{path.name}: expected one match for {pattern.pattern}, found {count}')
    path.write_text(text, encoding='utf-8')


def main():
    reference = json.loads(REFERENCE.read_text(encoding='utf-8'))
    as_of = notice_date(reference)
    for doc in (PROJECT_DIR / 'README.md', PROJECT_DIR / 'docs' / 'SCORES.md'):
        replace_once(doc, NOTICE_DATE, lambda m: f'{m[1]}{as_of}.')
    replace_once(PROJECT_DIR / 'docs' / 'SCORES.md', COMPETITORS_333, competitors_333(reference))
    print(f'The docs now quote the export of {as_of}')


if __name__ == '__main__':
    main()
