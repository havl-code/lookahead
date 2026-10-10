"""Checks on the page's own files that don't need a browser."""

import json
import re
import shutil
import subprocess

import pytest

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
    would be refused. The only other ways the page reaches the API are reads: the presence
    stream (EventSource) and the backup and CSV download links. The one other plain fetch() is
    a read outside the API: the app's own docs (docs.js)."""
    direct = []
    for path in (WEB / 'js').glob('*.js'):
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('//'):
                continue  # comments may mention fetch()
            if re.search(r'(?<![\w.])fetch\(', line) and 'return fetch(`${API_BASE}${path}`' not in line \
                    and 'fetch(`/docs/' not in line:
                direct.append(f'{path.name}: {line.strip()}')
            if 'API_BASE}' in line and 'apiFetch' not in line and 'return fetch(' not in line:
                assert ('EventSource' in line and '/presence' in line) or '/backup/export' in line \
                    or '/export/solves.csv' in line, line
    assert direct == []


@pytest.mark.skipif(shutil.which('node') is None, reason='Node.js is not installed')
@pytest.mark.parametrize('script', sorted((WEB / 'js').glob('*.js')), ids=lambda p: p.name)
def test_scripts_have_no_syntax_errors(script):
    """A quick syntax check, so a typo is caught before any browser runs. It uses Node.js when
    it's installed (the app itself never needs it)."""
    result = subprocess.run(['node', '--check', str(script)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


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


@pytest.mark.skipif(shutil.which('node') is None, reason='Node.js is not installed')
@pytest.mark.parametrize('event, length, faces', [
    ('222', 25, {'R', 'U', 'F'}),
    ('333', 25, {'R', 'L', 'U', 'D', 'F', 'B'}),
    ('444', 40, {'R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Uw', 'Fw'}),
    ('555', 60, {'R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'}),
    ('666', 80, {'R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw', '3Rw', '3Uw', '3Fw'}),
    ('777', 100, {'R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw',
                  '3Rw', '3Lw', '3Uw', '3Dw', '3Fw', '3Bw'}),
])
def test_scrambles_for_each_timer_event(event, length, faces):
    """scramble.js, run in Node: each event's length and moves (2006 Regulations, Article 4g, and
    2009 Regulations, Article 4f), written as in Regulation 12a, and never a move that cancels
    out. Every layer and turn turns up, and moves next to each other share an axis about as
    often as in a fair random scramble."""
    code = (WEB / 'js' / 'scramble.js').read_text(encoding='utf-8')
    script = code + f'''
const all = [];
for (let i = 0; i < 2000; i++) all.push(generateScramble('{event}').split(' '));
console.log(JSON.stringify({{ all, has: [hasTimer('{event}'), hasTimer('clock'), hasTimer('toString')] }}));'''
    result = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['has'] == [True, False, False]
    faces_axis = {'R': 'x', 'L': 'x', 'U': 'y', 'D': 'y', 'F': 'z', 'B': 'z'}
    axis = {layer: faces_axis[layer.lstrip('3')[0]] for layer in faces}
    used, pairs, same_axis = set(), 0, 0
    for scramble in data['all']:
        assert len(scramble) == length
        layers = []
        for move in scramble:
            match = re.fullmatch(r"(3?[RLUDFB]w?)('|2)?", move)
            assert match, move
            layers.append(match[1])
            used.add(move)
        for i in range(1, len(layers)):
            pairs += 1
            same_axis += axis[layers[i]] == axis[layers[i - 1]]
        # Within each run on one axis, no layer turns twice (so nothing cancels)
        run = [layers[0]]
        for layer in layers[1:]:
            run = run + [layer] if axis[layer] == axis[run[-1]] else [layer]
            assert len(run) == len(set(run)), scramble
    assert used == {face + turn for face in faces for turn in ('', "'", '2')}
    if event == '222':
        assert same_axis == 0  # one layer an axis, so the axis always changes
    else:
        assert 0.1 < same_axis / pairs < 0.45


@pytest.mark.skipif(shutil.which('node') is None, reason='Node.js is not installed')
def test_times_are_written_the_cubing_way():
    """config.js's formatClock and truncatedSeconds, run in Node: 12.34, 1:23.45, whole seconds
    from 10 minutes (Regulation 9f2), hours from an hour, and running times cut off, not rounded."""
    config = (WEB / 'js' / 'config.js').read_text(encoding='utf-8')
    start = config.index('function formatClock')
    code = config[start:config.index('\n}\n', config.index('function truncatedSeconds')) + 3]
    script = code + '''
console.log(JSON.stringify([
    [9.87, 59.99, 60, 83.45, 599.99, 600, 612, 3725].map(formatClock),
    [9.87, 0, 83.45].map(formatTime),
    [9877.3, 9869.99, 599999, 612345].map(truncatedSeconds)]));'''
    result = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == [
        ['9.87', '59.99', '1:00.00', '1:23.45', '9:59.99', '10:00', '10:12', '1:02:05'],
        ['9.87s', '-', '1:23.45'],
        [9.87, 9.86, 599.99, 612]]
