import { describe, expect, it } from 'vitest';
import { lookUpWcaName } from './wca.ts';

const answer = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;

describe('lookUpWcaName', () => {
  it("gives the competitor's name", async () => {
    let asked = '';
    const fetcher = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ person: { name: 'Test Person' } }));
    }) as unknown as typeof fetch;
    await expect(lookUpWcaName('2003POCH01', fetcher)).resolves.toBe('Test Person');
    expect(asked).toBe('https://www.worldcubeassociation.org/api/v0/persons/2003POCH01');
  });

  it.each([
    [answer(404, {}), 'The WCA has no one with that ID. Check it and try again.'],
    [answer(500, {}), "The WCA website didn't answer properly. Try again later."],
    [answer(200, 'not json'), "The WCA website's answer couldn't be read. Try again later."],
    [answer(200, { person: {} }), "The WCA website's answer couldn't be read. Try again later."],
    [
      (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
      "Couldn't reach the WCA website. Check you're online, then try again.",
    ],
  ])('says what went wrong (%#)', async (fetcher, message) => {
    await expect(lookUpWcaName('2003POCH01', fetcher)).rejects.toThrow(message);
  });
});
