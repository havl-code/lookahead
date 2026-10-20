import { describe, expect, it } from 'vitest';
import { parseMarkdown, splitTitle } from './markdown.ts';

const text = (value: string) => ({ type: 'text', text: value });

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, bold, code, and links, as the desktop reader does', () => {
    expect(
      parseMarkdown(
        '## How it works\n\nA **Speed** score uses `share_below`,\nsee [the guide](https://example.com).',
      ),
    ).toEqual([
      { type: 'heading', level: 2, children: [text('How it works')] },
      {
        type: 'paragraph',
        children: [
          text('A '),
          { type: 'strong', children: [text('Speed')] },
          text(' score uses '),
          { type: 'code', text: 'share_below' },
          text(', see '),
          { type: 'link', href: 'https://example.com', children: [text('the guide')] },
          text('.'),
        ],
      },
    ]);
  });

  it("sends the project's own files to GitHub, and never makes a link of another scheme", () => {
    expect(parseMarkdown('[ROADMAP](ROADMAP.md) [x](javascript:void) <https://a.nz>')).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            href: 'https://github.com/havl-code/lookahead/blob/main/docs/ROADMAP.md',
            children: [text('ROADMAP')],
          },
          text(' x '),
          { type: 'link', href: 'https://a.nz', children: [text('https://a.nz')] },
        ],
      },
    ]);
  });

  it('reads bold in a link, a link in bold, and keeps the bold of a link it drops', () => {
    expect(
      parseMarkdown('[**a**](https://a.nz) **[b](https://b.nz)** [**c**](javascript:void)'),
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            href: 'https://a.nz',
            children: [{ type: 'strong', children: [text('a')] }],
          },
          text(' '),
          {
            type: 'strong',
            children: [{ type: 'link', href: 'https://b.nz', children: [text('b')] }],
          },
          text(' '),
          { type: 'strong', children: [text('c')] },
        ],
      },
    ]);
  });

  it('takes the title from the first line, when it is a top-level heading', () => {
    expect(splitTitle('# Scores 📐\r\n\nBody')).toEqual({ title: 'Scores 📐', body: '\nBody' });
    expect(splitTitle('Body only')).toEqual({ title: '', body: 'Body only' });
  });

  it('keeps HTML as text, and reads nothing as Markdown inside code', () => {
    expect(parseMarkdown('<script>x</script> `**not bold**`')).toEqual([
      {
        type: 'paragraph',
        children: [text('<script>x</script> '), { type: 'code', text: '**not bold**' }],
      },
    ]);
  });

  it('reads lists (with lines carried on), tables, quotes, code blocks, and rules', () => {
    expect(
      parseMarkdown(
        [
          '- one',
          '  more',
          '- two',
          '',
          '1. first',
          '',
          '| A | B |',
          '| --- | --- |',
          '| 1 | **2** |',
          '',
          '> a',
          '> quote',
          '',
          '```',
          'x < y',
          '```',
          '',
          '---',
        ].join('\n'),
      ),
    ).toEqual([
      { type: 'list', ordered: false, items: [[text('one more')], [text('two')]] },
      { type: 'list', ordered: true, items: [[text('first')]] },
      {
        type: 'table',
        head: [[text('A')], [text('B')]],
        rows: [[[text('1')], [{ type: 'strong', children: [text('2')] }]]],
      },
      { type: 'quote', children: [text('a quote')] },
      { type: 'code', text: 'x < y' },
      { type: 'rule' },
    ]);
  });
});
