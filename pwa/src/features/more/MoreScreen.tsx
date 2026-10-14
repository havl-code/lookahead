import { ForwardIcon } from '../../app/icons.tsx';
import { repoUrl } from '../../app/Preview.tsx';
import { detailHref, useDetail } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCubes } from '../../db/hooks.ts';
import { count } from '../../lib/format.ts';
import { BackupSection } from '../backup/BackupSection.tsx';
import { CsvExportButton } from '../backup/CsvExportButton.tsx';
import { CubesScreen } from '../cubes/CubesScreen.tsx';
import { CsTimerImport } from '../import/CsTimerImport.tsx';
import { WcaSection } from './WcaSection.tsx';

/** The More tab, or its Cubes page (#/more/cubes). */
export function MoreScreen() {
  if (useDetail() === 'cubes') return <CubesScreen />;
  return <MoreList />;
}

function MoreList() {
  const cubes = useCubes();
  const inUse = cubes ? [...cubes.values()].filter((cube) => cube.is_active).length : null;

  return (
    <>
      <ScreenHeader title="More" />
      <nav aria-label="Your things" className="mt-4">
        <ul className="divide-y divide-line rounded-xl border border-line bg-raised">
          <li>
            <a
              href={detailHref('more', 'cubes')}
              className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="font-medium">Cubes</span>
              <span className="inline-flex items-center gap-1 text-muted text-sm">
                {inUse === null
                  ? ''
                  : inUse === 0
                    ? 'None yet'
                    : `${count(inUse, 'cube', 'cubes')} in use`}
                <ForwardIcon className="size-4" />
              </span>
            </a>
          </li>
        </ul>
      </nav>
      <WcaSection />
      <BackupSection />
      <section aria-labelledby="import-export-heading" className="mt-6 space-y-3">
        <h2 id="import-export-heading" className="font-semibold text-lg">
          Import and export
        </h2>
        <p className="text-muted text-sm">
          Bring in your solves from a CSTimer export file, or export every solve as a CSV file to
          read in a spreadsheet.
        </p>
        <CsTimerImport />
        <CsvExportButton />
      </section>
      <section className="mt-6">
        <h2 className="font-semibold">About</h2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-raised">
          <li>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center px-4 py-2"
            >
              Lookahead on GitHub
            </a>
          </li>
        </ul>
        <p className="mt-3 text-muted text-sm">
          Your solves stay on this device. There is no account, no server, and no tracking. Only
          looking up your WCA ID goes to the WCA website.
        </p>
      </section>
    </>
  );
}
