import { Toast } from '../../app/Toast.tsx';
import type { EditOrigin, SolveEditing } from '../../db/solveEditing.ts';

/** Shared feedback and Undo control for a Timer or Sessions solve edit. */
export function SolveEditToast({
  editing,
  origin,
  toast,
  onDismiss,
}: {
  readonly editing: SolveEditing;
  readonly origin: EditOrigin;
  readonly toast: {
    readonly message: string;
    readonly action?: { readonly label: string; readonly onClick: () => void };
  } | null;
  readonly onDismiss: () => void;
}) {
  const feedback = editing.getFeedback(origin);
  const undo = editing.getUndo(origin);
  if (!toast && !feedback && !undo) return null;

  return (
    <Toast
      message={feedback ?? undo?.message ?? toast?.message ?? ''}
      action={
        undo
          ? undo.restoring
            ? undefined
            : { label: 'Undo', onClick: () => void editing.restore(origin) }
          : toast?.action
      }
      durationMs={8000}
      onDismiss={() => {
        if (undo) editing.dismissUndo(origin);
        else onDismiss();
        editing.clearFeedback();
      }}
    />
  );
}
