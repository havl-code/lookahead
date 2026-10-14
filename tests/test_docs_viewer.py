"""The app's own docs inside the app: the server hands over docs/*.md, and docs.js turns the
Markdown into HTML, so the Scores explanation can be read offline."""

import json
import re
import shutil
import subprocess

import pytest

from helpers import PROJECT_DIR

WEB = PROJECT_DIR / 'web'
SCORES = (PROJECT_DIR / 'docs' / 'SCORES.md').read_text(encoding='utf-8')


class TestRoute:
    def test_a_doc_comes_as_markdown(self, client):
        response = client.get('/docs/SCORES.md')
        assert response.status_code == 200
        assert response.content_type == 'text/markdown; charset=utf-8'
        assert response.get_data(as_text=True).replace('\r\n', '\n') == SCORES

    @pytest.mark.parametrize('path', ['/docs/missing.md', '/docs/..%2Fapp.md', '/docs/..%2F..%2Fapp.py',
                                      '/docs/screenshots/dashboard-dark.png'])
    def test_only_the_docs_themselves(self, client, path):
        response = client.get(path)
        assert response.status_code == 404
        assert b'def main' not in response.get_data()

    def test_another_site_cant_read_them(self, client):
        response = client.get('/docs/SCORES.md', headers={'Host': 'evil.example'})
        assert response.status_code == 403


def render(markdown):
    """docs.js's renderMarkdown (with config.js's escapeHtml), run in Node."""
    config = (WEB / 'js' / 'config.js').read_text(encoding='utf-8')
    escape = re.search(r'function escapeHtml\(value\) \{.*?\n\}\n', config, re.S).group(0)
    docs = (WEB / 'js' / 'docs.js').read_text(encoding='utf-8')
    reader = docs[docs.index('const PROJECT_ON_GITHUB'):docs.index('// ---- The doc window ----')]
    script = escape + reader + f'\nconsole.log(JSON.stringify(renderMarkdown({json.dumps(markdown)})));'
    result = subprocess.run(['node', '-e', script], capture_output=True, text=True, encoding='utf-8')
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


needs_node = pytest.mark.skipif(shutil.which('node') is None, reason='Node.js is not installed')


@needs_node
class TestReader:
    def test_the_scores_doc_in_full(self):
        html = render(SCORES)
        # Every heading, table, list, rule, quote, and code block comes through
        for level in (1, 2, 3):
            assert html.count(f'<h{level}>') == len(re.findall(rf'^{"#" * level} ', SCORES, re.M))
        assert html.count('<table>') == len(re.findall(r'^\| --- ', SCORES, re.M))
        assert html.count('<hr>') == len(re.findall(r'^---$', SCORES, re.M))
        assert html.count('<blockquote>') == 1 and html.count('<pre><code>') == 1
        assert '<ol><li>Take every pair of <strong>back-to-back</strong>' in html
        # and no Markdown is left over in the text
        text = re.sub(r'<[^>]+>', '', html)
        assert '**' not in text and '](' not in text and '`' not in text and '| ---' not in text

    def test_links(self):
        html = render(SCORES)
        hrefs = re.findall(r'<a href="([^"]+)" target="_blank" rel="noopener noreferrer">', html)
        assert len(hrefs) == html.count('<a ') and hrefs
        assert all(href.startswith('https://') for href in hrefs)
        # The project's own files are on GitHub, since only the docs come with the app
        assert ('https://github.com/havl-code/lookahead/blob/main/speedcube/scores.py'
                in hrefs)

    def test_nothing_in_a_doc_becomes_html_or_script(self):
        html = render('Hi <script>alert(1)</script> **bold** [click](javascript:alert(1)) '
                      '<img src=x onerror=alert(1)> `<b>code</b>`\n\n| a | b |\n| --- | --- |\n| <i>x</i> | y |')
        assert '<script' not in html and '<img' not in html and '<i>' not in html
        assert 'javascript:' not in html
        assert '&lt;script&gt;' in html and '<strong>bold</strong>' in html
        assert '<code>&lt;b&gt;code&lt;/b&gt;</code>' in html
        assert 'click' in html and '<a ' not in html  # the bad link is just its words

    def test_lists_carry_on_over_indented_lines(self):
        html = render('- one\n  more of one\n- two\n\nAfter.')
        assert html == '<ul><li>one more of one</li><li>two</li></ul>\n<p>After.</p>'
