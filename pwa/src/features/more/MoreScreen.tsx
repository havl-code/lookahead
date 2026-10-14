import { Preview, repoUrl } from '../../app/Preview.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';

export function MoreScreen() {
  return (
    <>
      <ScreenHeader title="More" />
      <Preview>Cubes, CSTimer import, backups, and settings.</Preview>
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
          Your solves stay on this device. There is no account, no server, and no tracking.
        </p>
      </section>
    </>
  );
}
