'use client';

import { useEffect, useRef } from 'react';
import { usePlausible } from 'next-plausible';

/**
 * Custom Plausible analytics helpers.
 *
 * Pageviews + visitors are tracked automatically by the script wired up in
 * src/app/layout.tsx. These helpers add intent events on top of that.
 *
 * To add a new event anywhere: call `usePlausible()` from "next-plausible" in a
 * client component and invoke `plausible('Event Name', { props: { ... } })`.
 * Then register "Event Name" as a Goal in the Plausible dashboard
 * (Site Settings -> Goals) so it shows up broken out in the stats.
 */

/**
 * Fire a single "Search" event ~800ms after the user stops typing, instead of
 * one event per keystroke (these search boxes filter live, with no submit
 * button). Only queries of 3+ characters are reported.
 *
 * @param query  the current search input value
 * @param source which search box, e.g. "lookup" or "fact-sheet"
 */
export function useTrackSearch(query: string, source: string) {
  const plausible = usePlausible();
  // usePlausible() may return a new function each render; keep a stable ref so
  // the debounce effect only re-runs when the query/source actually change.
  const plausibleRef = useRef(plausible);
  plausibleRef.current = plausible;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      plausibleRef.current('Search', { props: { query: q, source } });
    }, 800);
    return () => clearTimeout(timer);
  }, [query, source]);
}
