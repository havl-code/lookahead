import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { useMeta, useSafetyCopy, useStoredCounts } from '../../db/hooks.ts';
import { setMeta } from '../../db/meta.ts';
import type { StoredCounts } from '../../db/stored.ts';
import { count } from '../../lib/format.ts';
import { saveFile } from '../../lib/share.ts';
import { requestPersistence } from '../../lib/storage.ts';
import { formatMoment } from '../../lib/time.ts';
import type { CreatedBackup, ReadBackup } from './backup.ts';

// The backup code (and its file checks) loads the first time it's needed.
const loadBackup = () => import('./backup.ts');

type MakeState =
  | { readonly step: 'idle' }
  | { readonly step: 'making' }
  | { readonly step: 'ready'; readonly backup: CreatedBackup }
  | { readonly step: 'saved' };

function summary(counts: StoredCounts): string {
  return `${count(counts.sessions, 'session', 'sessions')}, ${count(counts.solves, 'solve', 'solves')}, and ${count(counts.cubes, 'cube', 'cubes')}`;
}

export function BackupSection() {
  const db = useDb();
  const here = useStoredCounts();
  const lastBackupAt = useMeta('lastBackupAt');
  const persistResult = useMeta('persistResult');
  const [make, setMake] = useState<MakeState>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const empty = here !== undefined && here.sessions + here.solves + here.cubes === 0;

  async function makeBackup() {
    setError(null);
    setMake({ step: 'making' });
    const release = holdUpdates();
    try {
      const { createBackupFile } = await loadBackup();
      setMake({ step: 'ready', backup: await createBackupFile(db) });
    } catch {
      setMake({ step: 'idle' });
      setError("Couldn't make the backup. Try again.");
    } finally {
      release();
    }
  }

  // A second tap shares the file: iOS only opens the share sheet straight from a tap, and making
  // a large backup can take longer than it allows.
  async function save(backup: CreatedBackup) {
    setError(null);
    const release = holdUpdates();
    try {
      const result = await saveFile(backup.file);
      if (result === 'cancelled') return;
      await setMeta(db, 'lastBackupAt', Date.now());
      setMake({ step: 'saved' });
    } catch {
      setError("Couldn't share the backup. Try again.");
    } finally {
      release();
    }
  }

  return (
    <section aria-labelledby="backup-heading" className="mt-6 space-y-3">
      <h2 id="backup-heading" className="font-semibold text-lg">
        Backup
      </h2>
      <p className="text-muted text-sm">
        Lookahead keeps everything on this device only, and removing the app removes it all. Save a
        backup somewhere safe, such as iCloud Drive or Google Drive, now and then. Backups work in
        the desktop app too, both ways.
      </p>
      {here && (
        <p className="text-sm">
          On this device: {summary(here)}.
          {lastBackupAt !== undefined &&
            (lastBackupAt === null
              ? ' No backup yet.'
              : ` Last backup: ${formatMoment(lastBackupAt)}.`)}
        </p>
      )}
      {persistResult === 'granted' && (
        <p className="text-muted text-sm">This browser has agreed to keep Lookahead's data.</p>
      )}
      {persistResult === 'denied' && (
        <p className="text-muted text-sm">
          This browser may clear Lookahead's data if the device runs low on space, so keep a recent
          backup.
        </p>
      )}

      {!empty && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-4">
          {make.step === 'ready' ? (
            <div className="space-y-2">
              <p className="text-sm">
                Backup ready: {count(make.backup.sessions, 'session', 'sessions')} and{' '}
                {count(make.backup.solves, 'solve', 'solves')}.
              </p>
              <button
                type="button"
                onClick={() => void save(make.backup)}
                className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent"
              >
                Save or share backup
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void makeBackup()}
              disabled={make.step === 'making'}
              className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
            >
              {make.step === 'making' ? 'Making backup…' : 'Make backup'}
            </button>
          )}
          <p role="status" className="text-sm empty:hidden">
            {make.step === 'saved' ? 'Backup saved.' : null}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <RestoreControl here={here} />
      <UndoRestore />
    </section>
  );
}

type RestoreState =
  | { readonly step: 'idle' }
  | { readonly step: 'reading' }
  | { readonly step: 'preview'; readonly backup: ReadBackup }
  | { readonly step: 'restoring' }
  | { readonly step: 'done'; readonly message: string };

function RestoreControl({ here }: { readonly here: StoredCounts | undefined }) {
  const db = useDb();
  const input = useRef<HTMLInputElement>(null);
  const releaseHold = useRef<(() => void) | null>(null);
  const [state, setState] = useState<RestoreState>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const release = useCallback(() => {
    releaseHold.current?.();
    releaseHold.current = null;
  }, []);

  useEffect(() => {
    const element = input.current;
    element?.addEventListener('cancel', release);
    return () => {
      element?.removeEventListener('cancel', release);
      release();
    };
  }, [release]);

  function choose() {
    setError(null);
    release();
    releaseHold.current = holdUpdates();
    input.current?.click();
  }

  async function read(file: File) {
    setState({ step: 'reading' });
    try {
      const { readBackup } = await loadBackup();
      setState({ step: 'preview', backup: readBackup(await file.text()) });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof Error && caught.name === 'BackupError'
          ? caught.message
          : "That file couldn't be read.",
      );
    } finally {
      release();
    }
  }

  async function restore(backup: ReadBackup) {
    setState({ step: 'restoring' });
    const hold = holdUpdates();
    try {
      const { restoreBackup } = await loadBackup();
      const restored = await restoreBackup(db, backup);
      // Now there's something worth keeping, ask the browser to keep it.
      await setMeta(db, 'persistResult', await requestPersistence());
      setState({
        step: 'done',
        message: `Restored ${count(restored.sessions, 'session', 'sessions')} and ${count(restored.solves, 'solve', 'solves')}.`,
      });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof StorageFullError
          ? 'This device is out of space, so nothing was restored.'
          : "Couldn't restore the backup. Nothing was changed.",
      );
    } finally {
      hold();
    }
  }

  const hasData = here !== undefined && here.sessions + here.solves + here.cubes > 0;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={choose}
        disabled={state.step === 'reading' || state.step === 'restoring'}
        className="min-h-12 w-full rounded-xl border border-control bg-raised font-medium disabled:opacity-60"
      >
        {state.step === 'reading' ? 'Reading backup…' : 'Restore from a backup'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void read(file);
          else release();
        }}
      />
      <p role="status" className="text-sm empty:hidden">
        {state.step === 'done' ? state.message : state.step === 'restoring' ? 'Restoring…' : null}
      </p>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <Sheet
        open={state.step === 'preview'}
        onClose={() => setState({ step: 'idle' })}
        title="Restore backup"
      >
        {state.step === 'preview' && (
          <div className="space-y-4">
            <p>
              This backup has{' '}
              {summary({
                sessions: state.backup.sessions.length,
                solves: state.backup.solves.length,
                cubes: state.backup.cubes.length,
              })}
              {state.backup.exportedAt ? `, from ${formatMoment(state.backup.exportedAt)}` : ''}.
            </p>
            {state.backup.leftOut > 0 && (
              <p className="text-sm">
                {state.backup.leftOut === 1
                  ? "1 solve belongs to a session that isn't in the file, so it'll be left out."
                  : `${count(state.backup.leftOut, 'solve', 'solves')} belong to sessions that aren't in the file, so they'll be left out.`}
              </p>
            )}
            {hasData && here && (
              <p className="text-sm">
                Restoring replaces the {summary(here)} on this device. You can undo it afterwards.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setState({ step: 'idle' })}
                className="min-h-12 rounded-xl border border-control font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void restore(state.backup)}
                className="min-h-12 rounded-xl bg-accent font-semibold text-on-accent"
              >
                {hasData ? 'Replace' : 'Restore'}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function UndoRestore() {
  const db = useDb();
  const copy = useSafetyCopy();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function undo() {
    setConfirming(false);
    const hold = holdUpdates();
    try {
      const { undoLastRestore } = await loadBackup();
      const counts = await undoLastRestore(db);
      setMessage(
        `Put back ${count(counts.sessions, 'session', 'sessions')} and ${count(counts.solves, 'solve', 'solves')}.`,
      );
    } catch {
      setMessage("Couldn't undo the restore. Nothing was changed.");
    } finally {
      hold();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {copy &&
        (confirming ? (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="text-sm">
              Put back what was here before the restore on {formatMoment(copy.made_at)}? What's here
              now is replaced.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-12 rounded-xl border border-control font-medium"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => void undo()}
                className="min-h-12 rounded-xl border border-control font-semibold text-danger-ink"
              >
                Put back
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
            className="min-h-12 w-full rounded-xl border border-control bg-raised font-medium"
          >
            Undo the last restore
          </button>
        ))}
      <p role="status" className="text-sm empty:hidden">
        {message}
      </p>
    </div>
  );
}
