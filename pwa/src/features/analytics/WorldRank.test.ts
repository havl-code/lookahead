import { describe, expect, it } from 'vitest';
import { describeRank } from './WorldRank.tsx';

describe('describeRank', () => {
  it('words the rank as the desktop dashboard does', () => {
    expect(describeRank({ rank: 1234, percentile: 0.43, outsideTop: null })).toEqual({
      value: '~1,234',
      note: 'Top 0.43% worldwide, by best single',
    });
    expect(describeRank({ rank: 2, percentile: 0, outsideTop: null }).note).toBe(
      'Top 0.01% worldwide, by best single',
    );
    expect(describeRank({ rank: 2, percentile: null, outsideTop: null }).note).toBe(
      'by best single',
    );
    expect(describeRank({ rank: null, percentile: null, outsideTop: 1000 })).toEqual({
      value: '1,000+',
      note: 'Outside the top 1,000, so no estimate',
    });
    expect(describeRank(null)).toEqual({
      value: '-',
      note: "Needs the internet once, to fetch the WCA's rankings",
    });
  });
});
