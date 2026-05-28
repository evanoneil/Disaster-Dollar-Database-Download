"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Search, X, Plus, ExternalLink } from 'lucide-react';

interface DisasterRow {
  incident_number: number;
  event: string;
  incident_type: string;
  state: string;
  incident_start: string;
  incident_end: string;
  declaration_date: string;
  declaration_url: string;
  ihp_total: number;
  pa_total: number;
  cdbg_dr_allocation: number;
  sba_total_approved_loan_amount: number;
  common_name_1?: string | null;
  common_name_2?: string | null;
  common_name_3?: string | null;
  year: number;
}

const MAX_SELECTED = 6;
const MIN_SELECTED = 2;

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
  MP: 'Northern Mariana Islands',
};

const PROGRAM_META = [
  { key: 'ihp', label: 'IHP', full: 'Individual & Household Program', color: '#2171b5' },
  { key: 'pa', label: 'PA', full: 'Public Assistance', color: '#41B6E6' },
  { key: 'cdbg', label: 'CDBG-DR', full: 'Community Development Block Grant – Disaster Recovery', color: '#89684F' },
  { key: 'sba', label: 'SBA', full: 'Small Business Administration Loans', color: '#228B22' },
] as const;

type ProgramKey = (typeof PROGRAM_META)[number]['key'];

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  return 0;
};

const formatCurrency = (n: number): string => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const formatCurrencyFull = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatDate = (s: string): string => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysBetween = (a: string, b: string): number | null => {
  if (!a || !b) return null;
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / 86_400_000) + 1);
};

interface Props { useSBAData?: boolean; }

const DisasterComparison: React.FC<Props> = ({ useSBAData = true }) => {
  const [raw, setRaw] = useState<DisasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv');
        const text = await res.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = (results.data as DisasterRow[]).filter(r => r.incident_number);
            setRaw(rows);
            setLoading(false);
          },
        });
      } catch (e) {
        console.error('Error loading data:', e);
        setLoading(false);
      }
    };
    load();
  }, []);

  // Dedupe to one row per incident_number, keeping the row with highest federal total
  const disasters = useMemo(() => {
    if (raw.length === 0) return [];
    const byIncident = _.groupBy(raw, 'incident_number');
    return Object.values(byIncident)
      .map(rows => {
        const scored = rows.map(r => ({
          row: r,
          total: toNum(r.ihp_total) + toNum(r.pa_total) + toNum(r.cdbg_dr_allocation) +
                 (useSBAData ? toNum(r.sba_total_approved_loan_amount) : 0),
        }));
        scored.sort((a, b) => b.total - a.total);
        const states = _.uniq(rows.map(r => r.state)).filter(Boolean) as string[];
        return {
          ...scored[0].row,
          _states: states,
          _totalFed: scored.reduce((s, x) => s + x.total, 0), // sum across all states
          _byProgram: {
            ihp: _.sumBy(rows, r => toNum(r.ihp_total)),
            pa: _.sumBy(rows, r => toNum(r.pa_total)),
            cdbg: _.sumBy(rows, r => toNum(r.cdbg_dr_allocation)),
            sba: useSBAData ? _.sumBy(rows, r => toNum(r.sba_total_approved_loan_amount)) : 0,
          } as Record<ProgramKey, number>,
        };
      })
      .sort((a, b) => (b._totalFed - a._totalFed));
  }, [raw, useSBAData]);

  const allTypes = useMemo(
    () => _.uniq(disasters.map(d => d.incident_type)).filter(Boolean).sort() as string[],
    [disasters]
  );

  const cleanStr = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    if (s === '' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'NULL') return '';
    return s;
  };

  const displayName = (d: (typeof disasters)[number]) => {
    return cleanStr(d.common_name_1)
      || cleanStr(d.event)
      || `${d.incident_type} — ${STATE_NAMES[d.state] || d.state}`;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disasters.filter(d => {
      if (typeFilter !== 'ALL') {
        const ev = (d.event || '').toLowerCase();
        const tf = typeFilter.toLowerCase();
        if (d.incident_type !== typeFilter && !ev.includes(tf)) return false;
      }
      if (!q) return true;
      const hay = [
        displayName(d),
        cleanStr(d.common_name_1), cleanStr(d.common_name_2), cleanStr(d.common_name_3),
        cleanStr(d.event), d.incident_type, d.state,
        STATE_NAMES[d.state], String(d.year), String(d.incident_number),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [disasters, search, typeFilter]);

  const selected = useMemo(
    () => selectedIds
      .map(id => disasters.find(d => d.incident_number === id))
      .filter(Boolean) as (typeof disasters),
    [selectedIds, disasters]
  );

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  };

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

  const gridCols = selected.length <= 2
    ? 'lg:grid-cols-2'
    : selected.length === 3
      ? 'lg:grid-cols-3'
      : 'lg:grid-cols-3';

  return (
    <div className="max-w-7xl mx-auto px-6 pb-16">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <section className="pt-8 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-end gap-4">
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold">Selected</div>
              <div className="text-2xl font-black text-[#003A63] tabular-nums">
                {selected.length}<span className="text-[#89684F] text-lg">/{MAX_SELECTED}</span>
              </div>
            </div>
            {selected.length > 0 && (
              <>
                <div className="w-px h-12 bg-[#E6E7E8]" />
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold">Combined</div>
                  <div className="text-2xl font-black text-[#00A79D] tabular-nums">
                    {formatCurrency(selected.reduce((s, d) => s + d._totalFed, 0))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─── Picker ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white border border-[#E6E7E8] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E6E7E8] flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89684F]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, state, year..."
                className="w-full pl-9 pr-8 py-2 text-sm border border-[#E6E7E8] rounded-md text-[#003A63] placeholder-[#89684F]/60 focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#89684F] hover:text-[#003A63]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-sm border border-[#E6E7E8] rounded-md px-3 py-2 text-[#003A63] focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D] min-w-[180px]"
            >
              <option value="ALL">All disaster types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="max-h-[380px] overflow-y-auto scrollbar-custom">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#89684F]">
                No disasters match your search.
              </div>
            ) : (
              <ul className="divide-y divide-[#E6E7E8]/60">
                {filtered.slice(0, 200).map(d => {
                  const isSel = selectedIds.includes(d.incident_number);
                  const atCap = !isSel && selectedIds.length >= MAX_SELECTED;
                  return (
                    <li key={d.incident_number}>
                      <button
                        onClick={() => toggleSelect(d.incident_number)}
                        disabled={atCap}
                        className={`w-full px-5 py-3 flex items-center gap-4 text-left transition-colors ${
                          isSel
                            ? 'bg-[#00A79D]/[0.08] hover:bg-[#00A79D]/[0.12]'
                            : atCap
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:bg-[#003A63]/[0.02]'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSel
                            ? 'border-[#00A79D] bg-[#00A79D] text-white'
                            : 'border-[#E6E7E8]'
                        }`}>
                          {isSel && <span className="text-[11px] font-bold leading-none">✓</span>}
                        </div>
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
                  );
                })}
              </ul>
            )}
            {filtered.length > 200 && (
              <div className="px-5 py-3 text-[11px] text-[#89684F] text-center border-t border-[#E6E7E8] bg-[#003A63]/[0.015]">
                Showing first 200 of {filtered.length.toLocaleString()} matches — refine your search for more.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Comparison Cards ───────────────────────────────────────── */}
      {selected.length === 0 ? (
        <section className="bg-white border border-dashed border-[#E6E7E8] rounded-lg py-16 text-center">
          <p className="text-sm text-[#89684F]">Select at least {MIN_SELECTED} disasters above to see a comparison.</p>
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#003A63]">
              Comparison
              <span className="ml-2 text-xs font-normal text-[#89684F]">
                ({selected.length} {selected.length === 1 ? 'disaster' : 'disasters'})
              </span>
            </h2>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs font-semibold text-[#89684F] hover:text-[#003A63] transition-colors"
            >
              Clear all
            </button>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-4`}>
            {selected.map(d => {
              const programs = PROGRAM_META
                .filter(p => useSBAData || p.key !== 'sba')
                .map(p => ({ ...p, value: d._byProgram[p.key] || 0 }));
              const total = d._totalFed;
              const duration = daysBetween(d.incident_start, d.incident_end);
              return (
                <div
                  key={d.incident_number}
                  className="relative bg-white border border-[#E6E7E8] rounded-b-lg overflow-hidden hover:border-[#00A79D]/40 transition-colors"
                >
                  {/* Top accent */}
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#003A63] via-[#00A79D] to-[#89684F]" />

                  {/* Remove button */}
                  <button
                    onClick={() => toggleSelect(d.incident_number)}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-[#89684F] hover:bg-[#003A63]/[0.06] hover:text-[#003A63] transition-colors"
                    aria-label="Remove from comparison"
                  >
                    <X size={14} />
                  </button>

                  <div className="p-5 pt-5">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#003A63]/[0.08] text-[#003A63]">
                        {d.incident_type}
                      </span>
                      <span className="text-[10px] text-[#89684F] tabular-nums">DR-{d.incident_number}</span>
                    </div>

                    {/* Name */}
                    <h3 className="text-lg font-black text-[#003A63] leading-tight mb-1 pr-6">
                      {displayName(d)}
                    </h3>
                    {(() => {
                      const cn = cleanStr(d.common_name_1);
                      const ev = cleanStr(d.event);
                      const showSubtitle = cn && ev && cn.toLowerCase() !== ev.toLowerCase();
                      return (
                        <div className="text-[11px] text-[#89684F] mb-2 italic truncate min-h-[1rem]">
                          {showSubtitle ? ev : '\u00A0'}
                        </div>
                      );
                    })()}

                    {/* Dates + states */}
                    <div className="text-xs text-[#89684F] mb-4 space-y-0.5">
                      <div>
                        {formatDate(d.incident_start)}
                        {d.incident_end && d.incident_end !== d.incident_start && <> – {formatDate(d.incident_end)}</>}
                        {duration && <span className="text-[#89684F]/70"> · {duration}d</span>}
                      </div>
                      <div>
                        {d._states.slice(0, 4).map(s => STATE_NAMES[s] || s).join(', ')}
                        {d._states.length > 4 && ` +${d._states.length - 4} more`}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[#89684F] font-semibold">Federal obligations</div>
                      <div className="text-3xl font-black text-[#00A79D] tabular-nums leading-none mt-1">
                        {formatCurrency(total)}
                      </div>
                      <div className="text-[11px] text-[#89684F] mt-0.5 tabular-nums">
                        {formatCurrencyFull(total)}
                      </div>
                    </div>

                    {/* Program breakdown stacked bar */}
                    {total > 0 && (
                      <div className="mb-3">
                        <div className="h-4 w-full rounded-sm overflow-hidden flex">
                          {programs.map(p => {
                            const pct = (p.value / total) * 100;
                            if (pct < 0.5) return null;
                            return (
                              <div
                                key={p.key}
                                title={`${p.label}: ${formatCurrencyFull(p.value)}`}
                                style={{ width: `${pct}%`, backgroundColor: p.color }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Program rows */}
                    <div className="space-y-1.5">
                      {programs.map(p => {
                        const pct = total > 0 ? (p.value / total) * 100 : 0;
                        return (
                          <div key={p.key} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
                              <span className="font-semibold text-[#003A63]">{p.label}</span>
                              <span className="text-[#89684F]/70 truncate">{p.full}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[#89684F] tabular-nums text-[10px]">{pct.toFixed(0)}%</span>
                              <span className="font-bold text-[#003A63] tabular-nums">{formatCurrency(p.value)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Declaration link */}
                    {d.declaration_url && (
                      <div className="mt-4 pt-3 border-t border-[#E6E7E8]">
                        <a
                          href={d.declaration_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00A79D] hover:text-[#003A63] transition-colors"
                        >
                          FEMA declaration page
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add-more slot */}
            {selected.length < MAX_SELECTED && (
              <button
                onClick={() => {
                  const list = document.getElementById('compare-picker-top');
                  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed border-[#E6E7E8] rounded-lg text-[#89684F] hover:border-[#00A79D]/50 hover:text-[#00A79D] hover:bg-[#00A79D]/[0.03] transition-colors"
              >
                <Plus size={20} />
                <span className="text-xs font-semibold mt-2">Add disaster to compare</span>
                <span className="text-[10px] mt-0.5">{MAX_SELECTED - selected.length} slot{MAX_SELECTED - selected.length === 1 ? '' : 's'} remaining</span>
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default DisasterComparison;
