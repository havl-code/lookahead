/**
 * The events the app knows about, by their WCA event IDs, in the order menus list them. The same
 * as the 3.x desktop app's speedcube/events.py.
 */
export const events = {
  '222': '2x2x2',
  '333': '3x3x3',
  '444': '4x4x4',
  '555': '5x5x5',
  '666': '6x6x6',
  '777': '7x7x7',
  '333oh': '3x3x3 One-Handed',
  '333bf': '3x3x3 Blindfolded',
  clock: 'Clock',
  minx: 'Megaminx',
  pyram: 'Pyraminx',
  skewb: 'Skewb',
  sq1: 'Square-1',
  '444bf': '4x4x4 Blindfolded',
  '555bf': '5x5x5 Blindfolded',
  '333mbf': '3x3x3 Multi-Blind',
} as const;

/** An event's name, or its ID for one the app doesn't know. */
export function eventName(eventId: string | null): string {
  if (eventId === null) return 'Unknown event';
  return Object.hasOwn(events, eventId) ? events[eventId as keyof typeof events] : eventId;
}
