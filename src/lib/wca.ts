/**
 * Looking up a competitor on the WCA website. Its persons API allows any website to ask
 * (Access-Control-Allow-Origin: *), so this works straight from the phone. It and the world
 * rank (wcaRank.ts) are the only things here that need the internet.
 */

const personsApi = 'https://www.worldcubeassociation.org/api/v0/persons/';
const timeoutMs = 10_000;

export class WcaLookupError extends Error {
  override readonly name = 'WcaLookupError';
}

/** The competitor's name for a WCA ID (already checked), or a WcaLookupError saying what failed. */
export async function lookUpWcaName(wcaId: string, fetcher: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(personsApi + encodeURIComponent(wcaId), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new WcaLookupError(
      "Couldn't reach the WCA website. Check you're online, then try again.",
    );
  }
  if (response.status === 404)
    throw new WcaLookupError('The WCA has no one with that ID. Check it and try again.');
  if (!response.ok)
    throw new WcaLookupError("The WCA website didn't answer properly. Try again later.");
  let name: unknown;
  try {
    const data: unknown = await response.json();
    name = (data as { person?: { name?: unknown } } | null)?.person?.name;
  } catch {
    name = undefined;
  }
  if (typeof name !== 'string' || !name)
    throw new WcaLookupError("The WCA website's answer couldn't be read. Try again later.");
  return name;
}
