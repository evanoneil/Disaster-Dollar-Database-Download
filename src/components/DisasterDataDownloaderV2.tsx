"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Download, ChevronDown, ChevronUp, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import TimeSeriesBrush from './TimeSeriesBrush';
import DisasterMap from './DisasterMap';

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
}

interface DisasterDataDownloaderV2Props {
  useSBAData?: boolean;
}

const DisasterDataDownloaderV2: React.FC<DisasterDataDownloaderV2Props> = ({ useSBAData = false }) => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startYear: 2015,
    startMonth: 1,
    endYear: 2025,
    endMonth: 10,
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>([]);
  const [selectedFundingTypes, setSelectedFundingTypes] = useState<string[]>(
    useSBAData ? ['ihp', 'pa', 'cdbg_dr_allocation', 'sba'] : ['ihp', 'pa', 'cdbg_dr_allocation']
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string>('incident_start');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const stateNames: Record<string, string> = {
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
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };

  const territories = ['PR', 'GU', 'VI', 'MP', 'AS', 'FM', 'MH', 'PW'];
  const [includesTerritories, setIncludesTerritories] = useState(false);
  const [tribalOnly, setTribalOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStates.length > 0) count++;
    if (includesTerritories) count++;
    if (tribalOnly) count++;
    const allTypes = _.uniq(data.map(row => row.incident_type)).filter(Boolean).sort();
    if (selectedDisasterTypes.length > 0 && selectedDisasterTypes.length < allTypes.length) count++;
    const allFunding = useSBAData ? 4 : 3;
    if (selectedFundingTypes.length < allFunding) count++;
    return count;
  }, [selectedStates, includesTerritories, tribalOnly, selectedDisasterTypes, selectedFundingTypes, data, useSBAData]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const csvFile = useSBAData
          ? '/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv'
          : '/data/disaster_dollar_database_2025_06_02.csv';
        const response = await fetch(csvFile);
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            setData(results.data as DisasterData[]);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    loadData();
  }, [useSBAData]);

  useEffect(() => {
    if (!loading) {
      const uniqueDisasterTypes = _.uniq(data.map(row => row.incident_type)).filter(Boolean).sort();
      setSelectedDisasterTypes(uniqueDisasterTypes);
    }
  }, [loading, data]);

  const dataRangeInfo = useMemo(() => {
    if (loading || data.length === 0) return null;
    const dates = data
      .filter(item => item.incident_start)
      .map(item => new Date(item.incident_start))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length === 0) return null;
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { earliest: fmt(earliest), latest: fmt(latest), total: data.length };
  }, [data, loading]);

  const filteredData = useMemo(() => {
    if (loading) return [];
    return data.filter(row => {
      if (!row.incident_start) return false;
      const incidentDate = new Date(row.incident_start);
      const startDate = new Date(dateRange.startYear, dateRange.startMonth - 1, 1);
      const endDate = new Date(dateRange.endYear, dateRange.endMonth, 0);
      const dateMatch = incidentDate >= startDate && incidentDate <= endDate;

      let stateMatch = false;
      if (selectedStates.length === 0 && !includesTerritories) {
        stateMatch = true;
      } else if (selectedStates.length === 0 && includesTerritories) {
        stateMatch = territories.includes(row.state);
      } else {
        if (territories.includes(row.state)) {
          stateMatch = includesTerritories;
        } else {
          stateMatch = selectedStates.includes(row.state);
        }
      }

      const eventLower = (row.event || '').toLowerCase();
      const typeMatch =
        selectedDisasterTypes.length === 0 ||
        selectedDisasterTypes.some(t =>
          row.incident_type === t || eventLower.includes(t.toLowerCase())
        );

      let fundingMatch = true;
      if (selectedFundingTypes.length > 0) {
        fundingMatch = false;
        if (selectedFundingTypes.includes('ihp')) {
          const v = typeof row.ihp_total === 'number' ? row.ihp_total : (typeof row.ihp_total === 'string' ? parseFloat(row.ihp_total) || 0 : 0);
          if (v > 0) fundingMatch = true;
        }
        if (!fundingMatch && selectedFundingTypes.includes('pa')) {
          const v = typeof row.pa_total === 'number' ? row.pa_total : (typeof row.pa_total === 'string' ? parseFloat(row.pa_total) || 0 : 0);
          if (v > 0) fundingMatch = true;
        }
        if (!fundingMatch && selectedFundingTypes.includes('cdbg_dr_allocation')) {
          const v = typeof row.cdbg_dr_allocation === 'number' ? row.cdbg_dr_allocation : (typeof row.cdbg_dr_allocation === 'string' ? parseFloat(row.cdbg_dr_allocation) || 0 : 0);
          if (v > 0) fundingMatch = true;
        }
        if (!fundingMatch && selectedFundingTypes.includes('sba')) {
          const v = typeof row.sba_total_approved_loan_amount === 'number' ? row.sba_total_approved_loan_amount : (typeof row.sba_total_approved_loan_amount === 'string' ? parseFloat(row.sba_total_approved_loan_amount) || 0 : 0);
          if (v > 0) fundingMatch = true;
        }
      }

      const tribalMatch = !tribalOnly || (row as any).tribal_request === true || (row as any).tribal_request === 'TRUE';
      return dateMatch && stateMatch && typeMatch && fundingMatch && tribalMatch;
    });
  }, [dateRange, selectedStates, selectedDisasterTypes, selectedFundingTypes, data, loading, includesTerritories, territories, tribalOnly]);

  useEffect(() => { setCurrentPage(1); }, [dateRange, selectedStates, selectedDisasterTypes, selectedFundingTypes, tribalOnly]);

  const handleDownload = () => {
    if (filteredData.length === 0 || selectedFundingTypes.length === 0) {
      alert('No data to download. Please select at least one funding type and ensure data matches your filters.');
      return;
    }
    const processedData = filteredData.map(row => ({ ...row, state: stateNames[row.state] || row.state }));
    const csv = Papa.unparse(processedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'disaster_data_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => {
      let aValue: any, bValue: any;
      switch (sortColumn) {
        case 'incident_start': aValue = new Date(a.incident_start); bValue = new Date(b.incident_start); break;
        case 'state': aValue = stateNames[a.state] || a.state; bValue = stateNames[b.state] || b.state; break;
        case 'incident_type': aValue = a.incident_type; bValue = b.incident_type; break;
        case 'event': aValue = a.event; bValue = b.event; break;
        case 'incident_number': aValue = a.incident_number; bValue = b.incident_number; break;
        default: return 0;
      }
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortColumn, sortDirection, stateNames]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = sortedData.slice(startIndex, endIndex);

  // Computed funding totals
  const fundingTotals = useMemo(() => {
    const toNum = (v: any) => typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
    const ihp = filteredData.reduce((s, r) => s + (selectedFundingTypes.includes('ihp') ? toNum(r.ihp_total) : 0), 0);
    const pa = filteredData.reduce((s, r) => s + (selectedFundingTypes.includes('pa') ? toNum(r.pa_total) : 0), 0);
    const cdbg = filteredData.reduce((s, r) => s + (selectedFundingTypes.includes('cdbg_dr_allocation') ? toNum(r.cdbg_dr_allocation) : 0), 0);
    const sba = filteredData.reduce((s, r) => s + (selectedFundingTypes.includes('sba') ? toNum(r.sba_total_approved_loan_amount) : 0), 0);
    return { ihp, pa, cdbg, sba, total: ihp + pa + cdbg + sba };
  }, [filteredData, selectedFundingTypes]);

  const formatCurrency = (amount: number): string => {
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const formatCurrencyFull = (amount: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const formatNumber = (num: number): string => new Intl.NumberFormat('en-US').format(num);

  // Filter summary text
  const filterSummaryParts = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${months[dateRange.startMonth - 1]} ${dateRange.startYear} – ${months[dateRange.endMonth - 1]} ${dateRange.endYear}`);
    if (selectedStates.length > 0 && selectedStates.length <= 3) {
      parts.push(selectedStates.map(a => stateNames[a]).join(', '));
    } else if (selectedStates.length > 3) {
      parts.push(`${selectedStates.length} states`);
    }
    if (includesTerritories) parts.push('Territories');
    if (tribalOnly) parts.push('Tribal Areas');
    return parts;
  }, [dateRange, selectedStates, includesTerritories, tribalOnly, months, stateNames]);

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

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} className="opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pb-16">

      {/* ─── Hero / Header ─────────────────────────────────────────── */}
      <section className="pt-8 pb-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-end gap-4">
          {/* Quick stats ticker */}
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold">Matching</div>
              <div className="text-2xl font-black text-[#003A63] tabular-nums">{formatNumber(filteredData.length)}</div>
              <div className="text-[11px] text-[#89684F]">disasters</div>
            </div>
            <div className="w-px h-12 bg-[#E6E7E8]" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold">Total Funding</div>
              <div className="text-2xl font-black text-[#00A79D] tabular-nums">{formatCurrency(fundingTotals.total)}</div>
              <div className="text-[11px] text-[#89684F]">{formatCurrencyFull(fundingTotals.total)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Funding Cards ─────────────────────────────────────────── */}
      <section className="mb-8">
        <div className={`grid grid-cols-2 ${useSBAData ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
          {selectedFundingTypes.includes('ihp') && (
            <div className="relative overflow-hidden rounded-b-lg bg-white border border-[#E6E7E8] p-4 group hover:border-[#2171b5]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#2171b5]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">IHP</div>
              <div className="text-xl font-black text-[#2171b5] tabular-nums leading-tight">{formatCurrency(fundingTotals.ihp)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Individual &amp; Household Program</div>
            </div>
          )}
          {selectedFundingTypes.includes('pa') && (
            <div className="relative overflow-hidden rounded-b-lg bg-white border border-[#E6E7E8] p-4 group hover:border-[#41B6E6]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#41B6E6]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">PA</div>
              <div className="text-xl font-black text-[#41B6E6] tabular-nums leading-tight">{formatCurrency(fundingTotals.pa)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Public Assistance</div>
            </div>
          )}
          {selectedFundingTypes.includes('cdbg_dr_allocation') && (
            <div className="relative overflow-hidden rounded-b-lg bg-white border border-[#E6E7E8] p-4 group hover:border-[#89684F]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#89684F]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">CDBG-DR</div>
              <div className="text-xl font-black text-[#89684F] tabular-nums leading-tight">{formatCurrency(fundingTotals.cdbg)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Community Development Block Grant</div>
            </div>
          )}
          {selectedFundingTypes.includes('sba') && useSBAData && (
            <div className="relative overflow-hidden rounded-b-lg bg-white border border-[#E6E7E8] p-4 group hover:border-[#228B22]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#228B22]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">SBA</div>
              <div className="text-xl font-black text-[#228B22] tabular-nums leading-tight">{formatCurrency(fundingTotals.sba)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Small Business Administration Loans</div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Filter Bar ────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white border border-[#E6E7E8] rounded-lg overflow-hidden">
          {/* Filter toggle bar */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#003A63]/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={16} className="text-[#003A63]" />
              <span className="text-sm font-semibold text-[#003A63]">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#00A79D] text-white rounded-full leading-none">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Inline filter summary pills */}
              <div className="hidden md:flex items-center gap-2">
                {filterSummaryParts.map((part, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#003A63]/[0.05] text-[#003A63] text-[11px] font-medium rounded">
                    {part}
                  </span>
                ))}
              </div>
              <ChevronDown
                size={16}
                className={`text-[#89684F] transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {/* Expanded filters */}
          {filtersOpen && (
            <div className="border-t border-[#E6E7E8]">
              {/* Date selection */}
              <div className="px-5 pt-4 pb-2">
                <TimeSeriesBrush
                  data={data}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  showDateSelection={true}
                  showChart={false}
                />
              </div>

              {/* Three-column filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:divide-x divide-[#E6E7E8] border-t border-[#E6E7E8]">
                {/* Location */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-[#003A63]">Location</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSelectedStates(Object.keys(stateNames)); setIncludesTerritories(true); }}
                        className="text-[10px] font-semibold text-[#00A79D] hover:underline"
                      >All</button>
                      <button
                        onClick={() => { setSelectedStates([]); setIncludesTerritories(false); setTribalOnly(false); }}
                        className="text-[10px] font-semibold text-[#89684F] hover:underline"
                      >None</button>
                    </div>
                  </div>
                  <div className="h-[280px] overflow-y-auto scrollbar-custom pr-1">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {Object.entries(stateNames).map(([abbr, name]) => (
                        <label key={abbr} className="flex items-center gap-1.5 py-0.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedStates.includes(abbr)}
                            onChange={(e) => setSelectedStates(e.target.checked ? [...selectedStates, abbr] : selectedStates.filter(s => s !== abbr))}
                            className="w-3.5 h-3.5 rounded-sm border-gray-300 text-[#003A63] focus:ring-[#003A63] focus:ring-offset-0"
                          />
                          <span className="text-xs text-[#003A63] group-hover:text-[#003A63] transition-colors">{name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#E6E7E8] flex flex-col gap-1">
                      <label className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input type="checkbox" checked={includesTerritories} onChange={(e) => setIncludesTerritories(e.target.checked)}
                          className="w-3.5 h-3.5 rounded-sm border-gray-300 text-[#003A63] focus:ring-[#003A63]" />
                        <span className="text-xs font-semibold text-[#003A63]">U.S. Territories</span>
                      </label>
                      <label className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input type="checkbox" checked={tribalOnly} onChange={(e) => setTribalOnly(e.target.checked)}
                          className="w-3.5 h-3.5 rounded-sm border-gray-300 text-[#003A63] focus:ring-[#003A63]" />
                        <span className="text-xs font-semibold text-[#003A63]">Tribal Areas</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Disaster Type */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-[#003A63]">Disaster Type</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedDisasterTypes(_.uniq(data.map(r => r.incident_type)).filter(Boolean).sort())}
                        className="text-[10px] font-semibold text-[#00A79D] hover:underline"
                      >All</button>
                      <button
                        onClick={() => setSelectedDisasterTypes([])}
                        className="text-[10px] font-semibold text-[#89684F] hover:underline"
                      >None</button>
                    </div>
                  </div>
                  <div className="h-[280px] overflow-y-auto scrollbar-custom pr-1">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {_.uniq(data.map(r => r.incident_type)).filter(Boolean).sort().map(type => (
                        <label key={type} className="flex items-center gap-1.5 py-0.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedDisasterTypes.includes(type)}
                            onChange={(e) => setSelectedDisasterTypes(e.target.checked ? [...selectedDisasterTypes, type] : selectedDisasterTypes.filter(t => t !== type))}
                            className="w-3.5 h-3.5 rounded-sm border-gray-300 text-[#003A63] focus:ring-[#003A63]"
                          />
                          <span className="text-xs text-[#003A63] group-hover:text-[#003A63] transition-colors">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Funding Type */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-[#003A63]">Funding Program</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedFundingTypes(useSBAData ? ['ihp', 'pa', 'cdbg_dr_allocation', 'sba'] : ['ihp', 'pa', 'cdbg_dr_allocation'])}
                        className="text-[10px] font-semibold text-[#00A79D] hover:underline"
                      >All</button>
                      <button
                        onClick={() => setSelectedFundingTypes([])}
                        className="text-[10px] font-semibold text-[#89684F] hover:underline"
                      >None</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[
                      { key: 'ihp', label: 'FEMA IHP', desc: 'Individual & Household Program', color: '#2171b5' },
                      { key: 'pa', label: 'FEMA PA', desc: 'Public Assistance', color: '#41B6E6' },
                      { key: 'cdbg_dr_allocation', label: 'HUD CDBG-DR', desc: 'Community Development Block Grant', color: '#89684F' },
                      ...(useSBAData ? [{ key: 'sba', label: 'SBA Loans', desc: 'Disaster Loan Program', color: '#228B22' }] : [])
                    ].map(({ key, label, desc, color }) => (
                      <label
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                          selectedFundingTypes.includes(key)
                            ? 'border-current bg-opacity-5'
                            : 'border-[#E6E7E8] hover:border-gray-300'
                        }`}
                        style={selectedFundingTypes.includes(key) ? { borderColor: color, backgroundColor: `${color}08` } : {}}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFundingTypes.includes(key)}
                          onChange={(e) => setSelectedFundingTypes(e.target.checked ? [...selectedFundingTypes, key] : selectedFundingTypes.filter(t => t !== key))}
                          className="w-3.5 h-3.5 rounded-sm border-gray-300 mt-0.5"
                          style={{ accentColor: color }}
                        />
                        <div>
                          <div className="text-xs font-bold" style={{ color }}>{label}</div>
                          <div className="text-[11px] text-[#003A63]">{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Funding Distribution ──────────────────────────────────── */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-[#003A63]">Funding Distribution</h2>
        </div>

        {/* Current Filters Applied */}
        <div className="bg-white border border-[#E6E7E8] rounded-lg p-4 mb-4">
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-[#003A63] mb-3">Current Filters Applied</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[#89684F] mb-1">Date Range</div>
              <div className="text-xs text-[#003A63] font-medium">
                {months[dateRange.startMonth - 1]} {dateRange.startYear} – {months[dateRange.endMonth - 1]} {dateRange.endYear}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[#89684F] mb-1">Locations</div>
              <div className="text-xs text-[#003A63] font-medium">
                {selectedStates.length === 0 && !includesTerritories && !tribalOnly
                  ? 'All locations'
                  : [
                      selectedStates.length > 0
                        ? selectedStates.length <= 3
                          ? selectedStates.map(a => stateNames[a]).join(', ')
                          : `${selectedStates.length} states`
                        : null,
                      includesTerritories ? 'Territories' : null,
                      tribalOnly ? 'Tribal Areas' : null,
                    ].filter(Boolean).join(', ') || 'All locations'
                }
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[#89684F] mb-1">Disaster Types</div>
              <div className="text-xs text-[#003A63] font-medium">
                {(() => {
                  const allTypes = _.uniq(data.map(r => r.incident_type)).filter(Boolean).sort();
                  if (selectedDisasterTypes.length === allTypes.length) return 'All types';
                  if (selectedDisasterTypes.length === 0) return 'None selected';
                  if (selectedDisasterTypes.length <= 2) return selectedDisasterTypes.join(', ');
                  return `${selectedDisasterTypes.length} of ${allTypes.length} types`;
                })()}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[#89684F] mb-1">Funding Types</div>
              <div className="text-xs text-[#003A63] font-medium">
                {selectedFundingTypes.length === 0
                  ? 'None selected'
                  : selectedFundingTypes.map(t => {
                      if (t === 'ihp') return 'IHP';
                      if (t === 'pa') return 'PA';
                      if (t === 'cdbg_dr_allocation') return 'CDBG-DR';
                      if (t === 'sba') return 'SBA';
                      return t;
                    }).join(', ')
                }
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white border border-[#E6E7E8] rounded-lg overflow-hidden mb-4">
          <TimeSeriesBrush
            data={filteredData}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showDateSelection={false}
            showChart={true}
            title=""
            selectedFundingTypes={selectedFundingTypes}
          />
        </div>

        {/* Map */}
        <div className="bg-white border border-[#E6E7E8] rounded-lg overflow-hidden">
          <DisasterMap
            filteredData={filteredData}
            stateNames={stateNames}
            selectedFundingTypes={selectedFundingTypes}
          />
        </div>
      </section>

      {/* ─── Data Table ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-[#003A63]">Records</h2>
            <span className="text-xs text-[#89684F] tabular-nums">
              {formatNumber(sortedData.length)} matching
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="text-xs border border-[#E6E7E8] rounded-md px-2 py-1.5 text-[#003A63] focus:outline-none focus:ring-1 focus:ring-[#00A79D]"
            >
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#003A63] text-white text-xs font-semibold rounded-md hover:bg-[#002a4a] transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E6E7E8] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E7E8]">
                  {[
                    { key: 'incident_start', label: 'Date' },
                    { key: 'state', label: 'State' },
                    { key: 'incident_type', label: 'Type' },
                    { key: 'event', label: 'Event' },
                    { key: 'incident_number', label: '#' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em] font-bold text-[#003A63] cursor-pointer hover:text-[#003A63] select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        {label}
                        <SortIcon column={key} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E7E8]/60">
                {currentData.map((row, index) => (
                  <tr key={index} className="hover:bg-[#003A63]/[0.015] transition-colors">
                    <td className="px-4 py-2.5 text-xs text-[#003A63] tabular-nums whitespace-nowrap">
                      {new Date(row.incident_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#003A63] font-medium">
                      {stateNames[row.state] || row.state}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#003A63]/[0.06] text-[#003A63]">
                        {row.incident_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#003A63] max-w-xs truncate">
                      {row.event}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#89684F] tabular-nums">
                      {row.incident_number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E6E7E8] bg-[#003A63]/[0.015]">
            <span className="text-[11px] text-[#89684F] tabular-nums">
              {startIndex + 1}–{Math.min(endIndex, sortedData.length)} of {formatNumber(sortedData.length)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[#003A63] hover:bg-[#003A63]/[0.06]"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[#003A63] hover:bg-[#003A63]/[0.06]"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-[11px] font-bold text-[#003A63] tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[#003A63] hover:bg-[#003A63]/[0.06]"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[#003A63] hover:bg-[#003A63]/[0.06]"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DisasterDataDownloaderV2;