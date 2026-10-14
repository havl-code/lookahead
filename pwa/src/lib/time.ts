/** A date on this device's calendar as YYYY-MM-DD, the way session dates are stored. */
export function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A YYYY-MM-DD date the New Zealand way, such as "8 Oct 2026". */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** A moment the New Zealand way, such as "8 Oct 2026, 3:05 pm". */
export function formatMoment(ms: number | string): string {
  return new Date(ms).toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
