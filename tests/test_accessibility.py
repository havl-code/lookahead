"""Accessibility checks that don't need a browser: everything clickable is something a keyboard
can reach, the text colours meet WCAG 2.1 AA contrast (1.4.3: at least 4.5:1) in both themes,
and so do the edges of fields, buttons, and switches (1.4.11: at least 3:1). The keyboard itself
is tested in tests/e2e/test_keyboard.py."""

import re

import pytest

from helpers import PROJECT_DIR

WEB = PROJECT_DIR / 'web'
CSS = (WEB / 'css' / 'style.css').read_text(encoding='utf-8')
TIMER_CSS = (WEB / 'css' / 'timer.css').read_text(encoding='utf-8')


def test_everything_clickable_is_a_button_link_or_field():
    """A click handler on a div or span can't be reached with Tab, so actions belong on buttons,
    links, and form fields."""
    found = []
    for path in (WEB / 'index.html', *sorted((WEB / 'js').glob('*.js'))):
        text = path.read_text(encoding='utf-8')
        for tag, action in re.findall(r'<([a-z0-9]+)\b[^>]*?data-(?:action|change)="([^"]+)"', text, re.S):
            if tag not in ('button', 'a', 'select', 'input', 'form'):
                found.append(f'{path.name}: <{tag}> {action}')
    assert found == []


def test_the_page_says_its_language():
    assert '<html lang="en-NZ"' in (WEB / 'index.html').read_text(encoding='utf-8')


def tokens(selector):
    block = re.search(re.escape(selector) + r'\s*\{(.*?)\}', CSS, re.S).group(1)
    return dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', block))


def luminance(colour):
    channels = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


DARK = tokens(':root')
LIGHT = {**DARK, **tokens('[data-theme="light"]')}
TEXT = ['text-primary', 'text-secondary', 'text-tertiary', 'accent', 'success', 'warning', 'danger']
BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-tertiary']


@pytest.mark.parametrize('theme', [DARK, LIGHT], ids=['dark', 'light'])
@pytest.mark.parametrize('text', TEXT)
def test_text_colours_read_on_every_background(theme, text):
    ratios = {background: round(contrast(theme[text], theme[background]), 2) for background in BACKGROUNDS}
    assert min(ratios.values()) >= 4.5, ratios


@pytest.mark.parametrize('theme', [DARK, LIGHT], ids=['dark', 'light'])
def test_button_text_reads_on_the_accent(theme):
    assert contrast(theme['accent-contrast'], theme['accent']) >= 4.5


@pytest.mark.parametrize('theme', [DARK, LIGHT], ids=['dark', 'light'])
def test_control_edges_stand_out_from_every_background(theme):
    """WCAG 2.1 1.4.11: the edge that shows where a field or button is, and a switch's track,
    reach 3:1 against every background, and so does the switch's knob against its track, off
    (white) and on (the accent's text colour)."""
    ratios = {background: round(contrast(theme['border-control'], theme[background]), 2) for background in BACKGROUNDS}
    assert min(ratios.values()) >= 3, ratios
    assert contrast('#ffffff', theme['border-control']) >= 3
    assert contrast(theme['accent-contrast'], theme['accent']) >= 3


def rule(css, selector):
    """The declarations of every rule whose list of selectors includes `selector`."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    return ''.join(body for selectors, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css)
                   if selector in [s.strip() for s in selectors.split(',')])


@pytest.mark.parametrize('sheet, selector', [
    ('style', '.icon-button'), ('style', '.btn-secondary'), ('style', '.action-btn'), ('style', 'textarea'),
    ('style', '.about-connect-link'), ('timer', '.solve-action-btn'), ('timer', '.setting-toggle'),
])
def test_controls_use_the_control_edge(sheet, selector):
    """The controls drawn only by their edge (or, for a switch, its track) use --border-control.
    Cards, tables, and dividers keep the fainter borders, since 1.4.11 doesn't cover them.
    ('textarea' stands for every field, since they share one rule.)"""
    assert 'var(--border-control)' in rule({'style': CSS, 'timer': TIMER_CSS}[sheet], selector)
    assert 'var(--accent-contrast)' in rule(TIMER_CSS, '.setting-toggle.active::after')
