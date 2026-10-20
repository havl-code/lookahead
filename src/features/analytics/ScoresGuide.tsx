// biome-ignore-all lint/suspicious/noArrayIndexKey: the doc never changes while it's shown, so its order is a stable key.
import scoresDoc from '../../../docs/SCORES.md?raw';
import { BackLink } from '../../app/BackLink.tsx';
import {
  type Block,
  docsOnGitHub,
  type Inline,
  parseMarkdown,
  splitTitle,
} from '../../lib/markdown.ts';

/*
 * How the scores work (#/analytics/scores): docs/SCORES.md, bundled so it can be read offline.
 */

const { title, body } = splitTitle(scoresDoc);
const blocks = parseMarkdown(body);

export function ScoresGuide() {
  return (
    <>
      <BackLink tab="analytics" label="Analytics" />
      <h1 id="screen-title" className="mt-2 break-words font-bold text-3xl tracking-tight">
        {title}
      </h1>
      <article className="mt-4 space-y-4 break-words leading-relaxed">
        {blocks.map((block, i) => (
          <DocBlock key={i} block={block} />
        ))}
      </article>
      <p className="mt-8 text-muted text-sm">
        Also{' '}
        <a
          href={`${docsOnGitHub}SCORES.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-ink underline underline-offset-2"
        >
          on GitHub
        </a>
        .
      </p>
    </>
  );
}

function DocBlock({ block }: { readonly block: Block }) {
  switch (block.type) {
    case 'heading': {
      // The page's title is the h1, so the doc's headings start at h2.
      const Heading = `h${Math.max(2, block.level)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Heading className={`pt-2 font-semibold ${block.level <= 2 ? 'text-xl' : 'text-lg'}`}>
          <Inlines items={block.children} />
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <p>
          <Inlines items={block.children} />
        </p>
      );
    case 'quote':
      return (
        <blockquote className="border-line border-l-4 pl-3 text-muted">
          <Inlines items={block.children} />
        </blockquote>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-lg bg-raised p-3 text-sm">
          <code>{block.text}</code>
        </pre>
      );
    case 'rule':
      return <hr className="border-line" />;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List className={`space-y-1 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines items={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-line border-b">
                {block.head.map((cell, i) => (
                  <th key={i} className="py-1 pr-3 font-semibold">
                    <Inlines items={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-line border-b">
                  {row.map((cell, i) => (
                    <td key={i} className="py-1 pr-3 align-top">
                      <Inlines items={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Inlines({ items }: { readonly items: readonly Inline[] }) {
  return items.map((item, i) => {
    if (item.type === 'text') return item.text;
    if (item.type === 'code')
      return (
        <code key={i} className="rounded bg-raised px-1 text-[0.9em]">
          {item.text}
        </code>
      );
    if (item.type === 'strong')
      return (
        <strong key={i}>
          <Inlines items={item.children} />
        </strong>
      );
    return (
      <a
        key={i}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-ink underline underline-offset-2"
      >
        <Inlines items={item.children} />
      </a>
    );
  });
}
