import { type ReactNode, useId } from 'react';

// The app's button and field styles, so every sheet and screen looks the same.
export const primaryButton =
  'min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60';
export const secondaryButton =
  'min-h-12 rounded-xl border border-control bg-raised px-4 font-medium disabled:opacity-60';
export const dangerButton =
  'min-h-12 rounded-xl border border-control px-4 font-semibold text-danger-ink disabled:opacity-60';
export const fieldStyle = 'min-h-11 w-full rounded-lg border border-control bg-surface px-3';

/**
 * A labelled field with an optional hint and error, both tied to the field for screen readers.
 * `children` gets the ids to put on the field.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | null | undefined;
  readonly children: (ids: {
    readonly id: string;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': boolean | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': described || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger-ink text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
