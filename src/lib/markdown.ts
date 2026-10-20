/*
 * A small Markdown reader for the app's own docs (such as docs/SCORES.md), so they can be read
 * offline. A port of the desktop app's web/js/docs.js: it only understands what those docs use
 * (headings, paragraphs, bold, inline code, links, lists, quotes, code blocks, tables, and rules).
 * It gives plain data rather than HTML, so React escapes every word and nothing in a doc can add
 * HTML or script of its own.
 */

export type Inline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly Inline[] }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly Inline[] };

export type Block =
  | { readonly type: 'heading'; readonly level: number; readonly children: readonly Inline[] }
  | { readonly type: 'paragraph'; readonly children: readonly Inline[] }
  | { readonly type: 'quote'; readonly children: readonly Inline[] }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'rule' }
  | { readonly type: 'list'; readonly ordered: boolean; readonly items: readonly Inline[][] }
  | {
      readonly type: 'table';
      readonly head: readonly Inline[][];
      readonly rows: readonly Inline[][][];
    };

// Where a doc's links to other files in the project go, since only the docs come with the app.
export const docsOnGitHub = 'https://github.com/havl-code/lookahead/blob/main/docs/';

/**
 * Where a link goes: web links as they are, and the project's own files on GitHub. Anything else
 * (such as a javascript: link) is null, and shows as plain text.
 */
function linkHref(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return new URL(url, docsOnGitHub).href;
}

// Code first, so nothing inside it is read as Markdown; then autolinks, links, and bold.
const inlinePattern = /`([^`]+)`|<(https?:\/\/[^\s>]+)>|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g;

/** One line's worth of Markdown, with its bold, code, and links. */
function inline(source: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (last?.type === 'text') out[out.length - 1] = { type: 'text', text: last.text + value };
    else out.push({ type: 'text', text: value });
  };
  let at = 0;
  for (const match of source.matchAll(inlinePattern)) {
    pushText(source.slice(at, match.index));
    at = match.index + match[0].length;
    const [, code, autolink, label, url, bold] = match;
    if (code !== undefined) out.push({ type: 'code', text: code });
    else if (autolink !== undefined)
      out.push({ type: 'link', href: autolink, children: [{ type: 'text', text: autolink }] });
    else if (label !== undefined && url !== undefined) {
      const href = linkHref(url);
      if (href) out.push({ type: 'link', href, children: inline(label) });
      else
        for (const item of inline(label))
          item.type === 'text' ? pushText(item.text) : out.push(item);
    } else if (bold !== undefined) out.push({ type: 'strong', children: inline(bold) });
  }
  pushText(source.slice(at));
  return out;
}

const blockStart = /^(#{1,6} |```|>|\||- |\d+\. |-{3,}\s*$)/;
const listItem = /^(- |\d+\. )/;

function tableCells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => inline(cell.trim()));
}

/**
 * A doc's title (its first line, when that's a top-level heading) and the rest of it, as the
 * desktop app's doc window splits them.
 */
export function splitTitle(source: string): { readonly title: string; readonly body: string } {
  const [first = '', ...rest] = source.replace(/\r\n/g, '\n').split('\n');
  return first.startsWith('# ')
    ? { title: first.replace(/^#\s+/, ''), body: rest.join('\n') }
    : { title: '', body: source };
}

/** A whole doc. Blocks are separated by blank lines, as in the docs themselves. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const takeWhile = (test: (line: string) => boolean) => {
    const taken: string[] = [];
    while (i < lines.length && test(lines[i] as string)) taken.push(lines[i++] as string);
    return taken;
  };

  while (i < lines.length) {
    const line = lines[i] as string;
    const heading = /^(#{1,6}) /.exec(line);
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('```')) {
      i++;
      const code = takeWhile((l) => !l.startsWith('```'));
      i++; // the closing fence
      blocks.push({ type: 'code', text: code.join('\n') });
    } else if (heading) {
      const level = (heading[1] as string).length;
      blocks.push({ type: 'heading', level, children: inline(line.slice(level + 1)) });
      i++;
    } else if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
    } else if (line.startsWith('>')) {
      const quote = takeWhile((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', children: inline(quote.join(' ')) });
    } else if (line.startsWith('|')) {
      const [head = '', , ...body] = takeWhile((l) => l.startsWith('|'));
      blocks.push({ type: 'table', head: tableCells(head), rows: body.map(tableCells) });
    } else if (listItem.test(line)) {
      // Each item starts with its marker; the lines indented under it carry on the same item.
      const items: string[] = [];
      for (const l of takeWhile((l) => listItem.test(l) || /^\s+\S/.test(l))) {
        if (listItem.test(l)) items.push(l.replace(listItem, ''));
        else items[items.length - 1] += ` ${l.trim()}`;
      }
      blocks.push({ type: 'list', ordered: /^\d+\. /.test(line), items: items.map(inline) });
    } else {
      i++;
      const paragraph = [line, ...takeWhile((l) => l.trim() !== '' && !blockStart.test(l))];
      blocks.push({ type: 'paragraph', children: inline(paragraph.join(' ')) });
    }
  }
  return blocks;
}
