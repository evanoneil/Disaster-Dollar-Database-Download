"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Search, X } from 'lucide-react';
import DisasterLookupDisplay from './DisasterLookupDisplay';
import { MAIN_CSV, loadEnrichment, applyEnrichment } from '@/lib/disasterData';

export interface DisasterData {
  incident_start: string;
  incident_end?: string;
  incident_type: string;
  state: string;
  event: string;
  ihp_total: number;
  pa_total: number;
  cdbg_dr_allocation: number;
  sba_total_approved_loan_amount: number;
  incident_number: number;
  declaration_date: string;
  declaration_url: string;
  year?: number | null;
  ihp_applicants?: number;
  ihp_average_award?: number;
  common_name_1?: string | null;
  common_name_2?: string | null;
  common_name_3?: string | null;
  tribal_request?: boolean | string;
  _searchTerms?: string;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa',
  MP: 'Northern Mariana Islands', FM: 'Federated States of Micronesia',
  MH: 'Marshall Islands', PW: 'Palau',
};

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  return 0;
};

const cleanStr = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'NULL') return '';
  return s;
};

const formatCurrency = (n: number): string => {
  if (!n || isNaN(n)) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const formatDate = (s: string): string => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface Props { useSBAData?: boolean; }

// Default disaster shown on first load so the section isn't empty — Hurricane
// Harvey (Texas, 2017), DR-4332.
const DEFAULT_INCIDENT = 4332;

const DisasterLookup: React.FC<Props> = ({ useSBAData = true }) => {
  const [raw, setRaw] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showPanel, setShowPanel] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(DEFAULT_INCIDENT);
  // First-view hint overlay prompting the user to search; dismissed on any interaction.
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const enrichment = await loadEnrichment();
        const res = await fetch(MAIN_CSV);
        const text = await res.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = applyEnrichment(
              (results.data as DisasterData[])
                .filter(r => r && r.incident_number && r.state)
                .map(r => ({
                  ...r,
                  ihp_total: toNum(r.ihp_total),
                  pa_total: toNum(r.pa_total),
                  cdbg_dr_allocation: toNum(r.cdbg_dr_allocation),
                  sba_total_approved_loan_amount: toNum(r.sba_total_approved_loan_amount),
                })),
              enrichment,
            );
            setRaw(rows);
            setLoading(false);
          }
        });
      } catch (e) {
        console.error('Error loading data:', e);
        setLoading(false);
      }
    };
    load();
  }, [useSBAData]);

  const enriched = useMemo(() => {
    return raw.map(r => {
      const total = r.ihp_total + r.pa_total + r.cdbg_dr_allocation +
        (useSBAData ? r.sba_total_approved_loan_amount : 0);
      return { ...r, _totalFed: total };
    });
  }, [raw, useSBAData]);

  const allTypes = useMemo(
    () => _.uniq(enriched.map(d => d.incident_type)).filter(Boolean).sort() as string[],
    [enriched]
  );

  const allStates = useMemo(
    () => _.uniq(enriched.map(d => d.state)).filter(Boolean).sort() as string[],
    [enriched]
  );

  // For each disaster, derive an expanded set of classifications: its declared
  // incident_type plus any other known types whose name appears inside the event
  // string (e.g. a "Severe Storm" event titled "...Tornadoes..." also counts as Tornado).
  const classified = useMemo(() => {
    const typesLower = allTypes.map(t => ({ original: t, lower: t.toLowerCase() }));
    return enriched.map(d => {
      const eventLower = (d.event || '').toLowerCase();
      const derived: string[] = [];
      if (d.incident_type) derived.push(d.incident_type);
      typesLower.forEach(({ original, lower }) => {
        if (!eventLower) return;
        if (derived.includes(original)) return;
        if (eventLower.includes(lower)) derived.push(original);
      });
      return { ...d, _derivedTypes: derived };
    });
  }, [enriched, allTypes]);

  const displayName = (d: DisasterData) => {
    return cleanStr(d.common_name_1)
      || cleanStr(d.event)
      || `${d.incident_type} — ${STATE_NAMES[d.state] || d.state}`;
  };

  const hasActiveQuery = search.trim() !== '' || stateFilter !== 'ALL' || typeFilter !== 'ALL';

  const filtered = useMemo(() => {
    if (!hasActiveQuery) return [];
    const q = search.trim().toLowerCase();
    return classified
      .filter(d => {
        if (typeFilter !== 'ALL' && !d._derivedTypes.includes(typeFilter)) return false;
        if (stateFilter !== 'ALL' && d.state !== stateFilter) return false;
        if (!q) return true;
        const hay = [
          displayName(d),
          cleanStr(d.common_name_1), cleanStr(d.common_name_2), cleanStr(d.common_name_3),
          cleanStr(d._searchTerms),
          cleanStr(d.event), d.incident_type, d.state,
          STATE_NAMES[d.state], String(d.incident_number),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const da = a.incident_start ? new Date(a.incident_start).getTime() : 0;
        const db = b.incident_start ? new Date(b.incident_start).getTime() : 0;
        return db - da;
      });
  }, [classified, search, stateFilter, typeFilter, hasActiveQuery]);

  const selectedDisaster = useMemo(
    () => selectedId === null ? null : classified.find(d => d.incident_number === selectedId) || null,
    [selectedId, classified]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex items-center justify-center gap-3">
          <div className="w-2 h-2 bg-[#00A79D] rounded-full animate-pulse" />
          <div className="w-2 h-2 bg-[#003A63] rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
          <div className="w-2 h-2 bg-[#89684F] rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
          <span className="ml-2 text-sm text-[#89684F] font-medium">Loading disaster records...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 pb-6">
      {/* Picker */}
      <section className="pt-8 mb-8">
        <div className="relative max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#89684F]" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowPanel(true); setShowIntro(false); }}
                onFocus={() => { setShowIntro(false); if (hasActiveQuery) setShowPanel(true); }}
                placeholder="Search by name, state, or DR number..."
                className="w-full pl-10 pr-9 py-3 text-sm bg-white border border-[#E6E7E8] rounded-md text-[#003A63] placeholder-[#89684F]/60 focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D] shadow-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#89684F] hover:text-[#003A63]"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <select
              value={stateFilter}
              onChange={e => { setStateFilter(e.target.value); setShowPanel(true); }}
              className="text-sm bg-white border border-[#E6E7E8] rounded-md px-3 py-2 text-[#003A63] focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D] min-w-[160px] shadow-sm"
            >
              <option value="ALL">All states</option>
              {allStates.map(s => (
                <option key={s} value={s}>{STATE_NAMES[s] || s}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setShowPanel(true); }}
              className="text-sm bg-white border border-[#E6E7E8] rounded-md px-3 py-2 text-[#003A63] focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D] min-w-[180px] shadow-sm"
            >
              <option value="ALL">All disaster types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {hasActiveQuery && showPanel && (
            <div className="absolute z-10 left-0 right-0 mt-2 bg-white border border-[#E6E7E8] rounded-md shadow-lg overflow-hidden">
              <div className="max-h-[380px] overflow-y-auto scrollbar-custom">
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#89684F]">
                    No disasters match your search.
                  </div>
                ) : (
                  <ul className="divide-y divide-[#E6E7E8]/60">
                    {filtered.slice(0, 100).map(d => (
                      <li key={d.incident_number}>
                        <button
                          onClick={() => {
                            setSelectedId(d.incident_number);
                            setShowPanel(false);
                            setShowIntro(false);
                          }}
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-[#003A63]/[0.04]"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-[#003A63] truncate">
                                {displayName(d)}
                              </span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#003A63]/[0.06] text-[#003A63]">
                                {d.incident_type}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#89684F] mt-0.5">
                              {STATE_NAMES[d.state] || d.state} · {formatDate(d.incident_start)} · DR-{d.incident_number}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-sm font-bold text-[#00A79D] tabular-nums">
                              {formatCurrency(d._totalFed)}
                            </div>
                            <div className="text-[10px] text-[#89684F]">federal obligations</div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {filtered.length > 100 && (
                  <div className="px-4 py-2 text-[11px] text-[#89684F] text-center border-t border-[#E6E7E8] bg-[#003A63]/[0.015]">
                    Showing first 100 of {filtered.length.toLocaleString()} matches — refine your search for more.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Result */}
      <div className="relative">
        {selectedDisaster ? (
          <DisasterLookupDisplay
            event={selectedDisaster}
            allEvents={classified}
            stateNames={STATE_NAMES}
            useSBAData={useSBAData}
            displayName={displayName(selectedDisaster)}
          />
        ) : (
          <section className="bg-white border border-dashed border-[#E6E7E8] rounded-lg py-16 text-center">
            <p className="text-sm text-[#89684F]">Select a disaster above to see its funding summary.</p>
          </section>
        )}

        {/* First-view overlay: prompt the user to search */}
        {showIntro && (
          <div className="absolute inset-0 z-20 flex items-start justify-center pt-12 sm:pt-20 px-4 bg-white/75 backdrop-blur-[1px]">
            <div className="max-w-md bg-white border border-[#E6E7E8] shadow-xl p-6 text-center">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#00A79D]/10 mb-3">
                <Search size={20} className="text-[#00A79D]" />
              </div>
              <h3 className="text-base font-bold text-[#003A63]">Look up any U.S. disaster</h3>
              <p className="text-sm text-[#89684F] mt-1.5 leading-relaxed">
                Search by disaster name, state, or DR number above to explore federal funding for a single event. Scroll below to explore the full database and to compare across disasters.
              </p>
              <button
                onClick={() => setShowIntro(false)}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#003A63] rounded-md hover:bg-[#002B4A] transition-colors"
              >
                Explore
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DisasterLookup;
