"""Checks on the page's own files that don't need a browser."""

import re

from helpers import PROJECT_DIR

WEB = PROJECT_DIR / 'web'
SOURCES = [WEB / 'index.html', *sorted((WEB / 'js').glob('*.js'))]
KINDS = {'action': 'click', 'change': 'change', 'submit': 'submit'}


def used_actions():
    """(kind, name) for every data-action, data-change, and data-submit in the page and in the
    HTML the scripts build."""
    used = set()
    for path in SOURCES:
        for attribute, name in re.findall(r'data-(action|change|submit)="([a-z0-9-]+)"',
                                          path.read_text(encoding='utf-8')):
            used.add((KINDS[attribute], name))
    return used


def registered_actions():
    """(kind, name) for every action the scripts register with registerActions()."""
    registered = set()
    for path in SOURCES:
        text = path.read_text(encoding='utf-8')
        for kind, body in re.findall(r"registerActions\('(\w+)',\s*\{(.*?)\}\);", text, re.S):
            registered.update((kind, name) for name in re.findall(r"'([a-z0-9-]+)'\s*:", body))
    return registered


def test_every_action_on_the_page_is_handled():
    missing = used_actions() - registered_actions()
    assert not missing, f'Nothing handles: {sorted(missing)}'


def test_every_registered_action_is_used():
    unused = registered_actions() - used_actions()
    assert not unused, f'Registered but never used: {sorted(unused)}'


def test_every_api_call_goes_through_apifetch():
    """apiFetch adds the header the server needs on changes, so a plain fetch() to the API
    would be refused. The only other ways the page reaches the API are two reads: the presence
    stream (EventSource) and the backup download link."""
    direct = []
    for path in (WEB / 'js').glob('*.js'):
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('//'):
                continue  # comments may mention fetch()
            if re.search(r'(?<![\w.])fetch\(', line) and 'return fetch(`${API_BASE}${path}`' not in line:
                direct.append(f'{path.name}: {line.strip()}')
            if 'API_BASE}' in line and 'apiFetch' not in line and 'return fetch(' not in line:
                assert ('EventSource' in line and '/presence' in line) or '/backup/export' in line, line
    assert direct == []


def test_no_inline_scripts():
    html = (WEB / 'index.html').read_text(encoding='utf-8')
    assert re.findall(r'<script(?![^>]*\bsrc=)[^>]*>', html) == []


def test_scripts_load_in_order():
    """config.js defines the shared helpers (and registerActions), so it loads first, and the
    theme runs before anything is drawn."""
    html = (WEB / 'index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script src="js/([\w-]+\.js)"', html)
    assert scripts[0] == 'theme-init.js' and scripts[1] == 'config.js'
    assert html.index('theme-init.js') < html.index('</head>')
    on_disk = {path.name for path in (WEB / 'js').glob('*.js')}
    assert set(scripts) == on_disk  # every script is loaded, and none is missing
