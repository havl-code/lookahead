import { useState } from 'react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../../lib/theme.ts';

const choices: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light or dark mode for this device. It's kept apart from your solves, and from backups. */
export function AppearanceSection() {
  const [choice, setChoice] = useState(getThemeChoice);

  return (
    <section aria-labelledby="appearance-heading" className="mt-6 space-y-3">
      <h2 id="appearance-heading" className="font-semibold text-lg">
        Appearance
      </h2>
      <fieldset
        aria-labelledby="appearance-heading"
        className="flex w-fit overflow-hidden rounded-lg border border-control"
      >
        {choices.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => {
              setChoice(value);
              setThemeChoice(value);
            }}
            className={`min-h-11 min-w-20 px-3 font-semibold ${
              choice === value ? 'bg-accent text-on-accent' : 'bg-raised'
            }`}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <p className="text-muted text-sm">
        System follows your phone's light or dark setting. Light and Dark stay that way whatever the
        phone does.
      </p>
    </section>
  );
}
