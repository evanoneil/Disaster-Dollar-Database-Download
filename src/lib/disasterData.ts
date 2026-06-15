import Papa from 'papaparse';

/**
 * The single, definitive Disaster Dollar Database that powers every function on
 * the site. All components load from this file.
 */
export const MAIN_CSV = '/data/disaster_dollar_database_2026_05_31.csv';

/**
 * Natural-language search terms keyed on FEMA Code (== incident_number). These
 * are the informal names people search disasters by (e.g. "Houston Harvey
 * flood") that aren't the official FEMA title.
 */
const SEARCH_TERMS_CSV = '/data/DDD_Search_Terms_Full_Dataset_NaturalLanguage_May2026.csv';

/**
 * The previous definitive dataset, retained only as the source of the
 * `tribal_request` flag — the 2026 file no longer carries that column, so we
 * join it back in by incident_number to keep the "Tribal Areas only" filter
 * working for the records that have it.
 */
const TRIBAL_SOURCE_CSV = '/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv';

export interface DisasterEnrichment {
  /** incident_number -> a single lowercased blob of all natural-language search terms */
  searchTerms: Map<number, string>;
  /** incident_numbers flagged as a tribal request in the prior dataset */
  tribal: Set<number>;
}

const toIncidentNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function loadSearchTerms(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const text = await fetchText(SEARCH_TERMS_CSV);
    const { data } = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    for (const row of data) {
      if (!row) continue;
      // Tolerate a stray BOM on the first header ("﻿FEMA Code").
      const codeKey = Object.keys(row).find(k => k.replace(/^﻿/, '').trim() === 'FEMA Code');
      const code = toIncidentNumber(codeKey ? row[codeKey] : undefined);
      if (code === null) continue;
      const terms = Object.keys(row)
        .filter(k => k.trim().toLowerCase().startsWith('term '))
        .map(k => (row[k] ?? '').trim())
        .filter(Boolean);
      if (terms.length === 0) continue;
      map.set(code, terms.join(' ').toLowerCase());
    }
  } catch (e) {
    console.error('Could not load disaster search terms:', e);
  }
  return map;
}

async function loadTribalFlags(): Promise<Set<number>> {
  const set = new Set<number>();
  try {
    const text = await fetchText(TRIBAL_SOURCE_CSV);
    const { data } = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    for (const row of data) {
      if (!row) continue;
      const code = toIncidentNumber(row.incident_number);
      if (code === null) continue;
      const flag = row.tribal_request;
      if (flag === true || String(flag).toUpperCase() === 'TRUE') set.add(code);
    }
  } catch (e) {
    console.error('Could not load tribal flags:', e);
  }
  return set;
}

/**
 * Loads the auxiliary datasets (search terms + tribal flags) that are joined
 * onto the main disaster records by incident_number. Both fetches run in
 * parallel and either failing degrades gracefully to an empty index.
 */
export async function loadEnrichment(): Promise<DisasterEnrichment> {
  const [searchTerms, tribal] = await Promise.all([loadSearchTerms(), loadTribalFlags()]);
  return { searchTerms, tribal };
}

/**
 * Attaches `tribal_request` (boolean) and `_searchTerms` (string) onto each row
 * from the enrichment index, keyed by incident_number. Returns a new array.
 */
export function applyEnrichment<T extends { incident_number?: unknown }>(
  rows: T[],
  enrichment: DisasterEnrichment,
): (T & { tribal_request: boolean; _searchTerms: string })[] {
  return rows.map(r => {
    const code = toIncidentNumber(r.incident_number);
    return {
      ...r,
      tribal_request: code !== null && enrichment.tribal.has(code),
      _searchTerms: (code !== null && enrichment.searchTerms.get(code)) || '',
    };
  });
}
