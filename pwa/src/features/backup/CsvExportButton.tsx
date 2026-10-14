import { useState } from 'react';
import { secondaryButton } from '../../app/forms.tsx';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { saveFile } from '../../lib/share.ts';

// The CSV code loads the first time it's needed.
const loadCsv = () => import('./solvesCsv.ts');

/**
 * Exports every solve, or one session's, as CSV for a spreadsheet. If making the file takes
 * longer than iOS allows between a tap and its share sheet, a second tap shares it.
 */
export function CsvExportButton({
  sessionId = null,
  className = '',
}: {
  readonly sessionId?: number | null;
  readonly className?: string;
}) {
  const db = useDb();
  const [ready, setReady] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setMessage(null);
    setError(null);
    setBusy(true);
    const release = holdUpdates();
    let file = ready;
    try {
      file ??= await (await loadCsv()).solvesCsvFile(db, sessionId);
      const result = await saveFile(file);
      setReady(null);
      if (result !== 'cancelled') setMessage('Solves exported.');
    } catch (caught) {
      if (file && caught instanceof DOMException && caught.name === 'NotAllowedError') {
        setReady(file);
        setMessage('The file is ready. Tap again to save or share it.');
      } else {
        setReady(null);
        setError("Couldn't export the solves. Try again.");
      }
    } finally {
      setBusy(false);
      release();
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void exportCsv()}
        disabled={busy}
        className={`${secondaryButton} w-full`}
      >
        {busy ? 'Exporting…' : ready ? 'Save or share CSV' : 'Export solves (CSV)'}
      </button>
      <p role="status" className="text-sm empty:hidden">
        {message}
      </p>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
