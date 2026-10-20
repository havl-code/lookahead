import type { WcaReference } from './scores.ts';
import reference from './wca_reference.json' with { type: 'json' };

/**
 * The summary of WCA results the scores compare with, rebuilt each month by
 * tools/build_wca_reference.py. About 60 KB gzipped, so it's bundled with the Analytics tab and
 * works offline.
 */
export const wcaReference = reference as WcaReference;
