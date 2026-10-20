import { BackIcon } from './icons.tsx';
import { type Tab, tabHref } from './router.ts';

/** The link back to a tab, above a page within it (a session, Cubes, or How the scores work). */
export function BackLink({ tab, label }: { readonly tab: Tab; readonly label: string }) {
  return (
    <a
      href={tabHref(tab)}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 pr-3 font-medium text-accent-ink"
    >
      <BackIcon className="size-5" />
      {label}
    </a>
  );
}
