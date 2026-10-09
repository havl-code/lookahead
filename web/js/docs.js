// docs.js: shows the app's own docs (such as docs/SCORES.md) inside the app, so they can be read
// offline. The server hands over the Markdown, and a small reader here turns it into HTML. It
// only understands what those docs use: headings, paragraphs, bold, inline code, links, lists,
// quotes, code blocks, tables, and rules. Everything is escaped first, so nothing in a doc can
// add HTML or script of its own.

// Where a doc's links to other files in the project go, since only the docs come with the app
const PROJECT_ON_GITHUB = 'https://github.com/havl-code/speedcube-training-explorer/blob/main/docs/';

// A link, opened in a new tab. Web links stay as they are, and links to the project's own files
// go to them on GitHub. Anything else (such as a javascript: link) is shown as plain text.
function docLink(url, label) {
    const raw = url.replace(/&amp;/g, '&');
    let href;
    if (/^https?:\/\//i.test(raw)) href = raw;
    else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return label;
    else href = new URL(raw, PROJECT_ON_GITHUB).href;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

// One line's worth of Markdown, with its bold, code, and links
function inlineMarkdown(text) {
    // Code first, kept aside, so nothing inside it is read as Markdown
    const codes = [];
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });
    html = html
        .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => docLink(url, url))
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => docLink(url, label))
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return html.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`);
}

const BLOCK_START = /^(#{1,6} |```|>|\||- |\d+\. |-{3,}\s*$)/;

function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => inlineMarkdown(cell.trim()));
}

// A whole doc. Blocks are separated by blank lines, as in the docs themselves.
function renderMarkdown(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    const takeWhile = test => {
        const taken = [];
        while (i < lines.length && test(lines[i])) taken.push(lines[i++]);
        return taken;
    };

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
        } else if (line.startsWith('```')) {
            i++;
            const code = takeWhile(l => !l.startsWith('```'));
            i++;  // the closing fence
            html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        } else if (/^#{1,6} /.test(line)) {
            const level = line.match(/^#+/)[0].length;
            html.push(`<h${level}>${inlineMarkdown(line.slice(level + 1))}</h${level}>`);
            i++;
        } else if (/^-{3,}\s*$/.test(line)) {
            html.push('<hr>');
            i++;
        } else if (line.startsWith('>')) {
            const quote = takeWhile(l => l.startsWith('>')).map(l => l.replace(/^>\s?/, ''));
            html.push(`<blockquote><p>${inlineMarkdown(quote.join(' '))}</p></blockquote>`);
        } else if (line.startsWith('|')) {
            const [head, , ...body] = takeWhile(l => l.startsWith('|'));
            html.push('<table><thead><tr>' + tableCells(head).map(c => `<th>${c}</th>`).join('') +
                      '</tr></thead><tbody>' +
                      body.map(row => '<tr>' + tableCells(row).map(c => `<td>${c}</td>`).join('') + '</tr>').join('') +
                      '</tbody></table>');
        } else if (/^(- |\d+\. )/.test(line)) {
            const ordered = /^\d+\. /.test(line);
            const items = [];
            // Each item starts with its marker; the lines indented under it carry on the same item
            takeWhile(l => /^(- |\d+\. )/.test(l) || /^\s+\S/.test(l)).forEach(l => {
                if (/^(- |\d+\. )/.test(l)) items.push(l.replace(/^(- |\d+\. )/, ''));
                else items[items.length - 1] += ' ' + l.trim();
            });
            const tag = ordered ? 'ol' : 'ul';
            html.push(`<${tag}>${items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`);
        } else {
            i++;
            const paragraph = [line, ...takeWhile(l => l.trim() && !BLOCK_START.test(l))];
            html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
        }
    }
    return html.join('\n');
}

// ---- The doc window ----

const shownDocs = {};  // each doc's title and HTML, once loaded

async function showDoc(name) {
    const modal = document.getElementById('doc-modal');
    try {
        if (!shownDocs[name]) {
            const response = await fetch(`/docs/${encodeURIComponent(name)}.md`);
            if (!response.ok) throw new Error(`the app replied with an error (${response.status})`);
            // The doc's first line is its title, which goes in the window's header
            const [first, ...rest] = (await response.text()).replace(/\r\n/g, '\n').split('\n');
            shownDocs[name] = {
                title: first.replace(/^#\s+/, ''),
                html: renderMarkdown(first.startsWith('# ') ? rest.join('\n') : `${first}\n${rest.join('\n')}`)
            };
        }
    } catch (error) {
        showError(`Couldn't open the explanation: ${error.message}`);
        return;
    }
    document.getElementById('doc-modal-title').textContent = shownDocs[name].title;
    document.getElementById('doc-modal-github').href = `${PROJECT_ON_GITHUB}${name}.md`;
    const body = document.getElementById('doc-modal-body');
    body.innerHTML = shownDocs[name].html;
    body.scrollTop = 0;
    modal.style.display = 'flex';
    windowOpened(modal, modal.querySelector('.modal-close'));
}

function closeDoc() {
    const modal = document.getElementById('doc-modal');
    modal.style.display = 'none';
    windowClosed(modal);
}

registerActions('click', {
    'show-doc': link => showDoc(link.dataset.doc),
    'close-doc': () => closeDoc()
});

document.getElementById('doc-modal').addEventListener('click', (e) => {
    if (e.target.id === 'doc-modal') closeDoc();
});
