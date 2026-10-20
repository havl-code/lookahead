import { useLiveQuery } from 'dexie-react-hooks';
import { detailHref } from '../../app/router.ts';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { formatClock } from '../../lib/format.ts';
import { singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';
import { type PbKind, pbDetails } from './data.ts';

export interface Pb {
  readonly kind: PbKind;
  /** The PB as shown on the card. */
  readonly text: string;
  readonly sessionId: number;
  readonly date: string | null;
}

/**
 * Where a PB came from, as the desktop dashboard's PB window shows it: its date, and the single's
 * scramble or the average's solves, with the dropped ones in brackets as cubers write them.
 */
export function PbSheet({ pb, onClose }: { readonly pb: Pb | null; readonly onClose: () => void }) {
  return (
    <Sheet
      open={pb !== null}
      onClose={onClose}
      title={pb === null || pb.kind === 'single' ? 'Best single' : `Best Ao${pb.kind}`}
    >
      {pb && <PbBody pb={pb} />}
    </Sheet>
  );
}

function PbBody({ pb }: { readonly pb: Pb }) {
  const db = useDb();
  const details = useLiveQuery(
    () => pbDetails(db, pb.sessionId, pb.kind),
    [db, pb.sessionId, pb.kind],
  );
  return (
    <>
      <div>
        <p className="font-semibold text-4xl tabular-nums">{pb.text}</p>
        <p className="text-muted">{pb.date ? formatDate(pb.date) : 'No date'}</p>
      </div>
      {details === null && <p className="text-muted">Couldn't find this PB's solves.</p>}
      {details?.kind === 'single' && (
        <div>
          <h3 className="text-muted text-sm">Scramble</h3>
          <p className="font-mono">{details.scramble ?? 'No scramble recorded'}</p>
        </div>
      )}
      {details && details.kind !== 'single' && (
        <div>
          <h3 className="text-muted text-sm">Solves</h3>
          <p className="font-mono tabular-nums">
            {details.solves
              .map((solve) => {
                const seconds = singleSeconds(solve.ms);
                const time = seconds === null ? 'DNF' : formatClock(seconds);
                return solve.counted ? time : `(${time})`;
              })
              .join(' ')}
          </p>
          <p className="text-muted text-sm">The dropped ones are in brackets.</p>
        </div>
      )}
      <a
        href={detailHref('sessions', String(pb.sessionId))}
        className="inline-flex min-h-11 items-center text-accent-ink underline underline-offset-2"
      >
        Open its session
      </a>
    </>
  );
}
