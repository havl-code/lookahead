import { useState } from 'react';
import { Field, fieldStyle, primaryButton, secondaryButton } from '../../app/forms.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { useWcaPerson } from '../../db/hooks.ts';
import { clearWcaPerson, setWcaPerson } from '../../db/user.ts';
import { wcaId as checkWcaId } from '../../lib/validation.ts';
import { lookUpWcaName, WcaLookupError } from '../../lib/wca.ts';

const profileUrl = 'https://www.worldcubeassociation.org/persons/';

/** Your WCA ID, with your name looked up on the WCA website. */
export function WcaSection() {
  const db = useDb();
  const person = useWcaPerson();
  const [changing, setChanging] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function save() {
    // Checked before looking it up, so a typo never goes to the WCA website.
    const checked = checkWcaId(typed);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    setChecking(true);
    try {
      const name = await lookUpWcaName(checked.value);
      await setWcaPerson(db, { wcaId: checked.value, name });
      setChanging(false);
      setTyped('');
    } catch (failure) {
      setError(
        failure instanceof WcaLookupError || failure instanceof StorageFullError
          ? failure.message
          : "Couldn't save your WCA ID. Try again.",
      );
    } finally {
      setChecking(false);
    }
  }

  if (person === undefined) return null;
  const editing = person === null || changing;

  return (
    <section aria-labelledby="wca-heading" className="mt-6 space-y-3">
      <h2 id="wca-heading" className="font-semibold text-lg">
        WCA ID
      </h2>
      {person && !changing && (
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
          <p>
            <span className="font-semibold">{person.name || person.wcaId}</span>
            {person.name && <span className="text-muted"> ({person.wcaId})</span>}
          </p>
          <a
            href={profileUrl + encodeURIComponent(person.wcaId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2"
          >
            Your WCA profile
          </a>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setChanging(true)} className={secondaryButton}>
              Change
            </button>
            <button
              type="button"
              onClick={() => void clearWcaPerson(db)}
              className={secondaryButton}
            >
              Remove
            </button>
          </div>
        </div>
      )}
      {editing && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-3 rounded-xl border border-line bg-raised p-4"
        >
          <Field
            label="Your WCA ID"
            hint="It's on your WCA profile, such as 2003POCH01. Lookahead looks up your name on the WCA website, so this needs the internet."
            error={error}
          >
            {(ids) => (
              <input
                {...ids}
                value={typed}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                onChange={(event) => setTyped(event.target.value)}
                className={`${fieldStyle} uppercase`}
              />
            )}
          </Field>
          <div className="flex gap-3">
            <button type="submit" disabled={checking} className={primaryButton}>
              {checking ? 'Checking...' : 'Save'}
            </button>
            {person && (
              <button
                type="button"
                onClick={() => {
                  setChanging(false);
                  setError(null);
                }}
                className={secondaryButton}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      <p className="text-muted text-sm">
        Your WCA ID travels with your backups, so the desktop app has it too.
      </p>
    </section>
  );
}
