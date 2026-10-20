import { tabHref } from '../../app/router.ts';
import { useUnbackedSolves } from '../../db/hooks.ts';
import { count } from '../../lib/format.ts';
import { backupDue } from './reminder.ts';

/** A nudge when solves have gone too long without a backup. */
export function BackupReminder({ className = '' }: { readonly className?: string }) {
  const status = useUnbackedSolves();
  if (!status || !backupDue(status, Date.now())) return null;

  return (
    <aside
      aria-label="Backup reminder"
      className={`flex items-center gap-3 rounded-xl bg-warning px-4 py-3 text-on-warning text-sm ${className}`}
    >
      <p className="flex-1">{count(status.count, 'solve isn’t', 'solves aren’t')} backed up yet.</p>
      <a
        href={tabHref('more')}
        className="flex min-h-11 items-center rounded-lg bg-on-warning px-3 font-semibold text-warning"
      >
        Back up
      </a>
    </aside>
  );
}
