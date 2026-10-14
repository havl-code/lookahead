import { useState } from 'react';
import { isAppleMobile, isStandalone } from './display.ts';
import { ShareIcon } from './icons.tsx';

/**
 * iOS keeps a Home Screen app's data apart from Safari's, so solves timed in a Safari tab never
 * appear in the installed app, and Safari may clear a tab's data after a week without a visit.
 * This banner stays until the app is opened from the Home Screen. Other systems share one store
 * between the tab and the installed app, so they don't need it.
 */
export function InstallBanner() {
  const [show] = useState(() => isAppleMobile() && !isStandalone());
  if (!show) return null;

  return (
    <aside
      aria-label="Install Lookahead"
      className="bg-warning px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-on-warning text-sm"
    >
      <p className="mx-auto max-w-xl">
        <strong className="font-semibold">Open Lookahead from your Home Screen.</strong> Solves
        timed in Safari are kept separately and won't show up in the Home Screen app. To install,
        tap <ShareIcon className="inline size-4 align-text-bottom" />
        <span className="sr-only">Share</span>, then{' '}
        <span className="font-semibold">Add to Home Screen</span>.
      </p>
    </aside>
  );
}
