import type { ComponentType } from 'react';
import { ChartIcon, ListIcon, MoreIcon, TimerIcon } from './icons.tsx';
import { type Tab, tabHref } from './router.ts';

const items: ReadonlyArray<{
  tab: Tab;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { tab: 'timer', label: 'Timer', Icon: TimerIcon },
  { tab: 'sessions', label: 'Sessions', Icon: ListIcon },
  { tab: 'analytics', label: 'Analytics', Icon: ChartIcon },
  { tab: 'more', label: 'More', Icon: MoreIcon },
];

/**
 * The Main navigation: a tab bar along the bottom in the phone layout, and a top bar with the
 * logo and the tabs as text in the wide layout, as in the 3.x desktop app. It comes after the
 * main content in the page in both, and only CSS moves it to the top, so the reading and focus
 * order stay the same (ADR 0001).
 */
export function TabBar({ current }: { readonly current: Tab }) {
  return (
    <nav
      aria-label="Main"
      className="border-line border-t bg-raised pb-[env(safe-area-inset-bottom)] lg:order-first lg:border-t-0 lg:border-b lg:pt-[env(safe-area-inset-top)] lg:pb-0"
    >
      <div className="mx-auto flex max-w-xl lg:max-w-7xl lg:items-center lg:justify-between lg:px-6 lg:py-2">
        <p className="hidden items-center gap-2.5 font-bold text-lg tracking-tight lg:flex">
          <img
            src={`${import.meta.env.BASE_URL}pwa-64x64.png`}
            alt=""
            className="size-8 rounded-lg"
          />
          Lookahead
        </p>
        <ul className="flex flex-1 lg:flex-none lg:gap-1">
          {items.map(({ tab, label, Icon }) => {
            const isCurrent = tab === current;
            return (
              <li key={tab} className="flex-1 lg:flex-none">
                <a
                  href={tabHref(tab)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 text-xs lg:min-h-10 lg:rounded-full lg:px-4 lg:pt-0 lg:text-sm ${
                    isCurrent
                      ? 'font-semibold text-ink lg:bg-accent lg:text-on-accent'
                      : 'text-muted lg:hover:text-ink'
                  }`}
                >
                  {/* The current tab's icon sits in a pill, as in iOS and Android tab bars. In
                      the wide layout the pill holds the label instead. */}
                  <span
                    className={`flex h-8 w-full max-w-14 items-center justify-center rounded-full motion-safe:transition-colors lg:hidden ${
                      isCurrent ? 'bg-accent text-on-accent' : ''
                    }`}
                  >
                    <Icon className="size-5" />
                  </span>
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
