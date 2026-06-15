"use client";

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import * as Papa from 'papaparse';
import { Search, X } from 'lucide-react';
import FactSheetDisplay from './FactSheetDisplay';
import { MAIN_CSV, loadEnrichment, applyEnrichment } from '@/lib/disasterData';

interface DisasterData {
  incident_start: string;
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
  year: number | null;
  ihp_applicants?: number;
  common_name_1?: string;
  common_name_2?: string;
  common_name_3?: string;
  tribal_request?: boolean | string;
  _searchTerms?: string;
  // ... add other fields as needed
}

const validName = (v: string | undefined | null): string | undefined => {
  if (!v || v === 'NA' || v === '0' || v.trim() === '') return undefined;
  return v;
};

const isTribal = (v: boolean | string | undefined): boolean => v === true || v === 'TRUE';

const formatCurrency = (n: number): string => {
  if (!n || isNaN(n)) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

interface FactSheetCreatorProps {
  useSBAData?: boolean;
}

const FactSheetCreator: React.FC<FactSheetCreatorProps> = ({ useSBAData = false }) => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<DisasterData | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [stateFilter, setStateFilter] = useState('');
  const [tribalOnly, setTribalOnly] = useState(false);

  // State and territory mappings
  const stateNames = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DC': 'District of Columbia', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands', 'MP': 'Northern Mariana Islands',
    'AS': 'American Samoa', 'FM': 'Federated States of Micronesia', 'MH': 'Marshall Islands',
    'PW': 'Palau'
  };

  const getStateName = (abbr: string) => stateNames[abbr as keyof typeof stateNames] || abbr;

  useEffect(() => {
    const loadData = async () => {
      try {
        const enrichment = await loadEnrichment();
        const response = await fetch(MAIN_CSV);
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            // Process data to ensure consistent types and add a year field
            const processedData = (results.data as DisasterData[])
              .filter((item: any) => {
                // Filter out any rows without essential data
                return item && item.incident_number && item.state;
              })
              .map(item => {
                // Add a year field for easier filtering
                const year = item.incident_start ? new Date(item.incident_start).getFullYear() : null;

                // Ensure numeric values are properly parsed
                const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total :
                            (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);

                // If we don't have applicants data, estimate it based on disaster type
                let ihpApplicants = item.ihp_applicants;
                if (!ihpApplicants && ihpTotal > 0) {
                  // Different disasters have different average grant sizes
                  let avgGrantSize = 4000; // default

                  if (item.incident_type) {
                    const disasterType = item.incident_type.toLowerCase();

                    // Hurricane assistance tends to be higher
                    if (disasterType.includes('hurricane') || disasterType.includes('typhoon')) {
                      avgGrantSize = 6000;
                    }
                    // Flood assistance varies but is often substantial
                    else if (disasterType.includes('flood')) {
                      avgGrantSize = 5000;
                    }
                    // Wildfire assistance can be quite high per household
                    else if (disasterType.includes('fire') || disasterType.includes('wildfire')) {
                      avgGrantSize = 7000;
                    }
                    // Tornado assistance depends on scope but is often targeted
                    else if (disasterType.includes('tornado')) {
                      avgGrantSize = 4500;
                    }
                  }

                  // Calculate estimated applicants
                  ihpApplicants = Math.round(ihpTotal / avgGrantSize);
                }

                return {
                  ...item,
                  year,
                  ihp_applicants: ihpApplicants,
                  ihp_total: ihpTotal,
                  pa_total: typeof item.pa_total === 'number' ? item.pa_total :
                           (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0),
                  cdbg_dr_allocation: typeof item.cdbg_dr_allocation === 'number' ? item.cdbg_dr_allocation :
                                     (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0),
                  sba_total_approved_loan_amount: typeof item.sba_total_approved_loan_amount === 'number' ? item.sba_total_approved_loan_amount :
                                                 (typeof item.sba_total_approved_loan_amount === 'string' ? parseFloat(item.sba_total_approved_loan_amount) || 0 : 0)
                };
              });

            // Remove any incomplete entries, then join in tribal flags + search terms
            const validData = applyEnrichment(
              processedData.filter(item => item.incident_number),
              enrichment,
            );

            setData(validData);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const totalFederal = (d: DisasterData) =>
    (d.ihp_total || 0) + (d.pa_total || 0) + (d.cdbg_dr_allocation || 0) +
    (useSBAData ? (d.sba_total_approved_loan_amount || 0) : 0);

  const displayName = (d: DisasterData) =>
    validName(d.common_name_1) || d.event || `${d.incident_type} — ${getStateName(d.state)}`;

  // States present in the data, for the filter dropdown
  const allStates = useMemo(
    () => Array.from(new Set(data.map(d => d.state))).filter(Boolean).sort() as string[],
    [data]
  );

  const hasActiveQuery = searchQuery.trim() !== '' || stateFilter !== '' || tribalOnly;

  // Live-filtered matches for the search dropdown (most recent first)
  const filtered = useMemo(() => {
    if (!hasActiveQuery) return [];
    const q = searchQuery.trim().toLowerCase();
    return data
      .filter(d => {
        if (stateFilter && d.state !== stateFilter) return false;
        if (tribalOnly && !isTribal(d.tribal_request)) return false;
        if (!q) return true;
        const hay = [
          displayName(d), d.event, d.incident_type, d.state, getStateName(d.state),
          String(d.incident_number), d._searchTerms,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const da = a.incident_start ? new Date(a.incident_start).getTime() : 0;
        const db = b.incident_start ? new Date(b.incident_start).getTime() : 0;
        return db - da;
      });
  }, [data, searchQuery, stateFilter, tribalOnly, hasActiveQuery]);

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const selectEvent = (event: DisasterData) => {
    setSelectedEvent(event);
    setShowPanel(false);
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

  return (
    <div className="max-w-7xl mx-auto px-6 pb-16">
      {/* Header */}
      <section className="pt-8 mb-6">
        <h1 className="text-xl font-bold text-[#003A63]">Disaster Fact Sheet Creator</h1>
        <p className="text-sm text-[#89684F] mt-1">
          Search for a disaster to build a shareable fact sheet of its federal funding.
        </p>
      </section>

      {/* Picker */}
      <section className="mb-8">
        <div className="relative max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#89684F]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowPanel(true); }}
                onFocus={() => { if (hasActiveQuery) setShowPanel(true); }}
                placeholder="Search by name (e.g. Hurricane Katrina), state, or DR number..."
                className="w-full pl-10 pr-9 py-3 text-sm bg-white border border-[#E6E7E8] rounded-md text-[#003A63] placeholder-[#89684F]/60 focus:outline-none focus:ring-1 focus:ring-[#00A79D] focus:border-[#00A79D] shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
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
              <option value="">All states</option>
              {allStates.map(s => (
                <option key={s} value={s}>{getStateName(s)}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-[#E6E7E8] rounded-md shadow-sm cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={tribalOnly}
                onChange={e => { setTribalOnly(e.target.checked); setShowPanel(true); }}
                className="w-4 h-4 accent-[#00A79D]"
              />
              <span className="text-[#003A63] font-medium">Tribal areas only</span>
            </label>
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
                          onClick={() => selectEvent(d)}
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
                              {isTribal(d.tribal_request) && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#89684F]/[0.12] text-[#89684F]">
                                  Tribal
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#89684F] mt-0.5">
                              {getStateName(d.state)} · {formatDate(d.incident_start)} · DR-{d.incident_number}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-sm font-bold text-[#00A79D] tabular-nums">
                              {formatCurrency(totalFederal(d))}
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

      {/* Fact Sheet Display */}
      {selectedEvent ? (
        <FactSheetDisplay
          event={selectedEvent}
          allEvents={data}
          selectedEvents={[selectedEvent]}
          stateNames={stateNames}
          useSBAData={useSBAData}
        />
      ) : (
        <section className="bg-white border border-dashed border-[#E6E7E8] rounded-lg py-16 text-center">
          <p className="text-sm text-[#89684F]">
            Search for a disaster above to generate its fact sheet.
          </p>
        </section>
      )}
    </div>
  );
};

export default FactSheetCreator;
