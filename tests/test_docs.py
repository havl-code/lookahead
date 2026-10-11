"""The docs: every relative link and heading anchor works, and the writing follows the
project's style (NZ English, with no em or en dashes)."""

import json
import re
from datetime import date

import pytest

from helpers import PROJECT_DIR

DOCS = [PROJECT_DIR / 'README.md', PROJECT_DIR / 'INSTALLATION.md',
        *sorted((PROJECT_DIR / 'docs').glob('*.md')), PROJECT_DIR / 'web' / 'vendor' / 'README.md']
# Everything the project writes itself (not the bundled vendor files or the lock file)
OWN_TEXT = [*DOCS, PROJECT_DIR / 'app.py', PROJECT_DIR / 'pyproject.toml',
            *sorted((PROJECT_DIR / 'speedcube').glob('*.py')), *sorted((PROJECT_DIR / 'tools').glob('*.py')),
            PROJECT_DIR / 'web' / 'index.html', *sorted((PROJECT_DIR / 'web' / 'js').glob('*.js')),
            *sorted((PROJECT_DIR / 'web' / 'css').glob('*.css')),
            *sorted((PROJECT_DIR / 'tests').rglob('*.py')), *sorted(PROJECT_DIR.glob('Start on *')),
            *sorted((PROJECT_DIR / '.github').rglob('*.yml'))]
EM_DASH, EN_DASH = chr(0x2014), chr(0x2013)  # built, so this file has none itself
US_SPELLINGS = r'\b(colou?r(?<!colour)s?|organiz\w*|analyz\w*|behavior\w*|center(?:s|ed)?|favor\w*|' \
               r'initializ\w*|optimiz\w*|personaliz\w*|recogniz\w*|catalog|license(?= (?:file|text)))\b'


def anchor(heading):
    """GitHub's anchor for a heading: lower case, punctuation and emoji dropped, spaces to
    hyphens."""
    kept = ''.join(ch for ch in heading.strip().lower() if ch.isalnum() or ch in ' -_')
    return kept.replace(' ', '-')


def anchors_in(path):
    return {anchor(m) for m in re.findall(r'^#+\s+(.*)$', path.read_text(encoding='utf-8'), re.M)}


def prose(text):
    """The text without code blocks, inline code, or link targets, where code spellings belong."""
    text = re.sub(r'```.*?```', '', text, flags=re.S)
    text = re.sub(r'`[^`]*`', '', text)
    return re.sub(r'\]\([^)]*\)', ']', text)


@pytest.mark.parametrize('doc', DOCS, ids=lambda p: p.name)
def test_relative_links_and_anchors_work(doc):
    broken = []
    for target in re.findall(r'\]\(([^)\s]+)\)', doc.read_text(encoding='utf-8')):
        if re.match(r'[a-z]+:', target):
            continue  # web links are checked by hand, since the tests stay offline
        path, _, fragment = target.partition('#')
        destination = (doc.parent / path).resolve() if path else doc
        if not destination.exists() or (fragment and fragment not in anchors_in(destination)):
            broken.append(target)
    assert broken == []


@pytest.mark.parametrize('path', OWN_TEXT, ids=lambda p: str(p.relative_to(PROJECT_DIR)))
def test_no_em_or_en_dashes(path):
    lines = [f'{n}: {line.strip()}' for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1)
             if EM_DASH in line or EN_DASH in line]
    assert lines == []


@pytest.mark.parametrize('doc', DOCS, ids=lambda p: p.name)
def test_docs_use_nz_spelling(doc):
    assert re.findall(US_SPELLINGS, prose(doc.read_text(encoding='utf-8')), re.I) == []


def test_docs_quote_the_current_wca_reference():
    """The WCA notice's date and 3x3x3's competitors, as tools/sync_wca_reference_docs.py
    writes them after each rebuild of the table."""
    reference = json.loads((PROJECT_DIR / 'speedcube' / 'wca_reference.json').read_text(encoding='utf-8'))
    day = date.fromisoformat(reference['export_date'])
    as_of = f'as of {day.strftime("%B")} {day.day}, {day.year}.'
    assert as_of in reference['notice']
    readme, scores = (path.read_text(encoding='utf-8') for path in (PROJECT_DIR / 'README.md',
                                                                     PROJECT_DIR / 'docs' / 'SCORES.md'))
    assert re.search(r'<https://worldcubeassociation\.org/results>\s+' + re.escape(as_of), readme)
    assert re.search(r'<https://worldcubeassociation\.org/results>\s+' + re.escape(as_of), scores)
    competitors = round(reference['events']['333']['speed']['competitors'], -3)
    assert f'about {competitors:,} for 3x3x3' in scores
